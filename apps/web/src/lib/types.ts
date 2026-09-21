import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  Country,
  Locale,
  OrganizationType,
  Role,
  TripDirection,
  TripStatus,
  TripStudentStatus,
} from '@wusool/shared';

// Response shapes of the API endpoints the web app uses.

export interface OrgSummary {
  id: string;
  type: OrganizationType;
  nameAr: string;
  nameEn: string | null;
  country: Country;
  status: 'pending_review' | 'active' | 'suspended';
}

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  phoneE164: string;
  phoneVerified: boolean;
  fullNameAr: string;
  fullNameEn: string | null;
  preferredLocale: Locale;
  muteRoutineNotifications: boolean;
  isPlatformAdmin: boolean;
  memberships: { role: Role; organization: OrgSummary }[];
}

export interface Child {
  id: string;
  fullNameAr: string;
  fullNameEn: string | null;
  dateOfBirth: string;
  schoolName: string;
  photoUrl: string | null;
  enrollmentRequests: {
    id: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    createdAt: string;
    organization: { id: string; type: OrganizationType; nameAr: string; nameEn: string | null };
  }[];
}

export interface Counts {
  onboard: number;
  alighted: number;
  waiting: number;
  absent: number;
  missing: number;
}

export interface ChildTripRow {
  id: string;
  direction: TripDirection;
  status: TripStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  startedAt: string | null;
  endedAt: string | null;
  vehicle: { plateNumber: string };
  organization: { nameAr: string; nameEn: string | null };
  studentStatus: TripStudentStatus;
  boardedAt: string | null;
  alightedAt: string | null;
  stopName: string | null;
}

export interface DriverTrip {
  id: string;
  direction: TripDirection;
  status: TripStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  startedAt: string | null;
  endedAt: string | null;
  route: { name: string } | null;
  vehicle: { plateNumber: string; type: string };
  organization: { id: string; nameAr: string; nameEn: string | null };
  counts: Counts;
}

export interface ManifestStudent {
  studentId: string;
  status: TripStudentStatus;
  isUnexpected: boolean;
  boardedAt: string | null;
  alightedAt: string | null;
  stopSequence: number | null;
  stop: { id: string; name: string; sequence: number } | null;
  fullNameAr: string;
  fullNameEn: string | null;
  photoUrl: string | null;
}

export interface Manifest {
  id: string;
  direction: TripDirection;
  status: TripStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  startedAt: string | null;
  endedAt: string | null;
  route: { name: string } | null;
  vehicle: { plateNumber: string; type: string };
  students: ManifestStudent[];
  counts: Counts;
}

export interface AlertRow {
  id: string;
  tripId: string;
  studentId: string | null;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  escalationLevel: number;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
  resolutionNote: string | null;
  trip: {
    direction: TripDirection;
    status: TripStatus;
    driverId: string;
    vehicle: { plateNumber: string };
    route: { name: string } | null;
  };
}

export interface InboxItem {
  id: string;
  template: string;
  title: string;
  body: string;
  url: string | null;
  priority: 'normal' | 'high' | 'critical';
  alertId: string | null;
  createdAt: string;
  readAt: string | null;
}
