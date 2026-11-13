import { useMemo, useState, type ReactNode } from "react";

// A live table the user can shape: choose and reorder columns (remembered on this
// device), search, filter per column, sort by any column, and export what is shown.

export interface DtCol<T> {
  key: string;
  label: string;
  get: (row: T) => string | number | null | undefined;
  /** Render something richer than the text value (the value is still used to sort/filter). */
  render?: (row: T) => ReactNode;
  /** "select" filters by the distinct values in the column; "text" by contains. Default text. */
  filter?: "text" | "select" | "none";
  fixed?: boolean;
  /** Shown when the user hasn't chosen columns yet. */
  default?: boolean;
  num?: boolean;
  nowrap?: boolean;
}

interface Props<T> {
  storageKey: string;
  title: ReactNode;
  columns: DtCol<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  loading?: boolean;
  error?: boolean;
  empty?: string;
  toolbar?: ReactNode;
  /** Filters to start with, e.g. { status: "Live" }. */
  initialFilters?: Record<string, string>;
  csvName?: string;
}

interface Saved { cols: string[] }
function readSaved(key: string): Saved | null {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v && Array.isArray(v.cols) ? v : null; } catch { return null; }
}

export function DataTable<T>({ storageKey, title, columns, rows, rowKey, onRowClick, loading, error, empty, toolbar, initialFilters, csvName }: Props<T>) {
  const fixed = columns.filter(c => c.fixed).map(c => c.key);
  const [cols, setColsState] = useState<string[]>(() => {
    const s = readSaved(storageKey);
    const known = s?.cols.filter(k => columns.some(c => c.key === k));
    if (known?.length) return [...fixed.filter(k => !known.includes(k)), ...known];
    return columns.filter(c => c.fixed || c.default).map(c => c.key);
  });
  const [chooser, setChooser] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialFilters && Object.keys(initialFilters).length > 0);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters ?? {});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const save = (next: string[]) => {
    setColsState(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ cols: next })); } catch { /* storage unavailable */ }
  };
  const toggle = (k: string, on: boolean) => save(on ? [...cols, k] : cols.filter(x => x !== k));
  const move = (k: string, by: -1 | 1) => {
    const i = cols.indexOf(k), j = i + by;
    if (i < 0 || j < 0 || j >= cols.length) return;
    const next = cols.slice(); [next[i], next[j]] = [next[j], next[i]]; save(next);
  };
  const reset = () => save(columns.filter(c => c.fixed || c.default).map(c => c.key));

  const shownCols = cols.map(k => columns.find(c => c.key === k)).filter((c): c is DtCol<T> => !!c);
  const text = (c: DtCol<T>, r: T) => { const v = c.get(r); return v == null || v === "" ? "" : String(v); };

  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of columns) if (c.filter === "select") o[c.key] = [...new Set(rows.map(r => text(c, r)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns]);

  const t = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let out = rows.filter(r => {
      if (t && !shownCols.some(c => text(c, r).toLowerCase().includes(t))) return false;
      for (const [k, v] of Object.entries(filters)) {
        if (!v) continue;
        const c = columns.find(x => x.key === k);
        if (!c) continue;
        const val = text(c, r);
        if (c.filter === "select" ? (v === "(blank)" ? val !== "" : val !== v) : !val.toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
    if (sort) {
      const c = columns.find(x => x.key === sort.key);
      if (c) out = out.slice().sort((a, b) => {
        const x = c.get(a), y = c.get(b);
        if (x == null || x === "") return 1;
        if (y == null || y === "") return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, t, filters, sort, cols]);

  const active = Object.values(filters).filter(Boolean).length;
  const clickSort = (k: string) => setSort(s => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));

  const exportCsv = () => {
    const q2 = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [shownCols.map(c => q2(c.label)).join(","), ...shown.map(r => shownCols.map(c => q2(text(c, r))).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${csvName ?? "export"}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="card dt">
      <div className="card-head top">
        <h2 className="card-title">{title} {!loading && <span className="dim">({shown.length}{shown.length !== rows.length ? ` of ${rows.length}` : ""})</span>}</h2>
        <div className="btn-row">
          {toolbar}
          <button type="button" className="btn small" aria-expanded={showFilters} onClick={() => setShowFilters(o => !o)}>Filters{active ? ` (${active})` : ""} {showFilters ? "▴" : "▾"}</button>
          <button type="button" className="btn small" aria-expanded={chooser} onClick={() => setChooser(o => !o)}>Columns {chooser ? "▴" : "▾"}</button>
          {csvName && <button type="button" className="btn small" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>}
        </div>
      </div>

      <div className="dt-search">
        <label className="sr-only" htmlFor={storageKey + "-q"}>Search the table</label>
        <input id={storageKey + "-q"} type="search" placeholder="Search…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {chooser && (
        <div className="dt-chooser" role="group" aria-label="Columns to show">
          <p className="hint">Tick the columns you want. Use ↑ ↓ to change the order. Remembered on this device.</p>
          <ul className="dt-col-list">
            {cols.map((k, i) => {
              const c = columns.find(x => x.key === k);
              if (!c) return null;
              return (
                <li key={k} className="dt-col on">
                  <label><input type="checkbox" checked disabled={c.fixed} onChange={() => toggle(k, false)} /> {c.label}</label>
                  <span className="dt-move">
                    <button type="button" className="icon-btn plain" aria-label={`Move ${c.label} earlier`} disabled={i === 0} onClick={() => move(k, -1)}>↑</button>
                    <button type="button" className="icon-btn plain" aria-label={`Move ${c.label} later`} disabled={i === cols.length - 1} onClick={() => move(k, 1)}>↓</button>
                  </span>
                </li>
              );
            })}
            {columns.filter(c => !cols.includes(c.key)).map(c => (
              <li key={c.key} className="dt-col">
                <label><input type="checkbox" checked={false} onChange={() => toggle(c.key, true)} /> {c.label}</label>
              </li>
            ))}
          </ul>
          <button type="button" className="link-btn" onClick={reset}>Reset to default columns</button>
        </div>
      )}

      {showFilters && (
        <div className="dt-filters">
          {columns.filter(c => c.filter !== "none").map(c => (
            <div key={c.key} className="dt-filter">
              <label htmlFor={`${storageKey}-f-${c.key}`}>{c.label}</label>
              {c.filter === "select"
                ? <select id={`${storageKey}-f-${c.key}`} value={filters[c.key] ?? ""} onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}>
                    <option value="">Any</option>
                    {(options[c.key] ?? []).map(v => <option key={v || "(blank)"} value={v || "(blank)"}>{v || "(blank)"}</option>)}
                  </select>
                : <input id={`${storageKey}-f-${c.key}`} type="search" value={filters[c.key] ?? ""} placeholder="contains…" onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))} />}
            </div>
          ))}
          {active > 0 && <button type="button" className="link-btn" onClick={() => setFilters({})}>Clear all filters</button>}
        </div>
      )}

      {loading && <p className="dim">Loading…</p>}
      {error && <p className="msg error">Couldn't load this table.</p>}
      {!loading && !error && (
        <div className="table-wrap">
          <table className="data dt-table">
            <thead>
              <tr>
                {shownCols.map(c => (
                  <th key={c.key} scope="col" className={c.num ? "num" : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" className="dt-sort" onClick={() => clickSort(c.key)}>
                      {c.label}<span aria-hidden="true">{sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={shownCols.length} className="dim">{empty ?? "Nothing matches."}</td></tr>}
              {shown.map(r => (
                <tr key={rowKey(r)} className={onRowClick ? "click-row" : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? e => { if (e.key === "Enter") onRowClick(r); } : undefined}>
                  {shownCols.map((c, i) => {
                    const body = c.render ? c.render(r) : text(c, r) || "—";
                    const cls = [c.num ? "num" : "", c.nowrap ? "nowrap" : ""].filter(Boolean).join(" ") || undefined;
                    return i === 0 ? <th key={c.key} scope="row" className={cls}>{body}</th> : <td key={c.key} className={cls}>{body}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
