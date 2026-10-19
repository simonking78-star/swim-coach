import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SetPassword, SignIn } from "./auth/SignIn";
import { ClubProvider } from "./club/ClubProvider";
import { Layout } from "./components/Layout";
import { Attendance } from "./pages/Attendance";
import { Drills } from "./pages/Drills";
import { Competitions } from "./pages/Competitions";
import { Timetables } from "./pages/timetables/Timetables";
import { TimetableForm } from "./pages/timetables/TimetableForm";
import { Season } from "./pages/season/Season";
import { Planning } from "./pages/season/Planning";
import { CompForm } from "./pages/season/CompForm";
import { MacroForm } from "./pages/season/MacroForm";
import { Micros } from "./pages/season/Micros";
import { AddMember, Admin, Deactivate, ManageSquads, MoveClub, MoveSquad } from "./pages/admin/Admin";
import { Users } from "./pages/admin/Users";
import { AppDev } from "./pages/AppDev";
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
          <Route path="timetables" element={<Timetables />} />
          <Route path="timetables/new" element={<TimetableForm key="new" />} />
          <Route path="timetables/:id/edit" element={<TimetableForm />} />
          <Route path="competitions" element={<Competitions />} />
          <Route path="season" element={<Season />} />
          <Route path="season/plan" element={<Planning />} />
          <Route path="season/competition/new" element={<CompForm key="new" />} />
          <Route path="season/competition/:id" element={<CompForm />} />
          <Route path="season/macro/new" element={<MacroForm key="new" />} />
          <Route path="season/macro/:id" element={<MacroForm />} />
          <Route path="season/macro/:id/weeks" element={<Micros />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/squads" element={<ManageSquads />} />
          <Route path="admin/add-member" element={<AddMember />} />
          <Route path="admin/move-squad" element={<MoveSquad />} />
          <Route path="admin/move-club" element={<MoveClub />} />
          <Route path="admin/deactivate" element={<Deactivate />} />
          <Route path="admin/users" element={<Users />} />
          <Route path="appdev" element={<AppDev />} />
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
