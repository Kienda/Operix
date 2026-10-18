import { Global, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { config } from './config';
import { logEvent } from './logger';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Logged instead of the body, which may contain a bearer link. */
  category: string;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Minimal, accessible transactional layout; every interpolated value is escaped. */
export function actionMail(input: {
  heading: string;
  intro: string;
  action: string;
  url: string;
  footer: string;
}): Pick<OutgoingMail, 'text' | 'html'> {
  return {
    text: `${input.heading}\n\n${input.intro}\n\n${input.action}: ${input.url}\n\n${input.footer}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#0c1630">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:10px;padding:32px">
<tr><td><p style="margin:0 0 24px;font-weight:bold;font-size:18px">Operix</p>
<h1 style="font-size:20px;margin:0 0 12px">${escape(input.heading)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${escape(input.intro)}</p>
<p style="margin:0 0 24px"><a href="${escape(input.url)}" style="display:inline-block;background:#3157f5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escape(input.action)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#5b6478;margin:0">${escape(input.footer)}</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}

@Injectable()
export class MailService {
  private transport?: Transporter;

  private transporter() {
    const mail = config().mail;
    this.transport ??= createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      requireTLS: config().production,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });
    return this.transport;
  }

  /** Resolves only after the provider accepted the message. */
  async send(message: OutgoingMail): Promise<void> {
    const mail = config().mail;
    if (mail.driver === 'disabled')
      throw new ServiceUnavailableException('Email delivery is not configured');
    if (mail.driver === 'log') {
      // Development only: never log the body, which carries a one-time link.
      logEvent('info', 'mail_not_sent_log_driver', { to: message.to, category: message.category });
      return;
    }
    try {
      await this.transporter().sendMail({
        from: mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logEvent('info', 'mail_sent', { to: message.to, category: message.category });
    } catch (error) {
      logEvent('error', 'mail_failed', {
        to: message.to,
        category: message.category,
        reason: (error as Error).message,
      });
      throw new ServiceUnavailableException('Email could not be delivered; try again later');
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
