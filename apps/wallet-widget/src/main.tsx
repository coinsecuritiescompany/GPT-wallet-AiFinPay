import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// The host watches the widget frame for uncaught errors and unhandled promise
// rejections, and reports either as "Error loading app — Runtime error",
// replacing the whole widget with a Retry that cannot recover it. A single
// stray rejection anywhere therefore destroys a working wallet.
//
// Every call site handles its own failures; this is the net beneath them. It
// records what happened and stops the host tearing the app down over something
// the app has already dealt with.
function guardAgainstFatalReports(): void {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[aifinpay-widget] unhandled rejection", event.reason);
    event.preventDefault();
  });
  window.addEventListener("error", (event) => {
    // Resource errors (a failed image, say) must not take the wallet down.
    if (event.target && event.target !== window) {
      console.error("[aifinpay-widget] resource error", (event.target as HTMLElement).nodeName);
      event.preventDefault();
    }
  }, true);
}

guardAgainstFatalReports();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
