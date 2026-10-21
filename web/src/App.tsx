import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SetPassword, SignIn } from "./auth/SignIn";
import { ClubProvider } from "./club/ClubProvider";
import { Layout } from "./components/Layout";
import { Attendance } from "./pages/Attendance";
import { Feedback } from "./pages/Feedback";
import { Home } from "./pages/Home";
import { SectionPage } from "./pages/SectionPage";
import { Settings } from "./pages/Settings";
import { Stopwatch } from "./pages/Stopwatch";
import { SwimmerProfile } from "./pages/SwimmerProfile";
import { Swimmers } from "./pages/Swimmers";
import { SquadReviewGate, StatsHub } from "./pages/stats/StatsHub";

// Statistics screens carry Chart.js, so they load only when opened.
const Regression = lazy(() => import("./pages/stats/Regression"));
const Compare = lazy(() => import("./pages/stats/Compare"));
const SquadReview = lazy(() => import("./pages/stats/SquadReview"));
const TestResults = lazy(() => import("./pages/stats/TestResults"));
// Less-used sections load when first opened, keeping the first download small.
const Drills = lazy(() => import("./pages/Drills").then(x => ({ default: x.Drills })));
const Competitions = lazy(() => import("./pages/Competitions").then(x => ({ default: x.Competitions })));
const Timetables = lazy(() => import("./pages/timetables/Timetables").then(x => ({ default: x.Timetables })));
const TimetableForm = lazy(() => import("./pages/timetables/TimetableForm").then(x => ({ default: x.TimetableForm })));
const Season = lazy(() => import("./pages/season/Season").then(x => ({ default: x.Season })));
const Planning = lazy(() => import("./pages/season/Planning").then(x => ({ default: x.Planning })));
const CompForm = lazy(() => import("./pages/season/CompForm").then(x => ({ default: x.CompForm })));
const MacroForm = lazy(() => import("./pages/season/MacroForm").then(x => ({ default: x.MacroForm })));
const Micros = lazy(() => import("./pages/season/Micros").then(x => ({ default: x.Micros })));
const PlanList = lazy(() => import("./pages/plans/PlanList").then(x => ({ default: x.PlanList })));
const PlanView = lazy(() => import("./pages/plans/PlanView").then(x => ({ default: x.PlanView })));
const PlanEditor = lazy(() => import("./pages/plans/PlanEditor").then(x => ({ default: x.PlanEditor })));
const TestsHub = lazy(() => import("./pages/tests/Tests").then(x => ({ default: x.TestsHub })));
const TemplatePick = lazy(() => import("./pages/tests/Tests").then(x => ({ default: x.TemplatePick })));
const TemplateEditor = lazy(() => import("./pages/tests/TemplateEditor").then(x => ({ default: x.TemplateEditor })));
const StartTest = lazy(() => import("./pages/tests/StartTest").then(x => ({ default: x.StartTest })));
const RunTest = lazy(() => import("./pages/tests/RunTest").then(x => ({ default: x.RunTest })));
const Users = lazy(() => import("./pages/admin/Users").then(x => ({ default: x.Users })));
const AppDev = lazy(() => import("./pages/AppDev").then(x => ({ default: x.AppDev })));
const Admin = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.Admin })));
const ManageSquads = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.ManageSquads })));
const AddMember = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.AddMember })));
const MoveSquad = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.MoveSquad })));
const MoveClub = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.MoveClub })));
const Deactivate = lazy(() => import("./pages/admin/Admin").then(x => ({ default: x.Deactivate })));
const wait = (el: React.ReactNode) => <Suspense fallback={<p className="dim">Loading…</p>}>{el}</Suspense>;

/** Old /v2/... links (the preview address) open the same screen at the root. Netlify redirects them too,
 *  but once the app's service worker is installed it answers those links itself. */
function FromV2() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={(pathname.replace(/^\/v2/, "") || "/") + search + hash} replace />;
}

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
          <Route path="sessions" element={wait(<PlanList />)} />
          <Route path="sessions/new" element={wait(<PlanEditor key="new" />)} />
          <Route path="sessions/:id" element={wait(<PlanView />)} />
          <Route path="sessions/:id/edit" element={wait(<PlanEditor />)} />
          <Route path="drills" element={wait(<Drills />)} />
          <Route path="timetables" element={wait(<Timetables />)} />
          <Route path="timetables/new" element={wait(<TimetableForm key="new" />)} />
          <Route path="timetables/:id/edit" element={wait(<TimetableForm />)} />
          <Route path="competitions" element={wait(<Competitions />)} />
          <Route path="season" element={wait(<Season />)} />
          <Route path="season/plan" element={wait(<Planning />)} />
          <Route path="season/competition/new" element={wait(<CompForm key="new" />)} />
          <Route path="season/competition/:id" element={wait(<CompForm />)} />
          <Route path="season/macro/new" element={wait(<MacroForm key="new" />)} />
          <Route path="season/macro/:id" element={wait(<MacroForm />)} />
          <Route path="season/macro/:id/weeks" element={wait(<Micros />)} />
          <Route path="admin" element={wait(<Admin />)} />
          <Route path="admin/squads" element={wait(<ManageSquads />)} />
          <Route path="admin/add-member" element={wait(<AddMember />)} />
          <Route path="admin/move-squad" element={wait(<MoveSquad />)} />
          <Route path="admin/move-club" element={wait(<MoveClub />)} />
          <Route path="admin/deactivate" element={wait(<Deactivate />)} />
          <Route path="admin/users" element={wait(<Users />)} />
          <Route path="appdev" element={wait(<AppDev />)} />
          <Route path="tests" element={wait(<TestsHub />)} />
          <Route path="tests/create" element={wait(<TemplateEditor key="new" />)} />
          <Route path="tests/select" element={wait(<TemplatePick key="select" mode="select" />)} />
          <Route path="tests/edit" element={wait(<TemplatePick key="edit" mode="edit" />)} />
          <Route path="tests/templates/:id" element={wait(<TemplateEditor />)} />
          <Route path="tests/start/:id" element={wait(<StartTest />)} />
          <Route path="tests/run/:id" element={wait(<RunTest />)} />
          <Route path="statistics" element={<StatsHub />} />
          <Route path="statistics/tests" element={wait(<TestResults />)} />
          <Route path="statistics/regression" element={wait(<Regression />)} />
          <Route path="statistics/compare" element={wait(<Compare />)} />
          <Route path="statistics/squad-review" element={<SquadReviewGate>{wait(<SquadReview />)}</SquadReviewGate>} />
          <Route path="v2/*" element={<FromV2 />} />
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
