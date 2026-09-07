import { createMailer } from '../../../auth/email.ts';
import { createMaintenancePool } from '../../../db/pool.ts';
import { startAuditAlertWorker } from '../../alert-delivery.ts';

// This isolated child runs the production worker and SMTP transport. Tests kill
// it at observed protocol/durable-state boundaries, without a shutdown handler.
/* oxlint-disable node/no-process-env -- synthetic process fixture boundary */
const databaseUrl = process.env.STUDIO_ALERT_TEST_DATABASE_URL;
const smtpUrl = process.env.STUDIO_ALERT_TEST_SMTP_URL;
/* oxlint-enable node/no-process-env */
if (!databaseUrl || !smtpUrl)
  throw new Error('Missing synthetic fixture inputs');

const pool = createMaintenancePool({ url: databaseUrl });
const mailer = createMailer({
  kind: 'smtp',
  url: smtpUrl,
  from: 'Studio <sender@example.test>',
});
startAuditAlertWorker({
  pool,
  mailer,
  publicBaseUrl: 'https://studio.example.test',
  leaseMs: 600,
  retryBaseMs: 0,
  retryMaxMs: 0,
  pollIntervalMs: 60_000,
  drainLimit: 1,
  observer: (event) => {
    process.send?.(event);
  },
});
// The real host's HTTP/IPC lifecycle keeps a worker process alive. Keep this
// focused fixture alive between attempts until the test sends SIGKILL.
setInterval(() => undefined, 60_000);
