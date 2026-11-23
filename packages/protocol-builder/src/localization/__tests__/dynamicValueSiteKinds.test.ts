import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  anonymisationStage,
  categoricalBinPromptSchema,
  ComposerFormFieldSchema,
  type DynamicValueSite,
  familyPedigreeStage,
  finishSessionStage,
  FormFieldSchema,
  geospatialStage,
  informationStage,
  IntroductionPanelSchema,
  nameGeneratorRosterStage,
  nameGeneratorStage,
  promptSchema,
  sociogramStage,
  tieStrengthCensusPromptSchema,
  VariableSchema,
} from '@codaco/protocol-validation';

import { declaredDynamicValueSite } from '../../testing/declaredDynamicValueSite.ts';

type Path = readonly (string | number)[];

type EditorSite = Readonly<{
  kind: DynamicValueSite;
  schema: z.ZodType;
  path: Path;
}>;

/**
 * Every editor field that restates its dynamic-value site as a prop
 * (`dynamicValues="…"`), by source file and in source order, with the schema
 * field it edits. The kind written in the editor must be the kind the schema
 * declares for that field.
 */
const EDITOR_SITES: Readonly<Record<string, readonly EditorSite[]>> = {
  'sections/name-generator-prompts/NameGeneratorPromptsSection.tsx': [
    { kind: 'prompt', schema: promptSchema, path: ['text'] },
  ],
  'fields/PromptTextField.tsx': [
    { kind: 'prompt', schema: promptSchema, path: ['text'] },
  ],
  'sections/introduction/IntroductionSection.tsx': [
    { kind: 'stageText', schema: IntroductionPanelSchema, path: ['title'] },
    { kind: 'stageText', schema: IntroductionPanelSchema, path: ['text'] },
  ],
  'sections/panels/NodePanelsSection.tsx': [
    {
      kind: 'stageText',
      schema: nameGeneratorStage,
      path: ['panels', 0, 'title'],
    },
  ],
  'sections/content-blocks/ContentBlockEditor.tsx': [
    {
      kind: 'stageText',
      schema: informationStage,
      path: ['items', 0, 'content'],
    },
  ],
  'sections/form-fields/ComposerFormFields.tsx': [
    { kind: 'formField', schema: ComposerFormFieldSchema, path: ['label'] },
    { kind: 'formField', schema: ComposerFormFieldSchema, path: ['hint'] },
  ],
  'sections/form-fields/FormFieldsSection.tsx': [
    { kind: 'stageText', schema: nameGeneratorStage, path: ['form', 'title'] },
    { kind: 'formField', schema: FormFieldSchema, path: ['prompt'] },
    { kind: 'formField', schema: FormFieldSchema, path: ['hint'] },
  ],
  'sections/page-content/PageContentSection.tsx': [
    { kind: 'stageText', schema: informationStage, path: ['title'] },
  ],
  'editors/sociogram/sections/prompts/SociogramPromptFields.tsx': [
    {
      kind: 'prompt',
      schema: sociogramStage,
      path: ['prompts', 0, 'text'],
    },
  ],
  'editors/categorical-bin/sections/CategoricalBinPromptsSection.tsx': [
    {
      kind: 'stageText',
      schema: categoricalBinPromptSchema,
      path: ['otherOptionLabel'],
    },
    {
      kind: 'formField',
      schema: categoricalBinPromptSchema,
      path: ['otherVariablePrompt'],
    },
  ],
  'editors/tie-strength-census/sections/TieStrengthCensusPromptsSection.tsx': [
    {
      kind: 'prompt',
      schema: tieStrengthCensusPromptSchema,
      path: ['negativeLabel'],
    },
  ],
  'editors/finish-session/sections/FinishedScreenSection.tsx': [
    {
      kind: 'stageText',
      schema: finishSessionStage,
      path: ['finishedContent'],
    },
  ],
  'editors/finish-session/sections/ClosingScreenSection.tsx': [
    { kind: 'stageText', schema: finishSessionStage, path: ['content'] },
  ],
  'editors/name-generator-roster/sections/RosterPanelSection.tsx': [
    {
      kind: 'stageText',
      schema: nameGeneratorRosterStage,
      path: ['panelTitle'],
    },
  ],
  'editors/anonymisation/sections/TaskExplanationSection.tsx': [
    {
      kind: 'stageText',
      schema: anonymisationStage,
      path: ['explanationText'],
    },
  ],
  'editors/family-pedigree/sections/PedigreePromptSection.tsx': [
    { kind: 'prompt', schema: familyPedigreeStage, path: ['prompt'] },
  ],
  'editors/family-pedigree/sections/participantWordingSettings.ts': [
    {
      kind: 'stageText',
      schema: familyPedigreeStage,
      path: ['wording', 'you'],
    },
  ],
  'editors/geospatial/sections/GeospatialPromptFields.tsx': [
    {
      kind: 'prompt',
      schema: geospatialStage,
      path: ['prompts', 0, 'text'],
    },
  ],
  'codebook/components/VariableParameterFields.tsx': [
    {
      kind: 'formField',
      schema: ComposerFormFieldSchema,
      path: ['parameters', 'minLabel'],
    },
    {
      kind: 'formField',
      schema: ComposerFormFieldSchema,
      path: ['parameters', 'maxLabel'],
    },
  ],
};

const sources = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SITE_PROP =
  /\bdynamicValues(?:=|:\s*)(?:\{\s*)?['"](stageText|prompt|formField|nodeLabel)['"]/g;

const NOT_EDITOR_SOURCE = /(__tests__|\.test\.|\.stories\.)/;

/** The kinds each source file writes out as a literal, in source order. */
const writtenKinds = (): Record<string, string[]> => {
  const found: Record<string, string[]> = {};
  for (const [file, source] of Object.entries(sources)) {
    if (NOT_EDITOR_SOURCE.test(file)) continue;
    const kinds = [...source.matchAll(SITE_PROP)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );
    if (kinds.length > 0) found[file.replace('../../', '')] = kinds;
  }
  return found;
};

describe('the site kinds editors write out', () => {
  it('covers every editor field that restates its site, and no other file', () => {
    const covered = Object.fromEntries(
      Object.entries(EDITOR_SITES).map(([file, sites]) => [
        file,
        sites.map((site) => site.kind),
      ]),
    );
    expect(writtenKinds()).toEqual(covered);
  });

  describe.each(Object.entries(EDITOR_SITES))('%s', (_file, sites) => {
    it.each(sites.map((site) => [site.path.join('.'), site] as const))(
      'edits %s at the site its schema declares',
      (_path, { kind, schema, path }) => {
        expect(declaredDynamicValueSite(schema, path)).toBe(kind);
      },
    );
  });

  it('offers a codebook scale’s end labels no values, as the schema does', () => {
    expect(
      declaredDynamicValueSite(VariableSchema, ['parameters', 'minLabel']),
    ).toBe(undefined);
    expect(
      declaredDynamicValueSite(VariableSchema, ['parameters', 'maxLabel']),
    ).toBe(undefined);
  });
});
