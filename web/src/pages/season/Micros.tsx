import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { QES } from "../../lib/feedback";
import { fmtWhen, TECH_FOCUS } from "../../lib/plans";
import {
  DAYS_SHORT, dayStroke, daySummary, fmtRange, inSeasonBreak, loadMicroWeeks, loadSquadDrillWeeks, MI_STROKES, saveMicros, seedWeek,
  type MiData, type MiWeek
} from "../../lib/season";
import { fmtDdMm, isoAdd, todayLocal } from "../../lib/util";
import { StatusMsg } from "../../components/seasonParts";
import { invalidateSeason, useActiveSeason } from "./Planning";

// Micro-cycles for one macro: a card per week (week commencing, meso, QES
// focus, technical focus, stroke focus and outlines by day, break days).
// Sessions are seeded from the squads' timetables.

export function Micros() {
  const { id } = useParams();
  const { access } = useAuth();
  const level = sectionLevel(access, "season");
  const { club } = useClub();
  const qc = useQueryClient();
  const { season, isLoading: seasonLoading } = useActiveSeason(club);
  const q = useQuery({ queryKey: ["micro_weeks", id], enabled: !!id && !seasonLoading, queryFn: () => loadMicroWeeks(id!, season, todayLocal().date) });
  const [data, setData] = useState<MiData | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const microIds = (data?.weeks ?? []).map(w => w.id).filter(Boolean) as string[];
  const sdw = useQuery({ queryKey: ["sdw", microIds.join(",")], enabled: microIds.length > 0, queryFn: () => loadSquadDrillWeeks(microIds, data!.squads.map(s => s.id)) });

  useEffect(() => { if (q.data && !data) setData(q.data); }, [q.data, data]);

  const crumb = <p className="crumb"><Link to="/season/plan">‹ Planning</Link></p>;

  const stateH1 = <h1>{"Micro-cycles"}</h1>;
  if (!canEdit(level)) return <>{crumb}{stateH1}<p className="notice warn">Season planning is read only for your role.</p></>;
  if (q.isLoading || seasonLoading || (!data && !q.error)) return <>{crumb}{stateH1}<p className="dim">Loading weeks…</p></>;
  if (q.error || !data) return <>{crumb}{stateH1}<p className="msg error">Couldn't load the micro-cycles. <button type="button" className="link-btn" onClick={() => q.refetch()}>Try again</button></p></>;

  const setWeek = (no: number, f: (w: MiWeek) => MiWeek) => { setMsg(null); setData(d => d && ({ ...d, weeks: d.weeks.map(w => (w.no === no ? f(w) : w)) })); };
  const sqName = (sid: string) => data.squads.find(s => s.id === sid)?.name || "";

  const save = async () => {
    setMsg(null); setBusy(true);
    try {
      const weeks = await saveMicros(data);
      setData(d => d && ({ ...d, weeks }));
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["sdw"] });
      setMsg({ text: "Micro-cycles saved." });
    } catch (e) { console.error(e); setMsg({ text: (e as Error).message.startsWith("Week ") ? (e as Error).message : "Could not save: " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {crumb}
      <div className="page-head">
        <h1>{data.macro.title}</h1>
        <p className="dim">{data.squads.map(s => s.name).join(", ") || "No squads"} · {data.macro.micro_count} week{data.macro.micro_count === 1 ? "" : "s"}</p>
      </div>
      {data.weeks.map(w => {
        const comps = w.wc ? data.comps.filter(c => c.date_from >= isoAdd(w.wc, 5) && c.date_from <= isoAdd(w.wc, 7)) : [];
        const drills = (sdw.data ?? []).filter(r => r.micro_id === w.id);
        const pre = `w${w.no}`;
        return (
          <section key={w.no} className="card mi-week" aria-labelledby={pre}>
            <h2 id={pre} className="card-title">Week {w.no}{w.wc ? ` · w/c ${fmtDdMm(w.wc)}` : ""}</h2>
            <label htmlFor={pre + "-wc"}>Week commencing</label>
            <input id={pre + "-wc"} type="date" value={w.wc} onChange={e => setWeek(w.no, x => seedWeek(data, { ...x, wc: e.target.value }))} />
            <div className="field-pair">
              <div>
                <label htmlFor={pre + "-meso"}>Meso</label>
                <select id={pre + "-meso"} value={w.meso} onChange={e => setWeek(w.no, x => ({ ...x, meso: e.target.value }))}>
                  <option value="">—</option>{["1", "2", "3"].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={pre + "-qes"}>QES focus</label>
                <select id={pre + "-qes"} value={w.qes} onChange={e => setWeek(w.no, x => ({ ...x, qes: e.target.value }))}>
                  <option value="">—</option>{Object.entries(QES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <label htmlFor={pre + "-tech"}>Technical focus</label>
            <select id={pre + "-tech"} value={w.tech} onChange={e => setWeek(w.no, x => ({ ...x, tech: e.target.value }))}>
              <option value="">—</option>{TECH_FOCUS.slice(1).map((t, k) => <option key={t} value={String(k + 1)}>{k + 1}. {t}</option>)}
            </select>

            <details className="mi-days">
              <summary>Stroke focus &amp; session outlines by day <small className="dim">{daySummary(w)}</small></summary>
              {!w.wc ? <p className="dim">Set the week commencing date first.</p> : DAYS_SHORT.slice(1).map((dn, k) => {
                const date = isoAdd(w.wc, k);
                const list = w.sessions.filter(s => s.session_date === date), n = list.length;
                const cur = dayStroke(w, date);
                const done = list.filter(s => s.outline.trim()).length;
                return (
                  <div key={date} className={"mi-day" + (n ? "" : " off")}>
                    <div className="mi-day-row">
                      <label htmlFor={`${pre}-d${k}`}>{dn} {fmtDdMm(date)} <small className="dim">{n ? `${n} session${n === 1 ? "" : "s"}` : "No sessions"}</small></label>
                      <select id={`${pre}-d${k}`} value={cur} disabled={!n} aria-label={`${dn} stroke focus`}
                        onChange={e => setWeek(w.no, x => ({ ...x, sessions: x.sessions.map(s => (s.session_date === date ? { ...s, stroke_focus: e.target.value } : s)) }))}>
                        <option value="">—</option>
                        {MI_STROKES.map(s => <option key={s} value={s}>{s}</option>)}
                        {cur === "*" && <option value="*" disabled>Mixed</option>}
                        {cur && cur !== "*" && !MI_STROKES.includes(cur) && <option value={cur}>{cur}</option>}
                      </select>
                    </div>
                    {n > 0 && (
                      <details className="mi-outs">
                        <summary>Session outline{n === 1 ? "" : "s"} <small className="dim">{n === 1 ? (done ? "Written" : "Empty") : `${done} of ${n} written`}</small></summary>
                        {list.map(s => {
                          const label = `${sqName(s.squad_id)} · ${fmtWhen(s.session_date, s.start_time, s.end_time).split(", ").slice(1).join(", ")}`;
                          return (
                            <div key={`${s.squad_id}|${s.session_date}|${s.start_time}`} className="mi-out">
                              <label className="small">{label}
                                <textarea rows={2} placeholder="Session outline" value={s.outline}
                                  onChange={e => setWeek(w.no, x => ({ ...x, sessions: x.sessions.map(y => (y === s ? { ...y, outline: e.target.value } : y)) }))} />
                              </label>
                            </div>
                          );
                        })}
                      </details>
                    )}
                  </div>
                );
              })}
            </details>

            <fieldset className="plain-fieldset">
              <legend>Break days <span className="dim">(tap to rest a day — its sessions drop out and it is dimmed in Timetables)</span></legend>
              <div className="break-days">
                {DAYS_SHORT.slice(1).map((dn, k) => {
                  const dow = k + 1, date = w.wc ? isoAdd(w.wc, k) : "";
                  const seasonBreak = !!date && inSeasonBreak(data, date);
                  const on = w.breakDays.has(dow) || seasonBreak;
                  return (
                    <button key={dn} type="button" className={"break-chip" + (on ? " on" : "")} aria-pressed={on} disabled={seasonBreak}
                      title={seasonBreak ? "Season break" : undefined}
                      onClick={() => setWeek(w.no, x => { const b = new Set(x.breakDays); if (b.has(dow)) b.delete(dow); else b.add(dow); return seedWeek(data, { ...x, breakDays: b }); })}>
                      {dn}{date && <small>{fmtDdMm(date)}</small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {!w.sessions.length && <p className="dim">{w.wc ? "No timetabled sessions this week for these squads (check Timetables or season breaks)." : "Set the week commencing date to load this week's sessions."}</p>}
            {comps.map(c => <p key={c.id} className="micro-comp">🏁 {c.name} · {fmtRange(c.date_from, c.date_to)}</p>)}
            {drills.length > 0 && (
              <div className="week-drills">
                <h3>Drills from squad feedback</h3>
                <ul>{drills.map(r => <li key={r.squad_id + r.drill_id}><div>{r.drill_name}{data.squads.length > 1 ? ` · ${sqName(r.squad_id)}` : ""}{r.reason && <small className="dim">{r.reason}</small>}</div></li>)}</ul>
              </div>
            )}
          </section>
        );
      })}
      <div className="save-bar">
        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save micro-cycles"}</button>
        <StatusMsg msg={msg} />
      </div>
    </>
  );
}
