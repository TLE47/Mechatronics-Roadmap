/**
 * The viewport a phone has, as one media query (`app/src/phoneViewport.ts`).
 *
 * The workbench's phone arrangement used to be a width: below 768 px. A phone turned on its side is
 * 844 × 390 — wider than that — so every `md:` rule handed it the desktop shell, and the coding
 * keyboard was not drawn at all on the screen where the keys matter most. A phone is a screen with a
 * thumb for a pointer and little height, so the query asks for that as well as the narrow width. A
 * desktop window is unaffected: it reports a fine pointer however short it is, and a tablet in
 * landscape is taller than 500 px.
 *
 * `index.css` repeats this query in the rules that make the CSS shell agree with the React one (the
 * picker instead of the rail, the fixed Study bar, the one layout select); the two must change
 * together.
 */
export const PHONE_VIEWPORT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';
