import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@wusool/shared';
import { api, session } from './api';
import type { Me, OrgSummary } from './types';

interface SessionValue {
  /** null while restoring the session on start-up. */
  signedIn: boolean | null;
  me: Me | undefined;
  loading: boolean;
  orgsWith(...roles: Role[]): OrgSummary[];
  refresh(): Promise<unknown>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(session.signedIn ? true : null);
  const qc = useQueryClient();

  useEffect(() => {
    const off = session.onChange((v) => setSignedIn(v));
    if (!session.signedIn) void session.restore().then((ok) => setSignedIn(ok));
    return () => {
      off();
    };
  }, []);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: signedIn === true,
    staleTime: 60_000,
  });

  const value = useMemo<SessionValue>(
    () => ({
      signedIn,
      me: signedIn ? me.data : undefined,
      loading: signedIn === null || (signedIn === true && me.isLoading),
      orgsWith: (...roles) => {
        const seen = new Map<string, OrgSummary>();
        for (const m of me.data?.memberships ?? []) {
          if (roles.includes(m.role)) seen.set(m.organization.id, m.organization);
        }
        return [...seen.values()];
      },
      refresh: () => me.refetch(),
      signOut: async () => {
        await session.clear();
        qc.clear();
      },
    }),
    [signedIn, me, qc],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
