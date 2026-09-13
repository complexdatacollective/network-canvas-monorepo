import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { managedAnchorDynamoClientConfiguration } from './observability-anchor-dynamodb-client.mjs';
import { readManagedAnchorEnvironment } from './observability-anchor-runtime-config.mjs';
import { createDynamoAnchorStore } from './observability-dynamodb-anchor-store.mjs';
import {
  createMonotonicAnchorHandler,
  fixedBearerAuthenticator,
} from './observability-monotonic-anchor.mjs';
import { createMonthAuthorizationVerifier } from './observability-month-authorization.mjs';

const MAX_BODY_BYTES = 16_384;
const MAX_HEADER_BYTES = 16_384;
const MAX_HEADERS = 64;
const PATHS = new Set([
  '/v1/read',
  '/v1/initialize',
  '/v1/advance',
  '/v1/advance-month',
]);

const response = (statusCode, code) => ({
  statusCode,
  headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
  isBase64Encoded: false,
  body: JSON.stringify({ code }),
});

function decodedBody(event) {
  if (typeof event.body !== 'string') throw new Error();
  if (event.isBase64Encoded === true) {
    if (
      event.body.length > 4 * Math.ceil(MAX_BODY_BYTES / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        event.body,
      )
    )
      throw new Error();
    const body = Buffer.from(event.body, 'base64');
    if (body.byteLength > MAX_BODY_BYTES) throw new Error();
    return body;
  }
  if (event.isBase64Encoded !== false) throw new Error();
  const body = Buffer.from(event.body, 'utf8');
  if (body.byteLength > MAX_BODY_BYTES) throw new Error();
  return body;
}

function normalizedHeaders(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new Error();
  const headers = new Headers();
  const names = new Set();
  let size = 0;
  for (const [rawName, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== 'string') throw new Error();
    const name = rawName.toLowerCase();
    if (names.has(name) || name.length > 128 || rawValue.length > 8192)
      throw new Error();
    names.add(name);
    size += Buffer.byteLength(name) + Buffer.byteLength(rawValue);
    if (names.size > MAX_HEADERS || size > MAX_HEADER_BYTES) throw new Error();
    headers.set(name, rawValue);
  }
  const authorization = headers.get('authorization');
  if (!authorization || authorization.includes(',')) throw new Error();
  return headers;
}

export function createManagedAnchorLambda({
  env,
  dynamoClient,
  DynamoDBClientClass = DynamoDBClient,
  now = Date.now,
}) {
  const configuration = readManagedAnchorEnvironment(env);
  const client =
    dynamoClient ??
    new DynamoDBClientClass(
      managedAnchorDynamoClientConfiguration(configuration.region),
    );
  const anchor = createMonotonicAnchorHandler({
    now,
    accountIdentitySha256: configuration.accountIdentitySha256,
    authenticate: fixedBearerAuthenticator(configuration),
    authorizeMonth: createMonthAuthorizationVerifier({
      accountIdentitySha256: configuration.accountIdentitySha256,
      authorityKeyId: configuration.authorityKeyId,
      authorityPublicKey: configuration.authorityPublicKey,
      now,
    }),
    store: createDynamoAnchorStore({
      accountIdentitySha256: configuration.accountIdentitySha256,
      client,
      tableName: configuration.tableName,
    }),
  });
  return async (event) => {
    try {
      if (
        event === null ||
        typeof event !== 'object' ||
        event.version !== '2.0' ||
        event.requestContext?.http?.method !== 'POST' ||
        typeof event.rawPath !== 'string' ||
        !PATHS.has(event.rawPath) ||
        (event.rawQueryString ?? '') !== '' ||
        (event.requestContext.http.path !== undefined &&
          event.requestContext.http.path !== event.rawPath)
      )
        return response(400, 'ANCHOR_INPUT_INVALID');
      const body = decodedBody(event);
      const headers = normalizedHeaders(event.headers);
      const declared = headers.get('content-length');
      if (
        declared !== null &&
        (!/^\d{1,5}$/.test(declared) || Number(declared) !== body.byteLength)
      )
        return response(400, 'ANCHOR_INPUT_INVALID');
      const result = await anchor(
        new Request(`https://anchor.invalid${event.rawPath}`, {
          method: 'POST',
          headers,
          body,
        }),
      );
      return {
        statusCode: result.status,
        headers: Object.fromEntries(result.headers.entries()),
        isBase64Encoded: false,
        body: await result.text(),
      };
    } catch {
      return response(400, 'ANCHOR_INPUT_INVALID');
    }
  };
}

let production;

export async function handler(event) {
  try {
    production ??= createManagedAnchorLambda({ env: process.env });
    return await production(event);
  } catch {
    return response(503, 'ANCHOR_INTERNAL_FAILURE');
  }
}
