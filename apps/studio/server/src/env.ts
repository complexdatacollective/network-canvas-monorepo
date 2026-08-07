/* oxlint-disable no-process-env -- the single sanctioned environment boundary
 * for the Studio server; everything else imports from here. */

export type StudioEnv = {
  port: number;
  host: string;
};

export function readEnv(): StudioEnv {
  const rawPort = process.env.PORT;
  const port = rawPort == null || rawPort === '' ? 3000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(rawPort)}`);
  }

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
  };
}
