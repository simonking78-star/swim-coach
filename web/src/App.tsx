import { Navigate, Route, Routes } from "react-router-dom";
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
