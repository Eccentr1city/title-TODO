"use client";

import { useEffect } from "react";

// In the iOS home-screen app the on-screen keyboard does not shrink the layout
// viewport, and iOS will not scroll a pinned layout to reveal the focused
// field. The shell is pinned to the screen (see .app-shell); this lifts its
// bottom edge by the keyboard height, measured as the difference between the
// layout and visual viewports. Installed apps also don't reliably fire
// visualViewport events when the keyboard opens, so while a field is focused
// the measurement is polled instead of trusting the events.
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let poll: number | null = null;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const isEditable = (el: Element | null) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    const startPolling = () => { if (poll === null) poll = window.setInterval(update, 120); };
    const stopPolling = () => { if (poll !== null) { clearInterval(poll); poll = null; } };
    const onFocusIn = (e: FocusEvent) => { if (isEditable(e.target as Element)) startPolling(); };
    const onFocusOut = () => {
      window.setTimeout(() => {
        if (isEditable(document.activeElement)) return;
        stopPolling();
        update();
        window.setTimeout(update, 350); // keyboard dismissal animation
      }, 50);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      stopPolling();
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
}
