/**
 * How wide a page may grow on a desktop (A-120). Phones and tablets ignore this.
 *  - form:   a single form to fill in (760px)
 *  - medium: a workflow or editor with some tables (1080px — about the old cap)
 *  - wide:   lists, tables, grids and dashboards (up to 1680px)
 * Anything not listed is wide.
 */
export type PageWidth = "form" | "medium" | "wide";

const RULES: [RegExp, PageWidth][] = [
  [/^\/settings$/, "form"],
  [/^\/timetables\/(new|[^/]+\/edit)$/, "form"],
  [/^\/admin\/(squads|add-member|move-squad|move-club|deactivate)$/, "form"],
  [/^\/season\/macro\/[^/]+\/weeks$/, "wide"],
  [/^\/season\/.+/, "medium"],
  [/^\/sessions\/.+/, "medium"],
  [/^\/measures\/results$/, "wide"],
  [/^\/(attendance|feedback|admin|measures|tests)(\/|$)/, "medium"]
];

export function pageWidth(pathname: string): PageWidth {
  const p = pathname.replace(/\/+$/, "") || "/";
  for (const [re, w] of RULES) if (re.test(p)) return w;
  return "wide";
}
