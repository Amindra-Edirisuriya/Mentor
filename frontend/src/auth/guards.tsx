import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Spinner } from "../components/ui";
import { useAuth } from "./AuthContext";

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-brand-indigo" aria-busy="true" aria-label="Loading">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/** Only for signed-in users; others go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <FullPageSpinner />;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Sign-in / sign-up pages: signed-in users are sent straight to the app. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user === undefined) return <FullPageSpinner />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
