import { useEffect, useState } from "react";

// Per-device display and sign-in choices (A-118, A-119, A-121). Kept in this browser only,
// never in the account, because they describe the device, not the person.

const SHARED_KEY = "ct.sharedDevice";
const DENSITY_KEY = "ct.density";
const NAV_KEY = "ct.navCollapsed";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** "This is a shared computer": the sign-in lasts only while this tab is open, and ends after 15 minutes idle. */
export const isSharedDevice = () => read(SHARED_KEY) === "1";
export const setSharedDevice = (on: boolean) => write(SHARED_KEY, on ? "1" : null);

export type Density = "compact" | "comfortable";
/** With a mouse the app is compact unless the user chose comfortable. Touch screens are unaffected. */
export const readDensity = (): Density => (read(DENSITY_KEY) === "comfortable" ? "comfortable" : "compact");
export function applyDensity(d: Density) {
  if (d === "comfortable") document.documentElement.dataset.density = "comfortable";
  else delete document.documentElement.dataset.density;
}
export function setDensity(d: Density) {
  write(DENSITY_KEY, d === "comfortable" ? d : null);
  applyDensity(d);
}

export const readNavCollapsed = () => read(NAV_KEY) === "1";
export const writeNavCollapsed = (on: boolean) => write(NAV_KEY, on ? "1" : null);

/** True while the window is at least `px` wide. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [on, setOn] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return on;
}
