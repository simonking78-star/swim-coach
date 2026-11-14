import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { canEdit, sectionLevel } from "../lib/access";
import { DESIGNATIONS, fmtRange, loadClubCompInfo, loadCompetitions, type Competition } from "../lib/season";
import { todayLocal } from "../lib/util";
import { CompDocLink, QtModal } from "../components/seasonParts";
import { CompMacroModal } from "./season/CompMacroModal";

// Upcoming licensed meets (scraped into public.competitions): search, course and
// level filters; each opens to venue, licence, website, files and QTs.
// Season editors can add a meet to a macro (with type, link, notes, documents);
// anyone who can read season plans sees the club's macros, notes and documents for it.

const FILE_ICON: Record<string, string> = { conditions: "📄", timetable: "🗓️", results: "🏁", qts: "⏱️" };

export function Competitions() {
  const { access } = useAuth();
  const level = sectionLevel(access, "timetables");
  const seasonLevel = sectionLevel(access, "season");
  const { club } = useClub();
  const [params] = useSearchParams();
  const focus = params.get("focus");
  const today = todayLocal().date;
  const q = useQuery({ queryKey: ["competitions", today], staleTime: 10 * 60 * 1000, queryFn: () => loadCompetitions(today) });
  const [search, setSearch] = useState(params.get("q") || "");
  const [course, setCourse] = useState("");
  const [lvl, setLvl] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []));
  const [qt, setQt] = useState<Competition | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const [macroFor, setMacroFor] = useState<Competition | null>(null);
  const [flash, setFlash] = useState("");
  const focused = useRef(false);
  const clubInfo = useQuery({ queryKey: ["club_comp_info", club], enabled: !!club && seasonLevel !== "N", staleTime: 60 * 1000, retry: false,
    queryFn: () => loadClubCompInfo(club!) });

  useEffect(() => {
    if (!focus || !q.data || focused.current) return;
    focused.current = true;
    const el = document.getElementById("cp-" + focus);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); }
    else setNote({ id: "", text: "That competition is no longer in the upcoming list." });
  }, [focus, q.data]);

  if (level === "N") return <><div className="page-head"><h1>Competitions</h1></div><p className="notice warn">Your role doesn't have access to competitions.</p></>;

  const t = search.trim().toLowerCase();
  const rows = (q.data?.items ?? []).filter(c => (!course || c.course === course) && (!lvl || String(c.level) === lvl) &&
    (!t || (c.name || "").toLowerCase().includes(t) || (c.town_city || "").toLowerCase().includes(t)));
  const toggle = (id: string) => setOpen(o => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else { if (window.matchMedia("(max-width: 767px)").matches) n.clear(); n.add(id); }
    return n;
  });

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">🏆</span> Competitions</h1>
        <p className="dim">Upcoming licensed meets</p>
      </div>
      <section className="card filter-bar" aria-label="Filters">
        <div className="filter-fields">
        <div className="ff-search">
          <label htmlFor="cp-search">Search</label>
          <input id="cp-search" type="search" placeholder="Search meets by name or town" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="field-pair">
          <div><label htmlFor="cp-course">Course</label>
            <select id="cp-course" value={course} onChange={e => setCourse(e.target.value)}><option value="">All courses</option><option value="SC">Short course</option><option value="LC">Long course</option></select></div>
          <div><label htmlFor="cp-level">Level</label>
            <select id="cp-level" value={lvl} onChange={e => setLvl(e.target.value)}><option value="">All levels</option>{["1", "2", "3", "4"].map(l => <option key={l} value={l}>Level {l}</option>)}</select></div>
        </div>
        </div>
        {q.data && <p className="hint" aria-live="polite">{rows.length} upcoming meet{rows.length === 1 ? "" : "s"}</p>}
      </section>
      {note && !note.id && <p className="msg error">{note.text}</p>}
      {flash && <p className="msg" role="status">{flash}</p>}
      {clubInfo.error && canEdit(seasonLevel) && <p className="msg error">Couldn't load your club's macro links for these meets. <button type="button" className="link-btn" onClick={() => clubInfo.refetch()}>Try again</button></p>}
      {q.isLoading && <p className="dim">Loading competitions…</p>}
      {q.error && <p className="msg error">Couldn't load competitions. <button type="button" className="link-btn" onClick={() => q.refetch()}>Try again</button></p>}
      {q.data && !rows.length && <p className="dim card">No upcoming meets match. Run the competition-scrape skill to refresh the list.</p>}
      <ul className="cp-list">
        {rows.map(c => {
          const isOpen = open.has(c.id), files = q.data!.files[c.id] || [], nQt = c.gala_id ? q.data!.qtCount[c.gala_id] || 0 : 0;
          const mine = clubInfo.data?.[c.id] ?? [];
          const inMacro = mine.some(m => m.links.length);
          return (
            <li key={c.id} id={"cp-" + c.id} className="card cp-item">
              <button type="button" className="more-btn head" aria-expanded={isOpen} aria-controls={"cpb-" + c.id} onClick={() => toggle(c.id)}>
                <span>
                  <strong>{c.name}</strong>
                  <span className="dim small block">{fmtRange(c.date_start, c.date_end || c.date_start)}
                    {c.level && <span className="tt-pill upcoming">L{c.level}</span>}{c.course && <span className="tt-pill current">{c.course}</span>}
                    {inMacro && <span className="tt-pill upcoming">In macro</span>}</span>
                </span>
                <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
              </button>
              {isOpen && (
                <div id={"cpb-" + c.id} className="more-body">
                  {c.town_city && <p><strong>Venue:</strong> {c.town_city}{c.pool_length_m ? ` · ${c.pool_length_m}m pool` : ""}</p>}
                  {c.license_number && <p><strong>Licence:</strong> {c.license_number}</p>}
                  {c.website_url ? <p><a href={c.website_url} target="_blank" rel="noopener noreferrer">Meet website ↗<span className="sr-only"> (opens in a new tab)</span></a></p> : <p className="dim">No website found yet.</p>}
                  {files.length > 0 && (
                    <>
                      <h3 className="sec-title">Files</h3>
                      <ul className="cp-files">
                        {files.map((f, i) => { const href = f.public_url || f.source_url; return href ? <li key={i}><a href={href} target="_blank" rel="noopener noreferrer">{FILE_ICON[f.file_kind || ""] || "📎"} {f.file_name || f.file_kind || "File"}</a></li> : null; })}
                      </ul>
                    </>
                  )}
                  {mine.map(m => (
                    <div key={m.seasonCompId} className="cp-club">
                      <h3 className="sec-title">{m.seasonTitle}</h3>
                      {m.links.length
                        ? <div className="chip-row tight">{m.links.map(l => <span key={l.macroId} className="chip">{l.macroTitle} · {DESIGNATIONS[l.designation] || l.designation}</span>)}</div>
                        : <p className="dim small">In the season plan, not in a macro yet.</p>}
                      {m.url && m.url !== c.website_url && <p><a href={m.url} target="_blank" rel="noopener noreferrer">Club link ↗<span className="sr-only"> (opens in a new tab)</span></a></p>}
                      {m.notes && <p className="cp-notes"><strong>Notes:</strong> {m.notes}</p>}
                      {m.docs.length > 0 && <ul className="cp-files">{m.docs.map(d => <li key={d.id}><CompDocLink doc={d} /></li>)}</ul>}
                    </div>
                  ))}
                  <div className="btn-row gap-top">
                    {canEdit(seasonLevel) && <button type="button" className="btn small primary" onClick={() => { setFlash(""); setMacroFor(c); }}>{inMacro ? "Macros, notes & docs" : "Add to macro"}</button>}
                    <button type="button" className="btn small" disabled={!nQt} onClick={() => setQt(c)}>QTs{nQt ? "" : " —"}</button>
                    <button type="button" className="btn small" onClick={() => setNote({ id: c.id, text: "The eligibility report isn't built yet — its rule needs your sign-off first." })}>Eligibility</button>
                    <button type="button" className="btn small" onClick={() => setNote({ id: c.id, text: "The competition entry page hasn't been built yet. Parents will land on it from here once it is." })}>Entry</button>
                  </div>
                  {note?.id === c.id && <p className="hint" role="status">{note.text}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <CompMacroModal comp={macroFor} club={club} info={macroFor ? clubInfo.data?.[macroFor.id] ?? [] : []} onClose={() => setMacroFor(null)}
        onSaved={t => { setMacroFor(null); setFlash(t); }} />
      <QtModal galaId={qt?.gala_id ?? null} name={qt?.name ?? ""} onClose={() => setQt(null)} />
    </>
  );
}
