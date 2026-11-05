import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, sectionLevel } from "../../lib/access";
import { WORK_LABEL, WORK_TAGS, loadPlanLines, loadPlanTagSummary, refreshExposure, saveWorkTags, type PlanLine } from "../../lib/measures";
import { loadPlan } from "../../lib/plans";
import { fmtDate } from "../../lib/util";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";

// Work tags (A-126): what kind of work each set line is — kick, turns, speed,
// drill… — so a test result can be read against the training a swimmer did.
// Tags are suggested from the line and its heading; a coach confirms or
// changes them here. Confirmed tags are stored on the plan and win over the
// suggestion; editing a line's text in the plan editor clears them.

function useTagAccess() {
  const { access } = useAuth();
  return { canTag: canEdit(sectionLevel(access, "plans")) };
}

export function WorkTagList() {
  const { canView, canPublish } = useMeasuresAccess();
  const { canTag } = useTagAccess();
  const { club } = useClub();
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["mm_plan_tags", club], enabled: !!club && canView, queryFn: () => loadPlanTagSummary(club!) });
  if (!canView) return <><MBack /><NoAccess /></>;
  const rows = (q.data ?? []).filter(p => p.lines > 0 && (filter === "all" || p.confirmed < p.lines));
  const total = (q.data ?? []).reduce((a, p) => a + p.lines, 0), done = (q.data ?? []).reduce((a, p) => a + p.confirmed, 0);
  const refresh = async () => { setMsg("Updating…"); try { const n = await refreshExposure(club!); setMsg(`Updated the training figures on ${n} result${n === 1 ? "" : "s"}.`); } catch (e) { setMsg((e as Error).message); } };
  return (
    <>
      <MBack />
      <div className="page-head row"><div><h1>Work tags</h1><p className="dim">What kind of work each set line is, so results can be read against training done.</p></div><ClubPicker /></div>
      <section className="card">
        <div className="stat-row">
          <div className="stat"><span className="stat-label">Set lines confirmed</span><span className="stat-value">{total ? Math.round((100 * done) / total) : 0}%</span><span className="stat-note">{done} of {total}</span></div>
        </div>
        <p className="hint">Unconfirmed lines still count, using the suggested tags. Confirming makes the figures more reliable. A plan must be attached to a register for its work to count.</p>
        {canPublish && <p><button className="btn" onClick={refresh}>Update training figures on past results</button> {msg && <span className="hint">{msg}</span>}</p>}
      </section>
      <div className="seg">
        <button type="button" className={"seg-btn" + (filter === "todo" ? " on" : "")} onClick={() => setFilter("todo")}>To confirm</button>
        <button type="button" className={"seg-btn" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>All plans</button>
      </div>
      {q.isLoading ? <p className="dim">Loading…</p>
        : !rows.length ? <p className="dim">{filter === "todo" ? "Every plan's lines are confirmed." : "No plans with set lines."}</p>
        : <ul className="feed card">{rows.map(p => (
            <li key={p.id}><Link to={`/measures/work/${p.id}`}><strong>{p.title}</strong></Link>
              <div className="feed-meta dim">{p.intended_date ? fmtDate(p.intended_date) : "No date"} · {p.total_distance_m ?? 0} m · {p.confirmed}/{p.lines} lines confirmed{!canTag ? " · read only" : ""}</div></li>
          ))}</ul>}
    </>
  );
}

export function WorkTagPlan() {
  const { id } = useParams();
  const { canView } = useMeasuresAccess();
  const { canTag } = useTagAccess();
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ["plan", id], enabled: !!id && canView, queryFn: () => loadPlan(id!) });
  const lines = useQuery({ queryKey: ["mm_plan_lines", id], enabled: !!id && canView, queryFn: () => loadPlanLines(id!) });
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { if (lines.data) setDraft(Object.fromEntries(lines.data.map(l => [l.line_path.join("."), l.tags]))); }, [lines.data]);
  if (!canView) return <><MBack /><NoAccess /></>;
  if (lines.isLoading || plan.isLoading) return <><MBack to="/measures/work" label="Work tags" /><p className="dim">Loading…</p></>;
  const list = lines.data ?? [];
  const toggle = (l: PlanLine, tag: string) => setDraft(d => {
    const k = l.line_path.join("."), cur = d[k] ?? l.tags;
    return { ...d, [k]: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] };
  });
  const save = async (only?: PlanLine[]) => {
    setMsg({ text: "Saving…" });
    try {
      await saveWorkTags(id!, (only ?? list).map(l => ({ path: l.line_path, tags: draft[l.line_path.join(".")] ?? l.tags })));
      setMsg({ text: "Saved. These tags now count for results closed from here on; use “Update training figures” for past results." });
      qc.invalidateQueries({ queryKey: ["mm_plan_lines", id] }); qc.invalidateQueries({ queryKey: ["mm_plan_tags"] });
    } catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  };
  let lastHead: string | null | undefined;
  return (
    <>
      <MBack to="/measures/work" label="Work tags" />
      <div className="page-head"><h1>{plan.data?.title ?? "Plan"}</h1>
        <p className="dim">{plan.data?.intended_date ? fmtDate(plan.data.intended_date) : ""} · {list.reduce((a, l) => a + l.metres, 0)} m · <Link to={`/sessions/${id}`}>Open plan</Link></p></div>
      {!list.length && <p className="dim">This plan has no set lines.</p>}
      <div className="mm-tag-lines">
        {list.map(l => {
          const k = l.line_path.join("."), cur = draft[k] ?? l.tags;
          const changed = !l.confirmed || cur.slice().sort().join() !== l.tags.slice().sort().join();
          const head = l.heading !== lastHead ? l.heading : undefined; lastHead = l.heading;
          return (
            <div key={k}>
              {head && <h3 className="mm-tag-head">{head}</h3>}
              <article className={"card mm-tag-line" + (l.confirmed && !changed ? " ok" : "")}>
                <div className="mm-tag-text"><span className="pre">{l.text}</span>
                  <span className="dim">{l.metres ? ` · ${l.metres} m` : " · no distance"}{l.mult > 1 ? ` (×${l.mult} repeat)` : ""}{l.strokes.length ? ` · ${l.strokes.join(", ")}` : ""}</span></div>
                <div className="mm-chips">
                  {WORK_TAGS.map(([t, label]) => (
                    <button key={t} type="button" disabled={!canTag} aria-pressed={cur.includes(t)}
                      className={"chip-btn" + (cur.includes(t) ? " on" : "") + (!l.confirmed && l.auto_tags.includes(t) ? " suggested" : "")}
                      onClick={() => toggle(l, t)}>{label}</button>
                  ))}
                </div>
                <div className="mm-tag-foot dim">{l.confirmed ? (changed ? "Changed — not saved" : "Confirmed") : `Suggested: ${l.auto_tags.map(t => WORK_LABEL[t] ?? t).join(", ") || "none (counts as untagged swim)"}`}</div>
              </article>
            </div>
          );
        })}
      </div>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role="status">{msg.text}</p>}
      {canTag && !!list.length && <div className="done-actions"><button className="btn primary" onClick={() => save()}>Confirm all lines</button></div>}
    </>
  );
}
