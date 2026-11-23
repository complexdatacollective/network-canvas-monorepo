import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type FixtureStage,
  fixtureStageIds,
  loadFixtureStage,
} from '@codaco/protocol-builder/testing/protocolFixture';
import { renderStageEditor } from '@codaco/protocol-builder/testing/renderStageEditor';

import { architectStageEditors } from '../../architectStageEditors';
import { loadWalkthrough } from '../parseWalkthrough';

/**
 * Each walkthrough names only sections its own stage editor has.
 *
 * A key from the global list is not enough: a step naming a key that this
 * stage type's editor never renders highlights nothing, and the panel waits in
 * its corner. So each stage type's editor is mounted the way Architect mounts
 * it (with Architect's own editors in place of the package's), over a
 * configured stage of that type from the shared all-interfaces protocol, and
 * every step's section is looked for among the sections it publishes.
 *
 * Some sections appear only once a setting they depend on is on, such as the
 * built-in wording of a bin's "place every node" notice, so those settings are
 * switched on first. The Language Chooser is the exception: Architect's
 * version of its languages section needs Architect's store, so it is checked
 * in StageLanguagesSection.test.tsx instead.
 */

afterEach(cleanup);

const contentFile = /^\.\.\/content\/(.+)\.md$/;
const stageTypes = Object.keys(import.meta.glob('../content/*.md')).map(
  (path) => contentFile.exec(path)?.[1] ?? path,
);

/** Checked in StageLanguagesSection.test.tsx, with Architect's store. */
const CHECKED_ELSEWHERE = new Set(['LanguageChooser']);

/** A configured fixture stage of each type, by type. */
const fixtureStageOfType = new Map<string, FixtureStage>();
for (const id of fixtureStageIds()) {
  const stage = loadFixtureStage(id);
  if (!fixtureStageOfType.has(stage.type)) {
    fixtureStageOfType.set(stage.type, stage);
  }
}

/** The stage's fields with these behaviours switched on as well. */
function withBehaviours(
  fields: FixtureStage['fields'],
  extra: Readonly<Record<string, unknown>>,
): FixtureStage['fields'] {
  const current = fields.behaviours;
  const behaviours =
    typeof current === 'object' && current !== null ? current : {};
  return { ...fields, behaviours: { ...behaviours, ...extra } };
}

/** Settings that make conditional sections appear, by stage type. */
const REVEAL: Readonly<
  Record<string, (fields: FixtureStage['fields']) => FixtureStage['fields']>
> = {
  // The built-in wording section rewords the "place every node" notice.
  CategoricalBin: (fields) =>
    withBehaviours(fields, { requireCompletePlacement: true }),
  OrdinalBin: (fields) =>
    withBehaviours(fields, { requireCompletePlacement: true }),
  // ...and a name generator's minimum and maximum notices.
  NameGenerator: (fields) =>
    withBehaviours(fields, { minNodes: 1, maxNodes: 5 }),
};

describe('walkthrough sections', () => {
  it('has a fixture stage for every stage type with a walkthrough', () => {
    expect(stageTypes.filter((type) => !fixtureStageOfType.has(type))).toEqual(
      [],
    );
  });

  it.each(stageTypes.filter((type) => !CHECKED_ELSEWHERE.has(type)))(
    '%s names only sections its editor renders',
    async (type) => {
      const walkthrough = await loadWalkthrough(type);
      const stage = fixtureStageOfType.get(type);
      if (walkthrough === undefined || stage === undefined) {
        throw new Error(`No walkthrough or fixture stage for ${type}`);
      }

      const reveal = REVEAL[type];
      const harness = renderStageEditor({
        stage: {
          id: stage.id,
          type: stage.type,
          fields: reveal === undefined ? stage.fields : reveal(stage.fields),
        },
        registry: architectStageEditors,
      });
      await harness.opened();
      const rendered = new Set<string>(harness.sectionKeys());

      const missing = walkthrough.steps.flatMap((step) =>
        step.section !== undefined && !rendered.has(step.section)
          ? [`"${step.title}" names section "${step.section}"`]
          : [],
      );
      expect(missing).toEqual([]);
    },
    20_000,
  );
});
