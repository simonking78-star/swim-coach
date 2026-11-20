// Keeps swimmers' and parents' names out of text sent to the Claude API (A-037 follow-up).
// Each name found is swapped for a placeholder such as [Swimmer 1] before the call,
// and the placeholders in Claude's answer are swapped back afterwards, so the coach
// still sees the names. Names never leave Supabase (London).

// Words that are also first names but mean something in a session plan or in plain English.
// A first name on its own is treated as a name in any case ("ellie" or "Ellie") unless it is in this list.
const COMMON = new Set([
  "max", "will", "may", "mark", "bill", "pat", "rose", "grace", "hope", "faith", "joy", "sky",
  "summer", "autumn", "april", "june", "august", "dawn", "eve", "ivy", "jack", "kick", "drew",
  "lane", "chase", "hunter", "river", "brook", "storm", "rush", "rich", "sunny", "victor",
  "frank", "art", "gene", "ray", "rob", "sam", "sue", "don", "ben", "jay", "kit", "lee", "neil",
  "dash", "flip", "pace", "ace", "rocky", "bobby", "sonny", "penny", "ruby", "amber", "jade",
  "sum", "fly", "free", "back", "pull", "drill", "swim", "easy", "fast", "long", "short", "set",
  "main", "total", "best", "build", "hold", "sprint", "dive", "turn", "start", "finish", "power",
  "mrs", "miss", "mum", "dad", "mother", "father", "the", "and",
]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Redactor = { redact: (s: string) => string; restore: <T>(v: T) => T; count: () => number };

/** names: full names of swimmers and parents for the club. skip: words that must never be treated as names (vocabulary terms). */
export function makeRedactor(names: string[], skip: Iterable<string> = []): Redactor {
  const skipSet = new Set([...COMMON, ...[...skip].map((w) => w.toLowerCase().trim())]);
  const full = new Set<string>(), first = new Set<string>();
  for (const raw of names) {
    const n = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (n.length < 3) continue;
    const parts = n.split(" ");
    if (parts.length > 1) full.add(n);
    const f = parts[0];
    if (f.length >= 3 && !skipSet.has(f.toLowerCase())) first.add(f);
  }
  // Longest first, so "Ellie Smith" is replaced before "Ellie".
  const fullRe = full.size
    ? new RegExp(`(?<![\\p{L}])(${[...full].sort((a, b) => b.length - a.length).map((n) => esc(n).replace(/ /g, "\\s+")).join("|")})(?![\\p{L}])`, "giu")
    : null;
  // First names: whole word only, any case (coaches often type in lower case on a phone).
  const firstRe = first.size
    ? new RegExp(`(?<![\\p{L}])(${[...first].sort((a, b) => b.length - a.length).map(esc).join("|")})(?![\\p{L}])`, "giu")
    : null;

  const toTok = new Map<string, string>(), fromTok = new Map<string, string>();
  const tok = (found: string) => {
    const key = found.toLowerCase().replace(/\s+/g, " ");
    let t = toTok.get(key);
    if (!t) { t = `[Swimmer ${toTok.size + 1}]`; toTok.set(key, t); fromTok.set(t, found.replace(/\s+/g, " ")); }
    return t;
  };

  const redact = (s: string) => {
    let out = String(s ?? "");
    if (fullRe) out = out.replace(fullRe, (m) => tok(m));
    if (firstRe) out = out.replace(firstRe, (m) => tok(m));
    return out;
  };

  const back = (s: string) => s.replace(/\[\s*Swimmer\s+(\d+)\s*\]/gi, (m, n) => fromTok.get(`[Swimmer ${n}]`) ?? m);
  const restore = <T>(v: T): T => {
    if (typeof v === "string") return back(v) as unknown as T;
    if (Array.isArray(v)) return v.map((x) => restore(x)) as unknown as T;
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = restore(x);
      return o as T;
    }
    return v;
  };

  return { redact, restore, count: () => toTok.size };
}
