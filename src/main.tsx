import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import App from "./App";
import "./index.css";

// Polyfill: AbortSignal.timeout is not available in older WebView/Safari/JSCore
// Use Object.defineProperty to avoid silent failure when the property is non-writable
try {
  if (typeof AbortSignal.timeout !== "function") {
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      writable: true,
      value: (ms: number): AbortSignal => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("signal timed out", "TimeoutError")), ms);
        return controller.signal;
      },
    });
  }
} catch {
  // ignore if AbortSignal itself is unavailable in the current environment
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
