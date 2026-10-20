import { useQuery } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { loadQtTable, loadTimetablesData } from "../lib/season";

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
