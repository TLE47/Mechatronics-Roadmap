import { useEffect, useRef, useState } from 'react';
import { MobilePythonKeyboard } from './MobilePythonKeyboard';
import { useMediaQuery } from '../useMediaQuery';
import {
  FIELD_KEYBOARD_OPEN_EVENT,
  backspaceField,
  dedentField,
  deleteFieldLine,
  duplicateFieldLine,
  indentField,
  insertFieldText,
  keyboardFieldFrom,
  newlineField,
  redoField,
  undoField,
  type TextField,
} from '../keyboard/fieldTarget';

/**
 * The site's phone keyboard for every text field outside the Python editor
 * (`components/PhoneFieldKeyboard.tsx`).
 *
 * The editor's keys live inside the editor because a key there means a CodeMirror command. Every
 * other field on the site — the lesson search, a note, a name in a sheet, a calculator expression —
 * was still handing the phone its OS keyboard, which covered the page and knew nothing of Python.
 * This host gives those fields the same keys, in the same shell, with the same slide: one keyboard
 * for the site, not a second layout.
 *
 * **Focus is the switch, and the tap beats the OS.** A text field is suppressed at `pointerdown`
 * (before the browser focuses it) with `inputmode="none"`, the only reliable moment to stop iOS and
 * Android raising their own keyboard; the same field's original attribute is restored when the
 * keyboard folds. The focus that follows slides the shell up. Moving between two fields retargets
 * without folding, so the keys stay put; Done restores the attribute and blurs; tapping the prose
 * folds. The shell is mounted after its first use and then kept, so the page, Fn state and lighting
 * survive between fields, and a build that never opens a page field never draws a second keyboard
 * (which would duplicate the editor's test hooks).
 *
 * **Native** is the one-off escape hatch: it gives the field back to the OS keyboard for as long as
 * the learner stays there, without touching the caret. A later focus on another field returns to
 * the site keys.
 *
 * The component is mounted once at the app root (`main.tsx`), so it covers the whole-page branches
 * and sheets portalled to `<body>` alike. The editor's keyboard stands down on
 * `FIELD_KEYBOARD_OPEN_EVENT`, so the two shells never share the bottom edge.
 */
export function PhoneFieldKeyboard() {
  const phone = useMediaQuery('(max-width: 767px)');
  const [target, setTarget] = useState<TextField | null>(null);
  const [height, setHeight] = useState(0);
  // The keys are not drawn until a field first asks for them: two mounted keyboards would give every
  // `python-key-*` hook two matches, and the editor's own gate (and any script) expects one.
  const [everOpened, setEverOpened] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<TextField | null>(null);
  const nativeRef = useRef<TextField | null>(null);
  // The attribute each field had before this keyboard suppressed it, so it can be handed back.
  const originalsRef = useRef(new Map<TextField, string | null>());
  const open = target !== null;

  // The pane reserves the height it measures; here the number also lifts the fixed Study bar and
  // lets `index.css` keep it on the keys. Measured from the mounted shell, so a closed keyboard still
  // knows the room it will take before it slides.
  useEffect(() => {
    const shell = shellRef.current;
    if (!phone || !shell) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(shell.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [phone, everOpened]);

  useEffect(() => {
    if (!phone || !open || height === 0) {
      document.body.style.removeProperty('--mobile-keyboard-height');
      return;
    }
    document.body.style.setProperty('--mobile-keyboard-height', `${height}px`);
    return () => {
      document.body.style.removeProperty('--mobile-keyboard-height');
    };
  }, [phone, open, height]);

  useEffect(() => {
    if (!phone || typeof document === 'undefined') return;
    const originals = originalsRef.current;

    const suppress = (field: TextField) => {
      // A field the learner handed to the OS keyboard keeps it until they move to another field.
      if (field.dataset.fieldKeyboardNative === '1') return;
      if (!originals.has(field)) originals.set(field, field.getAttribute('inputmode'));
      field.setAttribute('inputmode', 'none');
    };

    const restore = (field: TextField) => {
      if (!originals.has(field)) return;
      const original = originals.get(field) ?? null;
      if (original === null) field.removeAttribute('inputmode');
      else field.setAttribute('inputmode', original);
      originals.delete(field);
    };

    const close = () => {
      const current = targetRef.current;
      if (current) restore(current);
      targetRef.current = null;
      setTarget(null);
    };

    const show = (field: TextField) => {
      if (field.dataset.fieldKeyboardNative === '1') return;
      const previous = targetRef.current;
      if (previous && previous !== field) restore(previous);
      suppress(field);
      targetRef.current = field;
      setTarget(field);
      setEverOpened(true);
      window.dispatchEvent(new Event(FIELD_KEYBOARD_OPEN_EVENT));
    };

    // The attribute has to be in place before the browser focuses the field, or the OS keyboard has
    // already begun to rise and no later change can stop it on iOS.
    const onPointerDown = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const field = keyboardFieldFrom(event.target);
      if (field) suppress(field);
    };

    const onFocusIn = (event: FocusEvent) => {
      const field = keyboardFieldFrom(event.target);
      if (!field) return;
      // A different field is a new decision: the OS keyboard handoff does not follow the learner.
      const native = nativeRef.current;
      if (native && native !== field) {
        delete native.dataset.fieldKeyboardNative;
        nativeRef.current = null;
      }
      show(field);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (!targetRef.current) return;
      const related = event.relatedTarget;
      if (related instanceof Element) {
        // A press on one of the keys never takes focus (the key cancels its pointerdown), but a
        // browser or a helper that moves focus there must not fold the keyboard under the finger.
        if (related.closest('[data-testid="phone-field-keyboard"]')) return;
        // Another text field keeps the keys up; its focusin retargets them without a slide.
        if (keyboardFieldFrom(related)) return;
      }
      close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      // A rotation or an unmount must not leave a field with the OS keyboard suppressed.
      for (const field of [...originals.keys()]) restore(field);
      const native = nativeRef.current;
      if (native) delete native.dataset.fieldKeyboardNative;
      nativeRef.current = null;
      targetRef.current = null;
      setTarget(null);
    };
  }, [phone]);

  // The first frame of a first open has no measured height yet; once it does, the field is
  // scrolled clear of the keys exactly as a phone would. A field already clear is left alone.
  useEffect(() => {
    if (!open || height === 0) return;
    const current = targetRef.current;
    if (!current) return;
    const rect = current.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight - height - 12 && rect.top >= 0) return;
    current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, [open, height]);

  const field = () => targetRef.current;

  const done = () => {
    const current = field();
    const close = () => {
      if (current) {
        const original = originalsRef.current.get(current);
        if (original === undefined || original === null) current.removeAttribute('inputmode');
        else current.setAttribute('inputmode', original);
        originalsRef.current.delete(current);
      }
      targetRef.current = null;
      setTarget(null);
    };
    close();
    // Done is the phone's "put it away": the field gives up the caret so the keys can leave.
    current?.blur();
  };

  const useNative = () => {
    const current = field();
    if (!current) return;
    setTarget(null);
    targetRef.current = null;
    // Hand the attribute back, then let the OS keyboard rise in this same press's gesture. The
    // field keeps the flag while it has the caret; another field's focus clears it.
    const original = originalsRef.current.get(current);
    if (original === undefined || original === null) current.removeAttribute('inputmode');
    else current.setAttribute('inputmode', original);
    originalsRef.current.delete(current);
    current.dataset.fieldKeyboardNative = '1';
    nativeRef.current = current;
    current.blur();
    current.focus({ preventScroll: true });
  };

  if (!phone) return null;

  return (
    <div
      ref={shellRef}
      data-testid="phone-field-keyboard"
      data-state={open ? 'open' : 'closed'}
      data-mobile-keyboard={open && height > 0 ? '1' : undefined}
      aria-hidden={!open}
      className="mobile-keyboard-shell fixed inset-x-0 bottom-0 z-[90]"
    >
      {everOpened && (
        <MobilePythonKeyboard
          mode="code"
          onInsertText={(text) => {
            const current = field();
            if (current) insertFieldText(current, text);
          }}
          onBackspace={() => {
            const current = field();
            if (current) backspaceField(current);
          }}
          onIndent={() => {
            const current = field();
            if (current) indentField(current);
          }}
          onDedent={() => {
            const current = field();
            if (current) dedentField(current);
          }}
          onNewLine={() => {
            const current = field();
            if (!current) return;
            // A one-line field has no line to break: the return key puts the keyboard away.
            if (!newlineField(current)) done();
          }}
          onTab={() => {
            const current = field();
            if (current) insertFieldText(current, '  ');
          }}
          onUndo={() => {
            const current = field();
            if (current) undoField(current);
          }}
          onRedo={() => {
            const current = field();
            if (current) redoField(current);
          }}
          onDuplicate={() => {
            const current = field();
            if (current) duplicateFieldLine(current);
          }}
          onDelete={() => {
            const current = field();
            if (current) deleteFieldLine(current);
          }}
          onNativeKeyboard={useNative}
          onDone={done}
        />
      )}
    </div>
  );
}
