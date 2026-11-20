import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { AdminGate, NamePicker } from "../../components/adminParts";
import { StatusMsg } from "../../components/seasonParts";
import {
  dsarExport, eraseSwimmer, loadActiveSwimmers, loadDeactivated, runRetention,
  type EraseResult, type PickSwimmer, type RetentionDue, type RetentionRun
} from "../../lib/admin";
import { fmtDate, todayLocal } from "../../lib/util";

// Data protection tools for club admins (A-034 / A-035). The database functions check the
// user's role; this screen only gathers the request and shows the result.
// Procedures: "Subject access and erasure procedure" and "Retention schedule" docs.

type Msg = { text: string; error?: boolean } | null;
const errMsg = (e: unknown) => (e as Error).message || String(e);

/** Active and deactivated swimmers of the club, in one picker. Deactivated ones show their real name. */
function useAllSwimmers(club: string | null) {
  const active = useQuery({ queryKey: ["admin_swimmers", club], enabled: !!club, queryFn: () => loadActiveSwimmers(club!) });
  const deact = useQuery({ queryKey: ["admin_deact", club], enabled: !!club, queryFn: () => loadDeactivated(club!) });
  const list = useMemo<PickSwimmer[]>(() => [
    ...(active.data ?? []),
    ...(deact.data ?? []).map(a => ({ id: a.swimmer_id, full_name: a.full_name, squad: "deactivated " + fmtDate(a.deactivated_on), squad_id: null, club: club ?? "" }))
  ].sort((a, b) => a.full_name.localeCompare(b.full_name)), [active.data, deact.data, club]);
  return { list, loading: active.isLoading || deact.isLoading };
}

const SECTION_LABEL: Record<string, string> = {
  swimmer: "Member record", account: "Parent account", account_holders: "Guardians", linked_app_users: "App accounts linked",
  squad_memberships: "Squad history", attendance: "Attendance marks", swim_results: "Race results", feedback: "Coach feedback",
  assessments: "Squad ADA assessments", test_results: "Test set results", metrics_results: "Metrics & Measures results",
  metrics_trials: "Metrics & Measures swims", stopwatch_times: "Stopwatch times", medical: "Medical details",
  emergency_contacts: "Emergency contacts", fees: "Fees", swim_england_registrations: "Swim England registrations",
  competition_registrations: "Competition entries", archived_details: "Deactivation archive", free_text_mentions: "Name mentioned in free text"
};
const countOf = (v: unknown) => Array.isArray(v) ? v.length : v && typeof v === "object" ? 1 : 0;

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileStem = (name: string) => name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? "").join("") || "swimmer";

function MentionsTable({ rows }: { rows: { table: string; id: string; dated: string | null; matched: string }[] }) {
  if (!rows.length) return <p className="dim small">The name isn't mentioned in any session plan or feedback note.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Free text that mentions the swimmer</caption>
        <thead><tr><th scope="col">Where</th><th scope="col">Date</th><th scope="col">Matched</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.table + r.id}><td>{r.table.replace(/_/g, " ")}</td><td className="nowrap">{r.dated ? fmtDate(r.dated) : "—"}</td><td>{r.matched}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ExportCard({ club }: { club: string | null }) {
  const { list, loading } = useAllSwimmers(club);
  const [sel, setSel] = useState<PickSwimmer | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    if (!sel) return;
    setBusy(true); setMsg(null); setResult(null);
    try {
      const data = await dsarExport(sel.id);
      setResult(data);
      download(`subject-access-${fileStem(sel.full_name)}-${todayLocal().date}.json`, data);
      setMsg({ text: "Export downloaded. Check it before sending — see the notes below." });
    } catch (e) { setMsg({ text: "Export failed — " + errMsg(e), error: true }); }
    finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2 className="card-title">Subject access: export a swimmer's data</h2>
      <p className="hint top">Downloads everything the app holds on one swimmer as a single file. The club must reply within one month of the request.</p>
      <NamePicker id="dp-ex" label="Swimmer" list={list} loading={loading} sel={sel} onPick={s => { setSel(s); setResult(null); setMsg(null); }} onClear={() => { setSel(null); setResult(null); }} />
      {sel && <button type="button" className="btn primary wide" onClick={run} disabled={busy}>{busy ? "Exporting…" : "Download their data"}</button>}
      <StatusMsg msg={msg} />
      {result && (
        <>
          <table className="data dp-counts gap-top">
            <caption className="sr-only">What the export contains</caption>
            <thead><tr><th scope="col">Section</th><th scope="col">Records</th></tr></thead>
            <tbody>
              {Object.keys(SECTION_LABEL).filter(k => k in result && countOf(result[k]) > 0).map(k =>
                <tr key={k}><td>{SECTION_LABEL[k]}</td><td>{countOf(result[k])}</td></tr>)}
            </tbody>
          </table>
          <h3 className="gap-top">Before you send it</h3>
          <ul className="small">
            <li>Check each free-text mention below and copy only the sentence about this swimmer into the reply.</li>
            <li>Remove other children's names and anything about other people.</li>
            <li>Send it securely to the person whose identity you confirmed.</li>
          </ul>
          <MentionsTable rows={(result.free_text_mentions as EraseResult["free_text_to_review"]) ?? []} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function EraseCard({ club }: { club: string | null }) {
  const qc = useQueryClient();
  const { list, loading } = useAllSwimmers(club);
  const [sel, setSel] = useState<PickSwimmer | null>(null);
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState(todayLocal().date);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [result, setResult] = useState<EraseResult | null>(null);
  const matches = !!sel && typed.trim().toLowerCase() === sel.full_name.trim().toLowerCase();

  const run = async () => {
    if (!sel || !matches) return;
    setBusy(true); setMsg(null);
    try {
      const r = await eraseSwimmer(sel.id, reason, typed, requested || null);
      setResult(r);
      setMsg({ text: `${sel.full_name} has been erased. Their times, test scores and ratings are kept anonymously.` });
      setSel(null); setTyped(""); setReason("");
      ["admin_swimmers", "admin_deact", "roster", "admin_squads", "home_stats"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { setMsg({ text: "Erasure failed — nothing was changed. " + errMsg(e), error: true }); }
    finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2 className="card-title">Erase a swimmer</h2>
      <p className="hint top">For an erasure request. Race times, test scores and development ratings are copied into an anonymous archive that can't be linked back to anyone; everything else about the swimmer is deleted. <strong>This can't be undone.</strong> To pause someone instead, deactivate them.</p>
      <NamePicker id="dp-er" label="Swimmer" list={list} loading={loading} sel={sel} onPick={s => { setSel(s); setTyped(""); setMsg(null); setResult(null); }} onClear={() => { setSel(null); setTyped(""); }} />
      {sel && (
        <>
          <div className="field-pair stack-narrow">
            <div><label htmlFor="dp-req">Date of the request</label><input id="dp-req" type="date" value={requested} onChange={e => setRequested(e.target.value)} /></div>
            <div><label htmlFor="dp-why">Reason <span className="dim">(optional)</span></label><input id="dp-why" type="text" placeholder="e.g. Parent's request" value={reason} onChange={e => setReason(e.target.value)} /></div>
          </div>
          <div className="confirm-box">
            <label htmlFor="dp-confirm">Type <strong>{sel.full_name}</strong> to confirm</label>
            <input id="dp-confirm" type="text" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />
            <button type="button" className="btn danger wide" onClick={run} disabled={!matches || busy}>{busy ? "Erasing…" : "Erase permanently"}</button>
          </div>
        </>
      )}
      <StatusMsg msg={msg} />
      {result && (
        <>
          {result.note && <p className="notice warn">The parent's account is still in Membership. Remove it there only if the parent asked for their own details to go too.</p>}
          <h3 className="gap-top">Free text to edit by hand</h3>
          <p className="hint top">These notes mention the swimmer's name. Open each one and remove the name.</p>
          <MentionsTable rows={result.free_text_to_review ?? []} />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
const DUE_ROWS: [keyof RetentionDue, string][] = [
  ["medical_to_delete", "Swimmers whose medical and emergency details are due for deletion (30 days after leaving)"],
  ["swimmers_to_erase", "Swimmers due to be erased (1 year after leaving)"],
  ["fees_to_delete", "Fee records due for deletion (6 years after their year end)"],
  ["parent_accounts_to_delete", "Resigned parent accounts with no children or fees left"],
  ["deactivated_without_date", "Deactivated swimmers with no leaving date (fix by hand)"],
  ["other_club_swimmers_no_swim_3y", "Other clubs' swimmers with no swim in 3 years (superadmin review)"],
  ["app_accounts_without_role_1y", "App accounts with no role for a year (superadmin review)"]
];

function RetentionCard({ club }: { club: string | null }) {
  const [due, setDue] = useState<RetentionDue | null>(null);
  const [done, setDone] = useState<RetentionRun | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const actionable = !!due && (due.medical_to_delete + due.swimmers_to_erase + due.fees_to_delete + due.parent_accounts_to_delete) > 0;

  const check = async () => {
    if (!club) return;
    setBusy("check"); setMsg(null); setDone(null);
    try { const r = await runRetention(club, true); setDue(r.due ?? null); }
    catch (e) { setMsg({ text: "Check failed — " + errMsg(e), error: true }); }
    finally { setBusy(null); }
  };
  const apply = async () => {
    if (!club) return;
    setBusy("apply"); setMsg(null);
    try {
      const r = await runRetention(club, false);
      setDone(r); setDue(null);
      setMsg({ text: `Done: ${r.swimmers_erased ?? 0} erased, ${r.medical_rows_deleted ?? 0} medical or emergency records deleted, ${r.fees_deleted ?? 0} fees deleted, ${r.parent_accounts_deleted ?? 0} parent accounts deleted.` });
    } catch (e) { setMsg({ text: "Nothing was changed — " + errMsg(e), error: true }); }
    finally { setBusy(null); setConfirming(false); }
  };

  return (
    <section className="card">
      <h2 className="card-title">Retention check</h2>
      <p className="hint top">Shows what the club's retention schedule says is due now. Checking changes nothing. Run it on the first working day of each month.</p>
      <button type="button" className="btn wide" onClick={check} disabled={!club || busy !== null}>{busy === "check" ? "Checking…" : "Check what's due"}</button>
      <StatusMsg msg={msg} />
      {due && (
        <>
          <table className="data dp-counts gap-top">
            <caption className="sr-only">Due under the retention schedule</caption>
            <tbody>{DUE_ROWS.filter(([k]) => due[k] !== null && due[k] !== undefined).map(([k, label]) => <tr key={k}><td>{label}</td><td>{due[k] as number}</td></tr>)}</tbody>
          </table>
          {!actionable && <p className="dim">Nothing is due. Check again next month.</p>}
          {actionable && (!confirming
            ? <button type="button" className="btn danger wide gap-top" onClick={() => setConfirming(true)}>Apply the schedule now</button>
            : (
              <div className="confirm-box" role="alert">
                <p>This deletes the records counted above. Swimmers due for erasure keep only anonymous times, scores and ratings. It can't be undone.</p>
                <div className="btn-row">
                  <button type="button" className="btn danger" onClick={apply} disabled={busy === "apply"}>{busy === "apply" ? "Applying…" : "Yes, apply"}</button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            ))}
        </>
      )}
      {done && <p className="dim small">Applied {fmtDate(todayLocal().date)}.</p>}
    </section>
  );
}

export function DataProtection() {
  const { club } = useClub();
  return (
    <AdminGate title="Data protection">
      <ClubPicker />
      <ExportCard club={club} />
      <EraseCard club={club} />
      <RetentionCard club={club} />
    </AdminGate>
  );
}
