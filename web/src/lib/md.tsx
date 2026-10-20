import type { ReactNode } from "react";

// A-dev-specs: tiny markdown renderer for the project's own spec docs, just
// good enough for what those docs actually use -- headers, bold, inline
// code, bullet/numbered lists, tables, horizontal rules, paragraphs. Not a
// general-purpose markdown engine; no need for one dependency just to show
// Simon his own specs read-only.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Split on **bold** and `code` without losing the delimiters, in one pass.
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={keyBase + "-" + i++}>{tok.slice(2, -2)}</strong>);
    else out.push(<code key={keyBase + "-" + i++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function isTableBlock(lines: string[]): boolean {
  return lines.length >= 2 && lines[0].includes("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]);
}

function renderTable(lines: string[], key: string): ReactNode {
  const split = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
  const head = split(lines[0]);
  const rows = lines.slice(2).map(split);
  return (
    <table className="data" key={key}>
      <thead><tr>{head.map((h, i) => <th key={i}>{inline(h, key + "-h" + i)}</th>)}</tr></thead>
      <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, key + "-" + ri + "-" + ci)}</td>)}</tr>)}</tbody>
    </table>
  );
}

export function renderMarkdown(src: string): ReactNode {
  const blocks = src.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(l => l.trim().length > 0);
        if (!lines.length) return null;
        const key = "b" + bi;

        if (/^#{1,6}\s/.test(lines[0]) && lines.length === 1) {
          const m = /^(#{1,6})\s+(.*)$/.exec(lines[0])!;
          const level = Math.min(m[1].length + 1, 6); // h1 of the doc's own heading maps to h2 on the page
          const Tag = (`h${level}` as unknown) as "h2";
          return <Tag key={key}>{inline(m[2], key)}</Tag>;
        }
        if (lines.every(l => /^\s*-{3,}\s*$/.test(l))) return <hr key={key} />;
        if (isTableBlock(lines)) return renderTable(lines, key);
        if (lines.every(l => /^\s*([-*]|\d+\.)\s/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map(l => l.replace(/^\s*([-*]|\d+\.)\s/, ""));
          const ListTag = ordered ? "ol" : "ul";
          return <ListTag key={key}>{items.map((it, ii) => <li key={ii}>{inline(it, key + "-" + ii)}</li>)}</ListTag>;
        }
        return <p key={key}>{lines.map((l, li) => <span key={li}>{inline(l, key + "-" + li)}{li < lines.length - 1 ? <br /> : null}</span>)}</p>;
      })}
    </>
  );
}
