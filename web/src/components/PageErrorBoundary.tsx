import { Component, type ReactNode } from "react";
import { isChunkLoadError } from "../lib/lazyPage";

// A screen that fails to draw shows a message with a Reload button, inside the normal menu and
// top bar, instead of leaving the whole app blank.

interface Props { children: ReactNode; resetKey?: string }
interface State { error: unknown }

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error }; }
  componentDidCatch(error: unknown) { console.error("Page failed to draw", error); }
  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const update = isChunkLoadError(this.state.error);
    return (
      <div className="card" role="alert">
        <h2>{update ? "A newer version of Coach Tools is available" : "This page couldn't load"}</h2>
        <p className="dim">{update ? "Reload to finish updating. Nothing you saved is lost." : "Something went wrong drawing this page. Reloading usually fixes it."}</p>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
