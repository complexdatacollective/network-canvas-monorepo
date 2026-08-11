/* oxlint-disable no-process-env -- the single sanctioned environment boundary
 * for the Studio server; everything else imports from here. */

export type S3Env = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type StudioEnv = {
  port: number;
  host: string;
  /**
   * Directory of built client assets to serve for the self-host topology,
   * resolved against the working directory. Unset means the production
   * default (`../client` relative to the server bundle — the Docker image
   * layout); in development the Vite dev server serves the client instead
   * and this path simply doesn't resolve.
   */
  clientDist: string | undefined;
  /**
   * Object storage (#1246, 2026-08-11): the S3 API is the contract — R2 in
   * the managed topology, MinIO or any S3-compatible endpoint self-hosted.
   * Undefined means asset storage is not configured and the asset routes
   * refuse with 503.
   */
  s3: S3Env | undefined;
};

// Must match scripts/dev-s3.ts, which provisions this MinIO in Docker.
const DEV_S3: S3Env = {
  endpoint: 'http://localhost:9100',
  region: 'us-east-1',
  bucket: 'studio-dev',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
};

function readS3(): S3Env | undefined {
  const values = {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
  const set = Object.values(values).filter(Boolean).length;
  if (set === 5) return values as S3Env;
  // Partial configuration is a deployment mistake, not a request for
  // defaults — fail fast rather than silently pointing at dev MinIO.
  if (set > 0) {
    const missing = Object.entries(values)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new Error(
      `Incomplete S3 configuration; missing: ${missing.join(', ')}`,
    );
  }
  return process.env.NODE_ENV === 'production' ? undefined : DEV_S3;
}

export function readEnv(): StudioEnv {
  const rawPort = process.env.PORT;
  const port = rawPort == null || rawPort === '' ? 3000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(rawPort)}`);
  }

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    clientDist: process.env.CLIENT_DIST || undefined,
    s3: readS3(),
  };
}
