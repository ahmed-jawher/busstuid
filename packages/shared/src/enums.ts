// Domain vocabulary shared by the API, the web app and (later) the native shells.
// Keep values in sync with the PostgreSQL enums created in the migrations (PLAN §10).

const values = <T extends readonly [string, ...string[]]>(...v: T) => v;

export const ROLES = values('platform_admin', 'org_admin', 'driver', 'attendant', 'guardian');
export type Role = (typeof ROLES)[number];

export const ORGANIZATION_TYPES = values(
  'school',
  'kindergarten',
  'transport_company',
  'independent_driver',
);

/** Organisations a guardian can enrol a child with (an independent driver is found by phone). */
export const ENROLLABLE_ORG_TYPES = values('school', 'kindergarten', 'transport_company');
export type EnrollableOrgType = (typeof ENROLLABLE_ORG_TYPES)[number];
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

/** What a person says they are on the first sign-up screen. */
export const SIGNUP_ROLES = values(
  'guardian',
  'independent_driver',
  'organization',
  'staff_driver',
);
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const COUNTRIES = values('BH', 'SA');
export type Country = (typeof COUNTRIES)[number];

export const LOCALES = values('ar', 'en');
export type Locale = (typeof LOCALES)[number];

export const TRIP_DIRECTIONS = values('to_school', 'to_home');
export type TripDirection = (typeof TRIP_DIRECTIONS)[number];

export const TRIP_STATUSES = values(
  'scheduled',
  'in_progress',
  'overdue',
  'completed',
  'completed_with_alert',
  'cancelled',
);
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STUDENT_STATUSES = values(
  'expected',
  'boarded',
  'alighted',
  'absent',
  'missing',
  'resolved',
);
export type TripStudentStatus = (typeof TRIP_STUDENT_STATUSES)[number];

export const TRIP_EVENT_TYPES = values('board', 'alight', 'absent', 'undo');
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export const ALERT_TYPES = values(
  'student_left_onboard',
  'trip_overdue',
  'driver_device_silent',
  'unexpected_student',
);
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = values('low', 'high', 'critical');
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = values('open', 'acknowledged', 'resolved');
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const PUSH_PROVIDERS = values('webpush', 'fcm', 'apns');
export type PushProvider = (typeof PUSH_PROVIDERS)[number];

export const DEVICE_PLATFORMS = values('web', 'android', 'ios');
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const EMAIL_CODE_PURPOSES = values('verify_email', 'reset_password', 'change_email');
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];
