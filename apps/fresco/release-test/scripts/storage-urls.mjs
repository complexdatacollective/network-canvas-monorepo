#!/usr/bin/env node
// Presigned URLs into a lane's bundled Garage, for the in-app browser.
//
// Garage has no anonymous bucket access, so nothing in the bucket can be
// fetched or written by an unsigned URL. Instead the host signs one URL per
// object with the lane's fixed test key, exactly as Fresco signs the URLs its
// own uploads use, and the page under test fetches or PUTs through it. The
// bucket's CORS rule (garage-init, GARAGE_CORS_ORIGIN in the compose file)
// admits the lane's app origin, which is where that page runs.
//
//   storage-urls.mjs stage   --lane <lane> --file <path> --name <object name>
//     Uploads the file to _fixtures/<name> and prints a presigned GET URL.
//   storage-urls.mjs capture --lane <lane> --name <object name>
//     Prints {"putUrl","getUrl"} for _captures/<name>, as one JSON line.
//
// Invoked through stage-fixture.sh and enable-captures.sh, which own the
// command lines the workflow prompts and AGENT_NOTES.md document.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { lane, STORAGE } from './lanes.mjs';

// Long enough to outlast a whole run: the upgrade lane signs its baseline
// capture well before it uses it.
const EXPIRES_IN_SECONDS = 12 * 60 * 60;

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

if (!values.lane || !values.name || (mode === 'stage' && !values.file)) {
  throw new Error(
    'usage: storage-urls.mjs stage --lane <lane> --file <path> --name <name> | capture --lane <lane> --name <name>',
  );
}

// The host reaches the lane's Garage on its published port, which is also the
// wizard's Public URL — so a URL signed here is one the browser can use.
const client = new S3Client({
  endpoint: `http://localhost:${lane(values.lane).storagePort}`,
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
} else {
  throw new Error(`unknown mode "${mode}" — expected stage or capture`);
}
