import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
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
  targetRoot,
} from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import {
  parseSectionId,
  sectionId as protocolSectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  CompoundEditResult,
  CompoundEditSubmission,
  ManifestRevision,
  ProtocolBuilderPresence,
} from '../session.ts';
import { compoundRequestMessages } from './compoundRequestMessages.ts';

/**
 * Why this host could not apply a compound edit.
 *
 * The request-shape refusals it shares with the session live in
 * `compoundRequestMessages`; these are the ones only a host can reach — a
 * lease that moved, a working copy the change no longer fits, a protocol the
 * schema refuses once the change is folded in.
 *
 * They travel to the screen inside a `CompoundEditResult`'s plain-string
 * `message`, so they are encoded with `createMessageError` and decoded where
 * they are rendered. Where a message is a schema's or the assembler's own
 * wording it is passed through untouched: that copy belongs to the package
 * that wrote it.
 */
const messages = defineMessages({
  leaseGone: {
    id: 'protocolBuilder.compoundEdit.leaseGone',
    defaultMessage: 'the primary section lease is no longer held',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: nobody holds the step for editing any more.',
  },
  leaseTaken: {
    id: 'protocolBuilder.compoundEdit.leaseTaken',
    defaultMessage: 'the primary section lease is now held by another editor',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: someone else is editing the step now.',
  },
  leaseEpochStale: {
    id: 'protocolBuilder.compoundEdit.leaseEpochStale',
    defaultMessage: 'the primary section lease epoch is stale',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: editing of the step was handed over since the change was prepared.',
  },
  staleBase: {
    id: 'protocolBuilder.compoundEdit.staleBase',
    defaultMessage:
      'the compound edit was built from an outdated section document',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: that part of the protocol has changed since the edit was prepared.',
  },
  sectionExists: {
    id: 'protocolBuilder.compoundEdit.sectionExists',
    defaultMessage: 'cannot create a compound section that already exists',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: it was asked to add a part of the protocol that is already there.',
  },
  removeMissingSection: {
    id: 'protocolBuilder.compoundEdit.removeMissingSection',
    defaultMessage: 'cannot remove a compound section that does not exist',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: it was asked to delete a part of the protocol that is not there.',
  },
  updateMissingSection: {
    id: 'protocolBuilder.compoundEdit.updateMissingSection',
    defaultMessage: 'cannot update a compound section that does not exist',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: it was asked to change a part of the protocol that is not there.',
  },
  updateMissingDocument: {
    id: 'protocolBuilder.compoundEdit.updateMissingDocument',
    defaultMessage: 'cannot update a missing compound section document',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the part of the protocol it was changing went missing partway through.',
  },
  failed: {
    id: 'protocolBuilder.compoundEdit.failed',
    defaultMessage: 'the compound edit failed',
    description:
      'Why the host could not change the codebook alongside the interview step being edited, when nothing more specific is known.',
  },
  unknownSectionNamed: {
    id: 'protocolBuilder.compoundEdit.unknownSectionNamed',
    defaultMessage: 'the compound edit names an unknown section',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: it named a part of the protocol this version does not recognise.',
  },
  stageIdMismatch: {
    id: 'protocolBuilder.compoundEdit.stageIdMismatch',
    defaultMessage: 'the stage document id does not match its section id',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the identifier inside the step disagrees with the one it is filed under. "stage" is one step of an interview.',
  },
  unsupportedSection: {
    id: 'protocolBuilder.compoundEdit.unsupportedSection',
    defaultMessage: 'the compound edit names an unsupported section',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: it named a part of the protocol this host cannot change.',
  },
  sectionInvalid: {
    id: 'protocolBuilder.compoundEdit.sectionInvalid',
    defaultMessage: 'section validation failed',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the changed part of the protocol did not pass its checks, and the checks said nothing more specific.',
  },
  assemblyFailed: {
    id: 'protocolBuilder.compoundEdit.assemblyFailed',
    defaultMessage: 'protocol assembly failed',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the parts could not be put back together into a whole protocol, and nothing more specific is known.',
  },
  protocolInvalid: {
    id: 'protocolBuilder.compoundEdit.protocolInvalid',
    defaultMessage: 'protocol validation failed',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the whole protocol did not pass its checks, and the checks said nothing more specific.',
  },
  settingsUnknownKey: {
    id: 'protocolBuilder.compoundEdit.settingsUnknownKey',
    defaultMessage: 'protocol settings contain unknown key {key}',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the protocol settings hold something this version does not recognise. key is the unrecognised setting name.',
  },
  settingsInvalid: {
    id: 'protocolBuilder.compoundEdit.settingsInvalid',
    defaultMessage: 'settings validation failed',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the protocol settings did not pass their checks, and the checks said nothing more specific.',
  },
  stageOrderUnknownKey: {
    id: 'protocolBuilder.compoundEdit.stageOrderUnknownKey',
    defaultMessage: 'stage order contains an unknown key',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the record of the interview step order holds something other than the order. "stage" is one step of an interview.',
  },
  stageOrderNotList: {
    id: 'protocolBuilder.compoundEdit.stageOrderNotList',
    defaultMessage: 'stage order must be a list of non-empty stage ids',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: the record of the interview step order is not a list of steps. "stage" is one step of an interview.',
  },
  stageOrderDuplicate: {
    id: 'protocolBuilder.compoundEdit.stageOrderDuplicate',
    defaultMessage: 'stage order lists the same stage twice',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: one step appears twice in the interview step order. "stage" is one step of an interview.',
  },
  assetInvalid: {
    id: 'protocolBuilder.compoundEdit.assetInvalid',
    defaultMessage: 'asset {assetId}: {reason}',
    description:
      'Why the host could not change the codebook alongside the interview step being edited: one of the resources in the protocol did not pass its checks. assetId identifies the resource; reason is the wording of the check that refused it.',
  },
  assetInvalidReason: {
    id: 'protocolBuilder.compoundEdit.assetInvalidReason',
    defaultMessage: 'asset validation failed',
    description:
      'Stands in for the reason a resource failed its checks when the checks said nothing more specific. Read inside the "asset {assetId}: {reason}" message.',
  },
});

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

const settingsSectionId = protocolSectionId({ kind: 'settings' });
const stageOrderSectionId = protocolSectionId({ kind: 'stageOrder' });
const assetsSectionId = protocolSectionId({ kind: 'assets' });
const egoSectionId = protocolSectionId({ kind: 'codebookEgo' });

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

  /**
   * Replaces sections the way a change made OUTSIDE every session on this host
   * reaches it, and answers with the revision the host issued for it.
   *
   * `null` removes a section. Nothing here is checked, and deliberately so: an
   * arrival is not a submission. There is no lease to hold because the change
   * was not made through this host's editing path, no base to be stale against
   * because the change IS the new base, and no draft to validate — whoever
   * made it already answered for it. A fixture seeding a codebook a stage
   * cannot satisfy (a node type deleted while a stage still names it) is
   * exactly the state a test needs to see an editor react to, and a host that
   * validated arrivals could not be told about it.
   *
   * What it must do is move the host's OWN revision, by the host's own rule.
   * A change the host does not know about leaves every later compound edit
   * built on top of it refused as stale, and a change the host applied under a
   * revision number nobody else agrees with is worse: the session drops the
   * next arrival as conflicting, silently. So the revision this answers with
   * is the one to hand whoever is being told about the change.
   */
  receiveAuthoritativeSections(
    sections: Readonly<Record<string, SectionDoc | null>>,
  ): InMemoryCompoundHostSnapshot {
    const working = cloneSections(this.protocolSections);
    for (const [sectionId, document] of Object.entries(sections)) {
      if (document === null) delete working[sectionId];
      else defineSection(working, sectionId, document);
    }
    this.manifestRevision = nextManifestRevision(
      this.manifestRevision,
      working,
    );
    this.protocolSections = working;
    return this.getSnapshot();
  }

  submit(submission: CompoundEditSubmission): CompoundEditResult {
    const fingerprint = submissionFingerprint(submission);
    if (fingerprint === null) {
      return failed(
        'invalid-request',
        createMessageError(compoundRequestMessages.notSerializable),
      );
    }

    const stored = this.requests.get(submission.id);
    if (stored !== undefined && stored.fingerprint !== fingerprint) {
      return failed(
        'invalid-request',
        createMessageError(compoundRequestMessages.requestIdReused, {
          requestId: submission.id,
        }),
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
        createMessageError(messages.leaseGone),
        submission.authority.sectionId,
      );
    }

    if (primaryLease.leaseOwner !== submission.authority.leaseOwner) {
      return failed(
        'lease-lost',
        createMessageError(messages.leaseTaken),
        submission.authority.sectionId,
        primaryLease.holder,
      );
    }

    if (primaryLease.leaseEpoch !== submission.authority.leaseEpoch) {
      return failed(
        'stale-epoch',
        createMessageError(messages.leaseEpochStale),
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
          createMessageError(messages.staleBase),
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
              createMessageError(messages.sectionExists),
            );
          }
          defineSection(working, edit.sectionId, edit.document);
          continue;
        }

        if (!Object.hasOwn(working, edit.sectionId)) {
          throw new CompoundHostSectionError(
            edit.sectionId,
            edit.kind === 'remove'
              ? createMessageError(messages.removeMissingSection)
              : createMessageError(messages.updateMissingSection),
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
            createMessageError(messages.updateMissingDocument),
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
        error instanceof Error
          ? error.message
          : createMessageError(messages.failed),
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
        createMessageError(messages.unknownSectionNamed),
      );
    }

    const result = (() => {
      switch (ref.kind) {
        case 'stage':
          if (document.id !== ref.stageId) {
            throw new CompoundHostSectionError(
              sectionId,
              createMessageError(messages.stageIdMismatch),
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
        createMessageError(messages.unsupportedSection),
      );
    })();

    if (!result.success) {
      const message =
        result.error.issues[0]?.message ??
        createMessageError(messages.sectionInvalid);
      throw new CompoundHostSectionError(sectionId, message);
    }
  }

  validateCompleteCanonicalProtocol(protocolSections, changedSectionIds);
};

function validateCompleteCanonicalProtocol(
  protocolSections: Readonly<Record<string, SectionDoc>>,
  changedSectionIds: readonly ProtocolSectionId[],
): void {
  let protocol: Record<string, unknown>;
  try {
    protocol = assembleProtocolSections(protocolSections);
  } catch (error: unknown) {
    // The assembler's own wording is passed through — that copy belongs to
    // `@codaco/studio-sync` — and it is also what decides which section the
    // failure is reported against, so the routing reads the raw text rather
    // than an encoded stand-in that would never contain the words it looks for.
    const reported = error instanceof Error ? error.message : null;
    throw new CompoundHostSectionError(
      sectionForAssemblyFailure(reported ?? '', changedSectionIds),
      reported ?? createMessageError(messages.assemblyFailed),
    );
  }

  const result = CurrentProtocolSchema.safeParse(protocol);
  if (result.success) return;

  const issue = result.error.issues[0];
  throw new CompoundHostSectionError(
    sectionForProtocolIssue(
      protocolSections,
      issue?.path ?? [],
      changedSectionIds,
    ),
    issue?.message ?? createMessageError(messages.protocolInvalid),
  );
}

function sectionForAssemblyFailure(
  message: string,
  changedSectionIds: readonly ProtocolSectionId[],
): ProtocolSectionId {
  if (message.includes('settings')) return settingsSectionId;
  if (message.includes('stageOrder')) return stageOrderSectionId;
  return changedSectionIds[0] ?? settingsSectionId;
}

function sectionForProtocolIssue(
  protocolSections: Readonly<Record<string, SectionDoc>>,
  path: readonly PropertyKey[],
  changedSectionIds: readonly ProtocolSectionId[],
): ProtocolSectionId {
  const [root, category, entityId] = path;

  if (root === 'stages') {
    const order = protocolSections[stageOrderSectionId]?.stages;
    const stageId =
      Array.isArray(order) && typeof category === 'number'
        ? order[category]
        : undefined;
    return typeof stageId === 'string'
      ? protocolSectionId({ kind: 'stage', stageId })
      : stageOrderSectionId;
  }

  if (root === 'codebook') {
    if (category === 'ego') return egoSectionId;
    if (typeof entityId === 'string') {
      if (category === 'node') {
        return protocolSectionId({ kind: 'codebookNode', typeId: entityId });
      }
      if (category === 'edge') {
        return protocolSectionId({ kind: 'codebookEdge', typeId: entityId });
      }
    }
  }

  if (root === 'assetManifest') return assetsSectionId;
  if (
    root === 'name' ||
    root === 'description' ||
    root === 'experiments' ||
    root === 'lastModified' ||
    root === 'schemaVersion'
  ) {
    return settingsSectionId;
  }

  return changedSectionIds[0] ?? settingsSectionId;
}

function validateSettingsSection(
  document: Readonly<SectionDoc>,
): CanonicalSectionValidation {
  const unknownKey = Object.keys(document).find(
    (key) => !SETTINGS_KEYS.has(key),
  );
  if (unknownKey !== undefined) {
    return invalidSection(
      createMessageError(messages.settingsUnknownKey, { key: unknownKey }),
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
        result.error.issues[0]?.message ??
          createMessageError(messages.settingsInvalid),
      );
}

function validateStageOrderSection(
  document: Readonly<SectionDoc>,
): CanonicalSectionValidation {
  if (Object.keys(document).some((key) => key !== 'stages')) {
    return invalidSection(createMessageError(messages.stageOrderUnknownKey));
  }
  const stages = document.stages;
  if (
    !Array.isArray(stages) ||
    stages.some((stageId) => typeof stageId !== 'string' || stageId === '')
  ) {
    return invalidSection(createMessageError(messages.stageOrderNotList));
  }
  if (new Set(stages).size !== stages.length) {
    return invalidSection(createMessageError(messages.stageOrderDuplicate));
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
        createMessageError(messages.assetInvalid, {
          assetId,
          reason: result.error.issues[0]?.message ?? {
            messageError: createMessageError(messages.assetInvalidReason),
          },
        }),
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
      createMessageError(compoundRequestMessages.missingId),
    );
  }

  const seen = new Set<ProtocolSectionId>();
  for (const edit of submission.edits) {
    if (seen.has(edit.sectionId)) {
      return failed(
        'invalid-request',
        createMessageError(compoundRequestMessages.duplicateSection),
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
        createMessageError(compoundRequestMessages.unknownSection),
        edit.sectionId,
      );
    }
    if (edit.kind === 'update' && edit.commands.length === 0) {
      return failed(
        'invalid-request',
        createMessageError(compoundRequestMessages.updateNeedsCommands),
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
        createMessageError(compoundRequestMessages.editNeedsHash),
        edit.sectionId,
      );
    }
    if (
      edit.kind === 'update' &&
      ref.kind === 'stage' &&
      edit.commands.some((command) => {
        const key = targetRoot(command.key);
        return key === 'id' || key === 'type';
      })
    ) {
      return failed(
        'invalid-request',
        createMessageError(compoundRequestMessages.stageIdentityLocked),
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
        createMessageError(compoundRequestMessages.structuralSectionLocked),
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
