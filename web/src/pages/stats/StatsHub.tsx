import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { LEVEL_NOTE, sectionLevel } from "../../lib/access";

// Statistics landing: the three tools. Monthly Squad Review is squad totals,
// so it needs Statistics and Feedback read for squads (not parents/swimmers).

export function StatsBack() {
  return <p className="crumb"><Link to="/statistics">‹ Statistics</Link></p>;
}

export function StatsHub() {
  const { access } = useAuth();
  const st = sectionLevel(access, "stats"), fb = sectionLevel(access, "feedback");
  const squadReview = !(st === "N" || st === "CR" || fb === "N" || fb === "CR");
  if (st === "N") return <><div className="page-head"><h1>Statistics</h1></div><p className="notice warn">Your role doesn't have access to statistics.</p></>;
  const tiles = [
    { to: "regression", icon: "📈", title: "Regression Analysis", sub: "Swimmer & event trend vs county qualifying times" },
    { to: "tests", icon: "🎯", title: "Test results", sub: "Test & Assess scores over time, each test session, and positions for the head coach" },
    { to: "compare", icon: "⚖️", title: "Swimmer Comparison", sub: "A swimmer vs another swimmer, their birth-year average or a squad average" },
    ...(squadReview ? [{ to: "squad-review", icon: "📅", title: "Monthly Squad Review", sub: "Attendance, race times, skills & feedback by squad, month on month" }] : [])
  ];
  return (
    <>
      <div className="page-head"><h1><span aria-hidden="true">📊</span> Statistics</h1><p className="dim">Trends, comparisons and squad reviews</p></div>
      {LEVEL_NOTE[st] && <p className="notice">{LEVEL_NOTE[st]}</p>}
      <div className="tile-grid">
        {tiles.map(t => (
          <Link key={t.to} to={t.to} className="tile">
            <span className="tile-icon" aria-hidden="true">{t.icon}</span>
            <span className="tile-text"><strong>{t.title}</strong><span className="dim">{t.sub}</span></span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function SquadReviewGate({ children }: { children: React.ReactNode }) {
  const { access } = useAuth();
  const st = sectionLevel(access, "stats"), fb = sectionLevel(access, "feedback");
  if (st === "N" || st === "CR" || fb === "N" || fb === "CR") return <><StatsBack /><p className="notice warn">Squad reviews aren't available for your role.</p></>;
  return <>{children}</>;
}
