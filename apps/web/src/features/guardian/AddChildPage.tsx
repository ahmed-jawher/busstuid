import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { PRIVACY_POLICY_VERSION, type DirectorySchool } from '@wusool/shared';
import { Icon, type IconName } from '@/components/Icon';
import {
  BackBar,
  bigButton,
  Chip,
  ErrorLine,
  FieldLabel,
  IconBadge,
  inputClass,
  PersonBadge,
  PhoneInput,
  Screen,
  Segmented,
} from '@/components/ui/kit';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { orgName } from '@/lib/format';
import type { OrgSummary } from '@/lib/types';
import { platform } from '@/platform';
import { OrgList, useDirectory } from './GuardianPages';

/**
 * Schools published by the ministry (docs: packages/shared/src/schools.ts). Picking from the
 * list means every family writes the same school the same way; a school that is not listed yet
 * can still be typed.
 */
function SchoolField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const schools = useQuery({
    queryKey: ['schools', value],
    queryFn: () => api<DirectorySchool[]>(`/schools?country=BH&q=${encodeURIComponent(value)}`),
    enabled: open,
  });
  const label = (s: DirectorySchool) => (i18n.language === 'en' ? s.en : s.ar);
  const matches = (schools.data ?? []).filter((s) => label(s) !== value.trim());
  return (
    <FieldLabel label={t('guardian.schoolName')}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('gd.add.schoolPh')}
        autoComplete="off"
        className={inputClass}
      />
      {open && matches.length > 0 && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-[14px] border border-border bg-surface">
          {matches.map((s) => (
            <li key={s.ar}>
              <button
                type="button"
                onClick={() => {
                  onChange(label(s));
                  setOpen(false);
                }}
                className="flex min-h-12 w-full items-center px-3.5 py-2 text-start text-[15px]"
              >
                {label(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-muted">{t('gd.add.schoolHint')}</p>
    </FieldLabel>
  );
}

interface DriverMatch extends OrgSummary {
  driverNameAr: string;
  driverNameEn: string | null;
}

const RELATIONS = ['mother', 'father', 'guardian', 'other'] as const;

/**
 * Adding a child (Claude Design "Tammeni Guardian"): details, who drives them, a face photo, and
 * consent — one step per screen with the action pinned at the bottom (PLAN §5).
 */
export function AddChildPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    fullNameAr: '',
    fullNameEn: '',
    dateOfBirth: '',
    schoolName: '',
    relationship: 'mother' as (typeof RELATIONS)[number],
  });
  const [mode, setMode] = useState<'directory' | 'driver'>('directory');
  const [orgId, setOrgId] = useState('');
  const [orgQuery, setOrgQuery] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverMatch, setDriverMatch] = useState<DriverMatch | null>(null);
  const [driverConfirmed, setDriverConfirmed] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => {
    setForm({ ...form, [k]: v });
    setErr('');
  };

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const directory = useDirectory();

  // Phone numbers are not verified, so the guardian must see and confirm the driver's name (PLAN §5).
  const lookup = useMutation({
    mutationFn: () =>
      api<DriverMatch>(
        `/organizations/driver-lookup?country=BH&phone=${encodeURIComponent(driverPhone.replace(/\D/g, ''))}`,
      ),
    onSuccess: (m) => {
      setDriverMatch(m);
      setDriverConfirmed(false);
    },
    onError: () => setDriverMatch(null),
  });

  const targetOrg = mode === 'directory' ? orgId : driverConfirmed ? (driverMatch?.id ?? '') : '';
  const targetName =
    mode === 'directory'
      ? orgName(directory.data?.find((o) => o.id === orgId) ?? { nameAr: '' })
      : driverMatch
        ? orgName(driverMatch)
        : '';

  const submit = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.set('fullNameAr', form.fullNameAr);
      if (form.fullNameEn.trim()) body.set('fullNameEn', form.fullNameEn);
      body.set('dateOfBirth', form.dateOfBirth);
      body.set('schoolName', form.schoolName);
      body.set('relationship', form.relationship);
      body.set('organizationId', targetOrg);
      body.set('consent', consent ? 'true' : 'false');
      body.set('photo', photo!, 'photo.jpg');
      return api('/students', { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['children'] });
      setStep(5);
    },
  });
  const unverified = submit.error instanceof ApiError && submit.error.code === 'email_not_verified';

  const next = () => {
    if (step === 1 && (!form.fullNameAr.trim() || !form.dateOfBirth || !form.schoolName.trim()))
      return setErr(t('gd.add.err1'));
    if (step === 2 && !targetOrg)
      return setErr(mode === 'directory' ? t('gd.add.err2org') : t('gd.add.err2driver'));
    if (step === 3 && !photo) return setErr(t('gd.add.err3'));
    if (step === 4) {
      if (!consent) return setErr(t('gd.add.err4'));
      return submit.mutate();
    }
    setErr('');
    setStep(step + 1);
  };

  const labels = [t('gd.add.s1'), t('gd.add.s2'), t('gd.add.s3'), t('gd.add.s4')];
  const inFlow = step <= 4;

  return (
    <div className="flex min-h-dvh flex-col">
      <Screen className="gap-4">
        <BackBar
          onBack={() => (step > 1 && step < 5 ? setStep(step - 1) : navigate(-1))}
          title={t('guardian.addChild')}
          end={
            inFlow && (
              <span className="text-[13px] text-muted">{t('gd.add.stepOf', { n: step })}</span>
            )
          }
        />
        {inFlow && (
          <ol className="flex gap-1.5" aria-label={t('gd.add.stepOf', { n: step })}>
            {labels.map((l, i) => (
              <li
                key={l}
                className="flex flex-1 flex-col gap-1.5"
                aria-current={i + 1 === step ? 'step' : undefined}
              >
                <span className={cn('h-1 rounded-sm', i < step ? 'bg-primary' : 'bg-border')} />
                <span
                  className={cn(
                    'text-[11.5px] font-semibold',
                    i + 1 === step ? 'text-foreground' : 'text-muted',
                  )}
                >
                  {l}
                </span>
              </li>
            ))}
          </ol>
        )}

        {step === 1 && (
          <>
            <h2 className="text-[21px] font-bold">{t('guardian.stepDetails')}</h2>
            <FieldLabel label={t('gd.add.nameAr')}>
              <input
                value={form.fullNameAr}
                onChange={(e) => set('fullNameAr')(e.target.value)}
                placeholder={t('gd.add.nameArPh')}
                className={inputClass}
              />
            </FieldLabel>
            <FieldLabel
              label={
                <>
                  {t('gd.add.nameEn')}{' '}
                  <span className="text-[12.5px] font-normal text-muted">
                    {t('gd.add.optional')}
                  </span>
                </>
              }
            >
              <input
                dir="ltr"
                value={form.fullNameEn}
                onChange={(e) => set('fullNameEn')(e.target.value)}
                placeholder="Yousif Ahmed"
                className={cn(inputClass, 'text-end')}
              />
            </FieldLabel>
            <FieldLabel label={t('guardian.dateOfBirth')}>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth')(e.target.value)}
                className={inputClass}
              />
            </FieldLabel>
            <SchoolField value={form.schoolName} onChange={set('schoolName')} />
            <fieldset className="flex flex-col gap-2 text-sm font-semibold">
              <legend className="mb-2">{t('guardian.relationship')}</legend>
              <div className="flex flex-wrap gap-2">
                {RELATIONS.map((r) => (
                  <Chip key={r} on={form.relationship === r} onClick={() => set('relationship')(r)}>
                    {t(`guardian.relation.${r}`)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-[21px] font-bold">{t('gd.add.whoDrives')}</h2>
            <Segmented
              label={t('guardian.stepTransport')}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setErr('');
              }}
              options={[
                { value: 'directory', label: t('guardian.transport.directory') },
                { value: 'driver', label: t('orgType.independent_driver') },
              ]}
            />
            {mode === 'directory' ? (
              <>
                <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 has-focus-visible:outline-2 has-focus-visible:outline-primary">
                  <Icon name="search" className="text-muted" />
                  <input
                    type="search"
                    value={orgQuery}
                    onChange={(e) => setOrgQuery(e.target.value)}
                    placeholder={t('gd.add.searchOrg')}
                    aria-label={t('gd.add.searchOrg')}
                    className="min-h-11.5 flex-1 bg-transparent text-[15px] outline-0 placeholder:text-muted"
                  />
                </label>
                <OrgList
                  orgs={directory.data ?? []}
                  selected={orgId}
                  query={orgQuery}
                  onPick={(id) => {
                    setOrgId(id);
                    setErr('');
                  }}
                />
              </>
            ) : (
              <>
                <FieldLabel label={t('guardian.driverPhone')}>
                  <PhoneInput
                    value={driverPhone}
                    placeholder="3300 1122"
                    onChange={(v) => {
                      setDriverPhone(v);
                      setDriverMatch(null);
                      setDriverConfirmed(false);
                    }}
                  />
                </FieldLabel>
                <button
                  type="button"
                  disabled={driverPhone.replace(/\D/g, '').length !== 8 || lookup.isPending}
                  onClick={() => lookup.mutate()}
                  className="min-h-12 rounded-xl border border-primary text-[15px] font-semibold text-primary disabled:opacity-60"
                >
                  {t('guardian.findDriver')}
                </button>
                {lookup.error && <ErrorLine>{errorMessage(lookup.error)}</ErrorLine>}
                {driverMatch && (
                  <div
                    className={cn(
                      'flex flex-col gap-3 rounded-2xl bg-surface p-4',
                      driverConfirmed ? 'border-2 border-status-alighted' : 'border border-border',
                    )}
                  >
                    <div className="text-[13px] text-muted">{t('gd.add.isThisDriver')}</div>
                    <div className="flex items-center gap-3">
                      <PersonBadge name={driverMatch.driverNameAr} />
                      <div>
                        <div className="text-base font-bold">
                          {i18n.language === 'en' && driverMatch.driverNameEn
                            ? driverMatch.driverNameEn
                            : driverMatch.driverNameAr}
                        </div>
                        <div className="text-[13px] text-muted">
                          {t('orgType.independent_driver')} · {orgName(driverMatch)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={driverConfirmed}
                      onClick={() => {
                        setDriverConfirmed(!driverConfirmed);
                        setErr('');
                      }}
                      className={cn(
                        'min-h-11.5 rounded-xl text-[15px] font-bold',
                        driverConfirmed
                          ? 'bg-ok-soft text-status-alighted'
                          : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {driverConfirmed ? `✓ ${t('gd.add.confirmed')}` : t('guardian.confirmDriver')}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-[21px] font-bold">{t('gd.add.photoTitle')}</h2>
            <p className="text-sm leading-relaxed text-muted">{t('gd.add.photoWhy')}</p>
            <div
              className={cn(
                'relative flex size-47.5 items-center justify-center self-center overflow-hidden rounded-full bg-surface',
                photo
                  ? 'border-[3px] border-status-alighted'
                  : 'border-2 border-dashed border-border',
              )}
            >
              {preview ? (
                <img src={preview} alt="" className="size-full object-cover" />
              ) : (
                <span className="px-6 text-center text-xs whitespace-pre-line text-muted">
                  {t('gd.add.photoPlaceholder')}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {(['tip1', 'tip2', 'tip3'] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <Icon name="check" size={20} className="text-status-alighted" />
                  {t(`gd.add.${k}`)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={async () => {
                const picked = await platform.camera.pickPhoto();
                if (picked) {
                  setPhoto(picked);
                  setErr('');
                }
              }}
              className="flex min-h-12.5 items-center justify-center gap-2 rounded-xl border border-primary text-[15px] font-semibold text-primary"
            >
              <Icon name="photo_camera" />
              {photo ? t('guardian.changePhoto') : t('guardian.takePhoto')}
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-[21px] font-bold">{t('gd.add.privacyTitle')}</h2>
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
              {(
                [
                  ['badge', 'p1'],
                  ['location_on', 'p2'],
                  ['delete', 'p3'],
                ] as [IconName, string][]
              ).map(([icon, k]) => (
                <div key={k} className="flex gap-2.5">
                  <Icon name={icon} className="text-primary" />
                  <span>{t(`gd.add.${k}`)}</span>
                </div>
              ))}
              <div className="text-xs text-muted">
                {t('guardian.policyVersion', { version: PRIVACY_POLICY_VERSION })}
              </div>
            </div>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-[14px] bg-surface p-3.5 has-focus-visible:outline-2 has-focus-visible:outline-primary',
                consent ? 'border-2 border-primary' : 'border border-border',
              )}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  setErr('');
                }}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-6.5 shrink-0 items-center justify-center rounded-lg text-white',
                  consent ? 'bg-primary' : 'border-2 border-muted',
                )}
              >
                {consent && <Icon name="check" size={20} />}
              </span>
              <span className="text-[15px] font-semibold">{t('guardian.consent')}</span>
            </label>
            {unverified && (
              <p className="text-sm font-semibold text-warning">
                {t('errors.email_not_verified')}{' '}
                <Link to="/verify-email" className="underline">
                  {t('auth.verifyEmail')}
                </Link>
              </p>
            )}
            {submit.error && !unverified && <ErrorLine>{errorMessage(submit.error)}</ErrorLine>}
          </>
        )}

        {step === 5 && (
          <div className="flex flex-col items-center gap-3.5 pt-10 text-center">
            <IconBadge icon="send" size={88} round />
            <h2 className="mt-1.5 text-2xl font-bold">{t('gd.add.sentTitle')}</h2>
            <p className="text-[15.5px] leading-relaxed text-muted">
              {t('gd.add.sentBody', { org: targetName, name: form.fullNameAr.trim() })}
            </p>
            <button
              type="button"
              onClick={() => navigate('/guardian', { replace: true })}
              className={cn(
                bigButton,
                'mt-2.5 min-h-13.5 rounded-[14px] bg-primary text-base text-primary-foreground',
              )}
            >
              {t('gd.backHome')}
            </button>
          </div>
        )}

        {err && <ErrorLine>{err}</ErrorLine>}
      </Screen>
      {inFlow && (
        <div
          data-tabbar="footer"
          className="sticky bottom-0 border-t border-border bg-background px-4.5 pt-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            disabled={submit.isPending}
            onClick={next}
            className={cn(
              bigButton,
              'mx-auto max-w-lg min-h-13.5 rounded-[14px] bg-primary text-base text-primary-foreground',
            )}
          >
            {step === 4 ? t('guardian.submitChild') : t('common.continue')}
          </button>
        </div>
      )}
    </div>
  );
}
