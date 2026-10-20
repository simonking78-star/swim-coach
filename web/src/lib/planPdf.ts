import { pdfSafe } from "./feedbackPdf";
import { blockDistance, normSkill, parseSetLine, type Plan } from "./plans";
import type { FullDrill } from "./drills";
import { fmtDate, todayLocal } from "./util";

// Session plan PDF and single-drill PDF — same layout as the current app's
// buildPlanPdf() / exportDrillPdf(). jsPDF loads only when one is made.

type RGB = [number, number, number];
const NAVY: RGB = [11, 37, 69], TEXT: RGB = [26, 35, 50], DIM: RGB = [91, 107, 127], WHITE: RGB = [255, 255, 255];

export async function buildPlanPdf(plan: Plan, squadName?: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginL = 40, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - marginL - 40;
  let y = 96;
  const ensure = (h: number) => { if (y + h > pageH - 40) { doc.addPage(); y = 50; } };
  const font = (style: string, size: number, color: RGB = TEXT) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); };

  doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, 74, "F");
  font("bold", 16, WHITE);
  doc.text(doc.splitTextToSize(pdfSafe(plan.title || "Session Plan"), pageW - 80), marginL, 36);
  const meta: string[] = [];
  if (plan.intended_date) meta.push("For " + fmtDate(plan.intended_date));
  if (squadName) meta.push(squadName);
  if (plan.squad_scope) meta.push(plan.squad_scope);
  if (plan.pool_size) meta.push(plan.pool_size + " pool");
  if (plan.total_distance_m) meta.push(plan.total_distance_m.toLocaleString("en-GB") + "m total");
  if (plan.training_zone) meta.push("Zone: " + plan.training_zone);
  if ((plan.stroke_skills || []).length) meta.push(plan.stroke_skills!.map(normSkill).join(", "));
  font("normal", 9.5, WHITE);
  doc.text(pdfSafe(meta.join("   ·   ")), marginL, 58);

  const lines = (text: string, w: number) => doc.splitTextToSize(pdfSafe(text), w) as string[];
  for (const b of plan.content || []) {
    if (b.type === "heading") {
      ensure(22);
      font("bold", 12, NAVY);
      doc.text(pdfSafe(b.text), marginL, y);
      if (b.underline) { doc.setLineWidth(1); doc.setDrawColor(...NAVY); doc.line(marginL, y + 3, marginL + doc.getTextWidth(pdfSafe(b.text)), y + 3); }
      y += 22;
    } else if (b.type === "set") {
      const p = parseSetLine(b.text);
      font("normal", 10.5);
      lines(b.text + (p ? `  (${p.distance_m}m)` : ""), usableW - 12).forEach((ln, i) => { ensure(15); doc.text((i === 0 ? "•  " : "    ") + ln, marginL, y); y += 15; });
    } else if (b.type === "repeat_group") {
      ensure(15);
      font("bold", 10.5);
      doc.text(`${b.reps} x  (${blockDistance(b)}m)`, marginL, y);
      y += 15;
      for (const ch of b.children || []) {
        const p = parseSetLine(ch.text);
        font("normal", 10);
        lines(ch.text + (p ? `  (${p.distance_m}m)` : ""), usableW - 26).forEach((ln, i) => { ensure(14); doc.text((i === 0 ? "    –  " : "       ") + ln, marginL, y); y += 14; });
      }
      y += 4;
    } else if (b.type === "note") {
      font("italic", 9.5, DIM);
      lines(b.text, usableW - 12).forEach(ln => { ensure(13); doc.text(ln, marginL, y); y += 13; });
      y += 4;
    } else if (b.type === "drill") {
      ensure(15);
      font("bolditalic", 10.5);
      doc.text("•  Drill: " + pdfSafe(b.drill_name), marginL, y);
      y += 15;
    }
  }
  if (plan.notes) {
    y += 8; ensure(16);
    font("bold", 10); doc.text("Notes", marginL, y); y += 14;
    font("normal", 9.5, DIM);
    lines(plan.notes, usableW).forEach(ln => { ensure(13); doc.text(ln, marginL, y); y += 13; });
  }
  return doc;
}

const slug = (s: string, fallback: string) => pdfSafe(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

async function shareOrSave(doc: { output: (t: "blob") => Blob; save: (n: string) => void }, filename: string, title: string) {
  const file = new File([doc.output("blob")], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; console.error(e); }
  }
  doc.save(filename);
}

export async function sharePlanPdf(plan: Plan, squadName?: string) {
  const doc = await buildPlanPdf(plan, squadName);
  const datePart = plan.intended_date || (plan.updated_at ? plan.updated_at.slice(0, 10) : todayLocal().date);
  await shareOrSave(doc, `${slug(plan.title || "", "session-plan")}-${datePart}.pdf`, plan.title || "Session Plan");
}

export async function exportDrillPdf(d: FullDrill) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginL = 40, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  let y = 92;
  doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(...WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(pdfSafe(d.drill_name || "Drill"), marginL, 36);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(pdfSafe(d.stroke || ""), marginL, 54);
  const fields: [string, string | null][] = [
    ["Also known as", (d.pseudonyms || []).join(", ")], ["Primary purpose", d.primary_purpose], ["BLABT / focus", d.blabt],
    ["Biomechanical", d.biomechanical], ["Equipment", d.equipment], ["Regression", d.regression], ["Progression", d.progression]
  ];
  for (const [label, val] of fields) {
    if (!val) continue;
    if (y + 40 > pageH - 40) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
    doc.text(label, marginL, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...TEXT);
    for (const ln of doc.splitTextToSize(pdfSafe(val), pageW - marginL - 40) as string[]) { if (y > pageH - 40) { doc.addPage(); y = 50; } doc.text(ln, marginL, y); y += 14; }
    y += 8;
  }
  await shareOrSave(doc, `${slug(d.drill_name || "", "drill")}.pdf`, d.drill_name || "Drill");
}
