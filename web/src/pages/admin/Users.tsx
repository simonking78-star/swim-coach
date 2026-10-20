import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ROLE_LABEL, type Role } from "../../lib/access";
import {
  callInvite, InviteError, loadPeople, needsSquads, needsSwimmers, removeRole, ROLE_HINT, searchSwimmers, unlinkSwimmer, type Person
} from "../../lib/admin";
import { StatusMsg } from "../../components/seasonParts";
import { AdminGate } from "../../components/adminParts";
import { usePlanSquads } from "../plans/PlanList";

// Users & roles: invite people (invite-user edge function returns a one-time
// sign-in link to share), and manage the roles, squads and children they have.

type Msg = { text: string; error?: boolean } | null;
const ROLES: Role[] = ["club_admin", "head_coach", "coach", "helper", "parent", "swimmer"];
// Invite links land on the live app at the site root, which handles first sign-in.
const REDIRECT = () => location.origin + "/";

export function Users() {
  const { access, session } = useAuth();
  const { clubs, club: currentClub } = useClub();
  const me = session?.user.id;
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ["people"], queryFn: () => loadPeople(me) });

  const isSuper = (access?.roles || []).some(r => r.role === "superadmin");
  const adminClubs = isSuper ? clubs : [...new Set((access?.roles || []).filter(r => r.role === "club_admin" && r.club).map(r => r.club as string))];
  const canGrantSuper = !!(access?.real_superadmin && !access?.testing);
  const roles: Role[] = [...ROLES, ...(canGrantSuper ? ["superadmin" as Role] : [])];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [club, setClub] = useState("");
  const [squadIds, setSquadIds] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const [sq, setSq] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [link, setLink] = useState<{ name: string; email: string; link: string | null; existing?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [listMsg, setListMsg] = useState<Msg>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!club && adminClubs.length) setClub(adminClubs.includes(currentClub ?? "") ? currentClub! : adminClubs[0]); }, [adminClubs, club, currentClub]);
  const squads = usePlanSquads(club || null);
  const hits = useQuery({ queryKey: ["ua_search", club, sq.trim()], enabled: sq.trim().length >= 2 && !!club, queryFn: () => searchSwimmers(club, sq.trim(), false) });

  const changeRole = (r: Role) => {
    setRole(r);
    if (r === "swimmer" && chosen.size > 1) setChosen(new Map([[...chosen][0]]));
  };
  const toggleKid = (id: string, label: string, on: boolean) => setChosen(m => {
    const n = role === "swimmer" ? new Map<string, string>() : new Map(m);
    if (on) n.set(id, label); else n.delete(id);
    return n;
  });
  const reset = () => { setName(""); setEmail(""); setSq(""); setChosen(new Map()); setSquadIds(new Set()); };

  const invite = async () => {
    setMsg(null); setLink(null);
    const payload = { full_name: name.trim(), email: email.trim(), role, club: role === "superadmin" ? null : club, squad_ids: [...squadIds], swimmer_ids: [...chosen.keys()], redirect_to: REDIRECT() };
    if (!payload.email) { setMsg({ text: "Enter their email address.", error: true }); return; }
    if (needsSquads(role) && !payload.squad_ids.length) { setMsg({ text: "Tick at least one squad.", error: true }); return; }
    if (needsSwimmers(role) && !payload.swimmer_ids.length) { setMsg({ text: role === "parent" ? "Pick at least one child." : "Pick the swimmer.", error: true }); return; }
    setBusy("invite");
    try {
      const res = await callInvite(payload);
      setMsg({ text: `${ROLE_LABEL[role]} access given to ${payload.full_name || payload.email}.` });
      setLink({ name: payload.full_name, email: payload.email, link: res.link, existing: res.existing });
      reset();
      qc.invalidateQueries({ queryKey: ["people"] });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
      if ((e as InviteError).link) setLink({ name: payload.full_name, email: payload.email, link: (e as InviteError).link! });
    } finally { setBusy(null); }
  };

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key); setListMsg(null);
    try { await fn(); setListMsg({ text: ok }); await qc.invalidateQueries({ queryKey: ["people"] }); }
    catch (e) { setListMsg({ text: (e as Error).message, error: true }); }
    finally { setBusy(null); setConfirm(null); }
  };
  const relink = async (p: Person) => {
    const x = p.roles[0];
    setBusy("relink" + p.user_id); setListMsg(null);
    try {
      const res = await callInvite({ email: p.email, full_name: p.full_name || "", role: x.role, club: x.club, squad_ids: p.squads.map(q => q.squad_id), swimmer_ids: p.kids.map(k => k.swimmer_id), redirect_to: REDIRECT() });
      setLink({ name: p.full_name || "", email: p.email, link: res.link, existing: true });
      document.getElementById("ua-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) { setListMsg({ text: (e as Error).message, error: true }); }
    finally { setBusy(null); }
  };
  const addKid = (p: Person, kidClub: string | null) => {
    setName(p.full_name || ""); setEmail(p.email); setRole("parent");
    if (kidClub) setClub(kidClub);
    setChosen(new Map(p.kids.filter(k => k.swimmers?.club === kidClub).map(k => [k.swimmer_id, k.swimmers!.full_name])));
    setMsg({ text: `Search for ${p.full_name ? p.full_name.split(" ")[0] + "'s" : "their"} other child, tick them, then tap the button.` });
    setSq("");
    setTimeout(() => { searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); searchRef.current?.focus(); }, 50);
  };

  return (
    <AdminGate title="Users & roles">
      <section className="card">
        <h2 className="card-title">Invite someone</h2>
        <div className="field-pair">
          <div><label htmlFor="ua-name">Name</label><input id="ua-name" type="text" autoComplete="off" placeholder="e.g. Jo Smith" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label htmlFor="ua-email">Email</label><input id="ua-email" type="email" autoComplete="off" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
        </div>
        <label htmlFor="ua-role">Role</label>
        <select id="ua-role" value={role} onChange={e => changeRole(e.target.value as Role)} aria-describedby="ua-role-hint">
          {roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <p id="ua-role-hint" className="hint">{ROLE_HINT[role]}</p>
        {role !== "superadmin" && (
          <>
            <label htmlFor="ua-club">Club</label>
            <select id="ua-club" value={club} onChange={e => { setClub(e.target.value); setSquadIds(new Set()); setChosen(new Map()); setSq(""); }}>
              {adminClubs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}
        {needsSquads(role) && (
          <fieldset className="plain-fieldset">
            <legend>Their squads</legend>
            {squads.data && !squads.data.length && <p className="dim">No squads set up for this club yet.</p>}
            <div className="check-grid">
              {(squads.data ?? []).map(s => (
                <label key={s.id} className={"skill" + (squadIds.has(s.id) ? " on" : "")}>
                  <input type="checkbox" checked={squadIds.has(s.id)} onChange={e => setSquadIds(x => { const n = new Set(x); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />{s.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {needsSwimmers(role) && (
          <div className="gap-top">
            <label htmlFor="ua-sw">{role === "swimmer" ? "Which swimmer is this?" : "Their children"}</label>
            {chosen.size > 0 && (
              <div className="chip-row">
                {[...chosen].map(([id, label]) => (
                  <span key={id} className="filter-chip on">{label} <button type="button" className="chip-x" aria-label={`Remove ${label}`} onClick={() => toggleKid(id, label, false)}>×</button></span>
                ))}
              </div>
            )}
            <input id="ua-sw" ref={searchRef} type="search" autoComplete="off" placeholder="Type at least 2 letters of a swimmer's name" value={sq} onChange={e => setSq(e.target.value)} />
            {sq.trim().length >= 2 && (
              <ul className="tick-results">
                {hits.isLoading && <li className="dim">Searching…</li>}
                {hits.data && !hits.data.length && <li className="dim">No swimmer with that name in this club.</li>}
                {(hits.data ?? []).map(s => {
                  const label = s.full_name + (s.squad ? " · " + s.squad : "");
                  return <li key={s.id}><label><input type={role === "swimmer" ? "radio" : "checkbox"} name="ua-kid" checked={chosen.has(s.id)} onChange={e => toggleKid(s.id, label, e.target.checked)} /> {label}</label></li>;
                })}
              </ul>
            )}
            <p className="hint">{role === "swimmer" ? "A swimmer account is linked to one swimmer." : "Tick every child this parent should see. Search again to add another."}</p>
          </div>
        )}
        <button type="button" className="btn primary wide" onClick={invite} disabled={busy === "invite"}>{busy === "invite" ? "Working…" : "Create account & sign-in link"}</button>
        <StatusMsg msg={msg} />
        <div id="ua-result">{link && <LinkBox {...link} />}</div>
      </section>

      <section className="card">
        <h2 className="card-title">People with access {people.data && <span className="dim">({people.data.length})</span>}</h2>
        <StatusMsg msg={listMsg} />
        {people.isLoading && <p className="dim">Loading…</p>}
        {people.error && <p className="msg error">Could not load people: {(people.error as Error).message}</p>}
        {people.data && !people.data.length && <p className="dim">Nobody else has access yet.</p>}
        <ul className="people">
          {(people.data ?? []).map(p => (
            <li key={p.user_id} className="person">
              <div className="person-name">{p.full_name || p.email}{p.user_id === me && " (you)"}</div>
              <div className="dim small">{p.email}</div>
              {!p.roles.length && <p className="dim small">No role</p>}
              {p.roles.map(x => {
                const key = `${p.user_id}|${x.role}|${x.club ?? ""}`;
                const squadsHere = p.squads.filter(q => q.squads?.club === x.club).map(q => q.squads!.name).join(", ");
                const kids = p.kids.filter(k => k.swimmers?.club === x.club);
                const canRemove = !(p.user_id === me && x.role === "superadmin");
                return (
                  <div key={key} className="person-role">
                    <div className="person-role-top">
                      <span><strong>{ROLE_LABEL[x.role] ?? x.role}</strong> · {x.club || "all clubs"}</span>
                      {canRemove && (confirm === key
                        ? <button type="button" className="btn small danger" disabled={busy === key} onClick={() => act(key, () => removeRole(p, x.role, x.club), `Removed ${ROLE_LABEL[x.role]} access from ${p.full_name || p.email}.`)}>Confirm remove</button>
                        : <button type="button" className="btn small" onClick={() => setConfirm(key)} aria-label={`Remove ${ROLE_LABEL[x.role]} access (${x.club || "all clubs"}) from ${p.full_name || p.email}`}>Remove</button>)}
                    </div>
                    {needsSquads(x.role) && <div className="dim small">{squadsHere || "no squads"}</div>}
                    {needsSwimmers(x.role) && (
                      <ul className="kid-list">
                        {!kids.length && <li className="dim small">No linked swimmer</li>}
                        {kids.map(k => {
                          const kk = `${p.user_id}|kid|${k.swimmer_id}`;
                          return (
                            <li key={k.swimmer_id}>
                              <span>{k.swimmers!.full_name}</span>
                              {(kids.length > 1 || x.role === "parent") && (confirm === kk
                                ? <button type="button" className="btn small danger" disabled={busy === kk} onClick={() => act(kk, () => unlinkSwimmer(p.user_id, k.swimmer_id), `${p.full_name || p.email} no longer sees ${k.swimmers!.full_name}.`)}>Confirm unlink</button>
                                : <button type="button" className="link-btn" onClick={() => setConfirm(kk)} aria-label={`Stop ${p.full_name || p.email} seeing ${k.swimmers!.full_name}`}>Unlink</button>)}
                            </li>
                          );
                        })}
                        {x.role === "parent" && <li><button type="button" className="link-btn" onClick={() => addKid(p, x.club)}>+ Add another child</button></li>}
                      </ul>
                    )}
                  </div>
                );
              })}
              {p.user_id !== me && p.roles.length > 0 && (
                <button type="button" className="btn small gap-top" onClick={() => relink(p)} disabled={busy === "relink" + p.user_id}>{busy === "relink" + p.user_id ? "Working…" : "New sign-in link"}</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </AdminGate>
  );
}

function LinkBox({ name, email, link, existing }: { name: string; email: string; link: string | null; existing?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!link) return (
    <div className="link-box" role="status">
      <p><strong>{name || email}</strong> already has an account and has signed in before, so no link is needed — the new access applies next time they open the app. If they've forgotten their password they can use <em>Forgot password</em>.</p>
    </div>
  );
  const subject = "Your Coach Tools sign-in";
  const text = `Hi${name ? " " + name.split(" ")[0] : ""},\n\nYou've been given access to Coach Tools. Tap this link to sign in and choose a password (it works once and expires soon, so please use it today):\n\n${link}\n`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { (document.getElementById("ua-link") as HTMLInputElement | null)?.select(); }
  };
  return (
    <div className="link-box" role="status">
      <p className="link-box-title">{existing ? "New sign-in link" : "Account created"} for {name || email}</p>
      <p className="small">Send them this link now — it works once and expires after a short time. When they open it they choose their own password.</p>
      <label htmlFor="ua-link" className="sr-only">Sign-in link</label>
      <input id="ua-link" type="text" readOnly value={link} onFocus={e => e.target.select()} />
      <div className="btn-row gap-top">
        <button type="button" className="btn small" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
        <a className="btn small" href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Email it</a>
        {"share" in navigator && <button type="button" className="btn small" onClick={() => navigator.share({ title: subject, text }).catch(() => {})}>Share…</button>}
      </div>
      <p className="hint">Send it only to that person — anyone with the link can sign in as them until they use it.</p>
    </div>
  );
}
