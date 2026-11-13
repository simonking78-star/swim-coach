import { CATEGORY_LABEL, type FbEntry } from "./feedback";
import { pdfGroups, pdfSafe } from "./feedbackPdf";
import { PB_EVENTS, bestTimes, type ResultRow } from "./results";
import { fmtDate, isoAdd, todayLocal } from "./util";
import { fmtSessions, summarise } from "./attendance";
import type { AttRow } from "./swimmers";
import { VS_AGE_LABEL, fmt2, monthLabel, vsAverage, type SwimmerCompare } from "./measures";

// Swimmer report PDF — same layout as the current app's buildSwimmerPdf():
// 1. Attendance (30 / 90 days / all, then by month), 2. Personal best times
// (fastest on record per event and course), 3. Test sets (latest graded test set
// against the rest of the squad, the age group and the at-age benchmark),
// 4. Feedback grouped by stroke.

type RGB = [number, number, number];
interface Who { full_name: string; squad: string | null; date_of_birth: string | null; }

export async function buildSwimmerPdf(sw: Who, club: string, att: AttRow[], results: ResultRow[], feedback: FbEntry[], tests: SwimmerCompare[] = []) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const mL = 40, W = pageW - mL * 2, topY = 50, bottomY = pageH - 48;
  const NAVY: RGB = [11, 37, 69], DIM: RGB = [91, 107, 127], TEXT: RGB = [26, 35, 50], RULE: RGB = [150, 162, 178], SHADE: RGB = [238, 243, 248], WHITE: RGB = [255, 255, 255];
  const lh = (pt: number) => pt * 1.35;
  const name = pdfSafe(sw.full_name || "Swimmer");
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  let y = 100;
  const need = (h: number) => { if (y + h > bottomY) { doc.addPage(); y = topY; } };
  const font = (size: number, bold: boolean, color: RGB = TEXT) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color); };

  doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, 74, "F");
  font(16, true, WHITE); doc.text(name, mL, 36);
  const bits = ["Swimmer report"];
  if (sw.squad) bits.push(pdfSafe(sw.squad));
  if (sw.date_of_birth) bits.push("Born " + sw.date_of_birth.slice(0, 4));
  bits.push(pdfSafe(club), today);
  font(9.5, false, WHITE); doc.text(bits.join("   ·   "), mL, 58);

  const sectionHead = (title: string, keep = 60) => {
    need(keep);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.8); doc.line(mL, y, pageW - mL, y);
    y += 16; font(14.5, true, NAVY); doc.text(title, mL, y + 12); y += 28;
  };
  type Col = { h: string; w: number; align?: "right" };
  const table = (cols: Col[], rows: (string | number | null)[][]) => {
    const rowH = 18, x0 = mL;
    const head = () => {
      need(rowH * 2);
      doc.setFillColor(...NAVY); doc.rect(x0, y, W, rowH, "F");
      font(9, true, WHITE);
      let x = x0;
      for (const c of cols) { doc.text(c.h, c.align === "right" ? x + c.w - 6 : x + 6, y + 12.5, { align: c.align === "right" ? "right" : "left" }); x += c.w; }
      y += rowH;
    };
    head();
    let startY = y - rowH;
    rows.forEach((r, i) => {
      if (y + rowH > bottomY) { doc.addPage(); y = topY; head(); startY = y - rowH; }
      if (i % 2) { doc.setFillColor(...SHADE); doc.rect(x0, y, W, rowH, "F"); }
      let x = x0;
      r.forEach((v, j) => {
        const c = cols[j];
        font(9.5, j === 0, j === 0 ? NAVY : TEXT);
        doc.text(pdfSafe(v == null ? "" : String(v)), c.align === "right" ? x + c.w - 6 : x + 6, y + 12.5, { align: c.align === "right" ? "right" : "left" });
        x += c.w;
      });
      y += rowH;
    });
    doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.rect(x0, startY, W, y - startY);
    y += 10;
  };
  const para = (text: string, o: { size?: number; bold?: boolean; color?: RGB; gap?: number } = {}) => {
    const { size = 10, bold = false, color = TEXT, gap = 0 } = o;
    y += gap; font(size, bold, color);
    for (const p of pdfSafe(text).split("\n")) {
      for (const t of (p.trim() ? doc.splitTextToSize(p, W) as string[] : [""])) { need(lh(size)); font(size, bold, color); doc.text(t, mL, y + size); y += lh(size); }
    }
  };

  // ---- 1. Attendance ----
  sectionHead("1. Attendance");
  const now = todayLocal().date;
  const since30 = isoAdd(now, -30), since90 = isoAdd(now, -90);
  // The one rule: hours (In = whole session, Partial = minutes attended) and
  // sessions attended (In 1, Partial = minutes ÷ session length). Excused not counted.
  type Col5 = Col;
  const cols5 = (first: string): Col5[] => [{ h: first, w: W * 0.32 }, { h: "Hours trained", w: W * 0.17, align: "right" }, { h: "Sessions attended", w: W * 0.19, align: "right" }, { h: "Sessions counted", w: W * 0.17, align: "right" }, { h: "Attendance", w: W * 0.15, align: "right" }];
  const row = (label: string, rows: AttRow[]) => { const t = summarise(rows); return [label, fmtSessions(t.hours), fmtSessions(t.attended), t.counted, t.pct == null ? "-" : t.pct + "%"]; };
  const in30 = att.filter(r => r.session_date >= since30), in90 = att.filter(r => r.session_date >= since90);
  table(cols5("Period"), [row("Last 30 days", in30), row("Last 90 days", in90), row("All records", att)]);
  if (att.length) {
    const byMonth: Record<string, AttRow[]> = {};
    for (const r of att) (byMonth[r.session_date.slice(0, 7)] ||= []).push(r);
    const months = Object.keys(byMonth).sort().reverse().slice(0, 12);
    para("By month (most recent first)", { size: 9, color: DIM, gap: 2 });
    y += 4;
    table(cols5("Month"), months.map(m => row(new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), byMonth[m])));
    const exc = summarise(att).excused;
    para(`Hours: a whole session for In, the minutes attended for Partial. Sessions: a partial counts as the part attended (minutes ÷ session length, from the timetable). Excused sessions${exc ? ` (${exc} on record)` : ""} are left out.`, { size: 8.5, color: DIM, gap: 2 });
  } else {
    para("No attendance has been recorded for this swimmer yet.", { color: DIM });
  }
  y += 8;

  // ---- 2. Personal best times ----
  sectionHead("2. Personal best times", 150);
  const best = bestTimes(results);
  const cell = (ev: string, c: string, f: "t" | "d") => { const b = best[`${ev}|${c}`]; return b ? (f === "t" ? b.time : fmtDate(b.date)) : "-"; };
  table(
    [{ h: "Events", w: W * 0.24 }, { h: "SC", w: W * 0.17 }, { h: "SC date", w: W * 0.21 }, { h: "LC", w: W * 0.17 }, { h: "LC date", w: W * 0.21 }],
    PB_EVENTS.map(([label, ev]) => {
      const noLc = label === "100 IM" && !best[`${ev}|LC`];
      return [label, cell(ev, "SC", "t"), cell(ev, "SC", "d"), noLc ? "No event" : cell(ev, "LC", "t"), noLc ? "" : cell(ev, "LC", "d")];
    })
  );
  para("Fastest swim on record in each event and course.", { size: 8.5, color: DIM });
  y += 10;

  // ---- 3. Test sets ----
  sectionHead("3. Test sets", 150);
  if (!tests.length) {
    para("No graded test set on record.", { color: DIM });
  } else {
    for (const c of tests) {
      need(260);
      font(12, true, NAVY); doc.text(pdfSafe(`${c.code} - ${c.name}`), mL, y + 12); y += 20;
      para(`Latest: ${fmtDate(c.session_date)}  -  ${c.level_label ?? ""}${c.squad_name ? `  -  tested in ${c.squad_name}` : ""}  -  age ${c.age ?? "?"}`, { size: 9.5, color: DIM });
      y += 4;
      table(
        [{ h: "Reps completed", w: W * 0.2, align: "right" }, { h: "Set completed", w: W * 0.17 }, { h: "Points", w: W * 0.13, align: "right" }, { h: "Vs age level", w: W * 0.2 }, { h: "Pts per age yr", w: W * 0.15, align: "right" }, { h: "Benchmark", w: W * 0.15, align: "right" }],
        [[`${c.value}/${c.max_reps ?? "?"}`, c.set_completed ? "Yes" : "No", c.points ?? "-", c.vs_age ? VS_AGE_LABEL[c.vs_age] : "-", fmt2(c.points_per_age), fmt2(c.benchmark)]]
      );
      para(`Compared with others tested in ${monthLabel(c.month)} (points per age year)`, { size: 10.5, bold: true, color: NAVY, gap: 2 });
      y += 4;
      const sq = vsAverage(c.points_per_age, c.squad_avg_ppa), ag = vsAverage(c.points_per_age, c.age_avg_ppa), bm = vsAverage(c.points_per_age, c.benchmark, 2, "on the benchmark");
      table(
        [{ h: "Compared with", w: W * 0.36 }, { h: "Swimmers", w: W * 0.13, align: "right" }, { h: "Pts per age yr", w: W * 0.17, align: "right" }, { h: "Avg points", w: W * 0.14, align: "right" }, { h: "Difference", w: W * 0.2, align: "right" }],
        [
          [`Rest of ${c.squad_name ?? "squad"}`, c.squad_n, c.squad_n ? fmt2(c.squad_avg_ppa) : "-", c.squad_avg_points ?? "-", c.squad_n ? sq.text : "-"],
          [`Age ${c.age ?? "?"} (all squads)`, c.age_n, c.age_n ? fmt2(c.age_avg_ppa) : "-", c.age_avg_points ?? "-", c.age_n ? ag.text : "-"],
          ["At-age benchmark", "", fmt2(c.benchmark), "", bm.text]
        ]
      );
      // Bars: this swimmer, squad, age group, benchmark (same scale).
      const bars: [string, number | null, RGB][] = [
        ["This swimmer", c.points_per_age, c.vs_age === "above" ? [15, 122, 62] : c.vs_age === "at" ? [42, 120, 214] : [138, 164, 194]],
        [`Rest of ${c.squad_name ?? "squad"}`, c.squad_n ? c.squad_avg_ppa : null, [185, 199, 216]],
        [`Age ${c.age ?? "?"} average`, c.age_n ? c.age_avg_ppa : null, [214, 222, 232]],
        ["At-age benchmark", c.benchmark, NAVY]
      ];
      const shown = bars.filter(b => b[1] != null) as [string, number, RGB][];
      const max = Math.max(...shown.map(b => b[1]), 0.01);
      const labelW = 130, barW = W - labelW - 50, bh = 14;
      need(shown.length * (bh + 6) + 10);
      for (const [label, v, col] of shown) {
        font(9, false, TEXT); doc.text(pdfSafe(label), mL, y + 10.5);
        doc.setFillColor(...col); doc.rect(mL + labelW, y, Math.max(1, (v / max) * barW), bh, "F");
        font(9, true, NAVY); doc.text(fmt2(v), mL + labelW + (v / max) * barW + 5, y + 10.5);
        y += bh + 6;
      }
      y += 4;
      if (c.history.length > 1) {
        para("Test history", { size: 10.5, bold: true, color: NAVY, gap: 4 });
        y += 4;
        table(
          [{ h: "Date", w: W * 0.2 }, { h: "Level", w: W * 0.3 }, { h: "Age", w: W * 0.1, align: "right" }, { h: "Reps", w: W * 0.13, align: "right" }, { h: "Points", w: W * 0.12, align: "right" }, { h: "Pts per age yr", w: W * 0.15, align: "right" }],
          [...c.history].reverse().map(h => [fmtDate(h.date), h.level ?? "-", h.age ?? "-", `${h.value}/${h.max_reps ?? "?"}`, h.points ?? "-", fmt2(h.ppa)])
        );
      }
      para("Points per age year = level x reps completed / age. Points = reps x 1 (below age level), 2 (at) or 3 (above). Averages leave this swimmer out and use each swimmer's latest test in the same month.", { size: 8.5, color: DIM });
      y += 10;
    }
  }
  y += 8;

  // ---- 4. Feedback ----
  sectionHead("4. Feedback", 150);
  if (!feedback.length) {
    para("No feedback on record.", { color: DIM });
  } else {
    for (const g of pdfGroups(feedback)) {
      need(70);
      font(12, true, NAVY); doc.text(pdfSafe(CATEGORY_LABEL[g.category] || g.category), mL, y + 12); y += 22;
      for (const r of g.rows) {
        need(40);
        const date = r.session_date ? fmtDate(r.session_date) : "No date";
        para(r.status ? `${date}  -  ${r.status}` : date, { size: 10.5, bold: true, color: NAVY });
        if (r.criterion) para(r.criterion, { bold: true, gap: 2 });
        const obs = r.observation || r.note || "";
        if (obs) { para("Observation", { size: 8.5, color: DIM, gap: 4 }); para(obs); }
        if (r.remedial_action) { para("Remedial action", { size: 8.5, color: DIM, gap: 4 }); para(r.remedial_action); }
        if (r.note && r.observation) { para("Additional notes", { size: 8.5, color: DIM, gap: 4 }); para(r.note); }
        y += 10;
      }
      y += 4;
    }
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); font(8, false, DIM);
    doc.text(`${name}  ·  Swimmer report`, mL, pageH - 24);
    doc.text(`Page ${i} of ${n}`, pageW - mL, pageH - 24, { align: "right" });
  }
  return doc;
}

export async function shareSwimmerPdf(sw: Who, club: string, data: { attendance: AttRow[]; results: ResultRow[]; feedback: FbEntry[]; tests?: SwimmerCompare[] }) {
  const doc = await buildSwimmerPdf(sw, club, data.attendance, data.results, data.feedback, data.tests ?? []);
  const slug = pdfSafe(sw.full_name || "swimmer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const filename = `swimmer-report-${slug || "swimmer"}-${todayLocal().date}.pdf`;
  const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${sw.full_name} - swimmer report` }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; console.error(e); }
  }
  doc.save(filename);
}
