import { screen, waitFor } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { TestPromptPreview } from '../../sections/__tests__/rowFixtures.tsx';
import PromptsSection from '../../sections/PromptsSection.tsx';
import SubjectSection from '../../sections/SubjectSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import type { StageEditorHarness } from '../../testing/renderStageEditor.tsx';
import VariableEditor from '../components/VariableEditor.tsx';
import CodebookVariableValidationEditor from '../validation/CodebookVariableValidationEditor.tsx';

/**
 * A codebook editor is opened from inside something the researcher is already
 * filling in — a prompt's row dialog, or the stage form itself — and its own
 * save must stay inside its own form.
 *
 * The two forms are never nested in the DOM: `Dialog` renders through a portal,
 * so the inner `<form>` is a sibling of the outer one under `<body>` and the
 * browser's own submit never leaves it. They ARE nested in the React tree,
 * because the dialog is rendered from inside the form's JSX, and React
 * dispatches a synthetic `submit` along the fiber tree rather than the DOM one.
 * So an inner handler that only calls `preventDefault()` hands the event
 * straight on to the enclosing form's `onSubmit`, and the researcher's save of
 * an attribute becomes a save of the prompt — or of the stage — that they were
 * still writing.
 *
 * `preventDefault()` alone cannot see this: it stops the BROWSER's navigation,
 * and React's propagation is not the browser's. Only `stopPropagation()` does,
 * which is what fresco's own `useForm` handler has always called and what each
 * of these editors' bare `<form onSubmit>` now calls too.
 *
 * How far the event travels is therefore a question about what it passes on the
 * way. From a prompt it stops at the row's own dialog form, because that form
 * is fresco's and already stops it — so the researcher loses the prompt rather
 * than the stage. From `SubjectSection` there is no form in between at all, and
 * the stage itself is what gets saved.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;

/** The attribute of the fixture's people that a prompt row edits below. */
const ATTRIBUTE = 'relationship_to_ego';

const PERSON_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: SUBJECT.type,
});

/** What the researcher has typed into the prompt and not finished. */
const HALF_TYPED = 'Who else have you spoken to';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordAt = (source: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(source)) return {};
  const value = source[key];
  return isRecord(value) ? value : {};
};

/** The person type as the HOST holds it, which is what a save has to reach. */
const savedPerson = (harness: StageEditorHarness): Record<string, unknown> =>
  recordAt(harness.host.getSnapshot().protocolSections, PERSON_SECTION);

const savedAttribute = (harness: StageEditorHarness): Record<string, unknown> =>
  recordAt(recordAt(savedPerson(harness), 'variables'), ATTRIBUTE);

const codebookNodeNames = (
  sections: Readonly<Record<string, Record<string, unknown>>>,
): unknown[] =>
  Object.entries(sections)
    .filter(([id]) => id.startsWith('codebook:node:'))
    .map(([, document]) => document.name);

/**
 * A prompt whose row dialog can open the codebook editors.
 *
 * A stand-in for the prompt rows that reach the codebook from inside a stage:
 * what the row itself collects is beside the point here, so it is one text
 * field, and what matters is that both editors are mounted exactly as a row
 * mounts them — in a `Dialog` of their own, rendered from inside the row
 * dialog's form.
 */
function CodebookEditingPromptEditor() {
  const { controller, protocolContext } = useStageEditorForm();
  const definition = protocolContext.codebook.node?.[SUBJECT.type];
  // Memoised on the codebook's own object, so an unrelated re-render does not
  // hand either editor a new authoritative document and make it reconcile a
  // draft that nothing changed.
  const entityDocument = useMemo<SectionDoc>(
    () => (definition === undefined ? {} : { ...definition }),
    [definition],
  );
  const variables = recordAt(entityDocument, 'variables');
  const [editing, setEditing] = useState<{
    surface: 'values' | 'rules';
    openId: string;
  } | null>(null);

  return (
    <>
      <DialogFormField name="text" label="Prompt text" component={InputField} />
      <Button
        type="button"
        onClick={() => setEditing({ surface: 'values', openId: uuid() })}
      >
        Change this attribute’s values
      </Button>
      <Button
        type="button"
        onClick={() => setEditing({ surface: 'rules', openId: uuid() })}
      >
        Set rules for what the participant types
      </Button>
      {editing?.surface === 'values' && (
        <Dialog
          open
          title="Edit the attribute"
          closeDialog={() => setEditing(null)}
        >
          <VariableEditor
            openId={editing.openId}
            mode="update"
            subject={SUBJECT}
            authoritativeDocument={entityDocument}
            variableId={ATTRIBUTE}
            initialDraft={recordAt(variables, ATTRIBUTE)}
            description={`Update the attribute "${ATTRIBUTE}"`}
            createRequestId={() => uuid()}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={() => setEditing(null)}
          />
        </Dialog>
      )}
      {editing?.surface === 'rules' && (
        <Dialog
          open
          title="Edit the attribute’s rules"
          closeDialog={() => setEditing(null)}
        >
          <CodebookVariableValidationEditor
            openId={editing.openId}
            subject={SUBJECT}
            variableId={ATTRIBUTE}
            authoritativeEntityDocument={entityDocument}
            allSubjectVariables={variables}
            requestMetadata={{
              createId: () => uuid(),
              description: `Update the rules for "${ATTRIBUTE}"`,
            }}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={() => setEditing(null)}
          />
        </Dialog>
      )}
    </>
  );
}

const promptsThatEditTheCodebook = (
  <PromptsSection
    PromptEditor={CodebookEditingPromptEditor}
    PromptPreview={TestPromptPreview}
  />
);

/** Opens the seeded prompt and leaves an unfinished question in it. */
const openPromptAndStartTyping = async (
  harness: StageEditorHarness,
): Promise<void> => {
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  const promptText = await screen.findByRole('textbox', {
    name: 'Prompt text',
  });
  await harness.user.clear(promptText);
  await harness.user.type(promptText, HALF_TYPED);
};

/** Renames the attribute through the values editor and saves it. */
const renameTheAttribute = async (
  harness: StageEditorHarness,
  name: string,
): Promise<void> => {
  await harness.user.click(
    screen.getByRole('button', { name: 'Change this attribute’s values' }),
  );
  const attributeName = await screen.findByRole('textbox', {
    name: 'Attribute name',
  });
  await harness.user.clear(attributeName);
  await harness.user.type(attributeName, name);
  await harness.user.click(
    screen.getByRole('button', { name: 'Save attribute' }),
  );
};

/** Makes the attribute required through the validation editor and saves it. */
const requireTheAttribute = async (
  harness: StageEditorHarness,
): Promise<void> => {
  await harness.user.click(
    screen.getByRole('button', {
      name: 'Set rules for what the participant types',
    }),
  );
  await screen.findByRole('button', { name: 'Save validation' });
  await harness.user.click(screen.getByRole('checkbox', { name: 'Required' }));
  await harness.user.click(
    screen.getByRole('button', { name: 'Save validation' }),
  );
};

describe('a codebook editor saved from inside another form', () => {
  it('leaves the prompt open when the attribute’s values are saved', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: promptsThatEditTheCodebook,
    });

    await openPromptAndStartTyping(harness);
    await renameTheAttribute(harness, 'renamedAttribute');

    // The codebook edit really happened, so what follows is about where its
    // submit went rather than about a button that did nothing.
    await waitFor(() =>
      expect(savedAttribute(harness).name).toBe('renamedAttribute'),
    );
    expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
      HALF_TYPED,
    );
  });

  it('leaves the prompt open when the attribute’s rules are saved', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: promptsThatEditTheCodebook,
    });

    await openPromptAndStartTyping(harness);
    await requireTheAttribute(harness);

    await waitFor(() =>
      expect(recordAt(savedAttribute(harness), 'validation')).toEqual({
        required: true,
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
      HALF_TYPED,
    );
  });

  /**
   * And the prompt is not merely closed — it is COMMITTED, holding whatever
   * the researcher had typed so far, by a submit they never asked for.
   */
  it('does not commit the prompt the researcher is still writing', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: promptsThatEditTheCodebook,
    });

    await openPromptAndStartTyping(harness);
    await requireTheAttribute(harness);

    await waitFor(() =>
      expect(recordAt(savedAttribute(harness), 'validation')).toEqual({
        required: true,
      }),
    );
    // A committed row reaches the list as a row operation the session holds,
    // and reads back as the preview's own text. Neither has happened: the
    // half-typed question is still only a value in an open control.
    expect(harness.pendingCommands()).toHaveLength(0);
    expect(screen.queryAllByText(HALF_TYPED)).toHaveLength(0);
  });

  /**
   * The same shape one level up, and the one that reaches the whole stage:
   * `SubjectSection` mounts `CodebookEntityEditor` in a dialog rendered from
   * inside the stage form, and there is no form of its own in between to stop
   * the submit — so the stage itself is what gets saved.
   *
   * The host is made to answer a tick later, which is what a host does. Given
   * an answer in the same tick, the create has already written the new type
   * into `subject` by the time the stage form's own validation runs, and the
   * stage form refuses its own spurious submit for a type the codebook has not
   * published yet: the stage survives the bug by a race rather than by
   * anything deciding it should.
   */
  it('does not save the stage when a type created inside it is saved', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <SubjectSection entity="node" />,
    });
    const answer = harness.session.requestCompoundEdit.bind(harness.session);
    vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
      async (request) => {
        await new Promise((resolve) => {
          globalThis.setTimeout(resolve, 5);
        });
        return answer(request);
      },
    );
    const finish = vi.spyOn(harness.session, 'finish');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new node type' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Node type name' }),
      'Place',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    await waitFor(() =>
      expect(
        codebookNodeNames(harness.host.getSnapshot().protocolSections),
      ).toContain('Place'),
    );
    expect(finish).not.toHaveBeenCalled();
  });
});
