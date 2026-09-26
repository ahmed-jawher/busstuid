import { z } from 'zod';
import {
  COUNTRIES,
  LEGAL_DOCUMENTS,
  EMAIL_CODE_PURPOSES,
  ENROLLABLE_ORG_TYPES,
  LOCALES,
  ORGANIZATION_TYPES,
  SIGNUP_ROLES,
} from './enums';
import { normalizePhone } from './phone';

// Request schemas shared by the API (validation) and the web app (forms). PLAN §5.1, §11.

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Six characters, anything at all — digits only is fine. A password a parent cannot remember is
 * written on the fridge, and the account they cannot sign in to is the one that stops telling them
 * where their child is (docs/DECISIONS.md). Guessing is held back by the per-account lockout
 * instead.
 */
export const passwordSchema = z.string().min(6, 'password_too_short').max(128, 'password_too_long');

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'code_format');

export const nameSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .transform((v) => v.replace(/\s+/g, ' '));

/** Latin letters required: an "English name" written in Arabic helps nobody. */
export const nameEnSchema = nameSchema.refine((v) => /[A-Za-z]/.test(v), 'name_en_latin');

const countrySchema = z.enum(COUNTRIES);

/** Phone + country, normalised to E.164 (`phone` in the output). */
const phoneFields = {
  phone: z.string().trim().min(4).max(32),
  country: countrySchema,
};

function withNormalizedPhone<T extends { phone: string; country: (typeof COUNTRIES)[number] }>(
  value: T,
  ctx: z.RefinementCtx,
): T {
  const e164 = normalizePhone(value.phone, value.country);
  if (!e164) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'phone_invalid' });
    return z.NEVER;
  }
  return { ...value, phone: e164 };
}

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullNameAr: nameSchema,
    fullNameEn: nameEnSchema.optional(),
    ...phoneFields,
    locale: z.enum(LOCALES).default('ar'),
    signupRole: z.enum(SIGNUP_ROLES).default('guardian'),
    /** Ticked by the person; the server records which version they agreed to. */
    acceptTerms: z.literal(true, { error: 'terms_not_accepted' }),
    /** Required when signing up as a school or transport company. */
    organization: z
      .object({
        type: z.enum(ENROLLABLE_ORG_TYPES),
        nameAr: nameSchema,
        nameEn: nameEnSchema,
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.signupRole === 'organization' && !v.organization) {
      ctx.addIssue({
        code: 'custom',
        path: ['organization', 'nameAr'],
        message: 'organization_required',
      });
    }
    // An independent driver's own name is shown to guardians as the organisation's name.
    if (v.signupRole === 'independent_driver' && !v.fullNameEn) {
      ctx.addIssue({ code: 'custom', path: ['fullNameEn'], message: 'name_en_required' });
    }
  })
  .transform(withNormalizedPhone);
export type RegisterInput = z.infer<typeof registerSchema>;

const deviceInfo = z.string().trim().max(200).optional();

export const verifyEmailSchema = z.object({ email: emailSchema, code: codeSchema, deviceInfo });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendCodeSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['verify_email', 'reset_password']).default('verify_email'),
});

/**
 * The email address or the phone number, whichever the person remembers. `identifier` is what the
 * app sends; `email` is still accepted so older builds keep working.
 */
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254).optional(),
    email: z.string().trim().max(254).optional(),
    password: z.string().max(128),
    /** Needed to read a phone number as a local one; the API defaults to Bahrain. */
    country: countrySchema.optional(),
    /** Authenticator code, required once TOTP is enabled on the account. */
    totp: codeSchema.optional(),
    deviceInfo,
  })
  .transform((v, ctx) => {
    const identifier = (v.identifier ?? v.email ?? '').trim();
    if (identifier.length < 3) {
      ctx.addIssue({ code: 'custom', path: ['identifier'], message: 'identifier_required' });
      return z.NEVER;
    }
    return { ...v, identifier };
  });
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  newPassword: passwordSchema,
});

export const updateProfileSchema = z
  .object({
    fullNameAr: nameSchema.optional(),
    fullNameEn: nameSchema.nullable().optional(),
    ...phoneFields,
    preferredLocale: z.enum(LOCALES).optional(),
  })
  .partial({ phone: true, country: true })
  .superRefine((v, ctx) => {
    if (v.phone !== undefined && v.country === undefined) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'country_required_with_phone' });
    }
  })
  .transform((v, ctx) =>
    v.phone !== undefined && v.country
      ? withNormalizedPhone({ ...v, phone: v.phone, country: v.country }, ctx)
      : v,
  );

export const notificationSettingsSchema = z.object({ muteRoutineNotifications: z.boolean() });

/** Agreeing again after the documents change, or a driver's safety acknowledgement. */
export const acceptLegalSchema = z.object({
  documents: z.array(z.enum(LEGAL_DOCUMENTS)).min(1),
  version: z.string().min(4).max(20),
});

export const changeEmailSchema = z.object({ newEmail: emailSchema, password: z.string().max(128) });
export const confirmEmailChangeSchema = z.object({ code: codeSchema });
export const deleteAccountSchema = z.object({ password: z.string().max(128) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128),
  newPassword: passwordSchema,
});

export const createOrganizationSchema = z.object({
  type: z.enum(ORGANIZATION_TYPES),
  nameAr: nameSchema,
  nameEn: nameEnSchema,
  country: countrySchema,
});

export const driverLookupSchema = z.object({ ...phoneFields }).transform(withNormalizedPhone);

export const directoryQuerySchema = z.object({
  country: countrySchema,
  type: z.enum(ENROLLABLE_ORG_TYPES).optional(),
  /** Free-text search over both names (the directory can hold every school in the country). */
  q: z.string().trim().max(80).optional(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_format');

/** Multipart form fields sent with the student photo (PLAN §5 step 3). */
export const createStudentSchema = z.object({
  fullNameAr: nameSchema,
  fullNameEn: nameSchema.optional(),
  dateOfBirth: isoDate,
  schoolName: z.string().trim().min(2).max(150),
  notes: z.string().trim().max(500).optional(),
  relationship: z.enum(['mother', 'father', 'guardian', 'other']).default('guardian'),
  /**
   * The school or company to ask for a link. Left out when the family's driver has no account
   * yet: the child is added first, and the driver is invited straight after (PLAN §5).
   */
  organizationId: z.uuid().optional(),
  // Multipart sends strings; consent must be an explicit "true" (PLAN §14).
  consent: z.literal('true', { error: 'consent_required' }),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const enrollSchema = z.object({ organizationId: z.uuid() });

/** What a guardian may correct on a child's profile later (PLAN §5). */
export const updateStudentSchema = z
  .object({
    fullNameAr: nameSchema.optional(),
    fullNameEn: nameSchema.nullable().optional(),
    dateOfBirth: isoDate.optional(),
    schoolName: z.string().trim().min(2).max(150).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: 'nothing_to_update' });
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

/**
 * A driver the family uses who has no account yet. Nothing is sent to the number: the record lets
 * the operator invite them, and it becomes a link request the moment that driver signs up.
 * `consentContact` is the guardian allowing us to name them to that driver (PLAN §14).
 */
export const inviteDriverSchema = z
  .object({
    nameAr: nameSchema,
    ...phoneFields,
    consentContact: z.literal(true, { error: 'contact_consent_required' }),
  })
  .transform(withNormalizedPhone);

export const decisionSchema = z.object({ note: z.string().trim().max(500).optional() });

const pushUserAgent = z.string().max(300).optional();
/** A browser subscription, or the native device token of the Android/iOS app (phase 6). */
export const pushSubscriptionSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('webpush'),
    platform: z.literal('web'),
    endpoint: z.url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
    userAgent: pushUserAgent,
  }),
  z.object({
    provider: z.literal('fcm'),
    platform: z.literal('android'),
    token: z.string().regex(/^[\w:.-]{20,4096}$/, 'push_token_format'),
    userAgent: pushUserAgent,
  }),
  z.object({
    provider: z.literal('apns'),
    platform: z.literal('ios'),
    token: z.string().regex(/^[0-9a-fA-F]{64,200}$/, 'push_token_format'),
    userAgent: pushUserAgent,
  }),
]);
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const emailCodePurposeSchema = z.enum(EMAIL_CODE_PURPOSES);

// ─── Phase 2: organisation setup and trips ──────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format');
const coordinate = (min: number, max: number) => z.number().min(min).max(max);

export const vehicleSchema = z.object({
  plateNumber: z.string().trim().min(1).max(20),
  type: z.enum(['bus', 'van', 'car']).default('bus'),
  capacity: z.number().int().min(1).max(100).default(20),
});
export const updateVehicleSchema = vehicleSchema
  .extend({ status: z.enum(['active', 'inactive']) })
  .partial();

export const stopSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lat: coordinate(-90, 90).optional(),
  lng: coordinate(-180, 180).optional(),
});

export const routeSchema = z
  .object({
    /** Free text — Arabic, English, digits, a nickname. Left out, the API writes it. */
    name: z.string().trim().min(1).max(120).optional(),
    direction: z.enum(['to_school', 'to_home']),
    defaultVehicleId: z.uuid(),
    defaultDriverId: z.uuid(),
    plannedStart: hhmm,
    plannedEnd: hhmm,
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([7, 1, 2, 3, 4]),
    stops: z.array(stopSchema).max(60).default([]),
  })
  .refine((r) => r.plannedStart < r.plannedEnd, {
    path: ['plannedEnd'],
    message: 'end_before_start',
  });

export const updateRouteSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultVehicleId: z.uuid().optional(),
  defaultDriverId: z.uuid().optional(),
  plannedStart: hhmm.optional(),
  plannedEnd: hhmm.optional(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const routeStudentsSchema = z.object({
  assignments: z.array(z.object({ studentId: z.uuid(), stopId: z.uuid() })).max(200),
});

export const addMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(['org_admin', 'driver', 'attendant']),
});

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_format');

/** One tap recorded on the driver's device, possibly while offline (PLAN §6.2, §11). */
export const tripEventInputSchema = z
  .object({
    clientEventId: z.string().min(8).max(64),
    studentId: z.uuid(),
    type: z.enum(['board', 'alight', 'absent', 'undo']),
    /** For `undo`: the clientEventId of the tap being undone. */
    undoesClientEventId: z.string().min(8).max(64).optional(),
    clientRecordedAt: z.iso.datetime({ offset: true }),
    lat: coordinate(-90, 90).optional(),
    lng: coordinate(-180, 180).optional(),
    accuracyM: z.number().min(0).max(100_000).optional(),
  })
  .refine((e) => (e.type === 'undo') === (e.undoesClientEventId !== undefined), {
    path: ['undoesClientEventId'],
    message: 'undo_target_required',
  });
export type TripEventInput = z.infer<typeof tripEventInputSchema>;

export const tripEventsBatchSchema = z.object({
  events: z.array(tripEventInputSchema).min(1).max(500),
});

export const heartbeatSchema = z.object({
  state: z.enum(['foreground', 'app_backgrounded']).default('foreground'),
});

export const endTripSchema = z.union([
  z.object({ confirmEmpty: z.literal(true) }),
  z.object({ force: z.literal(true), reason: z.string().trim().min(5).max(500) }),
]);

export const addTripStudentSchema = z.object({ studentId: z.uuid() });

// ─── Phase 3: alerts ─────────────────────────────────────────────────────────

/** Why an alert was closed (PLAN §7). "other" needs a note. */
export const RESOLUTION_REASONS = [
  'found_on_vehicle_and_alighted',
  'alighted_earlier_unrecorded',
  'picked_up_by_guardian',
  'never_boarded',
  'trip_ended_safely',
  'false_alarm',
  'other',
] as const;

export const resolveAlertSchema = z
  .object({
    reason: z.enum(RESOLUTION_REASONS),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.reason !== 'other' || (v.note && v.note.length >= 5), {
    path: ['note'],
    message: 'note_required',
  });

// ─── Phase 5: optional TOTP (PLAN §5.1) ─────────────────────────────────────

export const totpSetupSchema = z.object({ password: z.string().max(128) });
export const totpEnableSchema = z.object({ code: codeSchema });
export const totpDisableSchema = z.object({ password: z.string().max(128), code: codeSchema });
