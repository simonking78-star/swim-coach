import { useEffect, useId, useRef, type ReactNode } from "react";

// Native <dialog>: focus is trapped, Escape closes, the page behind is inert.
// Tapping the backdrop also closes. Children render only while open.
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="modal-card">
          <div className="modal-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn plain" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
