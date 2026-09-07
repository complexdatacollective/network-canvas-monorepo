import { lstat, readFile } from 'node:fs/promises';

import { z } from 'zod';

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
    const bytes = await readFile(path);
    if (templateBytesHash(bytes) !== expectedSha256) throw new Error();
    return reconciliationSchema.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw new Error('REGISTRY_RECOVERY_RECONCILIATION_INVALID');
  }
}
