import type { TestModel } from "./tests";
import { fmtDate } from "./util";

// Session results PDF (Statistics → Test results). jsPDF loads only when used.
export interface PdfRow { rank: number | null; name: string; squad: string; age: number | null; level: number | null; rounds: string[]; score: number | null; change: number | null; }

export async function sessionPdf(opts: { title: string; club: string; date: string; group: string; model: TestModel; rows: PdfRow[]; ranked: boolean }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const ascii = (s: string) => s.replace(/[–—]/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7E£]/g, "");
  const band = () => { doc.setFillColor(11, 37, 69); doc.rect(0, 0, W, 4, "F"); };
  band();
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(11, 37, 69);
  doc.text(ascii(opts.title), 14, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(91, 107, 127);
  doc.text(ascii(`${opts.club}  |  ${fmtDate(opts.date)}  |  ${opts.group}  |  Score = age x test level x reps completed`), 14, 22);

  const cols = [
    ...(opts.ranked ? [{ h: "Rank", w: 14, a: "center" }] : []),
    { h: "Swimmer", w: 58, a: "left" }, { h: "Squad", w: 34, a: "left" }, { h: "Age", w: 13, a: "center" }, { h: "Level", w: 15, a: "center" },
    ...opts.model.rounds.map(r => ({ h: r.name, w: 24, a: "center" })),
    { h: "Score", w: 20, a: "right" }, { h: "Change", w: 20, a: "right" }
  ] as { h: string; w: number; a: "left" | "center" | "right" }[];
  const scale = Math.min(1, (W - 28) / cols.reduce((a, c) => a + c.w, 0));
  cols.forEach(c => { c.w *= scale; });
  let y = 30;
  const cell = (txt: string, x: number, w: number, a: string) => {
    const tx = a === "center" ? x + w / 2 : a === "right" ? x + w - 2 : x + 2;
    doc.text(ascii(txt), tx, y, { align: a as "left" | "center" | "right", maxWidth: w - 3 });
  };
  const header = () => {
    doc.setFillColor(11, 37, 69); doc.rect(14, y - 5, W - 28, 7.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    let x = 14; cols.forEach(c => { cell(c.h, x, c.w, c.a); x += c.w; });
    y += 7.5;
  };
  header();
  doc.setFontSize(9.5);
  opts.rows.forEach((r, i) => {
    if (y > H - 16) { doc.addPage(); band(); y = 14; header(); }
    if (i % 2) { doc.setFillColor(244, 246, 249); doc.rect(14, y - 5, W - 28, 7, "F"); }
    doc.setFont("helvetica", "normal"); doc.setTextColor(26, 35, 50);
    const vals = [
      ...(opts.ranked ? [r.rank == null ? "-" : String(r.rank)] : []),
      r.name, r.squad || "-", r.age == null ? "-" : String(r.age), r.level == null ? "-" : String(r.level),
      ...r.rounds, r.score == null ? "-" : String(r.score), r.change == null ? "-" : (r.change >= 0 ? "+" : "") + r.change
    ];
    let x = 14; cols.forEach((c, k) => { if (c.h === "Score") doc.setFont("helvetica", "bold"); cell(vals[k], x, c.w, c.a); doc.setFont("helvetica", "normal"); x += c.w; });
    y += 7;
  });
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text("Coach Tools  |  Test & Assess" + (opts.ranked ? "  |  Ranked - head coach only" : ""), 14, H - 7);
    doc.text(`Page ${p} of ${n}`, W - 14, H - 7, { align: "right" });
  }
  doc.save(ascii(`${opts.title} ${opts.date}`).replace(/[^\w-]+/g, "_") + ".pdf");
}
