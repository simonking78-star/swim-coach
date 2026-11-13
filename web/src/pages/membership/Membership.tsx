import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { StepTabs } from "../../components/feedbackParts";
import { DataTable, type DtCol } from "../../components/DataTable";
import { Modal } from "../../components/Modal";
import { LEVEL_NOTE, ROLE_LABEL, canEdit as canEditLv, sectionLevel, type Role } from "../../lib/access";
import { loadDeactivated, reactivateSwimmer, loadSquadCounts } from "../../lib/admin";
import {
  currentRegYear, fullName, loadAccounts, loadAthletes, loadRegistrations, money, saveSeReg, setAccountStatus, statusLabel,
  type AccountRow, type AthleteRow, type RegRow, type SeReg
} from "../../lib/membership";
import { fmtDate } from "../../lib/util";
import { AccountProfile } from "./AccountProfile";
import { AthleteProfile } from "./AthleteProfile";
import { StatusChip } from "./parts";

// Membership administration: the club's central record of members.
// Accounts (account holders) · Athletes (linked to accounts) · Registration
// (new-member applications + Swim England registration). Spec: claude/specs/membership-admin.md

type Tab = "accounts" | "athletes" | "registration";

export function Membership() {
  const { access } = useAuth();
  const { club } = useClub();
  const level = sectionLevel(access, "membership");
  const medLevel = sectionLevel(access, "medical");
  const edit = canEditLv(level);
  const [params, setParams] = useSearchParams();
  const tab = (["accounts", "athletes", "registration"].includes(params.get("tab") ?? "") ? params.get("tab") : "accounts") as Tab;
  const [account, setAccount] = useState<string | null | "new">(null);
  const [athlete, setAthlete] = useState<string | null>(null);

  if (level === "N") {
    return <><div className="page-head"><h1>Membership</h1></div><p className="notice warn">Your role doesn't have access to membership administration.</p></>;
  }
  const medProps = { canSeeMedical: medLevel !== "N", canEditMedical: canEditLv(medLevel) };

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">🪪</span> Membership</h1>
        <p className="dim">The club's central record of account holders, athletes and registration</p>
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}
      <ClubPicker />

      <StepTabs<Tab> value={tab} onChange={k => setParams(k === "accounts" ? {} : { tab: k }, { replace: true })} tabs={[
        { key: "accounts", label: "Accounts" }, { key: "athletes", label: "Athletes" }, { key: "registration", label: "Registration" }
      ]} />

      {club && tab === "accounts" && <AccountsTab club={club} edit={edit} onOpen={setAccount} />}
      {club && tab === "athletes" && <AthletesTab club={club} edit={edit} withMedical={medProps.canSeeMedical} onOpen={setAthlete} />}
      {club && tab === "registration" && <RegistrationTab club={club} edit={edit} onOpenAccount={setAccount} onOpenAthlete={setAthlete} />}

      {club && account && (
        <AccountProfile key={account} accountId={account === "new" ? null : account} club={club} canEdit={edit} {...medProps} onClose={() => setAccount(null)} />
      )}
      {club && athlete && <AthleteProfile key={athlete} swimmerId={athlete} club={club} canEdit={edit} {...medProps} onClose={() => setAthlete(null)} />}
    </>
  );
}

// ---------------- Accounts ----------------
function AccountsTab({ club, edit, onOpen }: { club: string; edit: boolean; onOpen: (id: string | "new") => void }) {
  const [showResigned, setShowResigned] = useState(false);
  const q = useQuery({ queryKey: ["mb_accounts", club], queryFn: () => loadAccounts(club) });
  const rows = useMemo(() => (q.data ?? []).filter(a => showResigned || a.status !== "resigned"), [q.data, showResigned]);
  const address = (a: AccountRow) => [a.address_line1, a.address_line2, a.town, a.county, a.postcode].filter(Boolean).join(", ");
  const cols: DtCol<AccountRow>[] = [
    { key: "name", label: "Account holder", fixed: true, get: a => `${a.last_name}, ${a.first_name}` },
    { key: "status", label: "Status", default: true, filter: "select", get: a => statusLabel(a.status), render: a => <StatusChip status={a.status} label={statusLabel(a.status)} /> },
    { key: "athletes", label: "Athletes", default: true, get: a => a.athletes.map(x => x.full_name).join(", ") },
    { key: "n", label: "No. athletes", num: true, filter: "select", get: a => a.athletes.length },
    { key: "email", label: "Email", default: true, get: a => a.email },
    { key: "mobile", label: "Mobile", default: true, nowrap: true, get: a => a.phone_mobile },
    { key: "phone2", label: "Other phone", nowrap: true, get: a => a.phone_other },
    { key: "address", label: "Home address", get: address },
    { key: "town", label: "Town", filter: "select", get: a => a.town },
    { key: "postcode", label: "Postcode", nowrap: true, get: a => a.postcode },
    { key: "ref", label: "Account ref", get: a => a.account_ref },
    { key: "roles", label: "Club roles", filter: "text", get: a => a.club_roles.join(", ") },
    { key: "approles", label: "App roles", filter: "select", get: a => a.appRoles.map(r => ROLE_LABEL[r as Role] ?? r).join(", ") },
    { key: "guardians", label: "Guardians", num: true, filter: "none", get: a => a.guardians },
    { key: "owed", label: "Outstanding", num: true, default: true, filter: "none", get: a => a.owed, render: a => (a.owed ? <strong className="owed">{money(a.owed)}</strong> : "—") },
    { key: "joined", label: "Joined", nowrap: true, filter: "none", get: a => a.joined_on, render: a => fmtDate(a.joined_on) || "—" },
    { key: "since", label: "Status since", nowrap: true, filter: "none", get: a => a.status_changed_on, render: a => fmtDate(a.status_changed_on) }
  ];
  return (
    <DataTable storageKey="mb_accounts_cols" title="Accounts" columns={cols} rows={rows} rowKey={a => a.id} onRowClick={a => onOpen(a.id)}
      loading={q.isLoading} error={!!q.error} empty="No accounts match." csvName={edit ? `accounts-${club}` : undefined}
      toolbar={<>
        <label className="inline-check"><input type="checkbox" checked={showResigned} onChange={e => setShowResigned(e.target.checked)} /> Show resigned</label>
        {edit && <button type="button" className="btn small primary" onClick={() => onOpen("new")}>+ New account</button>}
      </>} />
  );
}

// ---------------- Athletes ----------------
function AthletesTab({ club, edit, withMedical, onOpen }: { club: string; edit: boolean; withMedical: boolean; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [reactivate, setReactivate] = useState<AthleteRow | null>(null);
  const q = useQuery({ queryKey: ["mb_athletes", club, withMedical], queryFn: () => loadAthletes(club, withMedical) });
  const inactive = useQuery({
    queryKey: ["mb_inactive", club], enabled: showInactive && edit,
    queryFn: async () => (await loadDeactivated(club)).map(x => ({
      id: x.swimmer_id, full_name: x.full_name, date_of_birth: null, age: null, yob: null, gender: null, squad: x.squad, squad_id: x.squad_id,
      swim_england_id: null, joined_club_on: null, account_id: null, account: null, account_status: null, pbs: 0, seStatus: null, seCategory: null,
      medical: null, active: false, inactive_on: x.deactivated_on
    }) as AthleteRow)
  });
  const rows = useMemo(() => [...(q.data ?? []), ...(showInactive ? inactive.data ?? [] : [])], [q.data, inactive.data, showInactive]);
  const yr = currentRegYear();
  const cols: DtCol<AthleteRow>[] = [
    { key: "name", label: "Athlete", fixed: true, get: a => a.full_name },
    { key: "status", label: "Status", filter: "select", get: a => (a.active ? "Active" : "Inactive"), render: a => <StatusChip status={a.active ? "live" : "resigned"} label={a.active ? "Active" : "Inactive"} /> },
    { key: "squad", label: "Squad", default: true, filter: "select", get: a => a.squad },
    { key: "age", label: "Age", default: true, num: true, filter: "select", get: a => a.age },
    { key: "yob", label: "Year of birth", num: true, filter: "select", get: a => a.yob },
    { key: "dob", label: "Date of birth", nowrap: true, filter: "none", get: a => a.date_of_birth, render: a => fmtDate(a.date_of_birth) || "—" },
    { key: "gender", label: "Gender", filter: "select", get: a => a.gender },
    { key: "account", label: "Account holder", default: true, get: a => a.account },
    { key: "accstatus", label: "Account status", filter: "select", get: a => (a.account_status ? statusLabel(a.account_status) : "") },
    { key: "seid", label: "England reg. no.", default: true, get: a => a.swim_england_id },
    { key: "se", label: `SE ${yr}`, filter: "select", get: a => (a.seStatus ? `${a.seStatus[0].toUpperCase() + a.seStatus.slice(1)}${a.seCategory ? ` · Cat ${a.seCategory}` : ""}` : "") },
    { key: "pbs", label: "Total PBs", num: true, filter: "none", get: a => a.pbs },
    { key: "joined", label: "Joined club", nowrap: true, filter: "none", get: a => a.joined_club_on, render: a => fmtDate(a.joined_club_on) || "—" },
    { key: "inactive", label: "Inactive date", nowrap: true, filter: "none", get: a => a.inactive_on, render: a => fmtDate(a.inactive_on) || "—" },
    ...(withMedical ? [{ key: "medical", label: "Medical", filter: "select", get: (a: AthleteRow) => (a.medical === "yes" ? "Medical info" : a.medical === "none" ? "None declared" : a.medical === "unknown" ? "Not recorded" : ""),
      render: (a: AthleteRow) => (a.medical === "yes" ? <span className="chip st-suspended">⚕ info</span> : a.medical === "unknown" ? <span className="dim">not recorded</span> : "—") } as DtCol<AthleteRow>] : [])
  ];
  return (
    <>
      <DataTable storageKey="mb_athletes_cols" title="Athletes" columns={cols} rows={rows} rowKey={a => a.id}
        onRowClick={a => (a.active ? onOpen(a.id) : edit && setReactivate(a))}
        loading={q.isLoading} error={!!q.error} empty="No athletes match." csvName={edit ? `athletes-${club}` : undefined}
        toolbar={edit && <label className="inline-check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>} />
      {reactivate && <ReactivateModal club={club} a={reactivate} onClose={done => { setReactivate(null); if (done) { qc.invalidateQueries({ queryKey: ["mb_athletes"] }); qc.invalidateQueries({ queryKey: ["mb_inactive"] }); } }} />}
    </>
  );
}

function ReactivateModal({ club, a, onClose }: { club: string; a: AthleteRow; onClose: (done: boolean) => void }) {
  const squads = useQuery({ queryKey: ["mb_squads", club], queryFn: () => loadSquadCounts(club) });
  const [squad, setSquad] = useState(a.squad_id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await reactivateSwimmer(a.id, squad || null); onClose(true); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal open onClose={() => onClose(false)} title={`Reactivate ${a.full_name}?`}>
      <p>Inactive since {fmtDate(a.inactive_on)}. Reactivating restores their name, details and results.</p>
      <label htmlFor="mb-react-squad">Squad</label>
      <select id="mb-react-squad" value={squad} onChange={e => setSquad(e.target.value)}>
        <option value="">No squad</option>
        {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn primary" disabled={busy} onClick={go}>{busy ? "Reactivating…" : "Reactivate"}</button>
        <button type="button" className="btn" onClick={() => onClose(false)}>Close</button>
      </div>
    </Modal>
  );
}

// ---------------- Registration ----------------
function RegistrationTab({ club, edit, onOpenAccount, onOpenAthlete }: { club: string; edit: boolean; onOpenAccount: (id: string) => void; onOpenAthlete: (id: string) => void }) {
  const qc = useQueryClient();
  const [year, setYear] = useState(currentRegYear());
  const accounts = useQuery({ queryKey: ["mb_accounts", club], queryFn: () => loadAccounts(club) });
  const regs = useQuery({ queryKey: ["mb_regs_club", club, year], queryFn: () => loadRegistrations(club, year) });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pending = (accounts.data ?? []).filter(a => a.status === "pending");

  const decide = async (a: AccountRow, ok: boolean) => {
    setBusy(a.id); setErr(null);
    try {
      await setAccountStatus(a.id, ok ? "live" : "resigned", ok ? "Application approved" : "Application declined");
      qc.invalidateQueries({ queryKey: ["mb_accounts"] });
    } catch (e) { setErr("Couldn't update — " + (e as Error).message); }
    finally { setBusy(null); }
  };
  const quickReg = async (r: RegRow, status: SeReg["status"]) => {
    setBusy(r.swimmer_id); setErr(null);
    try {
      await saveSeReg({ ...(r.reg ?? { swimmer_id: r.swimmer_id, reg_year: year, category: "2", registered_on: null, expires_on: `${year}-12-31`, notes: null }), status,
        registered_on: status === "registered" ? (r.reg?.registered_on ?? new Date().toISOString().slice(0, 10)) : r.reg?.registered_on ?? null } as SeReg);
      qc.invalidateQueries({ queryKey: ["mb_regs_club"] }); qc.invalidateQueries({ queryKey: ["mb_athletes"] });
    } catch (e) { setErr("Couldn't update — " + (e as Error).message); }
    finally { setBusy(null); }
  };

  const regLabel = (r: RegRow) => (r.reg ? r.reg.status[0].toUpperCase() + r.reg.status.slice(1) : "Not recorded");
  const regCols: DtCol<RegRow>[] = [
    { key: "name", label: "Athlete", fixed: true, get: r => r.full_name, render: r => <button type="button" className="link-btn" onClick={e => { e.stopPropagation(); onOpenAthlete(r.swimmer_id); }}>{r.full_name}</button> },
    { key: "status", label: `Status ${year}`, default: true, filter: "select", get: regLabel, render: r => <StatusChip status={r.reg?.status === "registered" ? "live" : r.reg?.status === "lapsed" ? "resigned" : "pending"} label={regLabel(r)} /> },
    { key: "cat", label: "Category", default: true, filter: "select", get: r => (r.reg ? `Cat ${r.reg.category}` : "") },
    { key: "seid", label: "England reg. no.", default: true, get: r => r.swim_england_id },
    { key: "squad", label: "Squad", default: true, filter: "select", get: r => r.squad },
    { key: "yob", label: "Year of birth", num: true, filter: "select", get: r => r.yob },
    { key: "account", label: "Account holder", get: r => r.account },
    { key: "regd", label: "Registered", nowrap: true, filter: "none", get: r => r.reg?.registered_on ?? null, render: r => fmtDate(r.reg?.registered_on) || "—" },
    { key: "exp", label: "Expires", nowrap: true, filter: "none", get: r => r.reg?.expires_on ?? null, render: r => fmtDate(r.reg?.expires_on) || "—" },
    ...(edit ? [{ key: "act", label: "Quick update", default: true, filter: "none", get: () => "", render: (r: RegRow) => (
      <span className="btn-row nowrap" onClick={e => e.stopPropagation()}>
        {r.reg?.status !== "registered" && <button type="button" className="btn small" disabled={busy === r.swimmer_id} onClick={() => quickReg(r, "registered")}>Mark registered</button>}
        {!r.reg && <button type="button" className="btn small" disabled={busy === r.swimmer_id} onClick={() => quickReg(r, "pending")}>Pending</button>}
      </span>) } as DtCol<RegRow>] : [])
  ];
  const counts = (regs.data ?? []).reduce((m, r) => { const k = r.reg?.status ?? "none"; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>);

  return (
    <>
      {err && <p className="msg error" role="alert">{err}</p>}
      <section className="card">
        <h2 className="card-title">New-member applications <span className="dim">({pending.length})</span></h2>
        {accounts.isLoading && <p className="dim">Loading…</p>}
        {!accounts.isLoading && pending.length === 0 && <p className="dim">No applications waiting. Accounts created with status “Pending new” appear here.</p>}
        {pending.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Account holder</th><th scope="col">Athletes</th><th scope="col">Applied</th><th scope="col">Contact</th>{edit && <th scope="col">Decision</th>}</tr></thead>
              <tbody>
                {pending.map(a => (
                  <tr key={a.id}>
                    <th scope="row"><button type="button" className="link-btn" onClick={() => onOpenAccount(a.id)}>{fullName(a)}</button></th>
                    <td>{a.athletes.map(x => x.full_name).join(", ") || <span className="dim">none linked</span>}</td>
                    <td className="nowrap">{fmtDate(a.applied_on) || "—"}</td>
                    <td>{[a.email, a.phone_mobile].filter(Boolean).join(" · ") || "—"}</td>
                    {edit && (
                      <td><span className="btn-row nowrap">
                        <button type="button" className="btn small primary" disabled={busy === a.id} onClick={() => decide(a, true)}>Approve</button>
                        <button type="button" className="btn small" disabled={busy === a.id} onClick={() => decide(a, false)}>Decline</button>
                      </span></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Approve makes the account Live with today's joining date. Decline marks it Resigned with a note.</p>
      </section>

      <section className="card">
        <div className="card-head top">
          <h2 className="card-title">Swim England registration</h2>
          <label className="inline">Year
            <select value={year} onChange={e => setYear(Number(e.target.value))}>
              {[currentRegYear() + 1, currentRegYear(), currentRegYear() - 1, currentRegYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="stat-row four">
          <div className="stat"><span className="stat-label">Registered</span><span className="stat-value">{counts.registered ?? 0}</span></div>
          <div className="stat"><span className="stat-label">Pending</span><span className="stat-value">{counts.pending ?? 0}</span></div>
          <div className="stat"><span className="stat-label">Lapsed</span><span className="stat-value">{counts.lapsed ?? 0}</span></div>
          <div className="stat"><span className="stat-label">Not recorded</span><span className="stat-value">{counts.none ?? 0}</span></div>
        </div>
      </section>
      <DataTable storageKey="mb_regs_cols" title={`Athletes · ${year}`} columns={regCols} rows={regs.data ?? []} rowKey={r => r.swimmer_id}
        onRowClick={r => onOpenAthlete(r.swimmer_id)} loading={regs.isLoading} error={!!regs.error} csvName={edit ? `se-registration-${club}-${year}` : undefined} />
    </>
  );
}
