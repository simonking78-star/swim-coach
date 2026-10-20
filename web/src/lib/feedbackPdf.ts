import type { FbEntry, SwimmerLite } from "./feedback";
import { CATEGORIES, CATEGORY_LABEL } from "./feedback";
import { fmtDate } from "./util";

// Swimmer feedback → PDF. Same layout as the current app's buildFeedbackPdf():
// one section per stroke/skill (CATEGORIES order, unknown ones A–Z after),
// entries newest → oldest, navy header band, page footer.

/** jsPDF's built-in fonts cover Latin-1 only: swap smart punctuation, drop the rest (emoji etc.). */
export function pdfSafe(s: unknown): string {
  return (s == null ? "" : String(s))
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "");
}

export function pdfGroups(rows: FbEntry[]) {
  const by: Record<string, FbEntry[]> = {};
  for (const r of rows) { const c = (r.category || "").trim() || "Other"; (by[c] ||= []).push(r); }
  const known = CATEGORIES.filter(c => by[c]);
  const extra = Object.keys(by).filter(c => !CATEGORIES.includes(c)).sort();
  return [...known, ...extra].map(category => ({
    category,
    rows: by[category].slice().sort((a, b) =>
      (b.session_date || "").localeCompare(a.session_date || "") || (b.created_at || "").localeCompare(a.created_at || ""))
  }));
}

type RGB = [number, number, number];
interface Line { t: string; size: number; bold: boolean; color: RGB; gap: number; }

export async function buildFeedbackPdf(swimmer: SwimmerLite, rows: FbEntry[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const marginL = 40, usableW = pageW - marginL * 2, topY = 50, bottomY = pageH - 48;
  const NAVY: RGB = [11, 37, 69], DIM: RGB = [91, 107, 127], TEXT: RGB = [26, 35, 50], RULE: RGB = [150, 162, 178];
  const lh = (pt: number) => pt * 1.35;
  const name = pdfSafe(swimmer.full_name || "Swimmer");
  let y = 102;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(name, marginL, 36);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const bits = ["Swimmer feedback"];
  if (swimmer.squad) bits.push(pdfSafe(swimmer.squad));
  bits.push(today, `${rows.length} entr${rows.length === 1 ? "y" : "ies"}`);
  doc.text(bits.join("   ·   "), marginL, 58);

  const push = (list: Line[], text: string, o: Partial<Omit<Line, "t">> = {}) => {
    const { size = 10.5, bold = false, color = TEXT, gap = 0 } = o;
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size);
    let first = true;
    for (const p of pdfSafe(text).split("\n")) {
      for (const t of (p.trim() ? doc.splitTextToSize(p, usableW) as string[] : [""])) {
        list.push({ t, size, bold, color, gap: first ? gap : 0 });
        first = false;
      }
    }
  };
  const blockH = (L: Line[]) => L.reduce((s, o) => s + o.gap + lh(o.size), 0);
  const draw = (L: Line[]) => {
    for (const o of L) {
      const h = lh(o.size);
      if (y + o.gap + h > bottomY) { doc.addPage(); y = topY; } else { y += o.gap; }
      doc.setFont("helvetica", o.bold ? "bold" : "normal"); doc.setFontSize(o.size); doc.setTextColor(...o.color);
      doc.text(o.t, marginL, y + o.size);
      y += h;
    }
  };
  const entryLines = (r: FbEntry) => {
    const L: Line[] = [];
    const date = r.session_date ? fmtDate(r.session_date) : "No date";
    push(L, r.status ? `${date}  -  ${r.status}` : date, { size: 11, bold: true, color: NAVY });
    if (r.criterion) push(L, r.criterion, { bold: true, gap: 3 });
    const obs = r.observation || r.note || "";
    if (obs) { push(L, "Observation", { size: 8.5, color: DIM, gap: 6 }); push(L, obs); }
    if (r.remedial_action) { push(L, "Remedial action", { size: 8.5, color: DIM, gap: 6 }); push(L, r.remedial_action); }
    if (r.note && r.observation) { push(L, "Additional notes", { size: 8.5, color: DIM, gap: 6 }); push(L, r.note); }
    return L;
  };

  for (const g of pdfGroups(rows)) {
    const first = entryLines(g.rows[0]);
    if (y + 16 + 26 + Math.min(blockH(first), 90) > bottomY) { doc.addPage(); y = topY; }
    doc.setDrawColor(...RULE); doc.setLineWidth(0.8);
    doc.line(marginL, y, pageW - marginL, y);
    y += 16;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14.5); doc.setTextColor(...NAVY);
    doc.text(pdfSafe(CATEGORY_LABEL[g.category] || g.category), marginL, y + 12);
    y += 26;
    g.rows.forEach((r, i) => {
      const L = i === 0 ? first : entryLines(r);
      const h = blockH(L);
      if (y + h > bottomY && h <= bottomY - topY) { doc.addPage(); y = topY; }
      draw(L);
      y += 12;
    });
    y += 6;
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...DIM);
    doc.text(`${name}  ·  Swimmer feedback`, marginL, pageH - 24);
    doc.text(`Page ${i} of ${n}`, pageW - marginL, pageH - 24, { align: "right" });
  }
  return doc;
}

/** Build, then offer the phone's share sheet; fall back to a download. */
export async function shareFeedbackPdf(swimmer: SwimmerLite, rows: FbEntry[]): Promise<void> {
  const doc = await buildFeedbackPdf(swimmer, rows);
  const slug = pdfSafe(swimmer.full_name || "swimmer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const filename = `feedback-${slug || "swimmer"}-${stamp}.pdf`;
  const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${swimmer.full_name} - feedback` }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; console.error(e); }
  }
  doc.save(filename);
}
