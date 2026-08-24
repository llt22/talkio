import { useState, useEffect } from "react";

/**
 * useKeyboardHeight — tracks virtual keyboard height in CSS pixels.
 *
 * Two sources, in priority order:
 *
 * 1. Native bridge (`window.__talkioSetKeyboardInset`, pushed by MainActivity on
 *    Android 15+). Android 15 enforces edge-to-edge and ignores windowSoftInputMode,
 *    so neither the window nor `visualViewport` shrinks when the IME opens — the
 *    native IME inset is the only reliable signal there. It also tracks the IME
 *    candidate bar, whose height changes while typing Chinese/Japanese.
 * 2. `visualViewport` (iOS, browsers, Android below 15 that do not resize the window):
 *    the keyboard is the part of `innerHeight` the visual viewport no longer covers.
 *
 * The chat composer uses this to add bottom padding so the input stays above the keyboard.
 */

declare global {
  interface Window {
    __talkioSetKeyboardInset?: (px: number) => void;
  }
}

/** Latest native-reported inset; null until the native layer reports one. */
let nativeInset: number | null = null;
const subscribers = new Set<(value: number) => void>();

if (typeof window !== "undefined") {
  window.__talkioSetKeyboardInset = (px: number) => {
    const next = Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
    if (next === nativeInset) return;
    nativeInset = next;
    for (const notify of subscribers) notify(next);
  };
}

export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(nativeInset ?? 0);

  useEffect(() => {
    subscribers.add(setKeyboardHeight);
    return () => {
      subscribers.delete(setKeyboardHeight);
    };
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onViewportChange() {
      // The native bridge is authoritative once it has reported: on Android 15+
      // visualViewport does not move at all when the IME opens.
      if (nativeInset !== null) return;
      const viewport = window.visualViewport!;
      const kbH = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardHeight(kbH > 50 ? kbH : 0);
    }

    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);

    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return keyboardHeight;
}
