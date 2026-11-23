import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useClub } from "../club/ClubProvider";
import {
  AwardIndex, SCALE, STATUS_LABEL, awardsMissing, loadAwardData, loadAwardRef, scorePct, statusOf,
  type AwardLevel, type AwardOutcome
} from "../lib/awards";

export const useAwardRef = () => useQuery({ queryKey: ["award_ref"], queryFn: loadAwardRef, staleTime: 60 * 60 * 1000 });

/** Horizontal completion bar in the award's colour. */
export function AwardBar({ level, pct, label }: { level: AwardLevel; pct: number; label?: string }) {
  return (
    <div className="aw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label ?? `${level.title}: ${pct}%`}>
      <span style={{ width: `${pct}%`, background: level.colour }} />
    </div>
  );
}

/** The token a swimmer receives when every criterion of an award is complete. */
export function AwardToken({ level, size = 40, title }: { level: AwardLevel; size?: number; title?: string }) {
  return (
    <span className="aw-token" style={{ width: size, height: size, background: level.colour, fontSize: size * 0.42 }} title={title ?? `${level.title} achieved`}>
      <span aria-hidden="true">{level.award}</span>
      <span className="sr-only">{title ?? `${level.title} achieved`}</span>
    </span>
  );
}

/** Status mark for one criterion: blank, red, amber, green, or a green tick. */
export function CritDot({ score, pct }: { score?: number | null; pct?: number | null }) {
  const p = pct !== undefined ? pct : scorePct(score);
  const st = statusOf(p);
  return <span className={"aw-dot " + st} title={STATUS_LABEL[st] + (p != null ? ` · ${p}%` : "")}>{st === "done" ? "✓" : ""}<span className="sr-only">{STATUS_LABEL[st]}</span></span>;
}

/** 5-point marking control. Tap the current value again to clear the mark. */
export function ScalePicker({ value, onChange, colour, name }: { value: number | null; onChange: (v: number | null) => void; colour: string; name: string }) {
  return (
    <div className="aw-scale" role="group" aria-label={`Mark for ${name}`}>
      {SCALE.map(n => {
        const on = value === n;
        return (
          <button key={n} type="button" className={"aw-step" + (on ? " on " + statusOf(n * 20) : "")}
            style={on ? undefined : { borderColor: value != null && n <= value ? colour : undefined }}
            aria-pressed={on} onClick={() => onChange(on ? null : n)}>
            {n * 20}%
          </button>
        );
      })}
    </div>
  );
}

export function StatusKey() {
  return (
    <p className="aw-key">
      {(["none", "red", "amber", "green", "done"] as const).map(s => (
        <span key={s}><span className={"aw-dot " + s}>{s === "done" ? "✓" : ""}</span>{STATUS_LABEL[s]}</span>
      ))}
    </p>
  );
}

/** Tokens row for the top of a swimmer's profile. */
export function AwardTokens({ index, swimmerId }: { index: AwardIndex; swimmerId: string }) {
  const got = index.ref.levels.filter(l => index.achieved(swimmerId, l.award));
  if (!got.length) return null;
  return (
    <div className="aw-tokens" aria-label="Club Awards achieved">
      {got.map(l => <AwardToken key={l.award} level={l} size={34} title={`${l.title} achieved ${index.activation(swimmerId, l.award)?.achieved_on ?? ""}`} />)}
    </div>
  );
}

/** One award block: header with bar, then (optionally) its criteria. Bordered in the award colour when activated. */
export function AwardBlock({ index, swimmerId, level, open, onToggle, children }: {
  index: AwardIndex; swimmerId: string; level: AwardLevel; open: boolean; onToggle?: () => void; children?: React.ReactNode;
}) {
  const pct = index.awardPct(swimmerId, level.award);
  const active = index.active(swimmerId, level.award);
  const achieved = index.achieved(swimmerId, level.award);
  const list = index.ref.byAward.get(level.award) ?? [];
  const done = list.filter(o => index.score(swimmerId, o.outcome_id) === 5).length;
  return (
    <div className={"aw-block" + (active ? " active" : "")} style={active ? { borderColor: level.colour } : undefined}>
      <button type="button" className="aw-head" onClick={onToggle} aria-expanded={open} disabled={!onToggle}>
        <span className="aw-num" style={{ background: level.colour }}>{level.award}</span>
        <span className="aw-title">
          <strong>{level.title}</strong>
          <span className="dim">{achieved ? `Achieved ${index.activation(swimmerId, level.award)?.achieved_on ?? ""}` : active ? `Active · ${done}/${list.length} criteria complete` : pct > 0 ? "Not active" : "Not started"}</span>
        </span>
        <span className="aw-pct">{pct}%</span>
        {achieved && <AwardToken level={level} size={28} />}
      </button>
      <AwardBar level={level} pct={pct} />
      {open && children}
    </div>
  );
}

export function CritList({ index, swimmerId, outcomes }: { index: AwardIndex; swimmerId: string; outcomes: AwardOutcome[] }) {
  return (
    <ul className="aw-crit">
      {outcomes.map(o => {
        const s = index.score(swimmerId, o.outcome_id);
        return (
          <li key={o.outcome_id}>
            <CritDot score={s} />
            <span className="aw-crit-text"><span className="aw-area">{o.award}.{o.outcome_no} · {o.area}</span>{o.outcome}</span>
            <span className="aw-crit-pct">{s == null ? "–" : `${s * 20}%`}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Swimmer profile card: all six awards, read-only. Coaches get a link to assess. */
export function AwardsProfileCard({ swimmerId, squadId, canAssess }: { swimmerId: string; squadId: string | null; canAssess: boolean }) {
  const { clubId } = useClub();
  const ref = useAwardRef();
  const data = useQuery({ queryKey: ["award_data", clubId, swimmerId], enabled: !!clubId, queryFn: () => loadAwardData(clubId!, [swimmerId]) });
  const [open, setOpen] = useState<number | null>(null);
  const missing = awardsMissing(ref.error) || awardsMissing(data.error);
  const index = ref.data && data.data ? new AwardIndex(ref.data, data.data) : null;
  return (
    <section className="card">
      <div className="card-head top">
        <h2 className="card-title">Club Awards</h2>
        {canAssess && squadId && index && <Link className="btn small" to={`/awards/squad/${squadId}/swimmer/${swimmerId}`}>Assess</Link>}
      </div>
      {missing && <p className="dim">Club Awards need the latest database update.</p>}
      {!missing && (ref.error || data.error) && <p className="msg error">Couldn't load Club Awards.</p>}
      {!missing && !index && !ref.error && !data.error && <p className="dim">Loading…</p>}
      {index && (
        <>
          <AwardTokens index={index} swimmerId={swimmerId} />
          {index.ref.levels.map(l => (
            <AwardBlock key={l.award} index={index} swimmerId={swimmerId} level={l} open={open === l.award}
              onToggle={() => setOpen(open === l.award ? null : l.award)}>
              <CritList index={index} swimmerId={swimmerId} outcomes={index.ref.byAward.get(l.award) ?? []} />
            </AwardBlock>
          ))}
          <StatusKey />
        </>
      )}
    </section>
  );
}

/** Tokens for the profile header (shares the card's query). */
export function ProfileAwardTokens({ swimmerId }: { swimmerId: string }) {
  const { clubId } = useClub();
  const ref = useAwardRef();
  const data = useQuery({ queryKey: ["award_data", clubId, swimmerId], enabled: !!clubId, queryFn: () => loadAwardData(clubId!, [swimmerId]) });
  if (!ref.data || !data.data) return null;
  return <AwardTokens index={new AwardIndex(ref.data, data.data)} swimmerId={swimmerId} />;
}
