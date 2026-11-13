import { FEE_METHODS, FEE_STATUS, money, outstanding, type Fee } from "../../lib/membership";
import { todayLocal } from "../../lib/util";

// Fees + paid status. No card or bank details are ever entered here.

export function FeesEditor({ fees, setFees, onRemove, accountId, athletes, fixedSwimmer, canEdit }: {
  fees: Fee[]; setFees: (f: Fee[]) => void; onRemove: (id: string) => void;
  accountId: string | null; athletes: { id: string; full_name: string }[]; fixedSwimmer?: string; canEdit: boolean;
}) {
  const upd = (i: number, patch: Partial<Fee>) => setFees(fees.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = (type: Fee["fee_type"]) => setFees([...fees, {
    account_id: accountId ?? "", swimmer_id: fixedSwimmer ?? null, fee_type: type, description: null, amount: 0,
    period_start: null, period_end: null, due_on: todayLocal().date, status: "due", paid_on: null, method: null, notes: null
  }]);
  const owed = outstanding(fees);
  const name = (id: string | null) => (id ? athletes.find(a => a.id === id)?.full_name ?? "Athlete" : "Account");

  return (
    <div className="fees">
      <p className="fees-total">Outstanding: <strong className={owed > 0 ? "owed" : undefined}>{money(owed)}</strong> <span className="dim">· {fees.length} fee{fees.length === 1 ? "" : "s"} on record</span></p>
      {!accountId && canEdit && <p className="hint">Link this athlete to an account holder before adding fees: the account pays them.</p>}
      <div className="table-wrap">
        <table className="data fees-table">
          <thead><tr><th scope="col">Type</th>{!fixedSwimmer && <th scope="col">For</th>}<th scope="col">Description</th><th scope="col" className="num">Amount £</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col">Paid on</th><th scope="col">Method</th>{canEdit && <th scope="col"><span className="sr-only">Remove</span></th>}</tr></thead>
          <tbody>
            {fees.length === 0 && <tr><td colSpan={9} className="dim">No fees recorded.</td></tr>}
            {fees.map((f, i) => (
              <tr key={f.id ?? "new" + i} className={"fee-" + f.status}>
                <td>{canEdit ? <select aria-label="Fee type" value={f.fee_type} onChange={e => upd(i, { fee_type: e.target.value as Fee["fee_type"] })}><option value="membership">Membership</option><option value="squad">Squad</option><option value="other">Other</option></select> : f.fee_type}</td>
                {!fixedSwimmer && <td>{canEdit ? <select aria-label="Fee for" value={f.swimmer_id ?? ""} onChange={e => upd(i, { swimmer_id: e.target.value || null })}><option value="">Account</option>{athletes.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}</select> : name(f.swimmer_id)}</td>}
                <td>{canEdit ? <input aria-label="Description" value={f.description ?? ""} placeholder="e.g. Nov squad fee" onChange={e => upd(i, { description: e.target.value })} /> : f.description || "—"}</td>
                <td className="num">{canEdit ? <input aria-label="Amount in pounds" type="number" min="0" step="0.01" inputMode="decimal" value={String(f.amount)} onChange={e => upd(i, { amount: e.target.value === "" ? 0 : Number(e.target.value) })} /> : money(Number(f.amount))}</td>
                <td>{canEdit ? <input aria-label="Due date" type="date" value={f.due_on ?? ""} onChange={e => upd(i, { due_on: e.target.value || null })} /> : f.due_on || "—"}</td>
                <td>{canEdit ? <select aria-label="Status" value={f.status} onChange={e => upd(i, { status: e.target.value as Fee["status"], paid_on: e.target.value === "paid" ? (f.paid_on || todayLocal().date) : f.paid_on })}>{FEE_STATUS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select> : f.status}</td>
                <td>{canEdit ? <input aria-label="Paid on" type="date" value={f.paid_on ?? ""} onChange={e => upd(i, { paid_on: e.target.value || null })} /> : f.paid_on || "—"}</td>
                <td>{canEdit ? <select aria-label="Payment method" value={f.method ?? ""} onChange={e => upd(i, { method: e.target.value || null })}><option value="">—</option>{FEE_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : FEE_METHODS.find(m => m[0] === f.method)?.[1] ?? "—"}</td>
                {canEdit && <td><button type="button" className="link-btn" onClick={() => { if (f.id) onRemove(f.id); setFees(fees.filter((_, j) => j !== i)); }}>remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && accountId !== null && (
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => add("squad")}>+ Squad fee</button>
          <button type="button" className="btn small" onClick={() => add("membership")}>+ Membership fee</button>
          <button type="button" className="btn small" onClick={() => add("other")}>+ Other</button>
        </div>
      )}
      <p className="hint">Records fees and whether they're paid. Never type card or bank details here.</p>
    </div>
  );
}
