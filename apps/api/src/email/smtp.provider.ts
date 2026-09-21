import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/env';
import type { EmailMessage, EmailProvider } from './email.provider';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(private readonly config: AppConfig) {
    const { host, port, secure, user, password } = config.smtp;
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
      // The local catcher has no TLS; real providers negotiate STARTTLS when offered.
      ignoreTLS: config.nodeEnv !== 'production' && host === '127.0.0.1',
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.mailFrom, ...message });
  }
}
