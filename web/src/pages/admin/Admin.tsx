import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, sectionLevel } from "../../lib/access";
import {
  addMember, addSquad, deactivateSwimmer, loadActiveSwimmers, loadAllClubs, loadDeactivated, loadSquadCounts, loadSwimmerDetail, loadUnassigned,
  moveToClub, moveToSquad, reactivateSwimmer, renameSquad, timeIn, validateMember, type MemberDraft, type PickSwimmer
} from "../../lib/admin";
import { fmtDate, todayLocal } from "../../lib/util";
import { usePlanSquads } from "../plans/PlanList";
import { StatusMsg } from "../../components/seasonParts";
import { AdminGate, NamePicker } from "../../components/adminParts";

type Msg = { text: string; error?: boolean } | null;
const errText = (e: unknown, prefix: string) => (e as Error).message?.startsWith("That squad") ? (e as Error).message : `${prefix} — ${(e as Error).message}`;
/** Everything that lists swimmers or squads, so the rest of the app shows changes at once. */
function useRefreshSwimmers() {
  const qc = useQueryClient();
  return () => ["roster", "swimmer", "fb_squads", "fb_swimmers", "sqf_squads", "att_squads", "plan_squads", "admin_squads", "admin_swimmers", "admin_unassigned", "admin_deact", "admin_detail", "reg_swimmers", "cmp_swimmers", "home_stats", "coaching_clubs"]
    .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

const TILES = [
  { to: "/admin/squads", icon: "🏷️", title: "Manage squads", sub: "Rename squads · add a new squad" },
  { to: "/admin/add-member", icon: "➕", title: "Add new member", sub: "Register a swimmer & parent contact" },
  { to: "/admin/move-squad", icon: "🔄", title: "Move a swimmer's squad", sub: "Date-stamped — tracks time in each squad" },
  { to: "/admin/move-club", icon: "🔀", title: "Move a swimmer's club", sub: "Transfer to a different club & squad" },
  { to: "/admin/deactivate", icon: "🗄️", title: "Deactivate or reactivate a swimmer", sub: "Anonymise & archive · restore later" },
  { to: "/admin/users", icon: "👥", title: "Users & roles", sub: "Invite coaches, helpers & parents · choose what they can see" }
];

export function Admin() {
  const { access } = useAuth();
  const level = sectionLevel(access, "admin");
  if (!canEdit(level)) return <><div className="page-head"><h1>Admin</h1></div><p className="notice warn">Your role doesn't have access to Admin.</p></>;
  return (
    <>
      <div className="page-head"><h1><span aria-hidden="true">⚙️</span> Admin</h1><p className="dim">Squads, members and users</p></div>
      <ClubPicker />
      <div className="tile-grid gap-top">
        {TILES.map(t => (
          <Link key={t.to} to={t.to} className="tile">
            <span className="tile-icon" aria-hidden="true">{t.icon}</span>
            <span className="tile-text"><strong>{t.title}</strong><span className="dim">{t.sub}</span></span>
          </Link>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function ManageSquads() {
  const { club } = useClub();
  const refresh = useRefreshSwimmers();
  const q = useQuery({ queryKey: ["admin_squads", club], enabled: !!club, queryFn: () => loadSquadCounts(club!) });
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const add = async () => {
    setMsg(null);
    if (!name.trim()) { setMsg({ text: "Enter a squad name.", error: true }); return; }
    setBusy("add");
    try { await addSquad(club!, name.trim()); setName(""); setMsg({ text: "Squad added." }); refresh(); }
    catch (e) { setMsg({ text: errText(e, "Add failed"), error: true }); }
    finally { setBusy(null); }
  };
  const rename = async (id: string, orig: string) => {
    const v = (edits[id] ?? orig).trim();
    if (!v) { setEdits(x => ({ ...x, [id]: orig })); return; }
    if (v === orig) return;
    setBusy(id);
    try { await renameSquad(id, v); setRowMsg(x => ({ ...x, [id]: "Saved" })); setEdits(x => { const n = { ...x }; delete n[id]; return n; }); refresh(); }
    catch (e) { setRowMsg(x => ({ ...x, [id]: "Rename failed — " + (e as Error).message })); setEdits(x => ({ ...x, [id]: orig })); }
    finally { setBusy(null); }
  };

  return (
    <AdminGate title="Manage squads">
      <ClubPicker />
      <section className="card">
        <h2 className="card-title">Add a new squad</h2>
        <label htmlFor="sq-new" className="sr-only">New squad name</label>
        <div className="inline-add">
          <input id="sq-new" type="text" placeholder="New squad name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
          <button type="button" className="btn primary" onClick={add} disabled={busy === "add"}>Add</button>
        </div>
        <StatusMsg msg={msg} />
      </section>
      <section className="card">
        <h2 className="card-title">Rename existing squads</h2>
        <p className="hint top">Renaming updates the squad name on every swimmer in it.</p>
        {q.isLoading && <p className="dim">Loading…</p>}
        {q.error && <p className="msg error">Couldn't load squads.</p>}
        {q.data && !q.data.length && <p className="dim">No squads yet — add one above.</p>}
        <ul className="rename-list">
          {(q.data ?? []).map(s => (
            <li key={s.id}>
              <input type="text" aria-label={`Name for ${s.name}`} value={edits[s.id] ?? s.name} onChange={e => { setEdits(x => ({ ...x, [s.id]: e.target.value })); setRowMsg(x => ({ ...x, [s.id]: "" })); }} />
              <span className="dim small nowrap">{s.n} swimmer{s.n === 1 ? "" : "s"}</span>
              <button type="button" className="btn small" disabled={busy === s.id || (edits[s.id] ?? s.name) === s.name} onClick={() => rename(s.id, s.name)}>{busy === s.id ? "…" : "Save"}</button>
              {rowMsg[s.id] && <span className={"small full " + (rowMsg[s.id] === "Saved" ? "ok-text" : "warn-text")} role="status">{rowMsg[s.id]}</span>}
            </li>
          ))}
        </ul>
      </section>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
const blankMember = (): MemberDraft => ({ full_name: "", dob: "", seId: "", squadId: "", joined: todayLocal().date, parentName: "", parentPhone: "", parentEmail: "" });

export function AddMember() {
  const { club } = useClub();
  const refresh = useRefreshSwimmers();
  const squads = usePlanSquads(club);
  const [m, setM] = useState<MemberDraft>(blankMember);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const f = (k: keyof MemberDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setM(x => ({ ...x, [k]: e.target.value })); };

  const save = async () => {
    setMsg(null);
    const bad = validateMember(m);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try { await addMember(club!, m); setMsg({ text: `${m.full_name.trim()} added.` }); setM(blankMember()); refresh(); }
    catch (e) { console.error(e); setMsg({ text: "Add failed — " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <AdminGate title="Add new member">
      <ClubPicker />
      <section className="card">
        <h2 className="card-title">Swimmer</h2>
        <label htmlFor="am-name">Full name</label>
        <input id="am-name" type="text" autoComplete="off" placeholder="First and last name" value={m.full_name} onChange={f("full_name")} />
        <div className="field-pair">
          <div><label htmlFor="am-dob">Date of birth</label><input id="am-dob" type="date" value={m.dob} onChange={f("dob")} /></div>
          <div><label htmlFor="am-se">Swim England ID <span className="dim">(optional)</span></label><input id="am-se" type="text" inputMode="numeric" placeholder="e.g. 1234567" value={m.seId} onChange={f("seId")} /></div>
        </div>
        <div className="field-pair">
          <div>
            <label htmlFor="am-squad">Squad</label>
            <select id="am-squad" value={m.squadId} onChange={f("squadId")}>
              <option value="">— choose a squad —</option>
              {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label htmlFor="am-joined">Date joined club</label><input id="am-joined" type="date" value={m.joined} onChange={f("joined")} /></div>
        </div>
        <p className="hint">This date-stamps when the swimmer joined the club. Joining the squad above is date-stamped separately as today, so time-in-squad can be tracked.</p>
        <h2 className="card-title gap-top">Parent / guardian</h2>
        <label htmlFor="am-pname">Parent name</label>
        <input id="am-pname" type="text" autoComplete="off" placeholder="Parent or guardian full name" value={m.parentName} onChange={f("parentName")} />
        <div className="field-pair">
          <div><label htmlFor="am-phone">Telephone number</label><input id="am-phone" type="tel" autoComplete="off" placeholder="Mobile or landline" value={m.parentPhone} onChange={f("parentPhone")} /></div>
          <div><label htmlFor="am-email">Email address</label><input id="am-email" type="email" autoComplete="off" placeholder="name@example.com" value={m.parentEmail} onChange={f("parentEmail")} /></div>
        </div>
        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Adding…" : "Add member"}</button>
        <StatusMsg msg={msg} />
      </section>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
function DetailCard({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["admin_detail", id], queryFn: () => loadSwimmerDetail(id) });
  if (q.isLoading) return <p className="dim">Loading…</p>;
  if (!q.data) return null;
  const d = q.data, t = timeIn(d.since);
  return (
    <dl className="detail-list">
      <div><dt>Currently in</dt><dd>{d.squad || "no squad"}{t ? ` (${t})` : ""}</dd></div>
      {d.date_of_birth && <div><dt>DOB</dt><dd>{fmtDate(d.date_of_birth)}</dd></div>}
      {d.swim_england_id && <div><dt>Swim England ID</dt><dd>{d.swim_england_id}</dd></div>}
      {d.joined_club_on && <div><dt>Joined club</dt><dd>{fmtDate(d.joined_club_on)}</dd></div>}
      {d.parent_name && <div><dt>Parent</dt><dd>{d.parent_name}</dd></div>}
      {d.parent_phone && <div><dt>Tel</dt><dd><a href={`tel:${d.parent_phone}`}>{d.parent_phone}</a></dd></div>}
      {d.parent_email && <div><dt>Email</dt><dd><a href={`mailto:${d.parent_email}`}>{d.parent_email}</a></dd></div>}
    </dl>
  );
}

export function MoveSquad() {
  const { club } = useClub();
  const refresh = useRefreshSwimmers();
  const squads = usePlanSquads(club);
  const swimmers = useQuery({ queryKey: ["admin_swimmers", club], enabled: !!club, queryFn: () => loadActiveSwimmers(club!) });
  const unassigned = useQuery({ queryKey: ["admin_unassigned", club], enabled: !!club, queryFn: () => loadUnassigned(club!) });
  const [sel, setSel] = useState<PickSwimmer | null>(null);
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayLocal().date);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, string>>({});

  const move = async () => {
    setMsg(null);
    if (!sel) { setMsg({ text: "Pick a swimmer.", error: true }); return; }
    if (!to) { setMsg({ text: "Choose the squad to move to.", error: true }); return; }
    if (!date) { setMsg({ text: "Set the date of the move.", error: true }); return; }
    if (to === sel.squad_id) { setMsg({ text: "That's already their squad.", error: true }); return; }
    setBusy(true);
    try { await moveToSquad(sel.id, to, date); setMsg({ text: `${sel.full_name} moved.` }); setSel(null); setTo(""); refresh(); }
    catch (e) { console.error(e); setMsg({ text: "Move failed — " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };
  const assign = async (id: string) => {
    const sq = pick[id];
    if (!sq) { document.getElementById("un-" + id)?.focus(); return; }
    setRowState(x => ({ ...x, [id]: "…" }));
    try { await moveToSquad(id, sq, todayLocal().date); setRowState(x => ({ ...x, [id]: "Saved" })); refresh(); }
    catch (e) { setRowState(x => ({ ...x, [id]: "Save failed — " + (e as Error).message })); }
  };

  return (
    <AdminGate title="Move a swimmer's squad">
      <ClubPicker />
      <section className="card">
        <h2 className="card-title">Move a swimmer to a different squad</h2>
        <NamePicker id="mv-search" label="Swimmer" list={swimmers.data ?? []} loading={swimmers.isLoading} sel={sel} onPick={s => { setSel(s); setMsg(null); }} onClear={() => setSel(null)} />
        {sel && (
          <>
            <DetailCard id={sel.id} />
            <div className="field-pair">
              <div>
                <label htmlFor="mv-to">Move to squad</label>
                <select id="mv-to" value={to} onChange={e => setTo(e.target.value)}>
                  <option value="">— choose a squad —</option>
                  {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label htmlFor="mv-date">Date of move</label><input id="mv-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <p className="hint">This closes the current squad membership (setting its end date) and opens a new one from the date above, so the length of time in each squad is preserved.</p>
            <button type="button" className="btn primary wide" onClick={move} disabled={busy}>{busy ? "Moving…" : "Confirm move"}</button>
          </>
        )}
        <StatusMsg msg={msg} />
      </section>
      <section className="card">
        <h2 className="card-title">Swimmers without a squad {unassigned.data && unassigned.data.length > 0 && <span className="dim">({unassigned.data.length})</span>}</h2>
        <p className="hint top">Choose a squad and tap Save. The squad is date-stamped from today.</p>
        {unassigned.isLoading && <p className="dim">Loading…</p>}
        {unassigned.data && !unassigned.data.length && <p className="dim">Every swimmer has a squad.</p>}
        {!!unassigned.data?.length && (
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Swimmers without a squad</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Squad</th><th scope="col">New squad</th><th scope="col"><span className="sr-only">Save</span></th></tr></thead>
              <tbody>
                {unassigned.data.map(s => (
                  <tr key={s.id}>
                    <th scope="row">{s.full_name}</th>
                    <td className="dim nowrap">{s.squad || "None"}</td>
                    <td>
                      <select id={"un-" + s.id} aria-label={`New squad for ${s.full_name}`} value={pick[s.id] ?? ""} onChange={e => setPick(x => ({ ...x, [s.id]: e.target.value }))}>
                        <option value="">— choose —</option>
                        {(squads.data ?? []).map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn small" disabled={rowState[s.id] === "…"} onClick={() => assign(s.id)}>{rowState[s.id] === "Saved" ? "Saved" : rowState[s.id] === "…" ? "…" : "Save"}</button>
                      {rowState[s.id]?.startsWith("Save failed") && <span className="warn-text small block" role="alert">{rowState[s.id]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
export function MoveClub() {
  const { club } = useClub();
  const refresh = useRefreshSwimmers();
  const swimmers = useQuery({ queryKey: ["admin_swimmers", club], enabled: !!club, queryFn: () => loadActiveSwimmers(club!) });
  const clubs = useQuery({ queryKey: ["all_clubs"], staleTime: 10 * 60 * 1000, queryFn: loadAllClubs });
  const [sel, setSel] = useState<PickSwimmer | null>(null);
  const [toClub, setToClub] = useState("");
  const [toSquad, setToSquad] = useState("");
  const [date, setDate] = useState(todayLocal().date);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const squads = usePlanSquads(toClub || null);

  const move = async () => {
    setMsg(null);
    if (!sel) { setMsg({ text: "Pick a swimmer.", error: true }); return; }
    if (!toClub) { setMsg({ text: "Choose the club to move to.", error: true }); return; }
    if (toClub === sel.club) { setMsg({ text: "That's already their club.", error: true }); return; }
    if (!date) { setMsg({ text: "Set the date of the move.", error: true }); return; }
    setBusy(true);
    try { await moveToClub(sel.id, toClub, toSquad || null, date); setMsg({ text: `${sel.full_name} moved to ${toClub}.` }); setSel(null); setToClub(""); setToSquad(""); refresh(); }
    catch (e) { console.error(e); setMsg({ text: "Move failed — " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <AdminGate title="Move a swimmer's club">
      <ClubPicker />
      <section className="card">
        <h2 className="card-title">Move a swimmer to a different club</h2>
        <p className="hint top">Searches swimmers in the club selected above — switch clubs first if you're moving someone from a different one.</p>
        <NamePicker id="mc-search" label="Swimmer" list={swimmers.data ?? []} loading={swimmers.isLoading} sel={sel} tag={s => `${s.club}${s.squad ? " · " + s.squad : ""}`}
          onPick={s => { setSel(s); setMsg(null); setToClub(""); setToSquad(""); }} onClear={() => setSel(null)} />
        {sel && (
          <>
            <dl className="detail-list"><div><dt>Current club</dt><dd>{sel.club}</dd></div><div><dt>Current squad</dt><dd>{sel.squad || "no squad"}</dd></div></dl>
            <label htmlFor="mc-club">Move to club</label>
            <select id="mc-club" value={toClub} onChange={e => { setToClub(e.target.value); setToSquad(""); }}>
              <option value="">{clubs.isLoading ? "Loading…" : "— choose a club —"}</option>
              {(clubs.data ?? []).filter(c => c !== sel.club).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="field-pair">
              <div>
                <label htmlFor="mc-squad">New squad <span className="dim">(optional)</span></label>
                <select id="mc-squad" value={toSquad} onChange={e => setToSquad(e.target.value)} disabled={!toClub}>
                  <option value="">— no squad / TBC —</option>
                  {(toClub ? squads.data ?? [] : []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label htmlFor="mc-date">Date of move</label><input id="mc-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            </div>
            <p className="hint">This updates the swimmer's club, closes their current squad membership, and — if a new squad is chosen — opens a new one from the date above.</p>
            <button type="button" className="btn primary wide" onClick={move} disabled={busy}>{busy ? "Moving…" : "Confirm move"}</button>
          </>
        )}
        <StatusMsg msg={msg} />
      </section>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
export function Deactivate() {
  const { club } = useClub();
  const refresh = useRefreshSwimmers();
  const squads = usePlanSquads(club);
  const swimmers = useQuery({ queryKey: ["admin_swimmers", club], enabled: !!club, queryFn: () => loadActiveSwimmers(club!) });
  const archive = useQuery({ queryKey: ["admin_deact", club], enabled: !!club, queryFn: () => loadDeactivated(club!) });
  const [sel, setSel] = useState<PickSwimmer | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [aq, setAq] = useState("");
  const [returnTo, setReturnTo] = useState<Record<string, string>>({});
  const [restoreConfirm, setRestoreConfirm] = useState<string | null>(null);

  const deact = async () => {
    if (!sel) return;
    setBusy("deact"); setMsg(null);
    try { await deactivateSwimmer(sel.id, reason); setMsg({ text: `${sel.full_name} deactivated and archived.` }); setSel(null); setReason(""); refresh(); }
    catch (e) { setMsg({ text: "Deactivation failed — " + (e as Error).message, error: true }); }
    finally { setBusy(null); setConfirming(false); }
  };
  const restore = async (id: string, name: string, squadId: string | null) => {
    setBusy(id); setMsg(null);
    try { await reactivateSwimmer(id, squadId); setMsg({ text: `${name} reactivated.` }); refresh(); }
    catch (e) { setMsg({ text: "Reactivation failed — " + (e as Error).message, error: true }); }
    finally { setBusy(null); setRestoreConfirm(null); }
  };
  const t = aq.trim().toLowerCase();
  const rows = (archive.data ?? []).filter(a => !t || a.full_name.toLowerCase().includes(t) || a.anon_name.toLowerCase().includes(t));
  const sqs = squads.data ?? [];

  return (
    <AdminGate title="Deactivate or reactivate a swimmer">
      <ClubPicker />
      <StatusMsg msg={msg} />
      <section className="card">
        <h2 className="card-title">Deactivate a swimmer</h2>
        <NamePicker id="de-search" label="Swimmer" list={swimmers.data ?? []} loading={swimmers.isLoading} sel={sel} onPick={s => { setSel(s); setMsg(null); setConfirming(false); }} onClear={() => { setSel(null); setConfirming(false); }} />
        {sel && (
          <>
            <label htmlFor="de-reason">Reason <span className="dim">(optional)</span></label>
            <input id="de-reason" type="text" placeholder="e.g. Left the club" value={reason} onChange={e => setReason(e.target.value)} />
            <p className="hint">Their name, date of birth, Swim England ID and parent contact details move to a locked archive, and they are removed from every search in the app. Their results stay in group statistics, anonymised. Attendance and feedback are kept. Reactivating restores everything.</p>
            {!confirming
              ? <button type="button" className="btn danger wide" onClick={() => setConfirming(true)}>Deactivate swimmer</button>
              : (
                <div className="confirm-box" role="alert">
                  <p>Deactivate <strong>{sel.full_name}</strong>? They will disappear from all searches and their personal details will be archived. You can reactivate them from this screen.</p>
                  <div className="btn-row">
                    <button type="button" className="btn danger" onClick={deact} disabled={busy === "deact"}>{busy === "deact" ? "Deactivating…" : "Yes, deactivate"}</button>
                    <button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                  </div>
                </div>
              )}
          </>
        )}
      </section>
      <section className="card">
        <h2 className="card-title">Deactivated swimmers {!!archive.data?.length && <span className="dim">({archive.data.length})</span>}</h2>
        <label htmlFor="de-arch" className="sr-only">Search deactivated swimmers</label>
        <input id="de-arch" type="search" placeholder="Search deactivated swimmers…" autoComplete="off" value={aq} onChange={e => setAq(e.target.value)} />
        {archive.isLoading && <p className="dim">Loading…</p>}
        {archive.error && <p className="msg error">Could not load — {(archive.error as Error).message}</p>}
        {archive.data && !archive.data.length && <p className="dim">No deactivated swimmers.</p>}
        {archive.data && archive.data.length > 0 && !rows.length && <p className="dim">No matches.</p>}
        {rows.length > 0 && (
          <ul className="arch-list">
            {rows.map(a => {
              // "No squad" is only offered when their former squad no longer exists — reactivate_swimmer falls back to the former squad otherwise.
              const hasFormer = sqs.some(q => q.id === a.squad_id);
              const val = returnTo[a.swimmer_id] ?? (hasFormer ? a.squad_id! : "");
              return (
                <li key={a.swimmer_id}>
                  <div>
                    <strong>{a.full_name}</strong>
                    <div className="dim small">{[a.squad ? "was " + a.squad : "", `${a.result_count} result${a.result_count === 1 ? "" : "s"}`, a.reason || ""].filter(Boolean).join(" · ")}</div>
                    <div className="dim small">Deactivated {fmtDate(a.deactivated_on)}</div>
                  </div>
                  <div className="arch-actions">
                    <label className="sr-only" htmlFor={"rt-" + a.swimmer_id}>Return {a.full_name} to squad</label>
                    <select id={"rt-" + a.swimmer_id} value={val} onChange={e => setReturnTo(x => ({ ...x, [a.swimmer_id]: e.target.value }))}>
                      {!hasFormer && <option value="">— no squad —</option>}
                      {sqs.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                    </select>
                    {restoreConfirm === a.swimmer_id
                      ? <button type="button" className="btn small primary" disabled={busy === a.swimmer_id} onClick={() => restore(a.swimmer_id, a.full_name, val || null)}>{busy === a.swimmer_id ? "…" : "Confirm"}</button>
                      : <button type="button" className="btn small" onClick={() => setRestoreConfirm(a.swimmer_id)}>Reactivate</button>}
                  </div>
                  {restoreConfirm === a.swimmer_id && <p className="hint full">Their details, results notes and account links will be restored. <button type="button" className="link-btn" onClick={() => setRestoreConfirm(null)}>Cancel</button></p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminGate>
  );
}
