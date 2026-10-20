import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import { fmtDayLong, isoMonday, loadPlan, loadPlans, loadSeasonCtx, loadSquadsWithIds, microFor, type Plan } from "../../lib/plans";
import { sharePlanPdf } from "../../lib/planPdf";
import { todayLocal } from "../../lib/util";
import { FocusTags, MicroLine } from "../../components/planParts";

// Shared queries for the Session plans screens.
export const usePlans = (club: string | null) => useQuery({ queryKey: ["plans", club], enabled: !!club, queryFn: () => loadPlans(club!) });
export const usePlanSquads = (club: string | null) => useQuery({ queryKey: ["plan_squads", club], enabled: !!club, staleTime: 10 * 60 * 1000, queryFn: () => loadSquadsWithIds(club!) });
export const useSeasonCtx = (club: string | null) => useQuery({ queryKey: ["season_ctx", club], enabled: !!club, staleTime: 60 * 1000, queryFn: () => loadSeasonCtx(club!) });

export async function planPdf(plan: Plan, squadName: string | undefined) {
  const full = (await loadPlan(plan.id)) ?? plan; // the list doesn't carry notes
  await sharePlanPdf(full, squadName);
}

export function NoPlanAccess() {
  return <><div className="page-head"><h1>Session plans</h1></div><p className="notice warn">Your role doesn't have access to session plans.</p></>;
}

export function PlanList() {
  const { access } = useAuth();
  const level = sectionLevel(access, "plans");
  const { club } = useClub();
  const [squad, setSquad] = useState("");
  const [when, setWhen] = useState<"upcoming" | "all">("upcoming");
  const [q, setQ] = useState("");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const plans = usePlans(club);
  const squads = usePlanSquads(club);
  const season = useSeasonCtx(club);
  const squadName = useMemo(() => {
    const m = new Map((squads.data ?? []).map(s => [s.id, s.name]));
    return (id: string | null) => (id && m.get(id)) || "";
  }, [squads.data]);

  if (level === "N") return <NoPlanAccess />;

  const weekStart = isoMonday(todayLocal().date);
  const t = q.trim().toLowerCase();
  const shown = (plans.data ?? []).filter(p =>
    (!squad || p.squad_id === squad) &&
    !(when === "upcoming" && p.intended_date && p.intended_date < weekStart) &&
    (!t || [p.title, p.squad_scope, squadName(p.squad_id), p.pool_size].some(x => (x || "").toLowerCase().includes(t)))
  ).sort((a, b) =>
    (a.intended_date || "9999").localeCompare(b.intended_date || "9999") ||
    squadName(a.squad_id).localeCompare(squadName(b.squad_id)) || (a.title || "").localeCompare(b.title || ""));

  const groups: { key: string; label: string; plans: Plan[] }[] = [];
  for (const p of shown) {
    const key = p.intended_date || "none";
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, label: p.intended_date ? fmtDayLong(p.intended_date) : "No date set", plans: [] });
    groups[groups.length - 1].plans.push(p);
  }
  const filtered = !!squad || when === "upcoming" || !!t;

  const pdf = async (p: Plan) => {
    setPdfBusy(p.id);
    try { await planPdf(p, squadName(p.squad_id) || undefined); } catch (e) { console.error(e); }
    finally { setPdfBusy(null); }
  };

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">📋</span> Session plans</h1>
          <p className="dim">Plans by squad and date, with that week's micro-cycle</p>
        </div>
        {canEdit(level) && <Link className="btn primary" to="/sessions/new">+ New plan</Link>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <section className="card">
        <h2 className="card-title">Filters</h2>
        <ClubPicker />
        <div className="field-pair">
          <div>
            <label htmlFor="pl-squad">Squad</label>
            <select id="pl-squad" value={squad} onChange={e => setSquad(e.target.value)}>
              <option value="">All squads</option>
              {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pl-when">Dates</label>
            <select id="pl-when" value={when} onChange={e => setWhen(e.target.value as "upcoming" | "all")}>
              <option value="upcoming">This week onwards</option>
              <option value="all">All dates</option>
            </select>
          </div>
        </div>
        <label htmlFor="pl-search">Search</label>
        <input id="pl-search" type="search" placeholder="Search plans by title or tag…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
      </section>

      <section className="card" aria-labelledby="pl-head">
        <h2 id="pl-head" className="card-title">Plans {plans.data && <span className="dim">({shown.length})</span>}</h2>
        {plans.isLoading && <p className="dim">Loading plans…</p>}
        {plans.error && <p className="msg error">Couldn't load plans. <button type="button" className="link-btn" onClick={() => plans.refetch()}>Try again</button></p>}
        {plans.data && !shown.length && (
          <p className="dim">{filtered ? "No plans match. Try “All dates” or another squad" : "No plans yet"}{canEdit(level) ? ", or tap “+ New plan”." : "."}</p>
        )}
        {groups.map(g => (
          <div key={g.key} className="plan-group">
            <h3 className="plan-group-head">{g.label}</h3>
            {g.plans.map(p => {
              const ctx = microFor(season.data, p.squad_id, p.intended_date, p.micro_session_id);
              const sq = squadName(p.squad_id);
              return (
                <article key={p.id} className="plan-item">
                  <div className="plan-item-top">
                    <Link className="plan-item-title" to={`/sessions/${p.id}`}>{p.title}</Link>
                    <button type="button" className="btn small" onClick={() => pdf(p)} disabled={pdfBusy === p.id} aria-label={`PDF of ${p.title}`}>
                      {pdfBusy === p.id ? "…" : "PDF"}
                    </button>
                  </div>
                  <div className="plan-tags">
                    {sq ? <span className="plan-tag">{sq}</span> : <span className="plan-tag none">No squad linked</span>}
                    {p.squad_scope && <span className="plan-tag">{p.squad_scope}</span>}
                    {p.pool_size && <span className="plan-tag">{p.pool_size}</span>}
                    {!!p.total_distance_m && <span className="plan-tag dist">{p.total_distance_m.toLocaleString("en-GB")}m</span>}
                    <FocusTags skills={p.stroke_skills} zone={p.training_zone} />
                  </div>
                  {ctx && <MicroLine ctx={ctx} label="Stroke" />}
                </article>
              );
            })}
          </div>
        ))}
      </section>
    </>
  );
}
