import { CATEGORY_LABEL, type FbEntry } from "./feedback";
import { pdfGroups, pdfSafe } from "./feedbackPdf";
import { PB_EVENTS, bestTimes, type ResultRow } from "./results";
import { fmtDate, isoAdd, todayLocal } from "./util";

// Swimmer report PDF — same layout as the current app's buildSwimmerPdf():
// 1. Attendance (30 / 90 days / all, then by month), 2. Personal best times
// (fastest on record per event and course), 3. Feedback grouped by stroke.

type RGB = [number, number, number];
interface Who { full_name: string; squad: string | null; date_of_birth: string | null; }

export async function buildSwimmerPdf(sw: Who, club: string, att: { session_date: string; present: boolean }[], results: ResultRow[], feedback: FbEntry[]) {
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
  const pct = (rows: typeof att) => rows.length ? Math.round((100 * rows.filter(r => r.present).length) / rows.length) + "%" : "-";
  const in30 = att.filter(r => r.session_date >= since30), in90 = att.filter(r => r.session_date >= since90);
  const cols4 = (first: string, a: string, b: string): Col[] => [{ h: first, w: W * 0.4 }, { h: a, w: W * 0.2, align: "right" }, { h: b, w: W * 0.2, align: "right" }, { h: "Attendance", w: W * 0.2, align: "right" }];
  table(cols4("Period", "Sessions attended", "Sessions marked"), [
    ["Last 30 days", in30.filter(r => r.present).length, in30.length, pct(in30)],
    ["Last 90 days", in90.filter(r => r.present).length, in90.length, pct(in90)],
    ["All records", att.filter(r => r.present).length, att.length, pct(att)]
  ]);
  if (att.length) {
    const byMonth: Record<string, typeof att> = {};
    for (const r of att) (byMonth[r.session_date.slice(0, 7)] ||= []).push(r);
    const months = Object.keys(byMonth).sort().reverse().slice(0, 12);
    para("By month (most recent first)", { size: 9, color: DIM, gap: 2 });
    y += 4;
    table(cols4("Month", "Attended", "Missed"), months.map(m => {
      const rows = byMonth[m], a = rows.filter(r => r.present).length;
      return [new Date(m + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }), a, rows.length - a, pct(rows)];
    }));
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

  // ---- 3. Feedback ----
  sectionHead("3. Feedback", 150);
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

export async function shareSwimmerPdf(sw: Who, club: string, data: { attendance: { session_date: string; present: boolean }[]; results: ResultRow[]; feedback: FbEntry[] }) {
  const doc = await buildSwimmerPdf(sw, club, data.attendance, data.results, data.feedback);
  const slug = pdfSafe(sw.full_name || "swimmer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const filename = `swimmer-report-${slug || "swimmer"}-${todayLocal().date}.pdf`;
  const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${sw.full_name} - swimmer report` }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; console.error(e); }
  }
  doc.save(filename);
}
