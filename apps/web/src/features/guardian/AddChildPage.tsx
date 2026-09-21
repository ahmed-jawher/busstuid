import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { COUNTRIES, PRIVACY_POLICY_VERSION, type Country } from '@wusool/shared';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { Card, Notice, PageHeader } from '@/components/ui/layout';
import { api, ApiError } from '@/lib/api';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { orgName } from '@/lib/format';
import type { OrgSummary } from '@/lib/types';
import { platform } from '@/platform';

interface DriverMatch extends OrgSummary {
  driverNameAr: string;
  driverNameEn: string | null;
}

export function AddChildPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullNameAr: '',
    fullNameEn: '',
    dateOfBirth: '',
    schoolName: '',
    relationship: 'mother',
  });
  const [country, setCountry] = useState<Country>('BH');
  const [mode, setMode] = useState<'directory' | 'driver'>('directory');
  const [orgId, setOrgId] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverMatch, setDriverMatch] = useState<DriverMatch | null>(null);
  const [driverConfirmed, setDriverConfirmed] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const directory = useQuery({
    queryKey: ['directory', country],
    queryFn: () => api<OrgSummary[]>(`/organizations/directory?country=${country}`),
    enabled: mode === 'directory',
  });

  // Phone numbers are not verified, so the guardian must see and confirm the driver's name (PLAN §5).
  const lookup = useMutation({
    mutationFn: () =>
      api<DriverMatch>(
        `/organizations/driver-lookup?country=${country}&phone=${encodeURIComponent(driverPhone)}`,
      ),
    onSuccess: (m) => {
      setDriverMatch(m);
      setDriverConfirmed(false);
    },
    onError: () => setDriverMatch(null),
  });

  const targetOrg = mode === 'directory' ? orgId : driverConfirmed ? (driverMatch?.id ?? '') : '';
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
      navigate('/guardian');
    },
  });
  const fe = fieldErrors(submit.error);
  const ready =
    form.fullNameAr && form.dateOfBirth && form.schoolName && targetOrg && photo && consent;
  const unverified = submit.error instanceof ApiError && submit.error.code === 'email_not_verified';

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader
        back={{ to: '/guardian', label: t('guardian.myChildren') }}
        title={t('guardian.addChild')}
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) submit.mutate();
        }}
      >
        <Card className="space-y-4">
          <h2 className="font-bold">1. {t('guardian.stepDetails')}</h2>
          <TextField
            label={t('guardian.childNameAr')}
            required
            value={form.fullNameAr}
            onChange={set('fullNameAr')}
            error={fe.fullNameAr}
          />
          <TextField
            label={t('guardian.childNameEn')}
            value={form.fullNameEn}
            onChange={set('fullNameEn')}
            dir="ltr"
          />
          <TextField
            label={t('guardian.dateOfBirth')}
            type="date"
            required
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            error={fe.dateOfBirth}
          />
          <TextField
            label={t('guardian.schoolName')}
            required
            value={form.schoolName}
            onChange={set('schoolName')}
            error={fe.schoolName}
          />
          <SelectField
            label={t('guardian.relationship')}
            value={form.relationship}
            onChange={set('relationship')}
          >
            {(['mother', 'father', 'guardian', 'other'] as const).map((r) => (
              <option key={r} value={r}>
                {t(`guardian.relation.${r}`)}
              </option>
            ))}
          </SelectField>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-bold">2. {t('guardian.stepTransport')}</h2>
          <SelectField
            label={t('auth.country')}
            value={country}
            onChange={(e) => setCountry(e.target.value as Country)}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {t(`countries.${c}`)}
              </option>
            ))}
          </SelectField>
          <div
            role="radiogroup"
            aria-label={t('guardian.stepTransport')}
            className="grid grid-cols-2 gap-2"
          >
            {(['directory', 'driver'] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? 'primary' : 'outline'}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {t(`guardian.transport.${m}`)}
              </Button>
            ))}
          </div>
          {mode === 'directory' ? (
            <SelectField
              label={t('guardian.chooseOrg')}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              required
            >
              <option value="">—</option>
              {directory.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {orgName(o)}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="space-y-3">
              <TextField
                label={t('guardian.driverPhone')}
                type="tel"
                dir="ltr"
                value={driverPhone}
                onChange={(e) => {
                  setDriverPhone(e.target.value);
                  setDriverMatch(null);
                }}
              />
              <Button
                variant="outline"
                disabled={driverPhone.length < 6 || lookup.isPending}
                onClick={() => lookup.mutate()}
              >
                {t('guardian.findDriver')}
              </Button>
              {lookup.error && <Notice tone="danger">{errorMessage(lookup.error)}</Notice>}
              {driverMatch && (
                <Notice tone="info">
                  <p className="mb-2">
                    {t('guardian.isThisYourDriver', {
                      driver:
                        i18n.language === 'en' && driverMatch.driverNameEn
                          ? driverMatch.driverNameEn
                          : driverMatch.driverNameAr,
                      org: orgName(driverMatch),
                    })}
                  </p>
                  <Checkbox
                    label={t('guardian.confirmDriver')}
                    checked={driverConfirmed}
                    onChange={(e) => setDriverConfirmed(e.target.checked)}
                  />
                </Notice>
              )}
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="font-bold">3. {t('guardian.stepPhoto')}</h2>
          <p className="text-sm text-muted">{t('guardian.photoWhy')}</p>
          {preview && (
            <img src={preview} alt="" className="mx-auto size-40 rounded-lg object-cover" />
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              const picked = await platform.camera.pickPhoto();
              if (picked) setPhoto(picked);
            }}
          >
            {photo ? t('guardian.changePhoto') : t('guardian.takePhoto')}
          </Button>
        </Card>

        <Card className="space-y-4">
          <h2 className="font-bold">4. {t('guardian.stepConsent')}</h2>
          <p className="text-sm">{t('guardian.privacyNotice')}</p>
          <p className="text-xs text-muted">
            {t('guardian.policyVersion', { version: PRIVACY_POLICY_VERSION })}
          </p>
          <Checkbox
            label={t('guardian.consent')}
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
        </Card>

        {unverified && (
          <Notice tone="warning">
            {t('errors.email_not_verified')}{' '}
            <Link to="/verify-email" className="font-bold underline">
              {t('auth.verifyEmail')}
            </Link>
          </Notice>
        )}
        {submit.error && !unverified && !Object.keys(fe).length && (
          <Notice tone="danger">{errorMessage(submit.error)}</Notice>
        )}
        <Button type="submit" size="touch" className="w-full" disabled={!ready || submit.isPending}>
          {t('guardian.submitChild')}
        </Button>
      </form>
    </div>
  );
}
