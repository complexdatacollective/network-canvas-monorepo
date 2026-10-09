import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  type StageType,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { stageEditorRegistry } from '../../stageEditorRegistry.ts';
import {
  loadFixtureStage,
  type FixtureStageId,
} from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import { openEveryWordingGroup } from '../family-pedigree/__tests__/editorFixtures.ts';
import {
  addFamilyMemberVariables,
  EVERY_PEDIGREE_WORD,
  RELATIVES_NOT_RECORDED_VARIABLE,
  RESEARCHER_TRACKER_TEXT,
} from '../family-pedigree/__tests__/pedigreeFixtures.ts';
import { schemaKeysFor } from './schemaKeys.ts';

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
  /**
   * The fixture stage this one stands in for, where opening it as a stage of
   * its own would clash with that one: a second Family Pedigree may not
   * manage the gender identity attribute the fixture's pedigree manages.
   */
  stageId?: string;
  /** Every key this interface's schema offers, filled in. */
  fields: SectionDoc;
  /**
   * Something to wait for, so the editor has finished mounting.
   *
   * Left out, the stage name control is waited for instead: it is the one
   * control every interface's editor has, and the outline wait in the body
   * covers the sections that come after it.
   */
  settle?: () => Promise<unknown>;
  /** Puts in place what the stage needs that the fixture protocol lacks. */
  prepare?: (harness: StageEditorHarness) => void;
  /** Opens what holds fields only while it is open, once the editor is up. */
  reveal?: (harness: StageEditorHarness) => Promise<void>;
  /**
   * Keys the interface's schema has and its editor has no section for yet.
   * They round-trip untouched, so a researcher cannot see or change them;
   * naming one here is the way to say so rather than to claim it is owned.
   */
  unowned?: readonly string[];
}>;

const stageName = () => screen.findByRole('textbox', { name: 'Stage name' });

/**
 * A maximal stage built from the fixture's own stage of that interface, with
 * the keys the fixture leaves out filled in here.
 *
 * The cases written out in full below came first and are kept that way: they
 * seed corners the fixture does not have at all. But writing twenty of them
 * by hand would be twenty more configurations to keep true, and the fixture
 * already holds one plausible configuration per interface that Architect's own
 * end-to-end suites drive. So the rest start from it and add only what it is
 * missing — which is a much shorter thing to read, and a much shorter thing to
 * be wrong about. `hasEverySchemaKey` below holds the result to the schema
 * either way, so a key added to an interface fails both kinds of case.
 */
const fixtureMaximal = (
  stageId: FixtureStageId,
  missingFromTheFixture: SectionDoc,
): SectionDoc => ({
  ...loadFixtureStage(stageId).fields,
  ...missingFromTheFixture,
});

/** The fixture's map options, as a plain object to add a key to. */
const mapOptionsOfFixture = (): Record<string, unknown> => {
  const options = loadFixtureStage('geospatial-1').fields.mapOptions;
  return typeof options === 'object' && options !== null ? { ...options } : {};
};

/** What every stage may carry, and no fixture stage does. */
const EVERY_STAGE = {
  interviewScript: 'Read this to the participant before you begin.',
  skipLogic,
};

const MAXIMAL_STAGES: MaximalStage[] = [
  {
    interfaceName: 'Information',
    type: 'Information',
    fields: {
      label: { 'en-US': 'Information' },
      title: { 'en-US': 'Welcome' },
      interviewScript: 'Read this aloud.',
      skipLogic,
      items: [
        {
          id: 'info-item-1',
          type: 'text',
          content: { 'en-US': 'Welcome to this interview.' },
          description: 'The opening line.',
        },
        {
          id: 'info-item-2',
          type: 'asset',
          content: 'geo_data',
          description: { 'en-US': 'A map of the regions.' },
          size: 'LARGE',
        },
      ],
    },
    settle: stageName,
  },
  {
    interfaceName: 'EgoForm',
    type: 'EgoForm',
    fields: {
      label: { 'en-US': 'Ego Form' },
      interviewScript: 'Ask about them.',
      skipLogic,
      introductionPanel: {
        title: { 'en-US': 'Introduction' },
        text: { 'en-US': 'A few questions.' },
      },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'ego_name',
            prompt: { 'en-US': 'What is your name?' },
            hint: { 'en-US': 'Your full name.' },
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
    fields: {
      label: { 'en-US': 'Alter Form' },
      interviewScript: 'Ask about each person.',
      skipLogic,
      filter: nodeFilter,
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: { 'en-US': 'Introduction' },
        text: { 'en-US': 'A few questions.' },
      },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'relationship_to_ego',
            prompt: { 'en-US': 'Relationship?' },
            hint: { 'en-US': 'How you know them.' },
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
    fields: {
      label: { 'en-US': 'Alter Edge Form' },
      interviewScript: 'Ask about each relationship.',
      skipLogic,
      filter: edgeFilter,
      subject: { entity: 'edge', type: 'knows' },
      introductionPanel: {
        title: { 'en-US': 'Introduction' },
        text: { 'en-US': 'A few questions.' },
      },
      form: {
        fields: [
          {
            id: 'field-1',
            variable: 'edgeNotes',
            prompt: { 'en-US': 'Any notes?' },
            hint: { 'en-US': 'Free text.' },
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
    fields: {
      label: { 'en-US': 'Name Generator' },
      interviewScript: 'Guidance.',
      skipLogic,
      subject: { entity: 'node', type: 'person' },
      form: {
        title: { 'en-US': 'Add a person' },
        fields: [
          {
            id: 'field-1',
            variable: 'name',
            prompt: { 'en-US': 'What is their name?' },
            hint: { 'en-US': 'Their first name.' },
            showValidationHints: true,
          },
        ],
      },
      prompts: [
        {
          id: 'p1',
          text: { 'en-US': 'Who are the people you know?' },
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
      ],
      panels: [
        {
          id: 'panel-1',
          title: { 'en-US': 'People you named earlier' },
          dataSource: 'existing',
          filter: nodeFilter,
        },
        {
          id: 'panel-2',
          title: { 'en-US': 'From the roster' },
          dataSource: 'roster_data',
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 8 },
      minNodesNotice: {
        'en-US':
          '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
      },
      maxNodesNotice: {
        'en-US':
          'You have completed this task. Click the next arrow to continue.',
      },
      externalDataError: { 'en-US': 'External data could not be loaded.' },
    },
    settle: () => screen.findByRole('textbox', { name: 'Form title' }),
  },
];

/**
 * The other fifteen, from the fixture's own stages plus what they are
 * missing.
 *
 * The gaps are not evenly spread. `filter` is absent from ten of the fixture
 * stages and `interviewScript`/`skipLogic` from all of them, so those
 * three are most of what is added here — and they are exactly the keys a
 * shared section owns, which is to say the keys an editor is most likely to
 * leave off its own section list and never notice.
 */
const FIXTURE_MAXIMAL_STAGES: MaximalStage[] = [
  {
    interfaceName: 'NameGeneratorQuickAdd',
    type: 'NameGeneratorQuickAdd',
    fields: fixtureMaximal('name-generator-quick-add-1', {
      ...EVERY_STAGE,
      behaviours: { minNodes: 1, maxNodes: 6 },
      panels: [
        {
          id: 'quick-add-panel-1',
          title: { 'en-US': 'People you named earlier' },
          dataSource: 'existing',
          filter: nodeFilter,
        },
        // A panel reading a data file is what shows its error words.
        {
          id: 'quick-add-panel-2',
          title: { 'en-US': 'From the roster' },
          dataSource: 'roster_data',
        },
      ],
      quickAddHint: { 'en-US': 'Press Enter when you are finished.' },
      minNodesNotice: {
        'en-US':
          '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
      },
      maxNodesNotice: {
        'en-US':
          'You have completed this task. Click the next arrow to continue.',
      },
      externalDataError: { 'en-US': 'External data could not be loaded.' },
    }),
  },
  {
    interfaceName: 'NameGeneratorRoster',
    type: 'NameGeneratorRoster',
    fields: fixtureMaximal('name-generator-roster-1', EVERY_STAGE),
  },
  {
    interfaceName: 'LanguageChooser',
    type: 'LanguageChooser',
    fields: fixtureMaximal('language-chooser-1', EVERY_STAGE),
  },
  {
    // Every stage may carry skip logic but this one: every route through the
    // interview ends at a finish stage.
    interfaceName: 'FinishSession',
    type: 'FinishSession',
    fields: fixtureMaximal('finish', {
      interviewScript: EVERY_STAGE.interviewScript,
    }),
  },
  {
    interfaceName: 'Sociogram',
    type: 'Sociogram',
    fields: fixtureMaximal('sociogram-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'NetworkComposer',
    type: 'NetworkComposer',
    fields: fixtureMaximal('network-composer-1', {
      ...EVERY_STAGE,
      nodeForm: {
        fields: [
          {
            id: 'composer-field-1',
            variable: 'relationship_to_ego',
            component: 'Text',
            label: { 'en-US': 'How you know them' },
            hint: { 'en-US': 'In a word or two.' },
            showValidationHints: true,
          },
        ],
      },
      convexHullVariable: 'contactType',
      groupsHeading: { 'en-US': 'Groups' },
      tooltips: {
        addPerson: { 'en-US': 'Add node' },
        automaticLayout: { 'en-US': 'Automatic layout' },
        drawConnection: { 'en-US': 'Draw edge' },
      },
      behaviours: { automaticLayout: true },
      edges: [
        {
          id: 'composer-edge-1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                id: 'composer-edge-field-1',
                variable: 'closeness',
                component: 'LikertScale',
                label: { 'en-US': 'How close are you?' },
              },
            ],
          },
        },
      ],
    }),
  },
  {
    interfaceName: 'DyadCensus',
    type: 'DyadCensus',
    fields: fixtureMaximal('dyad-census-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'TieStrengthCensus',
    type: 'TieStrengthCensus',
    fields: fixtureMaximal('tie-strength-census-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'OneToManyDyadCensus',
    type: 'OneToManyDyadCensus',
    fields: fixtureMaximal('one-to-many-dyad-census-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'OrdinalBin',
    type: 'OrdinalBin',
    fields: fixtureMaximal('ordinal-bin-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'CategoricalBin',
    type: 'CategoricalBin',
    fields: fixtureMaximal('categorical-bin-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'Narrative',
    type: 'Narrative',
    fields: fixtureMaximal('narrative-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
    }),
  },
  {
    interfaceName: 'Geospatial',
    type: 'Geospatial',
    fields: fixtureMaximal('geospatial-1', {
      ...EVERY_STAGE,
      filter: nodeFilter,
      // Searching is offered, so the search's own words are the stage's.
      mapOptions: {
        ...mapOptionsOfFixture(),
        allowSearch: true,
      },
      offlineNotice: { 'en-US': 'You are offline. The map will not load.' },
      mapUnavailable: { 'en-US': 'The map cannot be drawn on this device.' },
      outsideAreasLabel: { 'en-US': 'Outside selectable areas' },
      searchLabel: { 'en-US': 'Search places' },
      searchNoMatch: { 'en-US': 'No place matches.' },
      searchFailed: { 'en-US': 'The search failed.' },
    }),
  },
  {
    interfaceName: 'FamilyPedigree',
    type: 'FamilyPedigree',
    stageId: 'family-pedigree-1',
    reveal: openEveryWordingGroup,
    fields: fixtureMaximal('family-pedigree-1', {
      ...EVERY_STAGE,
      nodeConfiguration: {
        ...(loadFixtureStage('family-pedigree-1').fields
          .nodeConfiguration as SectionDoc),
        relationshipToParticipantAttribute: 'fm_relationship',
      },
      form: {
        fields: [
          {
            variable: 'fm_occupation',
            prompt: { 'en-US': 'What do they do?' },
          },
        ],
      },
      completeness: {
        scope: 'thirdDegree',
        enforcement: 'recommended',
        relativesNotRecordedAttribute: 'relativesNotRecorded',
        ...RESEARCHER_TRACKER_TEXT,
      },
      framing: 'participantPreference',
      wording: EVERY_PEDIGREE_WORD,
      nominationPrompts: [
        {
          id: 'nomination-1',
          text: { 'en-US': 'Who in your family has had heart disease?' },
          attribute: 'has_heart_disease',
          onlyForSexAssignedAtBirth: 'female',
        },
      ],
    }),
    // Every attribute the fixture's person type carries is bound to one of the
    // pedigree's own slots, so the attribute its extra field collects arrives
    // the way a collaborator's would.
    prepare: (harness) =>
      addFamilyMemberVariables(harness, {
        fm_occupation: {
          name: 'fm_occupation',
          type: 'text',
          component: 'Text',
        },
        relativesNotRecorded: RELATIVES_NOT_RECORDED_VARIABLE,
        has_heart_disease: { name: 'has_heart_disease', type: 'boolean' },
        fm_relationship: {
          name: 'fm_relationship',
          type: 'categorical',
          options: PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT.map((value) => ({
            value,
            label: { 'en-US': value },
          })),
        },
      }),
  },
  {
    interfaceName: 'NarrativePedigree',
    type: 'NarrativePedigree',
    fields: fixtureMaximal('narrative-pedigree-1', {
      ...EVERY_STAGE,
      showAtRiskStatuses: true,
      conditionText: {
        heading: { 'en-US': 'Conditions' },
        instruction: { 'en-US': 'Select a condition to see who it affects.' },
        notation: {
          affected: { 'en-US': 'Has this condition' },
          obligateAffected: { 'en-US': 'Will develop this condition' },
          obligateCarrier: { 'en-US': 'Carries this condition' },
          atRiskAffected: { 'en-US': 'May develop this condition' },
          atRiskCarrier: { 'en-US': 'May carry this condition' },
          unknown: { 'en-US': 'Not known' },
        },
        snapshotCondition: { 'en-US': '{title}: {condition}' },
        snapshotInheritance: {
          'en-US': '{title}: {condition} — inheritance for {name}',
        },
      },
    }),
  },
  {
    interfaceName: 'Anonymisation',
    type: 'Anonymisation',
    fields: fixtureMaximal('anonymisation-1', EVERY_STAGE),
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
/** Both kinds of case, as one list: nothing below cares which it is. */
const EVERY_MAXIMAL_STAGE: MaximalStage[] = [
  ...MAXIMAL_STAGES,
  ...FIXTURE_MAXIMAL_STAGES,
];

describe('a maximal stage of each interface', () => {
  /**
   * The list is every interface the package registers, read off the registry.
   *
   * Without this the file is a list agreeing with itself: five cases passing,
   * fourteen interfaces with no maximal stage at all, and nothing saying so.
   * Derived from `stageEditorRegistry` rather than counted, so the interface a
   * later schema adds arrives here as a failure rather than as a gap.
   */
  it('covers every interface the package registers', () => {
    expect(EVERY_MAXIMAL_STAGE.map(({ type }) => type).toSorted()).toEqual(
      Object.keys(stageEditorRegistry).toSorted(),
    );
  });

  /**
   * And each case really is maximal, asked of the schema rather than of the
   * author.
   *
   * A case is only worth running if it carries every key the interface has: a
   * stage missing one is a stage that proves nothing about it, and the round
   * trip below would pass exactly as happily. Asserted before the mount so a
   * key added to an interface names itself here rather than surfacing as a
   * section blamed for losing something it was never given.
   */
  it.each(EVERY_MAXIMAL_STAGE)(
    '$interfaceName: carries every key its schema declares',
    ({ type, fields }) => {
      expect(Object.keys(fields).toSorted()).toEqual(schemaKeysFor(type));
    },
  );

  it.each(EVERY_MAXIMAL_STAGE)(
    '$interfaceName: is fully editable, and saves every key unchanged',
    async ({
      type,
      stageId,
      fields,
      settle,
      prepare,
      reveal,
      unowned = [],
    }) => {
      // No registry passed: every interface is claimed by the package's own,
      // so the dispatcher finding the editor is part of what the case shows.
      const harness = renderStageEditor({
        stage: {
          ...(stageId === undefined ? {} : { id: stageId }),
          type,
          fields,
        },
      });
      prepare?.(harness);
      await (settle ?? stageName)();
      // Every section registers its fields on mount, and the outline is built
      // from what is registered — so a mount that has not filled the outline
      // has not finished registering.
      await waitFor(() => expect(harness.outline().length).toBeGreaterThan(2));
      await reveal?.(harness);

      // Nothing is excused unless the case says so: a maximal stage is the one
      // case where every key the interface offers must be on screen, so an
      // empty `unowned` is the whole claim about the outline.
      await harness.roundTrip({ unowned });
    },
  );
});
