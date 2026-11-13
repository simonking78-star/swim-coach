import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { allowedItems, defaultLayout, PANELS, useHomeLayout, type HomeLayout, type LayoutItem } from "../home/layout";
import { SECTIONS } from "../sections";
import { isSharedDevice, readDensity, setDensity, type Density } from "../lib/device";

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
          <ThisDevice />
          <InstallHelp />
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

// How to put the app on a phone's home screen. iPhones have no install button,
// so the steps are spelled out; Android and desktop Chrome offer one in the menu.
function InstallHelp() {
  const installed = typeof matchMedia === "function" && (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return (
    <section className="card settings-card" id="install">
      <h2>Put Coach Tools on your home screen</h2>
      {installed ? <p className="dim">✓ You're already using it from the home screen.</p> : (
        <p className="dim">It then opens full screen like an app, and keeps working on poolside signal.</p>
      )}
      <details open={ios && !installed}>
        <summary><strong>iPhone or iPad (Safari)</strong></summary>
        <ol className="help-steps">
          <li>Open this site in <strong>Safari</strong>. Other browsers on iPhone can't add it.</li>
          <li>Tap the <strong>Share</strong> button (a square with an arrow pointing up) at the bottom of the screen.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Coach Tools appears on your home screen.</li>
        </ol>
        <p className="hint">Open it from that icon each time. Signing in again is normal the first time.</p>
      </details>
      <details open={!ios && !installed}>
        <summary><strong>Android (Chrome)</strong></summary>
        <ol className="help-steps">
          <li>Open this site in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>⋮ menu</strong> at the top right.</li>
          <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</li>
        </ol>
      </details>
    </section>
  );
}

// Display choices for this browser only (A-121). Density matters only with a mouse;
// phones and tablets keep their touch sizes whatever is chosen here.
function ThisDevice() {
  const [density, setD] = useState<Density>(readDensity);
  const pick = (d: Density) => { setD(d); setDensity(d); };
  return (
    <section className="card settings-card" aria-labelledby="dev-title">
      <h2 id="dev-title">This device</h2>
      <p className="dim">Saved in this browser only.</p>
      <fieldset className="choice-set">
        <legend>Size of buttons and rows with a mouse</legend>
        <div className="seg seg-2">
          {([["compact", "Compact"], ["comfortable", "Comfortable"]] as [Density, string][]).map(([d, l]) => (
            <button key={d} type="button" className={"seg-btn" + (density === d ? " on" : "")} aria-pressed={density === d} onClick={() => pick(d)}>{l}</button>
          ))}
        </div>
      </fieldset>
      <p className="hint">Compact fits more on a desktop screen. Touch screens always use the larger size.</p>
      {isSharedDevice() && <p className="hint">Signed in as a <strong>shared computer</strong>: you'll be signed out when the browser closes or after 15 minutes without use.</p>}
    </section>
  );
}
