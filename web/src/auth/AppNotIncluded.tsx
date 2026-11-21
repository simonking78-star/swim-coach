import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { SESSION_PLANNER, SESSION_PLANNER_URL } from "../lib/apps";

/** Signed in, but this person has no club with the Coach Tools app (feature gate, claude/specs/feature-gate.md).
 *  If they have the Session Planner, send them there. If the check itself failed, say so (fail closed). */
export function AppNotIncluded() {
  const { features, featuresError, signOut } = useAuth();
  const qc = useQueryClient();
  const planner = (features ?? []).some(f => f.feature === SESSION_PLANNER || f.all_features);

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="auth-logo" />
        {featuresError ? (
          <>
            <h1>Couldn't check your access</h1>
            <p className="dim">Coach Tools couldn't confirm which apps your account can use. Check your connection and try again.</p>
            <p className="msg error small" role="status">{featuresError}</p>
            <button className="btn primary" onClick={() => qc.invalidateQueries({ queryKey: ["my_features"] })}>Try again</button>
          </>
        ) : planner ? (
          <>
            <h1>Your account is for the Session Planner</h1>
            <p className="dim">Your club has set your account up for the Session Planner app. Sign in there with the same email and password.</p>
            <a className="btn primary" href={SESSION_PLANNER_URL}>Open the Session Planner</a>
          </>
        ) : (
          <>
            <h1>Coach Tools isn't switched on for you</h1>
            <p className="dim">Your account doesn't include the Coach Tools app yet. If you think it should, ask your club admin.</p>
          </>
        )}
        <button type="button" className="link-btn" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}

