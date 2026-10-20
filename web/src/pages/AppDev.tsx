import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ROLE_LABEL, sectionLevel, type Role } from "../lib/access";
import {
  AD_AREAS, AD_MILESTONES, AD_PRIORITIES, AD_STATUS_LABEL, AD_STATUSES, addTask, currentMilestone, gateScores, loadDevTasks, needsSquads,
  needsSwimmers, nextTaskId, saveTask, searchSwimmers, setTaskStatus, startRoleTest, validateTask, type DevTask
} from "../lib/admin";
import { loadDevSpecs, type DevSpec } from "../lib/specs";
import { renderMarkdown } from "../lib/md";
import { fmtDate } from "../lib/util";
import { StatusMsg } from "../components/seasonParts";
import { Modal } from "../components/Modal";
import { usePlanSquads } from "./plans/PlanList";

// App dev (superadmin only): the development action list scored against
// milestones M0–M6, and "Test as a role" for the real superadmin.

type Msg = { text: string; error?: boolean } | null;
const MS_NAME = Object.fromEntries(AD_MILESTONES);
const msIndex = (m: string) => AD_MILESTONES.findIndex(x => x[0] === m);

export function AppDev() {
  const { access } = useAuth();
  const ok = sectionLevel(access, "appdev") === "E";
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["dev_tasks"], enabled: ok, queryFn: loadDevTasks });
  const specs = useQuery({ queryKey: ["dev_specs"], enabled: ok, queryFn: loadDevSpecs });
  const [openSpec, setOpenSpec] = useState<DevSpec | null>(null);
  const [fs, setFs] = useState("");
  const [fa, setFa] = useState("");
  const [q, setQ] = useState("");
  const [gateOnly, setGateOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [preDone, setPreDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const all = tasks.data ?? [];
  const scores = useMemo(() => gateScores(all), [all]);
  const cur = currentMilestone(scores);

  if (!ok) return <><div className="page-head"><h1>App dev</h1></div><p className="notice warn">App dev is for the superadmin only.</p></>;

  const refresh = () => qc.invalidateQueries({ queryKey: ["dev_tasks"] });
  const open = all.filter(t => t.status !== "done" && t.status !== "dropped").length;
  const mustOpen = all.filter(t => t.priority === "Must" && t.status !== "done" && t.status !== "dropped" && msIndex(t.milestone) <= msIndex(cur)).length;
  const t = q.trim().toLowerCase();
  const shown = all.filter(x =>
    !(fs === "" && (x.status === "done" || x.status === "dropped")) && !(fs && fs !== "*" && x.status !== fs) &&
    (!fa || x.area === fa) && (!gateOnly || x.gate) &&
    (!t || [x.id, x.title, x.notes, x.evidence, x.area].some(v => (v || "").toLowerCase().includes(t))));

  const changeStatus = async (task: DevTask, status: string) => {
    if (status === "done" && !task.evidence) { setOpenId(task.id); setPreDone(task.id); return; } // evidence first
    setMsg(null);
    try { await setTaskStatus(task.id, status); setMsg({ text: `${task.id} → ${AD_STATUS_LABEL[status]}.` }); refresh(); }
    catch (e) { setMsg({ text: "Could not update: " + (e as Error).message, error: true }); refresh(); }
  };

  return (
    <>
      <div className="page-head"><h1><span aria-hidden="true">🛠️</span> App dev</h1><p className="dim">Development actions and milestones</p></div>
      {access?.real_superadmin && !access.testing && <RoleTest />}

      <section className="card">
        <h2 className="card-title">Milestones</h2>
        {tasks.data && (
          <>
            <p>Current milestone: <strong>{cur} {MS_NAME[cur]}</strong> — gate {scores[cur].done}/{scores[cur].total}. {open} open action{open === 1 ? "" : "s"}; {mustOpen} Must action{mustOpen === 1 ? "" : "s"} open up to {cur}.</p>
            <ul className="ms-grid">
              {AD_MILESTONES.filter(([m]) => m !== "Later").map(([m, n]) => {
                const s = scores[m];
                return <li key={m} className={m === cur ? "current" : s.total && s.done === s.total ? "met" : undefined} title={n}>{m}<b>{s.done}/{s.total}</b></li>;
              })}
              <li>All<b>{all.filter(x => x.status === "done").length}/{all.filter(x => x.status !== "dropped").length}</b></li>
            </ul>
          </>
        )}
        <p className="hint">Gate score = exit-gate actions done ÷ gate actions (dropped excluded). A ring opens only at 100%.</p>
      </section>

      <section className="card">
        <h2 className="card-title">Specs</h2>
        <p className="hint top">The project's own spec documents, pushed in for review here — not a live sync; updated whenever a spec changes.</p>
        {specs.isLoading && <p className="dim">Loading…</p>}
        {specs.error && <p className="msg error">Could not load specs: {(specs.error as Error).message}</p>}
        {specs.data && !specs.data.length && <p className="dim">No specs pushed yet.</p>}
        {specs.data && specs.data.length > 0 && (
          <ul className="task-list">
            {specs.data.map(s => (
              <li key={s.id} className="task">
                <div className="task-row">
                  <div className="task-main">
                    <button type="button" className="task-title" onClick={() => setOpenSpec(s)}>{s.title}</button>
                    <p className="dim small task-note">Updated {fmtDate(s.updated_at.slice(0, 10))}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Modal open={!!openSpec} onClose={() => setOpenSpec(null)} title={openSpec?.title ?? ""}>
        {openSpec && <div className="spec-content">{renderMarkdown(openSpec.content)}</div>}
      </Modal>

      <section className="card">
        <div className="field-pair">
          <div>
            <label htmlFor="ad-status">Status</label>
            <select id="ad-status" value={fs} onChange={e => setFs(e.target.value)}>
              <option value="">All open</option>
              {AD_STATUSES.map(s => <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>)}
              <option value="*">Everything</option>
            </select>
          </div>
          <div>
            <label htmlFor="ad-area">Area</label>
            <select id="ad-area" value={fa} onChange={e => setFa(e.target.value)}>
              <option value="">All areas</option>
              {AD_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="ad-q">Search</label>
        <input id="ad-q" type="search" placeholder="Title, ID or notes" value={q} onChange={e => setQ(e.target.value)} />
        <label className="inline gap-top"><input type="checkbox" checked={gateOnly} onChange={e => setGateOnly(e.target.checked)} /> Gate actions only</label>
        <button type="button" className="btn primary wide" aria-expanded={adding} onClick={() => setAdding(a => !a)}>{adding ? "Close" : "+ Add action"}</button>
        {adding && tasks.data && (
          <TaskEditor isNew tasks={all} initial={{ id: nextTaskId(all), title: "", milestone: cur, area: "Specification", priority: "Should", status: "todo", due_on: null, owner_role: null, gate: false, evidence: null, notes: null }}
            onCancel={() => setAdding(false)} onSaved={id => { setAdding(false); setMsg({ text: `Added ${id}.` }); refresh(); }} />
        )}
      </section>

      <StatusMsg msg={msg} />
      {tasks.isLoading && <p className="dim">Loading…</p>}
      {tasks.error && <p className="msg error">Could not load actions: {(tasks.error as Error).message}</p>}
      {tasks.data && !shown.length && <p className="dim card">No actions match these filters.</p>}
      {AD_MILESTONES.map(([m, n]) => {
        const items = shown.filter(x => x.milestone === m);
        if (!items.length) return null;
        const s = scores[m];
        return (
          <section key={m} className="card" aria-labelledby={"ms-" + m}>
            <div className="card-head top"><h2 id={"ms-" + m} className="card-title">{m} {n}</h2>{s.total > 0 && <span className="chip">Gate {s.done}/{s.total}</span>}</div>
            <ul className="task-list">
              {items.map(task => (
                <li key={task.id} className="task">
                  <div className="task-row">
                    <div className="task-main">
                      <button type="button" className="task-title" aria-expanded={openId === task.id} onClick={() => { setOpenId(o => (o === task.id ? null : task.id)); setPreDone(null); }}>
                        <span className="task-id">{task.id}</span>{task.title}
                      </button>
                      <div className="chip-row tight">
                        <span className="chip">{task.area}</span>
                        <span className={"chip" + (task.priority === "Must" ? " must" : "")}>{task.priority}</span>
                        {task.gate && <span className="chip gate">Gate</span>}
                        {task.due_on && <span className="chip">Due {fmtDate(task.due_on)}</span>}
                        {task.owner_role && <span className="chip">{task.owner_role}</span>}
                      </div>
                      {(task.status === "done" && task.evidence ? "✔ " + task.evidence : task.notes) && <p className="dim small task-note">{task.status === "done" && task.evidence ? "✔ " + task.evidence : task.notes}</p>}
                    </div>
                    <select className={"task-status st-" + task.status} aria-label={`Status of ${task.id}`} value={task.status} onChange={e => changeStatus(task, e.target.value)}>
                      {AD_STATUSES.map(s => <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                  {openId === task.id && (
                    <TaskEditor tasks={all} initial={preDone === task.id ? { ...task, status: "done" } : task} hint={preDone === task.id ? "Add evidence, then Save to mark this done." : undefined}
                      onCancel={() => { setOpenId(null); setPreDone(null); }} onSaved={id => { setOpenId(null); setPreDone(null); setMsg({ text: `Saved ${id}.` }); refresh(); }} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function TaskEditor({ initial, isNew, tasks, hint, onCancel, onSaved }: { initial: DevTask; isNew?: boolean; tasks: DevTask[]; hint?: string; onCancel: () => void; onSaved: (id: string) => void }) {
  const [t, setT] = useState<DevTask>(initial);
  const [msg, setMsg] = useState<Msg>(hint ? { text: hint, error: true } : null);
  const [busy, setBusy] = useState(false);
  const [dropConfirm, setDropConfirm] = useState(false);
  const p = `te-${isNew ? "new" : initial.id}`;
  const set = <K extends keyof DevTask>(k: K, v: DevTask[K]) => setT(x => ({ ...x, [k]: v }));
  const save = async (override?: Partial<DevTask>) => {
    const row = { ...t, ...override, id: isNew ? t.id.trim().toUpperCase() : t.id };
    const bad = validateTask(row, !!isNew, tasks);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try { if (isNew) await addTask(row); else await saveTask(initial.id, row); onSaved(row.id); }
    catch (e) { setMsg({ text: (isNew ? "Could not add: " : "Could not save: ") + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };
  return (
    <div className="task-edit">
      {isNew && (<><label htmlFor={p + "-id"}>ID</label><input id={p + "-id"} type="text" value={t.id} onChange={e => set("id", e.target.value)} /></>)}
      <label htmlFor={p + "-title"}>Action</label>
      <textarea id={p + "-title"} rows={2} value={t.title} onChange={e => set("title", e.target.value)} />
      <div className="field-pair">
        <div><label htmlFor={p + "-ms"}>Milestone</label><select id={p + "-ms"} value={t.milestone} onChange={e => set("milestone", e.target.value)}>{AD_MILESTONES.map(([m]) => <option key={m} value={m}>{m}</option>)}</select></div>
        <div><label htmlFor={p + "-area"}>Area</label><select id={p + "-area"} value={t.area} onChange={e => set("area", e.target.value)}>{AD_AREAS.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
        <div><label htmlFor={p + "-pri"}>Priority</label><select id={p + "-pri"} value={t.priority} onChange={e => set("priority", e.target.value)}>{AD_PRIORITIES.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
        <div><label htmlFor={p + "-st"}>Status</label><select id={p + "-st"} value={t.status} onChange={e => set("status", e.target.value)}>{AD_STATUSES.map(s => <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>)}</select></div>
        <div><label htmlFor={p + "-due"}>Due</label><input id={p + "-due"} type="date" value={t.due_on || ""} onChange={e => set("due_on", e.target.value || null)} /></div>
        <div><label htmlFor={p + "-own"}>Owner role</label><input id={p + "-own"} type="text" placeholder="e.g. Simon, welfare officer" value={t.owner_role || ""} onChange={e => set("owner_role", e.target.value)} /></div>
      </div>
      <label className="inline gap-top"><input type="checkbox" checked={t.gate} onChange={e => set("gate", e.target.checked)} /> Exit-gate action for its milestone</label>
      <label htmlFor={p + "-ev"}>Evidence <span className="dim">(needed to mark done)</span></label>
      <textarea id={p + "-ev"} rows={2} placeholder="Link, query result or note proving it's done" value={t.evidence || ""} onChange={e => set("evidence", e.target.value)} autoFocus={!!hint} />
      <label htmlFor={p + "-notes"}>Notes</label>
      <textarea id={p + "-notes"} rows={2} value={t.notes || ""} onChange={e => set("notes", e.target.value)} />
      <div className="btn-row gap-top">
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        {!isNew && initial.status !== "dropped" && (dropConfirm
          ? <button type="button" className="btn small danger" disabled={busy} onClick={() => save({ status: "dropped" })}>Confirm drop</button>
          : <button type="button" className="btn small" onClick={() => setDropConfirm(true)}>Drop</button>)}
        <button type="button" className="btn small primary" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : isNew ? "Add action" : "Save"}</button>
      </div>
      {dropConfirm && <p className="hint">Dropping keeps {initial.id} on record with status Dropped.</p>}
      <StatusMsg msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function RoleTest() {
  const { session } = useAuth();
  const { clubs, club: currentClub, setClub } = useClub();
  const [role, setRole] = useState<Role>("coach");
  const [club, setTestClub] = useState(currentClub || "");
  const [squadIds, setSquadIds] = useState<Set<string>>(new Set());
  const [swIds, setSwIds] = useState<Set<string>>(new Set());
  const [sq, setSq] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const squads = usePlanSquads(club || null);
  const hits = useQuery({ queryKey: ["rt_search", club, sq.trim()], enabled: sq.trim().length >= 2, queryFn: () => searchSwimmers(club || null, sq.trim(), true) });

  const start = async () => {
    setMsg(null);
    const c = role === "superadmin" ? null : club || null;
    if (role !== "superadmin" && !c) { setMsg({ text: "Choose a club for this role.", error: true }); return; }
    if (needsSquads(role) && !squadIds.size) { setMsg({ text: "Tick at least one squad (their \"own squads\").", error: true }); return; }
    if (needsSwimmers(role) && !swIds.size) { setMsg({ text: "Pick the swimmer this account is linked to.", error: true }); return; }
    setBusy(true);
    try {
      await startRoleTest(session!.user.id, role, c, needsSquads(role) ? [...squadIds] : [], needsSwimmers(role) ? [...swIds] : []);
      if (c) setClub(c);
      location.assign(import.meta.env.BASE_URL); // reload so every section loads under the test role
    } catch (e) { setMsg({ text: "Could not start test: " + (e as Error).message, error: true }); setBusy(false); }
  };

  return (
    <section className="card">
      <h2 className="card-title">Test as a role</h2>
      <p className="hint top">The database treats your account as this role until you tap <strong>Stop test</strong> in the bar at the top (or 8 hours pass). Your real role doesn't change.</p>
      <div className="field-pair">
        <div>
          <label htmlFor="rt-role">Role</label>
          <select id="rt-role" value={role} onChange={e => { setRole(e.target.value as Role); setSwIds(new Set()); }}>
            {(["club_admin", "head_coach", "coach", "helper", "parent", "swimmer", "superadmin"] as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        {role !== "superadmin" && (
          <div>
            <label htmlFor="rt-club">Club</label>
            <select id="rt-club" value={club} onChange={e => { setTestClub(e.target.value); setSquadIds(new Set()); setSwIds(new Set()); setSq(""); }}>
              <option value="">— choose club —</option>
              {clubs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>
      {needsSquads(role) && (
        <fieldset className="plain-fieldset">
          <legend>Their own squads</legend>
          {!club && <p className="dim">Choose a club first.</p>}
          <div className="check-grid">
            {(club ? squads.data ?? [] : []).map(s => (
              <label key={s.id} className={"skill" + (squadIds.has(s.id) ? " on" : "")}>
                <input type="checkbox" checked={squadIds.has(s.id)} onChange={e => setSquadIds(x => { const n = new Set(x); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />{s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {needsSwimmers(role) && (
        <>
          <label htmlFor="rt-sw">Linked swimmer{role === "parent" ? "s" : ""}</label>
          <input id="rt-sw" type="search" autoComplete="off" placeholder="Type at least 2 letters of a name" value={sq} onChange={e => setSq(e.target.value)} />
          {sq.trim().length >= 2 && (
            <ul className="tick-results">
              {hits.data && !hits.data.length && <li className="dim">No match.</li>}
              {(hits.data ?? []).map(s => (
                <li key={s.id}><label>
                  <input type={role === "parent" ? "checkbox" : "radio"} name="rt-sw" checked={swIds.has(s.id)}
                    onChange={e => setSwIds(x => { const n = role === "parent" ? new Set(x) : new Set<string>(); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                  {" "}{s.full_name}{s.squad ? " · " + s.squad : ""}
                </label></li>
              ))}
            </ul>
          )}
        </>
      )}
      <button type="button" className="btn primary wide" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start test"}</button>
      <StatusMsg msg={msg} />
    </section>
  );
}
