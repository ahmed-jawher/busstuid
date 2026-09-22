import type { EmailCodePurpose, Locale } from '@wusool/shared';
import type { EmailMessage } from './email.provider';

// Bilingual code emails: recipient's language first, the other one below (PLAN §5.1).

const COPY: Record<EmailCodePurpose, Record<Locale, { subject: string; intro: string }>> = {
  verify_email: {
    ar: {
      subject: 'رمز تأكيد بريدك في طمّني',
      intro: 'استخدم هذا الرمز لتأكيد بريدك الإلكتروني:',
    },
    en: {
      subject: 'Your Tammeni verification code',
      intro: 'Use this code to verify your email:',
    },
  },
  reset_password: {
    ar: {
      subject: 'رمز إعادة تعيين كلمة المرور',
      intro: 'استخدم هذا الرمز لإعادة تعيين كلمة المرور:',
    },
    en: { subject: 'Your password reset code', intro: 'Use this code to reset your password:' },
  },
  change_email: {
    ar: {
      subject: 'رمز تأكيد البريد الجديد',
      intro: 'استخدم هذا الرمز لتأكيد بريدك الإلكتروني الجديد:',
    },
    en: {
      subject: 'Confirm your new email',
      intro: 'Use this code to confirm your new email address:',
    },
  },
};

const FOOTER = {
  ar: 'الرمز صالح لمدة 10 دقائق. إن لم تطلب هذا الرمز فتجاهل الرسالة.',
  en: 'The code is valid for 10 minutes. If you did not request it, ignore this email.',
};

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function codeEmail(
  to: string,
  purpose: EmailCodePurpose,
  code: string,
  locale: Locale,
): EmailMessage {
  const order: Locale[] = locale === 'ar' ? ['ar', 'en'] : ['en', 'ar'];
  const first = COPY[purpose][order[0]!];

  const text = order
    .map((l) => `${COPY[purpose][l].intro}\n\n${code}\n\n${FOOTER[l]}`)
    .join('\n\n———\n\n');

  const section = (l: Locale) => `
    <div dir="${l === 'ar' ? 'rtl' : 'ltr'}" lang="${l}" style="margin:0 0 24px">
      <p style="margin:0 0 12px;font-size:16px">${escape(COPY[purpose][l].intro)}</p>
      <p style="margin:0 0 12px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
      <p style="margin:0;font-size:13px;color:#5b5b5b">${escape(FOOTER[l])}</p>
    </div>`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#161616">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
    <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#ce1126">طمّني · Tammeni</p>
    ${order.map(section).join('<hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 24px">')}
  </div></body></html>`;

  return { to, subject: first.subject, text, html };
}
