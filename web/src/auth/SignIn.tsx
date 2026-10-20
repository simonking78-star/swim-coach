import { useState, type FormEvent } from "react";
import { sb } from "../lib/supabase";
import { useAuth } from "./AuthProvider";

type Msg = { text: string; error?: boolean } | null;
const LINK_ERROR = new URLSearchParams(location.hash.replace(/^#/, "")).get("error_description") || new URLSearchParams(location.search).get("error_description");

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Arrived from an invite / sign-in / reset link that had expired or was already used.
  const [msg, setMsg] = useState<Msg>(LINK_ERROR ? { text: "That sign-in link has expired or was already used. Ask your club admin for a new one, or use “Forgotten your password?” below.", error: true } : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setMsg({ text: "Enter your email and password.", error: true }); return; }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    setPassword("");
    if (error) setMsg({ text: "Sign-in failed: " + error.message, error: true });
  }

  async function forgot() {
    if (!email.trim()) { setMsg({ text: "Enter your email first, then tap the reset link.", error: true }); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + import.meta.env.BASE_URL });
    setMsg(error
      ? { text: "Could not send reset email: " + error.message, error: true }
      : { text: "If that email has an account, a reset link is on its way. Open it on this device." });
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="auth-logo" />
        <h1>Coach Tools</h1>
        <p className="dim">Sign in with the account your club invited you to.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        {msg && <p className={msg.error ? "msg error" : "msg"} role="status">{msg.text}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="link-btn" onClick={forgot}>Forgotten your password?</button>
      </form>
    </div>
  );
}

/** Shown after an invite or password-reset link: set a password, then carry on. */
export function SetPassword() {
  const { clearRecovery } = useAuth();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg({ text: "Use at least 8 characters.", error: true }); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    setPw("");
    if (error) { setMsg({ text: "Could not save password: " + error.message, error: true }); return; }
    history.replaceState(null, "", location.pathname);
    clearRecovery();
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Set your password</h1>
        <p className="dim">Choose a password of at least 8 characters.</p>
        <label>New password<input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} /></label>
        {msg && <p className={msg.error ? "msg error" : "msg"} role="status">{msg.text}</p>}
        <button className="btn primary">Save password</button>
      </form>
    </div>
  );
}
