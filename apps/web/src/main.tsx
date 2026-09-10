import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (root === null) {
  throw new Error("Application root was not found.");
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

class AppErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Application render failed", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main className="app-error-boundary" role="alert">
          <section>
            <h1>Conversion workspace unavailable</h1>
            <p>The last settings change could not be rendered safely.</p>
            <details>
              <summary>Technical details</summary>
              <pre>{this.state.error.message}</pre>
            </details>
            <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
