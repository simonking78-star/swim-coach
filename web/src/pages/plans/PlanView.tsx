import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { loadPlan, microFor } from "../../lib/plans";
import { sharePlanPdf } from "../../lib/planPdf";
import { fmtDate } from "../../lib/util";
import { FocusTags, MicroLine, PlanBody } from "../../components/planParts";
import { DrillInfoModal } from "../../components/drillParts";
import { NoPlanAccess, usePlanSquads, useSeasonCtx } from "./PlanList";

const BACK: Record<string, string> = { "/timetables": "Timetables", "/season": "Season planner" };
/** Where a plan was opened from (Timetables week plan, Season planner), else the plan list. */
export const backLink = (from?: string) => (from && BACK[from] ? { to: from, label: BACK[from] } : { to: "/sessions", label: "Session plans" });

export function PlanView() {
  const { id } = useParams();
  const { access } = useAuth();
  const level = sectionLevel(access, "plans");
  const plan = useQuery({ queryKey: ["plan", id], enabled: !!id, queryFn: () => loadPlan(id!) });
  const club = plan.data?.club ?? null;
  const squads = usePlanSquads(club);
  const season = useSeasonCtx(club);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = backLink((useLocation().state as { from?: string } | null)?.from);

  if (level === "N") return <NoPlanAccess />;
  const crumb = <p className="crumb"><Link to={back.to}>‹ {back.label}</Link></p>;
  if (plan.isLoading) return <>{crumb}<p className="dim">Loading…</p></>;
  if (plan.error || !plan.data) return <>{crumb}<p className="msg error">Couldn't find that plan.</p></>;

  const p = plan.data;
  const sq = (squads.data ?? []).find(s => s.id === p.squad_id)?.name;
  const ctx = microFor(season.data, p.squad_id, p.intended_date, p.micro_session_id);
  const meta = [
    p.intended_date && new Date(p.intended_date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" }) + " " + fmtDate(p.intended_date),
    sq, p.squad_scope, p.pool_size, p.total_distance_m ? p.total_distance_m.toLocaleString("en-GB") + "m" : null
  ].filter(Boolean).join(" · ");

  const pdf = async () => { setBusy(true); try { await sharePlanPdf(p, sq); } catch (e) { console.error(e); } finally { setBusy(false); } };

  return (
    <>
      {crumb}
      <section className="card">
        <div className="card-head top">
          <h1 className="plan-title">{p.title}</h1>
          <div className="btn-row nowrap">
            <button type="button" className="btn small" onClick={pdf} disabled={busy}>{busy ? "Making PDF…" : "PDF"}</button>
            {canEdit(level) && <Link className="btn small" to={`/sessions/${p.id}/edit`} state={{ from: back.to === "/sessions" ? undefined : back.to }}>Edit</Link>}
          </div>
        </div>
        {meta && <p className="dim plan-meta">{meta}</p>}
        <div className="plan-tags"><FocusTags skills={p.stroke_skills} zone={p.training_zone} /></div>
        {ctx && <div className="micro-card"><MicroLine ctx={ctx} /></div>}
        <PlanBody content={p.content || []} onDrill={setDrillId} />
        {p.notes && <p className="pv-note notes">{p.notes}</p>}
      </section>
      <DrillInfoModal drillId={drillId} onClose={() => setDrillId(null)} />
    </>
  );
}
