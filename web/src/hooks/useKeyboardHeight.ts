import { useState, useEffect } from "react";

/**
 * useKeyboardHeight — tracks virtual keyboard height on mobile via visualViewport API.
 *
 * With android:windowSoftInputMode="adjustNothing":
 * - window.innerHeight stays constant (the WebView is NOT resized)
 * - visualViewport.height shrinks when keyboard opens
 * - keyboard height = window.innerHeight - visualViewport.height
 *
 * The chat container uses this to add bottom padding so the input stays above the keyboard.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onViewportChange() {
      const vv = window.visualViewport!;
      // With adjustNothing, innerHeight is stable. Keyboard = difference.
      const kbH = Math.round(window.innerHeight - vv.height - vv.offsetTop);
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
