/**
 * A pair session, in the browser (`app/src/usePairSession.ts`).
 *
 * The format lives in [`pairing.ts`](pairing.ts); this is the transport: one `RTCPeerConnection`, one
 * data channel, and the manual signalling the format describes. Three rules shape it.
 *
 * 1. **No ICE servers.** Two workbenches on the same network — or two tabs on one machine — find each
 *    other from their own host candidates, and this app does not ship with a STUN address that would
 *    tell a third party who is talking to whom. A session across the open internet without one may
 *    fail, and the sheet says "could not connect" rather than promising a connection it cannot make.
 * 2. **Gathering is bounded.** The invitation is built after ICE completes or 3 s, whichever is
 *    first: an invitation that waits forever is a button that never answers, and a candidate list that
 *    arrives late is not needed for two browsers that can already reach each other.
 * 3. **Every failure is a sentence.** A bad paste, a failed negotiation, a channel that closes: the
 *    session goes to `error` or `closed` with the reason, and the sheet's status line prints it.
 *
 * Nothing here writes to the learner's editor. Messages are handed to the caller, which offers an
 * attempt rather than applying it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  attemptMessage,
  byeMessage,
  collabOpsMessage,
  collabStartMessage,
  collabStopMessage,
  decodeSignal,
  encodeSignal,
  handleFrom,
  helloMessage,
  lessonMessage,
  parseMessage,
  type CollabStopReason,
  type PairMessage,
} from './pairing.ts';
import { COLLAB_MAX_TEXT, chunkOps, type CollabOp } from './collab.ts';

export type PairState = 'idle' | 'offering' | 'joining' | 'connected' | 'closed' | 'error';

export interface PairSession {
  state: PairState;
  /** The handle this tab plays. */
  you: string;
  /**
   * Which end of the pair this tab is: the one that made the invitation, or the one that answered it.
   * Co-editing is started by the host, and both sides need to agree on the two id slots a document's
   * characters are minted from, so this is part of the session rather than a guess.
   */
  role: 'host' | 'guest' | null;
  /** The host's text, once it exists. */
  invitation: string;
  /** The guest's answer to an invitation. */
  reply: string;
  /** The other person's handle, once they have said hello. */
  peer: string | null;
  /** The lesson the other person is on, as they last announced it. */
  peerLesson: string | null;
  /** Why the session failed or ended, when it did. */
  error: string | null;
  start: () => void;
  join: (invitation: string) => void;
  accept: (reply: string) => void;
  sendAttempt: (lesson: string, code: string) => 'sent' | 'too-long' | 'offline';
  /** Offer this lesson and this text as the document both of you will edit. */
  sendCollabStart: (lesson: string, text: string) => 'sent' | 'too-long' | 'offline';
  /** One edit, as ops: a paste is split into as many messages as it needs, in order. */
  sendCollabOps: (lesson: string, ops: CollabOp[]) => 'sent' | 'offline';
  /** Co-editing is over, and the other side should stop holding a document that no longer moves. */
  sendCollabStop: (lesson: string, reason: CollabStopReason) => void;
  announceLesson: (lesson: string) => void;
  leave: () => void;
}

/** How long the invitation waits for its own candidates before it is offered anyway. */
const GATHER_TIMEOUT_MS = 3000;

export function usePairSession(
  onMessage: (message: PairMessage) => void,
  initialHandle?: string
): PairSession {
  const [state, setState] = useState<PairState>('idle');
  const [invitation, setInvitation] = useState('');
  const [reply, setReply] = useState('');
  const [peer, setPeer] = useState<string | null>(null);
  const [peerLesson, setPeerLesson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [you] = useState<string>(() => initialHandle ?? handleFrom());
  const [role, setRole] = useState<'host' | 'guest' | null>(null);
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const listenerRef = useRef(onMessage);
  listenerRef.current = onMessage;
  const handleRef = useRef(you);
  handleRef.current = you;

  /** Every way a channel or a connection can end, said once and with the connection dropped. */
  const fail = (reason: string) => {
    setError(reason);
    setState('error');
    channelRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
  };

  const attachChannel = (channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.onopen = () => {
      setState('connected');
      setError(null);
      // Everyone says hello with their handle and their lesson, so a session that just opened can
      // say who is on the other end before either person types.
      channel.send(JSON.stringify(helloMessage(handleRef.current, 'unannounced')));
    };
    channel.onclose = () => {
      if (stateRef.current === 'error' || stateRef.current === 'closed') return;
      setState('closed');
      setPeer(null);
    };
    channel.onmessage = (event) => {
      const message = parseMessage(event.data);
      if (!message) return;
      if (message.kind === 'hello') {
        setPeer(message.from);
        setPeerLesson(message.lesson === 'unannounced' ? null : message.lesson);
        // Answer their hello with ours, so both sides have a name and a lesson.
        if (channel.readyState === 'open') {
          channel.send(JSON.stringify(helloMessage(handleRef.current, lessonRef.current)));
        }
      }
      if (message.kind === 'lesson') setPeerLesson(message.lesson);
      if (message.kind === 'bye') {
        setState('closed');
        setPeer(null);
      }
      listenerRef.current(message);
    };
  };

  // The channel handler closes over state; the latest state is read through a ref rather than a
  // dependency list, so a reconnect does not re-attach handlers on every render.
  const stateRef = useRef<PairState>('idle');
  stateRef.current = state;
  const lessonRef = useRef<string>('unannounced');

  const gather = (connection: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (connection.iceGatheringState === 'complete') return resolve();
      const done = () => resolve();
      const timer = setTimeout(done, GATHER_TIMEOUT_MS);
      connection.onicecandidate = (event) => {
        if (event.candidate) return;
        clearTimeout(timer);
        done();
      };
      connection.addEventListener('icegatheringstatechange', () => {
        if (connection.iceGatheringState === 'complete') {
          clearTimeout(timer);
          done();
        }
      });
    });

  const start = () => {
    setError(null);
    setRole('host');
    setPeer(null);
    setPeerLesson(null);
    setReply('');
    connectionRef.current?.close();
    const connection = new RTCPeerConnection({ iceServers: [] });
    connectionRef.current = connection;
    const channel = connection.createDataChannel('pair', { ordered: true });
    attachChannel(channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') fail('The two workbenches could not reach each other.');
      if (connection.connectionState === 'disconnected') setState('closed');
    };
    setState('offering');
    void (async () => {
      try {
        const description = await connection.createOffer();
        await connection.setLocalDescription(description);
        await gather(connection);
        setInvitation(encodeSignal({ kind: 'offer', sdp: connection.localDescription?.sdp ?? '' }));
      } catch {
        fail('The invitation could not be built in this browser.');
      }
    })();
  };

  const join = (invitationText: string) => {
    const decoded = decodeSignal(invitationText, 'offer');
    if (!decoded.ok || !decoded.signal) {
      setError(decoded.reason ?? 'That invitation could not be read.');
      setState('error');
      return;
    }
    setError(null);
    setRole('guest');
    setPeer(null);
    setPeerLesson(null);
    connectionRef.current?.close();
    const connection = new RTCPeerConnection({ iceServers: [] });
    connectionRef.current = connection;
    connection.ondatachannel = (event) => attachChannel(event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') fail('The two workbenches could not reach each other.');
    };
    setState('joining');
    void (async () => {
      try {
        await connection.setRemoteDescription({ type: 'offer', sdp: decoded.signal!.sdp });
        const description = await connection.createAnswer();
        await connection.setLocalDescription(description);
        await gather(connection);
        setReply(encodeSignal({ kind: 'answer', sdp: connection.localDescription?.sdp ?? '' }));
      } catch {
        fail('That invitation could not be answered in this browser.');
      }
    })();
  };

  const accept = (replyText: string) => {
    const connection = connectionRef.current;
    if (!connection) {
      setError('There is no invitation to answer — start a session first.');
      setState('error');
      return;
    }
    const decoded = decodeSignal(replyText, 'answer');
    if (!decoded.ok || !decoded.signal) {
      setError(decoded.reason ?? 'That reply could not be read.');
      return;
    }
    setError(null);
    void connection
      .setRemoteDescription({ type: 'answer', sdp: decoded.signal.sdp })
      .catch(() => fail('That reply did not complete the connection.'));
  };

  const sendAttempt = (lesson: string, code: string): 'sent' | 'too-long' | 'offline' => {
    const channel = channelRef.current;
    const payload = JSON.stringify(attemptMessage(lesson, code));
    if (payload.length > 24000 + 1024) return 'too-long';
    if (!channel || channel.readyState !== 'open') return 'offline';
    channel.send(payload);
    return 'sent';
  };

  const sendCollabStart = (lesson: string, text: string): 'sent' | 'too-long' | 'offline' => {
    if (text.length > COLLAB_MAX_TEXT) return 'too-long';
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return 'offline';
    try {
      channel.send(JSON.stringify(collabStartMessage(lesson, text)));
    } catch {
      return 'offline';
    }
    return 'sent';
  };

  const sendCollabOps = (lesson: string, ops: CollabOp[]): 'sent' | 'offline' => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return 'offline';
    try {
      for (const chunk of chunkOps(ops)) {
        channel.send(JSON.stringify(collabOpsMessage(lesson, chunk)));
      }
    } catch {
      return 'offline';
    }
    return 'sent';
  };

  const sendCollabStop = (lesson: string, reason: CollabStopReason) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return;
    try {
      channel.send(JSON.stringify(collabStopMessage(lesson, reason)));
    } catch {
      // Closing anyway.
    }
  };

  const announceLesson = (lesson: string) => {
    lessonRef.current = lesson;
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return;
    channel.send(JSON.stringify(lessonMessage(lesson)));
  };

  const leave = () => {
    const channel = channelRef.current;
    if (channel?.readyState === 'open') {
      try {
        channel.send(JSON.stringify(byeMessage()));
      } catch {
        // Closing anyway.
      }
    }
    channelRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    setState('closed');
    setRole(null);
    setPeer(null);
    setPeerLesson(null);
    setInvitation('');
    setReply('');
  };

  // A tab that closes mid-session says goodbye rather than leaving the other side waiting.
  useEffect(
    () => () => {
      channelRef.current?.close();
      connectionRef.current?.close();
    },
    []
  );

  return {
    state,
    you,
    role,
    invitation,
    reply,
    peer,
    peerLesson,
    error,
    start,
    join,
    accept,
    sendAttempt,
    sendCollabStart,
    sendCollabOps,
    sendCollabStop,
    announceLesson,
    leave,
  };
}
