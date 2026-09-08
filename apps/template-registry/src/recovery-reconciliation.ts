import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { z } from 'zod';

import { normalizeMailbox } from '@codaco/studio-sync/email-sender';
import { templateBytesHash } from '@codaco/studio-sync/template-exchange';

const userId = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => value.isWellFormed() && !value.includes('\0'));

const reconciliationSchema = z
  .strictObject({
    format: z.literal('template-registry-recovery-reconciliation'),
    version: z.literal(1),
    users: z.array(
      z.strictObject({
        id: userId,
        email: z.email().max(254).transform(normalizeMailbox),
        emailVerified: z.literal(true),
        publisher: z.enum(['none', 'active', 'suspended']),
        operator: z.boolean(),
      }),
    ),
  })
  .superRefine((value, context) => {
    const ids = value.users.map((user) => user.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Repeated recovery user.' });
    for (const [index, user] of value.users.entries()) {
      if (user.operator && user.publisher !== 'active')
        context.addIssue({
          code: 'custom',
          path: ['users', index, 'operator'],
          message: 'Operators must remain active publishers.',
        });
    }
  });

export type RegistryRecoveryReconciliation = z.infer<
  typeof reconciliationSchema
>;

export function copyRegistryRecoveryReconciliation(
  value: RegistryRecoveryReconciliation,
): RegistryRecoveryReconciliation {
  return reconciliationSchema.parse(value);
}

/** Read independently obtained current permission evidence, never the restore. */
export async function readRegistryRecoveryReconciliation(
  path: string,
  expectedSha256: string,
): Promise<RegistryRecoveryReconciliation> {
  try {
    if (!/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error();
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
      throw new Error();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== info.dev ||
        opened.ino !== info.ino ||
        (opened.mode & 0o077) !== 0 ||
        opened.size > 16 * 1024 * 1024 ||
        opened.size === 0
      )
        throw new Error();
      const buffer = Buffer.alloc(opened.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      const after = await handle.stat();
      const bytes = buffer.subarray(0, length);
      if (
        length !== opened.size ||
        after.size !== opened.size ||
        (after.mode & 0o077) !== 0 ||
        templateBytesHash(bytes) !== expectedSha256
      )
        throw new Error();
      return reconciliationSchema.parse(JSON.parse(bytes.toString('utf8')));
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
  }
}
