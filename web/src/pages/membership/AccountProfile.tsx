import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { ROLE_LABEL, type Role } from "../../lib/access";
import {
  ACCOUNT_STATUS, CLUB_ROLES, blankAccount, fullName, loadAccount, saveAccount, statusLabel, validateAccount,
  type AccountDraft, type AccountStatus, type Fee, type Guardian
} from "../../lib/membership";
import { sb } from "../../lib/supabase";
import { clubIdOf } from "../../lib/clubs";
import { fmtDate } from "../../lib/util";
import { AthleteProfile } from "./AthleteProfile";
import { FeesEditor } from "./FeesEditor";
import { Area, Fieldset, ProfileFooter, ReadOnly, Sel, StatusChip, Txt } from "./parts";

// The account holder's full record: contact, address, status and roles, guardians,
// linked athletes (each opens its own profile on top), billing. Save / Close.

export function AccountProfile({ accountId, club, canEdit, canEditMedical, canSeeMedical, onClose }: {
  accountId: string | null; club: string; canEdit: boolean; canEditMedical: boolean; canSeeMedical: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(accountId);
  const q = useQuery({ queryKey: ["mb_account", id], enabled: !!id, queryFn: () => loadAccount(id!) });
  const appRoles = useQuery({
    queryKey: ["mb_account_roles", q.data?.account.user_id], enabled: !!q.data?.account.user_id,
    queryFn: async () => ((await sb.from("user_roles").select("role, club").eq("user_id", q.data!.account.user_id!)).data ?? []) as { role: string; club: string | null }[]
  });
  const unlinked = useQuery({
    queryKey: ["mb_unlinked", club], enabled: canEdit,
    queryFn: async () => ((await sb.from("swimmers").select("id, full_name").eq("club_id", clubIdOf(club)).eq("active", true).is("account_id" as never, null).order("full_name")).data ?? []) as { id: string; full_name: string }[]
  });

  const [draft, setDraft] = useState<AccountDraft>(blankAccount);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [removedFees, setRemovedFees] = useState<string[]>([]);
  const [toLink, setToLink] = useState<string[]>([]);
  const [toUnlink, setToUnlink] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [athlete, setAthlete] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  useEffect(() => {
    if (!q.data) return;
    const { account: a } = q.data;
    const { id: _i, club_id: _c, updated_at: _u, ...rest } = a;
    setDraft(rest); setGuardians(q.data.guardians); setFees(q.data.fees);
    setRemovedFees([]); setToLink([]); setToUnlink([]); setDirty(false);
  }, [q.data]);

  const ro = !canEdit;
  const set = <K extends keyof AccountDraft>(k: K) => (v: AccountDraft[K]) => { setDraft(d => ({ ...d, [k]: v })); setDirty(true); setMsg(null); };
  const setS = (k: keyof AccountDraft) => (v: string) => set(k)((v || null) as never);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); setMsg(null); };

  const athletes = useMemo(() => {
    const base = (q.data?.athletes ?? []).filter(a => !toUnlink.includes(a.id));
    const extra = (unlinked.data ?? []).filter(s => toLink.includes(s.id)).map(s => ({ id: s.id, full_name: s.full_name, squad: null as string | null, age: null as number | null, date_of_birth: null, active: true }));
    return [...base, ...extra];
  }, [q.data, unlinked.data, toLink, toUnlink]);

  const save = async () => {
    const err = validateAccount(draft, guardians);
    if (err) { setMsg({ ok: false, text: err }); return; }
    setBusy(true); setMsg(null);
    try {
      const newId = await saveAccount(club, id, draft, q.data?.account.status ?? null, guardians, fees.map(f => ({ ...f, account_id: id ?? "" })), removedFees);
      for (const s of toLink) { const { error } = await sb.from("swimmers").update({ account_id: newId } as never).eq("id", s); if (error) throw error; }
      for (const s of toUnlink) { const { error } = await sb.from("swimmers").update({ account_id: null } as never).eq("id", s); if (error) throw error; }
      setId(newId);
      await qc.invalidateQueries({ queryKey: ["mb_account", newId] });
      qc.invalidateQueries({ queryKey: ["mb_accounts"] }); qc.invalidateQueries({ queryKey: ["mb_athletes"] }); qc.invalidateQueries({ queryKey: ["mb_unlinked"] });
      setDirty(false); setMsg({ ok: true, text: "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: "Couldn't save — " + (e as Error).message });
    } finally { setBusy(false); }
  };

  const title = id && q.data ? fullName(q.data.account) : "New account";
  const loading = !!id && q.isLoading;

  return (
    <Modal open wide onClose={() => (dirty && canEdit ? setConfirmClose(true) : onClose())} title={<>{title} {id && q.data && <StatusChip status={draft.status} label={statusLabel(draft.status)} />}</>}>
      {loading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load this account.</p>}
      {!loading && !q.error && (
        <div className="profile-body">
          {ro && <p className="notice">Read only for your role.</p>}

          <Fieldset title="Account holder">
            <Txt label="Title" value={draft.title} onChange={setS("title")} disabled={ro} />
            <Txt label="First name" value={draft.first_name} onChange={v => set("first_name")(v)} disabled={ro} />
            <Txt label="Last name" value={draft.last_name} onChange={v => set("last_name")(v)} disabled={ro} />
            <Txt label="Account reference" value={draft.account_ref} onChange={setS("account_ref")} disabled={ro} />
          </Fieldset>

          <Fieldset title="Contact details">
            <Txt label="Email" type="email" value={draft.email} onChange={setS("email")} disabled={ro} />
            <Txt label="Mobile" type="tel" value={draft.phone_mobile} onChange={setS("phone_mobile")} disabled={ro} />
            <Txt label="Other phone" type="tel" value={draft.phone_other} onChange={setS("phone_other")} disabled={ro} />
          </Fieldset>

          <Fieldset title="Home address">
            <Txt label="Address line 1" value={draft.address_line1} onChange={setS("address_line1")} disabled={ro} />
            <Txt label="Address line 2" value={draft.address_line2} onChange={setS("address_line2")} disabled={ro} />
            <Txt label="Town" value={draft.town} onChange={setS("town")} disabled={ro} />
            <Txt label="County" value={draft.county} onChange={setS("county")} disabled={ro} />
            <Txt label="Postcode" value={draft.postcode} onChange={v => setS("postcode")(v.toUpperCase())} disabled={ro} />
          </Fieldset>

          <Fieldset title="Status and roles">
            <Sel label="Account status" value={draft.status} onChange={v => set("status")(v as AccountStatus)} disabled={ro} options={ACCOUNT_STATUS.map(s => ({ value: s.key, label: s.label }))} />
            <ReadOnly label="Status since" value={id && q.data ? fmtDate(q.data.account.status_changed_on) : "—"} />
            <Txt label="Applied" type="date" value={draft.applied_on} onChange={setS("applied_on")} disabled={ro} />
            <Txt label="Joined" type="date" value={draft.joined_on} onChange={setS("joined_on")} disabled={ro} />
            {(draft.status === "resigned" || draft.resigned_on) && <Txt label="Resigned" type="date" value={draft.resigned_on} onChange={setS("resigned_on")} disabled={ro} />}
            <div className="mf wide">
              <span className="mf-label">Club roles</span>
              <div className="chip-row tight" role="group" aria-label="Club roles">
                {CLUB_ROLES.map(r => {
                  const on = draft.club_roles.includes(r);
                  return (
                    <label key={r} className={"col-chip" + (on ? " on" : "")}>
                      <input type="checkbox" checked={on} disabled={ro} onChange={e => set("club_roles")(e.target.checked ? [...draft.club_roles, r] : draft.club_roles.filter(x => x !== r))} />{r}
                    </label>
                  );
                })}
              </div>
            </div>
            <ReadOnly label="App access" value={!draft.user_id ? "No app login" : appRoles.data?.length ? appRoles.data.map(r => `${ROLE_LABEL[r.role as Role] ?? r.role}${r.club ? "" : " (all clubs)"}`).join(", ") : "Login, no role"} />
          </Fieldset>
          {!draft.user_id && <p className="hint">App logins and permissions are managed in Admin → Users. Club roles here are for the club's records only.</p>}

          <Fieldset title="Guardians" actions={!ro && <button type="button" className="btn small" onClick={touch(() => setGuardians([...guardians, { full_name: "", relationship: null, phone: null, email: null, is_primary: guardians.length === 0 }]))}>+ Add guardian</button>}>
            {guardians.length === 0 && <p className="dim mf wide">No guardians recorded. Add anyone with parental responsibility besides the account holder.</p>}
            {guardians.map((g, i) => {
              const upd = (p: Partial<Guardian>) => touch(setGuardians)(guardians.map((x, j) => (j === i ? { ...x, ...p } : p.is_primary ? { ...x, is_primary: false } : x)));
              return (
                <div key={g.id ?? "g" + i} className="mf-row wide">
                  <Txt label="Name" value={g.full_name} onChange={v => upd({ full_name: v })} disabled={ro} />
                  <Txt label="Relationship" value={g.relationship} onChange={v => upd({ relationship: v })} disabled={ro} placeholder="e.g. Mother" />
                  <Txt label="Phone" type="tel" value={g.phone} onChange={v => upd({ phone: v })} disabled={ro} />
                  <Txt label="Email" type="email" value={g.email} onChange={v => upd({ email: v })} disabled={ro} />
                  <label className="inline-check"><input type="checkbox" checked={g.is_primary} disabled={ro} onChange={e => upd({ is_primary: e.target.checked })} /> Primary</label>
                  {!ro && <button type="button" className="link-btn" onClick={touch(() => setGuardians(guardians.filter((_, j) => j !== i)))}>remove</button>}
                </div>
              );
            })}
          </Fieldset>

          <Fieldset title={`Linked athletes (${athletes.length})`}>
            {athletes.length === 0 && <p className="dim mf wide">No athletes linked to this account yet.</p>}
            <ul className="linked-list mf wide">
              {athletes.map(a => (
                <li key={a.id}>
                  {toLink.includes(a.id)
                    ? <span>{a.full_name} <span className="chip">links on save</span></span>
                    : <button type="button" className="link-btn" onClick={() => setAthlete(a.id)} disabled={!id}>{a.full_name}</button>}
                  <span className="dim">{[a.squad, a.age != null ? `Age ${a.age}` : null].filter(Boolean).join(" · ")}</span>
                  {!ro && <button type="button" className="link-btn" onClick={touch(() => (toLink.includes(a.id) ? setToLink(toLink.filter(x => x !== a.id)) : setToUnlink([...toUnlink, a.id])))}>unlink</button>}
                </li>
              ))}
            </ul>
            {!ro && (
              <div className="mf-row wide">
                <Sel label="Link an athlete with no account" value={pick} onChange={setPick} blank="Choose…"
                  options={(unlinked.data ?? []).filter(s => !toLink.includes(s.id)).map(s => ({ value: s.id, label: s.full_name }))} />
                <button type="button" className="btn small" disabled={!pick} onClick={touch(() => { setToLink([...toLink, pick]); setToUnlink(toUnlink.filter(x => x !== pick)); setPick(""); })}>Link</button>
              </div>
            )}
            {dirty && athletes.some(a => toLink.includes(a.id)) && <p className="hint mf wide">Save to finish linking, then tap a name to open the athlete's profile.</p>}
          </Fieldset>

          <Fieldset title="Billing">
            <div className="mf wide">
              <FeesEditor fees={fees} setFees={touch(setFees)} onRemove={fid => setRemovedFees(r => [...r, fid])}
                accountId={id ?? ""} athletes={athletes} canEdit={canEdit} />
            </div>
          </Fieldset>

          <Fieldset title="Notes">
            <Area label="Notes (no medical detail here)" value={draft.notes} onChange={setS("notes")} disabled={ro} rows={3} />
          </Fieldset>

          <ProfileFooter canSave={canEdit} dirty={dirty} busy={busy} msg={msg} onSave={save} onClose={onClose} confirmClose={confirmClose} setConfirmClose={setConfirmClose} />
        </div>
      )}

      {athlete && (
        <AthleteProfile swimmerId={athlete} club={club} canEdit={canEdit} canEditMedical={canEditMedical} canSeeMedical={canSeeMedical}
          onClose={() => { setAthlete(null); qc.invalidateQueries({ queryKey: ["mb_account", id] }); }} />
      )}
    </Modal>
  );
}
