import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { canEdit, sectionLevel } from "../lib/access";
import type { PickSwimmer } from "../lib/admin";

/** Type a name, pick a swimmer; shows a pill with Change once picked. */
export function NamePicker({ id, label, list, sel, onPick, onClear, loading, tag }: {
  id: string; label: string; list: PickSwimmer[]; sel: PickSwimmer | null; onPick: (s: PickSwimmer) => void; onClear: () => void;
  loading?: boolean; tag?: (s: PickSwimmer) => string;
}) {
  const [q, setQ] = useState("");
  const tagOf = tag ?? (s => s.squad || "");
  if (sel) return (
    <div className="selected-pill">
      <span><strong>{sel.full_name}</strong><span className="dim"> · {tagOf(sel) || "no squad"}</span></span>
      <button type="button" className="link-btn" onClick={() => { onClear(); setQ(""); }}>Change</button>
    </div>
  );
  const t = q.trim().toLowerCase();
  const hits = t ? list.filter(s => s.full_name.toLowerCase().includes(t)).slice(0, 25) : [];
  return (
    <div className="search-box">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="search" autoComplete="off" placeholder={loading ? "Loading…" : "Search swimmer by name…"} disabled={loading} value={q} onChange={e => setQ(e.target.value)} />
      {t && (
        <ul className="search-results">
          {!hits.length && <li className="dim">No matches</li>}
          {hits.map(s => (
            <li key={s.id}><button type="button" onClick={() => { setQ(""); onPick(s); }}>
              <span>{s.full_name}</span>{tagOf(s) && <span className="chip">{tagOf(s)}</span>}
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Crumb back to Admin, plus the access check every admin screen needs. */
export function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const { access } = useAuth();
  const level = sectionLevel(access, "admin");
  return (
    <>
      <p className="crumb"><Link to="/admin">‹ Admin</Link></p>
      <div className="page-head"><h1>{title}</h1></div>
      {canEdit(level) ? children : <p className="notice warn">Your role doesn't have access to Admin.</p>}
    </>
  );
}
