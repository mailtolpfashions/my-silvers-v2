"use client";

import { useEffect } from "react";

/**
 * Warns before leaving a form with unsaved edits.
 *
 * Both editors in this admin held everything in React state and wrote nothing
 * until you pressed Save, with no guard of any kind — clicking any nav link
 * mid-edit discarded the work silently, with no prompt and no way back. On the
 * product form that is potentially twenty fields.
 *
 * ── Two escapes, two mechanisms ─────────────────────────────────────────────
 * Closing the tab, reloading, or typing a new URL is `beforeunload`. The
 * browser owns that dialog and its wording; a page cannot choose the message,
 * and returning a string is the documented way to ask for it.
 *
 * Clicking a link inside the app never fires `beforeunload` at all — it is a
 * client-side transition, not a page load. The App Router exposes no
 * navigation-cancel hook, so this catches the click instead, in the CAPTURE
 * phase so it runs before the router's own handler.
 *
 * ── `confirm()`, knowingly ──────────────────────────────────────────────────
 * The in-app prompt is a native confirm rather than a styled modal. A modal
 * would look better and would cost a promise-based dialog plumbed through both
 * editors; the native one is synchronous, which is what lets the click be
 * cancelled at all. If this becomes a styled dialog later, the interception has
 * to move to a router-level guard — you cannot await a React modal inside an
 * event handler and still preventDefault.
 */
export function useUnsavedChanges(dirty: boolean, message = "You have unsaved changes.") {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy assignment: some browsers still require it to show the prompt.
      event.returnValue = "";
      return "";
    };

    const onClickCapture = (event: MouseEvent) => {
      // Anything the browser would not treat as a plain navigation is left
      // alone: modified clicks open a new tab, so this page is not leaving.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      // Downloads leave the page in place.
      if (anchor.hasAttribute("download")) return;

      // Same-document links only. An external host is a real page load, which
      // beforeunload above already covers — prompting twice is worse than once.
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      if (!window.confirm(`${message} Leave this page and discard them?`)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, message]);
}
