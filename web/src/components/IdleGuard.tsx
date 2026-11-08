import { useEffect, useRef, useState } from "react";
import { isSharedDevice } from "../lib/device";

const LIMIT_MS = 15 * 60 * 1000;
const WARN_MS = 60 * 1000;
export const IDLE_FLAG = "ct.idleSignedOut";

/**
 * Shared computers only (A-118): sign out after 15 minutes without a key press, click, tap or scroll.
 * A minute's warning comes first. Saves still waiting to sync keep the session open, so nothing is lost.
 */
export function IdleGuard({ pending, signOut }: { pending: number; signOut: () => Promise<void> }) {
  const shared = isSharedDevice();
  const last = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null); // ms left, once inside the warning minute

  useEffect(() => {
    if (!shared) return;
    const bump = () => { last.current = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach(e => addEventListener(e, bump, { passive: true, capture: true }));
    return () => events.forEach(e => removeEventListener(e, bump, { capture: true }));
  }, [shared]);

  useEffect(() => {
    if (!shared) return;
    const tick = () => {
      const remaining = LIMIT_MS - (Date.now() - last.current);
      if (remaining <= 0 && pending === 0) {
        try { sessionStorage.setItem(IDLE_FLAG, "1"); } catch { /* storage unavailable */ }
        signOut();
        return;
      }
      setLeft(remaining <= WARN_MS ? Math.max(0, remaining) : null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [shared, pending, signOut]);

  if (!shared || left === null) return null;
  return (
    <div className="idle-banner" role="alert">
      {pending > 0
        ? <span>No activity for 15 minutes. You'll be signed out once your saves have synced.</span>
        : <>
            <span aria-hidden="true">Shared computer: signing out in {Math.ceil(left / 1000)} seconds.</span>
            <span className="sr-only">Shared computer: you'll be signed out in under a minute.</span>
          </>}
      <button type="button" className="btn small" onClick={() => { last.current = Date.now(); setLeft(null); }}>Stay signed in</button>
    </div>
  );
}
