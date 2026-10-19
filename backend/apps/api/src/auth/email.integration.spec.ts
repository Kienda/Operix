import { beforeEach, describe, expect, it, vi } from 'vitest';
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), verify: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport: () => smtp }));
vi.mock('../platform/logger', () => ({ logEvent: vi.fn() }));
vi.mock('../platform/delegation', () => ({ assertDelegable: vi.fn(), OWNER_ROLE_KEYS: [] }));
vi.mock('../platform/config', () => ({
  config: () => ({
    production: true,
    appUrl: 'https://operix.test',
    inviteLinkInResponse: false,
    mail: {
      driver: 'smtp',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'mock@operix.test',
      password: 'mock-only',
      from: 'Operix <sender@operix.test>',
    },
  }),
}));
import { AuthService } from './auth.service';
import { MailService } from '../platform/mail.service';

describe('password reset integration through mocked SMTP', () => {
  const db = {
    user: { findUnique: vi.fn() },
    passwordResetToken: { create: vi.fn(), updateMany: vi.fn() },
    invitation: { create: vi.fn(), updateMany: vi.fn() },
    role: { findFirst: vi.fn() },
    organizationUser: { findFirst: vi.fn() },
    organization: { findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const auth = () => new AuthService(db as never, {} as never, new MailService());
  beforeEach(() => {
    vi.resetAllMocks();
    db.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'controlled@operix.test',
      status: 'ACTIVE',
    });
    db.$transaction.mockResolvedValue([]);
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    smtp.sendMail.mockResolvedValue({ accepted: ['controlled@operix.test'], rejected: [] });
  });
  it('returns success only after SMTP acceptance, storing only the token hash', async () => {
    await expect(auth().forgotPassword('controlled@operix.test')).resolves.toEqual({
      success: true,
    });
    const data = db.passwordResetToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(smtp.sendMail).toHaveBeenCalledOnce();
    expect(smtp.sendMail.mock.calls[0][0].text).not.toContain(data.tokenHash);
  });
  it('invalidates the new token and fails when SMTP rejects delivery', async () => {
    smtp.sendMail.mockRejectedValue(new Error('provider-private-data'));
    await expect(auth().forgotPassword('controlled@operix.test')).rejects.toThrow(
      'Email could not be delivered',
    );
    expect(db.passwordResetToken.updateMany).toHaveBeenLastCalledWith({
      where: { tokenHash: expect.any(String), usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });
  it('returns a generic response for unknown accounts without sending', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(auth().forgotPassword('unknown@operix.test')).resolves.toEqual({ success: true });
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });
  it('fails invitations and revokes the new link on SMTP failure', async () => {
    db.$transaction.mockImplementation(async (work) => work(db));
    db.role.findFirst.mockResolvedValue({ id: 'role-1', name: 'Employee' });
    db.organizationUser.findFirst.mockResolvedValue(null);
    db.organization.findUniqueOrThrow.mockResolvedValue({ name: 'Test organization' });
    db.invitation.create.mockResolvedValue({ id: 'invite-1', email: 'controlled@operix.test' });
    smtp.sendMail.mockRejectedValue(new Error('provider failure'));
    await expect(
      auth().createInvitation({ organizationId: 'org-1', userId: 'owner-1' } as never, {
        email: 'controlled@operix.test',
        roleId: 'role-1',
      }),
    ).rejects.toThrow('Email could not be delivered');
    expect(db.invitation.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'invite-1', acceptedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
