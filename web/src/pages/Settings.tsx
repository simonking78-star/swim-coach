import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { allowedItems, defaultLayout, PANELS, useHomeLayout, type HomeLayout, type LayoutItem } from "../home/layout";
import { SECTIONS } from "../sections";

type ListKey = keyof HomeLayout;

// Settings → Home screen: switch panels and shortcut buttons on or off and put
// them in order. Saved to the user's account, so it follows them across devices.
export function Settings() {
  const { access } = useAuth();
  const { layout: saved, loading, loadError, setLayout, saveState: save } = useHomeLayout();
  // Local copy so every tap shows at once; saving to the account happens in the background.
  const [layout, setLocal] = useState<HomeLayout>(saved);
  useEffect(() => setLocal(saved), [saved]);
  const apply = (next: HomeLayout) => { setLocal(next); setLayout(next); };
  const raw = allowedItems(layout, access);
  // Shown items first (in their order), hidden items after — so arrows only reorder what's shown.
  const shownFirst = (items: LayoutItem[]) => [...items.filter(i => i.visible), ...items.filter(i => !i.visible)];
  const allowed = { panels: shownFirst(raw.panels), buttons: shownFirst(raw.buttons) };

  function update(list: ListKey, next: LayoutItem[]) {
    // Write back only the allowed items' new order; keep hidden-by-role items where they were.
    const others = layout[list].filter(i => !next.some(n => n.id === i.id));
    apply({ ...layout, [list]: [...next, ...others] });
  }
  // Switching an item on adds it to the end of the shown items; switching it off moves it to the hidden group.
  const toggle = (list: ListKey, items: LayoutItem[], id: string) => {
    const item = items.find(i => i.id === id)!;
    const rest = items.filter(i => i.id !== id);
    const flipped = { ...item, visible: !item.visible };
    update(list, shownFirst([...rest.filter(i => i.visible), flipped, ...rest.filter(i => !i.visible)]));
  };
  const move = (list: ListKey, items: LayoutItem[], index: number, delta: number) => {
    const to = index + delta;
    const shown = items.filter(i => i.visible).length;
    if (to < 0 || to >= shown) return;
    const next = items.slice();
    [next[index], next[to]] = [next[to], next[index]];
    update(list, next);
  };

  const status = save.isPending ? "Saving…" : save.isError ? `Not saved: ${(save.error as Error).message}` : save.isSuccess ? "Saved" : "";

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <p className="dim">Choose what your home screen shows and in what order. Saved to your account.</p>
      </div>
      {loadError && <p className="notice warn">Your saved layout couldn't be loaded, so the default is shown. {loadError.message}</p>}
      {loading ? <p className="dim">Loading…</p> : (
        <>
          <ItemList
            title="Information panels"
            hint="Figures shown at the top of your home screen."
            items={allowed.panels}
            labelFor={id => PANELS.find(p => p.id === id)!}
            onToggle={id => toggle("panels", allowed.panels, id)}
            onMove={(i, d) => move("panels", allowed.panels, i, d)}
            empty="No information panels are available for your role."
          />
          <ItemList
            title="Shortcut buttons"
            hint="Buttons shown under the panels. Every section is always in the menu."
            items={allowed.buttons}
            labelFor={id => { const s = SECTIONS.find(x => x.key === id)!; return { label: `${s.icon} ${s.label}`, description: s.blurb }; }}
            onToggle={id => toggle("buttons", allowed.buttons, id)}
            onMove={(i, d) => move("buttons", allowed.buttons, i, d)}
            empty="No sections are available for your role."
          />
          <div className="settings-foot">
            <button className="btn" onClick={() => apply(defaultLayout())} disabled={save.isPending}>Reset to default</button>
            <span className={"save-status" + (save.isError ? " error" : "")} role="status" aria-live="polite">{status}</span>
          </div>
        </>
      )}
    </>
  );
}

function ItemList(props: {
  title: string; hint: string; items: LayoutItem[]; empty: string;
  labelFor: (id: string) => { label: string; description: string };
  onToggle: (id: string) => void; onMove: (index: number, delta: number) => void;
}) {
  const { title, hint, items, empty, labelFor, onToggle, onMove } = props;
  return (
    <section className="card settings-card">
      <h2>{title}</h2>
      <p className="dim">{hint}</p>
      {items.length === 0 ? <p className="dim">{empty}</p> : (
        <ol className="order-list">
          {items.map((item, i) => {
            const shownCount = items.filter(x => x.visible).length;
            const { label, description } = labelFor(item.id);
            const inputId = `show-${item.id}`;
            return (
              <li key={item.id} className={item.visible ? "" : "off"}>
                <input type="checkbox" id={inputId} checked={item.visible} onChange={() => onToggle(item.id)} />
                <label htmlFor={inputId}>
                  <strong>{label}</strong>
                  <span className="dim">{description}</span>
                </label>
                <span className="order-btns">
                  <button type="button" className="icon-btn plain" aria-label={`Move ${label} up`} disabled={!item.visible || i === 0} onClick={() => onMove(i, -1)}>↑</button>
                  <button type="button" className="icon-btn plain" aria-label={`Move ${label} down`} disabled={!item.visible || i >= shownCount - 1} onClick={() => onMove(i, 1)}>↓</button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
