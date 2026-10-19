import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { LEVEL_NOTE, sectionLevel } from "../lib/access";
import { SECTIONS, legacyUrl } from "../sections";

// Placeholder for every section until it is rebuilt in React: checks access,
// then hands over to the current app at the same section.
export function SectionPage() {
  const { key } = useParams();
  const { access } = useAuth();
  const s = SECTIONS.find(x => x.key === key);
  if (!s) return <Navigate to="/" replace />;

  const lv = sectionLevel(access, s.section);
  if (lv === "N") {
    return (
      <>
        <div className="page-head"><h1>{s.label}</h1></div>
        <p className="notice warn">Your role doesn't have access to this section.</p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">{s.icon}</span> {s.label}</h1>
        <p className="dim">{s.blurb}</p>
      </div>
      {LEVEL_NOTE[lv] && <p className="notice">{LEVEL_NOTE[lv]}</p>}
      <div className="card">
        <p>This section hasn't moved to the new version yet. It opens in the current app, signed in as you.</p>
        <a className="btn primary" href={legacyUrl(s.legacyGo)}>Open {s.label} in the current app</a>
      </div>
    </>
  );
}
