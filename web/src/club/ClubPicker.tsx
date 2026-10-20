import { useId } from "react";
import { useClub } from "./ClubProvider";

/**
 * Club chooser shown beside whatever it controls (not in the top bar), so it is
 * clear which figures the club choice changes. One club → just its name.
 */
export function ClubPicker({ label = "Club", hideLabel = false }: { label?: string; hideLabel?: boolean }) {
  const { clubs, club, setClub } = useClub();
  const id = useId();
  if (clubs.length === 0) return null;

  return (
    <div className="club-picker">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "club-picker-label"}>{label}</label>
      {clubs.length < 2
        ? <strong id={id} className="club-picker-name">{club}</strong>
        : (
          <select id={id} value={club ?? ""} onChange={e => setClub(e.target.value)}>
            {clubs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
    </div>
  );
}
