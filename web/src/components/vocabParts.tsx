import { useQuery } from "@tanstack/react-query";
import { canReview, loadReviewQueue, loadTargets, loadTermTargets, loadTermUsage, TARGET_GROUPS, type Target } from "../lib/vocab";
import { isoAdd, todayLocal } from "../lib/util";
import { usePlanSquads } from "../pages/plans/PlanList";

// Shared pieces for the club vocabulary (A-154): development-target picker, usage from plans,
// and whether the signed-in user is the club's reviewer (head coach, club admin, superadmin).

export const useTargets = () => useQuery({ queryKey: ["dev_targets"], staleTime: 60 * 60 * 1000, queryFn: loadTargets });
export const useTermTargets = (termIds: string[]) =>
  useQuery({ queryKey: ["term_targets", termIds.slice().sort().join(",")], enabled: termIds.length > 0, queryFn: () => loadTermTargets(termIds) });
export const useCanReview = (club: string | null) =>
  useQuery({ queryKey: ["vocab_can_review", club], enabled: !!club, staleTime: 10 * 60 * 1000, queryFn: () => canReview(club!) });
export const useReviewQueue = (club: string | null, enabled: boolean) =>
  useQuery({ queryKey: ["vocab_review", club], enabled: !!club && enabled, queryFn: () => loadReviewQueue(club!) });

type Picks = Record<string, "primary" | "secondary">;

/** Tap a target once for "main aim", again for "also develops", a third time to clear. */
export function TargetPicker({ value, onChange, disabled }: { value: Picks; onChange: (v: Picks) => void; disabled?: boolean }) {
  const targets = useTargets();
  if (targets.isLoading) return <p className="dim">Loading…</p>;
  if (targets.error) return <p className="msg error">Couldn't load the development targets.</p>;
  const cycle = (t: Target) => {
    const cur = value[t.id];
    const next = { ...value };
    if (!cur) next[t.id] = "primary"; else if (cur === "primary") next[t.id] = "secondary"; else delete next[t.id];
    onChange(next);
  };
  return (
    <div className="target-picker">
      {TARGET_GROUPS.map(([g, label]) => {
        const list = (targets.data ?? []).filter(t => t.target_group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="target-group">
            <h4 className="target-group-title">{label}</h4>
            <div className="chip-row tight" role="group" aria-label={label}>
              {list.map(t => {
                const w = value[t.id];
                return (
                  <button key={t.id} type="button" disabled={disabled} className={"filter-chip target-chip" + (w ? " " + w : "")}
                    aria-pressed={!!w} aria-label={`${t.name}${w === "primary" ? ", main aim" : w === "secondary" ? ", also develops" : ""}`} onClick={() => cycle(t)}>
                    {t.name}{w === "secondary" ? " ·" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="hint">Tap once for the main aim (solid), again for "also develops" (outlined), again to clear.</p>
    </div>
  );
}

/** Read-only list of what an entry develops. */
export function TargetList({ termId }: { termId: string | undefined }) {
  const targets = useTargets();
  const tt = useTermTargets(termId ? [termId] : []);
  if (!termId) return null;
  const byId = new Map((targets.data ?? []).map(t => [t.id, t]));
  const rows = (tt.data ?? []).map(r => ({ ...r, t: byId.get(r.target_id) })).filter(r => r.t)
    .sort((a, b) => (a.weight === b.weight ? 0 : a.weight === "primary" ? -1 : 1));
  return (
    <>
      <h3 className="di-sub">What it develops</h3>
      {tt.isLoading ? <p className="dim">Loading…</p>
        : !rows.length ? <p className="dim">Not tagged yet.</p>
        : <div className="chip-row tight">{rows.map(r => (
            <span key={r.target_id} className={"chip target " + r.weight} title={r.weight === "primary" ? "Main aim" : "Also develops"}>
              {r.t!.name}{!r.confirmed && r.suggested_by === "claude" ? " (suggested)" : ""}
            </span>
          ))}</div>}
    </>
  );
}

/** How much an entry has been used in dated session plans: last 12 weeks, by squad. */
export function TermUsageBlock({ termId, club }: { termId: string | undefined; club: string | null }) {
  const from = isoAdd(todayLocal().date, -84);
  const usage = useQuery({ queryKey: ["term_usage", termId, from], enabled: !!termId, queryFn: () => loadTermUsage(termId!, from) });
  const squads = usePlanSquads(club);
  if (!termId) return null;
  const name = new Map((squads.data ?? []).map(s => [s.id, s.name]));
  const u = usage.data;
  return (
    <>
      <h3 className="di-sub">Used in session plans (last 12 weeks)</h3>
      {usage.isLoading ? <p className="dim">Loading…</p>
        : usage.error ? <p className="msg error">Couldn't load usage.</p>
        : !u || !u.lines ? <p className="dim">Not in any plan in the last 12 weeks.</p>
        : <>
            <p>{(u.metres / 1000).toFixed(1)} km in {u.plans} plan{u.plans === 1 ? "" : "s"}{u.last ? ` · last ${u.last.split("-").reverse().join("/")}` : ""}</p>
            {u.bySquad.length > 1 && <ul className="di-peri">{u.bySquad.map(s => (
              <li key={s.squad_id ?? "none"}>{s.squad_id ? name.get(s.squad_id) ?? "Squad" : "No squad set"} — {(s.metres / 1000).toFixed(1)} km, {s.plans} plan{s.plans === 1 ? "" : "s"}</li>
            ))}</ul>}
          </>}
    </>
  );
}
