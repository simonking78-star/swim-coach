import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { sectionLevel } from "../lib/access";
import { fmtRange, loadCompetitions, type Competition } from "../lib/season";
import { todayLocal } from "../lib/util";
import { QtModal } from "../components/seasonParts";

// Upcoming licensed meets (scraped into public.competitions): search, course and
// level filters; each opens to venue, licence, website, files and QTs.

const FILE_ICON: Record<string, string> = { conditions: "📄", timetable: "🗓️", results: "🏁", qts: "⏱️" };

export function Competitions() {
  const { access } = useAuth();
  const level = sectionLevel(access, "timetables");
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
  const focused = useRef(false);

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
      <section className="card">
        <label htmlFor="cp-search">Search</label>
        <input id="cp-search" type="search" placeholder="Search meets by name or town" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="field-pair">
          <div><label htmlFor="cp-course">Course</label>
            <select id="cp-course" value={course} onChange={e => setCourse(e.target.value)}><option value="">All courses</option><option value="SC">Short course</option><option value="LC">Long course</option></select></div>
          <div><label htmlFor="cp-level">Level</label>
            <select id="cp-level" value={lvl} onChange={e => setLvl(e.target.value)}><option value="">All levels</option>{["1", "2", "3", "4"].map(l => <option key={l} value={l}>Level {l}</option>)}</select></div>
        </div>
        {q.data && <p className="hint" aria-live="polite">{rows.length} upcoming meet{rows.length === 1 ? "" : "s"}</p>}
      </section>
      {note && !note.id && <p className="msg error">{note.text}</p>}
      {q.isLoading && <p className="dim">Loading competitions…</p>}
      {q.error && <p className="msg error">Couldn't load competitions. <button type="button" className="link-btn" onClick={() => q.refetch()}>Try again</button></p>}
      {q.data && !rows.length && <p className="dim card">No upcoming meets match. Run the competition-scrape skill to refresh the list.</p>}
      <ul className="cp-list">
        {rows.map(c => {
          const isOpen = open.has(c.id), files = q.data!.files[c.id] || [], nQt = c.gala_id ? q.data!.qtCount[c.gala_id] || 0 : 0;
          return (
            <li key={c.id} id={"cp-" + c.id} className="card cp-item">
              <button type="button" className="more-btn head" aria-expanded={isOpen} aria-controls={"cpb-" + c.id} onClick={() => toggle(c.id)}>
                <span>
                  <strong>{c.name}</strong>
                  <span className="dim small block">{fmtRange(c.date_start, c.date_end || c.date_start)}
                    {c.level && <span className="tt-pill upcoming">L{c.level}</span>}{c.course && <span className="tt-pill current">{c.course}</span>}</span>
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
                  <div className="btn-row gap-top">
                    <button type="button" className="btn small" disabled={!nQt} onClick={() => setQt(c)}>QTs{nQt ? "" : " —"}</button>
                    <button type="button" className="btn small" onClick={() => setNote({ id: c.id, text: "The eligibility report isn't built yet — its rule needs your sign-off first." })}>Eligibility</button>
                    <button type="button" className="btn small primary" onClick={() => setNote({ id: c.id, text: "The competition entry page hasn't been built yet. Parents will land on it from here once it is." })}>Entry</button>
                  </div>
                  {note?.id === c.id && <p className="hint" role="status">{note.text}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <QtModal galaId={qt?.gala_id ?? null} name={qt?.name ?? ""} onClose={() => setQt(null)} />
    </>
  );
}
