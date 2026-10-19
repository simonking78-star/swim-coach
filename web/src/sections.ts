import type { Section } from "./lib/access";

export interface NavSection {
  key: string;            // route segment under /v2
  label: string;
  icon: string;
  blurb: string;
  section: Section;       // which row of the access matrix governs it
  /** navActions key in the current app, for sections not yet rebuilt in React */
  legacyGo: string;
  /** true once the section is rebuilt in React (changes phase by phase) */
  migrated: boolean;
}

// Order matches the current app's menu.
export const SECTIONS: NavSection[] = [
  { key: "attendance",   label: "Attendance",       icon: "✅", blurb: "Mark a session register",              section: "attendance", legacyGo: "attendance",   migrated: true  },
  { key: "feedback",     label: "Feedback",         icon: "💬", blurb: "Swimmer and squad feedback",           section: "feedback",   legacyGo: "feedback",     migrated: true  },
  { key: "season",       label: "Season planner",   icon: "🗓️", blurb: "Seasons, macro and micro cycles",       section: "season",     legacyGo: "season",       migrated: true  },
  { key: "timetables",   label: "Timetables",       icon: "🕒", blurb: "Weekly sessions per squad",            section: "timetables", legacyGo: "timetables",   migrated: true  },
  { key: "competitions", label: "Competitions",     icon: "🏆", blurb: "Licensed meets and files",             section: "timetables", legacyGo: "competitions", migrated: true  },
  { key: "sessions",     label: "Session plans",    icon: "📋", blurb: "Plan and archive sessions",            section: "plans",      legacyGo: "session",      migrated: true  },
  { key: "drills",       label: "Drills & Skills",  icon: "🧩", blurb: "Drills library",                       section: "plans",      legacyGo: "drills",       migrated: true  },
  { key: "statistics",   label: "Statistics",       icon: "📈", blurb: "Comparison, regression, squad review", section: "stats",      legacyGo: "mi",           migrated: true  },
  { key: "swimmers",     label: "Swimmers",         icon: "🏊", blurb: "Roster and swimmer profiles",          section: "roster",     legacyGo: "swimmer",      migrated: true  },
  { key: "stopwatch",    label: "Stopwatch",        icon: "⏱️", blurb: "Time reps and post to profiles",        section: "stopwatch",  legacyGo: "stopwatch",    migrated: true  },
  { key: "admin",        label: "Admin",            icon: "⚙️", blurb: "Squads, members and users",            section: "admin",      legacyGo: "admin",        migrated: true  },
  { key: "appdev",       label: "App dev",          icon: "🛠️", blurb: "Development actions and milestones",   section: "appdev",     legacyGo: "appdev",       migrated: true  }
];

/** Link into the current app at the site root, opening the given section. */
export const legacyUrl = (go: string) => `/?go=${encodeURIComponent(go)}`;
