import { describe, expect, it, vi } from 'vitest';

import {
  CurrentProtocolSchema,
  type Stage,
  type StageType,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';

import { shimMarkdownEditorMeasurement } from '../../../editors/family-pedigree/__tests__/editorFixtures.ts';
import { STAGE_TYPES } from '../../../stage-types.ts';
import { enIntl } from '../../../testing/i18n.ts';
import type { FixtureStageId } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { stageWalkthrough } from '../stageWalkthroughs.ts';

vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

shimMarkdownEditorMeasurement();

/** The fixture stage each interface's editor is opened on. */
const FIXTURE_STAGES = {
  AlterEdgeForm: 'alter-edge-form-1',
  AlterForm: 'alter-form-1',
  Anonymisation: 'anonymisation-1',
  CategoricalBin: 'categorical-bin-1',
  DyadCensus: 'dyad-census-1',
  EgoForm: 'ego-form-1',
  FamilyPedigree: 'family-pedigree-1',
  FinishSession: 'finish',
  Geospatial: 'geospatial-1',
  Information: 'information-1',
  LanguageChooser: 'language-chooser-1',
  NameGenerator: 'name-generator-1',
  NameGeneratorQuickAdd: 'name-generator-quick-add-1',
  NameGeneratorRoster: 'name-generator-roster-1',
  Narrative: 'narrative-1',
  NarrativePedigree: 'narrative-pedigree-1',
  NetworkComposer: 'network-composer-1',
  OneToManyDyadCensus: 'one-to-many-dyad-census-1',
  OrdinalBin: 'ordinal-bin-1',
  Sociogram: 'sociogram-1',
  TieStrengthCensus: 'tie-strength-census-1',
} as const satisfies Record<StageType, FixtureStageId>;

/**
 * Steps whose section the editor shows only once another setting is on, which
 * the fixture's stage leaves off. The panel drops these until it is.
 */
const HIDDEN_ON_FIXTURE: Partial<Record<StageType, readonly string[]>> = {
  // The limit notices appear only when the stage sets a limit.
  NameGenerator: ['wording'],
  // The unplaced-nodes notice applies only when every node must be placed.
  OrdinalBin: ['wording'],
};

const fixtureStages: readonly Stage[] =
  CurrentProtocolSchema.parse(allInterfaces).stages;

function fixtureStage(stageId: string): Stage {
  const stage = fixtureStages.find((candidate) => candidate.id === stageId);
  if (stage === undefined) throw new Error(`No fixture stage "${stageId}"`);
  return stage;
}

function walkthroughFor(type: StageType) {
  const steps = stageWalkthrough(type);
  if (steps === undefined) throw new Error(`No walkthrough for ${type}`);
  return steps;
}

describe('stage walkthroughs', () => {
  it.each(STAGE_TYPES)('%s has a walkthrough', (type) => {
    const steps = walkthroughFor(type);
    expect(steps.at(0)?.id).toBe('intro');
    expect(steps.at(-1)?.id).toBe('finish');
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
  });

  /**
   * The panel matches a step to a section by its title, in order, and drops
   * a step whose section it cannot find — so a step pointed at a title the
   * editor never shows would vanish without a word. Steps behind a question
   * (`when`) may name a section that appears only once their feature is set,
   * which the fixture's stage may not use; every other step's section is on
   * screen for any stage.
   */
  it.each(STAGE_TYPES)(
    '%s points every step at a section its editor shows, in order',
    (type) => {
      const { outline } = renderStageEditor({
        stageId: FIXTURE_STAGES[type],
      });
      const titles = outline().map((section) => section.title);
      const missing: string[] = [];
      let cursor = 0;
      for (const step of walkthroughFor(type)) {
        if (step.target === undefined) continue;
        const conditional =
          step.when !== undefined ||
          (HIDDEN_ON_FIXTURE[type]?.includes(step.id) ?? false);
        const title = enIntl.formatMessage(step.target.section);
        const found = titles.findIndex(
          (candidate, position) => position >= cursor && candidate === title,
        );
        if (found !== -1) cursor = found;
        else if (!conditional) missing.push(`${step.id} → "${title}"`);
      }
      expect(missing, `sections: ${titles.join(' | ')}`).toEqual([]);
    },
  );

  /**
   * A required step holds Next until it reports done. On a stage that has
   * everything set, each must — otherwise the check reads the stage wrongly
   * and a researcher could never get past it.
   */
  it.each(STAGE_TYPES)(
    '%s reports every unconditional required step done on a complete stage',
    (type) => {
      const stage = fixtureStage(FIXTURE_STAGES[type]);
      const stuck = walkthroughFor(type)
        .filter(
          (step) =>
            step.done !== undefined &&
            step.optional !== true &&
            step.when === undefined &&
            !step.done(stage),
        )
        .map((step) => step.id);
      expect(stuck).toEqual([]);
    },
  );
});
