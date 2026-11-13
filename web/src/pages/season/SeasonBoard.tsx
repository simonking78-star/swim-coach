import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { fmtDate, fmtDdMm, isoAdd } from "../../lib/util";
import { fmtTime, isoDiffDays, isoDow } from "../../lib/season";
import {
  annualCols, brackets, COMP_KIND, dayCols, EVENT_KIND, laneItems, macroColour, macroRange, mesoColour, mesoRuns, monday,
  monthLabel, monthRange, shader, shiftMonth, span, squadItems, squadWeeks, VIEWS, weekMonth,
  type BoardData, type BoardItem, type BoardMacro, type Col, type View
} from "../../lib/seasonBoard";

// The landscape season calendar (A-131 to A-136). Squads as bands of three rows:
// name (hover → macro over meso brackets), events, training (blue by planned volume).

const BASE_W: Record<View, number> = { annual: 8, month: 30, macro: 22, meso: 40, micro: 118 };
const LABEL_W = 168;
const DOW1 = ["", "M", "T", "W", "T", "F", "S", "S"];
const DOW3 = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface BoardSquad { id: string; name: string; }
interface Tip { x: number; y: number; title: string; lines: string[]; }

export interface BoardProps {
  season: { id: string; title: string; start_date: string; finish_date: string };
  squads: BoardSquad[];
  data: BoardData;
  today: string;
  mySquads: Set<string>;
  canEdit: boolean;
  canPlan: boolean;
  onWindow: (id: string) => void;
  onEvent: (id: string) => void;
}

export function SeasonBoard({ season, squads, data, today, mySquads, canEdit, canPlan, onWindow, onEvent }: BoardProps) {
  const navigate = useNavigate();
  const clampDate = (d: string) => (d < season.start_date ? season.start_date : d > season.finish_date ? season.finish_date : d);
  const [view, setView] = useState<View>("annual");
  const [anchor, setAnchor] = useState(() => clampDate(today));
  const [scale, setScale] = useState(1);
  const [macroId, setMacroId] = useState<string | null>(null);
  const [mesoIdx, setMesoIdx] = useState(0);
  const [hoverSquad, setHoverSquad] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [avail, setAvail] = useState(1000);
  const scroller = useRef<HTMLDivElement>(null);

  // Macro / meso the zoomed views show: the one around the anchor date, else the first
  const macrosWithWeeks = data.macros.filter(m => m.micros.length);
  const macroAt = (d: string) => macrosWithWeeks.find(m => { const r = macroRange(m)!; return r[0] <= d && r[1] >= d; });
  const macro: BoardMacro | null = (macroId && macrosWithWeeks.find(m => m.id === macroId)) || macroAt(anchor) || macrosWithWeeks[0] || null;
  const runs = macro ? mesoRuns(macro) : [];
  const run = runs[Math.min(mesoIdx, Math.max(0, runs.length - 1))] || null;

  const cols: Col[] = useMemo(() => {
    if (view === "annual") return annualCols(season.start_date, season.finish_date);
    if (view === "month") { const [a, b] = monthRange(anchor); return dayCols(a, b); }
    if (view === "macro" && macro) { const r = macroRange(macro)!; return dayCols(r[0], r[1]); }
    if (view === "meso" && run) return dayCols(run.from, run.to);
    const m = monday(anchor); return dayCols(m, isoAdd(m, 6));
  }, [view, anchor, season.start_date, season.finish_date, macro, run]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el); setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const cw = Math.max(BASE_W[view] * scale, Math.floor((avail - LABEL_W - 2) / cols.length));
  const gridStyle = { "--cw": cw + "px", "--lw": LABEL_W + "px", gridTemplateColumns: `var(--lw) repeat(${cols.length}, var(--cw))` } as CSSProperties;
  const pos = (a: number, b: number, row?: number | string): CSSProperties => ({ gridColumn: `${a + 2} / ${b + 3}`, ...(row !== undefined ? { gridRow: row } : {}) });

  // Lateral zoom: Ctrl/⌘ + wheel or pinch scales the columns; past the limits it steps to the next view.
  const order = VIEWS.map(v => v.key);
  const step = (dir: 1 | -1, at?: string) => {
    const i = order.indexOf(view) + dir;
    if (i < 0 || i >= order.length) return;
    if (at) { setAnchor(clampDate(at)); setMacroId(null); setMesoIdx(0); }
    if (at && order[i] === "meso" && macro) { const r = mesoRuns(macroAt(at) || macro).findIndex(x => x.from <= at && x.to >= at); setMesoIdx(Math.max(0, r)); }
    setView(order[i]); setScale(1);
  };
  const stepRef = useRef(step); stepRef.current = step;
  const scaleRef = useRef(scale); scaleRef.current = scale;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const at = (e.target as HTMLElement).closest<HTMLElement>("[data-d]")?.dataset.d;
      const next = scaleRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      if (next > 2.2) stepRef.current(1, at);
      else if (next < 0.7) stepRef.current(-1, at);
      else setScale(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // Keep today (or the anchor) in view after a view change
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const i = cols.findIndex(c => c.end >= anchor);
    const wide = LABEL_W + cols.length * cw > el.clientWidth + 2;
    el.scrollLeft = wide && i >= 0 ? Math.max(0, i * cw - (el.clientWidth - LABEL_W) / 3) : 0;
  }, [view, cols, anchor, cw]);

  const showTip = (e: React.MouseEvent | React.FocusEvent, title: string, lines: string[]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = "clientX" in e ? e.clientX : r.left + r.width / 2;
    const y = "clientY" in e ? e.clientY : r.bottom;
    setTip({ x, y, title, lines: lines.filter(Boolean) });
  };
  const tipProps = (title: string, lines: string[]) => ({
    onMouseEnter: (e: React.MouseEvent) => showTip(e, title, lines),
    onMouseMove: (e: React.MouseEvent) => showTip(e, title, lines),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => showTip(e, title, lines),
    onBlur: () => setTip(null)
  });

  const todayIdx = cols.findIndex(c => c.start <= today && c.end >= today);
  const isWeekendCol = (c: Col) => (view === "annual" ? c.part === 2 : isoDow(c.start) >= 6);
  const inBreak = (d: string) => data.breaks.some(b => d >= b.start && d <= b.end);

  // ---- Header -------------------------------------------------------------------------
  const head: ReactNode[] = [];
  const bracketRow = (key: string, items: { key: string; label: string; a: number; b: number; date: string }[], onPick?: (d: string) => void, cls = "") => (
    <div key={key} className={"sb-row sb-head " + cls} style={gridStyle}>
      <div className="sb-label" />
      {items.map(b => (
        <button key={b.key + b.a} type="button" className="sb-bracket" style={pos(b.a, b.b)} data-d={b.date} title={b.label}
          onClick={onPick ? () => onPick(b.date) : undefined} disabled={!onPick}>
          <span>{b.label}</span>
        </button>
      ))}
    </div>
  );
  if (view === "annual") {
    head.push(bracketRow("m", brackets(cols, weekMonth, c => monthLabel(isoAdd(monday(c.start), 3))), d => { setAnchor(clampDate(isoAdd(monday(d), 3))); setView("month"); setScale(1); }));
    const weeks = brackets(cols, c => monday(c.start), c => String(Math.floor(isoDiffDays(monday(season.start_date), monday(c.start)) / 7) + 1));
    head.push(bracketRow("w", weeks, d => { setAnchor(clampDate(d)); setView("micro"); setScale(1); }, "sb-wk"));
  } else {
    const weekBr = brackets(cols, c => monday(c.start), c => (view === "micro" ? "Week of " + fmtDate(monday(c.start)) : "w/c " + fmtDdMm(monday(c.start))));
    if (view === "macro" && macro) {
      const mesoBr = runs.map((r, i) => { const s = span(cols, r.from, r.to); return s ? { key: "meso" + i, label: r.meso != null ? `Meso ${r.meso}` : "No meso", a: s[0], b: s[1], date: r.from } : null; }).filter(Boolean) as { key: string; label: string; a: number; b: number; date: string }[];
      head.push(bracketRow("meso", mesoBr, d => { setMesoIdx(runs.findIndex(r => r.from === d)); setView("meso"); setScale(1); }));
    } else if (view === "month") {
      head.push(<div key="mt" className="sb-row sb-head" style={gridStyle}><div className="sb-label" /><div className="sb-title" style={pos(0, cols.length - 1)}>{monthLabel(anchor, true)}</div></div>);
    }
    head.push(bracketRow("wk", weekBr, view === "micro" ? undefined : d => { setAnchor(clampDate(d)); setView("micro"); setScale(1); }));
    head.push(
      <div key="days" className="sb-row sb-head sb-days" style={gridStyle}>
        <div className="sb-label" />
        {cols.map((c, i) => (
          <div key={c.start} className={"sb-day" + (isWeekendCol(c) ? " we" : "") + (i === todayIdx ? " today" : "")} style={pos(i, i)} data-d={c.start}>
            {view === "micro" ? `${DOW3[isoDow(c.start)]} ${fmtDdMm(c.start)}` : cw >= 30 ? <>{DOW1[isoDow(c.start)]}<br />{Number(c.start.slice(8))}</> : DOW1[isoDow(c.start)]}
          </div>
        ))}
      </div>
    );
  }

  // ---- Squad bands ----------------------------------------------------------------------
  const macroIndex = new Map(data.macros.map((m, i) => [m.id, i]));
  const bands = squads.map(sq => {
    const pinned = view === "macro" || view === "meso";
    const showBrackets = pinned || hoverSquad === sq.id;
    const myMacros = data.macros.filter(m => m.squadIds.includes(sq.id) && m.micros.length);

    // Row 1: name + macro / meso brackets
    const nameRow = (
      <div className={"sb-row sb-name" + (mySquads.has(sq.id) ? " mine" : "")} style={gridStyle}
        onMouseEnter={() => setHoverSquad(sq.id)} onMouseLeave={() => setHoverSquad(h => (h === sq.id ? null : h))}
        title={pinned || !myMacros.length ? undefined : "Hover this row to see the macro and meso-cycles"}>
        <div className="sb-label" style={{ gridRow: "1 / 3" }}><strong>{sq.name}</strong>{mySquads.has(sq.id) && <span className="chip tiny">Mine</span>}</div>
        {showBrackets && myMacros.map(m => {
          const r = macroRange(m)!; const s = span(cols, r[0], r[1]);
          if (!s) return null;
          const col = macroColour(m, macroIndex.get(m.id)!);
          return (
            <Fragment key={m.id}>
              <button type="button" className="sb-macro" style={{ ...pos(s[0], s[1], 1), background: col }}
                onClick={() => { setMacroId(m.id); setView("macro"); setScale(1); }}
                {...tipProps(m.title, [`Macro-cycle · ${fmtDate(r[0])} – ${fmtDate(r[1])}`, `${m.micros.length} week${m.micros.length === 1 ? "" : "s"}`, "Click to open the macro view"])}>
                <span>{m.title}</span>
              </button>
              {mesoRuns(m).map((run, i) => {
                const t = span(cols, run.from, run.to);
                if (!t) return null;
                return (
                  <button key={i} type="button" className="sb-meso" style={{ ...pos(t[0], t[1], 2), background: mesoColour(run.meso) }}
                    onClick={() => { setMacroId(m.id); setMesoIdx(i); setView("meso"); setScale(1); }}
                    {...tipProps(run.meso != null ? `Meso ${run.meso}` : "Meso not set", [m.title, `${fmtDate(run.from)} – ${fmtDate(run.to)}`, `${run.weeks.length} week${run.weeks.length === 1 ? "" : "s"}`])}>
                    {cw * (t[1] - t[0] + 1) > 50 && <span>{run.meso != null ? `Meso ${run.meso}` : "—"}</span>}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    );

    // Row 2: events
    const raw = squadItems(data, sq.id).map(it => { const s = span(cols, it.from, it.to); return s ? { it, a: s[0], b: s[1] } : null; }).filter(Boolean) as { it: BoardItem; a: number; b: number }[];
    const { placed, over, lanes } = laneItems(raw, 3);
    const eventsRow = (
      <div className="sb-row sb-events" style={{ ...gridStyle, gridTemplateRows: `repeat(${lanes}, 20px)` }}>
        <div className="sb-label sub" style={{ gridRow: `1 / ${lanes + 1}` }}>Events</div>
        {placed.map(({ it, a, b, lane }) => <Marker key={it.t + it.id} it={it} style={pos(a, b, lane + 1)} tipProps={tipProps}
          onOpen={() => {
            if (it.t === "comp") navigate(canEdit ? `/season/competition/${it.id}` : it.comp.competition_id ? `/competitions?focus=${it.comp.competition_id}` : `/competitions?q=${encodeURIComponent(it.comp.name)}`);
            else if (it.t === "window") onWindow(it.id);
            else onEvent(it.id);
          }} />)}
        {over.length > 0 && <span className="sb-more" style={pos(over[0].a, over[0].a, lanes)} {...tipProps(`${over.length} more`, over.map(o => o.it.t === "comp" ? o.it.comp.name : o.it.t === "window" ? o.it.w.title : o.it.e.title))}>+{over.length}</span>}
      </div>
    );

    // Row 3: training
    const weeks = squadWeeks(data, sq.id);
    const shade = shader(weeks.map(w => w.metres || 0));
    const trainRow = (
      <div className="sb-row sb-train" style={gridStyle}>
        <div className="sb-label sub" title={shade.max ? `Lightest ${shade.min?.toLocaleString()} m · deepest ${shade.max.toLocaleString()} m a week` : undefined}>
          Training{shade.max ? <span className="dim small"> · up to {Math.round(shade.max / 100) / 10}k m</span> : null}
        </div>
        {cols.map((c, i) => inBreak(c.start) && inBreak(c.end) ? <div key={"br" + i} className="sb-break" style={pos(i, i, 1)} /> : null)}
        {view === "micro" ? cols.map((c, i) => {
          const sess = data.sessions.filter(s => s.squad_id === sq.id && s.session_date === c.start).sort((x, y) => (x.start_time || "").localeCompare(y.start_time || ""));
          const plans = data.plans.filter(p => p.squad_id === sq.id && p.intended_date === c.start);
          const wk = weeks.find(w => w.from <= c.start && isoAdd(w.from, 6) >= c.start);
          return (
            <div key={c.start} className={"sb-tt s" + (wk ? shade.fn(wk.metres) : 0)} style={pos(i, i, 1)} data-d={c.start}>
              {sess.map(s => <div key={s.id} className="sb-sess">{fmtTime(s.start_time)}{s.stroke_focus ? " · " + s.stroke_focus : ""}</div>)}
              {plans.map(p => <button key={p.id} type="button" className="link-btn small" onClick={() => navigate(`/sessions/${p.id}`, { state: { from: "/season" } })}>{p.title}{p.total_distance_m ? ` · ${p.total_distance_m.toLocaleString()} m` : ""}</button>)}
              {canPlan && sess.length > 0 && !plans.length && <button type="button" className="link-btn small" onClick={() => navigate(`/sessions/new?squad=${sq.id}&date=${c.start}&session=${sess[0].id}`, { state: { from: "/season" } })}>+ Write plan</button>}
              {!sess.length && !plans.length && <span className="dim small">—</span>}
            </div>
          );
        }) : weeks.map(w => {
          const s = span(cols, w.from, isoAdd(w.from, 6));
          if (!s) return null;
          const lvl = shade.fn(w.metres);
          const lines = [`${w.macro.title} · week ${w.micro.week_no}`, w.micro.meso != null ? `Meso ${w.micro.meso}` : "", w.micro.qes_focus ? `QES focus: ${w.micro.qes_focus}` : "",
            w.metres ? `${w.metres.toLocaleString()} m ${w.planned ? "in session plans" : "planned (no session plans yet)"}` : "No volume planned yet", "Click to open the week"];
          return (
            <button key={w.micro.id} type="button" className={"sb-wkcell s" + lvl + (w.metres ? "" : " none")} style={pos(s[0], s[1], 1)} data-d={w.from}
              aria-label={`${sq.name}, week of ${fmtDate(w.from)}: ${w.metres ? w.metres + " metres" : "no volume planned"}`}
              onClick={() => { setAnchor(clampDate(w.from)); setView("micro"); setScale(1); }} {...tipProps(`Week of ${fmtDate(w.from)}`, lines)}>
              {cw * (s[1] - s[0] + 1) >= 44 && w.metres ? <span>{Math.round(w.metres / 100) / 10}k</span> : null}
            </button>
          );
        })}
      </div>
    );
    return <div key={sq.id} className="sb-band">{nameRow}{eventsRow}{trainRow}</div>;
  });

  // ---- Toolbar ----------------------------------------------------------------------------
  const vi = order.indexOf(view);
  const nav = (dir: 1 | -1) => {
    if (view === "month") setAnchor(clampDate(shiftMonth(anchor, dir)));
    else if (view === "micro") setAnchor(clampDate(isoAdd(monday(anchor), 7 * dir)));
    else if (view === "macro") { const i = macrosWithWeeks.findIndex(m => m.id === macro?.id) + dir; if (macrosWithWeeks[i]) setMacroId(macrosWithWeeks[i].id); }
    else if (view === "meso") { const i = mesoIdx + dir; if (i >= 0 && i < runs.length) setMesoIdx(i); }
  };
  const caption = view === "annual" ? `${fmtDate(season.start_date)} – ${fmtDate(season.finish_date)}`
    : view === "month" ? monthLabel(anchor, true)
    : view === "macro" ? (macro ? macro.title : "No macro-cycles yet")
    : view === "meso" ? (macro && run ? `${macro.title} · ${run.meso != null ? "Meso " + run.meso : "Meso not set"}` : "No meso-cycles yet")
    : "Week of " + fmtDate(monday(anchor));

  return (
    <section className="sb card" aria-label="Season calendar">
      <div className="sb-toolbar">
        <div className="sb-views" role="group" aria-label="Calendar view">
          {VIEWS.map(v => <button key={v.key} type="button" className={"seg-btn small" + (view === v.key ? " on" : "")} aria-pressed={view === v.key} onClick={() => {
            if (v.key === "meso" || v.key === "macro") {
              const m = macroAt(anchor) || macro;
              setMacroId(m?.id ?? null);
              setMesoIdx(m ? Math.max(0, mesoRuns(m).findIndex(r => r.from <= anchor && r.to >= anchor)) : 0);
            }
            setView(v.key); setScale(1);
          }}>{v.label}</button>)}
        </div>
        <div className="sb-zoom" role="group" aria-label="Zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" disabled={vi === 0} onClick={() => step(-1)}>−</button>
          <button type="button" className="icon-btn" aria-label="Zoom in" disabled={vi === order.length - 1} onClick={() => step(1)}>+</button>
        </div>
        {view !== "annual" && (
          <div className="sb-nav">
            <button type="button" className="icon-btn" aria-label="Previous" onClick={() => nav(-1)}>‹</button>
            <span className="sb-caption">{caption}</span>
            <button type="button" className="icon-btn" aria-label="Next" onClick={() => nav(1)}>›</button>
          </div>
        )}
        {view === "annual" && <span className="sb-caption">{caption}</span>}
        <button type="button" className="btn small" onClick={() => { setAnchor(clampDate(today)); setMacroId(null); setMesoIdx(0); }}>Today</button>
        <span className="dim small sb-help">Ctrl + scroll (or pinch) to zoom · Shift + scroll to move along</span>
      </div>
      <div className="sb-scroll" ref={scroller}>
        <div className="sb-canvas" style={{ width: LABEL_W + cols.length * cw }}>
          {head}
          {todayIdx >= 0 && <div className="sb-todayline" style={{ left: LABEL_W + todayIdx * cw + cw / 2 }} aria-hidden="true" />}
          {bands}
          {!squads.length && <p className="dim card">No squads to show.</p>}
        </div>
      </div>
      <Legend />
      {tip && (
        <div className="sb-tip" role="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: tip.y + 16 }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </section>
  );
}

function Marker({ it, style, onOpen, tipProps }: { it: BoardItem; style: CSSProperties; onOpen: () => void;
  tipProps: (title: string, lines: string[]) => Record<string, unknown> }) {
  if (it.t === "comp") {
    const k = COMP_KIND[it.kind];
    const c = it.comp;
    const lines = [k.label + (it.macroTitle ? ` · ${it.macroTitle}` : ""), `${fmtDate(c.date_from)}${c.date_to && c.date_to !== c.date_from ? " – " + fmtDate(c.date_to) : ""}`,
      [c.level ? "Level " + c.level : "", c.course, c.venue_name || ""].filter(Boolean).join(" · "), "Click for full details"];
    return (
      <button type="button" className={"sb-mk " + k.shape + " " + k.cls} style={style} onClick={onOpen} aria-label={`${k.label}: ${c.name}, ${fmtDate(c.date_from)}`} {...tipProps(c.name, lines)}>
        {k.shape === "block" ? <span>{it.kind === "target" ? "⚑ " : ""}{c.name}</span> : <i aria-hidden="true" />}
      </button>
    );
  }
  if (it.t === "window") {
    const w = it.w;
    const label = w.kind === "test_set" ? "Test set window" : "Squad movement window";
    return (
      <button type="button" className={"sb-mk win " + (w.kind === "test_set" ? "w-test" : "w-move")} style={style} onClick={onOpen}
        aria-label={`${label}: ${w.title}, ${fmtDate(w.starts_on)} to ${fmtDate(w.ends_on)}`}
        {...tipProps(w.title, [label, `Starts ${fmtDate(w.starts_on)} · finishes ${fmtDate(w.ends_on)}`, w.note || "", "Click for full details"])}>
        <span>{w.title}</span>
      </button>
    );
  }
  const e = it.e;
  const k = EVENT_KIND[e.kind] || EVENT_KIND.other;
  return (
    <button type="button" className="sb-mk chipmk" style={style} onClick={onOpen} aria-label={`${k.label}: ${e.title}, ${fmtDate(e.starts_on)}`}
      {...tipProps(e.title, [k.label, `${fmtDate(e.starts_on)}${e.ends_on !== e.starts_on ? " – " + fmtDate(e.ends_on) : ""}`, e.location || "", e.note || "", "Click for full details"])}>
      <span>{k.icon} {e.title}</span>
    </button>
  );
}

function Legend() {
  return (
    <div className="sb-legend" aria-label="Key">
      <span><i className="lg block k-team" /> Team event</span>
      <span><i className="lg block k-target" /> Target</span>
      <span><i className="lg dot k-qual" /> Qualifying</span>
      <span><i className="lg dot k-tt" /> Train-through</span>
      <span><i className="lg dot k-unset" /> Type not set</span>
      <span><i className="lg win w-test" /> Test set window</span>
      <span><i className="lg win w-move" /> Squad movement</span>
      <span><i className="lg chipmk" /> Club event</span>
      <span className="lg-scale">Volume <i className="s1" /><i className="s2" /><i className="s3" /><i className="s4" /><i className="s5" /> more</span>
      <span><i className="lg none" /> No volume planned</span>
    </div>
  );
}
