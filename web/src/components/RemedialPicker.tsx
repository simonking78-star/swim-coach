import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { canEdit, sectionLevel } from "../lib/access";
import { loadDrills, type Drill } from "../lib/feedback";
import { DrillEditModal } from "./DrillEditModal";

// Remedial action picker: choose drills and skills from the club's Drills &
// Skills library (Supabase drills_library), or create a new one there and
// pick it straight away. Used by swimmer feedback (several) and squad
// feedback (one, because that drill is linked to season weeks).

/** Library stroke values that fit a feedback stroke/skill, for "suggested" drills. */
const CATEGORY_MATCH: Record<string, string[]> = {
  Free: ["frontcrawl", "freestyle"], Back: ["backstroke"], Breast: ["breaststroke"], Fly: ["butterfly"],
  "Touch turn": ["turn"], "Tumble turn": ["turn"], Dive: ["dive", "start"], Transition: ["transition", "underwater"]
};
const DEFAULT_STROKE: Record<string, string> = {
  Free: "Frontcrawl", Back: "Backstroke", Breast: "Breaststroke", Fly: "Butterfly",
  "Touch turn": "Turn - Breaststroke", "Tumble turn": "Turn - Frontcrawl", Dive: "Dive", Transition: "Transition"
};
export const suitsCategory = (d: Drill, category: string) =>
  (CATEGORY_MATCH[category] ?? []).some(k => (d.stroke || "").toLowerCase().includes(k));

function matches(d: Drill, q: string) {
  const t = q.trim().toLowerCase();
  return !t || (d.drill_name || "").toLowerCase().includes(t) || (d.stroke || "").toLowerCase().includes(t) ||
    (d.pseudonyms || []).some(p => (p || "").toLowerCase().includes(t));
}

export function RemedialPicker({ club, category, value, onChange, multiple = true, idPrefix }: {
  club: string;
  /** Feedback stroke/skill — puts matching drills first. */
  category: string;
  value: Drill[];
  onChange: (drills: Drill[]) => void;
  multiple?: boolean;
  idPrefix: string;
}) {
  const { access } = useAuth();
  const editable = canEdit(sectionLevel(access, "plans"));
  const qc = useQueryClient();
  const drills = useQuery({ queryKey: ["drills", club], queryFn: () => loadDrills(club), staleTime: 5 * 60 * 1000 });
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);

  const chosen = new Set(value.map(d => d.id));
  const all = drills.data ?? [];
  const list = useMemo(() => {
    const hits = all.filter(d => matches(d, q));
    const suited = category ? hits.filter(d => suitsCategory(d, category)) : [];
    if (q.trim() || showAll || !suited.length) {
      // Suggested ones first, then the rest of the library.
      return [...suited, ...hits.filter(d => !suited.includes(d))];
    }
    return suited;
  }, [all, q, showAll, category]);

  const toggle = (d: Drill) => {
    if (chosen.has(d.id)) onChange(value.filter(x => x.id !== d.id));
    else onChange(multiple ? [...value, d] : [d]);
  };

  return (
    <div className="remedial-picker">
      {value.length > 0 && (
        <ul className="rp-chosen" aria-label="Chosen drills and skills">
          {value.map(d => (
            <li key={d.id} className="rp-chip">
              <span><strong>{d.drill_name}</strong>{d.stroke && <span className="dim"> · {d.stroke}</span>}</span>
              <button type="button" aria-label={`Remove ${d.drill_name}`} onClick={() => toggle(d)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {(multiple || value.length === 0) && (
        <>
          <label htmlFor={`${idPrefix}-search`} className="sr-only">Search drills and skills</label>
          <input id={`${idPrefix}-search`} type="search" autoComplete="off" placeholder="Search drills & skills…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="rp-box" role="group" aria-label="Drills and skills library">
            {drills.isLoading && <p className="dim">Loading the library…</p>}
            {drills.error && <p className="msg error">Couldn't load the drills library.</p>}
            {!drills.isLoading && list.length === 0 && <p className="dim">{q.trim() ? `Nothing in the library matches “${q.trim()}”.` : "The library is empty."}</p>}
            {list.map(d => {
              const on = chosen.has(d.id);
              return (
                <button key={d.id} type="button" aria-pressed={on} className={"rp-item" + (on ? " on" : "")} onClick={() => { toggle(d); if (!multiple) setQ(""); }}>
                  <span className="rp-tick" aria-hidden="true">{on ? "✓" : "+"}</span>
                  <span className="rp-name">{d.drill_name}</span>
                  {d.stroke && <span className="chip">{d.stroke}</span>}
                </button>
              );
            })}
          </div>
          <div className="btn-row rp-actions">
            {!q.trim() && category && !showAll && all.some(d => suitsCategory(d, category)) && (
              <button type="button" className="link-btn" onClick={() => setShowAll(true)}>Show the whole library</button>
            )}
            {editable && <button type="button" className="btn small" onClick={() => setCreating(true)}>+ New drill / skill</button>}
          </div>
        </>
      )}
      {creating && (
        <DrillEditModal drill={null} club={club} initialName={q.trim()} initialStroke={DEFAULT_STROKE[category] ?? ""}
          onClose={() => setCreating(false)}
          onSaved={saved => {
            const d: Drill = { id: saved.id, drill_name: saved.drill_name, stroke: saved.stroke, pseudonyms: null };
            qc.setQueryData<Drill[]>(["drills", club], old => old && !old.some(x => x.id === d.id) ? [...old, d] : old);
            onChange(multiple ? [...value.filter(x => x.id !== d.id), d] : [d]);
            setQ("");
          }} />
      )}
    </div>
  );
}

/** "Zip, Catch-up — keep the head still": the readable remedial_action text. */
export function composeRemedial(drills: Drill[], cue: string): string | null {
  const names = drills.map(d => d.drill_name).join(", ");
  const c = cue.trim();
  const text = names && c ? `${names} — ${c}` : names || c;
  return text || null;
}

/** Recover the cue from a stored remedial_action that was composed with these drills. */
export function cueFrom(text: string | null | undefined, drills: Drill[]): string {
  const t = text ?? "";
  if (!drills.length) return t;
  const names = drills.map(d => d.drill_name).join(", ");
  if (t === names) return "";
  if (t.startsWith(names + " — ")) return t.slice(names.length + 3);
  const i = t.indexOf(" — ");
  return i >= 0 ? t.slice(i + 3) : "";
}
