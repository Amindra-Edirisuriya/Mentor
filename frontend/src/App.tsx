import { Link, Route, Routes } from "react-router-dom";

import { PublicOnly, RequireAuth } from "./auth/guards";
import { AccountPage } from "./pages/AccountPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordPages";
import { RegisterPage } from "./pages/RegisterPage";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-indigo">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      {/* Not PublicOnly: a signed-in user may still follow a reset link. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/app" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
