import 'reflect-metadata';
import { MailService } from '../platform/mail.service';

/** Operator-only. No recipient means connectivity only; delivery requires two matching values. */
async function main() {
  const recipient = process.env.SMTP_TEST_RECIPIENT;
  const confirmation = process.env.SMTP_TEST_CONFIRM_RECIPIENT;
  if (
    recipient &&
    (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) || recipient !== confirmation)
  )
    throw new Error(
      'Set matching SMTP_TEST_RECIPIENT and SMTP_TEST_CONFIRM_RECIPIENT to one controlled mailbox',
    );
  const mail = new MailService();
  await mail.verify();
  console.log('SMTP connectivity, authentication and TLS check passed');
  if (recipient) {
    await mail.send({
      to: recipient,
      category: 'staging_smtp_check',
      subject: 'Operix staging SMTP verification',
      text: 'Controlled Operix staging email test. No account action is required.',
      html: '<p>Controlled Operix staging email test. No account action is required.</p>',
    });
    console.log(
      'SMTP accepted the test. Confirm receipt, From address and authentication headers in the controlled mailbox.',
    );
  }
}
main().catch(() => {
  console.error('SMTP check failed; inspect sanitized mail events and runtime configuration');
  process.exitCode = 1;
});
