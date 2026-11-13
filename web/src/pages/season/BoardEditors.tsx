import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { StatusMsg } from "../../components/seasonParts";
import { loadTemplates } from "../../lib/tests";
import { fmtDate } from "../../lib/util";
import {
  disableBoardRow, EVENT_KIND, loadRegistrations, loadStandard, loadStandardOptions, saveEvent, saveStandard, saveWindow, setRegistration,
  type BoardComp, type BoardEvent, type BoardWindow, type RegSwimmer
} from "../../lib/seasonBoard";
import type { BoardSquad } from "./SeasonBoard";

// Editors opened from the Season Plan toolbar and calendar (A-136, A-137, A-141, A-143).
// Everything is disabled, never erased.

type Msg = { text: string; error?: boolean } | null;
const errText = (e: unknown) => "Could not save: " + ((e as Error).message || String(e));

// ---------------------------------------------------------------------------
// Test set windows and squad movement windows
// ---------------------------------------------------------------------------
export function WindowsEditor({ open, onClose, kind, seasonId, club, squads, windows, focusId, canEdit, onSaved }: {
  open: boolean; onClose: () => void; kind: "test_set" | "squad_move"; seasonId: string; club: string; squads: BoardSquad[];
  windows: BoardWindow[]; focusId: string | null; canEdit: boolean; onSaved: () => void;
}) {
  const label = kind === "test_set" ? "Test set windows" : "Squad movement windows";
  const templates = useQuery({ queryKey: ["templates", club], enabled: open && kind === "test_set", queryFn: () => loadTemplates(club) });
  const blank = { id: null as string | null, kind, squad_id: null as string | null, test_set_template_id: null as string | null, title: "", starts_on: "", ends_on: "", note: "" as string | null };
  const [draft, setDraft] = useState(blank);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const list = windows.filter(w => w.kind === kind);
  useEffect(() => {
    if (!open) return;
    const f = focusId ? windows.find(w => w.id === focusId) : null;
    setDraft(f ? { ...f } : blank); setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusId]);

  const save = async () => {
    if (!draft.title.trim()) return setMsg({ text: "Give the window a name.", error: true });
    if (!draft.starts_on || !draft.ends_on) return setMsg({ text: "Set the start and finish dates.", error: true });
    if (draft.ends_on < draft.starts_on) return setMsg({ text: "The finish date must be on or after the start date.", error: true });
    setBusy(true); setMsg(null);
    try { await saveWindow(seasonId, draft); onSaved(); setDraft(blank); setMsg({ text: "Saved." }); }
    catch (e) { console.error(e); setMsg({ text: errText(e), error: true }); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await disableBoardRow("season_windows", id); onSaved(); setDraft(blank); setMsg({ text: "Removed. It is disabled, not erased." }); }
    catch (e) { setMsg({ text: errText(e), error: true }); } finally { setBusy(false); }
  };
  const sqName = (id: string | null) => (id ? squads.find(s => s.id === id)?.name ?? "—" : "All squads");

  return (
    <Modal open={open} onClose={onClose} title={label} wide>
      {list.length ? (
        <ul className="pl-list">
          {list.map(w => (
            <li key={w.id} className={draft.id === w.id ? "on" : ""}>
              <div><div className="meet-name">{w.title}</div><div className="dim small">{fmtDate(w.starts_on)} – {fmtDate(w.ends_on)} · {sqName(w.squad_id)}</div>{w.note && <div className="small">{w.note}</div>}</div>
              {canEdit && <div className="btn-row nowrap"><button type="button" className="btn small" onClick={() => setDraft({ ...w })}>Edit</button><button type="button" className="btn small" onClick={() => remove(w.id)} disabled={busy}>Remove</button></div>}
            </li>
          ))}
        </ul>
      ) : <p className="dim">None yet.</p>}
      {canEdit && (
        <fieldset className="plain-fieldset">
          <legend>{draft.id ? "Edit window" : "Add a window"}</legend>
          <label htmlFor="sw-title">Name</label>
          <input id="sw-title" type="text" value={draft.title} placeholder={kind === "test_set" ? "e.g. Autumn CSS test" : "e.g. January squad moves"} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
          <div className="field-pair">
            <div><label htmlFor="sw-from">Starts</label><input id="sw-from" type="date" value={draft.starts_on} onChange={e => setDraft(d => ({ ...d, starts_on: e.target.value }))} /></div>
            <div><label htmlFor="sw-to">Finishes</label><input id="sw-to" type="date" value={draft.ends_on} onChange={e => setDraft(d => ({ ...d, ends_on: e.target.value }))} /></div>
          </div>
          <label htmlFor="sw-squad">Squad</label>
          <select id="sw-squad" value={draft.squad_id ?? ""} onChange={e => setDraft(d => ({ ...d, squad_id: e.target.value || null }))}>
            <option value="">All squads</option>
            {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {kind === "test_set" && <>
            <label htmlFor="sw-tpl">Test set</label>
            <select id="sw-tpl" value={draft.test_set_template_id ?? ""} onChange={e => setDraft(d => ({ ...d, test_set_template_id: e.target.value || null }))}>
              <option value="">Not chosen</option>
              {(templates.data ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>}
          <label htmlFor="sw-note">Note <span className="dim">(optional)</span></label>
          <input id="sw-note" type="text" value={draft.note ?? ""} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
          <div className="btn-row gap-top">
            <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add window"}</button>
            {draft.id && <button type="button" className="btn" onClick={() => setDraft(blank)}>New window</button>}
          </div>
        </fieldset>
      )}
      <StatusMsg msg={msg} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Club events (Christmas event, summer barbecue, open water swim...)
// ---------------------------------------------------------------------------
export function EventsEditor({ open, onClose, seasonId, squads, events, focusId, canEdit, onSaved }: {
  open: boolean; onClose: () => void; seasonId: string; squads: BoardSquad[]; events: BoardEvent[]; focusId: string | null; canEdit: boolean; onSaved: () => void;
}) {
  const blank = { id: null as string | null, title: "", kind: "social", starts_on: "", ends_on: "", squad_ids: null as string[] | null, location: "" as string | null, note: "" as string | null };
  const [draft, setDraft] = useState(blank);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const f = focusId ? events.find(e => e.id === focusId) : null;
    setDraft(f ? { ...f } : blank); setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusId]);
  const save = async () => {
    if (!draft.title.trim()) return setMsg({ text: "Give the event a name.", error: true });
    if (!draft.starts_on) return setMsg({ text: "Set the date.", error: true });
    const ends = draft.ends_on || draft.starts_on;
    if (ends < draft.starts_on) return setMsg({ text: "The finish date must be on or after the start date.", error: true });
    setBusy(true); setMsg(null);
    try { await saveEvent(seasonId, { ...draft, ends_on: ends }); onSaved(); setDraft(blank); setMsg({ text: "Saved." }); }
    catch (e) { console.error(e); setMsg({ text: errText(e), error: true }); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await disableBoardRow("club_events", id); onSaved(); setDraft(blank); setMsg({ text: "Removed. It is disabled, not erased." }); }
    catch (e) { setMsg({ text: errText(e), error: true }); } finally { setBusy(false); }
  };
  const toggleSquad = (id: string) => setDraft(d => {
    const cur = new Set(d.squad_ids ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    return { ...d, squad_ids: cur.size ? [...cur] : null };
  });
  return (
    <Modal open={open} onClose={onClose} title="Club events" wide>
      {events.length ? (
        <ul className="pl-list">
          {events.map(e => (
            <li key={e.id} className={draft.id === e.id ? "on" : ""}>
              <div>
                <div className="meet-name">{(EVENT_KIND[e.kind] || EVENT_KIND.other).icon} {e.title}</div>
                <div className="dim small">{fmtDate(e.starts_on)}{e.ends_on !== e.starts_on ? " – " + fmtDate(e.ends_on) : ""} · {e.squad_ids?.length ? e.squad_ids.map(id => squads.find(s => s.id === id)?.name).filter(Boolean).join(", ") : "Whole club"}{e.location ? " · " + e.location : ""}</div>
                {e.note && <div className="small">{e.note}</div>}
              </div>
              {canEdit && <div className="btn-row nowrap"><button type="button" className="btn small" onClick={() => setDraft({ ...e })}>Edit</button><button type="button" className="btn small" onClick={() => remove(e.id)} disabled={busy}>Remove</button></div>}
            </li>
          ))}
        </ul>
      ) : <p className="dim">No club events yet.</p>}
      {canEdit && (
        <fieldset className="plain-fieldset">
          <legend>{draft.id ? "Edit event" : "Add an event"}</legend>
          <label htmlFor="ce-title">Name</label>
          <input id="ce-title" type="text" value={draft.title} placeholder="e.g. Christmas party, Summer barbecue, Open water swim" onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
          <label htmlFor="ce-kind">Type</label>
          <select id="ce-kind" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
            {Object.entries(EVENT_KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="field-pair">
            <div><label htmlFor="ce-from">Date</label><input id="ce-from" type="date" value={draft.starts_on} onChange={e => setDraft(d => ({ ...d, starts_on: e.target.value }))} /></div>
            <div><label htmlFor="ce-to">Until <span className="dim">(optional)</span></label><input id="ce-to" type="date" value={draft.ends_on} onChange={e => setDraft(d => ({ ...d, ends_on: e.target.value }))} /></div>
          </div>
          <fieldset className="plain-fieldset">
            <legend>Squads <span className="dim">(none ticked = whole club)</span></legend>
            <div className="chip-row">{squads.map(s => (
              <label key={s.id} className="check-chip"><input type="checkbox" checked={!!draft.squad_ids?.includes(s.id)} onChange={() => toggleSquad(s.id)} /> {s.name}</label>
            ))}</div>
          </fieldset>
          <label htmlFor="ce-loc">Location <span className="dim">(optional)</span></label>
          <input id="ce-loc" type="text" value={draft.location ?? ""} onChange={e => setDraft(d => ({ ...d, location: e.target.value }))} />
          <label htmlFor="ce-note">Note <span className="dim">(optional)</span></label>
          <input id="ce-note" type="text" value={draft.note ?? ""} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
          <div className="btn-row gap-top">
            <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add event"}</button>
            {draft.id && <button type="button" className="btn" onClick={() => setDraft(blank)}>New event</button>}
          </div>
        </fieldset>
      )}
      <StatusMsg msg={msg} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Competition registrations (recorded in the app)
// ---------------------------------------------------------------------------
const REG_LABEL: Record<string, string> = { registered: "Registered", declined: "Declined", not_selected: "Not selected" };
export function RegistrationsEditor({ open, onClose, comps, compId, clubId, squads, eligibleSquads, editableSquads, onSaved }: {
  open: boolean; onClose: () => void; comps: BoardComp[]; compId: string | null; clubId: string; squads: BoardSquad[];
  eligibleSquads: (compId: string) => string[]; editableSquads: Set<string> | null; onSaved: () => void;
}) {
  const [cid, setCid] = useState<string | null>(compId);
  const [squad, setSquad] = useState("");
  const [rows, setRows] = useState<RegSwimmer[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { if (open) { setCid(compId ?? comps[0]?.id ?? null); setMsg(null); } }, [open, compId, comps]);
  const elig = cid ? eligibleSquads(cid) : [];
  useEffect(() => {
    if (!open || !cid) return;
    let live = true;
    setRows(null);
    loadRegistrations(cid, clubId, elig.length ? elig : null).then(r => { if (live) setRows(r); }).catch(e => setMsg({ text: "Couldn't load swimmers: " + (e as Error).message, error: true }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cid, clubId, elig.join(",")]);
  const set = async (sw: RegSwimmer, status: string) => {
    const prev = sw.status;
    setRows(rs => rs && rs.map(r => (r.id === sw.id ? { ...r, status: status || null } : r)));
    try { await setRegistration(cid!, sw.id, status || null); onSaved(); }
    catch (e) { setRows(rs => rs && rs.map(r => (r.id === sw.id ? { ...r, status: prev } : r))); setMsg({ text: errText(e), error: true }); }
  };
  const shown = (rows ?? []).filter(r => !squad || r.squad_id === squad);
  const count = (s: string) => shown.filter(r => r.status === s).length;
  const sqName = (id: string | null) => squads.find(s => s.id === id)?.name ?? "No squad";
  return (
    <Modal open={open} onClose={onClose} title="Competition registrations" wide>
      <div className="field-pair">
        <div>
          <label htmlFor="rg-comp">Competition</label>
          <select id="rg-comp" value={cid ?? ""} onChange={e => setCid(e.target.value)}>
            {comps.map(c => <option key={c.id} value={c.id}>{fmtDate(c.date_from)} · {c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rg-squad">Squad</label>
          <select id="rg-squad" value={squad} onChange={e => setSquad(e.target.value)}>
            <option value="">All eligible squads</option>
            {squads.filter(s => !elig.length || elig.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {rows && <p className="dim small">{count("registered")} registered · {shown.length - count("registered")} not registered{elig.length ? " · eligible squads come from the macro-cycles linked to this competition" : ""}</p>}
      {!rows ? <p className="dim">Loading swimmers…</p> : !shown.length ? <p className="dim">No active swimmers in these squads.</p> : (
        <div className="table-scroll">
          <table className="data">
            <thead><tr><th>Swimmer</th><th>Squad</th><th>Registration</th></tr></thead>
            <tbody>
              {shown.map(r => {
                const can = !editableSquads || (r.squad_id != null && editableSquads.has(r.squad_id));
                return (
                  <tr key={r.id}>
                    <th>{r.full_name}</th>
                    <td>{sqName(r.squad_id)}</td>
                    <td>
                      {can ? (
                        <select aria-label={`Registration for ${r.full_name}`} value={r.status ?? ""} onChange={e => set(r, e.target.value)}>
                          <option value="">Not registered</option>
                          {Object.entries(REG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : <span className="dim">{r.status ? REG_LABEL[r.status] : "Not registered"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <StatusMsg msg={msg} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Club competition standard (CQT / CCT) — club admin
// ---------------------------------------------------------------------------
export function StandardEditor({ open, onClose, seasonId, seasonTitle, onSaved }: { open: boolean; onClose: () => void; seasonId: string; seasonTitle: string; onSaved: () => void; }) {
  const opts = useQuery({ queryKey: ["std_opts"], enabled: open, staleTime: 10 * 60 * 1000, queryFn: loadStandardOptions });
  const cur = useQuery({ queryKey: ["std", seasonId], enabled: open, queryFn: () => loadStandard(seasonId) });
  const [county, setCounty] = useState("");
  const [cqt, setCqt] = useState("");
  const [cct, setCct] = useState("");
  const [ageAt, setAgeAt] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const s = cur.data;
    setCounty(s?.county ?? ""); setCqt(s ? s.cqt_gala_id + "|" + s.cqt_time_type : "");
    setCct(s?.cct_gala_id ? s.cct_gala_id + "|" + s.cct_time_type : ""); setAgeAt(s?.age_at ?? ""); setMsg(null);
  }, [open, cur.data]);
  const save = async () => {
    if (!county.trim()) return setMsg({ text: "Name the county (e.g. Surrey or Sussex).", error: true });
    if (!cqt) return setMsg({ text: "Choose the standard used as the CQT.", error: true });
    const [g, t] = cqt.split("|"); const [cg, ct] = cct ? cct.split("|") : [null, null];
    setBusy(true); setMsg(null);
    try {
      await saveStandard(seasonId, { county: county.trim(), cqt_gala_id: g, cqt_time_type: t, cct_gala_id: cg, cct_time_type: ct, age_at: ageAt || null });
      onSaved(); cur.refetch(); setMsg({ text: "Standard confirmed for " + seasonTitle + "." });
    } catch (e) { console.error(e); setMsg({ text: errText(e), error: true }); } finally { setBusy(false); }
  };
  const label = (o: { gala: string; time_type: string; rows: number }) => `${o.gala} · ${o.time_type} (${o.rows} ${o.rows === 1 ? "time" : "times"})`;
  return (
    <Modal open={open} onClose={onClose} title="Competition standard">
      <p className="dim small">Your club confirms which county times count as the <strong>CQT</strong> (qualifying) and the <strong>CCT</strong> (consideration) for {seasonTitle}. There is no default.</p>
      {cur.data && <p className="small">Confirmed {fmtDate(cur.data.confirmed_at.slice(0, 10))}.</p>}
      <label htmlFor="st-county">County</label>
      <input id="st-county" type="text" value={county} placeholder="e.g. Surrey" onChange={e => setCounty(e.target.value)} />
      <label htmlFor="st-cqt">CQT — county qualifying time</label>
      <select id="st-cqt" value={cqt} onChange={e => setCqt(e.target.value)}>
        <option value="">Choose…</option>
        {(opts.data ?? []).map(o => <option key={o.gala_id + o.time_type} value={o.gala_id + "|" + o.time_type}>{label(o)}</option>)}
      </select>
      <label htmlFor="st-cct">CCT — county consideration time</label>
      <select id="st-cct" value={cct} onChange={e => setCct(e.target.value)}>
        <option value="">None — the county has no separate consideration time</option>
        {(opts.data ?? []).map(o => <option key={o.gala_id + o.time_type} value={o.gala_id + "|" + o.time_type}>{label(o)}</option>)}
      </select>
      <label htmlFor="st-age">Age taken at <span className="dim">(optional — default 31 December of the season's final year)</span></label>
      <input id="st-age" type="date" value={ageAt} onChange={e => setAgeAt(e.target.value)} />
      {opts.data && !opts.data.length && <p className="notice warn small">No county times are loaded yet. Add them first, then set the standard.</p>}
      <div className="btn-row gap-top"><button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Confirm standard"}</button></div>
      <StatusMsg msg={msg} />
    </Modal>
  );
}
