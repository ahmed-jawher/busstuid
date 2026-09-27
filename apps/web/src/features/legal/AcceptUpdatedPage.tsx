import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { LEGAL_VERSION } from '@wusool/shared';
import { bigButton, ErrorLine, IconBadge, Screen } from '@/components/ui/kit';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/lib/session';

/**
 * The documents changed in a way that matters, so the account agrees again before doing anything
 * else — which is what clause 9 of the terms says happens, and therefore what must happen. The
 * new agreement is recorded as evidence like the first one (PLAN §14).
 */
export function AcceptUpdatedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, refresh, signOut } = useSession();
  const [accepted, setAccepted] = useState(false);
  const accept = useMutation({
    mutationFn: () =>
      api('/me/legal/accept', {
        method: 'POST',
        body: { documents: ['terms', 'privacy'], version: LEGAL_VERSION },
      }),
    onSuccess: async () => {
      await refresh();
      navigate('/', { replace: true });
    },
  });
  return (
    <Screen className="gap-4">
      <IconBadge icon="fact_check" />
      <h1 className="text-[27px] font-bold">{t('legal.updatedTitle')}</h1>
      <p className="text-[15.5px] leading-relaxed text-muted">{t('legal.updatedBody')}</p>
      <div className="flex flex-col gap-2 rounded-[18px] border border-border bg-surface p-4 text-[15px] font-semibold text-primary">
        <Link to="/terms">{t('legal.terms')}</Link>
        <Link to="/privacy">{t('legal.privacy')}</Link>
        <span className="text-[12.5px] font-normal text-muted">
          {t('legal.updated')}: {LEGAL_VERSION}
        </span>
      </div>
      <label className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-3.5 text-[13.5px] leading-relaxed">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span>{t('legal.acceptUpdated')}</span>
      </label>
      {accept.error && <ErrorLine>{errorMessage(accept.error)}</ErrorLine>}
      <div className="flex-1" />
      <button
        type="button"
        disabled={!accepted || accept.isPending}
        onClick={() => accept.mutate()}
        className={cn(bigButton, 'bg-primary text-primary-foreground disabled:opacity-50')}
      >
        {t('legal.acceptContinue')}
      </button>
      {/* Nobody is trapped: refusing signs you out, and the account and its data stay. */}
      <button
        type="button"
        onClick={() => void signOut().then(() => navigate('/welcome', { replace: true }))}
        className="min-h-11 text-[15px] font-semibold text-muted"
      >
        {t('legal.acceptLater', { name: me?.fullNameAr.trim().split(/\s+/)[0] ?? '' })}
      </button>
    </Screen>
  );
}
