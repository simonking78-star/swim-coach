import { Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Tooltip, type ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import { decYear, parseTimeStr, secToTime, type ResultRow } from "../lib/results";
import { fmtDate } from "../lib/util";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

// One event's swims over time, SC and LC as separate lines; PBs ringed.
// Same colours and marks as the current app (SC blue circles, LC green triangles).
const SC = "#2a78d6", LC = "#0f7a3e", PB = "#f2a340";

type P = { x: number; y: number; meet_date: string; is_pb: boolean };

export default function EventChart({ rows }: { rows: ResultRow[] }) {
  const pts = (course: string): P[] => rows
    .filter(r => r.course === course)
    .map(r => ({ x: decYear(r.meet_date), y: parseTimeStr(r.swim_time_display)!, meet_date: r.meet_date, is_pb: !!r.is_pb }))
    .filter(p => p.y != null)
    .sort((a, b) => a.x - b.x);
  const sc = pts("SC"), lc = pts("LC");
  const ds = (label: string, data: P[], color: string, style: "circle" | "triangle") => ({
    label, data, showLine: true, fill: false, tension: 0,
    borderColor: color, borderWidth: 2, backgroundColor: color, pointStyle: style,
    pointRadius: data.map(p => (p.is_pb ? 7 : 5)), pointBorderColor: data.map(p => (p.is_pb ? PB : "#fff")), pointBorderWidth: 1.5
  });
  const datasets = [...(sc.length ? [ds("SC", sc, SC, "circle")] : []), ...(lc.length ? [ds("LC", lc, LC, "triangle")] : [])];

  const options: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, parsing: false, animation: false,
    scales: {
      x: { type: "linear", ticks: { callback: v => (Math.round(+v) === +v ? String(Math.round(+v)) : "") }, grid: { color: "rgba(0,0,0,.06)" } },
      y: { ticks: { callback: v => secToTime(+v) }, grid: { color: "rgba(0,0,0,.06)" } }
    },
    plugins: {
      legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: c => `${fmtDate((c.raw as P).meet_date)}: ${secToTime(c.parsed.y)}${(c.raw as P).is_pb ? " (PB)" : ""}` } }
    }
  };
  if (!datasets.length) return <p className="dim">No timed swims to chart for this event.</p>;
  return (
    <div className="chart-wrap" role="img" aria-label="Times for this event over the years, short course and long course">
      <Line data={{ datasets }} options={options} />
    </div>
  );
}
