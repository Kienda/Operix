import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  verify: vi.fn(),
  createTransport: vi.fn(),
  logEvent: vi.fn(),
  mail: {
    driver: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'mock@operix.test',
    password: 'never-log-this',
    from: 'Operix <sender@operix.test>',
  },
}));
vi.mock('nodemailer', () => ({ createTransport: mocks.createTransport }));
vi.mock('./config', () => ({ config: () => ({ production: true, mail: mocks.mail }) }));
vi.mock('./logger', () => ({ logEvent: mocks.logEvent }));
import { MailService, actionMail } from './mail.service';

const message = {
  to: 'controlled@operix.test',
  subject: 'Test',
  category: 'test',
  ...actionMail({
    heading: 'Test',
    intro: '<unsafe>',
    action: 'Open',
    url: 'https://operix.test/#token=private-token',
    footer: 'Test only',
  }),
};

describe('SMTP transport boundary (no network)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mail.driver = 'smtp';
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify });
    mocks.sendMail.mockResolvedValue({ accepted: [message.to], rejected: [] });
  });
  it('requires STARTTLS, certificate validation, bounded timeouts and disables SMTP debugging', async () => {
    await new MailService().send(message);
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
        socketTimeout: 30000,
        logger: false,
        debug: false,
      }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: mocks.mail.from, to: message.to }),
    );
  });
  it.each([
    { accepted: [], rejected: [message.to] },
    { accepted: [message.to], rejected: [message.to] },
  ])('rejects provider refusal', async (result) => {
    mocks.sendMail.mockResolvedValue(result);
    await expect(new MailService().send(message)).rejects.toThrow('Email could not be delivered');
  });
  it('never logs provider errors, credentials, or bearer links', async () => {
    mocks.sendMail.mockRejectedValue(new Error('never-log-this private-token AUTH credentials'));
    await expect(new MailService().send(message)).rejects.toThrow('Email could not be delivered');
    const logs = JSON.stringify(mocks.logEvent.mock.calls);
    expect(logs).toContain('mail_failed');
    expect(logs).not.toMatch(/never-log-this|private-token|AUTH credentials/);
  });
  it('checks connectivity without sending', async () => {
    await new MailService().verify();
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it('sanitizes connectivity failures', async () => {
    mocks.verify.mockRejectedValue(new Error('never-log-this'));
    await expect(new MailService().verify()).rejects.toThrow('SMTP connectivity check failed');
    expect(JSON.stringify(mocks.logEvent.mock.calls)).not.toContain('never-log-this');
  });
  it('rejects disabled delivery', async () => {
    mocks.mail.driver = 'disabled';
    await expect(new MailService().send(message)).rejects.toThrow('not configured');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
  it('escapes HTML values', () => expect(message.html).toContain('&lt;unsafe&gt;'));
});
