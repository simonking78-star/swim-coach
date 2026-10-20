import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { sb } from "../lib/supabase";
import { logEvent } from "../lib/util";
import { Modal } from "./Modal";

// A-043: send feedback about the app from any screen. Goes to app_feedback (Simon), not to other coaches.
export function SendFeedback({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const { club } = useClub();
  const { pathname } = useLocation();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setText(""); setMsg(null); onClose(); };

  const send = async () => {
    const message = text.trim();
    if (!message) { setMsg({ text: "Say a bit about what's on your mind.", error: true }); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb.from("app_feedback").insert({ user_id: session!.user.id, club: club || null, page: pathname, message } as never);
    setBusy(false);
    if (error) { setMsg({ text: "Could not send — " + error.message, error: true }); return; }
    logEvent(session?.user.id, club, "core_task", "feedback_submitted", { page: pathname });
    setMsg({ text: "Sent — thanks." });
    setTimeout(close, 900);
  };

  return (
    <Modal open={open} onClose={close} title="Send feedback">
      <p className="hint top">Bugs, confusing bits, anything you'd change — goes straight to Simon, not to other coaches.</p>
      <label htmlFor="sf-text" className="sr-only">Your feedback</label>
      <textarea id="sf-text" rows={5} placeholder="What's on your mind?" value={text} onChange={e => setText(e.target.value)} autoFocus />
      <button type="button" className="btn primary wide" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send"}</button>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </Modal>
  );
}
