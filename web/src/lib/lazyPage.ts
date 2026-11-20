import { lazy, type ComponentType } from "react";

// After a new release, an app that was already open (an installed phone app resumed from the
// background, or a tab left open) still holds the old page list. The old screen files are gone
// from the server, so opening a screen that hadn't been loaded yet fails and React showed a blank
// page. Instead, reload once to pick up the new release. A short guard stops a reload loop if
// the file is genuinely missing; then the error goes to the PageErrorBoundary instead.

const KEY = "ct.chunkReloadAt";
const GUARD_MS = 30_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to load module script|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(msg);
}

/** Reload the page to fetch the latest release, unless we already did so in the last 30 seconds. */
export function reloadForNewRelease(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage unavailable */ }
  if (Date.now() - last < GUARD_MS) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
  window.location.reload();
  return true;
}

/** React.lazy that reloads once onto the new release when a screen file has been replaced. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().catch(err => {
    if (isChunkLoadError(err) && reloadForNewRelease()) return new Promise<{ default: T }>(() => { /* page is reloading */ });
    throw err;
  }));
}
