import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/layout';
import { useSession } from '@/lib/session';

/** Where an account that has not agreed to the current documents is sent. */
export const ACCEPT_PATH = '/legal/accept';

/** Signed-in, verified accounts only (PLAN §5.1: nothing happens before email verification). */
export function RequireAuth() {
  const { t } = useTranslation();
  const { signedIn, me, loading } = useSession();
  const location = useLocation();
  if (loading) return <Spinner label={t('common.loading')} />;
  if (!signedIn)
    return (
      <Navigate
        to={
          location.pathname === '/'
            ? '/welcome'
            : `/login?next=${encodeURIComponent(location.pathname)}`
        }
        replace
      />
    );
  if (me && !me.emailVerified)
    return <Navigate to={`/verify-email?email=${encodeURIComponent(me.email)}`} replace />;
  // Clause 9 of the terms: after a material change, the person agrees again before carrying on.
  // The screen that asks is of course exempt, or it would send itself in a circle.
  if (me?.mustAcceptTerms && location.pathname !== ACCEPT_PATH)
    return <Navigate to={ACCEPT_PATH} replace />;
  return <Outlet />;
}
