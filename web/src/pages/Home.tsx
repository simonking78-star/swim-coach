import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { allowedItems, useHomeLayout } from "../home/layout";
import { PANEL_COMPONENTS } from "../home/Panels";
import { SECTIONS } from "../sections";

// Configurable home screen: role-based information panels first, then only the
// section buttons the user has switched on in Settings, both in their chosen order.
export function Home() {
  const { access } = useAuth();
  const { club } = useClub();
  const { layout, loading } = useHomeLayout();
  const { panels, buttons } = allowedItems(layout, access);
  const shownPanels = panels.filter(p => p.visible);
  const shownButtons = buttons.filter(b => b.visible);

  return (
    <>
      <div className="page-head row">
        <div>
          <h1>Home</h1>
          {club && <p className="dim">{club}</p>}
        </div>
        <Link to="/settings" className="btn small">Customise</Link>
      </div>

      {(access?.roles?.length ?? 0) === 0 && (
        <p className="notice warn">Your account doesn't have a role yet. Ask your club admin to give you one.</p>
      )}

      {!loading && (
        <>
          <div className="panel-grid">
            {shownPanels.map(p => {
              const Panel = PANEL_COMPONENTS[p.id as keyof typeof PANEL_COMPONENTS];
              return <Panel key={p.id} />;
            })}
          </div>

          {shownButtons.length > 0 && (
            <>
              <h2 className="section-title">Shortcuts</h2>
              <div className="tile-grid">
                {shownButtons.map(b => {
                  const s = SECTIONS.find(x => x.key === b.id)!;
                  return (
                    <Link key={s.key} to={`/${s.key}`} className="tile">
                      <span className="tile-icon" aria-hidden="true">{s.icon}</span>
                      <span className="tile-text">
                        <strong>{s.label}</strong>
                        <span className="dim">{s.blurb}</span>
                      </span>
                      {!s.migrated && <span className="chip">current app</span>}
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {shownPanels.length === 0 && shownButtons.length === 0 && (access?.roles?.length ?? 0) > 0 && (
            <div className="card">
              <p>Your home screen is empty. Choose panels and shortcuts in <Link to="/settings">Settings</Link>, or use the menu.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
