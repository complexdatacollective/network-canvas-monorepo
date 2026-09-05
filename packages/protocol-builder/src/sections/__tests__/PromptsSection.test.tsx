import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import PromptsSection from '../PromptsSection.tsx';
import StageNameSection from '../StageNameSection.tsx';
import {
  dropUnusedAssignments,
  ExplodingRowEditor,
  refuseADuplicateQuestion,
  SEEDED_QUESTION,
  TestPromptEditor,
  TestPromptPreview,
} from './rowFixtures.tsx';

const prompts = (
  <PromptsSection
    PromptEditor={TestPromptEditor}
    PromptPreview={TestPromptPreview}
    requiresSubject={false}
  />
);

const openEditor = () => ({
  stageId: 'name-generator-1',
  sections: (
    <>
      <StageNameSection />
      {prompts}
    </>
  ),
});

const promptIds = (stage: Record<string, unknown>): unknown[] => {
  const rows = stage.prompts;
  return Array.isArray(rows)
    ? rows.map((row: unknown) => Reflect.get(row as object, 'id'))
    : [];
};

describe('the prompt list a stage owns', () => {
  it('sits where the editor put it, and reports what it holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Finished' },
      { title: 'Prompts', state: 'Finished' },
    ]);
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's type and its add-a-person form belong to the name
    // generator family's own editor, not to this section.
    await harness.roundTrip({ unowned: ['subject', 'form'] });
  });

  it('adds a prompt with an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'And who else?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request).not.toBeNull();
    const ids = promptIds(request?.stageDocument ?? {});
    expect(ids[0]).toBe('name-generator-prompt-1');
    expect(ids[1]).toEqual(expect.any(String));
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('removes the prompt the researcher chose, and no other', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'And who else?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('And who else?');

    const [firstRemove] = screen.getAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(firstRemove as HTMLElement);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );
    const request = await harness.submit();
    expect(promptIds(request?.stageDocument ?? {})).toHaveLength(1);
    expect(promptIds(request?.stageDocument ?? {})[0]).not.toBe(
      'name-generator-prompt-1',
    );
  });

  /**
   * A reorder is committed as the operation it was, addressed by each row's own
   * id — so the prompt that moved is the same prompt, not a copy of whatever
   * was at that index when the control was drawn.
   */
  it('moves a prompt without changing which prompt it is', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGenerator',
        fields: {
          label: 'Name Generator',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'Add a person',
            fields: [{ variable: 'name', prompt: 'Name?' }],
          },
          prompts: [
            { id: 'prompt-a', text: 'First question' },
            { id: 'prompt-b', text: 'Second question' },
          ],
        },
      },
      sections: prompts,
    });

    screen.getByRole('button', { name: 'Reorder prompt 1 of 2' }).focus();
    await harness.user.keyboard('{ArrowDown}');

    const request = await harness.submit();
    expect(promptIds(request?.stageDocument ?? {})).toEqual([
      'prompt-b',
      'prompt-a',
    ]);
  });

  /**
   * Rules are what a prompt list IS. The protocol schema also refuses an empty
   * one, but it does so against a path after the save is attempted; this
   * refuses it in the section that holds the prompts.
   */
  it('refuses to save a stage that asks nothing', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Who are the people you know?'),
      ).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Create at least one prompt/),
    ).toBeInTheDocument();
  });

  /**
   * The protocol schema has one spelling for "not answered": the key is not
   * there. A cleared control submits an empty string, which reaches a save as
   * `"negativeLabel": ""` and is refused in the schema's own words.
   */
  it('leaves an unanswered field out of the prompt entirely', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'And who else?',
    );
    // Touched and left empty, which is how a value becomes `''` rather than
    // simply never existing.
    await harness.user.click(
      screen.getByRole('textbox', { name: 'Negative label' }),
    );
    await harness.user.tab();
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('And who else?');

    const request = await harness.submit();
    const rows = request?.stageDocument.prompts;
    const added = Array.isArray(rows) ? rows.at(-1) : undefined;
    expect(added).toEqual({
      id: expect.any(String) as unknown as string,
      text: 'And who else?',
    });
    expect(Object.hasOwn(added as object, 'negativeLabel')).toBe(false);
  });

  it('waits for a subject when the prompts describe one', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGenerator',
        fields: { label: 'New stage' },
      },
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
        />
      ),
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Prompts',
      state: 'Not available yet',
    });
    expect(
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeDisabled();
  });
});

/**
 * The fields inside a row dialog are a family's own code, mounted by machinery
 * that knows nothing about them. Before the boundary, one of them throwing
 * unmounted the whole React tree: the researcher lost the stage editor, every
 * unsaved change in it, and was left on a blank page with no account of why.
 */
describe('a row editor with a defect in it', () => {
  it('costs the researcher the dialog, and nothing else', async () => {
    // React reports a caught render error to the console. Silenced so the
    // expected failure does not read as a broken test run.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      const harness = renderStageEditor({
        stageId: 'name-generator-1',
        sections: (
          <>
            <StageNameSection />
            <PromptsSection
              PromptEditor={ExplodingRowEditor}
              PromptPreview={TestPromptPreview}
              requiresSubject={false}
            />
          </>
        ),
      });

      await harness.user.click(
        screen.getByRole('button', { name: 'Create new prompt' }),
      );

      // Said where a form-level problem is already reported, and about what
      // the researcher can do rather than about what threw.
      expect(
        await screen.findByText(/This editor could not be shown/),
      ).toBeInTheDocument();
      // The dialog's own close is still there, which is the point of catching
      // inside the dialog rather than around it.
      await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

      // The stage behind it never went anywhere: it still lists its prompts,
      // still has its sections, and still saves what it opened with.
      expect(
        screen.getByText('Who are the people you know?'),
      ).toBeInTheDocument();
      expect(harness.outline().map((section) => section.title)).toEqual([
        'Stage name',
        'Prompts',
      ]);
      await harness.roundTrip({ unowned: ['subject', 'form'] });
    } finally {
      consoleError.mockRestore();
    }
  });
});

/**
 * A subject is only chosen once it names a TYPE. A stage part way through
 * being configured can hold `{entity: 'node'}` — an entity picked, no type
 * yet — and prompts written against that would name variables of nothing.
 */
describe('a stage whose subject names no type yet', () => {
  it('waits, exactly as it does for a stage with no subject at all', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGenerator',
        fields: { label: 'New stage', subject: { entity: 'node' } },
      },
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
        />
      ),
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Prompts',
      state: 'Not available yet',
    });
    expect(
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeDisabled();
  });
});

/**
 * What the row dialog hands a family's fields, and what a collapsed row hands
 * its preview. Both are contracts nothing observed: a `rowOf` that answered
 * `{}`, an `editIndex` never forwarded, a hard-coded `form`, and a preview
 * still carrying the list's own `sortable` flag all passed.
 */
describe('what a row editor is given to work with', () => {
  it('names the row being edited, its contents, and its own form', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit prompt' }),
    );

    const dialog = await screen.findByRole('dialog');
    // The row's own properties, whole — not an empty object, and not the
    // list's managed bookkeeping.
    expect(await screen.findByText('id, text')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    // …and the CONTROLS opened holding them. A row editor whose fields start
    // blank is not editing the row: saving would write the emptiness back over
    // the prompt the researcher meant to change one word of.
    expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
      'Who are the people you know?',
    );
    // The form the dialog actually rendered, so a control outside it can
    // associate through `form=`.
    const form = dialog.querySelector('form');
    expect(form?.id).toBeTruthy();
    expect(screen.getByText(form?.id ?? 'no form')).toBeInTheDocument();
  });

  it('says so when there is no row yet, rather than pointing at one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );

    expect(await screen.findByText('a new row')).toBeInTheDocument();
  });

  it('keeps the list’s own presentation flag out of a row preview', () => {
    renderStageEditor(openEditor());

    expect(screen.queryByText(/sortable leaked/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Who are the people you know?'),
    ).toBeInTheDocument();
  });
});

/**
 * The two things a family hands this section about its own prompt: a rule only
 * it can state, and what the row becomes once the dialog collected it. Both
 * are forwarded to the list field, and neither is this section's to decide.
 */
describe('what a family says about its own prompt', () => {
  it('lets a family rule refuse a row the shared ones would take', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
          editorValidate={refuseADuplicateQuestion}
        />
      ),
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      SEEDED_QUESTION,
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    // Refused in the family's words, with the dialog still open over the draft.
    expect(
      await screen.findByText('Another prompt already asks this.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // And nothing was added: the list still holds the one prompt it opened on.
    expect(screen.getAllByText(SEEDED_QUESTION).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(harness.session.getSnapshot().editedSection.fields.prompts).toEqual([
      { id: 'name-generator-prompt-1', text: SEEDED_QUESTION },
    ]);
  });

  /**
   * The same rule, against the prompt that already asks the question: it is
   * given the row as the dialog opened on it, so an unchanged pick is not a
   * duplicate of itself.
   */
  it('does not refuse the row that was already like that', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
          editorValidate={refuseADuplicateQuestion}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Negative label' }),
      'Nobody',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(harness.session.getSnapshot().editedSection.fields.prompts).toEqual([
      {
        id: 'name-generator-prompt-1',
        text: SEEDED_QUESTION,
        negativeLabel: 'Nobody',
      },
    ]);
  });

  /**
   * A protocol authored elsewhere can hand this stage a prompt carrying an
   * empty list. The shared rule keeps it — only the field that owns a list can
   * tell "emptied on purpose" from "never used" — so dropping it is the
   * family's decision, and this section has to let the family make it.
   */
  it('lets a family collapse the row the shared rule would leave alone', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'name-generator-assigning',
        type: 'NameGenerator',
        fields: {
          label: 'Name Generator',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'Add a person',
            fields: [{ variable: 'name', prompt: 'Name?' }],
          },
          prompts: [
            {
              id: 'prompt-a',
              text: SEEDED_QUESTION,
              additionalAttributes: [],
            },
          ],
        },
      },
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          normalizeRow={dropUnusedAssignments}
        />
      ),
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      ' Anyone else?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.prompts).toEqual([
      { id: 'prompt-a', text: `${SEEDED_QUESTION} Anyone else?` },
    ]);
  });
});
