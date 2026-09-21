export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Replaceable email transport (PLAN §5.1). SMTP covers the local mail catcher in development
 * and any production provider (Brevo, Resend, SES…) through `.env` settings only.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
