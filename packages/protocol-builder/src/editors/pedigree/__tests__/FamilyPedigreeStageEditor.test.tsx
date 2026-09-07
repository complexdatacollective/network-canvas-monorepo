import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  expectStatesItsPosition,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { pedigreeAndAnonymisationStageEditors } from '../../pedigreeAndAnonymisationStageEditors.ts';
import {
  familyPedigreeEditor,
  shimMarkdownEditorMeasurement,
} from './editorFixtures.tsx';

shimMarkdownEditorMeasurement();

const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const INTRO_SCREEN = {
  items: [
    {
      id: 'intro-1',
      type: 'text',
      content: 'We are going to draw your family.',
    },
  ],
};

const openFixture = () =>
  renderStageEditor({
    stageId: 'family-pedigree-1',
    editor: familyPedigreeEditor,
  });

/** The fixture pedigree with whatever a test needs added to it. */
const familyPedigreeStageWith = (extra: SectionDoc) => {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree' as const,
    fields: { ...seeded.fields, ...extra },
  };
};

/** A stage of this interface that does not exist yet, as a host creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'family-pedigree-new',
      type: 'FamilyPedigree',
      fields: getInterfaceTemplate('FamilyPedigree'),
    },
    editor: familyPedigreeEditor,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The id the codebook now files an attribute of this name under. */
function variableIdByName(
  harness: StageEditorHarness,
  name: string,
): string | undefined {
  const definition =
    harness.host.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
  const variables = isRecord(definition) ? definition.variables : undefined;
  if (!isRecord(variables)) return undefined;
  return Object.entries(variables).find(
    ([, variable]) => isRecord(variable) && variable.name === name,
  )?.[0];
}

/** The attributes a picker is currently offering, by their ids. */
const optionsOf = (name: string): string[] =>
  [...screen.getByRole('combobox', { name }).querySelectorAll('option')]
    .map((option) => option.value)
    .filter((value) => value !== '');

const outlineStateOf = (harness: StageEditorHarness, title: string) =>
  harness.outline().find((section) => section.title === title)?.state;

describe('the family pedigree stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at. Everything an editor does
   * differently for a new stage follows from that one signal, which the
   * shared sections read from the editor's context rather than from a prop.
   */
  it('opens a stage being created on the creation the session carries', async () => {
    renderStageEditor({
      create: { type: 'FamilyPedigree', position: NEW_STAGE_POSITION },
      editor: familyPedigreeEditor,
    });

    await expectOpenedAsANewStage('Family Pedigree');
  });

  /**
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here rather than only in the dispatch suite
   * because this editor composes the shared heading itself, so dropping it
   * would leave every other test in this file passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('family-pedigree-1');
  });

  it('claims exactly this interface in its family', () => {
    expect(pedigreeAndAnonymisationStageEditors.FamilyPedigree).toBeDefined();
  });

  /**
   * Every key the fixture stage holds is edited by a section this editor
   * mounts, and saving it unchanged returns it unchanged. `unowned` is empty
   * because there is nothing this interface's schema holds that the editor
   * leaves to a section that has not been built — including the introduction
   * screen, which is the package's shared page section given the package's
   * shared content blocks.
   */
  it('owns every key the stage holds, and round-trips it', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ introScreen: INTRO_SCREEN }),
      editor: familyPedigreeEditor,
    });

    const request = await harness.roundTrip({ unowned: [] });
    expect(request.stageDocument.introScreen).toEqual(INTRO_SCREEN);
  });

  it('lists its sections in the order the researcher works through them', () => {
    const harness = openFixture();

    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Pedigree framing',
      'Pedigree boundaries',
      'Family member data',
      'Family member form',
      'Relationship data',
      'Introduction screen',
      'Family-building prompt',
      'Nomination prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * What the interface's own template puts on screen before the researcher has
   * decided anything: the framing, the boundaries and an introduction screen.
   *
   * Split from the save below so neither claim can hide the other — a template
   * that lost its framing would still let a fully filled-in stage save, and a
   * save that refused would say nothing about what the researcher was first
   * shown. Seeded from `getInterfaceTemplate` rather than from a hand-written
   * object, so a template that gains a default is exercised here rather than
   * diverging from what a host actually creates.
   */
  it('opens a new stage on the framing and boundaries its template ships', () => {
    openNewStage();

    expect(screen.getByRole('radio', { name: 'Fixed framing' })).toBeChecked();
    expect(
      screen.getByRole('combobox', { name: 'Fixed framing terminology' }),
    ).toHaveValue('gamete');
    expect(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
    ).toHaveValue('off');
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue('');
  });

  /**
   * The minimum edits a created stage still needs: the two entity types, the
   * attributes the interface writes the family into, the question asked while
   * it is built, and the stage's name.
   *
   * The two typed strings are as short as their assertions allow — every
   * character is a keystroke through a controlled field, and the wording of a
   * census prompt is the prompt section's business.
   */
  it('saves a new stage once its types, attributes and prompt are set', async () => {
    const harness = openNewStage();

    await harness.user.click(
      screen.getByRole('radio', { name: 'family member' }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Display label' }),
      'fm_name',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Participant identifier' }),
      'is_ego',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Relationship to participant' }),
      'fm_relationship_to_ego',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Biological sex' }),
      'biologicalSex',
    );

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Relationship type' }),
      'relationshipType',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Active status' }),
      'isActive',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Gestational carrier' }),
      'isGestationalCarrier',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Gamete role' }),
      'gameteRole',
    );

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Census prompt' }),
      'Who?',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Family',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      id: 'family-pedigree-new',
      type: 'FamilyPedigree',
      label: 'Family',
      censusPrompt: 'Who?',
      framing: { mode: 'fixed', value: 'gamete' },
      nodeConfig: {
        type: 'family_member',
        nodeLabelVariable: 'fm_name',
        egoVariable: 'is_ego',
        relationshipVariable: 'fm_relationship_to_ego',
        biologicalSexVariable: 'biologicalSex',
      },
      edgeConfig: {
        type: 'family_edge',
        relationshipTypeVariable: 'relationshipType',
        isActiveVariable: 'isActive',
        isGestationalCarrierVariable: 'isGestationalCarrier',
        gameteRoleVariable: 'gameteRole',
      },
    });
    // The template's own introduction screen survives being created and saved.
    expect(request?.stageDocument.introScreen).toEqual(
      getInterfaceTemplate('FamilyPedigree').introScreen,
    );
  });

  it('refuses a pedigree with no family-building prompt, and says which section it is in', async () => {
    const harness = openFixture();

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Census prompt' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(outlineStateOf(harness, 'Family-building prompt')).toBe(
      'Has a problem',
    );
    expect(outlineStateOf(harness, 'Family member data')).toBe('Finished');
  });

  it('leaves nothing pending when the researcher cancels', async () => {
    const harness = openFixture();

    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
      'required',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away', async () => {
    const harness = openFixture();
    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the introduction screen a pedigree opens with', () => {
  /**
   * The blocks are the package's shared content blocks, the same ones an
   * Information stage's page holds, so a saved text block opens on the rich
   * text control its own kind names and is written back under `content`.
   */
  it('saves a block the researcher rewrites', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ introScreen: INTRO_SCREEN }),
      editor: familyPedigreeEditor,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit introduction block' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const block = within(await screen.findByRole('dialog'));
    const blockText = block.getByRole('textbox', { name: 'Content' });
    await harness.user.clear(blockText);
    await harness.user.type(blockText, 'Parents.');
    await harness.user.click(block.getByRole('button', { name: 'Save' }));

    const request = await harness.submit();
    expect(request?.stageDocument.introScreen).toEqual({
      items: [{ id: 'intro-1', type: 'text', content: 'Parents.' }],
    });
  });

  /**
   * What the shared editor brings that this editor's own seam could not: a
   * pedigree's introduction can show a picture or play a recording, chosen
   * from the protocol's resources.
   *
   * The display size is deliberately absent. It exists on an Information
   * stage's items and nowhere else — a pedigree's introduction blocks are a
   * strict object without it — so offering the control here would author a
   * stage the protocol refuses.
   */
  it('offers the media kinds a page offers, and no display size', async () => {
    const harness = renderStageEditor({
      stage: familyPedigreeStageWith({ introScreen: INTRO_SCREEN }),
      editor: familyPedigreeEditor,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit introduction block' }),
    );
    await screen.findByRole('radio', { name: 'Text' });
    for (const kind of ['Image', 'Video', 'Audio']) {
      expect(screen.getByRole('radio', { name: kind })).toBeInTheDocument();
    }

    await harness.user.click(screen.getByRole('radio', { name: 'Image' }));
    expect(
      screen.queryByRole('radiogroup', { name: 'Display size' }),
    ).not.toBeInTheDocument();
  });
});

describe('a codebook that changes while the pedigree is open', () => {
  /**
   * A slot names an attribute of the node type. An attribute a collaborator
   * deletes leaves the slot pointing at nothing — which is a thing to report,
   * and never a thing this editor answers with a command of its own.
   */
  it('reports a bound attribute that has been deleted, without echoing it', async () => {
    const harness = openFixture();
    const definition =
      harness.session.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
    if (definition === undefined) {
      throw new Error('The fixture protocol has no "family_member" node type.');
    }
    const variables = { ...(definition.variables as Record<string, unknown>) };
    delete variables.fm_name;

    const dispatched = vi.spyOn(harness.session, 'dispatch');
    const submitted = vi.spyOn(harness.host, 'submit');
    harness.receiveCodebookUpdate({
      node: { family_member: { ...definition, variables } },
    });

    // The dangling pick is still shown as the current one, named as gone: it
    // is the reference the researcher has to resolve.
    expect(
      await screen.findByRole('option', {
        name: 'fm_name — this attribute is no longer in the codebook',
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).not.toBe('valid'),
    );
    expect(dispatched).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('offers an attribute a collaborator added, without echoing it', async () => {
    const harness = openFixture();
    const definition =
      harness.session.getSnapshot().protocolSections[FAMILY_MEMBER_SECTION];
    if (definition === undefined) {
      throw new Error('The fixture protocol has no "family_member" node type.');
    }
    const dispatched = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        family_member: {
          ...definition,
          variables: {
            ...(definition.variables as Record<string, unknown>),
            fm_nickname: { name: 'fm_nickname', type: 'text' },
          },
        },
      },
    });

    await waitFor(() =>
      expect(optionsOf('Display label')).toContain('fm_nickname'),
    );
    expect(dispatched).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

describe('creating an attribute a slot needs without leaving the stage', () => {
  /**
   * The attribute is a codebook edit and the binding is a stage edit, and the
   * two land separately: the compound edit puts the whole attribute in the
   * codebook at once, and the save that follows carries the stage that now
   * points at it.
   */
  it('writes the attribute as one compound edit, and saves the stage bound to it', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('button', {
        name: 'Create a new display label attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    const submitted = vi.spyOn(harness.host, 'submit');
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Display label' }),
      ).not.toHaveValue('fm_name'),
    );
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(
      submitted.mock.calls[0]?.[0].edits.map((edit) => edit.sectionId),
    ).toEqual([FAMILY_MEMBER_SECTION]);

    const created = variableIdByName(harness, 'nickname');
    expect(created).toEqual(expect.any(String));
    const request = await harness.submit();
    expect(request?.stageDocument.nodeConfig).toMatchObject({
      nodeLabelVariable: created,
    });
  });
});
