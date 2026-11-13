import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CLASSIC_URL } from "../sections";
import { isSharedDevice } from "../lib/device";

/**
 * Desktop account menu (A-118): who is signed in, Settings, Send feedback, the classic app,
 * and Sign out. A simple disclosure (button + list), closed by Escape, an outside click or navigating.
 */
export function AccountMenu({ email, role, onFeedback, onSignOut }: {
  email: string; role: string; onFeedback: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("pointerdown", onDown); removeEventListener("keydown", onKey); };
  }, [open]);

  const initial = (email.trim()[0] || "?").toUpperCase();
  return (
    <div className="acct" ref={wrap}>
      <button ref={btn} type="button" className="acct-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="acct-avatar" aria-hidden="true">{initial}</span>
        <span className="acct-name">{email}</span>
        <span className="sr-only">Account menu</span>
        <span aria-hidden="true" className="acct-caret">▾</span>
      </button>
      {open && (
        <div id={id} className="acct-pop">
          <div className="acct-who">
            <strong>{email}</strong>
            <span className="dim">{role}</span>
            {isSharedDevice() && <span className="chip">Shared computer · signs out after 15 min idle</span>}
          </div>
          <ul>
            <li><Link to="/settings" className="acct-item"><span aria-hidden="true">🔧</span>Settings</Link></li>
            <li><button type="button" className="acct-item" onClick={() => { setOpen(false); onFeedback(); }}><span aria-hidden="true">💬</span>Send feedback</button></li>
            <li><a href={CLASSIC_URL} className="acct-item"><span aria-hidden="true">↩︎</span>Classic app</a></li>
            <li className="acct-sep"><button type="button" className="acct-item" onClick={onSignOut}><span aria-hidden="true">⎋</span>Sign out</button></li>
          </ul>
        </div>
      )}
    </div>
  );
}
