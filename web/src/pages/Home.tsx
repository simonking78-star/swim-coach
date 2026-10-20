import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ClubPicker } from "../club/ClubPicker";
import { allowedItems, PANELS, useHomeLayout, type LayoutItem } from "../home/layout";
import { PANEL_COMPONENTS } from "../home/Panels";
import { SECTIONS } from "../sections";

// Configurable home screen: role-based information panels first, then only the
// section buttons the user has switched on in Settings, both in their chosen order.
export function Home() {
  const { access } = useAuth();
  const { layout, loading } = useHomeLayout();
  const { panels, buttons } = allowedItems(layout, access);
  const shownPanels = panels.filter(p => p.visible);
  const shownButtons = buttons.filter(b => b.visible);

  // System-wide panels and club panels are kept in separate groups, so the club
  // picker sits directly above the figures it controls. Each group keeps the
  // user's own order; whichever group has the user's first panel comes first.
  const scopeOf = (p: LayoutItem) => PANELS.find(d => d.id === p.id)?.scope ?? "club";
  const systemPanels = shownPanels.filter(p => scopeOf(p) === "system");
  const clubPanels = shownPanels.filter(p => scopeOf(p) === "club");
  const clubFirst = shownPanels.length > 0 && scopeOf(shownPanels[0]) === "club";

  const renderPanels = (list: LayoutItem[]) => (
    <div className="panel-grid">
      {list.map(p => {
        const Panel = PANEL_COMPONENTS[p.id as keyof typeof PANEL_COMPONENTS];
        return <Panel key={p.id} />;
      })}
    </div>
  );

  const systemGroup = systemPanels.length > 0 && (
    <section className="panel-group" aria-label="All clubs">{renderPanels(systemPanels)}</section>
  );
  const clubGroup = clubPanels.length > 0 && (
    <section className="panel-group" aria-labelledby="club-group-title">
      <div className="group-head">
        <h2 id="club-group-title" className="group-title">Club</h2>
        <ClubPicker hideLabel />
      </div>
      {renderPanels(clubPanels)}
    </section>
  );

  return (
    <>
      <div className="page-head row">
        <div>
          <h1>Home</h1>
        </div>
        <Link to="/settings" className="btn small">Customise</Link>
      </div>

      {(access?.roles?.length ?? 0) === 0 && (
        <p className="notice warn">Your account doesn't have a role yet. Ask your club admin to give you one.</p>
      )}

      {!loading && (
        <>
          {clubFirst ? <>{clubGroup}{systemGroup}</> : <>{systemGroup}{clubGroup}</>}

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
