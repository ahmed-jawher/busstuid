import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { IconName } from '@/components/Icon';
import type { Tone } from '@/components/ui/kit';
import { api } from '@/lib/api';
import { formatTime, orgName } from '@/lib/format';
import type { Child, ChildTripRow } from '@/lib/types';

export interface MyAlert {
  id: string;
  studentId: string | null;
  type: string;
  severity: string;
  status: string;
  openedAt: string;
}

export const useChildren = () =>
  useQuery({ queryKey: ['children'], queryFn: () => api<Child[]>('/me/children') });

export const useMyAlerts = () =>
  useQuery({
    queryKey: ['my-alerts'],
    queryFn: () => api<{ asGuardian: MyAlert[] }>('/me/alerts'),
    refetchInterval: 20_000,
  });

export const useChildToday = (id: string, enabled = true) =>
  useQuery({
    queryKey: ['child-today', id],
    queryFn: () => api<ChildTripRow[]>(`/children/${id}/today`),
    refetchInterval: 30_000,
    enabled,
  });

export type ChildState =
  | 'pending'
  | 'alert'
  | 'safe'
  | 'boarded'
  | 'atSchool'
  | 'atHome'
  | 'absent'
  | 'waiting'
  | 'noTrip';

export const STATE_STYLE: Record<ChildState, { icon: IconName; tone: Tone }> = {
  pending: { icon: 'hourglass_top', tone: 'warning' },
  alert: { icon: 'warning', tone: 'alert' },
  safe: { icon: 'verified', tone: 'ok' },
  boarded: { icon: 'directions_bus', tone: 'primary' },
  atSchool: { icon: 'school', tone: 'ok' },
  atHome: { icon: 'home', tone: 'ok' },
  absent: { icon: 'do_not_disturb_on', tone: 'neutral' },
  waiting: { icon: 'schedule', tone: 'neutral' },
  noTrip: { icon: 'schedule', tone: 'neutral' },
};

export interface ChildView {
  state: ChildState;
  /** The trip the card is about: the one in progress, else the latest, else the next. */
  row: ChildTripRow | null;
  pendingOrg: string | null;
  alertId: string | null;
}

/** Where is my child now? (Claude Design "Tammeni Guardian": one answer per card.) */
export function childView(
  child: Child,
  rows: ChildTripRow[] | undefined,
  alerts: MyAlert[],
): ChildView {
  const approved = child.enrollmentRequests.some((r) => r.status === 'approved');
  const pending = child.enrollmentRequests.find((r) => r.status === 'pending');
  const alert = alerts.find((a) => a.studentId === child.id);
  const list = rows ?? [];
  const started = [...list].reverse().find((r) => r.studentStatus !== 'expected') ?? null;
  const next = list.find((r) => r.studentStatus === 'expected') ?? null;
  const base = {
    pendingOrg: pending ? orgName(pending.organization) : null,
    alertId: alert?.id ?? null,
  };
  if (alert) return { ...base, state: 'alert', row: started ?? next };
  if (!approved && pending) return { ...base, state: 'pending', row: null };
  if (!started) return { ...base, state: next ? 'waiting' : 'noTrip', row: next };
  switch (started.studentStatus) {
    case 'boarded':
      return { ...base, state: 'boarded', row: started };
    case 'missing':
      return { ...base, state: 'alert', row: started };
    case 'resolved':
      return { ...base, state: 'safe', row: started };
    case 'absent':
      return next
        ? { ...base, state: 'waiting', row: next }
        : { ...base, state: 'absent', row: started };
    default:
      // Got off: at school in the morning, home after the return trip — until the next one.
      if (next && started.direction === 'to_school' && next.direction === 'to_home')
        return { ...base, state: 'atSchool', row: started };
      return {
        ...base,
        state: started.direction === 'to_school' ? 'atSchool' : 'atHome',
        row: started,
      };
  }
}

export function stateHeadline(v: ChildView, t: TFunction): string {
  const r = v.row;
  switch (v.state) {
    case 'pending':
      return t('guardian.pendingApproval', { org: v.pendingOrg });
    case 'alert':
      return t('gd.headline.alert');
    case 'safe':
      return t('gd.headline.safe', { time: formatTime(r?.alightedAt) });
    case 'boarded':
      return t('guardian.onBusSince', { time: formatTime(r?.boardedAt) });
    case 'atSchool':
      return t('guardian.arrivedSchool', { time: formatTime(r?.alightedAt) });
    case 'atHome':
      return t('guardian.droppedHome', { time: formatTime(r?.alightedAt) });
    case 'absent':
      return t('guardian.markedAbsent');
    case 'waiting':
      return t('gd.headline.waiting', { time: formatTime(r?.plannedStartAt) });
    default:
      return t('guardian.noTripToday');
  }
}

/** "Good morning" before noon, "Good evening" after. */
export function greeting(t: TFunction): string {
  return new Date().getHours() < 12 ? t('gd.morning') : t('gd.evening');
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;
