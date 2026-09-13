import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

import { canonicalize } from '../../../../packages/studio-sync/src/apply.ts';
import { signMonthAuthorization } from './observability-month-authorization.mjs';

const FAILURE = 'ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED';
const MAX_FILE_BYTES = 16_384;

async function readPrivateFile(path) {
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    (before.mode & 0o077) !== 0 ||
    before.size <= 0 ||
    before.size > MAX_FILE_BYTES
  )
    throw new Error();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.mode !== before.mode ||
      opened.size !== before.size
    )
      throw new Error();
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) throw new Error();
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mode !== before.mode ||
      after.size !== before.size
    )
      throw new Error();
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writePrivateFile(path, bytes) {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function runMonthAuthorizationTool(args, now = Date.now()) {
  let inputBytes;
  let keyBytes;
  try {
    if (args.length !== 5 || args[0] !== 'issue') throw new Error();
    const [, inputPath, keyPath, authorityKeyId, outputPath] = args;
    inputBytes = await readPrivateFile(inputPath);
    keyBytes = await readPrivateFile(keyPath);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(inputBytes);
    const approval = JSON.parse(text);
    if (canonicalize(approval) !== text) throw new Error();
    const receipt = signMonthAuthorization({
      approval,
      authorityKeyId,
      key: keyBytes,
      now,
    });
    await writePrivateFile(outputPath, canonicalize(receipt));
    return JSON.stringify({
      authorityKeyId: receipt.authorityKeyId,
      expiresAt: receipt.approval.expiresAt,
      targetMonthUtc: receipt.approval.targetMonthUtc,
    });
  } catch {
    throw new Error(FAILURE);
  } finally {
    inputBytes?.fill(0);
    keyBytes?.fill(0);
  }
}
