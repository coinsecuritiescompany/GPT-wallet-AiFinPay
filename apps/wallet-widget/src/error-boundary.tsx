import { Component, type ErrorInfo, type ReactNode } from "react";

// Without a boundary, one bad render takes the whole widget down and the host
// shows "Error loading app / Runtime error" with a Retry that cannot help,
// because retrying re-renders the same bad state. Only opening a new chat
// recovered it. A boundary turns that dead end into a screen the user can leave.
export class WidgetErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : "Unexpected error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the host console; the widget iframe is cross-origin so this
    // is the only way a failure leaves any trace at all.
    console.error("[aifinpay-widget] render failed", error.message, info.componentStack);
  }

  private reset = () => {
    this.setState({ failed: false, message: "" });
    this.props.onReset();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="card">
        <div className="center">
          <span className="eyebrow">DISPLAY ERROR</span>
          <h2>This screen could not be shown</h2>
          <p>Your funds and any submitted transaction are unaffected. Reopening the wallet reloads it from the chain.</p>
        </div>
        <button className="primary" onClick={this.reset}>Reload wallet</button>
      </main>
    );
  }
}
