import { Suspense, lazy, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { StepTabs } from "../../components/feedbackParts";
import { deactivateSwimmer, loadSquadCounts, moveToSquad } from "../../lib/admin";
import { fmtSessions } from "../../lib/attendance";
import { calcAge } from "../../lib/results";
import { loadResults } from "../../lib/swimmers";
import {
  currentRegYear, last90, loadAccountOptions, loadAthlete, loadAthleteAttendance, loadMedical, loadSeRegs, loadSwimmerFees,
  saveAthlete, saveFees, saveMedical, saveSeReg, yearOf, type AthleteDetail, type EmergencyContact, type Fee, type Medical, type SeReg
} from "../../lib/membership";
import { fmtDate, isoAdd, todayLocal } from "../../lib/util";
import { EventDetail, PbList } from "../SwimmerProfile";
import { FeesEditor } from "./FeesEditor";
import { Area, Fieldset, ProfileFooter, ReadOnly, Sel, Txt } from "./parts";

const TestSetCard = lazy(() => import("../../components/TestSetCard"));

type Tab = "details" | "attendance" | "pbs" | "tests";
const blankMedical = (id: string): Medical => ({ swimmer_id: id, conditions: null, medication: null, allergies: null, other_notes: null, gp_name: null, gp_phone: null, consent_emergency_treatment: null, reviewed_on: null });

// The athlete's full profile, opened from the Athletes table or from an account.
// Tabs: Details (default) · Attendance · Personal bests & history · Test sets. Save / Close.

export function AthleteProfile({ swimmerId, club, canEdit, canEditMedical, canSeeMedical, onClose }: {
  swimmerId: string; club: string; canEdit: boolean; canEditMedical: boolean; canSeeMedical: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("details");
  const q = useQuery({ queryKey: ["mb_athlete", swimmerId], queryFn: () => loadAthlete(swimmerId) });
  const med = useQuery({ queryKey: ["mb_medical", swimmerId], enabled: canSeeMedical, queryFn: () => loadMedical(swimmerId) });
  const fees = useQuery({ queryKey: ["mb_fees_sw", swimmerId], queryFn: () => loadSwimmerFees(swimmerId) });
  const regs = useQuery({ queryKey: ["mb_regs", swimmerId], queryFn: () => loadSeRegs(swimmerId) });
  const accounts = useQuery({ queryKey: ["mb_account_opts", club], enabled: canEdit, queryFn: () => loadAccountOptions(club) });
  const squads = useQuery({ queryKey: ["mb_squads", club], enabled: canEdit, queryFn: () => loadSquadCounts(club) });

  const [d, setD] = useState<AthleteDetail | null>(null);
  const [m, setM] = useState<Medical | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [feeRows, setFeeRows] = useState<Fee[]>([]);
  const [removedFees, setRemovedFees] = useState<string[]>([]);
  const [regRows, setRegRows] = useState<SeReg[]>([]);
  const [dirty, setDirty] = useState({ details: false, medical: false, fees: false, regs: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => { if (q.data) { setD(q.data.athlete); setDirty(x => ({ ...x, details: false })); } }, [q.data]);
  useEffect(() => { if (med.data) { setM(med.data.medical ?? blankMedical(swimmerId)); setContacts(med.data.contacts); setDirty(x => ({ ...x, medical: false })); } }, [med.data, swimmerId]);
  useEffect(() => { if (fees.data) { setFeeRows(fees.data); setRemovedFees([]); setDirty(x => ({ ...x, fees: false })); } }, [fees.data]);
  useEffect(() => { if (regs.data) { setRegRows(regs.data); setDirty(x => ({ ...x, regs: false })); } }, [regs.data]);

  const anyDirty = Object.values(dirty).some(Boolean);
  const mark = (k: keyof typeof dirty) => { setDirty(x => ({ ...x, [k]: true })); setMsg(null); };
  const setDet = <K extends keyof AthleteDetail>(k: K, v: AthleteDetail[K]) => { setD(x => (x ? { ...x, [k]: v } : x)); mark("details"); };
  const setMed = <K extends keyof Medical>(k: K, v: Medical[K]) => { setM(x => (x ? { ...x, [k]: v } : x)); mark("medical"); };

  const save = async () => {
    if (!d) return;
    setBusy(true); setMsg(null);
    try {
      if (dirty.details && canEdit) await saveAthlete(swimmerId, d);
      if (dirty.medical && canEditMedical && m) await saveMedical(swimmerId, m, contacts);
      if (dirty.fees && canEdit && d.account_id) await saveFees(club, d.account_id, feeRows.map(f => ({ ...f, account_id: d.account_id!, swimmer_id: swimmerId })), removedFees);
      if (dirty.regs && canEdit) for (const r of regRows) await saveSeReg(r);
      await Promise.all(["mb_athlete", "mb_medical", "mb_fees_sw", "mb_regs"].map(k => qc.invalidateQueries({ queryKey: [k, swimmerId] })));
      qc.invalidateQueries({ queryKey: ["mb_athletes"] }); qc.invalidateQueries({ queryKey: ["mb_accounts"] }); qc.invalidateQueries({ queryKey: ["mb_regs_club"] });
      setDirty({ details: false, medical: false, fees: false, regs: false });
      setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: "Couldn't save — " + (e as Error).message }); }
    finally { setBusy(false); }
  };

  const canSave = canEdit || canEditMedical;
  const close = () => (anyDirty && canSave ? setConfirmClose(true) : onClose());

  return (
    <Modal open wide onClose={close} title={d?.full_name ?? "Athlete"}>
      <StepTabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: "details", label: "Details" }, { key: "attendance", label: "Attendance" },
        { key: "pbs", label: "Personal bests" }, { key: "tests", label: "Test sets" }
      ]} />
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load this athlete.</p>}
      {d && q.data && (
        <div className="profile-body">
          {tab === "details" && (
            <>
              {!canEdit && <p className="notice">Read only for your role.</p>}
              <Fieldset title="Athlete">
                <Txt label="Full name" value={d.full_name} onChange={v => setDet("full_name", v)} disabled={!canEdit} />
                <Txt label="Date of birth" type="date" value={d.date_of_birth} onChange={v => setDet("date_of_birth", v || null)} disabled={!canEdit} />
                <ReadOnly label="Age" value={calcAge(d.date_of_birth) ?? "—"} />
                <ReadOnly label="Year of birth" value={yearOf(d.date_of_birth) ?? "—"} />
                <Sel label="Gender" value={d.gender} onChange={v => setDet("gender", v || null)} disabled={!canEdit} blank="—" options={[["F", "Female"], ["M", "Male"]]} />
                <Txt label="England registration number" value={d.swim_england_id} onChange={v => setDet("swim_england_id", v)} disabled={!canEdit} />
                <Txt label="Joined club" type="date" value={d.joined_club_on} onChange={v => setDet("joined_club_on", v || null)} disabled={!canEdit} />
                <ReadOnly label="Total PBs" value={q.data.pbCount} />
                <ReadOnly label="Status" value={<span className="chip st-live">Active</span>} />
                {canEdit
                  ? <Sel label="Account holder" value={d.account_id} onChange={v => setDet("account_id", v || null)} blank="No account" options={(accounts.data ?? []).map(a => ({ value: a.id, label: a.label }))} />
                  : <ReadOnly label="Account holder" value={d.account_id ? "Linked" : "None"} />}
              </Fieldset>

              <SquadSection squad={d.squad} squadId={d.squad_id} history={q.data.history} canEdit={canEdit}
                squads={squads.data ?? []} onMoved={() => { qc.invalidateQueries({ queryKey: ["mb_athlete", swimmerId] }); qc.invalidateQueries({ queryKey: ["mb_athletes"] }); }} swimmerId={swimmerId} />

              <Fieldset title="Swim England registration" actions={canEdit && !regRows.some(r => r.reg_year === currentRegYear()) && (
                <button type="button" className="btn small" onClick={() => { setRegRows([{ swimmer_id: swimmerId, reg_year: currentRegYear(), category: "2", status: "pending", registered_on: null, expires_on: `${currentRegYear()}-12-31`, notes: null }, ...regRows]); mark("regs"); }}>+ {currentRegYear()} registration</button>
              )}>
                <div className="mf wide"><RegTable rows={regRows} canEdit={canEdit} onChange={rows => { setRegRows(rows); mark("regs"); }} /></div>
              </Fieldset>

              <Fieldset title="Billing (this athlete)">
                <div className="mf wide">
                  <FeesEditor fees={feeRows} setFees={f => { setFeeRows(f); mark("fees"); }} onRemove={id => setRemovedFees(r => [...r, id])}
                    accountId={d.account_id} athletes={[{ id: swimmerId, full_name: d.full_name }]} fixedSwimmer={swimmerId} canEdit={canEdit && !!q.data.athlete.account_id} />
                </div>
              </Fieldset>

              {canSeeMedical
                ? <MedicalSection m={m} contacts={contacts} canEdit={canEditMedical} loading={med.isLoading} error={!!med.error}
                    setMed={setMed} setContacts={c => { setContacts(c); mark("medical"); }} />
                : <p className="notice">Medical information is only visible to the club admin, head coach and the athlete's squad coaches.</p>}

              <StatusSection swimmerId={swimmerId} canEdit={canEdit} onDone={() => { qc.invalidateQueries({ queryKey: ["mb_athletes"] }); onClose(); }} />
            </>
          )}

          {tab === "attendance" && <AttendanceTab swimmerId={swimmerId} />}
          {tab === "pbs" && <PbTab swimmerId={swimmerId} />}
          {tab === "tests" && <Suspense fallback={<p className="dim">Loading…</p>}><TestSetCard swimmerId={swimmerId} /></Suspense>}

          <ProfileFooter canSave={canSave && tab === "details"} dirty={anyDirty} busy={busy} msg={msg} onSave={save} onClose={onClose} confirmClose={confirmClose} setConfirmClose={setConfirmClose} />
        </div>
      )}
    </Modal>
  );
}

function SquadSection({ squad, squadId, history, canEdit, squads, onMoved, swimmerId }: {
  squad: string | null; squadId: string | null; history: { id: string; squad: string; joined: string; left: string | null }[];
  canEdit: boolean; squads: { id: string; name: string }[]; onMoved: () => void; swimmerId: string;
}) {
  const [to, setTo] = useState("");
  const [on, setOn] = useState(todayLocal().date);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const move = async () => {
    setBusy(true); setErr(null);
    try { await moveToSquad(swimmerId, to, on); setTo(""); onMoved(); }
    catch (e) { setErr("Couldn't move squad — " + (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Fieldset title="Squad registration">
      <ReadOnly label="Current squad" value={squad} />
      {canEdit && (
        <>
          <Sel label="Move to squad" value={to} onChange={setTo} blank="Choose…" options={squads.filter(s => s.id !== squadId).map(s => ({ value: s.id, label: s.name }))} />
          <Txt label="Move date" type="date" value={on} onChange={setOn} />
          <div className="mf"><span className="mf-label">&nbsp;</span><button type="button" className="btn small" disabled={!to || !on || busy} onClick={move}>{busy ? "Moving…" : "Move now"}</button></div>
        </>
      )}
      {err && <p className="msg error mf wide" role="alert">{err}</p>}
      <div className="mf wide">
        <span className="mf-label">Squad history</span>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Squad</th><th scope="col">Joined</th><th scope="col">Left</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={3} className="dim">No squad history recorded.</td></tr>}
              {history.map(h => <tr key={h.id}><th scope="row">{h.squad}</th><td>{fmtDate(h.joined)}</td><td>{h.left ? fmtDate(h.left) : <span className="chip">current</span>}</td></tr>)}
            </tbody>
          </table>
        </div>
        {canEdit && <p className="hint">Moving squad takes effect straight away and is recorded in the history (separate from Save).</p>}
      </div>
    </Fieldset>
  );
}

function RegTable({ rows, canEdit, onChange }: { rows: SeReg[]; canEdit: boolean; onChange: (r: SeReg[]) => void }) {
  const upd = (i: number, p: Partial<SeReg>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th scope="col">Year</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col">Expires</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="dim">No Swim England registration recorded.</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id ?? "n" + i}>
              <th scope="row">{r.reg_year}</th>
              <td>{canEdit ? <select aria-label="Category" value={r.category} onChange={e => upd(i, { category: e.target.value as SeReg["category"] })}><option value="1">Cat 1</option><option value="2">Cat 2</option><option value="3">Cat 3</option></select> : `Cat ${r.category}`}</td>
              <td>{canEdit ? <select aria-label="Status" value={r.status} onChange={e => upd(i, { status: e.target.value as SeReg["status"], registered_on: e.target.value === "registered" ? (r.registered_on || todayLocal().date) : r.registered_on })}><option value="pending">Pending</option><option value="registered">Registered</option><option value="lapsed">Lapsed</option><option value="transferred">Transferred</option></select> : r.status}</td>
              <td>{canEdit ? <input aria-label="Registered on" type="date" value={r.registered_on ?? ""} onChange={e => upd(i, { registered_on: e.target.value || null })} /> : fmtDate(r.registered_on) || "—"}</td>
              <td>{canEdit ? <input aria-label="Expires on" type="date" value={r.expires_on ?? ""} onChange={e => upd(i, { expires_on: e.target.value || null })} /> : fmtDate(r.expires_on) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MedicalSection({ m, contacts, canEdit, loading, error, setMed, setContacts }: {
  m: Medical | null; contacts: EmergencyContact[]; canEdit: boolean; loading: boolean; error: boolean;
  setMed: <K extends keyof Medical>(k: K, v: Medical[K]) => void; setContacts: (c: EmergencyContact[]) => void;
}) {
  if (loading) return <p className="dim">Loading medical information…</p>;
  if (error || !m) return <p className="msg error">Couldn't load medical information.</p>;
  const updC = (i: number, p: Partial<EmergencyContact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <>
      <Fieldset title="Medical information">
        <p className="hint mf wide">Confidential. Visible to club admins, the head coach and this athlete's squad coaches. Record only what coaches need to keep the athlete safe.</p>
        <Area label="Medical conditions" value={m.conditions} onChange={v => setMed("conditions", v)} disabled={!canEdit} />
        <Area label="Medication" value={m.medication} onChange={v => setMed("medication", v)} disabled={!canEdit} />
        <Area label="Allergies" value={m.allergies} onChange={v => setMed("allergies", v)} disabled={!canEdit} />
        <Area label="Other notes for coaches" value={m.other_notes} onChange={v => setMed("other_notes", v)} disabled={!canEdit} />
        <Txt label="GP name / practice" value={m.gp_name} onChange={v => setMed("gp_name", v)} disabled={!canEdit} />
        <Txt label="GP phone" type="tel" value={m.gp_phone} onChange={v => setMed("gp_phone", v)} disabled={!canEdit} />
        <Sel label="Consent to emergency treatment" value={m.consent_emergency_treatment == null ? "" : m.consent_emergency_treatment ? "yes" : "no"} disabled={!canEdit}
          onChange={v => setMed("consent_emergency_treatment", v === "" ? null : v === "yes")} blank="Not recorded" options={[["yes", "Given"], ["no", "Not given"]]} />
        <Txt label="Medical date (last checked)" type="date" value={m.reviewed_on} onChange={v => setMed("reviewed_on", v || null)} disabled={!canEdit} />
      </Fieldset>
      <Fieldset title="Emergency contacts" actions={canEdit && contacts.length < 5 && <button type="button" className="btn small" onClick={() => setContacts([...contacts, { priority: contacts.length + 1, full_name: "", relationship: null, phone: "", phone_alt: null }])}>+ Add contact</button>}>
        {contacts.length === 0 && <p className="dim mf wide">No emergency contacts recorded.</p>}
        {contacts.map((c, i) => (
          <div key={c.id ?? "c" + i} className="mf-row wide">
            <span className="chip">{i + 1}</span>
            <Txt label="Name" value={c.full_name} onChange={v => updC(i, { full_name: v })} disabled={!canEdit} />
            <Txt label="Relationship" value={c.relationship} onChange={v => updC(i, { relationship: v })} disabled={!canEdit} />
            <Txt label="Phone" type="tel" value={c.phone} onChange={v => updC(i, { phone: v })} disabled={!canEdit} />
            <Txt label="Other phone" type="tel" value={c.phone_alt} onChange={v => updC(i, { phone_alt: v })} disabled={!canEdit} />
            {canEdit && <button type="button" className="link-btn" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>remove</button>}
          </div>
        ))}
      </Fieldset>
    </>
  );
}

function StatusSection({ swimmerId, canEdit, onDone }: { swimmerId: string; canEdit: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canEdit) return null;
  const go = async () => {
    setBusy(true); setErr(null);
    try { await deactivateSwimmer(swimmerId, reason); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Fieldset title="Status">
      <p className="mf wide">Active. Making an athlete inactive (today's date) removes them from searches, closes their squad membership and anonymises their results in club statistics. A club admin can reactivate them from the Athletes table.</p>
      {!open
        ? <div className="mf"><button type="button" className="btn small danger-outline" onClick={() => setOpen(true)}>Make inactive…</button></div>
        : (
          <>
            <Txt label="Reason (optional)" value={reason} onChange={setReason} />
            <div className="mf"><span className="mf-label">&nbsp;</span>
              <div className="btn-row">
                <button type="button" className="btn small danger" disabled={busy} onClick={go}>{busy ? "Working…" : "Confirm inactive"}</button>
                <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          </>
        )}
      {err && <p className="msg error mf wide" role="alert">{err}</p>}
    </Fieldset>
  );
}

function AttendanceTab({ swimmerId }: { swimmerId: string }) {
  const [range, setRange] = useState(last90);
  const q = useQuery({ queryKey: ["mb_att", swimmerId, range.from, range.to], enabled: !!range.from && !!range.to && range.from <= range.to, queryFn: () => loadAthleteAttendance(swimmerId, range.from, range.to) });
  const t = todayLocal().date;
  const quick = [
    { label: "Last 90 days", r: last90() },
    { label: "Last 30 days", r: { from: isoAdd(t, -29), to: t } },
    { label: "This year", r: { from: t.slice(0, 4) + "-01-01", to: t } }
  ];
  const s = q.data?.summary;
  return (
    <>
      <div className="att-range">
        <div className="field-pair">
          <Txt label="Start date" type="date" value={range.from} onChange={v => setRange(r => ({ ...r, from: v }))} />
          <Txt label="End date" type="date" value={range.to} onChange={v => setRange(r => ({ ...r, to: v }))} />
        </div>
        <div className="chip-row">
          {quick.map(x => <button key={x.label} type="button" className={"btn small" + (range.from === x.r.from && range.to === x.r.to ? " primary" : "")} onClick={() => setRange(x.r)}>{x.label}</button>)}
        </div>
      </div>
      {range.from > range.to && <p className="msg error">The start date is after the end date.</p>}
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load attendance.</p>}
      {s && (
        <>
          <div className="stat-row four">
            <div className="stat"><span className="stat-label">Attended</span><span className="stat-value">{s.full}</span><span className="stat-note">whole sessions</span></div>
            <div className="stat"><span className="stat-label">Partially attended</span><span className="stat-value">{s.partial}</span></div>
            <div className="stat"><span className="stat-label">Not attended</span><span className="stat-value">{s.notAttended}</span><span className="stat-note">{s.excused ? `${s.excused} excused, not counted` : "excused not counted"}</span></div>
            <div className="stat"><span className="stat-label">Average attendance</span><span className="stat-value">{s.pct == null ? "–" : `${s.pct}%`}</span><span className="stat-note">{fmtSessions(s.attended)} of {s.counted} sessions · {fmtSessions(s.hours)} h</span></div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Mark</th><th scope="col">Note</th></tr></thead>
              <tbody>
                {q.data!.rows.length === 0 && <tr><td colSpan={4} className="dim">No registers marked in this period.</td></tr>}
                {q.data!.rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row" className="nowrap">{fmtDate(r.session_date)}</th>
                    <td>{r.session_time?.slice(0, 5)}</td>
                    <td>{r.status === "partial" ? `Partial · ${r.minutes_attended ?? "?"} of ${r.session_minutes ?? "?"} min` : r.status === "in" || (!r.status && r.present) ? "In" : r.status === "excused" ? "Excused" : "Out"}</td>
                    <td>{r.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Same rule as the rest of the app: a partial counts as the part of the session attended; excused isn't counted.</p>
        </>
      )}
    </>
  );
}

function PbTab({ swimmerId }: { swimmerId: string }) {
  const [event, setEvent] = useState<string | null>(null);
  const r = useQuery({ queryKey: ["swp_results", swimmerId], queryFn: () => loadResults(swimmerId) });
  return event
    ? <EventDetail event={event} rows={r.data ?? []} onBack={() => setEvent(null)} />
    : <PbList rows={r.data ?? []} loading={r.isLoading} error={!!r.error} onOpen={setEvent} />;
}

/** Read-only medical + emergency contacts card for the Swimmers profile (coaches see their own squads). */
export function MedicalCard({ swimmerId }: { swimmerId: string }) {
  const q = useQuery({ queryKey: ["mb_medical", swimmerId], queryFn: () => loadMedical(swimmerId) });
  const m = q.data?.medical;
  const rows: [string, string | null | undefined][] = m ? [
    ["Conditions", m.conditions], ["Medication", m.medication], ["Allergies", m.allergies], ["Notes", m.other_notes],
    ["GP", [m.gp_name, m.gp_phone].filter(Boolean).join(" · ")],
    ["Emergency treatment consent", m.consent_emergency_treatment == null ? null : m.consent_emergency_treatment ? "Given" : "Not given"]
  ] : [];
  return (
    <section className="card">
      <h2 className="card-title">Medical &amp; emergency contacts <span className="dim">(confidential)</span></h2>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load medical information.</p>}
      {q.data && !m && <p className="dim">No medical information recorded.</p>}
      {m && (
        <dl className="med-list">
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          {m.reviewed_on && <div><dt>Last checked</dt><dd>{fmtDate(m.reviewed_on)}</dd></div>}
        </dl>
      )}
      {q.data && (
        <ul className="linked-list">
          {q.data.contacts.length === 0 && <li className="dim">No emergency contacts recorded.</li>}
          {q.data.contacts.map(c => <li key={c.id}><strong>{c.priority}. {c.full_name}</strong><span className="dim">{c.relationship}</span><a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>{c.phone_alt && <a href={`tel:${c.phone_alt.replace(/\s/g, "")}`}>{c.phone_alt}</a>}</li>)}
        </ul>
      )}
    </section>
  );
}
