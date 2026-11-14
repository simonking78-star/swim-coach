import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { DOC_ACCEPT, loadQtTable, loadTimetablesData, openCompDoc, type CompDoc } from "../lib/season";

export const useTimetablesData = (club: string | null) =>
  useQuery({ queryKey: ["tt_data", club], enabled: !!club, queryFn: () => loadTimetablesData(club!) });

/** Read-only crosstab of a meet's qualifying times. */
export function QtModal({ galaId, name, onClose }: { galaId: string | null; name: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["qts", galaId], enabled: !!galaId, queryFn: () => loadQtTable(galaId!) });
  return (
    <Modal open={!!galaId} onClose={onClose} title={`Qualifying times · ${name}`}>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load qualifying times.</p>}
      {q.data && !q.data.count && <p className="dim">No qualifying times on file.</p>}
      {q.data && q.data.count > 0 && (
        <>
          {q.data.basis && <p className="hint top">Age basis: {q.data.basis}</p>}
          <div className="table-wrap">
            <table className="data qt-table">
              <caption className="sr-only">Qualifying times by event and age group</caption>
              <thead><tr><th scope="col">Course</th><th scope="col">Type</th><th scope="col">Sex</th><th scope="col">Event</th>{q.data.ages.map(a => <th key={a} scope="col">{a}</th>)}</tr></thead>
              <tbody>
                {q.data.groups.map(g => (
                  <tr key={[g.course, g.type, g.gender, g.event].join("|")}>
                    <td>{g.course}</td><td>{g.type}</td><td>{g.gender}</td><th scope="row">{g.event}</th>
                    {q.data!.ages.map(a => <td key={a} className="nowrap">{g.t[a] || ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

export function StatusMsg({ msg }: { msg: { text: string; error?: boolean } | null }) {
  if (!msg) return null;
  return <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>;
}

const kb = (n: number | null) => (n == null ? "" : n >= 1048576 ? ` · ${(n / 1048576).toFixed(1)} MB` : ` · ${Math.max(1, Math.round(n / 1024))} KB`);

/** A competition document as a link (signed on click — the bucket is private). */
export function CompDocLink({ doc }: { doc: CompDoc }) {
  const [err, setErr] = useState("");
  return (
    <>
      <button type="button" className="link-btn" onClick={() => { setErr(""); openCompDoc(doc.storage_path).catch(e => setErr((e as Error).message)); }}>
        📎 {doc.file_name}<span className="sr-only"> (opens in a new tab)</span>
      </button>
      {err && <span className="msg error small"> {err}</span>}
    </>
  );
}

/** Documents: saved files (with Remove / Undo) plus files picked for upload on Save. */
export function CompDocsField({ saved, removed, onToggleRemove, files, onFiles }: {
  saved: CompDoc[]; removed: Set<string>; onToggleRemove: (id: string) => void; files: File[]; onFiles: (f: File[]) => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <fieldset className="plain-fieldset">
      <legend>Documents</legend>
      {!saved.length && !files.length && <p className="dim small">No documents attached.</p>}
      <ul className="cp-files doc-list">
        {saved.map(d => (
          <li key={d.id} className={removed.has(d.id) ? "removed" : undefined}>
            {removed.has(d.id) ? <s>{d.file_name}</s> : <CompDocLink doc={d} />}<span className="dim small">{kb(d.size_bytes)}</span>
            <button type="button" className="link-btn small" onClick={() => onToggleRemove(d.id)} aria-label={(removed.has(d.id) ? "Keep " : "Remove ") + d.file_name}>
              {removed.has(d.id) ? "Undo" : "Remove"}
            </button>
          </li>
        ))}
        {files.map((f, i) => (
          <li key={"n" + i}>
            📎 {f.name}<span className="dim small">{kb(f.size)} · new</span>
            <button type="button" className="link-btn small" aria-label={"Don't attach " + f.name} onClick={() => onFiles(files.filter((_, j) => j !== i))}>Remove</button>
          </li>
        ))}
      </ul>
      <input id={id} ref={pick} type="file" multiple accept={DOC_ACCEPT} hidden onChange={e => { onFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
      <button type="button" className="btn small" onClick={() => pick.current?.click()}>Attach documents…</button>
      <p className="hint">PDF, Word, Excel, PowerPoint, CSV, text or images, up to 25 MB each. Saved with the club's copy of this meet.</p>
    </fieldset>
  );
}
