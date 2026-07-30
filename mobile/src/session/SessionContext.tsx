import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { userApi } from '../api/user';
import type { CurrentUser } from '../types/user';

type SessionValue = {
  user: CurrentUser | null;
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const refresh = useCallback(async () => {
    try { setUser(await userApi.me()); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await userApi.clearLocalToken();
        setUser(null);
      } else throw error;
    }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { void refresh().catch(() => setChecking(false)); }, [refresh]);
  const login = useCallback(async (username: string, password: string) => {
    const data = await userApi.login(username, password);
    await userApi.persistToken(data.access_token);
    setUser(data.user);
  }, []);
  const logout = useCallback(async () => { await userApi.logout().catch(() => null); setUser(null); }, []);
  const value = useMemo(() => ({ user, checking, login, logout, refresh }), [user, checking, login, logout, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
