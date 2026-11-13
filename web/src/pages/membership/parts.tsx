import { useId, type ReactNode } from "react";

// Small form helpers shared by the membership profiles.

export function Txt({ label, value, onChange, type = "text", disabled, placeholder, auto }: {
  label: string; value: string | null | undefined; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string; auto?: string;
}) {
  const id = useId();
  return (
    <div className="mf">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value ?? ""} disabled={disabled} placeholder={placeholder} autoComplete={auto ?? "off"} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function Area({ label, value, onChange, disabled, rows = 2 }: { label: string; value: string | null | undefined; onChange: (v: string) => void; disabled?: boolean; rows?: number }) {
  const id = useId();
  return (
    <div className="mf wide">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={rows} value={value ?? ""} disabled={disabled} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export function Sel({ label, value, onChange, options, disabled, blank }: {
  label: string; value: string | null | undefined; onChange: (v: string) => void; options: readonly (readonly [string, string])[] | { value: string; label: string }[]; disabled?: boolean; blank?: string;
}) {
  const id = useId();
  const opts = (options as unknown[]).map(o => (Array.isArray(o) ? { value: o[0] as string, label: o[1] as string } : (o as { value: string; label: string })));
  return (
    <div className="mf">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ""} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {blank != null && <option value="">{blank}</option>}
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function ReadOnly({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mf">
      <span className="mf-label">{label}</span>
      <span className="mf-value">{value === "" || value == null ? "—" : value}</span>
    </div>
  );
}

export function Fieldset({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <fieldset className="mfs">
      <legend>{title}</legend>
      {actions && <div className="mfs-actions">{actions}</div>}
      <div className="mf-grid">{children}</div>
    </fieldset>
  );
}

/** Save / Close footer used by both profile windows. Close asks before throwing away edits. */
export function ProfileFooter({ canSave, dirty, busy, msg, onSave, onClose, confirmClose, setConfirmClose }: {
  canSave: boolean; dirty: boolean; busy: boolean; msg: { ok: boolean; text: string } | null;
  onSave: () => void; onClose: () => void; confirmClose: boolean; setConfirmClose: (v: boolean) => void;
}) {
  return (
    <div className="profile-foot">
      {msg && <p className={"msg" + (msg.ok ? "" : " error")} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      {confirmClose
        ? (
          <div className="btn-row">
            <span className="dim">You have unsaved changes.</span>
            <button type="button" className="btn small danger" onClick={onClose}>Discard and close</button>
            <button type="button" className="btn small" onClick={() => setConfirmClose(false)}>Keep editing</button>
          </div>
        )
        : (
          <div className="btn-row">
            {canSave && <button type="button" className="btn primary" disabled={!dirty || busy} onClick={onSave}>{busy ? "Saving…" : "Save"}</button>}
            <button type="button" className="btn" onClick={() => (dirty && canSave ? setConfirmClose(true) : onClose())}>Close</button>
          </div>
        )}
    </div>
  );
}

export const StatusChip = ({ status, label }: { status: string; label: string }) => <span className={"chip st-" + status}>{label}</span>;
