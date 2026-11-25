import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import {
  AwardIndex, awardsMissing, loadAwardData, loadAwardSquads, loadAwardSwimmers, saveMarks, setActivated,
  type AwardLevel, type MarkChange
} from "../../lib/awards";
import { todayLocal } from "../../lib/util";
import { AwardBar, AwardBlock, AwardToken, AwardTokens, CritDot, ScalePicker, StatusKey, useAwardRef } from "../../components/awardParts";

// Club Awards — coach assessment. Spec: claude/specs/club-awards.md
//   /awards                                    pick a squad
//   /awards/squad/:sq                          squad summary; path 1 (by award) or path 2 (by swimmer)
//   /awards/squad/:sq/award/:aw                path 1: swimmers' % for the award + squad % per criterion
//   /awards/squad/:sq/award/:aw/c/:outcome     path 1: mark every swimmer still outstanding
//   /awards/squad/:sq/swimmer/:sw?award=n      path 2: mark every criterion for one swimmer
// Save writes the marks and returns to the previous screen.

function useAwardsAccess() {
  const { access } = useAuth();
  const lv = sectionLevel(access, "awards");
  return { lv, edit: canEdit(lv) };
}

/** Squad, its swimmers, the reference list and their marks, in one hook. */
function useSquadAwards(squadId: string | undefined) {
  const { clubId } = useClub();
  const ref = useAwardRef();
  const squads = useQuery({ queryKey: ["aw_squads", clubId], enabled: !!clubId, queryFn: () => loadAwardSquads(clubId!) });
  const swimmers = useQuery({ queryKey: ["aw_swimmers", clubId, squadId], enabled: !!clubId && !!squadId, queryFn: () => loadAwardSwimmers(clubId!, squadId) });
  const ids = useMemo(() => (swimmers.data ?? []).map(s => s.id), [swimmers.data]);
  const data = useQuery({ queryKey: ["award_data", clubId, "squad", squadId, ids.join(",")], enabled: !!clubId && !!swimmers.data, queryFn: () => loadAwardData(clubId!, ids) });
  const index = ref.data && data.data ? new AwardIndex(ref.data, data.data) : null;
  const squad = squads.data?.find(s => s.id === squadId) ?? null;
  const error = ref.error || squads.error || swimmers.error || data.error;
  return { clubId, ref, squad, swimmers: swimmers.data ?? [], ids, index, error, loading: !index && !error };
}

function Status({ error, loading }: { error: unknown; loading: boolean }) {
  if (awardsMissing(error)) return <p className="notice warn">Club Awards need the latest database update (migration <code>club_awards</code>) before they can be used.</p>;
  if (error) return <p className="msg error">Couldn't load Club Awards: {(error as Error).message}</p>;
  if (loading) return <p className="dim">Loading…</p>;
  return null;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ["award_data"] }); qc.invalidateQueries({ queryKey: ["award_progress"] }); };
}


// ---------- 1. Pick a squad ----------
export function AwardsHome() {
  const { clubId } = useClub();
  const { lv } = useAwardsAccess();
  const squads = useQuery({ queryKey: ["aw_squads", clubId], enabled: !!clubId, queryFn: () => loadAwardSquads(clubId!) });
  const swimmers = useQuery({ queryKey: ["aw_swimmers", clubId, undefined], enabled: !!clubId, queryFn: () => loadAwardSwimmers(clubId!) });
  const count = (id: string) => (swimmers.data ?? []).filter(s => s.squad_id === id).length;
  if (lv === "N") return <><div className="page-head"><h1>Club Awards</h1></div><p className="notice warn">Your role doesn't have access to Club Awards.</p></>;
  return (
    <>
      <div className="page-head">
        <h1>🎖️ Club Awards</h1>
        <p className="dim">Swim England Swimming Club Awards 1–6. Choose a squad to assess.</p>
      </div>
      <ClubPicker />
      {LEVEL_NOTE[lv] && <p className="notice">{LEVEL_NOTE[lv]}</p>}
      {squads.error && <p className="msg error">Couldn't load squads.</p>}
      {!squads.data && !squads.error && <p className="dim">Loading…</p>}
      <div className="aw-squads">
        {squads.data?.map(s => {
          const n = count(s.id);
          return (
            <Link key={s.id} to={`/awards/squad/${s.id}`} className={"aw-squad" + (n ? "" : " empty")}>
              <strong>{s.name}</strong><span className="dim">{n} swimmer{n === 1 ? "" : "s"}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

// ---------- 2. Squad summary ----------
export function SquadAwards() {
  const { sq } = useParams();
  const [params, setParams] = useSearchParams();
  const path = params.get("by") === "swimmer" ? "swimmer" : "award";
  const { squad, swimmers, ids, index, error, loading } = useSquadAwards(sq);
  return (
    <>
      <p className="crumb"><Link to="/awards">‹ Club Awards</Link></p>
      <div className="page-head"><h1>{squad?.name ?? "Squad"} · Club Awards</h1><p className="dim">{swimmers.length} swimmers. Squad figures are the average across every swimmer in the squad.</p></div>
      <Status error={error} loading={loading} />
      {index && (
        <>
          <section className="card">
            <h2 className="card-title">Squad completion</h2>
            {index.ref.levels.map(l => {
              const active = index.countWith(ids, id => index.active(id, l.award));
              const got = index.countWith(ids, id => index.achieved(id, l.award));
              const pct = index.squadAwardPct(ids, l.award);
              return (
                <div key={l.award} className="aw-sum-row">
                  <span className="aw-num" style={{ background: l.colour }}>{l.award}</span>
                  <div className="aw-sum-main">
                    <div className="aw-sum-top"><strong>{l.title}</strong><span className="aw-pct">{pct}%</span></div>
                    <AwardBar level={l} pct={pct} />
                    <span className="dim small">{active} active · {got} achieved</span>
                  </div>
                </div>
              );
            })}
          </section>

          <div className="seg seg-2 aw-paths" role="tablist" aria-label="Assess by">
            <button type="button" role="tab" aria-selected={path === "award"} className={"seg-btn" + (path === "award" ? " on" : "")} onClick={() => setParams({}, { replace: true })}>By award criteria</button>
            <button type="button" role="tab" aria-selected={path === "swimmer"} className={"seg-btn" + (path === "swimmer" ? " on" : "")} onClick={() => setParams({ by: "swimmer" }, { replace: true })}>By swimmer</button>
          </div>

          {path === "award" ? (
            <div className="aw-grid">
              {index.ref.levels.map(l => (
                <Link key={l.award} to={`/awards/squad/${sq}/award/${l.award}`} className="aw-tile" style={{ borderColor: l.colour }}>
                  <AwardToken level={l} size={38} title={l.title} />
                  <strong>{l.title.replace("Swimming Club ", "")}</strong>
                  <span className="dim small">{(index.ref.byAward.get(l.award) ?? []).length} criteria · {index.squadAwardPct(ids, l.award)}%</span>
                </Link>
              ))}
            </div>
          ) : (
            <section className="card">
              {swimmers.length === 0 && <p className="dim">No swimmers in this squad.</p>}
              <ul className="aw-swimmers">
                {swimmers.map(s => (
                  <li key={s.id}>
                    <Link to={`/awards/squad/${sq}/swimmer/${s.id}`}>
                      <span className="aw-sw-name">{s.full_name}<AwardTokens index={index} swimmerId={s.id} /></span>
                      <span className="aw-minibars">
                        {index.ref.levels.map(l => (
                          <span key={l.award} title={`${l.title}: ${index.awardPct(s.id, l.award)}%`} className={index.active(s.id, l.award) ? "on" : ""} style={index.active(s.id, l.award) ? { outlineColor: l.colour } : undefined}>
                            <AwardBar level={l} pct={index.awardPct(s.id, l.award)} />
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

// ---------- 3. Path 1: one award for the squad ----------
export function AwardSquadDetail() {
  const { sq, aw } = useParams();
  const award = Number(aw);
  const { clubId, squad, swimmers, ids, index, error, loading } = useSquadAwards(sq);
  const { edit } = useAwardsAccess();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const level = index?.ref.levels.find(l => l.award === award);
  const outcomes = index?.ref.byAward.get(award) ?? [];
  const inactive = index ? ids.filter(id => !index.active(id, award)) : [];

  const activateAll = async () => {
    setBusy(true); setMsg(null);
    try { await setActivated(clubId!, inactive, award, true); invalidate(); setMsg(`Activated for ${inactive.length} swimmer(s).`); }
    catch (e) { setMsg("Couldn't activate: " + (e as Error).message); }
    setBusy(false);
  };

  // Every criterion of this award at 100% for every swimmer in the squad (only rows not already 100%).
  const outstanding: MarkChange[] = index
    ? ids.flatMap(id => outcomes.filter(o => index.score(id, o.outcome_id) !== 5).map(o => ({ swimmer_id: id, outcome_id: o.outcome_id, score: 5 })))
    : [];
  const completeAll = async () => {
    if (!level || !outstanding.length) return;
    const who = new Set(outstanding.map(c => c.swimmer_id)).size;
    if (!confirm(`Mark all ${outcomes.length} criteria of ${level.title} as complete (100%) for ${who} swimmer(s) in ${squad?.name ?? "this squad"}?\n\n${outstanding.length} marks will be saved and the award will be achieved for each of them.`)) return;
    setBusy(true); setMsg(null);
    try { await saveMarks(clubId!, outstanding, todayLocal().date); invalidate(); setMsg(`Saved ${outstanding.length} marks. ${level.title} is complete for the squad.`); }
    catch (e) { setMsg("Couldn't save: " + (e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <p className="crumb"><Link to={`/awards/squad/${sq}`}>‹ {squad?.name ?? "Squad"}</Link></p>
      <Status error={error} loading={loading} />
      {index && level && (
        <>
          <div className="page-head row">
            <div><h1>{level.title}</h1><p className="dim">{squad?.name} · squad {index.squadAwardPct(ids, award)}%</p></div>
            <AwardToken level={level} size={44} title={level.title} />
          </div>
          <section className="card aw-framed" style={{ borderColor: level.colour }}>
            <div className="card-head top">
              <h2 className="card-title">Swimmers</h2>
              {edit && inactive.length > 0 && <button type="button" className="btn small" disabled={busy} onClick={activateAll}>Activate for all ({inactive.length})</button>}
            </div>
            {msg && <p className="msg" role="status">{msg}</p>}
            <ul className="aw-swimmers compact">
              {swimmers.map(s => {
                const pct = index.awardPct(s.id, award);
                return (
                  <li key={s.id}>
                    <Link to={`/awards/squad/${sq}/swimmer/${s.id}?award=${award}`}>
                      <span className="aw-sw-name">{s.full_name}{index.achieved(s.id, award) && <AwardToken level={level} size={22} />}</span>
                      <span className="aw-sw-bar"><AwardBar level={level} pct={pct} /></span>
                      <span className="aw-pct">{pct}%</span>
                      {!index.active(s.id, award) && <span className="chip">not active</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="card aw-framed" style={{ borderColor: level.colour }}>
            <div className="card-head top">
              <h2 className="card-title">Criteria <span className="dim">(squad completion — tap to assess)</span></h2>
              {edit && outstanding.length > 0 && <button type="button" className="btn small aw-allbtn" disabled={busy} onClick={completeAll}>✓ All complete</button>}
            </div>
            <ul className="aw-crit linked">
              {outcomes.map(o => {
                const pct = index.squadCritPct(ids, o.outcome_id);
                const done = index.countWith(ids, id => index.score(id, o.outcome_id) === 5);
                return (
                  <li key={o.outcome_id}>
                    <Link to={`/awards/squad/${sq}/award/${award}/c/${o.outcome_id}`}>
                      <CritDot pct={ids.some(id => index.score(id, o.outcome_id) != null) ? pct : null} />
                      <span className="aw-crit-text"><span className="aw-area">{o.award}.{o.outcome_no} · {o.area}</span>{o.outcome}</span>
                      <span className="aw-crit-pct">{pct}%<span className="cell-sub">{done}/{ids.length} done</span></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <StatusKey />
          </section>
        </>
      )}
    </>
  );
}

// ---------- 4. Path 1: mark one criterion across the squad ----------
export function CriterionMark() {
  const { sq, aw, outcome } = useParams();
  const award = Number(aw);
  const navigate = useNavigate();
  const { clubId, squad, swimmers, index, error, loading } = useSquadAwards(sq);
  const { edit, lv } = useAwardsAccess();
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const level = index?.ref.levels.find(l => l.award === award);
  const o = index?.ref.outcomes.find(x => x.outcome_id === outcome);

  // "Outstanding" is fixed when the screen opens, so a swimmer marked 100% stays on the list until saved.
  const [outstanding, setOutstanding] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (index && o && !outstanding) setOutstanding(new Set(swimmers.filter(s => index.score(s.id, o.outcome_id) !== 5).map(s => s.id)));
  }, [index, o, swimmers, outstanding]);
  const list = swimmers.filter(s => showAll || outstanding?.has(s.id));
  const changes = Object.keys(draft).length;
  const value = (id: string) => (id in draft ? draft[id] : index?.score(id, outcome!) ?? null);

  const save = async () => {
    if (!o) return;
    setSaving(true); setErr(null);
    const rows: MarkChange[] = Object.entries(draft).map(([swimmer_id, score]) => ({ swimmer_id, outcome_id: o.outcome_id, score }));
    try { await saveMarks(clubId!, rows, todayLocal().date); invalidate(); navigate(-1); }
    catch (e) { setErr("Couldn't save: " + (e as Error).message); setSaving(false); }
  };

  return (
    <>
      <p className="crumb"><Link to={`/awards/squad/${sq}/award/${award}`}>‹ {level?.title ?? "Award"}</Link></p>
      <Status error={error} loading={loading} />
      {index && level && o && (
        <>
          <section className="card aw-framed" style={{ borderColor: level.colour }}>
            <span className="aw-area">{level.title} · {o.award}.{o.outcome_no} · {o.area}</span>
            <h1 className="aw-crit-h">{o.outcome}</h1>
            <p className="dim small">{squad?.name}. Each step is 20% of this criterion; tap a selected step again to clear it.</p>
          </section>
          {!edit && <p className="notice warn">{LEVEL_NOTE[lv] ?? "Read only."}</p>}
          {edit && list.length > 0 && (
            <div className="aw-bulk">
              <button type="button" className="btn small aw-allbtn" disabled={saving || list.every(s => value(s.id) === 5)}
                onClick={() => setDraft(d => { const n = { ...d }; for (const s of list) { if (index.score(s.id, o.outcome_id) === 5) delete n[s.id]; else n[s.id] = 5; } return n; })}>
                ✓ All complete (100%)
              </button>
              {changes > 0 && <button type="button" className="btn small" disabled={saving} onClick={() => setDraft({})}>Reset</button>}
              <span className="dim small">Then adjust anyone who isn't there yet, and Save.</span>
            </div>
          )}
          <div className="aw-toolbar">
            <span className="dim">{list.length} {showAll ? "swimmers" : "outstanding"}</span>
            <label className="aw-check"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show completed too</label>
          </div>
          {list.length === 0 && <p className="notice">Every swimmer in the squad has completed this criterion.</p>}
          <ul className="aw-mark-list">
            {list.map(s => (
              <li key={s.id} className={s.id in draft ? "changed" : ""}>
                <div className="aw-mark-name"><CritDot score={value(s.id)} /><strong>{s.full_name}</strong>{!index.active(s.id, award) && <span className="chip">not active</span>}</div>
                {edit
                  ? <ScalePicker value={value(s.id)} colour={level.colour} name={s.full_name}
                      onChange={v => setDraft(d => { const n = { ...d }; if (v === (index.score(s.id, o.outcome_id) ?? null)) delete n[s.id]; else n[s.id] = v; return n; })} />
                  : <span className="aw-crit-pct">{value(s.id) == null ? "–" : `${value(s.id)! * 20}%`}</span>}
              </li>
            ))}
          </ul>
          {edit && (
            <div className="aw-savebar">
              {err && <p className="msg error" role="alert">{err}</p>}
              <button type="button" className="btn" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
              <button type="button" className="btn primary" onClick={save} disabled={saving || !changes}>{saving ? "Saving…" : `Save${changes ? ` (${changes})` : ""}`}</button>
            </div>
          )}
          <p className="hint">Marking a swimmer activates this award for them. When every criterion is at 100% the award is achieved and its token appears on their profile.</p>
        </>
      )}
    </>
  );
}

// ---------- 5. Path 2: one swimmer, every criterion ----------
export function SwimmerMark() {
  const { sq, sw } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { clubId, squad, swimmers, index, error, loading } = useSquadAwards(sq);
  const { edit, lv } = useAwardsAccess();
  const invalidate = useInvalidate();
  const swimmer = swimmers.find(s => s.id === sw);
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Default award: the lowest active one not yet achieved, else Award 1.
  const award = Number(params.get("award")) || (index && sw
    ? index.ref.levels.find(l => index.active(sw, l.award) && !index.achieved(sw, l.award))?.award ?? 1 : 1);
  const level: AwardLevel | undefined = index?.ref.levels.find(l => l.award === award);
  const outcomes = index?.ref.byAward.get(award) ?? [];
  const value = (oid: string) => (oid in draft ? draft[oid] : index?.score(sw!, oid) ?? null);
  const changes = Object.keys(draft).length;

  const pickAward = (n: number) => {
    if (changes && !confirm("Switch award? Unsaved marks on this award will be lost.")) return;
    setDraft({}); setParams({ award: String(n) }, { replace: true });
  };
  const toggleActive = async (on: boolean) => {
    setErr(null);
    try { await setActivated(clubId!, [sw!], award, on); invalidate(); }
    catch (e) { setErr("Couldn't change: " + (e as Error).message); }
  };
  const save = async () => {
    setSaving(true); setErr(null);
    const rows: MarkChange[] = Object.entries(draft).map(([outcome_id, score]) => ({ swimmer_id: sw!, outcome_id, score }));
    try { await saveMarks(clubId!, rows, todayLocal().date); invalidate(); navigate(-1); }
    catch (e) { setErr("Couldn't save: " + (e as Error).message); setSaving(false); }
  };
  // Live percentage including unsaved marks.
  const livePct = outcomes.length ? Math.round(outcomes.reduce((t, o) => t + (value(o.outcome_id) ?? 0) * 20, 0) / outcomes.length) : 0;

  return (
    <>
      <p className="crumb"><Link to={`/awards/squad/${sq}?by=swimmer`}>‹ {squad?.name ?? "Squad"}</Link></p>
      <Status error={error} loading={loading} />
      {index && !swimmer && !loading && <p className="notice warn">This swimmer isn't in the squad, or your role can't see them.</p>}
      {index && swimmer && level && (
        <>
          <div className="page-head row">
            <div><h1>{swimmer.full_name}</h1><p className="dim">{squad?.name} · <Link to={`/swimmers/${swimmer.id}`}>profile</Link></p></div>
            <AwardTokens index={index} swimmerId={swimmer.id} />
          </div>
          <div className="aw-award-tabs" role="tablist" aria-label="Award">
            {index.ref.levels.map(l => (
              <button key={l.award} type="button" role="tab" aria-selected={l.award === award}
                className={"aw-award-tab" + (l.award === award ? " on" : "")}
                style={{ borderColor: l.colour, background: l.award === award ? l.colour : undefined }}
                onClick={() => pickAward(l.award)}>
                <span>{l.award}</span><small>{index.awardPct(swimmer.id, l.award)}%</small>
              </button>
            ))}
          </div>
          <AwardBlock index={index} swimmerId={swimmer.id} level={level} open>
            <div className="aw-live"><span className="dim">With unsaved marks:</span> <strong>{livePct}%</strong></div>
            {edit && (
              <label className="aw-check">
                <input type="checkbox" checked={index.active(swimmer.id, award)} onChange={e => toggleActive(e.target.checked)} /> Award activated for this swimmer
              </label>
            )}
          </AwardBlock>
          {!edit && <p className="notice warn">{LEVEL_NOTE[lv] ?? "Read only."}</p>}
          {edit && outcomes.length > 0 && (
            <div className="aw-bulk">
              <button type="button" className="btn small aw-allbtn" disabled={saving || outcomes.every(o => value(o.outcome_id) === 5)}
                onClick={() => setDraft(d => { const n = { ...d }; for (const o of outcomes) { if (index.score(swimmer.id, o.outcome_id) === 5) delete n[o.outcome_id]; else n[o.outcome_id] = 5; } return n; })}>
                ✓ All complete (100%)
              </button>
              {changes > 0 && <button type="button" className="btn small" disabled={saving} onClick={() => setDraft({})}>Reset</button>}
              <span className="dim small">Then adjust any criterion that isn't there yet, and Save.</span>
            </div>
          )}
          <ul className="aw-mark-list">
            {outcomes.map(o => (
              <li key={o.outcome_id} className={o.outcome_id in draft ? "changed" : ""} style={index.active(swimmer.id, award) ? { borderLeftColor: level.colour } : undefined}>
                <div className="aw-mark-name"><CritDot score={value(o.outcome_id)} /><span className="aw-crit-text"><span className="aw-area">{o.award}.{o.outcome_no} · {o.area}</span>{o.outcome}</span></div>
                {edit
                  ? <ScalePicker value={value(o.outcome_id)} colour={level.colour} name={`${o.award}.${o.outcome_no}`}
                      onChange={v => setDraft(d => { const n = { ...d }; if (v === (index.score(swimmer.id, o.outcome_id) ?? null)) delete n[o.outcome_id]; else n[o.outcome_id] = v; return n; })} />
                  : <span className="aw-crit-pct">{value(o.outcome_id) == null ? "–" : `${value(o.outcome_id)! * 20}%`}</span>}
              </li>
            ))}
          </ul>
          {edit && (
            <div className="aw-savebar">
              {err && <p className="msg error" role="alert">{err}</p>}
              <button type="button" className="btn" onClick={() => navigate(-1)} disabled={saving}>Cancel</button>
              <button type="button" className="btn primary" onClick={save} disabled={saving || !changes}>{saving ? "Saving…" : `Save${changes ? ` (${changes})` : ""}`}</button>
            </div>
          )}
          <StatusKey />
        </>
      )}
    </>
  );
}
