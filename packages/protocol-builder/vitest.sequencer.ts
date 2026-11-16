import { relative, sep } from 'node:path';

import { BaseSequencer, type TestSpecification } from 'vitest/node';

/**
 * Splits the unit suite across CI's three protocol-builder legs by recorded
 * duration (`--shard=<k>/3`, from scripts/ci/test-shards.mjs).
 *
 * Vitest's own `--shard` sorts files by a hash of their path and cuts the
 * list into equal counts. Four files carry 40% of this suite's time, and the
 * hash put three of them on the first leg and none on the third: legs of
 * 1,203, 694 and 348 test-seconds. This packs files longest first into
 * whichever leg has the least so far, which splits the measured 2,245
 * test-seconds into three legs within 30 seconds of each other.
 *
 * Every leg computes the same packing (the same files, the same weights, ties
 * broken by path) and keeps its own part, so the legs never overlap and
 * together run every file. A stale or missing weight costs balance, never
 * coverage.
 *
 * TO REFRESH: take a full run of the three `test (shard 1, part k/3)` logs,
 * read each file's time from its `✓  unit  <file> (N tests) <ms>ms` line, and
 * list every file over ten seconds here.
 */
const SECONDS: Record<string, number> = {
  // From run 41408437901 (2 Nov 2026), whole suite on one runner.
  'src/sections/form-fields/__tests__/FormFieldsSection.test.tsx': 321,
  'src/editors/family-pedigree/__tests__/FamilyPedigreeStageEditor.test.tsx': 304,
  'src/editors/network-composer/__tests__/composerSections.test.tsx': 156,
  'src/form/arrayFields/__tests__/inlineListLifecycle.test.tsx': 113,
  'src/editors/__tests__/censusBinEditors.test.tsx': 54,
  'src/editors/sociogram/sections/prompts/__tests__/sociogramPrompts.test.tsx': 53,
  'src/editors/tie-strength-census/sections/__tests__/TieStrengthCensusPromptsSection.test.tsx': 49,
  'src/sections/create-variable/__tests__/creationIsOfferedThroughThePicker.test.tsx': 37,
  'src/sections/__tests__/sectionsLocale.test.tsx': 37,
  'src/rules/__tests__/RuleEditorDialog.test.tsx': 34,
  'src/__tests__/headingLadder.test.tsx': 33,
  'src/editors/geospatial/__tests__/geospatialSections.test.tsx': 29,
  'src/editors/family-pedigree/__tests__/PersonSymbols.test.tsx': 29,
  'src/sections/panels/__tests__/NodePanelsSection.test.tsx': 29,
  'src/editors/narrative-pedigree/__tests__/narrativePedigreeSections.test.tsx': 29,
  'src/editors/__tests__/maximalRoundTrip.test.tsx': 28,
  'src/rules/__tests__/operandTable.test.tsx': 28,
  'src/editors/anonymisation/__tests__/anonymisationSections.test.tsx': 25,
  'src/sections/__tests__/optionsRowCommit.test.tsx': 22,
  'src/fields/__tests__/VariablePickerField.test.tsx': 22,
  'src/editors/name-generator/__tests__/NameGeneratorStageEditor.test.tsx': 22,
  'src/localization/__tests__/rowDialogBindings.test.tsx': 22,
  'src/sections/__tests__/rowDialogLists.test.tsx': 22,
  'src/editors/ordinal-bin/sections/__tests__/OrdinalBinPromptsSection.test.tsx': 21,
  'src/editors/categorical-bin/sections/__tests__/CategoricalBinPromptsSection.test.tsx': 21,
  'src/sections/subject-picker/__tests__/SubjectSection.test.tsx': 21,
  'src/editors/alter-form/__tests__/AlterFormStageEditor.test.tsx': 21,
  'src/editors/ego-form/__tests__/EgoFormStageEditor.test.tsx': 18,
  'src/editors/alter-edge-form/__tests__/AlterEdgeFormStageEditor.test.tsx': 16,
  'src/editors/narrative/sections/presets/__tests__/narrativePresets.test.tsx': 15,
  'src/sections/prompts/__tests__/SortOrderRows.test.tsx': 14,
  'src/codebook/components/__tests__/VariableEditor.test.tsx': 14,
  'src/sections/content-blocks/__tests__/contentBlocks.test.tsx': 14,
  'src/editors/__tests__/schemaKeyCoverage.test.tsx': 14,
  'src/resources/components/__tests__/SecretResourcePicker.test.tsx': 14,
  'src/codebook/components/__tests__/nodeShapeMapping.test.tsx': 13,
  'src/sections/name-generator-prompts/__tests__/NameGeneratorPromptsSection.test.tsx': 12,
  'src/__tests__/stageEditorRegistry.test.tsx': 12,
  'src/sections/skip-logic/__tests__/SkipLogicSection.test.tsx': 12,
  'src/codebook/components/__tests__/CodebookEntityEditor.test.tsx': 12,
  'src/editors/name-generator-roster/sections/__tests__/rosterSections.test.tsx': 11,
  'src/fields/__tests__/entityTypeCodebookEditing.test.tsx': 11,
  'src/sections/__tests__/stageSectionsLocale.test.tsx': 11,
};

/** The mean of the files under the ten-second cutoff in the same run. */
const UNLISTED_SECONDS = 2;

export default class DurationSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]) {
    const { root, shard } = this.ctx.config;
    if (!shard) return files;

    const weighed = files
      .map((spec) => {
        const path = relative(root, spec.moduleId).split(sep).join('/');
        return { spec, path, seconds: SECONDS[path] ?? UNLISTED_SECONDS };
      })
      .toSorted((a, b) => b.seconds - a.seconds || (a.path < b.path ? -1 : 1));

    const loads = Array.from({ length: shard.count }, () => 0);
    const mine: TestSpecification[] = [];
    for (const { spec, seconds } of weighed) {
      const lightest = loads.indexOf(Math.min(...loads));
      loads[lightest] = (loads[lightest] ?? 0) + seconds;
      if (lightest === shard.index - 1) mine.push(spec);
    }
    return mine;
  }
}
