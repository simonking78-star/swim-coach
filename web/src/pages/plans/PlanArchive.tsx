import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import { authorKey, planAuthors, type Plan } from "../../lib/plans";
import { FocusTags } from "../../components/planParts";
import { NoPlanAccess, planPdf, usePlanSquads, usePlans } from "./PlanList";

// Session plan archive (/sessions/archive), as in the Session Planner app: every plan,
// newest first, by month, filtered by squad, month and author (the coach who wrote it).

const KEEP = "ct.archive.filters";
interface Filters { squad: string; month: string; author: string; q: string }
const readFilters = (): Filters => {
  try { return { squad: "", month: "", author: "", q: "", ...JSON.parse(localStorage.getItem(KEEP) || "{}") }; }
  catch { return { squad: "", month: "", author: "", q: "" }; }
};
const monthName = (k: string) => new Date(k + "-15T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dayName = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function PlanArchive() {
  const { access, session } = useAuth();
  const level = sectionLevel(access, "plans");
  const { club } = useClub();
  const plans = usePlans(club);
  const squads = usePlanSquads(club);
  const [f, setF] = useState<Filters>(readFilters);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const set = (k: keyof Filters, v: string) => setF(x => ({ ...x, [k]: v }));
  useEffect(() => { try { localStorage.setItem(KEEP, JSON.stringify({ ...f, q: "" })); } catch { /* storage unavailable */ } }, [f]);

  const squadName = useMemo(() => {
    const m = new Map((squads.data ?? []).map(s => [s.id, s.name]));
    return (id: string | null) => (id && m.get(id)) || "";
  }, [squads.data]);

  const all = plans.data ?? [];
  const authors = useMemo(() => planAuthors(all, session?.user.id), [all, session?.user.id]);
  const author = authors.some(a => a.key === f.author) ? f.author : "";
  const byAuthor = all.filter(p => !author || authorKey(p) === author);
  const inSquad = byAuthor.filter(p => !f.squad || p.squad_id === f.squad);
  const months = [...new Set(inSquad.map(p => p.intended_date?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse();
  const month = months.includes(f.month) ? f.month : "";
  const t = f.q.trim().toLowerCase();
  const shown = inSquad
    .filter(p => !month || p.intended_date?.startsWith(month))
    .filter(p => !t || [p.title, p.session_focus, p.training_zone, p.coach, squadName(p.squad_id)].some(x => (x || "").toLowerCase().includes(t)))
    .sort((a, b) => (b.intended_date || "").localeCompare(a.intended_date || "") || (a.title || "").localeCompare(b.title || ""));
  const squadsWithPlans = (squads.data ?? []).filter(s => byAuthor.some(p => p.squad_id === s.id));

  const groups: { key: string; label: string; plans: Plan[] }[] = [];
  for (const p of shown) {
    const key = p.intended_date?.slice(0, 7) || "none";
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, label: key === "none" ? "No date set" : monthName(key), plans: [] });
    groups[groups.length - 1].plans.push(p);
  }

  if (level === "N") return <NoPlanAccess />;

  const pdf = async (p: Plan) => {
    setPdfBusy(p.id);
    try { await planPdf(p, squadName(p.squad_id) || undefined); } catch (e) { console.error(e); }
    finally { setPdfBusy(null); }
  };
  const filtered = !!(f.squad || month || author || t);

  return (
    <>
      <p className="crumb"><Link to="/sessions">‹ Session plans</Link></p>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">🗂️</span> Plan archive</h1>
          <p className="dim">Every session plan, newest first — filter by squad, month and author</p>
        </div>
        {canEdit(level) && <Link className="btn primary" to="/sessions/new">+ New plan</Link>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <section className="card filter-bar" aria-labelledby="pa-filters">
        <h2 id="pa-filters" className="card-title filter-title">Filters</h2>
        <ClubPicker />
        <div className="filter-fields">
          <div className="field-pair">
            <div>
              <label htmlFor="pa-squad">Squad</label>
              <select id="pa-squad" value={f.squad} onChange={e => set("squad", e.target.value)}>
                <option value="">All squads</option>
                {squadsWithPlans.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pa-month">Month</label>
              <select id="pa-month" value={month} onChange={e => set("month", e.target.value)}>
                <option value="">All months</option>
                {months.map(k => <option key={k} value={k}>{monthName(k)}</option>)}
              </select>
            </div>
          </div>
          <div className="field-pair">
            <div>
              <label htmlFor="pa-author">Author</label>
              <select id="pa-author" value={author} onChange={e => set("author", e.target.value)}>
                <option value="">All coaches</option>
                {authors.map(a => <option key={a.key} value={a.key}>{a.name}{a.me ? " (me)" : ""} · {a.count}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pa-search">Search</label>
              <input id="pa-search" type="search" placeholder="Title, focus or coach…" autoComplete="off" value={f.q} onChange={e => set("q", e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="pa-head">
        <h2 id="pa-head" className="card-title">Plans {plans.data && <span className="dim">({shown.length})</span>}</h2>
        {plans.isLoading && <p className="dim">Loading plans…</p>}
        {plans.error && <p className="msg error">Couldn't load plans. <button type="button" className="link-btn" onClick={() => plans.refetch()}>Try again</button></p>}
        {plans.data && !shown.length && <p className="dim">{filtered ? "No plans match these filters." : "No plans yet."}</p>}
        {groups.map(g => (
          <div key={g.key}>
            <h3 className="archive-month"><span>{g.label}</span><span className="dim small">{g.plans.length} plan{g.plans.length === 1 ? "" : "s"}</span></h3>
            {g.plans.map(p => {
              const sq = squadName(p.squad_id);
              return (
                <article key={p.id} className="plan-item">
                  <div className="plan-item-top">
                    <Link className="plan-item-title" to={`/sessions/${p.id}`} state={{ from: "/sessions/archive" }}>{p.title || "Untitled"}</Link>
                    <button type="button" className="btn small" onClick={() => pdf(p)} disabled={pdfBusy === p.id} aria-label={`PDF of ${p.title}`}>
                      {pdfBusy === p.id ? "…" : "PDF"}
                    </button>
                  </div>
                  {p.intended_date && <p className="plan-item-when">{dayName(p.intended_date)}{p.session_focus ? ` · ${p.session_focus}` : ""}</p>}
                  <div className="plan-tags">
                    {sq ? <span className="plan-tag">{sq}</span> : <span className="plan-tag none">No squad linked</span>}
                    {p.pool_size && <span className="plan-tag">{p.pool_size}</span>}
                    {!!p.total_distance_m && <span className="plan-tag dist">{p.total_distance_m.toLocaleString("en-GB")}m</span>}
                    <FocusTags skills={p.stroke_skills} zone={p.training_zone} />
                    <span className="plan-tag author">✍️ {p.coach || "Unknown coach"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </section>
    </>
  );
}
