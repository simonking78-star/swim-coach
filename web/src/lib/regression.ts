import type { CqtFn, Sex } from "./cqt";
import { decYear, linreg, parseTimeStr, type Pt } from "./results";

// Regression Analysis — same method as the current app (and the
// swimmer-regression-chart skill): straight-line trend through actual swims,
// monthly projection to the end of 2031, stepped county-standard lines by age,
// and a forecast year where the trend first meets each standard.

export const PROJECT_TO = 2032;
export const LAST_STANDARD_YEAR = 2031;

export interface SwimPt extends Pt { meet_date: string; age: number | null; is_pb: boolean; meet_name: string | null; }

export interface RegRow { event: string; course: string; swim_time_display: string | null; meet_date: string; meet_name: string | null; age_at_swim: number | null; is_pb: boolean | null; }

export function toPoints(rows: RegRow[]): SwimPt[] {
  return rows.map(r => {
    const y = parseTimeStr(r.swim_time_display);
    return y == null ? null : { x: decYear(r.meet_date), y, meet_date: r.meet_date, age: r.age_at_swim, is_pb: !!r.is_pb, meet_name: r.meet_name };
  }).filter((p): p is SwimPt => p !== null).sort((a, b) => a.x - b.x);
}

export type Line = { slope: number; intercept: number };

/** Monthly points along the trend from the last swim to 2032 (times above 10s only). */
export function projection(reg: Line, fromX: number): Pt[] {
  const out: Pt[] = [];
  for (let x = fromX; x <= PROJECT_TO; x += 1 / 12) {
    const y = reg.slope * x + reg.intercept;
    if (y > 10) out.push({ x, y });
  }
  return out;
}

/** A standard as a stepped line: flat across each calendar year at that year's age. */
export function steppedStandard(fromYear: number, sex: Sex, event: string, birthYear: number, fn: CqtFn): Pt[] {
  const out: Pt[] = [];
  for (let y = fromYear; y <= LAST_STANDARD_YEAR; y++) {
    const v = fn(sex, event, y - birthYear);
    if (v == null) continue;
    out.push({ x: y, y: v }, { x: y + 0.999, y: v });
  }
  return out;
}

/** First calendar year the trend reaches the standard for that year's age, or null. */
export function forecastCrossing(reg: Line, fromX: number, sex: Sex, event: string, birthYear: number, fn: CqtFn): number | null {
  for (let x = fromX; x <= PROJECT_TO; x += 1 / 12) {
    const target = fn(sex, event, Math.floor(x) - birthYear);
    if (target != null && reg.slope * x + reg.intercept <= target) return Math.floor(x);
  }
  return null;
}

/** Warnings shown under the chart, as in the current app. */
export function trendFlags(sc: SwimPt[], lc: SwimPt[], scReg: Line | null, lcReg: Line | null): string[] {
  const f: string[] = [];
  const one = (c: string, pts: SwimPt[], reg: Line | null) => {
    if (pts.length === 1) f.push(`${c}: 1 data point — no trend line possible. Race this event more to enable forecasting.`);
    if (pts.length === 2) f.push(`${c}: 2 data points — trend is indicative only.`);
    if (reg && reg.slope >= 0) f.push(`${c}: no improvement trend detected.`);
  };
  one("SC", sc, scReg); one("LC", lc, lcReg);
  return f;
}

export const trend = (pts: SwimPt[]): Line | null => (pts.length >= 2 ? linreg(pts) : null);
