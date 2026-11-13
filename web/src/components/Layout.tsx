import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ROLE_LABEL, roleSummary, sectionLevel } from "../lib/access";
import { NAV_GROUPS, SECTIONS } from "../sections";
import { usePendingWrites } from "../lib/offline";
import { stopRoleTest } from "../lib/admin";
import { CLASSIC_URL } from "../sections";
import { logEvent } from "../lib/util";
import { useClub } from "../club/ClubProvider";
import { SendFeedback } from "./SendFeedback";
import { AccountMenu } from "./AccountMenu";
import { IdleGuard } from "./IdleGuard";
import { ClubPicker } from "../club/ClubPicker";
import { readNavCollapsed, writeNavCollapsed } from "../lib/device";
import { pageWidth } from "../lib/pageWidth";

export function Layout() {
  const { access, session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readNavCollapsed);
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
  const grouped = NAV_GROUPS
    .map(g => ({ label: g.label, items: g.keys.map(k => visible.find(s => s.key === k)).filter((s): s is typeof visible[number] => !!s) }))
    .filter(g => g.items.length);
  // Any section not given a group still appears, at the end.
  const ungrouped = visible.filter(s => !NAV_GROUPS.some(g => g.keys.includes(s.key)));
  if (ungrouped.length) grouped.push({ label: "More", items: ungrouped });
  const testing = access?.testing;
  const toggleCollapsed = () => setCollapsed(c => { writeNavCollapsed(!c); return !c; });
  const navTitle = (label: string) => (collapsed ? label : undefined);

  return (
    <div className={"app" + (menuOpen ? " menu-open" : "") + (collapsed ? " nav-collapsed" : "")}>
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
          <span className="bars" aria-hidden="true" />
        </button>
        <NavLink to="/" className="brand">Coach Tools</NavLink>
        {/* Desktop only (A-118): club, queued saves and the account menu live in the one top bar. */}
        <div className="topbar-desk">
          <ClubPicker variant="topbar" />
          {pending > 0 && <span className="queued-badge" role="status">{pending === 1 ? "1 save queued" : `${pending} saves queued`}</span>}
          <AccountMenu email={session?.user.email ?? ""} role={roleSummary(access)} onFeedback={() => setFbOpen(true)} onSignOut={signOut} />
        </div>
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
          <NavLink to="/" end className="nav-item" title={navTitle("Home")}><span className="nav-icon" aria-hidden="true">🏠</span><span className="nav-label">Home</span></NavLink>
          {grouped.map(g => (
            <div key={g.label} className="nav-group" role="group" aria-label={g.label}>
              <p className="nav-group-title" aria-hidden="true">{g.label}</p>
              {g.items.map(s => (
                <NavLink key={s.key} to={`/${s.key}`} className="nav-item" title={navTitle(s.label)}>
                  <span className="nav-icon" aria-hidden="true">{s.icon}</span><span className="nav-label">{s.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {/* Phone drawer only; on a desktop these are in the account menu. */}
          <div className="nav-foot">
            <NavLink to="/settings" className="nav-item"><span className="nav-icon" aria-hidden="true">🔧</span><span className="nav-label">Settings</span></NavLink>
            <button type="button" className="nav-item" onClick={() => { setMenuOpen(false); setFbOpen(true); }}><span className="nav-icon" aria-hidden="true">💬</span><span className="nav-label">Send feedback</span></button>
            <a className="nav-item" href={CLASSIC_URL}><span className="nav-icon" aria-hidden="true">↩︎</span><span className="nav-label">Classic app</span></a>
          </div>
          <button type="button" className="nav-item nav-collapse" aria-pressed={collapsed} onClick={toggleCollapsed} title={collapsed ? "Expand menu" : undefined}>
            <span className="nav-icon" aria-hidden="true">{collapsed ? "»" : "«"}</span><span className="nav-label">Collapse menu</span>
          </button>
        </nav>
        <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <main className="content" data-width={pageWidth(location.pathname)}>
          <IdleGuard pending={pending} signOut={signOut} />
          <Outlet />
          <footer className="app-foot">Coach Tools v{__APP_VERSION__} · built {__APP_BUILD__} · {__APP_COMMIT__}</footer>
        </main>
        <SendFeedback open={fbOpen} onClose={() => setFbOpen(false)} />
      </div>
    </div>
  );
}
