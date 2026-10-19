import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { sectionLevel } from "../lib/access";
import { SECTIONS } from "../sections";

// Phase 0 home: the sections this role can use. Phase 1 replaces this with the
// configurable home screen (role-based stat panels + buttons chosen in Settings).
export function Home() {
  const { access } = useAuth();
  const { club } = useClub();
  const visible = SECTIONS.filter(s => sectionLevel(access, s.section) !== "N");

  return (
    <>
      <div className="page-head">
        <h1>Home</h1>
        {club && <p className="dim">{club}</p>}
      </div>
      <div className="notice">
        This is the new version of Coach Tools, being rebuilt section by section.
        Sections marked <em>current app</em> open in the existing app for now.
      </div>
      {visible.length === 0 ? (
        <p className="dim">Your account doesn't have a role yet. Ask your club admin to give you one.</p>
      ) : (
        <div className="tile-grid">
          {visible.map(s => (
            <Link key={s.key} to={`/${s.key}`} className="tile">
              <span className="tile-icon" aria-hidden="true">{s.icon}</span>
              <span className="tile-text">
                <strong>{s.label}</strong>
                <span className="dim">{s.blurb}</span>
              </span>
              {!s.migrated && <span className="chip">current app</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
