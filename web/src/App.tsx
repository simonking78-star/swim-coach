import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SetPassword, SignIn } from "./auth/SignIn";
import { ClubProvider } from "./club/ClubProvider";
import { Layout } from "./components/Layout";
import { Attendance } from "./pages/Attendance";
import { Drills } from "./pages/Drills";
import { Feedback } from "./pages/Feedback";
import { Home } from "./pages/Home";
import { SectionPage } from "./pages/SectionPage";
import { Settings } from "./pages/Settings";
import { Stopwatch } from "./pages/Stopwatch";
import { SwimmerProfile } from "./pages/SwimmerProfile";
import { Swimmers } from "./pages/Swimmers";
import { SquadReviewGate, StatsHub } from "./pages/stats/StatsHub";
import { PlanList } from "./pages/plans/PlanList";
import { PlanView } from "./pages/plans/PlanView";
import { PlanEditor } from "./pages/plans/PlanEditor";

// Statistics screens carry Chart.js, so they load only when opened.
const Regression = lazy(() => import("./pages/stats/Regression"));
const Compare = lazy(() => import("./pages/stats/Compare"));
const SquadReview = lazy(() => import("./pages/stats/SquadReview"));
const wait = (el: React.ReactNode) => <Suspense fallback={<p className="dim">Loading…</p>}>{el}</Suspense>;

function Gate() {
  const { ready, session, recovery, accessLoading } = useAuth();
  if (!ready) return <div className="loading">Loading…</div>;
  if (session && recovery) return <SetPassword />;
  if (!session) return <SignIn />;
  if (accessLoading) return <div className="loading">Loading your access…</div>;
  return (
    <ClubProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="settings" element={<Settings />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="stopwatch" element={<Stopwatch />} />
          <Route path="swimmers" element={<Swimmers />} />
          <Route path="swimmers/:id" element={<SwimmerProfile />} />
          <Route path="sessions" element={<PlanList />} />
          <Route path="sessions/new" element={<PlanEditor key="new" />} />
          <Route path="sessions/:id" element={<PlanView />} />
          <Route path="sessions/:id/edit" element={<PlanEditor />} />
          <Route path="drills" element={<Drills />} />
          <Route path="statistics" element={<StatsHub />} />
          <Route path="statistics/regression" element={wait(<Regression />)} />
          <Route path="statistics/compare" element={wait(<Compare />)} />
          <Route path="statistics/squad-review" element={<SquadReviewGate>{wait(<SquadReview />)}</SquadReviewGate>} />
          <Route path=":key" element={<SectionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ClubProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
