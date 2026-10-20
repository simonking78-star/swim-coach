import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ROLE_LABEL, roleSummary, sectionLevel } from "../lib/access";
import { SECTIONS } from "../sections";
import { usePendingWrites } from "../lib/offline";
import { stopRoleTest } from "../lib/admin";
import { CLASSIC_URL } from "../sections";
import { logEvent } from "../lib/util";
import { useClub } from "../club/ClubProvider";
import { SendFeedback } from "./SendFeedback";

export function Layout() {
  const { access, session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const { club } = useClub();
  const uid = session?.user.id;
  const pending = usePendingWrites();
  const location = useLocation();

  // A-042 telemetry, same table and names as the classic app: page views, and uncaught errors.
  useEffect(() => { logEvent(uid, club, "page_view", location.pathname); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onErr = (e: ErrorEvent) => logEvent(uid, club, "error", "window.onerror", { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack ? String(e.error.stack).slice(0, 2000) : null });
    const onRej = (e: PromiseRejectionEvent) => logEvent(uid, club, "error", "unhandledrejection", { message: e.reason?.message ?? String(e.reason), stack: e.reason?.stack ? String(e.reason.stack).slice(0, 2000) : null });
    addEventListener("error", onErr); addEventListener("unhandledrejection", onRej);
    return () => { removeEventListener("error", onErr); removeEventListener("unhandledrejection", onRej); };
  }, [uid, club]);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const visible = SECTIONS.filter(s => sectionLevel(access, s.section) !== "N");
  const testing = access?.testing;

  return (
    <div className={"app" + (menuOpen ? " menu-open" : "")}>
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
          <span className="bars" aria-hidden="true" />
        </button>
        <NavLink to="/" className="brand">Coach Tools</NavLink>
      </header>

      <div className={"access-bar" + (testing ? " testing" : "")} role="region" aria-label="Signed-in account">
        <span>
          {testing
            ? <>🧪 Testing as <strong>{[ROLE_LABEL[testing.role] ?? testing.role, testing.club ?? "all clubs",
                ...((testing.squad_ids || []).length ? [`${testing.squad_ids!.length} squad${testing.squad_ids!.length === 1 ? "" : "s"}`] : []),
                ...((testing.swimmer_ids || []).length ? ["linked swimmer"] : [])].join(" · ")}</strong></>
            : <>{session?.user.email} · <strong>{roleSummary(access)}</strong></>}
        </span>
        {pending > 0 && <span className="queued-badge" role="status">{pending === 1 ? "1 save queued" : `${pending} saves queued`} — will sync</span>}
        {testing
          ? <button className="link-btn light" disabled={stopping} onClick={async () => {
              setStopping(true);
              try { await stopRoleTest(session!.user.id); } catch (e) { console.error(e); }
              window.location.assign(import.meta.env.BASE_URL);
            }}>{stopping ? "Stopping…" : "Stop test"}</button>
          : <button className="link-btn light" onClick={signOut}>Sign out</button>}
      </div>

      <div className="frame">
        <nav className="sidenav" aria-label="Sections">
          <NavLink to="/" end className="nav-item"><span aria-hidden="true">🏠</span>Home</NavLink>
          {visible.map(s => (
            <NavLink key={s.key} to={`/${s.key}`} className="nav-item">
              <span aria-hidden="true">{s.icon}</span>{s.label}
            </NavLink>
          ))}
          <div className="nav-foot">
            <NavLink to="/settings" className="nav-item"><span aria-hidden="true">🔧</span>Settings</NavLink>
            <button type="button" className="nav-item" onClick={() => { setMenuOpen(false); setFbOpen(true); }}><span aria-hidden="true">💬</span>Send feedback</button>
            <a className="nav-item" href={CLASSIC_URL}><span aria-hidden="true">↩︎</span>Classic app</a>
          </div>
        </nav>
        <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <main className="content">
          <Outlet />
        </main>
        <SendFeedback open={fbOpen} onClose={() => setFbOpen(false)} />
      </div>
    </div>
  );
}
