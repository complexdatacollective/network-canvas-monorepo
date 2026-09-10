import { safe } from '@orpc/client';
import { describe, expect, it } from 'vitest';

import type { SectionReference } from '@codaco/protocol-builder-core/contract/schemas';
import { declaredStageReferenceSites } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  createInMemoryHost,
  type InMemoryHost,
} from '../createInMemoryHost.ts';
import { sectionsFromProtocol } from '../sectionsFromProtocol.ts';

const FIXTURE: Record<string, unknown> = allInterfaces;

const stage = (stageId: string): ProtocolSectionId =>
  sectionId({ kind: 'stage', stageId });

/** A filter every stage in the fixture's codebook can carry. */
const ANY_PERSON = {
  rules: [
    {
      type: 'node',
      id: 'rule-1',
      options: { type: 'person', operator: 'EXISTS' },
    },
  ],
};

const informationWithSkipTo = (destination: SectionDoc): SectionDoc => ({
  ...(FIXTURE.stages as SectionDoc[]).filter(
    (document) => document.id === 'information-1',
  )[0],
  skipLogic: { action: 'SHOW', filter: ANY_PERSON, destination },
});

const narrativePedigreeAbout = (sourceStageId: string): SectionDoc => ({
  ...(FIXTURE.stages as SectionDoc[]).filter(
    (document) => document.id === 'narrative-pedigree-1',
  )[0],
  sourceStageId,
});

/**
 * One stage-reference kind, as a stage that names another stage and the stage
 * that names it.
 *
 * `dangling` is the same protocol with that one reference pointed somewhere
 * else, and nothing else changed. It is what makes the refusal below say
 * anything: without it a delete refused for some other reason — a lock, a
 * shape, a bug in the seed — reads exactly like a delete refused for the
 * reference this case is about.
 */
type ReferenceCase = Readonly<{
  /** The site the schema declares; see `stageReference`. */
  site: string;
  /** The stage the delete asks to remove. */
  target: string;
  /** Sections seeded over the fixture so `target` is depended on. */
  referring: Readonly<Record<ProtocolSectionId, SectionDoc>>;
  /** The same sections with the reference pointed elsewhere. */
  dangling: Readonly<Record<ProtocolSectionId, SectionDoc>>;
  /** Where the refusal has to say the reference is. */
  remaining: readonly SectionReference[];
}>;

const CASES: readonly ReferenceCase[] = [
  {
    site: 'skipLogic.destination.stageId',
    target: 'sociogram-1',
    referring: {
      [stage('information-1')]: informationWithSkipTo({
        type: 'stage',
        stageId: 'sociogram-1',
      }),
    },
    dangling: {
      [stage('information-1')]: informationWithSkipTo({ type: 'finish' }),
    },
    remaining: [
      {
        sectionId: stage('information-1'),
        path: ['skipLogic', 'destination', 'stageId'],
      },
    ],
  },
  {
    site: 'sourceStageId',
    target: 'family-pedigree-1',
    // The fixture already pairs these two, seeded here anyway so the case says
    // what it depends on rather than inheriting it.
    referring: {
      [stage('narrative-pedigree-1')]:
        narrativePedigreeAbout('family-pedigree-1'),
    },
    dangling: {
      [stage('narrative-pedigree-1')]:
        narrativePedigreeAbout('family-pedigree-2'),
    },
    remaining: [
      { sectionId: stage('narrative-pedigree-1'), path: ['sourceStageId'] },
    ],
  },
];

function hostWith(
  sections: Readonly<Record<ProtocolSectionId, SectionDoc>>,
): InMemoryHost {
  return createInMemoryHost({
    sections: { ...sectionsFromProtocol(FIXTURE), ...sections },
  });
}

/** Every section as it stands, by content, so a write of any kind shows up. */
function snapshot(host: InMemoryHost): Map<ProtocolSectionId, string> {
  const state = new Map<ProtocolSectionId, string>();
  for (const id of host.store.sectionIds()) {
    const section = host.store.read(id);
    state.set(
      id,
      `${section.revision.sequence}:${section.revision.contentHash}`,
    );
  }
  return state;
}

/** How a reference's path is spelled as a declared site. */
function siteOf(reference: SectionReference): string {
  return reference.path
    .map((segment) => (typeof segment === 'number' ? '*' : segment))
    .join('.');
}

describe('deleting a stage other stages depend on', () => {
  it('enumerates a case for every stage-reference kind the schema declares', () => {
    // A kind nobody exercises escapes the enumeration below entirely, so the
    // schema itself says what the list has to contain: a stage type tagged
    // with a new reference site fails here until a case covers it.
    expect(CASES.map((subject) => subject.site).toSorted()).toEqual(
      declaredStageReferenceSites().toSorted(),
    );
  });

  for (const subject of CASES) {
    it(`is refused naming the stage that reaches it through ${subject.site}`, async () => {
      const host = hostWith(subject.referring);
      const before = snapshot(host);

      const { definedError, isSuccess } = await safe(
        host.client.delete({
          protocolId: host.protocolId,
          sectionId: stage(subject.target),
        }),
      );

      expect(isSuccess).toBe(false);
      expect(definedError?.code).toBe('REFERENCES_REMAIN');
      expect(definedError?.data).toEqual({ remaining: subject.remaining });
      // The site the case names is where the reference actually is, so a tag
      // that moves cannot leave this enumeration testing the old path.
      expect(subject.remaining.map(siteOf)).toEqual([subject.site]);
      // Refused, so nothing was written: not the stage, not the order that
      // points at it, not the section holding the reference.
      expect(snapshot(host)).toEqual(before);
      expect(host.store.has(stage(subject.target))).toBe(true);
    });

    it(`takes the same delete once nothing reaches it through ${subject.site}`, async () => {
      const host = hostWith(subject.dangling);

      const deleted = await host.client.delete({
        protocolId: host.protocolId,
        sectionId: stage(subject.target),
      });

      expect(deleted.changedSections).toContain(stage(subject.target));
      expect(host.store.has(stage(subject.target))).toBe(false);
    });
  }
});
