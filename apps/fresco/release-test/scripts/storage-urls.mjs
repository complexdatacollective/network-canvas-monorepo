#!/usr/bin/env node
// Presigned URLs into a lane's bundled Garage, for the in-app browser.
//
// Garage has no anonymous bucket access, so nothing in the bucket can be
// fetched or written by an unsigned URL. Instead the host signs one URL per
// object with the lane's fixed test key, exactly as Fresco signs the URLs its
// own uploads use, and the page under test fetches or PUTs through it. The
// bucket's CORS rule, which up.sh sets through `cors`, admits the lane's app
// origin, which is where that page runs.
//
//   storage-urls.mjs stage   --lane <lane> --file <path> --name <object name>
//     Uploads the file to _fixtures/<name> and prints a presigned GET URL.
//   storage-urls.mjs capture --lane <lane> --name <object name>
//     Prints {"putUrl","getUrl"} for _captures/<name>, as one JSON line.
//   storage-urls.mjs cors    --lane <lane>
//     Admits the lane's app origin to the bucket. The app and storage are on
//     different ports, so every presigned request from the page is
//     cross-origin; a deployment behind Traefik serves both on one origin and
//     needs no rule.
//
// stage and capture are invoked through stage-fixture.sh and
// enable-captures.sh, which own the command lines the workflow prompts and
// AGENT_NOTES.md document.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  GetObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { lane, STORAGE } from './lanes.mjs';

// Long enough to outlast a whole run: the upgrade lane signs its baseline
// capture well before it uses it.
const EXPIRES_IN_SECONDS = 12 * 60 * 60;

// Garage creates the bucket as it starts, so it can still be missing just
// after the container is up.
const CORS_MAX_ATTEMPTS = 30;
const CORS_INTERVAL_MS = 1000;

const [mode, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    lane: { type: 'string' },
    file: { type: 'string' },
    name: { type: 'string' },
  },
  strict: true,
});

if (
  !values.lane ||
  (mode !== 'cors' && !values.name) ||
  (mode === 'stage' && !values.file)
) {
  throw new Error(
    'usage: storage-urls.mjs stage --lane <lane> --file <path> --name <name> | capture --lane <lane> --name <name> | cors --lane <lane>',
  );
}

const { storagePort, baseUrl } = lane(values.lane);

// The host reaches the lane's Garage on its published port, which is also the
// wizard's Public URL — so a URL signed here is one the browser can use.
const client = new S3Client({
  endpoint: `http://localhost:${storagePort}`,
  region: STORAGE.region,
  credentials: {
    accessKeyId: STORAGE.accessKeyId,
    secretAccessKey: STORAGE.secretAccessKey,
  },
  forcePathStyle: true,
  // Mirrors Fresco's createS3Client: the SDK's default checksum on a
  // presigned PUT covers an empty body, and Garage rejects the real upload
  // as InvalidDigest.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const object = (prefix) => ({
  Bucket: STORAGE.bucket,
  Key: `${prefix}/${values.name}`,
});
const sign = (command) =>
  getSignedUrl(client, command, { expiresIn: EXPIRES_IN_SECONDS });

if (mode === 'stage') {
  const key = object('_fixtures');
  await client.send(
    new PutObjectCommand({
      ...key,
      Body: readFileSync(values.file),
      ContentType: 'application/octet-stream',
    }),
  );
  console.log(await sign(new GetObjectCommand(key)));
} else if (mode === 'capture') {
  const key = object('_captures');
  console.log(
    JSON.stringify({
      putUrl: await sign(new PutObjectCommand(key)),
      getUrl: await sign(new GetObjectCommand(key)),
    }),
  );
} else if (mode === 'cors') {
  const command = new PutBucketCorsCommand({
    Bucket: STORAGE.bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [baseUrl],
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });
  for (let attempt = 1; ; attempt++) {
    try {
      await client.send(command);
      break;
    } catch (error) {
      if (attempt >= CORS_MAX_ATTEMPTS)
        throw new Error(
          `bucket ${STORAGE.bucket} refused its CORS rule after ${CORS_MAX_ATTEMPTS} attempts`,
          { cause: error },
        );
      await new Promise((resolve) => setTimeout(resolve, CORS_INTERVAL_MS));
    }
  }
  console.log(
    `bucket ${STORAGE.bucket} admits browser requests from ${baseUrl}`,
  );
} else {
  throw new Error(`unknown mode "${mode}" — expected stage, capture or cors`);
}
