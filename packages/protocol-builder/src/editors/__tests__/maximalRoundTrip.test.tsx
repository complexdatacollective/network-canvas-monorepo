import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorRegistry } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { formStageEditors } from '../formStageEditors.ts';
import { nameGeneratorStageEditors } from '../nameGeneratorStageEditors.ts';

/** See each editor's own test for why the rich-text editor is stood in for. */
vi.mock('../../fields/RichTextField.tsx', () => ({
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

const nodeFilter = {
  join: 'AND' as const,
  rules: [
    {
      type: 'node' as const,
      id: 'rule-1',
      options: { type: 'person', operator: 'EXISTS' as const },
    },
  ],
};

const edgeFilter = {
  join: 'AND' as const,
  rules: [
    {
      type: 'edge' as const,
      id: 'rule-2',
      options: { type: 'knows', operator: 'EXISTS' as const },
    },
  ],
};

const skipLogic = {
  action: 'SHOW' as const,
  filter: nodeFilter,
  destination: { type: 'finish' as const },
};

type MaximalStage = Readonly<{
  /** Names the case, and is what a failure reports. */
  interfaceName: string;
  type: StageType;
  registry: Partial<StageEditorRegistry>;
  /** Every key this interface's schema offers, filled in. */
  fields: SectionDoc;
  /** Something to wait for, so the editor has finished mounting. */
  settle: () => Promise<unknown>;
}>;

const stageName = () => screen.findByRole('textbox', { name: 'Stage name' });

const MAXIMAL_STAGES: MaximalStage[] = [
  {
    interfaceName: 'Information',
    type: 'Information',
    registry: formStageEditors,
    fields: {
      label: 'Information',
      title: 'Welcome',
      interviewScript: 'Read this aloud.',
      skipLogic,
      items: [
        {
          id: 'info-item-1',
          type: 'text',
          content: 'Welcome to this interview.',
          description: 'The opening line.',
        },
        {
          id: 'info-item-2',
          type: 'asset',
          content: 'geo_data',
          description: 'A map of the regions.',
          size: 'LARGE',
        },
      ],
    },
    settle: stageName,
  },
  {
    interfaceName: 'EgoForm',
    type: 'EgoForm',
    registry: formStageEditors,
    fields: {
      label: 'Ego Form',
      interviewScript: 'Ask about them.',
      skipLogic,
      introductionPanel: { title: 'Introduction', text: 'A few questions.' },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'ego_name',
            prompt: 'What is your name?',
            hint: 'Your full name.',
            showValidationHints: true,
          },
        ],
      },
    },
    settle: stageName,
  },
  {
    interfaceName: 'AlterForm',
    type: 'AlterForm',
    registry: formStageEditors,
    fields: {
      label: 'Alter Form',
      interviewScript: 'Ask about each person.',
      skipLogic,
      filter: nodeFilter,
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'Introduction', text: 'A few questions.' },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'relationship_to_ego',
            prompt: 'Relationship?',
            hint: 'How you know them.',
            showValidationHints: true,
          },
        ],
      },
    },
    settle: stageName,
  },
  {
    interfaceName: 'AlterEdgeForm',
    type: 'AlterEdgeForm',
    registry: formStageEditors,
    fields: {
      label: 'Alter Edge Form',
      interviewScript: 'Ask about each relationship.',
      skipLogic,
      filter: edgeFilter,
      subject: { entity: 'edge', type: 'knows' },
      introductionPanel: { title: 'Introduction', text: 'A few questions.' },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'edgeNotes',
            prompt: 'Any notes?',
            hint: 'Free text.',
            showValidationHints: true,
          },
        ],
      },
    },
    settle: stageName,
  },
  {
    interfaceName: 'NameGenerator',
    type: 'NameGenerator',
    registry: nameGeneratorStageEditors,
    fields: {
      label: 'Name Generator',
      interviewScript: 'Guidance.',
      skipLogic,
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [
          {
            id: 'field-1',
            variable: 'name',
            prompt: 'What is their name?',
            hint: 'Their first name.',
            showValidationHints: true,
          },
        ],
      },
      prompts: [
        {
          id: 'p1',
          text: 'Who are the people you know?',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      panels: [
        {
          id: 'panel-1',
          title: 'People you named earlier',
          dataSource: 'existing',
          filter: nodeFilter,
        },
        { id: 'panel-2', title: 'From the roster', dataSource: 'roster_data' },
      ],
      behaviours: { minNodes: 1, maxNodes: 8 },
    },
    settle: () => screen.findByRole('textbox', { name: 'Form title' }),
  },
];

/**
 * Every key each interface's schema offers, opened in the real editor and
 * saved without a single edit.
 *
 * The per-editor round trips each open ONE fixture stage, which holds a
 * plausible configuration rather than an exhaustive one — so a key no section
 * renders, or renders and then rewrites, can sit unnoticed in a corner of the
 * schema nothing in the fixture exercises. This seeds the corners.
 *
 * The claims themselves are `roundTrip`'s, not this file's: what is on SCREEN
 * (a key nothing has a field for survives untouched by design, so no
 * comparison can ever see it) and what came BACK (a key the editor renders can
 * still be dropped, rewritten, or invented by the save). Asked through the
 * shared helper so the corners are held to the same standard as the fixture
 * stages — including its reach into nested keys, which is where a maximal
 * stage has most of its content.
 */
describe('a maximal stage of each interface', () => {
  it.each(MAXIMAL_STAGES)(
    '$interfaceName: is fully editable, and saves every key unchanged',
    async ({ type, registry, fields, settle }) => {
      const harness = renderStageEditor({
        stage: { type, fields },
        registry,
      });
      await settle();
      // Every section registers its fields on mount, and the outline is built
      // from what is registered — so a mount that has not filled the outline
      // has not finished registering.
      await waitFor(() => expect(harness.outline().length).toBeGreaterThan(2));

      // Nothing is excused: a maximal stage is the one case where every key
      // the interface offers must be on screen, so an empty `unowned` is the
      // whole claim about the outline.
      await harness.roundTrip({ unowned: [] });
    },
  );
});
