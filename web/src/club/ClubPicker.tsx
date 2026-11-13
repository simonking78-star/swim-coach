import { useId } from "react";
import { useClub } from "./ClubProvider";

/**
 * Club chooser. On phones it sits beside whatever it controls, so it is clear which figures
 * the club choice changes. On a desktop (A-118) the copy in the top bar is the one shown and the
 * in-page copies are hidden by CSS; both drive the same club. One club → just its name.
 */
export function ClubPicker({ label = "Club", hideLabel = false, variant = "page" }: { label?: string; hideLabel?: boolean; variant?: "page" | "topbar" }) {
  const { clubs, coachingClubs, club, setClub } = useClub();
  const other = clubs.filter(c => !coachingClubs.includes(c));
  const coaching = clubs.filter(c => coachingClubs.includes(c));
  const id = useId();
  if (clubs.length === 0) return null;

  return (
    <div className={"club-picker " + (variant === "topbar" ? "in-topbar" : "in-page")}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "club-picker-label"}>{label}</label>
      {clubs.length < 2
        ? <strong id={id} className="club-picker-name">{club}</strong>
        : (
          <select id={id} value={club ?? ""} onChange={e => setClub(e.target.value)}>
            {other.length && coaching.length
              ? <>
                  <optgroup label="Coaching clubs">{coaching.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                  <optgroup label="Other clubs (results on file)">{other.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                </>
              : clubs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
    </div>
  );
}
