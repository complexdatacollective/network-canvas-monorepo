import {
  assetSchema,
  CurrentProtocolSchema,
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  NodeDefinitionSchema,
  stageSchema,
} from '@codaco/protocol-validation';
import {
  applyCommands,
  canonicalize,
  contentHash,
  manifestHash,
  type SectionDoc,
} from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  CompoundEditResult,
  CompoundEditSubmission,
  ManifestRevision,
  ProtocolBuilderPresence,
} from '../session.ts';

export type InMemoryCompoundHostLease = Readonly<{
  sectionId: ProtocolSectionId;
  leaseOwner: string;
  leaseEpoch: bigint;
  holder: ProtocolBuilderPresence;
}>;

export type InMemoryCompoundHostSnapshot = Readonly<{
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
}>;

export type InMemoryCompoundHostValidator = (
  protocolSections: Readonly<Record<string, SectionDoc>>,
  changedSectionIds: readonly ProtocolSectionId[],
) => void;

export type InMemoryCompoundHostOptions = Readonly<{
  protocolSections: Readonly<Record<string, SectionDoc>>;
  manifestRevision: ManifestRevision;
  leases: readonly InMemoryCompoundHostLease[];
  validate?: InMemoryCompoundHostValidator;
}>;

class CompoundHostSectionError extends Error {
  readonly sectionId: ProtocolSectionId;

  constructor(sectionId: ProtocolSectionId, message: string) {
    super(message);
    this.sectionId = sectionId;
  }
}

type StoredRequest = Readonly<{
  fingerprint: string;
  applied?: Extract<CompoundEditResult, { status: 'applied' }>;
}>;

type CanonicalSectionValidation =
  | Readonly<{ success: true }>
  | Readonly<{
      success: false;
      error: Readonly<{
        issues: readonly Readonly<{ message: string }>[];
      }>;
    }>;

const validSection: CanonicalSectionValidation = Object.freeze({
  success: true,
});

const invalidSection = (message: string): CanonicalSectionValidation => ({
  success: false,
  error: { issues: [{ message }] },
});

const SETTINGS_KEYS = new Set([
  'name',
  'description',
  'experiments',
  'lastModified',
  'schemaVersion',
]);

/**
 * A deterministic proof host for the protocol-builder compound-edit contract.
 *
 * It models one atomic host boundary rather than Studio transport: authority
 * and every blocker are checked before a private working copy is changed,
 * validation runs against that complete copy, and authoritative state is
 * replaced only once validation succeeds.
 */
export class InMemoryCompoundHost {
  private protocolSections: Record<string, SectionDoc>;
  private manifestRevision: ManifestRevision;
  private readonly leases = new Map<
    ProtocolSectionId,
    InMemoryCompoundHostLease
  >();
  private readonly requests = new Map<string, StoredRequest>();
  private readonly validate: InMemoryCompoundHostValidator;

  constructor(options: InMemoryCompoundHostOptions) {
    this.protocolSections = cloneSections(options.protocolSections);
    this.manifestRevision = freezeRevision(options.manifestRevision);
    this.validate = options.validate ?? validateCanonicalChangedSections;

    for (const lease of options.leases) {
      if (lease.holder.sectionId !== lease.sectionId) {
        throw new Error('a compound host lease holder must name its section');
      }
      if (this.leases.has(lease.sectionId)) {
        throw new Error(`duplicate compound host lease for ${lease.sectionId}`);
      }
      this.leases.set(lease.sectionId, freezeLease(lease));
    }
  }

  getSnapshot(): InMemoryCompoundHostSnapshot {
    return Object.freeze({
      protocolSections: freezeSections(this.protocolSections),
      manifestRevision: freezeRevision(this.manifestRevision),
    });
  }

  submit(submission: CompoundEditSubmission): CompoundEditResult {
    const fingerprint = submissionFingerprint(submission);
    if (fingerprint === null) {
      return failed(
        'invalid-request',
        'the compound edit payload is not canonically serializable',
      );
    }

    const stored = this.requests.get(submission.id);
    if (stored !== undefined && stored.fingerprint !== fingerprint) {
      return failed(
        'invalid-request',
        `compound edit request id ${submission.id} was reused for a different payload`,
      );
    }
    if (stored?.applied !== undefined) return stored.applied;
    if (stored === undefined) {
      this.requests.set(submission.id, Object.freeze({ fingerprint }));
    }

    const invalid = validateSubmissionShape(submission);
    if (invalid !== null) return invalid;

    const primaryLease = this.leases.get(submission.authority.sectionId);
    if (primaryLease === undefined) {
      return failed(
        'lease-lost',
        'the primary section lease is no longer held',
        submission.authority.sectionId,
      );
    }

    if (primaryLease.leaseOwner !== submission.authority.leaseOwner) {
      return failed(
        'lease-lost',
        'the primary section lease is now held by another editor',
        submission.authority.sectionId,
        primaryLease.holder,
      );
    }

    if (primaryLease.leaseEpoch !== submission.authority.leaseEpoch) {
      return failed(
        'stale-epoch',
        'the primary section lease epoch is stale',
        submission.authority.sectionId,
      );
    }

    const requiredSectionIds = new Set<ProtocolSectionId>([
      submission.authority.sectionId,
      ...submission.edits.map((edit) => edit.sectionId),
    ]);
    const blockedSections = [...requiredSectionIds]
      .toSorted()
      .flatMap((sectionId) => {
        const lease = this.leases.get(sectionId);
        if (
          lease === undefined ||
          lease.leaseOwner === submission.authority.leaseOwner
        ) {
          return [];
        }
        return [
          Object.freeze({
            sectionId,
            holder: lease.holder,
          }),
        ];
      });

    if (blockedSections.length > 0) {
      return Object.freeze({
        status: 'blocked',
        blockedSections: Object.freeze(blockedSections),
      });
    }

    for (const edit of submission.edits) {
      if (edit.kind === 'create') continue;
      const current = this.protocolSections[edit.sectionId];
      if (
        current === undefined ||
        contentHash(current) !== edit.expectedContentHash
      ) {
        return failed(
          'stale-base',
          'the compound edit was built from an outdated section document',
          edit.sectionId,
        );
      }
    }

    const working = cloneSections(this.protocolSections);
    const changedSectionIds: ProtocolSectionId[] = [];
    try {
      for (const edit of submission.edits) {
        changedSectionIds.push(edit.sectionId);
        if (edit.kind === 'create') {
          if (Object.hasOwn(working, edit.sectionId)) {
            throw new CompoundHostSectionError(
              edit.sectionId,
              'cannot create a compound section that already exists',
            );
          }
          defineSection(working, edit.sectionId, edit.document);
          continue;
        }

        if (!Object.hasOwn(working, edit.sectionId)) {
          throw new CompoundHostSectionError(
            edit.sectionId,
            edit.kind === 'remove'
              ? 'cannot remove a compound section that does not exist'
              : 'cannot update a compound section that does not exist',
          );
        }

        if (edit.kind === 'remove') {
          delete working[edit.sectionId];
          continue;
        }

        const current = working[edit.sectionId];
        if (current === undefined) {
          throw new CompoundHostSectionError(
            edit.sectionId,
            'cannot update a missing compound section document',
          );
        }
        defineSection(
          working,
          edit.sectionId,
          applyCommands(current, [...edit.commands]),
        );
      }

      this.validate(working, Object.freeze([...changedSectionIds]));
    } catch (error: unknown) {
      return failed(
        'host-error',
        error instanceof Error ? error.message : 'the compound edit failed',
        error instanceof CompoundHostSectionError ? error.sectionId : undefined,
      );
    }

    const nextRevision = nextManifestRevision(this.manifestRevision, working);
    this.protocolSections = working;
    this.manifestRevision = nextRevision;

    const applied = deepFreeze({
      status: 'applied' as const,
      update: {
        protocolSections: cloneSections(working),
        manifestRevision: nextRevision,
      },
    });
    this.requests.set(submission.id, Object.freeze({ fingerprint, applied }));
    return applied;
  }
}

export const validateCanonicalChangedSections: InMemoryCompoundHostValidator = (
  protocolSections,
  changedSectionIds,
) => {
  for (const sectionId of changedSectionIds) {
    const document = protocolSections[sectionId];
    if (document === undefined) continue;

    let ref: ReturnType<typeof parseSectionId>;
    try {
      ref = parseSectionId(sectionId);
    } catch {
      throw new CompoundHostSectionError(
        sectionId,
        'the compound edit names an unknown section',
      );
    }

    const result = (() => {
      switch (ref.kind) {
        case 'stage':
          if (document.id !== ref.stageId) {
            throw new CompoundHostSectionError(
              sectionId,
              'the stage document id does not match its section id',
            );
          }
          return stageSchema.safeParse(document);
        case 'codebookNode':
          return NodeDefinitionSchema.safeParse(document);
        case 'codebookEdge':
          return EdgeDefinitionSchema.safeParse(document);
        case 'codebookEgo':
          return EgoDefinitionSchema.safeParse(document);
        case 'settings':
          return validateSettingsSection(document);
        case 'stageOrder':
          return validateStageOrderSection(document);
        case 'assets':
          return validateAssetsSection(document);
      }
      throw new CompoundHostSectionError(
        sectionId,
        'the compound edit names an unsupported section',
      );
    })();

    if (!result.success) {
      const message =
        result.error.issues[0]?.message ?? 'section validation failed';
      throw new CompoundHostSectionError(sectionId, message);
    }
  }
};

function validateSettingsSection(
  document: Readonly<SectionDoc>,
): CanonicalSectionValidation {
  const unknownKey = Object.keys(document).find(
    (key) => !SETTINGS_KEYS.has(key),
  );
  if (unknownKey !== undefined) {
    return invalidSection(
      `protocol settings contain unknown key ${unknownKey}`,
    );
  }
  const result = CurrentProtocolSchema.safeParse({
    ...document,
    codebook: {},
    stages: [],
  });
  return result.success
    ? validSection
    : invalidSection(
        result.error.issues[0]?.message ?? 'settings validation failed',
      );
}

function validateStageOrderSection(
  document: Readonly<SectionDoc>,
): CanonicalSectionValidation {
  if (Object.keys(document).some((key) => key !== 'stages')) {
    return invalidSection('stage order contains an unknown key');
  }
  const stages = document.stages;
  if (
    !Array.isArray(stages) ||
    stages.some((stageId) => typeof stageId !== 'string' || stageId === '')
  ) {
    return invalidSection('stage order must be a list of non-empty stage ids');
  }
  if (new Set(stages).size !== stages.length) {
    return invalidSection('stage order lists the same stage twice');
  }
  return validSection;
}

function validateAssetsSection(
  document: Readonly<SectionDoc>,
): CanonicalSectionValidation {
  for (const [assetId, asset] of Object.entries(document)) {
    const result = assetSchema.safeParse(asset);
    if (!result.success) {
      return invalidSection(
        `asset ${assetId}: ${result.error.issues[0]?.message ?? 'asset validation failed'}`,
      );
    }
  }
  return validSection;
}

function validateSubmissionShape(
  submission: CompoundEditSubmission,
): Extract<CompoundEditResult, { status: 'failed' }> | null {
  if (submission.id.trim() === '' || submission.edits.length === 0) {
    return failed(
      'invalid-request',
      'a compound edit requires an id and at least one section edit',
    );
  }

  const seen = new Set<ProtocolSectionId>();
  for (const edit of submission.edits) {
    if (seen.has(edit.sectionId)) {
      return failed(
        'invalid-request',
        'a compound edit may touch each section only once',
        edit.sectionId,
      );
    }
    seen.add(edit.sectionId);
    let ref: ReturnType<typeof parseSectionId>;
    try {
      ref = parseSectionId(edit.sectionId);
    } catch {
      return failed(
        'invalid-request',
        'a compound edit contains an unknown section id',
        edit.sectionId,
      );
    }
    if (edit.kind === 'update' && edit.commands.length === 0) {
      return failed(
        'invalid-request',
        'a compound section update requires at least one command',
        edit.sectionId,
      );
    }
    if (
      edit.kind !== 'create' &&
      (typeof edit.expectedContentHash !== 'string' ||
        edit.expectedContentHash.trim() === '')
    ) {
      return failed(
        'invalid-request',
        'a compound section edit requires an expected content hash',
        edit.sectionId,
      );
    }
    if (
      edit.kind === 'update' &&
      ref.kind === 'stage' &&
      edit.commands.some(
        (command) => command.key === 'id' || command.key === 'type',
      )
    ) {
      return failed(
        'invalid-request',
        'stage identity fields cannot be changed by a compound edit',
        edit.sectionId,
      );
    }
    if (
      edit.kind !== 'update' &&
      ref.kind !== 'codebookNode' &&
      ref.kind !== 'codebookEdge' &&
      ref.kind !== 'codebookEgo'
    ) {
      return failed(
        'invalid-request',
        'only codebook sections can be structurally created or removed',
        edit.sectionId,
      );
    }
  }
  return null;
}

function submissionFingerprint(
  submission: CompoundEditSubmission,
): string | null {
  try {
    return canonicalize({
      description: submission.description,
      edits: submission.edits,
      authority: {
        ...submission.authority,
        leaseEpoch: String(submission.authority.leaseEpoch),
      },
    });
  } catch {
    return null;
  }
}

function nextManifestRevision(
  current: ManifestRevision,
  protocolSections: Readonly<Record<string, SectionDoc>>,
): ManifestRevision {
  const sectionHashes: Record<string, string> = Object.create(null);
  for (const [sectionId, document] of Object.entries(protocolSections)) {
    defineValue(sectionHashes, sectionId, contentHash(document));
  }
  return freezeRevision({
    sequence: current.sequence + 1n,
    hash: manifestHash(sectionHashes, current.hash),
  });
}

function failed(
  reason: Extract<CompoundEditResult, { status: 'failed' }>['reason'],
  message: string,
  sectionId?: ProtocolSectionId,
  holder?: ProtocolBuilderPresence,
): Extract<CompoundEditResult, { status: 'failed' }> {
  return Object.freeze({
    status: 'failed',
    reason,
    message,
    ...(sectionId === undefined ? {} : { sectionId }),
    ...(holder === undefined ? {} : { holder }),
  });
}

function cloneSections(
  sections: Readonly<Record<string, SectionDoc>>,
): Record<string, SectionDoc> {
  const clone: Record<string, SectionDoc> = Object.create(null);
  for (const [sectionId, document] of Object.entries(sections)) {
    defineSection(clone, sectionId, document);
  }
  return clone;
}

function defineSection(
  sections: Record<string, SectionDoc>,
  sectionId: string,
  document: SectionDoc,
): void {
  defineValue(sections, sectionId, structuredClone(document));
}

function defineValue<T>(
  target: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function freezeSections(
  sections: Readonly<Record<string, SectionDoc>>,
): Readonly<Record<string, SectionDoc>> {
  return deepFreeze(cloneSections(sections));
}

function freezeRevision(revision: ManifestRevision): ManifestRevision {
  return Object.freeze({ ...revision });
}

function freezeLease(
  lease: InMemoryCompoundHostLease,
): InMemoryCompoundHostLease {
  return Object.freeze({
    ...lease,
    holder: Object.freeze({ ...lease.holder }),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
