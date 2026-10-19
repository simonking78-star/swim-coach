import { useId, useState } from "react";
import { applyMatch, lastToken, matchDrills, type FullDrill } from "../lib/drills";
import { blockDistance, microTags, normSkill, parseSetLine, type Block, type Micro, type MicroCtx } from "../lib/plans";
import { fmtDdMm } from "../lib/util";

export function FocusTags({ skills, zone }: { skills?: string[] | null; zone?: string | null }) {
  if (!zone && !(skills || []).length) return null;
  return (
    <>
      {zone && <span className="plan-tag zone">{zone}</span>}
      {(skills || []).map(k => <span key={k} className="plan-tag skill">{normSkill(k)}</span>)}
    </>
  );
}

export function MicroTags({ micro }: { micro: Micro }) {
  const tags = microTags(micro);
  if (!tags.length) return null;
  return <div className="chip-row tight">{tags.map(t => <span key={t} className="chip">{t}</span>)}</div>;
}

/** "Week 3 · w/c 21/09 · Stroke focus: Fly" plus the week's tags. */
export function MicroLine({ ctx, label = "Stroke focus" }: { ctx: MicroCtx; label?: string }) {
  return (
    <>
      <div className="micro-line">
        Week {ctx.micro.week_no} · w/c {ctx.micro.week_commencing ? fmtDdMm(ctx.micro.week_commencing) : "—"}
        {ctx.session?.stroke_focus ? ` · ${label}: ${ctx.session.stroke_focus}` : ""}
      </div>
      <MicroTags micro={ctx.micro} />
    </>
  );
}

/** Read-only plan content. Drill lines open the drill pop-up. */
export function PlanBody({ content, onDrill }: { content: Block[]; onDrill: (id: string) => void }) {
  if (!content.length) return <p className="dim">This plan has no sets yet.</p>;
  const dist = (t: string) => { const p = parseSetLine(t); return p ? <span className="pv-dist">{p.distance_m}m</span> : null; };
  return (
    <div className="pv-body">
      {content.map((b, i) => {
        if (b.type === "heading") return <h3 key={i} className={"pv-heading" + (b.underline ? " underline" : "") + (b.bold ? "" : " light")}>{b.text}</h3>;
        if (b.type === "set") return <p key={i} className="pv-set">{b.text}{dist(b.text)}</p>;
        if (b.type === "repeat_group") return (
          <div key={i} className="pv-repeat">
            <p className="pv-repeat-head">{b.reps} x <span className="pv-dist">({blockDistance(b)}m)</span></p>
            {(b.children || []).map((c, ci) => <p key={ci} className="pv-repeat-child">{c.text}{dist(c.text)}</p>)}
          </div>
        );
        if (b.type === "note") return <p key={i} className="pv-note">{b.text}</p>;
        if (b.type === "drill") return b.drill_id
          ? <p key={i} className="pv-drill"><button type="button" className="link-btn" onClick={() => onDrill(b.drill_id!)}>{b.drill_name || "(drill)"}</button></p>
          : <p key={i} className="pv-drill">{b.drill_name || "(drill)"}</p>;
        return null;
      })}
    </div>
  );
}

/**
 * Set-line input with drill prediction: typing a drill name (or one of its
 * pseudonyms) offers matches; choosing one completes the word and links the drill.
 */
export function SetLineInput({ value, onChange, onDrill, drills, placeholder, label }: {
  value: string; onChange: (v: string) => void; onDrill: (d: FullDrill) => void;
  drills: FullDrill[]; placeholder: string; label: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const token = lastToken(value);
  const matches = open ? matchDrills(drills, token) : [];
  const show = matches.length > 0;
  const pick = (d: FullDrill) => { onChange(applyMatch(value, token, d.drill_name)); onDrill(d); setOpen(false); };
  return (
    <div className="setline">
      <input
        type="text" value={value} placeholder={placeholder} aria-label={label} autoComplete="off"
        role="combobox" aria-expanded={show} aria-controls={id + "-list"} aria-autocomplete="list"
        aria-activedescendant={show ? `${id}-${active}` : undefined}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onBlur={() => setOpen(false)}
        onKeyDown={e => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % matches.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(matches[Math.min(active, matches.length - 1)]); }
          else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }}
      />
      {show && (
        <ul id={id + "-list"} role="listbox" className="setline-ac" aria-label="Matching drills">
          {matches.map((d, i) => (
            <li key={d.id} id={`${id}-${i}`} role="option" aria-selected={i === active}
              className={i === active ? "on" : undefined}
              onMouseDown={e => { e.preventDefault(); pick(d); }}>
              {d.drill_name}<span className="dim">{d.stroke || ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
