import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { LEVEL_NOTE, sectionLevel } from "../lib/access";
import { loadSquadNames } from "../lib/attendance";
import { loadLastFeedback, loadRecentSessions, loadRoster, type RosterSwimmer } from "../lib/swimmers";
import { fmtDate } from "../lib/util";

// Roster: search, squad and age filters, live count, a table whose columns the
// coach chooses (remembered on this device, same key as the current app).
// Tapping a swimmer opens their profile.

type Extra = { att?: Record<string, number>; fb?: Record<string, string> };
interface Col { key: string; label: string; fixed?: boolean; lazy?: "att" | "fb"; nowrap?: boolean; get: (s: RosterSwimmer, x: Extra) => string | number; }

const COLS: Col[] = [
  { key: "name", label: "Name", fixed: true, get: s => s.full_name },
  { key: "squad", label: "Squad", get: s => s.squad || "—" },
  { key: "age", label: "Age", get: s => s.age ?? "—" },
  { key: "yob", label: "Year of birth", get: s => s.date_of_birth?.slice(0, 4) || "—" },
  { key: "gender", label: "Gender", get: s => s.gender || "—" },
  { key: "seid", label: "Swim England ID", get: s => s.swim_england_id || "—" },
  { key: "joined", label: "Joined club", nowrap: true, get: s => (s.joined_club_on ? fmtDate(s.joined_club_on) : "—") },
  { key: "att30", label: "Sessions (30 days)", lazy: "att", get: (s, x) => (x.att ? x.att[s.id] ?? 0 : "…") },
  { key: "lastfb", label: "Last feedback", lazy: "fb", nowrap: true, get: (s, x) => (x.fb ? (x.fb[s.id] ? fmtDate(x.fb[s.id]) : "—") : "…") },
  { key: "parent", label: "Parent", get: s => s.parent_name || "—" },
  { key: "phone", label: "Parent phone", nowrap: true, get: s => s.parent_phone || "—" },
  { key: "email", label: "Parent email", get: s => s.parent_email || "—" }
];
const COLS_KEY = "rosterCols";
const DEFAULT_COLS = ["name", "squad", "age"];

function readCols(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) || "null");
    if (Array.isArray(v) && v.length) return ["name", ...v.filter((k: string) => k !== "name" && COLS.some(c => c.key === k))];
  } catch { /* unavailable */ }
  return DEFAULT_COLS;
}

export function Swimmers() {
  const { access } = useAuth();
  const level = sectionLevel(access, "roster");
  const { club } = useClub();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [squad, setSquad] = useState("");
  const [age, setAge] = useState("");
  const [cols, setColsState] = useState<string[]>(readCols);
  const [chooser, setChooser] = useState(false);

  const roster = useQuery({ queryKey: ["roster", club], enabled: !!club, queryFn: () => loadRoster(club!) });
  const squads = useQuery({ queryKey: ["fb_squads", club], enabled: !!club, queryFn: () => loadSquadNames(club!) });
  const needAtt = cols.includes("att30"), needFb = cols.includes("lastfb");
  const att = useQuery({ queryKey: ["roster_att30"], enabled: needAtt, staleTime: 5 * 60 * 1000, queryFn: loadRecentSessions });
  const fb = useQuery({ queryKey: ["roster_lastfb"], enabled: needFb, staleTime: 5 * 60 * 1000, queryFn: loadLastFeedback });
  const extra: Extra = { att: att.data, fb: fb.data };

  useEffect(() => { setSquad(""); setAge(""); }, [club]);

  const setCols = (next: string[]) => {
    const ordered = COLS.map(c => c.key).filter(k => next.includes(k)); // keep catalogue order
    setColsState(ordered);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(ordered)); } catch { /* unavailable */ }
  };

  const all = roster.data ?? [];
  const ages = useMemo(() => [...new Set(all.map(s => s.age).filter((a): a is number => a != null))].sort((a, b) => a - b), [all]);
  const t = q.trim().toLowerCase();
  const shown = all.filter(s => (!squad || s.squad === squad) && (!age || String(s.age) === age) && (!t || s.full_name.toLowerCase().includes(t)));
  const shownCols = COLS.filter(c => cols.includes(c.key));

  if (level === "N") {
    return <><div className="page-head"><h1>Swimmers</h1></div><p className="notice warn">Your role doesn't have access to the swimmer roster.</p></>;
  }

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">🏊</span> Swimmers</h1>
        <p className="dim">Tap a swimmer for attendance, PBs, stopwatch times and feedback</p>
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <section className="card">
        <h2 className="card-title">Filters</h2>
        <ClubPicker />
        <label htmlFor="ro-search">Search by name</label>
        <input id="ro-search" type="search" placeholder="Type a name…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
        <div className="field-pair">
          <div>
            <label htmlFor="ro-squad">Squad</label>
            <select id="ro-squad" value={squad} onChange={e => setSquad(e.target.value)}>
              <option value="">All squads</option>
              {(squads.data ?? []).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ro-age">Age</label>
            <select id="ro-age" value={age} onChange={e => setAge(e.target.value)}>
              <option value="">All ages</option>
              {ages.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head top">
          <h2 className="card-title">Swimmers {roster.data && <span className="dim">({shown.length})</span>}</h2>
          <button type="button" className="btn small" aria-expanded={chooser} aria-controls="ro-cols" onClick={() => setChooser(o => !o)}>Columns {chooser ? "▴" : "▾"}</button>
        </div>
        {chooser && (
          <div id="ro-cols" className="chip-row" role="group" aria-label="Columns to show">
            {COLS.map(c => {
              const on = cols.includes(c.key);
              return (
                <label key={c.key} className={"col-chip" + (on ? " on" : "") + (c.fixed ? " fixed" : "")}>
                  <input type="checkbox" checked={on} disabled={c.fixed} onChange={e => setCols(e.target.checked ? [...cols, c.key] : cols.filter(k => k !== c.key))} />
                  {c.label}
                </label>
              );
            })}
          </div>
        )}
        {roster.isLoading && <p className="dim">Loading…</p>}
        {roster.error && <p className="msg error">Couldn't load swimmers.</p>}
        {roster.data && (
          <div className="table-wrap">
            <table className="data roster">
              <caption className="sr-only">Swimmers, filtered</caption>
              <thead><tr>{shownCols.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={shownCols.length} className="dim">No swimmers match{t ? ` “${q.trim()}”` : " these filters"}.</td></tr>}
                {shown.map(s => (
                  <tr key={s.id} className="click-row" onClick={() => navigate(`/swimmers/${s.id}`)}>
                    {shownCols.map(c => c.key === "name"
                      ? <th key={c.key} scope="row"><Link to={`/swimmers/${s.id}`} onClick={e => e.stopPropagation()}>{s.full_name}</Link></th>
                      : <td key={c.key} className={c.nowrap ? "nowrap" : undefined}>{String(c.get(s, extra))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
