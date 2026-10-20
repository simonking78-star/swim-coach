import { useState } from "react";
import { STATUSES, catLabel, mediaPath, useSignedUrls, type FbEntry, type Media, type Thread } from "../lib/feedback";
import { fmtDate } from "../lib/util";

const statusClass = (s: string | null) => (s ? "st-" + s.replace(/\s/g, "").toLowerCase() : "");

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return <span className={"fb-badge " + statusClass(status)}>{status}</span>;
}

export function StatusPicker({ value, onChange, label = "Status" }: { value: string | null; onChange: (s: string) => void; label?: string }) {
  return (
    <fieldset className="choice-set">
      <legend>{label}</legend>
      <div className="seg seg-status">
        {STATUSES.map(s => (
          <button key={s} type="button" className={"seg-btn " + statusClass(s) + (value === s ? " on" : "")} aria-pressed={value === s} onClick={() => onChange(s)}>{s}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function TypeToggle({ value, onChange }: { value: "status" | "note"; onChange: (t: "status" | "note") => void }) {
  return (
    <fieldset className="choice-set">
      <legend>Entry type</legend>
      <div className="seg seg-2">
        <button type="button" className={"seg-btn" + (value === "status" ? " on" : "")} aria-pressed={value === "status"} onClick={() => onChange("status")}>Status review</button>
        <button type="button" className={"seg-btn" + (value === "note" ? " on" : "")} aria-pressed={value === "note"} onClick={() => onChange("note")}>Freeform note</button>
      </div>
    </fieldset>
  );
}

export function StrokeChips({ categories, value, onChange }: { categories: string[]; value: string | null; onChange: (c: string | null) => void }) {
  if (categories.length < 2) return null;
  return (
    <div className="chip-row" role="group" aria-label="Filter by stroke or skill">
      <button type="button" className={"filter-chip" + (!value ? " on" : "")} aria-pressed={!value} onClick={() => onChange(null)}>All</button>
      {categories.map(c => (
        <button key={c} type="button" className={"filter-chip" + (value === c ? " on" : "")} aria-pressed={value === c} onClick={() => onChange(c)}>{catLabel(c)}</button>
      ))}
    </div>
  );
}

/** Photos/videos from the private bucket, via short-lived signed links. */
export function MediaGrid({ media }: { media: Media[] | null | undefined }) {
  const urls = useSignedUrls(media);
  if (!media?.length) return null;
  return (
    <div className="media-grid">
      {media.map((m, i) => {
        const p = mediaPath(m);
        const u = p ? urls[p] : undefined;
        return (
          <a key={i} className="media-item" href={u} target="_blank" rel="noopener noreferrer" aria-label={m.type === "video" ? "Open video" : "Open photo"}>
            {u ? (m.type === "video" ? <video src={u} muted preload="metadata" /> : <img src={u} alt="" loading="lazy" />) : <span className="media-wait" />}
            {m.type === "video" && <span className="media-play" aria-hidden="true">▶</span>}
          </a>
        );
      })}
    </div>
  );
}

export function EntryBody({ e, origin, extra }: { e: FbEntry; origin?: boolean; extra?: React.ReactNode }) {
  const obs = e.observation || e.note || "";
  return (
    <div className="fb-entry">
      <div className="fb-entry-top">
        <span className="fb-date">{fmtDate(e.session_date)}</span>
        <span className="fb-cat">{catLabel(e.category)}</span>
        <StatusBadge status={e.status} />
        {origin && <span className="chip">Original</span>}
      </div>
      {e.criterion && <p className="fb-crit">{e.criterion}</p>}
      {extra}
      {obs && <p className="fb-field"><span>Observation</span>{obs}</p>}
      {e.remedial_action && <p className="fb-field"><span>Remedial action</span>{e.remedial_action}</p>}
      {e.note && e.observation && <p className="fb-field"><span>Additional notes</span>{e.note}</p>}
      {e.coach && <p className="fb-by">— {e.coach}</p>}
      <MediaGrid media={e.media} />
    </div>
  );
}

/** One string: its latest entry, Update, and the full history oldest → newest on demand. */
export function ThreadCard<T extends FbEntry>({ thread, onUpdate, extra }: {
  thread: Thread<T>;
  onUpdate?: (t: Thread<T>) => void;
  extra?: (e: T, latest: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const latest = thread.entries[0];
  const n = thread.entries.length;
  return (
    <article className="thread-card">
      <p className="thread-tag">Latest{n > 1 ? ` · ${n} in this string` : ""}</p>
      <EntryBody e={latest} extra={extra?.(latest, true)} />
      <div className="thread-actions">
        {onUpdate && <button type="button" className="btn small primary" onClick={() => onUpdate(thread)}>Update</button>}
        {n > 1 && <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Hide history" : "View history"}</button>}
      </div>
      {open && (
        <div className="thread-history">
          <p className="thread-tag">Full string — original to present ({n})</p>
          {thread.entries.slice().reverse().map((e, i) => <EntryBody key={e.id} e={e} origin={i === 0} extra={extra?.(e, false)} />)}
        </div>
      )}
    </article>
  );
}

export function StepTabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string; num?: number; badge?: number; disabled?: boolean }[];
  value: K; onChange: (k: K) => void;
}) {
  return (
    <div className="step-tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} disabled={t.disabled}
          className={"step-tab" + (value === t.key ? " on" : "")} onClick={() => onChange(t.key)}>
          {t.num != null && <span className="step-num">{t.num}</span>}
          {t.label}
          {!!t.badge && <span className="step-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
