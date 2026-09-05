import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import AutomaticLayoutSection from '../AutomaticLayoutSection.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import SociogramPromptsSection from '../SociogramPromptsSection.tsx';

const sections = (
  <>
    <SociogramPromptsSection />
    <AutomaticLayoutSection />
    <BackgroundSection allowsImage />
  </>
);

const openEditor = () => ({ stageId: 'sociogram-1', sections });

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/**
 * Deletes the attribute every prompt positions its nodes with, as a
 * collaborator would — with the change attributed to them, in one authoritative
 * revision.
 */
const deleteLayoutVariable = (harness: StageEditorHarness): void => {
  const protocolSections = harness.session.getSnapshot().protocolSections;
  const person = protocolSections[PERSON_SECTION];
  if (person === undefined) throw new Error('the fixture has no person type');
  const variables =
    typeof person.variables === 'object' && person.variables !== null
      ? (person.variables as Record<string, unknown>)
      : {};
  const { layout: _deleted, ...kept } = variables;
  const manifestRevision = { sequence: 7n, hash: 'revision-7' };

  act(() => {
    harness.session.receiveAuthoritativeUpdate({
      protocolSections: {
        ...protocolSections,
        [PERSON_SECTION]: { ...person, variables: kept },
      },
      manifestRevision,
      attribution: {
        [PERSON_SECTION]: {
          sessionId: 'other-tab',
          displayName: 'Dana',
          revision: manifestRevision,
        },
      },
    });
  });
};

describe('the tasks a sociogram sets', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it arranges belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Prompts',
      'Node layout',
      'Background',
    ]);
    expect(
      screen.getByText('Place the people who know each other close together'),
    ).toBeInTheDocument();
  });

  /**
   * Tapping a node either draws a connection or marks the node; the schema
   * refuses a prompt that does both, and the interview would silently let edge
   * creation win. So choosing one has to take the other away.
   */
  it('stops creating connections when tapping is asked to do nothing', async () => {
    const harness = renderStageEditor(openEditor());

    const [first] = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(first as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Nothing/ }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).toEqual({
      id: 'sociogram-prompt-1',
      text: 'Place the people who know each other close together',
      layout: { layoutVariable: 'layout' },
      edges: { display: ['knows'] },
      highlight: { allowHighlighting: false },
    });
  });

  it('marks nodes with the attribute the researcher chose', async () => {
    const harness = renderStageEditor(openEditor());

    const [first] = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(first as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Mark the node/ }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Attribute marked' }),
      'highlighted',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const first_ = prompts(request?.stageDocument ?? {})[0];
    expect(first_?.highlight).toEqual({
      allowHighlighting: true,
      variable: 'highlighted',
    });
    expect(first_?.edges).toEqual({ display: ['knows'] });
  });

  /**
   * Drawing a connection the participant cannot see is not something a
   * researcher can have meant, and the interview draws it regardless.
   */
  it('shows the kind of connection it lets the participant draw', async () => {
    const harness = renderStageEditor(openEditor());

    const editButtons = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(editButtons[1] as HTMLElement);
    await harness.user.click(
      await screen.findByRole('option', { name: /Create a connection/ }),
    );
    await harness.user.click(
      await screen.findByRole('radio', { name: /family_edge/ }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[1]?.edges).toEqual({
      display: ['knows', 'family_edge'],
      create: 'family_edge',
    });
  });

  it('hands the arranging back to the participant', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('option', { name: /Manual mode/ }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      automaticLayout: false,
    });
  });

  /**
   * A stage cannot store positions in an attribute the codebook no longer has.
   * The editor has to say so as soon as the deletion arrives — and say WHOSE
   * change caused it, because nothing the researcher did to this stage did.
   */
  it('reports the deletion of its position attribute, and who made it', async () => {
    const harness = renderStageEditor(openEditor());
    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('valid'),
    );

    deleteLayoutVariable(harness);

    await waitFor(() =>
      expect(harness.session.getSnapshot().validation.status).toBe('invalid'),
    );
    const issues = harness.session.getSnapshot().validation.issues;
    const blamed = issues.filter(
      (issue) => issue.attributedChange !== undefined,
    );
    expect(blamed.length).toBeGreaterThan(0);
    expect(blamed[0]?.attributedChange).toEqual({
      sectionId: PERSON_SECTION,
      attribution: {
        sessionId: 'other-tab',
        displayName: 'Dana',
        revision: { sequence: 7n, hash: 'revision-7' },
      },
    });
    expect(blamed.some((issue) => issue.path.includes('layoutVariable'))).toBe(
      true,
    );
  });
});
