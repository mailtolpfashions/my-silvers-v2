/**
 * Finding, showing and reaching the field that is blocking a submit.
 *
 * ── Why not just leave it to the browser ────────────────────────────────────
 * Native constraint validation already refuses the submit and shows a bubble.
 * What it does badly is the part that matters on a long form: the bubble is
 * placed by the browser, vanishes on the next click, is unstyled, and on a
 * phone can sit under the keyboard. A shopper who has scrolled to the pay
 * button sees the page refuse and — if the offending field is above the fold
 * they are on — no reason why.
 *
 * So the checks stay the browser's (there is no second copy of the rules here,
 * which is the whole point), and only the REPORTING is taken over: scroll the
 * first offender into the middle of the screen, focus it, and hand back the
 * full set so the caller can mark them red.
 *
 * The form must carry `noValidate` for this to be used, or the browser will
 * show its own bubble on top of it.
 */

/** Fields a form can be blocked on. `fieldset`/`output` are also form-associated but never invalid. */
type ValidatableField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const FIELD_SELECTOR = "input, select, textarea";

/**
 * Scrolls to and focuses the first field the browser rejects.
 *
 * Returns the `id`s of every invalid field, in document order — the caller uses
 * them to set `aria-invalid`, which is what actually turns the borders red
 * (ui/input.tsx already styles that state; nothing new is needed for it).
 *
 * An empty array means the form is good to submit.
 */
export function focusFirstInvalid(form: HTMLFormElement): string[] {
  const invalid = Array.from(form.querySelectorAll<ValidatableField>(FIELD_SELECTOR)).filter(
    // Disabled and hidden fields are exempt from constraint validation already,
    // so checkValidity() returning true for them is correct rather than lucky.
    (element) => !element.checkValidity()
  );

  const firstInvalid = invalid[0];
  if (firstInvalid) {
    // `center` rather than the default `start`: a field scrolled to the very
    // top of the viewport sits under the sticky header on this site, which is
    // the failure mode this function exists to prevent.
    firstInvalid.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
    // preventScroll, because focus() would otherwise jump instantly to its own
    // idea of the right position and fight the smooth scroll above.
    firstInvalid.focus({ preventScroll: true });
  }

  return invalid.map((element) => element.id).filter(Boolean);
}

/**
 * The same answer, without touching focus or scroll.
 *
 * focusFirstInvalid MOVES THE PAGE, which is right when a shopper has pressed
 * a button and wrong on every keystroke afterwards. This is for re-asking the
 * question as they type: which fields is the form still blocked on?
 *
 * Same source of truth — the browser's own constraint validation — so a field
 * cannot be counted here and passed there.
 */
export function listInvalid(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<ValidatableField>(FIELD_SELECTOR))
    .filter((element) => !element.checkValidity())
    .map((element) => element.id)
    .filter(Boolean);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
