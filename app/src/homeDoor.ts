/**
 * The one tab Home introduces above its labs grid (`app/src/homeDoor.ts`).
 *
 * The labs grid is built from `WORKBENCH_TABS`; a featured card needs more than a rail row, so its
 * copy, action and test id live here, beside the shape that types them. The registry entry points
 * at this descriptor and the browser suite reads the same object, so a drift is a test failure
 * rather than a second hand-written card.
 */

export interface HomeDoor {
  title: string;
  blurb: string;
  action: string;
  /** The section's test id; its button is `${testId}-open`. */
  testId: string;
}

export const STUDIO_HOME_DOOR: HomeDoor = {
  title: 'Free study',
  blurb:
    'A scratch Python editor, a workflow canvas and a notebook. No lesson, no grading — saved on this device.',
  action: 'Open the studio',
  testId: 'home-studio',
};

export const MICRO_HOME_DOOR: HomeDoor = {
  title: 'Micro-learning (beta)',
  blurb:
    'Forty-six concepts across the P track, one at a time, each about two minutes. Two diagnostics choose the practice; a review is scheduled tomorrow.',
  action: 'Open micro-learning',
  testId: 'home-micro-door',
};
