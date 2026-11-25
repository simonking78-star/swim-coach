import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, sectionLevel } from "../../lib/access";
import { sb } from "../../lib/supabase";
import { AwardIndex, awardsMissing, loadAwardData, loadAwardSquads, type AwardLevel } from "../../lib/awards";
import {
  MAX_POINTS, buildSegments, levelOf, rankSwimmers, segmentPosition, segmentSummary,
  type RankRow, type RankSwimmer, type Segment, type SegmentPosition
} from "../../lib/awardStats";
import { AwardBar, AwardToken, CritDot, useAwardRef } from "../../components/awardParts";
import { StatsBack } from "./StatsHub";

// Statistics → Club Awards progression. Spec: claude/specs/club-awards-stats.md
//   ?view=rank      every swimmer ranked by Club Awards progression points
//   ?view=segments  six skill segments, each a short ladder of stages
//   &squad=<id>     squad filter (blank = whole club)   &hide=1  hide completed levels
//   &seg=<key>      segments view: one segment's stages per swimmer
// Phones get cards; from 760px wide the same data is a table.

async function loadRankSwimmers(clubId: string): Promise<RankSwimmer[]> {
  const { data, error } = await sb.from("swimmers").select("id, full_name, squad_id, date_of_birth").eq("club_id", clubId).eq("active", true).order("full_name");
  if (error) throw error;
  return (data ?? []) as RankSwimmer[];
}

export default function AwardsProgress() {
  const { access } = useAuth();
  const st = sectionLevel(access, "stats"), aw = sectionLevel(access, "awards");
  const editAwards = canEdit(aw);
  const { clubId } = useClub();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "segments" ? "segments" : "rank";
  const squadId = params.get("squad") ?? "";
  const hide = params.get("hide") === "1";
  const segKey = params.get("seg") ?? "";
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const blocked = st === "N" || st === "CR" || aw === "N";
  const ref = useAwardRef();
  const squads = useQuery({ queryKey: ["aw_squads", clubId], enabled: !!clubId && !blocked, queryFn: () => loadAwardSquads(clubId!) });
  const swimmers = useQuery({ queryKey: ["aw_rank_swimmers", clubId], enabled: !!clubId && !blocked, queryFn: () => loadRankSwimmers(clubId!) });
  const allIds = useMemo(() => (swimmers.data ?? []).map(s => s.id), [swimmers.data]);
  const data = useQuery({ queryKey: ["award_data", clubId, "club", allIds.join(",")], enabled: !!clubId && !!swimmers.data, queryFn: () => loadAwardData(clubId!, allIds) });
  const index = useMemo(() => (ref.data && data.data ? new AwardIndex(ref.data, data.data) : null), [ref.data, data.data]);
  const squadName = useMemo(() => { const m = new Map((squads.data ?? []).map(s => [s.id, s.name])); return (id: string | null) => (id ? m.get(id) ?? "–" : "No squad"); }, [squads.data]);
  const ranked = useMemo(() => (index && swimmers.data ? rankSwimmers(index, swimmers.data, squadName) : []), [index, swimmers.data, squadName]);
  const segments = useMemo(() => (ref.data ? buildSegments(ref.data.outcomes) : []), [ref.data]);

  if (blocked) return <><StatsBack /><p className="notice warn">Club Awards progression isn't available for your role.</p></>;

  const rows = squadId ? ranked.filter(r => r.squadId === squadId) : ranked;
  const error = ref.error || squads.error || swimmers.error || data.error;
  const squadLabel = squadId ? squadName(squadId) : "Whole club";

  return (
    <>
      <StatsBack />
      <div className="page-head row">
        <div><h1><span aria-hidden="true">🎖️</span> Club Awards progression</h1><p className="dim">Swim England Swimming Club Awards 1–6: a club ranking and six skill segments.</p></div>
        <ClubPicker />
      </div>

      <div className="seg seg-2 ap-tabs" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={view === "rank"} className={"seg-btn" + (view === "rank" ? " on" : "")} onClick={() => set("view", "")}>Ranking</button>
        <button type="button" role="tab" aria-selected={view === "segments"} className={"seg-btn" + (view === "segments" ? " on" : "")} onClick={() => set("view", "segments")}>Skill segments</button>
      </div>

      <div className="ap-filters">
        <label>Squad<select value={squadId} onChange={e => set("squad", e.target.value)}>
          <option value="">All squads</option>
          {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        {view === "segments" && (
          <label>Segment<select value={segKey} onChange={e => set("seg", e.target.value)}>
            <option value="">All segments</option>
            {segments.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select></label>
        )}
        <label className="aw-check ap-hide"><input type="checkbox" checked={hide} onChange={e => set("hide", e.target.checked ? "1" : "")} /> Hide completed levels</label>
      </div>
      {st !== "E" && aw === "SE" && <p className="hint">Ranked among the swimmers your role can see.</p>}

      {awardsMissing(error) ? <p className="notice warn">Club Awards need the latest database update (migration <code>club_awards</code>) first.</p>
        : error ? <p className="msg error">Couldn't load Club Awards: {(error as Error).message}</p>
        : !index ? <p className="dim">Loading…</p>
        : rows.length === 0 ? <p className="dim">No active swimmers in {squadLabel}.</p>
        : view === "rank"
          ? <Ranking rows={rows} levels={index.ref.levels} hide={hide} squadFiltered={!!squadId} editAwards={editAwards} squadLabel={squadLabel} />
          : <Segments index={index} rows={rows} segments={segments} segKey={segKey} hide={hide} editAwards={editAwards} squadLabel={squadLabel} />}
    </>
  );
}

const swimmerLink = (r: RankRow, editAwards: boolean) => (editAwards && r.squadId ? `/awards/squad/${r.squadId}/swimmer/${r.id}` : `/swimmers/${r.id}`);

function Tokens({ r, levels }: { r: RankRow; levels: AwardLevel[] }) {
  const got = levels.filter((_, i) => r.achieved[i]);
  if (!got.length) return null;
  return <span className="ap-tokens">{got.map(l => <AwardToken key={l.award} level={l} size={20} title={`${l.title} achieved`} />)}</span>;
}

// ---------- Ranking ----------
function Ranking({ rows, levels, hide, squadFiltered, editAwards, squadLabel }: {
  rows: RankRow[]; levels: AwardLevel[]; hide: boolean; squadFiltered: boolean; editAwards: boolean; squadLabel: string;
}) {
  // Hiding completed levels drops an award column when every listed swimmer has it, and blanks achieved cells.
  const cols = levels.map((l, i) => ({ l, i })).filter(({ i }) => !hide || rows.some(r => !r.achieved[i]));
  const started = rows.filter(r => r.points > 0).length;
  const tokens = rows.reduce((t, r) => t + r.achieved.filter(Boolean).length, 0);
  const avg = Math.round(rows.reduce((t, r) => t + r.points, 0) / rows.length);
  const rankOf = (r: RankRow) => (squadFiltered ? r.squadRank : r.clubRank);
  const allDone = rows.filter(r => r.working == null).length;
  const list = hide ? rows.filter(r => r.working != null) : rows;

  return (
    <>
      <div className="stat-row">
        <div className="stat"><span className="stat-label">Swimmers</span><span className="stat-value">{rows.length}</span><span className="stat-note">{squadLabel}</span></div>
        <div className="stat"><span className="stat-label">Started</span><span className="stat-value">{started}</span><span className="stat-note">with at least one mark</span></div>
        <div className="stat"><span className="stat-label">Awards achieved</span><span className="stat-value">{tokens}</span><span className="stat-note">{allDone ? `${allDone} with all six` : "tokens across the group"}</span></div>
        <div className="stat"><span className="stat-label">Average points</span><span className="stat-value">{avg}</span><span className="stat-note">of {MAX_POINTS.toLocaleString()}</span></div>
      </div>
      <p className="hint">Points = award number × % complete, added up (Award 1 is worth up to 100, Award 6 up to 600). Equal points share a rank.{squadFiltered ? " Rank is within the squad; club rank alongside." : ""}{hide && allDone ? ` ${allDone} swimmer(s) with all six awards hidden.` : ""}</p>

      {/* Desktop / tablet table */}
      <div className="table-wrap card ap-wide">
        <table className="data ap-table">
          <thead><tr>
            <th className="num">{squadFiltered ? "Squad rank" : "Rank"}</th>
            {squadFiltered && <th className="num">Club</th>}
            <th>Swimmer</th>{!squadFiltered && <th>Squad</th>}<th className="num">Age</th>
            {cols.map(({ l }) => <th key={l.award} className="ap-awcol"><span className="aw-num ap-num" style={{ background: l.colour }}>{l.award}</span></th>)}
            <th>Working on</th><th className="num">Points</th>
          </tr></thead>
          <tbody>{list.map(r => (
            <tr key={r.id}>
              <td className="num"><strong>{rankOf(r)}</strong></td>
              {squadFiltered && <td className="num dim">{r.clubRank}</td>}
              <th scope="row"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link><Tokens r={r} levels={levels} /></th>
              {!squadFiltered && <td>{r.squad}</td>}
              <td className="num">{r.age ?? "–"}</td>
              {cols.map(({ l, i }) => (
                <td key={l.award} className="ap-awcol">
                  {r.achieved[i] ? (hide ? null : <span className="ap-done" style={{ color: l.colour }}>✓</span>)
                    : <><AwardBar level={l} pct={r.pcts[i]} /><span className="ap-pct">{r.pcts[i]}%</span></>}
                </td>
              ))}
              <td>{r.working ? <WorkingOn r={r} levels={levels} /> : <span className="dim">All six</span>}</td>
              <td className="num"><strong>{r.points}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Phone cards */}
      <ol className="ap-cards ap-narrow">
        {list.map(r => (
          <li key={r.id}>
            <div className="ap-card-top">
              <span className="ap-rank">{rankOf(r)}</span>
              <span className="ap-card-name"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link>{r.age != null && <span className="dim"> ({r.age})</span>}
                <span className="dim small ap-sub">{squadFiltered ? `Club rank ${r.clubRank}` : r.squad}</span></span>
              <span className="ap-points"><strong>{r.points}</strong><span className="dim small">pts</span></span>
            </div>
            <Tokens r={r} levels={levels} />
            <div className="ap-mini">
              {cols.map(({ l, i }) => (hide && r.achieved[i]) ? null : (
                <span key={l.award} title={`${l.title}: ${r.achieved[i] ? "achieved" : r.pcts[i] + "%"}`}>
                  <span className="ap-mini-lab">{l.award}</span><AwardBar level={l} pct={r.pcts[i]} />
                </span>
              ))}
            </div>
            {r.working && <p className="small ap-working">Working on <WorkingOn r={r} levels={levels} /></p>}
          </li>
        ))}
      </ol>
    </>
  );
}

function WorkingOn({ r, levels }: { r: RankRow; levels: AwardLevel[] }) {
  const l = levelOf(levels, r.working!);
  if (!l) return null;
  return <span className="ap-working-tag"><span className="aw-num ap-num sm" style={{ background: l.colour }}>{l.award}</span> {r.pcts[levels.indexOf(l)]}%</span>;
}

// ---------- Skill segments ----------
function Segments({ index, rows, segments, segKey, hide, editAwards, squadLabel }: {
  index: AwardIndex; rows: RankRow[]; segments: Segment[]; segKey: string; hide: boolean; editAwards: boolean; squadLabel: string;
}) {
  const ids = rows.map(r => r.id);
  const shown = segKey ? segments.filter(s => s.key === segKey) : segments;
  const people = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const levels = index.ref.levels;
  const pos = useMemo(() => {
    const m = new Map<string, SegmentPosition>();
    for (const r of rows) for (const s of segments) m.set(r.id + "|" + s.key, segmentPosition(index, r.id, s));
    return m;
  }, [index, rows, segments]);
  const P = (id: string, key: string) => pos.get(id + "|" + key)!;

  return (
    <>
      <p className="hint">The 80 award criteria regrouped into six skills. Each skill is a short ladder: one stage for each award it appears in. A stage is <strong>secured</strong> when every criterion in it is at 100%; ⚠ marks an earlier stage left incomplete. {squadLabel}: {rows.length} swimmers.</p>
      <div className="ap-seg-grid">
        {shown.map(s => <SegmentCard key={s.key} seg={s} index={index} ids={ids} levels={levels} hide={hide} />)}
      </div>

      <h2 className="ap-h2">{segKey ? `${shown[0]?.name}: stage by swimmer` : "Where each swimmer is"}</h2>
      {segKey && shown[0] ? <OneSegmentTable seg={shown[0]} people={people} P={P} levels={levels} hide={hide} editAwards={editAwards} />
        : <AllSegmentsTable segments={segments} people={people} P={P} levels={levels} hide={hide} editAwards={editAwards} />}
    </>
  );
}

const stageColour = (levels: AwardLevel[], award: number) => levelOf(levels, award)?.colour ?? "#888";

function SegmentCard({ seg, index, ids, levels, hide }: { seg: Segment; index: AwardIndex; ids: string[]; levels: AwardLevel[]; hide: boolean }) {
  const sum = segmentSummary(index, ids, seg);
  const stages = seg.stages.map((stg, i) => ({ stg, i })).filter(({ i }) => !hide || sum.stageMean[i] < 100);
  return (
    <section className="card ap-seg">
      <div className="ap-seg-head">
        <span className="ap-seg-icon" aria-hidden="true">{seg.icon}</span>
        <div className="ap-seg-title"><strong>{seg.name}</strong><span className="dim small">{seg.outcomes.length} criteria · {seg.stages.length} stages</span></div>
        <span className="aw-pct">{sum.mean}%</span>
      </div>
      <p className="dim small ap-blurb">{seg.blurb}</p>
      <ol className="ap-ladder">
        {stages.length === 0 && <li className="dim small">Every stage complete for this group.</li>}
        {stages.map(({ stg, i }) => {
          const col = stageColour(levels, stg.award);
          return (
            <li key={stg.award}>
              <details>
                <summary>
                  <span className="ap-stage-no" style={{ background: col }} title={`Award ${stg.award}`}>{i + 1}</span>
                  <span className="ap-stage-main">
                    <span className="ap-stage-top"><span className="ap-stage-name">{stg.name}</span><span className="ap-stage-pct">{sum.stageMean[i]}%</span></span>
                    <span className="aw-bar ap-stage-bar"><span style={{ width: `${sum.stageMean[i]}%`, background: col }} /></span>
                    <span className="dim small">Award {stg.award} · {stg.outcomes.length} criteria · {sum.atStage[i]} secured here{i === seg.stages.length - 1 ? " (top)" : ""}</span>
                  </span>
                </summary>
                <ul className="aw-crit">
                  {stg.outcomes.map(o => { const p = index.squadCritPct(ids, o.outcome_id); return (
                    <li key={o.outcome_id}><CritDot pct={p} /><span className="aw-crit-text"><span className="aw-area">{o.area} · {o.outcome_id}</span>{o.outcome}</span><span className="aw-crit-pct">{p}%</span></li>
                  ); })}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
      <Distribution seg={seg} sum={sum} levels={levels} />
    </section>
  );
}

/** Stacked bar: how many swimmers have secured each stage (or none yet). */
function Distribution({ seg, sum, levels }: { seg: Segment; sum: ReturnType<typeof segmentSummary>; levels: AwardLevel[] }) {
  if (!sum.count) return null;
  const parts = [{ label: "Not secured", n: sum.notSecured, colour: "#d5dbe3" },
    ...seg.stages.map((s, i) => ({ label: `Stage ${i + 1}`, n: sum.atStage[i], colour: stageColour(levels, s.award) }))].filter(p => p.n > 0);
  return (
    <div className="ap-dist" aria-label="Swimmers by highest stage secured">
      <div className="ap-dist-bar">{parts.map(p => <span key={p.label} style={{ flexGrow: p.n, background: p.colour }} title={`${p.label}: ${p.n}`} />)}</div>
      <div className="ap-dist-key">{parts.map(p => <span key={p.label}><i style={{ background: p.colour }} />{p.label} {p.n}</span>)}</div>
    </div>
  );
}

/** One cell: highest stage secured and progress on the next one. */
function StageCell({ seg, p, levels, hide }: { seg: Segment; p: SegmentPosition; levels: AwardLevel[]; hide: boolean }) {
  if (p.next == null) return hide ? null : <span className="ap-done" title="Every stage secured">✓ All {seg.stages.length}</span>;
  const nx = seg.stages[p.next];
  const col = stageColour(levels, nx.award);
  return (
    <span className="ap-cell" title={`Secured: ${p.secured >= 0 ? seg.stages[p.secured].name : "none"}. Next: ${nx.name} ${p.stagePcts[p.next]}%`}>
      <span className="ap-cell-top"><strong>{p.secured + 1}</strong><span className="dim">/{seg.stages.length}</span>
        {p.gaps.length > 0 && <span className="ap-gap" title={`Stage ${p.gaps.map(g => g + 1).join(", ")} not complete`}>⚠</span>}
        <span className="ap-cell-pct">{p.stagePcts[p.next]}%</span></span>
      <span className="aw-bar"><span style={{ width: `${p.stagePcts[p.next]}%`, background: col }} /></span>
    </span>
  );
}

type PFn = (id: string, key: string) => SegmentPosition;

function AllSegmentsTable({ segments, people, P, levels, hide, editAwards }: { segments: Segment[]; people: RankRow[]; P: PFn; levels: AwardLevel[]; hide: boolean; editAwards: boolean }) {
  const cols = segments.filter(s => !hide || people.some(r => P(r.id, s.key).next != null));
  return (
    <>
      <div className="table-wrap card ap-wide">
        <table className="data ap-table">
          <thead><tr><th>Swimmer</th>{cols.map(s => <th key={s.key} className="ap-segcol" title={s.name}><span aria-hidden="true">{s.icon}</span> {s.short}</th>)}</tr></thead>
          <tbody>{people.map(r => (
            <tr key={r.id}>
              <th scope="row"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link><span className="dim small ap-sub">{r.squad}</span></th>
              {cols.map(s => <td key={s.key} className="ap-segcol"><StageCell seg={s} p={P(r.id, s.key)} levels={levels} hide={hide} /></td>)}
            </tr>
          ))}</tbody>
        </table>
        <p className="hint">Each cell: stages secured / stages in the skill, then progress on the next stage (bar in that stage's award colour).</p>
      </div>
      <ul className="ap-cards ap-narrow">
        {people.map(r => (
          <li key={r.id}>
            <div className="ap-card-top"><span className="ap-card-name"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link><span className="dim small ap-sub">{r.squad}</span></span></div>
            <div className="ap-segrows">
              {cols.map(s => { const p = P(r.id, s.key); if (hide && p.next == null) return null; return (
                <div key={s.key} className="ap-segrow"><span className="ap-segrow-lab"><span aria-hidden="true">{s.icon}</span> {s.short}</span><StageCell seg={s} p={p} levels={levels} hide={hide} /></div>
              ); })}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function OneSegmentTable({ seg, people, P, levels, hide, editAwards }: { seg: Segment; people: RankRow[]; P: PFn; levels: AwardLevel[]; hide: boolean; editAwards: boolean }) {
  const list = hide ? people.filter(r => P(r.id, seg.key).next != null) : people;
  const stages = seg.stages.map((s, i) => ({ s, i })).filter(({ i }) => !hide || list.some(r => P(r.id, seg.key).stagePcts[i] < 100));
  const cell = (p: SegmentPosition, i: number) => (hide && p.stagePcts[i] >= 100 ? null : (
    <span className={"ap-stagecell" + (p.gaps.includes(i) ? " gap" : "")}><CritDot pct={p.stagePcts[i] === 0 && !p.started ? null : p.stagePcts[i]} /> {p.stagePcts[i]}%</span>
  ));
  return (
    <>
      <div className="table-wrap card ap-wide">
        <table className="data ap-table">
          <thead><tr><th>Swimmer</th>{stages.map(({ s, i }) => <th key={s.award} className="ap-segcol"><span className="ap-stage-no sm" style={{ background: stageColour(levels, s.award) }}>{i + 1}</span> {s.name}</th>)}<th className="num">Skill %</th></tr></thead>
          <tbody>{list.map(r => { const p = P(r.id, seg.key); return (
            <tr key={r.id}>
              <th scope="row"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link><span className="dim small ap-sub">{r.squad}</span></th>
              {stages.map(({ s, i }) => <td key={s.award} className="ap-segcol">{cell(p, i)}</td>)}
              <td className="num"><strong>{p.pct}%</strong></td>
            </tr>
          ); })}</tbody>
        </table>
      </div>
      <ul className="ap-cards ap-narrow">
        {list.map(r => { const p = P(r.id, seg.key); return (
          <li key={r.id}>
            <div className="ap-card-top"><span className="ap-card-name"><Link to={swimmerLink(r, editAwards)}>{r.name}</Link><span className="dim small ap-sub">{r.squad}</span></span><span className="ap-points"><strong>{p.pct}%</strong></span></div>
            <StageCell seg={seg} p={p} levels={levels} hide={hide} />
            <div className="ap-stagechips">{stages.map(({ s, i }) => <span key={s.award} title={s.name}><span className="ap-stage-no sm" style={{ background: stageColour(levels, s.award) }}>{i + 1}</span>{cell(p, i)}</span>)}</div>
          </li>
        ); })}
      </ul>
    </>
  );
}
