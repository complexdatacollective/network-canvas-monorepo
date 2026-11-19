import { renderHook, waitFor } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { ProtocolBuilderTag } from '@codaco/protocol-builder-core/contract';
import {
  InvalidShape,
  NotLockHolder,
  PromotionFailed,
  ProtocolNotFound,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import type { Refusal } from '../../state/attempt.ts';
import type { CodebookRefusal } from '../../state/codebookRefusal.ts';
import { beforeCall } from '../../testing/host/beforeCall.ts';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { sectionsFromProtocol } from '../../testing/host/sectionsFromProtocol.ts';
import {
  useCodebookSectionWrite,
  useCreateCodebookEntity,
  useDeleteCodebookVariable,
  type CodebookWriteOutcome,
} from '../writes.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * Every refusal the contract declares for a procedure, keyed by its tag.
 *
 * Keyed by the contract's own union, so a refusal added to a procedure fails
 * to type-check here until it is listed — and, once listed, is driven through
 * the write below and must come out as something other than "could not be
 * sent".
 */
type RefusalsOf<Tag extends ProtocolBuilderTag> = {
  readonly [Name in Refusal<Tag>['_tag']]: () => Extract<
    Refusal<Tag>,
    { _tag: Name }
  >;
};

const acquireRefusals: RefusalsOf<'AcquireLock'> = {
  ProtocolNotFound: () => new ProtocolNotFound({ protocolId: 'protocol' }),
  SectionNotFound: () => new SectionNotFound({ sectionId: PERSON }),
};

const submitRefusals: RefusalsOf<'Submit'> = {
  ...acquireRefusals,
  NotLockHolder: () => new NotLockHolder({ sectionId: PERSON }),
  SectionsLocked: () => new SectionsLocked({ blocked: [] }),
  InvalidShape: () => new InvalidShape({ sectionId: PERSON, issues: [] }),
  PromotionFailed: () =>
    new PromotionFailed({
      failure: {
        reason: 'promotion-failed',
        message: 'the files could not be committed',
        retryable: true,
      },
    }),
};

const createRefusals: RefusalsOf<'Create'> = {
  ...acquireRefusals,
  SectionsLocked: submitRefusals.SectionsLocked,
  InvalidShape: submitRefusals.InvalidShape,
  PromotionFailed: submitRefusals.PromotionFailed,
  SectionExists: () => new SectionExists({ sectionId: PERSON }),
};

const refactorRefusals: RefusalsOf<'RefactorDeleteVariable'> = {
  ...acquireRefusals,
  SectionsLocked: submitRefusals.SectionsLocked,
  ReferencesRemain: () => new ReferencesRemain({ remaining: [] }),
};

/** What each refusal tells the researcher, wherever a codebook write meets it. */
const EXPECTED: Readonly<Record<string, CodebookRefusal['kind']>> = {
  ProtocolNotFound: 'protocolGone',
  SectionNotFound: 'sectionGone',
  NotLockHolder: 'held',
  SectionsLocked: 'held',
  InvalidShape: 'invalidShape',
  PromotionFailed: 'promotionFailed',
  SectionExists: 'sectionCreatedElsewhere',
  ReferencesRemain: 'referencesRemain',
};

const cases = (refusals: object) =>
  Object.entries(refusals as Record<string, () => Error>);

/**
 * Renders the codebook write hooks against a host whose `refuse` decides,
 * per call, what to reject it with.
 */
async function writesRefusing(refuse: (tag: ProtocolBuilderTag) => unknown) {
  const host = createInMemoryHost({ sections: sectionsFromProtocol(FIXTURE) });
  const adapter = beforeCall(host.adapter, (tag) => {
    const refusal = refuse(tag);
    return refusal === undefined ? undefined : Promise.reject(refusal);
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProtocolBuilder adapter={adapter} protocolId={host.protocolId}>
      <Suspense fallback={null}>{children}</Suspense>
    </ProtocolBuilder>
  );
  const { result } = renderHook(
    () => ({
      rewrite: useCodebookSectionWrite(),
      createEntity: useCreateCodebookEntity(),
      deleteVariable: useDeleteCodebookVariable(),
    }),
    { wrapper },
  );
  await waitFor(() => expect(result.current).not.toBeNull());
  return result.current;
}

const kindOf = (outcome: CodebookWriteOutcome): string =>
  outcome.status === 'refused' ? outcome.refusal.kind : outcome.status;

describe('a codebook write the host refuses', () => {
  it.each(cases(acquireRefusals))(
    'answers a lock refused with %s in the researcher’s terms',
    async (name, refusal) => {
      const writes = await writesRefusing((tag) =>
        tag === 'AcquireLock' ? refusal() : undefined,
      );
      const outcome = await writes.rewrite(
        { entity: 'node', type: 'person' },
        (document) => document,
      );
      expect(kindOf(outcome)).toBe(EXPECTED[name]);
    },
  );

  it.each(cases(submitRefusals))(
    'answers a rewrite refused with %s in the researcher’s terms',
    async (name, refusal) => {
      const writes = await writesRefusing((tag) =>
        tag === 'Submit' ? refusal() : undefined,
      );
      const outcome = await writes.rewrite(
        { entity: 'node', type: 'person' },
        (document) => document,
      );
      expect(kindOf(outcome)).toBe(EXPECTED[name]);
    },
  );

  it.each(cases(createRefusals))(
    'answers the participant’s first attribute refused with %s in the researcher’s terms',
    async (name, refusal) => {
      const writes = await writesRefusing((tag) => {
        // No participant section yet, so the write creates it.
        if (tag === 'AcquireLock') {
          return new SectionNotFound({
            sectionId: sectionId({ kind: 'codebookEgo' }),
          });
        }
        return tag === 'Create' ? refusal() : undefined;
      });
      const outcome = await writes.rewrite(
        { entity: 'ego' },
        (document) => document,
      );
      expect(kindOf(outcome)).toBe(EXPECTED[name]);
    },
  );

  it.each(cases(createRefusals))(
    'answers a new node type refused with %s in the researcher’s terms',
    async (name, refusal) => {
      const writes = await writesRefusing((tag) =>
        tag === 'Create' ? refusal() : undefined,
      );
      const outcome = await writes.createEntity('node', { name: 'Place' });
      // The host mints a node type's section, so no collaborator can have
      // made it first: the sentence for that is about the participant's.
      expect(kindOf(outcome)).toBe(
        name === 'SectionExists' ? 'unreachable' : EXPECTED[name],
      );
    },
  );

  it.each(cases(refactorRefusals))(
    'answers an attribute deletion refused with %s in the researcher’s terms',
    async (name, refusal) => {
      const writes = await writesRefusing((tag) =>
        tag === 'RefactorDeleteVariable' ? refusal() : undefined,
      );
      const outcome = await writes.deleteVariable(
        { entity: 'node', type: 'person' },
        'name',
      );
      expect(kindOf(outcome)).toBe(EXPECTED[name]);
    },
  );
});
