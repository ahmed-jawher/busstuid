import { z } from 'zod';
import { COUNTRIES, EMAIL_CODE_PURPOSES, LOCALES, ORGANIZATION_TYPES } from './enums';
import { normalizePhone } from './phone';

// Request schemas shared by the API (validation) and the web app (forms). PLAN §5.1, §11.

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Length only; the API additionally rejects common and personal passwords. */
export const passwordSchema = z.string().min(8, 'password_too_short').max(128, 'password_too_long');

export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'code_format');

export const nameSchema = z.string().trim().min(2).max(100);

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
    fullNameEn: nameSchema.optional(),
    ...phoneFields,
    locale: z.enum(LOCALES).default('ar'),
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

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().max(128),
  deviceInfo,
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

export const changeEmailSchema = z.object({ newEmail: emailSchema, password: z.string().max(128) });
export const confirmEmailChangeSchema = z.object({ code: codeSchema });
export const deleteAccountSchema = z.object({ password: z.string().max(128) });

export const createOrganizationSchema = z.object({
  type: z.enum(ORGANIZATION_TYPES),
  nameAr: nameSchema,
  nameEn: nameSchema.optional(),
  country: countrySchema,
});

export const driverLookupSchema = z.object({ ...phoneFields }).transform(withNormalizedPhone);

export const directoryQuerySchema = z.object({
  country: countrySchema,
  type: z.enum(['school', 'transport_company']).optional(),
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
  organizationId: z.uuid(),
  // Multipart sends strings; consent must be an explicit "true" (PLAN §14).
  consent: z.literal('true', { error: 'consent_required' }),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const enrollSchema = z.object({ organizationId: z.uuid() });

export const decisionSchema = z.object({ note: z.string().trim().max(500).optional() });

export const pushSubscriptionSchema = z.object({
  provider: z.literal('webpush'),
  platform: z.literal('web'),
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  userAgent: z.string().max(300).optional(),
});

export const emailCodePurposeSchema = z.enum(EMAIL_CODE_PURPOSES);

// ─── Phase 2: organisation setup and trips ──────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_format');
const coordinate = (min: number, max: number) => z.number().min(min).max(max);

export const vehicleSchema = z.object({
  plateNumber: z.string().trim().min(2).max(20),
  type: z.enum(['bus', 'van', 'car']),
  capacity: z.number().int().min(1).max(100),
});
export const updateVehicleSchema = vehicleSchema
  .extend({ status: z.enum(['active', 'inactive']) })
  .partial();

export const stopSchema = z.object({
  name: z.string().trim().min(2).max(120),
  lat: coordinate(-90, 90).optional(),
  lng: coordinate(-180, 180).optional(),
});

export const routeSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    direction: z.enum(['to_school', 'to_home']),
    defaultVehicleId: z.uuid(),
    defaultDriverId: z.uuid(),
    plannedStart: hhmm,
    plannedEnd: hhmm,
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    stops: z.array(stopSchema).min(1).max(60),
  })
  .refine((r) => r.plannedStart < r.plannedEnd, {
    path: ['plannedEnd'],
    message: 'end_before_start',
  });

export const updateRouteSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
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
