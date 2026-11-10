import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import * as api from "../api";
import type { User } from "../types";

type AuthState = {
  /** undefined while the first /auth/me check is in flight, null when signed out. */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.setUnauthorizedHandler(() => setUser(null));
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser(null)); // 401 (signed out) or backend unreachable: treat as signed out
  }, []);

  const login = useCallback(async (email: string, password: string) => setUser(await api.login(email, password)), []);
  const register = useCallback(
    async (name: string, email: string, password: string) => setUser(await api.register(name, email, password)),
    [],
  );
  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, login, register, logout, setUser }), [user, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
