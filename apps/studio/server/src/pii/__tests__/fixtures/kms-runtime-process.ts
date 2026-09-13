import { once } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

// An isolated process exercises the real SDK's ambient configuration readers.
// Metadata and intercepted KMS requests can reach only this synthetic loopback
// fixture. The native HTTP handler still writes and parses the provider request.
const metadataRequests: string[] = [];
let providerReceived = 0;
const metadata = http.createServer((request, response) => {
  if (request.headers['x-amz-target'] === 'TrentService.Decrypt') {
    providerReceived++;
    request.resume();
    response.writeHead(403, { 'content-type': 'application/x-amz-json-1.1' });
    response.end(
      '{"__type":"AccessDeniedException","message":"synthetic-refusal"}',
    );
    return;
  }
  metadataRequests.push(`${request.method} ${request.url}`);
  response.end(
    request.url === '/latest/api/token' ? 'synthetic-token' : 'us-east-1',
  );
});
metadata.listen(0, '127.0.0.1');
await once(metadata, 'listening');
const address = metadata.address();
if (!address || typeof address === 'string')
  throw new Error('Expected a loopback fixture address.');
/* oxlint-disable-next-line node/no-process-env -- isolated test process configures its own synthetic metadata endpoint */
process.env.AWS_EC2_METADATA_SERVICE_ENDPOINT = `http://127.0.0.1:${address.port}`;

const providerRequests: {
  host: string | undefined;
  signedByFixture: boolean;
  ambientHeaderNames: string[];
}[] = [];
const originalRequest = https.request;
https.request = (
  options: string | URL | https.RequestOptions,
  callback?: ((response: http.IncomingMessage) => void) | https.RequestOptions,
  secondCallback?: (response: http.IncomingMessage) => void,
) => {
  if (typeof options === 'string' || options instanceof URL)
    throw new Error('Expected the native SDK HTTP handler options.');
  const headers: [string, unknown][] = Object.entries(options.headers ?? {});
  providerRequests.push({
    host: options.host ?? undefined,
    signedByFixture: String(
      headers.find(([name]) => name === 'authorization')?.[1],
    ).startsWith('AWS4-HMAC-SHA256 Credential=AKIA0000000000000000/'),
    ambientHeaderNames: headers
      .filter(([, value]) => String(value).includes('ambient-canary'))
      .map(([name]) => name.toLowerCase())
      .toSorted(),
  });
  return http.request(
    {
      ...options,
      protocol: 'http:',
      host: '127.0.0.1',
      hostname: '127.0.0.1',
      port: address.port,
      agent: false,
    },
    typeof callback === 'function' ? callback : secondCallback,
  );
};
syncBuiltinESMExports();

try {
  const { createAwsKmsRootKeyLoader } = await import('../../aws-kms.ts');
  const load = createAwsKmsRootKeyLoader({
    keyArn:
      'arn:aws:kms:us-east-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    deployment: 'studio-staging',
    credentials: {
      accessKeyId: 'AKIA0000000000000000',
      secretAccessKey: 'synthetic-kms-runtime-fixture-only',
    },
    encryptedRoots: {
      STUDIO_ENCRYPTION_ROOT_CURRENT: Buffer.alloc(192, 37).toString('base64'),
    },
  });
  let outcome = 'unexpected-success';
  try {
    await load('STUDIO_ENCRYPTION_ROOT_CURRENT');
  } catch (error) {
    outcome = error instanceof Error ? error.name : 'unexpected-error';
  }
  process.stdout.write(
    `${JSON.stringify({ metadataRequests, providerRequests, providerReceived, outcome })}\n`,
  );
} finally {
  https.request = originalRequest;
  syncBuiltinESMExports();
  metadata.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    metadata.close((error) => (error ? reject(error) : resolve())),
  );
}
