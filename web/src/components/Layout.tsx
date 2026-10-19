import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ROLE_LABEL, roleSummary, sectionLevel } from "../lib/access";
import { SECTIONS } from "../sections";
import { usePendingWrites } from "../lib/offline";

export function Layout() {
  const { access, session, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = usePendingWrites();
  const location = useLocation();

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
        <NavLink to="/" className="brand">Coach Tools <span className="badge">v2 preview</span></NavLink>
      </header>

      <div className={"access-bar" + (testing ? " testing" : "")}>
        <span>
          {testing
            ? <>🧪 Testing as <strong>{ROLE_LABEL[testing.role] ?? testing.role} · {testing.club ?? "all clubs"}</strong></>
            : <>{session?.user.email} · <strong>{roleSummary(access)}</strong></>}
        </span>
        {pending > 0 && <span className="queued-badge" role="status">{pending === 1 ? "1 save queued" : `${pending} saves queued`} — will sync</span>}
        <button className="link-btn light" onClick={signOut}>Sign out</button>
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
            <a className="nav-item" href="/"><span aria-hidden="true">↩︎</span>Open current app</a>
          </div>
        </nav>
        <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
