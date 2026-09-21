import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import type { Role } from '@wusool/shared';
import { Button } from '@/components/ui/button';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { Card, EmptyState, Notice, Spinner } from '@/components/ui/layout';
import { errorMessage } from '@/lib/errors';
import { displayName, formatTime } from '@/lib/format';
import type { AlertRow, Counts } from '@/lib/types';
import { AdminSection, useOrgApi } from './admin-org';

// ─── Live trips ─────────────────────────────────────────────────────────────

interface OrgTrip {
  id: string;
  direction: 'to_school' | 'to_home';
  status: string;
  plannedStartAt: string;
  plannedEndAt: string;
  lastHeartbeatAt: string | null;
  route: { name: string } | null;
  vehicle: { plateNumber: string };
  counts: Counts;
}

export function LiveTripsPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const trips = useQuery({
    queryKey: ['org-trips'],
    queryFn: () => call<OrgTrip[]>('/org/trips'),
    refetchInterval: 10_000,
  });
  return (
    <AdminSection title={t('admin.nav.live')}>
      {trips.isLoading && <Spinner label={t('common.loading')} />}
      {trips.data?.length === 0 && <EmptyState>{t('admin.noTripsToday')}</EmptyState>}
      <ul className="grid gap-3 md:grid-cols-2">
        {trips.data?.map((trip) => (
          <li key={trip.id}>
            <Card
              className={
                trip.status === 'overdue' || trip.status === 'completed_with_alert'
                  ? 'border-2 border-alert'
                  : ''
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">{trip.route?.name ?? trip.vehicle.plateNumber}</h2>
                <span className="text-sm font-semibold">{t(`tripStatus.${trip.status}`)}</span>
              </div>
              <p className="text-sm text-muted">
                {trip.vehicle.plateNumber} · {formatTime(trip.plannedStartAt)}–
                {formatTime(trip.plannedEndAt)}
              </p>
              <p className="mt-2 font-semibold">
                🚌 {trip.counts.onboard} · ✅ {trip.counts.alighted} · ⏳ {trip.counts.waiting} · ➖{' '}
                {trip.counts.absent}
                {trip.counts.missing > 0 && ` · ❗ ${trip.counts.missing}`}
              </p>
              {trip.lastHeartbeatAt && (
                <p className="text-xs text-muted">
                  {t('admin.lastSignal')}: {formatTime(trip.lastHeartbeatAt)}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export function AdminAlertsPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const alerts = useQuery({
    queryKey: ['org-alerts', 'open'],
    queryFn: () => call<AlertRow[]>('/alerts'),
    refetchInterval: 10_000,
  });
  return (
    <AdminSection title={t('admin.nav.alerts')}>
      {alerts.data?.length === 0 && <EmptyState>{t('admin.noAlerts')}</EmptyState>}
      <ul className="space-y-2">
        {alerts.data?.map((a) => (
          <li key={a.id}>
            <Link to={`/alert/${a.id}`} className="block">
              <Card className={a.severity === 'critical' ? 'border-2 border-alert' : ''}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold">{t(`alertType.${a.type}`)}</span>
                  <span className="text-sm">
                    {t(`severity.${a.severity}`)} · {t(`alertStatus.${a.status}`)}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {a.trip.route?.name} · {a.trip.vehicle.plateNumber} · {formatTime(a.openedAt)}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Enrollment requests ────────────────────────────────────────────────────

interface EnrollmentRequest {
  id: string;
  createdAt: string;
  student: { id: string; fullNameAr: string; fullNameEn: string | null; schoolName: string };
}

export function EnrollmentsPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['enrollments'],
    queryFn: () => call<EnrollmentRequest[]>('/org/enrollment-requests'),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      call(`/org/enrollment-requests/${id}/${action}`, {
        method: 'POST',
        body: action === 'reject' ? {} : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enrollments'] }),
  });
  return (
    <AdminSection title={t('admin.nav.enrollments')}>
      <Notice>{t('admin.enrollmentPrivacy')}</Notice>
      {decide.error && <Notice tone="danger">{errorMessage(decide.error)}</Notice>}
      {list.data?.length === 0 && <EmptyState>{t('admin.noRequests')}</EmptyState>}
      <ul className="space-y-2">
        {list.data?.map((r) => (
          <li key={r.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">{displayName(r.student)}</p>
                <p className="text-sm text-muted">{r.student.schoolName}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => decide.mutate({ id: r.id, action: 'approve' })}>
                  {t('admin.approve')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide.mutate({ id: r.id, action: 'reject' })}
                >
                  {t('admin.reject')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Students ───────────────────────────────────────────────────────────────

interface OrgStudent {
  id: string;
  fullNameAr: string;
  fullNameEn: string | null;
  schoolName: string;
  photoUrl: string | null;
}

export function useOrgStudents() {
  const call = useOrgApi();
  return useQuery({
    queryKey: ['org-students'],
    queryFn: () => call<OrgStudent[]>('/org/students'),
  });
}

export function StudentsPage() {
  const { t } = useTranslation();
  const students = useOrgStudents();
  return (
    <AdminSection title={t('admin.nav.students')}>
      {students.data?.length === 0 && <EmptyState>{t('admin.noStudents')}</EmptyState>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {students.data?.map((s) => (
          <li key={s.id}>
            <Card className="flex items-center gap-3">
              {s.photoUrl ? (
                <img src={s.photoUrl} alt="" className="size-12 rounded-full object-cover" />
              ) : (
                <div className="size-12 rounded-full bg-border" />
              )}
              <div>
                <p className="font-bold">{displayName(s)}</p>
                <p className="text-sm text-muted">{s.schoolName}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Vehicles ───────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  plateNumber: string;
  type: 'bus' | 'van' | 'car';
  capacity: number;
  status: 'active' | 'inactive';
}

export function useVehicles() {
  const call = useOrgApi();
  return useQuery({ queryKey: ['vehicles'], queryFn: () => call<Vehicle[]>('/org/vehicles') });
}

export function VehiclesPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const vehicles = useVehicles();
  const [form, setForm] = useState({ plateNumber: '', type: 'bus', capacity: '30' });
  const create = useMutation({
    mutationFn: () =>
      call('/org/vehicles', { method: 'POST', body: { ...form, capacity: Number(form.capacity) } }),
    onSuccess: () => {
      setForm({ plateNumber: '', type: 'bus', capacity: '30' });
      return qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (v: Vehicle) =>
      call(`/org/vehicles/${v.id}`, {
        method: 'PATCH',
        body: { status: v.status === 'active' ? 'inactive' : 'active' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
  return (
    <AdminSection title={t('admin.nav.vehicles')}>
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_8rem_6rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('admin.plate')}
            required
            value={form.plateNumber}
            onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
            dir="ltr"
          />
          <SelectField
            label={t('admin.vehicleType')}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {(['bus', 'van', 'car'] as const).map((v) => (
              <option key={v} value={v}>
                {t(`vehicleType.${v}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('admin.capacity')}
            type="number"
            min={1}
            max={100}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Button type="submit" disabled={create.isPending}>
            {t('common.add')}
          </Button>
        </form>
        {create.error && (
          <Notice tone="danger" className="mt-3">
            {errorMessage(create.error)}
          </Notice>
        )}
      </Card>
      <ul className="space-y-2">
        {vehicles.data?.map((v) => (
          <li key={v.id}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`font-bold ${v.status === 'inactive' ? 'text-muted line-through' : ''}`}
                dir="ltr"
              >
                {v.plateNumber}
              </span>
              <span className="text-sm text-muted">
                {t(`vehicleType.${v.type}`)} · {v.capacity}
              </span>
              <Button variant="ghost" onClick={() => toggle.mutate(v)}>
                {v.status === 'active' ? t('admin.deactivate') : t('admin.activate')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Members ────────────────────────────────────────────────────────────────

interface Member {
  role: Role;
  user: {
    id: string;
    email: string;
    fullNameAr: string;
    fullNameEn: string | null;
    phoneE164: string;
  };
}

export function useMembers() {
  const call = useOrgApi();
  return useQuery({ queryKey: ['members'], queryFn: () => call<Member[]>('/org/members') });
}

export function MembersPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const members = useMembers();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'driver' | 'attendant' | 'org_admin'>('driver');
  const add = useMutation({
    mutationFn: () => call('/org/members', { method: 'POST', body: { email, role } }),
    onSuccess: () => {
      setEmail('');
      return qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
  const remove = useMutation({
    mutationFn: (m: Member) => call(`/org/members/${m.user.id}/${m.role}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
  });
  return (
    <AdminSection title={t('admin.nav.members')}>
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <TextField
            label={t('auth.email')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint={t('admin.memberHint')}
          />
          <SelectField
            label={t('admin.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {(['driver', 'attendant', 'org_admin'] as const).map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </SelectField>
          <Button type="submit" disabled={add.isPending}>
            {t('common.add')}
          </Button>
        </form>
        {(add.error ?? remove.error) && (
          <Notice tone="danger" className="mt-3">
            {errorMessage(add.error ?? remove.error)}
          </Notice>
        )}
      </Card>
      <ul className="space-y-2">
        {members.data?.map((m) => (
          <li key={`${m.user.id}-${m.role}`}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{displayName(m.user)}</p>
                <p className="text-sm text-muted" dir="ltr">
                  {m.user.email} · {m.user.phoneE164}
                </p>
              </div>
              <span className="text-sm font-semibold">{t(`role.${m.role}`)}</span>
              <Button variant="ghost" onClick={() => remove.mutate(m)}>
                {t('common.remove')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Unreachable guardians ──────────────────────────────────────────────────

interface Unreachable {
  userId: string;
  fullNameAr: string;
  fullNameEn: string | null;
  phone: string;
  children: { id: string; fullNameAr: string }[];
  reason: 'no_device' | 'delivery_failing';
}

export function UnreachablePage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const list = useQuery({
    queryKey: ['unreachable'],
    queryFn: () => call<Unreachable[]>('/org/unreachable-guardians'),
  });
  return (
    <AdminSection title={t('admin.nav.unreachable')}>
      <Notice>{t('admin.unreachableIntro')}</Notice>
      {list.data?.length === 0 && <EmptyState>{t('admin.allReachable')}</EmptyState>}
      <ul className="space-y-2">
        {list.data?.map((g) => (
          <li key={g.userId}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold">{displayName(g)}</p>
                <p className="text-sm text-muted">
                  {g.children.map((c) => c.fullNameAr).join('، ')} ·{' '}
                  {t(`admin.unreachableReason.${g.reason}`)}
                </p>
              </div>
              <a href={`tel:${g.phone}`} className="font-semibold text-primary" dir="ltr">
                📞 {g.phone}
              </a>
              <span className="w-full text-xs text-muted">{t('alert.phoneUnverified')}</span>
            </Card>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

// ─── Routes ─────────────────────────────────────────────────────────────────

interface RouteRow {
  id: string;
  name: string;
  direction: 'to_school' | 'to_home';
  plannedStart: string;
  plannedEnd: string;
  daysOfWeek: number[];
  defaultVehicleId: string | null;
  defaultDriverId: string | null;
  stops: { id: string; sequence: number; name: string }[];
}

const DAYS = [7, 1, 2, 3, 4, 5, 6];

export function RoutesPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => call<RouteRow[]>('/org/routes') });
  const vehicles = useVehicles();
  const members = useMembers();
  const drivers = (members.data ?? []).filter((m) => m.role === 'driver');
  const empty = {
    name: '',
    direction: 'to_school',
    defaultVehicleId: '',
    defaultDriverId: '',
    plannedStart: '06:15',
    plannedEnd: '07:15',
    stops: '',
  };
  const [form, setForm] = useState(empty);
  const [days, setDays] = useState<number[]>([7, 1, 2, 3, 4]);
  const create = useMutation({
    mutationFn: () =>
      call('/org/routes', {
        method: 'POST',
        body: {
          ...form,
          daysOfWeek: days,
          stops: form.stops
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((name) => ({ name })),
        },
      }),
    onSuccess: () => {
      setForm(empty);
      return qc.invalidateQueries({ queryKey: ['routes'] });
    },
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  return (
    <AdminSection title={t('admin.nav.routes')}>
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label={t('admin.routeName')}
            required
            value={form.name}
            onChange={set('name')}
          />
          <SelectField
            label={t('admin.direction')}
            value={form.direction}
            onChange={set('direction')}
          >
            <option value="to_school">{t('direction.to_school')}</option>
            <option value="to_home">{t('direction.to_home')}</option>
          </SelectField>
          <SelectField
            label={t('admin.vehicle')}
            required
            value={form.defaultVehicleId}
            onChange={set('defaultVehicleId')}
          >
            <option value="">—</option>
            {vehicles.data
              ?.filter((v) => v.status === 'active')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber}
                </option>
              ))}
          </SelectField>
          <SelectField
            label={t('role.driver')}
            required
            value={form.defaultDriverId}
            onChange={set('defaultDriverId')}
          >
            <option value="">—</option>
            {drivers.map((d) => (
              <option key={d.user.id} value={d.user.id}>
                {displayName(d.user)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('admin.start')}
            type="time"
            required
            value={form.plannedStart}
            onChange={set('plannedStart')}
          />
          <TextField
            label={t('admin.end')}
            type="time"
            required
            value={form.plannedEnd}
            onChange={set('plannedEnd')}
          />
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-semibold">{t('admin.days')}</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d) => (
                <Checkbox
                  key={d}
                  label={t(`weekday.${d}`)}
                  checked={days.includes(d)}
                  onChange={(e) =>
                    setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))
                  }
                />
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold" htmlFor="stops">
              {t('admin.stopsOnePerLine')}
            </label>
            <textarea
              id="stops"
              required
              rows={4}
              value={form.stops}
              onChange={set('stops')}
              className="w-full rounded-md border border-border bg-surface px-3 py-2"
            />
          </div>
          {create.error && (
            <Notice tone="danger" className="sm:col-span-2">
              {errorMessage(create.error)}
            </Notice>
          )}
          <Button
            type="submit"
            className="sm:col-span-2"
            disabled={create.isPending || days.length === 0}
          >
            {t('admin.addRoute')}
          </Button>
        </form>
      </Card>
      <ul className="space-y-2">
        {routes.data?.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/routes/${r.id}`} className="block">
              <Card>
                <p className="font-bold">{r.name}</p>
                <p className="text-sm text-muted">
                  {t(`direction.${r.direction}`)} · {r.plannedStart}–{r.plannedEnd} ·{' '}
                  {t('admin.stopCount', { count: r.stops.length })}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}

interface RouteDetail extends RouteRow {
  students: { studentId: string; stopId: string }[];
}

export function RouteDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const call = useOrgApi();
  const qc = useQueryClient();
  const route = useQuery({
    queryKey: ['route', id],
    queryFn: () => call<RouteDetail>(`/org/routes/${id}`),
  });
  const students = useOrgStudents();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const assigned =
    draft ?? Object.fromEntries((route.data?.students ?? []).map((s) => [s.studentId, s.stopId]));
  const save = useMutation({
    mutationFn: () =>
      call(`/org/routes/${id}/students`, {
        method: 'PUT',
        body: {
          assignments: Object.entries(assigned)
            .filter(([, stop]) => stop)
            .map(([studentId, stopId]) => ({ studentId, stopId })),
        },
      }),
    onSuccess: async () => {
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ['route', id] });
    },
  });
  if (!route.data) return <Spinner label={t('common.loading')} />;
  return (
    <AdminSection title={route.data.name}>
      <p className="text-muted">{t('admin.assignIntro')}</p>
      <ul className="space-y-2">
        {students.data?.map((s) => (
          <li key={s.id}>
            <Card className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
              <span className="font-semibold">{displayName(s)}</span>
              <SelectField
                label={t('admin.stop')}
                value={assigned[s.id] ?? ''}
                onChange={(e) => setDraft({ ...assigned, [s.id]: e.target.value })}
              >
                <option value="">{t('admin.notOnRoute')}</option>
                {route.data.stops.map((stop) => (
                  <option key={stop.id} value={stop.id}>
                    {stop.sequence}. {stop.name}
                  </option>
                ))}
              </SelectField>
            </Card>
          </li>
        ))}
      </ul>
      {save.error && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Button
        size="touch"
        className="w-full"
        disabled={!draft || save.isPending}
        onClick={() => save.mutate()}
      >
        {t('common.save')}
      </Button>
    </AdminSection>
  );
}

// ─── Audit log ──────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

export function AuditPage() {
  const { t } = useTranslation();
  const call = useOrgApi();
  const log = useQuery({ queryKey: ['audit'], queryFn: () => call<AuditEntry[]>('/org/audit') });
  return (
    <AdminSection title={t('admin.nav.audit')}>
      <Notice>{t('admin.auditIntro')}</Notice>
      {log.data?.length === 0 && <EmptyState>{t('admin.noAudit')}</EmptyState>}
      <ul className="space-y-1 text-sm">
        {log.data?.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap justify-between gap-2 border-b border-border py-2"
          >
            <span className="font-semibold" dir="ltr">
              {e.action}
            </span>
            <span className="text-muted" dir="ltr">
              {e.actorUserId?.slice(0, 8) ?? '—'} · {new Date(e.createdAt).toLocaleString('en-GB')}
            </span>
          </li>
        ))}
      </ul>
    </AdminSection>
  );
}
