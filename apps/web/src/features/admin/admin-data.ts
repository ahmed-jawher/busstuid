import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import type { Role, TripDirection, TripStatus } from '@wusool/shared';
import { api, type RequestOptions } from '@/lib/api';
import type { AlertRow, Counts, OrgSummary } from '@/lib/types';

export const OrgContext = createContext<OrgSummary | null>(null);

export function useAdminOrg(): OrgSummary {
  const org = useContext(OrgContext);
  if (!org) throw new Error('useAdminOrg outside AdminLayout');
  return org;
}

/** API call in the current organisation (sends X-Organization-Id). */
export function useOrgApi() {
  const org = useAdminOrg();
  return useMemo(
    () =>
      <T>(path: string, opts: Omit<RequestOptions, 'orgId'> = {}) =>
        api<T>(path, { ...opts, orgId: org.id }),
    [org.id],
  );
}

// Response shapes of the /org endpoints and the queries the admin screens share. Query keys
// end with the organisation id so switching organisation never shows the previous one's data;
// invalidating by the first key part still refreshes them.

export interface OrgTrip {
  id: string;
  direction: TripDirection;
  status: TripStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  driverId: string;
  route: { name: string } | null;
  vehicle: { plateNumber: string };
  counts: Counts;
}

export interface EnrollmentRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt: string | null;
  student: { id: string; fullNameAr: string; fullNameEn: string | null; schoolName: string };
  /** The guardian who asked, so the admin can recognise the family. */
  guardian: { fullNameAr: string; fullNameEn: string | null; relationship: string } | null;
}

export interface OrgStudent {
  id: string;
  fullNameAr: string;
  fullNameEn: string | null;
  schoolName: string;
  photoUrl: string | null;
  routes: {
    routeId: string;
    routeName: string;
    direction: TripDirection;
    stopName: string;
    stopSequence: number;
  }[];
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  type: 'bus' | 'van' | 'car';
  capacity: number;
  status: 'active' | 'inactive';
}

export interface Member {
  role: Role;
  user: {
    id: string;
    email: string;
    fullNameAr: string;
    fullNameEn: string | null;
    phoneE164: string;
  };
}

export interface Unreachable {
  userId: string;
  fullNameAr: string;
  fullNameEn: string | null;
  phone: string;
  children: { id: string; fullNameAr: string }[];
  reason: 'no_device' | 'delivery_failing';
}

export interface RouteRow {
  id: string;
  name: string;
  direction: TripDirection;
  plannedStart: string;
  plannedEnd: string;
  daysOfWeek: number[];
  defaultVehicleId: string | null;
  defaultDriverId: string | null;
  stops: { id: string; sequence: number; name: string }[];
}

export interface RouteDetail extends RouteRow {
  students: { studentId: string; stopId: string }[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

function useOrgQuery<T>(key: string, path: string, refetchInterval?: number) {
  const org = useAdminOrg();
  const call = useOrgApi();
  return useQuery({
    queryKey: [key, org.id],
    queryFn: () => call<T>(path),
    refetchInterval,
  });
}

export const useOrgTrips = () => useOrgQuery<OrgTrip[]>('org-trips', '/org/trips', 10_000);
export const useOpenAlerts = () => useOrgQuery<AlertRow[]>('org-alerts', '/alerts', 10_000);
export const useClosedAlerts = () =>
  useOrgQuery<AlertRow[]>('org-alerts-resolved', '/alerts?status=resolved', 60_000);
export const usePendingEnrollments = () =>
  useOrgQuery<EnrollmentRequest[]>('enrollments', '/org/enrollment-requests', 60_000);
export const useOrgStudents = () => useOrgQuery<OrgStudent[]>('org-students', '/org/students');
export const useVehicles = () => useOrgQuery<Vehicle[]>('vehicles', '/org/vehicles');
export const useMembers = () => useOrgQuery<Member[]>('members', '/org/members');
export const useRoutes = () => useOrgQuery<RouteRow[]>('routes', '/org/routes');
export const useUnreachable = () =>
  useOrgQuery<Unreachable[]>('unreachable', '/org/unreachable-guardians', 60_000);
export const useAudit = () => useOrgQuery<AuditEntry[]>('audit', '/org/audit');

/** Member lookup by user id (driver names and phones on trips, routes and the audit log). */
export function useMemberMap() {
  const members = useMembers();
  const map = new Map<string, Member['user']>();
  for (const m of members.data ?? []) map.set(m.user.id, m.user);
  return map;
}
