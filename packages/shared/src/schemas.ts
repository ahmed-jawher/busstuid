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
