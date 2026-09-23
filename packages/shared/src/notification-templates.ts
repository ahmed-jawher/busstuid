import type { Locale } from './enums';

// Bilingual notification texts (PLAN §8), chosen by the recipient's language.

export const NOTIFICATION_TEMPLATES = [
  'boarded',
  'alighted',
  'absent',
  'student_left_onboard',
  'trip_overdue',
  'driver_device_silent',
  'unexpected_student',
  'resolved',
  'enrollment_approved',
  'enrollment_rejected',
  'enrollment_reopened',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/** Routine templates a guardian may mute. Alerts can never be muted (PLAN §8). */
export const ROUTINE_TEMPLATES: readonly NotificationTemplate[] = ['boarded', 'alighted', 'absent'];

export interface TemplateData {
  student?: string;
  vehicle?: string;
  stop?: string;
  time?: string;
  tripName?: string;
  driverPhone?: string;
  minutesLate?: number;
  /** Set from escalation level 2 on (PLAN §7: minute 10). */
  emergencyNumber?: string;
  /** School, company or independent driver (link-request decisions). */
  organization?: string;
}

type Render = (d: TemplateData) => { title: string; body: string };

const TEMPLATES: Record<NotificationTemplate, Record<Locale, Render>> = {
  boarded: {
    ar: (d) => ({
      title: 'طمّني',
      body: `✅ صعد ${d.student} إلى ${d.vehicle} الساعة ${d.time}`,
    }),
    en: (d) => ({
      title: 'Tammeni',
      body: `✅ ${d.student} boarded ${d.vehicle} at ${d.time}`,
    }),
  },
  alighted: {
    ar: (d) => ({ title: 'طمّني', body: `🏫 نزل ${d.student} عند ${d.stop} الساعة ${d.time}` }),
    en: (d) => ({
      title: 'Tammeni',
      body: `🏫 ${d.student} got off at ${d.stop} at ${d.time}`,
    }),
  },
  absent: {
    ar: (d) => ({
      title: 'طمّني',
      body: `📋 سجّل السائق ${d.student} غائباً عن رحلة ${d.tripName}`,
    }),
    en: (d) => ({
      title: 'Tammeni',
      body: `📋 The driver marked ${d.student} absent from ${d.tripName}`,
    }),
  },
  student_left_onboard: {
    ar: (d) => ({
      title: '🚨 عاجل',
      body: `🚨 عاجل: ${d.student} مسجّل على ${d.vehicle} ولم يُسجَّل نزوله بعد انتهاء الرحلة. جوال السائق: ${d.driverPhone}`,
    }),
    en: (d) => ({
      title: '🚨 Urgent',
      body: `🚨 Urgent: ${d.student} is recorded on ${d.vehicle} and was not recorded getting off after the trip ended. Driver: ${d.driverPhone}`,
    }),
  },
  trip_overdue: {
    ar: (d) => ({
      title: '⚠️ رحلة متأخرة',
      body: d.student
        ? `⚠️ رحلة ${d.tripName} لم تنتهِ بعد و${d.student} ما زال مسجّلاً على ${d.vehicle}. جوال السائق: ${d.driverPhone}`
        : `⚠️ رحلة ${d.tripName} (${d.vehicle}) تجاوزت وقت انتهائها بـ ${d.minutesLate} دقيقة ولم تُنهَ.`,
    }),
    en: (d) => ({
      title: '⚠️ Trip overdue',
      body: d.student
        ? `⚠️ ${d.tripName} has not ended and ${d.student} is still recorded on ${d.vehicle}. Driver: ${d.driverPhone}`
        : `⚠️ ${d.tripName} (${d.vehicle}) is ${d.minutesLate} minutes past its planned end and was not ended.`,
    }),
  },
  driver_device_silent: {
    ar: (d) => ({
      title: '⚠️ انقطع جهاز السائق',
      body: `⚠️ لا إشارة من جهاز سائق ${d.vehicle} منذ أكثر من 10 دقائق وفي الرحلة طلاب على المركبة. جوال السائق: ${d.driverPhone}`,
    }),
    en: (d) => ({
      title: '⚠️ Driver device silent',
      body: `⚠️ No signal from the driver's device on ${d.vehicle} for over 10 minutes while children are on board. Driver: ${d.driverPhone}`,
    }),
  },
  unexpected_student: {
    ar: (d) => ({
      title: 'طمّني',
      body: `ℹ️ أُضيف ${d.student} إلى رحلة ${d.tripName} وهو غير مسجّل فيها.`,
    }),
    en: (d) => ({
      title: 'Tammeni',
      body: `ℹ️ ${d.student} was added to ${d.tripName} without being on its list.`,
    }),
  },
  resolved: {
    ar: (d) => ({ title: 'طمّني', body: `✔️ تم التأكد من سلامة ${d.student}` }),
    en: (d) => ({ title: 'Tammeni', body: `✔️ ${d.student} has been confirmed safe` }),
  },
  enrollment_approved: {
    ar: (d) => ({
      title: 'طمّني',
      body: `🔗 قبلت ${d.organization} طلب ربط ${d.student}. ستصلك إشعارات رحلاته من الآن.`,
    }),
    en: (d) => ({
      title: 'Tammeni',
      body: `🔗 ${d.organization} accepted ${d.student}'s link request. You will get trip notifications from now on.`,
    }),
  },
  enrollment_rejected: {
    ar: (d) => ({ title: 'طمّني', body: `رفضت ${d.organization} طلب ربط ${d.student}.` }),
    en: (d) => ({
      title: 'Tammeni',
      body: `${d.organization} declined ${d.student}'s link request.`,
    }),
  },
  enrollment_reopened: {
    ar: (d) => ({
      title: 'طمّني',
      body: `⚠️ تراجعت ${d.organization} عن قرارها في طلب ربط ${d.student}. الطلب بانتظار الموافقة مجدداً ولن تصلك إشعارات الرحلات حتى الموافقة.`,
    }),
    en: (d) => ({
      title: 'Tammeni',
      body: `⚠️ ${d.organization} reversed its decision on ${d.student}'s link request. It is waiting for approval again, and trip notifications stop until then.`,
    }),
  },
};

const EMERGENCY = {
  ar: (n: string) => ` — إن لم تتمكن من الوصول للسائق اتصل بالطوارئ ${n}`,
  en: (n: string) => ` — if you cannot reach the driver, call emergency ${n}`,
};

export function renderNotification(
  template: NotificationTemplate,
  data: TemplateData,
  locale: Locale,
): { title: string; body: string } {
  const out = TEMPLATES[template][locale](data);
  return data.emergencyNumber
    ? { ...out, body: out.body + EMERGENCY[locale](data.emergencyNumber) }
    : out;
}
