import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { hostWidgetData } from "./bridge/mcp-bridge.js";

// The host watches the widget frame for uncaught errors and unhandled promise
// rejections, and reports either as "Error loading app — Runtime error",
// replacing the whole widget with a Retry that cannot recover it. A single
// stray rejection anywhere therefore destroys a working wallet.
function guardAgainstFatalReports(): void {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[aifinpay-widget] unhandled rejection", event.reason);
    event.preventDefault();
  });
  window.addEventListener("error", (event) => {
    if (event.target && event.target !== window) {
      console.error("[aifinpay-widget] resource error", (event.target as HTMLElement).nodeName);
      event.preventDefault();
    }
  }, true);
}

guardAgainstFatalReports();

// Desktop usually places structuredContent directly in toolOutput. Android has
// also supplied the complete MCP result envelope there. Normalize it before
// React mounts, otherwise the host has valid wallet data while the widget sees
// no `view` field and renders an internal-error fallback.
const initialData = hostWidgetData();
createRoot(document.getElementById("root")!).render(
  <StrictMode><App {...(initialData ? { initialData } : {})} /></StrictMode>
);
