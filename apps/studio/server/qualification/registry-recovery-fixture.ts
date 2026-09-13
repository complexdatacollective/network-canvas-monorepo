import { createHash } from 'node:crypto';

import type { Pool } from 'pg';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import {
  createTemplateArtifact,
  templateBytesHash,
} from '@codaco/studio-sync/template-exchange';

import {
  createRegistryRecoveryInventory,
  type RegistryRecoveryReconciliation,
} from '../../../template-registry/src/recovery-reconciliation.ts';
import recoveryFixture from './combined-recovery.fixture.json' with { type: 'json' };

// These facts are fixed before the backup is created. Never derive current
// recovery authority from the database being restored.
export function createRegistryRecoveryReconciliation(
  artifactRoot: string,
): RegistryRecoveryReconciliation {
  return {
    format: 'template-registry-recovery-reconciliation',
    version: 3,
    inventories: {
      users: createRegistryRecoveryInventory('users', [
        {
          id: recoveryFixture.registry.userId,
          email: recoveryFixture.registry.email,
          emailVerified: true,
        },
      ]),
      publishers: createRegistryRecoveryInventory('publishers', [
        {
          id: recoveryFixture.registry.publisherId,
          userId: recoveryFixture.registry.userId,
          suspended: false,
        },
      ]),
      operators: createRegistryRecoveryInventory('operators', []),
      entries: createRegistryRecoveryInventory('entries', [
        {
          id: recoveryFixture.registry.entryId,
          publisherId: recoveryFixture.registry.publisherId,
          artifactRoot,
        },
      ]),
    },
  };
}

export const emptyRegistryRecoveryReconciliation = {
  format: 'template-registry-recovery-reconciliation',
  version: 3,
  inventories: {
    users: createRegistryRecoveryInventory('users', []),
    publishers: createRegistryRecoveryInventory('publishers', []),
    operators: createRegistryRecoveryInventory('operators', []),
    entries: createRegistryRecoveryInventory('entries', []),
  },
} satisfies RegistryRecoveryReconciliation;

export function createRegistryRecoveryArtifact() {
  return createTemplateArtifact({
    template: { name: 'Recovery qualification', kind: 'protocol', version: 1 },
    metadata: {
      schema_version: 1,
      authors: [{ name: 'Qualification operator' }],
      description: 'Synthetic local distribution recovery evidence.',
      keywords: ['recovery'],
    },
    license: 'CC0-1.0',
    sections: {
      'settings': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: 'Recovery qualification',
      },
      'stageOrder': { stages: ['welcome'] },
      'assets': {
        recoveryDataset: {
          type: 'network',
          name: 'Recovery dataset',
          source: recoveryFixture.registry.object.key,
        },
      },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'text', type: 'text', content: 'Synthetic recovery.' }],
      },
    },
    assets: [
      {
        source: recoveryFixture.registry.object.key,
        media_type: 'text/csv',
        media_class: 'dataset',
        bytes: Buffer.from(
          recoveryFixture.registry.object.bytesBase64,
          'base64',
        ),
      },
    ],
  });
}

export async function seedRegistryRecoveryFixture(
  pool: Pool,
  artifact: Awaited<ReturnType<typeof createTemplateArtifact>>,
) {
  const rawHash = templateBytesHash(artifact.bytes);
  const artifactRoot = artifact.artifact.manifest.merkle_root;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO registry_auth_user(id,name,email,email_verified) VALUES ($1,$2,$3,true)`,
      [
        recoveryFixture.registry.userId,
        'Recovery publisher',
        recoveryFixture.registry.email,
      ],
    );
    await client.query(
      'INSERT INTO registry_publishers(id,user_id,name) VALUES ($1,$2,$3)',
      [
        recoveryFixture.registry.publisherId,
        recoveryFixture.registry.userId,
        recoveryFixture.registry.publisherName,
      ],
    );
    await client.query(
      `INSERT INTO registry_auth_session(id,expires_at,token,updated_at,user_id)
       VALUES ('recovery-session',statement_timestamp()+interval '1 hour',
         'synthetic-recovery-session',statement_timestamp(),$1)`,
      [recoveryFixture.registry.userId],
    );
    await client.query(
      `INSERT INTO registry_auth_verification(id,identifier,value,expires_at)
       VALUES ('recovery-magic-link',$1,'synthetic-magic-link',statement_timestamp()+interval '1 hour')`,
      [recoveryFixture.registry.email],
    );
    await client.query(
      `INSERT INTO registry_credentials(id,publisher_id,token_hash,name,scopes,expires_at)
       VALUES ('66666666-6666-4666-8666-666666666666',$1,$2,
         'Recovery PAT',ARRAY['publish'],statement_timestamp()+interval '1 hour')`,
      [
        recoveryFixture.registry.publisherId,
        createHash('sha256').update('synthetic-recovery-pat').digest('hex'),
      ],
    );
    await client.query(
      'INSERT INTO registry_artifacts(root,raw_hash,byte_size) VALUES ($1,$2,$3)',
      [artifactRoot, rawHash, artifact.bytes.byteLength],
    );
    await client.query(
      'INSERT INTO registry_artifact_content(root,template,metadata,license) VALUES ($1,$2,$3,$4)',
      [
        artifactRoot,
        artifact.artifact.manifest.template,
        artifact.artifact.metadata,
        artifact.artifact.license,
      ],
    );
    await client.query(
      'INSERT INTO registry_entries(id,publisher_id,artifact_root) VALUES ($1,$2,$3)',
      [
        recoveryFixture.registry.entryId,
        recoveryFixture.registry.publisherId,
        artifactRoot,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
