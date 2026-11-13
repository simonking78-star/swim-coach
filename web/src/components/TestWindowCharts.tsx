import { Chart } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import "../lib/chartSetup";
import { C } from "../lib/chartSetup";
import { fmt2, type WindowRow } from "../lib/measures";

// Charts for the graded repeat set (RRSC Test Set Timings workbook):
//  • WindowChart — one month's testing window, as in the workbook's "Points per
//    Age vs Age" sheet: a bar for each swimmer's points per age year, grouped by
//    age (youngest first), and a line for the at-age benchmark (every rep of the
//    swimmer's own age level, ÷ age). Within an age group swimmers are in name
//    order, not result order — the testing model rules out league tables.
//  • CompareBars — one swimmer against the rest of their squad, their age group
//    and the at-age benchmark.

export const VS_COLOUR: Record<string, string> = { below: "#8aa4c2", at: C.a, above: C.lc };

export function WindowChart({ rows }: { rows: WindowRow[] }) {
  const sorted = [...rows].sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || a.full_name.localeCompare(b.full_name));
  // Multi-line labels: name, and the age group under the first swimmer of each age.
  const labels = sorted.map((r, i) => (i === 0 || sorted[i - 1].age !== r.age ? [r.full_name, `Age ${r.age ?? "?"}`] : [r.full_name]));
  const data = {
    labels,
    datasets: [
      {
        type: "line" as const, label: "At-age benchmark (every rep at own age level)", data: sorted.map(r => r.benchmark),
        borderColor: C.navy, backgroundColor: C.navy, borderWidth: 2, pointRadius: 3, tension: 0, order: 0, spanGaps: false
      },
      {
        type: "bar" as const, label: "Points per age year", data: sorted.map(r => r.points_per_age),
        backgroundColor: sorted.map(r => VS_COLOUR[r.vs_age ?? "below"]), borderRadius: 3, order: 1
      }
    ]
  } as unknown as ChartData<"bar">;
  const options: ChartOptions<"bar"> = {
    responsive: true, maintainAspectRatio: false, animation: false,
    scales: {
      y: { beginAtZero: true, title: { display: true, text: "Points per age year" }, grid: { color: C.grid } },
      x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 70, minRotation: 50, font: { size: 10 } } }
    },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          title: items => sorted[items[0].dataIndex].full_name,
          label: c => {
            const r = sorted[c.dataIndex];
            return c.datasetIndex === 0
              ? `Benchmark: ${fmt2(r.benchmark)}`
              : [`${fmt2(r.points_per_age)} points per age year`, `${r.level_label ?? r.level_key}: ${r.value}/${r.max_reps ?? "?"} reps · ${r.points ?? "–"} points`, `Age ${r.age ?? "?"} · ${r.squad_name ?? ""}`];
          }
        }
      }
    }
  };
  const w = Math.max(320, sorted.length * 26);
  return (
    <div className="chart-scroll" style={{ overflowX: "auto" }}>
      <div style={{ height: 340, minWidth: w }}><Chart type="bar" data={data} options={options} aria-label="Points per age year for each swimmer, grouped by age, with the at-age benchmark" role="img" /></div>
    </div>
  );
}

export interface CompareBar { label: string; value: number | null; note?: string; colour: string }

export function CompareBars({ bars, unit = "Points per age year" }: { bars: CompareBar[]; unit?: string }) {
  const shown = bars.filter(b => b.value != null);
  const data: ChartData<"bar"> = {
    labels: shown.map(b => (b.note ? [b.label, b.note] : b.label)),
    datasets: [{ label: unit, data: shown.map(b => b.value), backgroundColor: shown.map(b => b.colour), borderRadius: 3 }]
  };
  const options: ChartOptions<"bar"> = {
    indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
    scales: { x: { beginAtZero: true, grid: { color: C.grid }, title: { display: true, text: unit } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt2(c.parsed.x) } } }
  };
  return <div style={{ height: 40 + shown.length * 38 }}><Chart type="bar" data={data} options={options} role="img" aria-label={`${unit}: ` + shown.map(b => `${b.label} ${fmt2(b.value)}`).join(", ")} /></div>;
}

export default WindowChart;
