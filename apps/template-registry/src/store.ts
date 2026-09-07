import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type pg from 'pg';
import { z } from 'zod';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';
import { canonicalize } from '@codaco/studio-sync/apply';
import {
  readTemplateArtifact,
  templateBytesHash,
  TemplateArtifactError,
  TEMPLATE_ARTIFACT_LIMITS,
  type TemplateArtifactManifest,
} from '@codaco/studio-sync/template-exchange';
import {
  hasCuratedMetadata,
  TemplateMetadataSchema,
  type TemplateMetadata,
} from '@codaco/studio-sync/template-metadata';

import {
  AccountSchema,
  ClaimPublisherSchema,
  CreateTokenSchema,
  PublisherSchema,
  ReportSchema,
  TokenDescriptionSchema,
  type RegistryReport,
} from './account-contract.ts';
import type { RegistryAuth } from './auth/service.ts';
import type { RegistryBlobStore } from './blob-store.ts';
import {
  EntrySchema,
  ListEntriesSchema,
  type ListEntries,
  type RegistryEntry,
} from './contract.ts';
import {
  appendRegistryAudit,
  registryTransaction,
  type RegistryActor,
} from './db/transaction.ts';
import { RegistryLimitsSchema, type RegistryLimits } from './limits.ts';
import { RegistryError } from './problems.ts';
import { admitRegistryRate } from './rate-limit.ts';

type Principal = {
  publisherId: string;
  userId: string;
  name: string;
  orcid: string | null;
  scopes: string[];
  operator: boolean;
};
type EntryRow = {
  id: string;
  sequence: string;
  publisher_id: string;
  publisher_name: string;
  publisher_orcid: string | null;
  artifact_root: string;
  created_at: Date;
  yanked_at: Date | null;
  curated_at: Date | null;
  blocked_at: Date | null;
  deleted_at: Date | null;
  template: TemplateArtifactManifest['template'] | null;
  metadata: TemplateMetadata | null;
  license: string | null;
};
const ENTRY_QUERY = `SELECT e.id, e.sequence::text AS sequence, e.publisher_id,
  p.name AS publisher_name, p.orcid AS publisher_orcid,
  e.artifact_root, e.created_at, e.yanked_at, e.curated_at, a.blocked_at, a.deleted_at,
  c.template, c.metadata, c.license
  FROM registry_entries e JOIN registry_publishers p ON p.id = e.publisher_id
  JOIN registry_artifacts a ON a.root = e.artifact_root
  LEFT JOIN registry_artifact_content c ON c.root = a.root`;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const SequenceSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);
const CursorSchema = z.strictObject({
  version: z.literal(1),
  after: SequenceSchema,
  filter: z.string().regex(/^[0-9a-f]{64}$/),
});
const TOKEN_PATTERN = /^ncr1_[A-Za-z0-9_-]{43}$/;

// These credentials are supplied by trusted route handlers. Public exchange
// routes accept bearer tokens; private account routes accept verified cookies.
type ModerationCredential =
  | { readonly kind: 'credential'; readonly token: string }
  | { readonly kind: 'account'; readonly headers: Headers };

export class RegistryStore {
  readonly #pool: pg.Pool;
  readonly #operatorPool: pg.Pool;
  readonly #auth: RegistryAuth;
  readonly #blobs: RegistryBlobStore;
  readonly #baseUrl: string;
  readonly #limits: RegistryLimits;

  constructor(options: {
    pool: pg.Pool;
    operatorPool: pg.Pool;
    auth: RegistryAuth;
    blobs: RegistryBlobStore;
    baseUrl: string;
    limits: RegistryLimits;
  }) {
    this.#pool = options.pool;
    this.#operatorPool = options.operatorPool;
    this.#auth = options.auth;
    this.#blobs = options.blobs;
    this.#baseUrl = new URL(options.baseUrl).origin;
    this.#limits = RegistryLimitsSchema.parse(options.limits);
  }

  async #principal(
    client: Pick<pg.PoolClient, 'query'>,
    token: string,
    scope?: 'publish' | 'moderate',
  ): Promise<Principal> {
    if (!TOKEN_PATTERN.test(token))
      throw new RegistryError('AUTHENTICATION_REQUIRED');
    const result = await client.query<Principal>(
      `SELECT p.id AS "publisherId", p.user_id AS "userId", p.name, p.orcid, c.scopes,
      EXISTS (SELECT 1 FROM registry_operators o WHERE o.user_id = p.user_id AND o.enabled) AS operator
      FROM registry_credentials c JOIN registry_publishers p ON p.id = c.publisher_id
      JOIN registry_auth_user u ON u.id = p.user_id
      WHERE c.token_hash = $1 AND c.revoked_at IS NULL AND c.expires_at > statement_timestamp()
        AND p.suspended_at IS NULL AND u.email_verified = true`,
      [hash(token)],
    );
    const principal = result.rows[0];
    if (!principal) throw new RegistryError('AUTHENTICATION_REQUIRED');
    if (
      scope &&
      (!principal.scopes.includes(scope) ||
        (scope === 'moderate' && !principal.operator))
    )
      throw new RegistryError('FORBIDDEN');
    return principal;
  }

  async #verifiedSession(headers: Headers, write = false): Promise<string> {
    if (write && headers.get('origin') !== this.#baseUrl)
      throw new RegistryError('FORBIDDEN');
    const session = await this.#auth.getSession(headers);
    if (!session?.emailVerified)
      throw new RegistryError('AUTHENTICATION_REQUIRED');
    return session.userId;
  }

  async #accountPublisher(
    client: pg.PoolClient,
    userId: string,
  ): Promise<Principal> {
    const result = await client.query<Principal>(
      `SELECT p.id AS "publisherId", p.user_id AS "userId", p.name, p.orcid,
      ARRAY[]::text[] AS scopes,
      EXISTS (SELECT 1 FROM registry_operators o WHERE o.user_id = p.user_id AND o.enabled) AS operator
      FROM registry_publishers p JOIN registry_auth_user u ON u.id = p.user_id
      WHERE p.user_id = $1 AND p.suspended_at IS NULL AND u.email_verified = true`,
      [userId],
    );
    if (!result.rows[0]) throw new RegistryError('FORBIDDEN');
    return result.rows[0];
  }

  #publicPublisher(
    principal: Pick<Principal, 'publisherId' | 'name' | 'orcid'>,
  ) {
    return PublisherSchema.parse({
      id: principal.publisherId,
      name: principal.name,
      orcid: principal.orcid,
    });
  }

  async publisher(token: string) {
    return this.#publicPublisher(await this.#principal(this.#pool, token));
  }
  async account(headers: Headers) {
    const userId = await this.#verifiedSession(new Headers(headers));
    const result = await this.#pool.query<{
      id: string;
      email: string;
      publisher_id: string | null;
      name: string | null;
      orcid: string | null;
      suspended: boolean;
      operator: boolean;
    }>(
      `SELECT u.id, u.email, p.id AS publisher_id, p.name, p.orcid,
      p.suspended_at IS NOT NULL AS suspended,
      p.id IS NOT NULL AND p.suspended_at IS NULL AND COALESCE(o.enabled, false) AS operator
      FROM registry_auth_user u LEFT JOIN registry_publishers p ON p.user_id = u.id
      LEFT JOIN registry_operators o ON o.user_id = u.id
      WHERE u.id = $1 AND u.email_verified = true`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new RegistryError('AUTHENTICATION_REQUIRED');
    return AccountSchema.parse({
      id: row.id,
      email: row.email,
      publisher: row.publisher_id
        ? { id: row.publisher_id, name: row.name, orcid: row.orcid }
        : null,
      suspended: row.suspended,
      operator: row.operator,
    });
  }
  async authorizePublish(token: string): Promise<void> {
    await this.#principal(this.#pool, token, 'publish');
  }

  async claimPublisher(
    headers: Headers,
    value: z.infer<typeof ClaimPublisherSchema>,
    requestId: string,
  ) {
    const input = ClaimPublisherSchema.parse(value);
    const userId = await this.#verifiedSession(headers, true);
    await this.#admitAccountWrite(userId);
    return registryTransaction(this.#pool, async (client) => {
      const verified = await client.query(
        'SELECT id FROM registry_auth_user WHERE id = $1 AND email_verified = true',
        [userId],
      );
      if (!verified.rowCount)
        throw new RegistryError('AUTHENTICATION_REQUIRED');
      const existing = await client.query<{
        id: string;
        name: string;
        orcid: string | null;
        suspended_at: Date | null;
      }>(
        'SELECT id, name, orcid, suspended_at FROM registry_publishers WHERE user_id = $1',
        [userId],
      );
      const row = existing.rows[0];
      if (row?.suspended_at) throw new RegistryError('FORBIDDEN');
      const id = row?.id ?? randomUUID();
      if (row && row.name === input.name && row.orcid === (input.orcid ?? null))
        return PublisherSchema.parse({ id, name: row.name, orcid: row.orcid });
      if (row)
        await client.query(
          'UPDATE registry_publishers SET name = $2, orcid = $3 WHERE id = $1',
          [id, input.name, input.orcid ?? null],
        );
      else
        await client.query(
          'INSERT INTO registry_publishers(id, user_id, name, orcid) VALUES ($1, $2, $3, $4)',
          [id, userId, input.name, input.orcid ?? null],
        );
      await appendRegistryAudit(
        client,
        { kind: 'publisher', id },
        'publisher.claimed',
        id,
        requestId,
      );
      return PublisherSchema.parse({
        id,
        name: input.name,
        orcid: input.orcid ?? null,
      });
    });
  }

  async createToken(
    headers: Headers,
    value: z.infer<typeof CreateTokenSchema>,
    requestId: string,
  ) {
    const input = CreateTokenSchema.parse(value);
    const userId = await this.#verifiedSession(headers, true);
    await this.#admitAccountWrite(userId);
    return registryTransaction(this.#pool, async (client) => {
      const principal = await this.#accountPublisher(client, userId);
      if (input.scopes.includes('moderate') && !principal.operator)
        throw new RegistryError('FORBIDDEN');
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM registry_credentials WHERE publisher_id = $1 AND revoked_at IS NULL AND expires_at > statement_timestamp()',
        [principal.publisherId],
      );
      if ((count.rows[0]?.count ?? 0) >= 20)
        throw new RegistryError('CONFLICT');
      const id = randomUUID();
      const token = `ncr1_${randomBytes(32).toString('base64url')}`;
      const result = await client.query<{ created_at: Date; expires_at: Date }>(
        `INSERT INTO registry_credentials(id, publisher_id, token_hash, name, scopes, expires_at)
        VALUES ($1, $2, $3, $4, $5, statement_timestamp() + $6 * interval '1 day') RETURNING created_at, expires_at`,
        [
          id,
          principal.publisherId,
          hash(token),
          input.name,
          input.scopes,
          input.lifetime_days,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new RegistryError('INTERNAL_SERVER_ERROR');
      await appendRegistryAudit(
        client,
        { kind: 'publisher', id: principal.publisherId },
        'credential.created',
        id,
        requestId,
      );
      return {
        token,
        credential: TokenDescriptionSchema.parse({
          id,
          name: input.name,
          scopes: input.scopes,
          created_at: row.created_at.toISOString(),
          expires_at: row.expires_at.toISOString(),
          revoked_at: null,
        }),
      };
    });
  }

  async listTokens(headers: Headers) {
    const userId = await this.#verifiedSession(headers);
    return registryTransaction(this.#pool, async (client) => {
      const principal = await this.#accountPublisher(client, userId);
      const result = await client.query<{
        id: string;
        name: string;
        scopes: string[];
        created_at: Date;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        'SELECT id, name, scopes, created_at, expires_at, revoked_at FROM registry_credentials WHERE publisher_id = $1 AND revoked_at IS NULL AND expires_at > statement_timestamp() ORDER BY created_at DESC LIMIT 20',
        [principal.publisherId],
      );
      return {
        data: result.rows.map((row) =>
          TokenDescriptionSchema.parse({
            ...row,
            created_at: row.created_at.toISOString(),
            expires_at: row.expires_at.toISOString(),
            revoked_at: row.revoked_at?.toISOString() ?? null,
          }),
        ),
      };
    });
  }

  async revokeToken(
    headers: Headers,
    id: string,
    requestId: string,
  ): Promise<void> {
    const userId = await this.#verifiedSession(headers, true);
    await this.#admitAccountWrite(userId);
    await registryTransaction(this.#pool, async (client) => {
      const principal = await this.#accountPublisher(client, userId);
      const result = await client.query<{ revoked_at: Date | null }>(
        'SELECT revoked_at FROM registry_credentials WHERE id = $1 AND publisher_id = $2',
        [id, principal.publisherId],
      );
      if (!result.rows[0]) throw new RegistryError('NOT_FOUND');
      if (result.rows[0].revoked_at) return;
      await client.query(
        'UPDATE registry_credentials SET revoked_at = statement_timestamp() WHERE id = $1',
        [id],
      );
      await appendRegistryAudit(
        client,
        { kind: 'publisher', id: principal.publisherId },
        'credential.revoked',
        id,
        requestId,
      );
    });
  }

  async #admitAccountWrite(userId: string): Promise<void> {
    // Outside the command transaction: rejected writes consume their budget too.
    // A shared global budget bounds immutable rows even across many accounts.
    await admitRegistryRate(
      this.#pool,
      `account-write:${userId}`,
      this.#limits.accountWritesPerHour,
      3600,
    );
    await admitRegistryRate(
      this.#pool,
      'account-write:global',
      this.#limits.accountWritesGlobalPerHour,
      3600,
    );
  }

  async admitPublish(token: string): Promise<void> {
    const principal = await this.#principal(this.#pool, token, 'publish');
    await admitRegistryRate(
      this.#pool,
      `publish:${principal.publisherId}`,
      this.#limits.publishPerHour,
      3600,
    );
    await admitRegistryRate(
      this.#pool,
      'publish:global',
      this.#limits.publishGlobalPerMinute,
      60,
    );
  }

  #entry(row: EntryRow): RegistryEntry {
    if (row.deleted_at || row.blocked_at)
      throw new RegistryError('CONTENT_REMOVED');
    if (!row.template || !row.metadata || !row.license)
      throw new RegistryError('SERVICE_UNAVAILABLE');
    return EntrySchema.parse({
      id: row.id,
      publisher: {
        id: row.publisher_id,
        name: row.publisher_name,
        orcid: row.publisher_orcid,
      },
      root: row.artifact_root,
      template: row.template,
      license: row.license,
      curated: row.curated_at !== null,
      yanked: row.yanked_at !== null,
      published_at: row.created_at.toISOString(),
      metadata: row.metadata,
      artifact_url: `${this.#baseUrl}/api/v1/artifacts/${row.artifact_root}`,
      report_url: `${this.#baseUrl}/api/v1/entries/${row.id}/reports`,
    });
  }

  async #readEntry(
    client: Pick<pg.PoolClient, 'query'>,
    id: string,
  ): Promise<RegistryEntry> {
    const result = await client.query<EntryRow>(
      `${ENTRY_QUERY} WHERE e.id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new RegistryError('NOT_FOUND');
    return this.#entry(result.rows[0]);
  }
  async entry(id: string) {
    return this.#readEntry(this.#pool, id);
  }

  async list(value: ListEntries) {
    const input = ListEntriesSchema.parse(value);
    const { cursor, limit, ...filters } = input;
    const filter = hash(canonicalize(filters));
    let after: string | undefined;
    if (cursor) {
      try {
        const bytes = Buffer.from(cursor, 'base64url');
        if (bytes.toString('base64url') !== cursor) throw new Error();
        const parsed = CursorSchema.parse(JSON.parse(bytes.toString('utf8')));
        if (parsed.filter !== filter) throw new Error();
        after = parsed.after;
      } catch {
        throw new RegistryError('INVALID_REQUEST');
      }
    }
    const parameters: (string | number | boolean)[] = [];
    const bind = (item: string | number | boolean) => {
      parameters.push(item);
      return `$${parameters.length}`;
    };
    const where = [
      'e.yanked_at IS NULL',
      'a.blocked_at IS NULL',
      'a.deleted_at IS NULL',
      'c.root IS NOT NULL',
    ];
    if (after) where.push(`e.sequence < ${bind(after)}::bigint`);
    if (filters.kind) where.push(`c.template->>'kind' = ${bind(filters.kind)}`);
    if (filters.license) where.push(`c.license = ${bind(filters.license)}`);
    if (filters.curated)
      where.push(
        `(e.curated_at IS NOT NULL) = ${bind(filters.curated === 'true')}`,
      );
    if (filters.keyword)
      where.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.metadata->'keywords', '[]'::jsonb)) keyword WHERE lower(keyword) = lower(${bind(filters.keyword)}))`,
      );
    if (filters.author)
      where.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(c.metadata->'authors', '[]'::jsonb)) author WHERE strpos(lower(author->>'name'), lower(${bind(filters.author)})) > 0)`,
      );
    if (filters.query) {
      const parameter = bind(filters.query);
      where.push(
        `(strpos(lower(c.template->>'name'), lower(${parameter})) > 0 OR strpos(lower(COALESCE(c.metadata->>'description', '')), lower(${parameter})) > 0)`,
      );
    }
    const rows = (
      await this.#pool.query<EntryRow>(
        `${ENTRY_QUERY} WHERE ${where.join(' AND ')} ORDER BY e.sequence DESC LIMIT ${bind(limit + 1)}`,
        parameters,
      )
    ).rows;
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      data: selected.map((row) => {
        const {
          metadata: _metadata,
          artifact_url: _artifact,
          report_url: _report,
          ...summary
        } = this.#entry(row);
        return summary;
      }),
      next_cursor:
        rows.length > limit && last
          ? Buffer.from(
              canonicalize({ version: 1, after: last.sequence, filter }),
            ).toString('base64url')
          : null,
    };
  }

  /** Intake admission runs before body buffering; this rechecks live credentials after verification. */
  async publish(
    token: string,
    source: Uint8Array,
    requestId: string,
  ): Promise<RegistryEntry> {
    if (source.byteLength > TEMPLATE_ARTIFACT_LIMITS.archiveBytes)
      throw new RegistryError('CONTENT_TOO_LARGE');
    const bytes = Uint8Array.from(source);
    let verified;
    try {
      verified = await readTemplateArtifact(bytes);
    } catch (error) {
      if (error instanceof TemplateArtifactError) {
        if (error.code === 'TEMPLATE_SCHEMA_UNSUPPORTED')
          throw new RegistryError('SCHEMA_UNSUPPORTED', {
            supported_schema_version: CURRENT_SCHEMA_VERSION,
            artifact_schema_version: error.schemaVersion,
          });
        if (error.code === 'TEMPLATE_FORMAT_UNSUPPORTED')
          throw new RegistryError('FORMAT_UNSUPPORTED');
        if (error.code === 'TEMPLATE_TOO_LARGE')
          throw new RegistryError('CONTENT_TOO_LARGE');
      }
      throw new RegistryError('ARTIFACT_INVALID');
    }
    const root = verified.manifest.merkle_root;
    return registryTransaction(this.#pool, async (client) => {
      const principal = await this.#principal(client, token, 'publish');
      const artifact = (
        await client.query<{
          root: string;
          raw_hash: string;
          byte_size: number;
          blocked_at: Date | null;
          deleted_at: Date | null;
        }>(
          'SELECT root, raw_hash, byte_size, blocked_at, deleted_at FROM registry_artifacts WHERE root = $1',
          [root],
        )
      ).rows[0];
      if (artifact?.deleted_at || artifact?.blocked_at)
        throw new RegistryError('CONTENT_REMOVED');
      const existing = (
        await client.query<{ id: string }>(
          'SELECT id FROM registry_entries WHERE publisher_id = $1 AND artifact_root = $2',
          [principal.publisherId, root],
        )
      ).rows[0];
      if (existing) return this.#readEntry(client, existing.id);
      // Visibility changes cannot release stored bytes. Charge pending erasure
      // until its durable, audited deletion job has completed successfully.
      const publisherBytes =
        (
          await client.query<{ bytes: string }>(
            `SELECT COALESCE(sum(a.byte_size), 0)::text AS bytes FROM registry_entries e JOIN registry_artifacts a ON a.root = e.artifact_root
        WHERE e.publisher_id = $1 AND NOT EXISTS (
          SELECT 1 FROM registry_delete_jobs deletion WHERE deletion.root = a.root AND deletion.completed_at IS NOT NULL
        )`,
            [principal.publisherId],
          )
        ).rows[0]?.bytes ?? '0';
      if (
        BigInt(publisherBytes) +
          BigInt(artifact?.byte_size ?? bytes.byteLength) >
        BigInt(this.#limits.publisherBytes)
      )
        throw new RegistryError('STORAGE_LIMIT_REACHED');
      if (!artifact) {
        const total =
          (
            await client.query<{
              bytes: string;
            }>(`SELECT COALESCE(sum(a.byte_size), 0)::text AS bytes FROM registry_artifacts a
          WHERE NOT EXISTS (SELECT 1 FROM registry_delete_jobs deletion WHERE deletion.root = a.root AND deletion.completed_at IS NOT NULL)`)
          ).rows[0]?.bytes ?? '0';
        if (
          BigInt(total) + BigInt(bytes.byteLength) >
          BigInt(this.#limits.totalBytes)
        )
          throw new RegistryError('STORAGE_LIMIT_REACHED');
        const rawHash = templateBytesHash(bytes);
        await client.query(
          'INSERT INTO registry_artifacts(root, raw_hash, byte_size) VALUES ($1, $2, $3)',
          [root, rawHash, bytes.byteLength],
        );
        await client.query(
          'INSERT INTO registry_artifact_content(root, template, metadata, license) VALUES ($1, $2, $3, $4)',
          [
            root,
            verified.manifest.template,
            verified.metadata,
            verified.license,
          ],
        );
        await this.#blobs.put(rawHash, bytes);
      } else if (!(await this.#blobs.get(artifact.raw_hash)))
        throw new RegistryError('SERVICE_UNAVAILABLE');
      const id = randomUUID();
      await client.query(
        'INSERT INTO registry_entries(id, publisher_id, artifact_root) VALUES ($1, $2, $3)',
        [id, principal.publisherId, root],
      );
      await appendRegistryAudit(
        client,
        { kind: 'publisher', id: principal.publisherId },
        'entry.published',
        id,
        requestId,
      );
      return this.#readEntry(client, id);
    });
  }

  async artifact(root: string) {
    const result = await this.#pool.query<{
      raw_hash: string;
      blocked_at: Date | null;
      deleted_at: Date | null;
      yanked: boolean;
    }>(
      `SELECT a.raw_hash, a.blocked_at, a.deleted_at,
      NOT EXISTS (SELECT 1 FROM registry_entries e WHERE e.artifact_root = a.root AND e.yanked_at IS NULL) AS yanked
      FROM registry_artifacts a WHERE a.root = $1 AND EXISTS (SELECT 1 FROM registry_entries e WHERE e.artifact_root = a.root)`,
      [root],
    );
    const row = result.rows[0];
    if (!row) throw new RegistryError('NOT_FOUND');
    if (row.blocked_at || row.deleted_at)
      throw new RegistryError('CONTENT_REMOVED');
    const bytes = await this.#blobs.get(row.raw_hash);
    if (!bytes || templateBytesHash(bytes) !== row.raw_hash)
      throw new RegistryError('SERVICE_UNAVAILABLE');
    // A takedown or hard delete may commit while the private object is fetched.
    const available = await this.#pool.query<{ yanked: boolean }>(
      `SELECT NOT EXISTS (SELECT 1 FROM registry_entries e WHERE e.artifact_root = a.root AND e.yanked_at IS NULL) AS yanked FROM registry_artifacts a WHERE root = $1 AND blocked_at IS NULL AND deleted_at IS NULL`,
      [root],
    );
    if (!available.rowCount) throw new RegistryError('CONTENT_REMOVED');
    return {
      bytes,
      rawHash: row.raw_hash,
      yanked: available.rows[0]?.yanked ?? false,
    };
  }

  async yank(token: string, id: string, requestId: string) {
    return registryTransaction(this.#pool, async (client) => {
      const principal = await this.#principal(client, token, 'publish');
      const entry = await this.#readEntry(client, id);
      if (entry.publisher.id !== principal.publisherId)
        throw new RegistryError('FORBIDDEN');
      if (!entry.yanked) {
        await client.query(
          'UPDATE registry_entries SET yanked_at = statement_timestamp() WHERE id = $1',
          [id],
        );
        await appendRegistryAudit(
          client,
          { kind: 'publisher', id: principal.publisherId },
          'entry.yanked',
          id,
          requestId,
        );
      }
      return this.#readEntry(client, id);
    });
  }

  async report(id: string, value: RegistryReport) {
    const input = ReportSchema.parse(value);
    await admitRegistryRate(
      this.#pool,
      'report:global',
      this.#limits.reportsPerHour,
      3600,
    );
    await admitRegistryRate(
      this.#pool,
      `report:${id}`,
      this.#limits.reportsPerEntryPerHour,
      3600,
    );
    // A yanked/removed locator can still be reported without revealing content.
    return registryTransaction(this.#pool, async (client) => {
      const present = await client.query(
        'SELECT id FROM registry_entries WHERE id = $1',
        [id],
      );
      if (!present.rowCount) throw new RegistryError('NOT_FOUND');
      const reportId = randomUUID();
      await client.query(
        'INSERT INTO registry_reports(id, entry_id, category, details) VALUES ($1, $2, $3, $4)',
        [reportId, id, input.category, input.details],
      );
      return { id: reportId };
    });
  }

  async #moderate<T>(
    credential: ModerationCredential,
    work: (client: pg.PoolClient, actor: RegistryActor) => Promise<T>,
  ) {
    // Snapshot the selected authentication lane before any await. The session
    // alone never grants operator access: the current user, publisher and grant
    // are read again in the serialized command transaction below.
    const token = credential.kind === 'credential' ? credential.token : null;
    const userId =
      credential.kind === 'account'
        ? await this.#verifiedSession(new Headers(credential.headers), true)
        : null;
    return registryTransaction(this.#operatorPool, async (client) => {
      const principal =
        token !== null
          ? await this.#principal(client, token, 'moderate')
          : userId !== null
            ? await this.#accountPublisher(client, userId)
            : null;
      if (!principal?.operator) throw new RegistryError('FORBIDDEN');
      return work(client, { kind: 'operator', id: principal.publisherId });
    });
  }

  async visibility(
    credential: ModerationCredential,
    id: string,
    removed: boolean,
    requestId: string,
  ): Promise<void> {
    await this.#moderate(credential, async (client, actor) => {
      const result = await client.query<{
        artifact_root: string;
        deleted_at: Date | null;
      }>(
        'SELECT e.artifact_root, a.deleted_at FROM registry_entries e JOIN registry_artifacts a ON a.root = e.artifact_root WHERE e.id = $1',
        [id],
      );
      const row = result.rows[0];
      if (!row) throw new RegistryError('NOT_FOUND');
      if (row.deleted_at) throw new RegistryError('CONTENT_REMOVED');
      await client.query(
        `UPDATE registry_artifacts SET blocked_at = ${removed ? 'statement_timestamp()' : 'NULL'} WHERE root = $1`,
        [row.artifact_root],
      );
      await appendRegistryAudit(
        client,
        actor,
        removed ? 'artifact.taken_down' : 'artifact.restored',
        row.artifact_root,
        requestId,
      );
    });
  }

  async suspend(
    credential: ModerationCredential,
    id: string,
    suspended: boolean,
    requestId: string,
  ): Promise<void> {
    await this.#moderate(credential, async (client, actor) => {
      const result = await client.query(
        `UPDATE registry_publishers SET suspended_at = ${suspended ? 'statement_timestamp()' : 'NULL'} WHERE id = $1 RETURNING id`,
        [id],
      );
      if (!result.rowCount) throw new RegistryError('NOT_FOUND');
      await appendRegistryAudit(
        client,
        actor,
        suspended ? 'publisher.suspended' : 'publisher.reinstated',
        id,
        requestId,
      );
    });
  }

  async curate(
    credential: ModerationCredential,
    id: string,
    curated: boolean,
    requestId: string,
  ): Promise<void> {
    await this.#moderate(credential, async (client, actor) => {
      const entry = await this.#readEntry(client, id);
      if (
        curated &&
        (entry.yanked ||
          !hasCuratedMetadata(TemplateMetadataSchema.parse(entry.metadata)))
      )
        throw new RegistryError('CURATION_METADATA_REQUIRED');
      await client.query(
        `UPDATE registry_entries SET curated_at = ${curated ? 'statement_timestamp()' : 'NULL'} WHERE id = $1`,
        [id],
      );
      await appendRegistryAudit(
        client,
        actor,
        curated ? 'entry.curated' : 'entry.uncurated',
        id,
        requestId,
      );
    });
  }

  async hardDelete(
    credential: ModerationCredential,
    root: string,
    requestId: string,
  ): Promise<void> {
    await this.#moderate(credential, async (client, actor) => {
      const result = await client.query<{ deleted_at: Date | null }>(
        'SELECT deleted_at FROM registry_artifacts WHERE root = $1',
        [root],
      );
      const row = result.rows[0];
      if (!row) throw new RegistryError('NOT_FOUND');
      if (row.deleted_at) return;
      await client.query(
        'UPDATE registry_artifacts SET blocked_at = COALESCE(blocked_at, statement_timestamp()), deleted_at = statement_timestamp() WHERE root = $1',
        [root],
      );
      await client.query(
        'DELETE FROM registry_artifact_content WHERE root = $1',
        [root],
      );
      await client.query(
        'UPDATE registry_reports SET details = NULL WHERE entry_id IN (SELECT id FROM registry_entries WHERE artifact_root = $1)',
        [root],
      );
      const event = await appendRegistryAudit(
        client,
        actor,
        'artifact.hard_delete_requested',
        root,
        requestId,
      );
      await client.query(
        'INSERT INTO registry_delete_jobs(root, requested_audit_id) VALUES ($1, $2)',
        [root, event],
      );
    });
  }

  async reports(
    credential: ModerationCredential,
    after: string | undefined,
    limit: number,
  ) {
    if (after && !SequenceSchema.safeParse(after).success)
      throw new RegistryError('INVALID_REQUEST');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new RegistryError('INVALID_REQUEST');
    return this.#moderate(credential, async (client) => {
      const rows = (
        await client.query<{
          id: string;
          sequence: string;
          entry_id: string;
          category: RegistryReport['category'];
          details: string | null;
          created_at: Date;
        }>(
          `SELECT id, sequence::text AS sequence, entry_id, category, details, created_at FROM registry_reports
        WHERE ($1::bigint IS NULL OR sequence < $1::bigint) ORDER BY sequence DESC LIMIT $2`,
          [after ?? null, limit + 1],
        )
      ).rows;
      const selected = rows.slice(0, limit);
      return {
        data: selected.map(({ sequence: _sequence, created_at, ...row }) => ({
          ...row,
          created_at: created_at.toISOString(),
        })),
        next_cursor:
          rows.length > limit ? (selected.at(-1)?.sequence ?? null) : null,
      };
    });
  }

  /** Only durable, audited operator requests authorize the system to remove bytes. */
  async cleanupDeletedArtifacts(): Promise<number> {
    return registryTransaction(this.#operatorPool, async (client) => {
      const jobs = (
        await client.query<{
          root: string;
          raw_hash: string;
          attempts: number;
        }>(`SELECT j.root, a.raw_hash, j.attempts FROM registry_delete_jobs j JOIN registry_artifacts a ON a.root = j.root
        JOIN registry_audit event ON event.id = j.requested_audit_id AND event.action = 'artifact.hard_delete_requested' AND event.subject_id = j.root
        WHERE j.completed_at IS NULL AND j.next_attempt_at <= statement_timestamp() AND a.deleted_at IS NOT NULL ORDER BY j.next_attempt_at LIMIT 10`)
      ).rows;
      let completed = 0;
      // Independent deletes share one bounded storage deadline instead of
      // multiplying that deadline by the number of jobs during shutdown.
      const outcomes = await Promise.allSettled(
        jobs.map((job) => this.#blobs.delete(job.raw_hash)),
      );
      for (const [index, job] of jobs.entries()) {
        if (outcomes[index]?.status !== 'fulfilled') {
          await client.query(
            "UPDATE registry_delete_jobs SET attempts = attempts + 1, next_attempt_at = statement_timestamp() + interval '5 minutes' WHERE root = $1",
            [job.root],
          );
          continue;
        }
        await client.query(
          'UPDATE registry_delete_jobs SET attempts = attempts + 1, completed_at = statement_timestamp() WHERE root = $1',
          [job.root],
        );
        await appendRegistryAudit(
          client,
          { kind: 'system', id: 'authorized-artifact-cleanup' },
          'artifact.hard_delete_completed',
          job.root,
          randomUUID(),
        );
        completed++;
      }
      await client.query(
        'DELETE FROM registry_rate_counters WHERE expires_at < statement_timestamp()',
      );
      // Report prose is temporary operational material, never immutable audit.
      await client.query(
        "UPDATE registry_reports SET details = NULL WHERE details IS NOT NULL AND created_at < statement_timestamp() - interval '30 days'",
      );
      return completed;
    });
  }

  /** Recover uploads whose object write succeeded before their DB transaction failed. */
  async cleanupOrphanArtifacts(
    cursor?: string,
  ): Promise<{ removed: number; retry: boolean; nextCursor?: string }> {
    const page = await this.#blobs.scan(cursor);
    return registryTransaction(this.#operatorPool, async (client) => {
      const time = (
        await client.query<{ now: Date }>('SELECT statement_timestamp() AS now')
      ).rows[0]?.now;
      if (!time) throw new RegistryError('SERVICE_UNAVAILABLE');
      const old = page.objects.filter(
        (object) =>
          object.modifiedAt.getTime() <= time.getTime() - 60 * 60 * 1000,
      );
      const referenced = (
        await client.query<{ raw_hash: string }>(
          `SELECT a.raw_hash FROM registry_artifacts a WHERE a.raw_hash = ANY($1::text[])
          AND (a.deleted_at IS NULL OR NOT EXISTS (
            SELECT 1 FROM registry_delete_jobs j JOIN registry_audit event
              ON event.id = j.requested_audit_id AND event.action = 'artifact.hard_delete_requested' AND event.subject_id = j.root
            WHERE j.root = a.root AND j.completed_at IS NOT NULL
          ))`,
          [old.map((object) => object.rawHash)],
        )
      ).rows;
      // A completed, authorized tombstone no longer protects bytes. An earlier
      // uncertain PUT can surface after deletion and needs the same bounded retry.
      const keep = new Set(referenced.map((row) => row.raw_hash));
      const unreferenced = old.filter((object) => !keep.has(object.rawHash));
      // Publication and GC hold the same database command lock. A publisher
      // either commits its reference before this check or uploads after cleanup;
      // an object being published cannot be deleted between these two steps.
      const outcomes = await Promise.allSettled(
        unreferenced.map((object) => this.#blobs.delete(object.rawHash)),
      );
      const retry = outcomes.some((outcome) => outcome.status === 'rejected');
      return {
        removed: outcomes.filter((outcome) => outcome.status === 'fulfilled')
          .length,
        retry,
        nextCursor: retry ? cursor : page.nextCursor,
      };
    });
  }
}
