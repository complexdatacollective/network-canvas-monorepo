import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../components/CodebookEntityEditor.tsx';
import VariableEditor from '../components/VariableEditor.tsx';
import CodebookVariableValidationEditor from '../validation/CodebookVariableValidationEditor.tsx';
import type { CodebookWriteOutcome } from '../writes.ts';

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
 * an attribute becomes a save of the stage that they were still writing.
 *
 * `preventDefault()` alone cannot see this: it stops the BROWSER's navigation,
 * and React's propagation is not the browser's. Only `stopPropagation()` does,
 * which is what fresco's own `useForm` handler has always called and what each
 * of these editors' bare `<form onSubmit>` calls too.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

/** The attribute of the fixture's people that the editors below work on. */
const ATTRIBUTE = 'relationship_to_ego';

/** What the researcher has typed into the enclosing form and not finished. */
const HALF_TYPED = 'Who else have you spoken to';

const PERSON: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    [ATTRIBUTE]: {
      name: 'relationshipToEgo',
      type: 'text',
      component: 'Text',
    },
  },
};

const variablesOfPerson = (): Record<string, unknown> =>
  PERSON.variables as Record<string, unknown>;

const applied = async (): Promise<CodebookWriteOutcome> => ({
  status: 'applied',
  sectionId: PERSON_SECTION,
});

/**
 * The shape that reaches the whole stage: a codebook dialog rendered from
 * inside the stage form, with no form of its own in between to stop the
 * submit.
 */
function StageFormAround({
  onStageSubmit,
  children,
}: Readonly<{
  onStageSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}>) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onStageSubmit(event);
      }}
    >
      <label>
        Prompt text
        <input name="text" defaultValue={HALF_TYPED} />
      </label>
      <Dialog open title="Edit the codebook" closeDialog={() => undefined}>
        {children}
      </Dialog>
    </form>
  );
}

const editors = [
  {
    name: 'the attribute editor',
    save: 'Save attribute',
    editor: (onSubmitDocument: () => Promise<CodebookWriteOutcome>) => (
      <VariableEditor
        openId="nested-variable"
        mode="update"
        subject={SUBJECT}
        authoritativeDocument={PERSON}
        variableId={ATTRIBUTE}
        initialDraft={{
          name: 'renamedAttribute',
          type: 'text',
          component: 'Text',
        }}
        onSubmitDocument={onSubmitDocument}
        onComplete={() => undefined}
      />
    ),
  },
  {
    name: 'the validation editor',
    save: 'Save validation',
    editor: (onSubmitDocument: () => Promise<CodebookWriteOutcome>) => (
      <CodebookVariableValidationEditor
        openId="nested-validation"
        subject={SUBJECT}
        variableId={ATTRIBUTE}
        authoritativeEntityDocument={PERSON}
        allSubjectVariables={variablesOfPerson()}
        onSubmitDocument={onSubmitDocument}
      />
    ),
  },
  {
    name: 'the entity editor',
    save: 'Save entity',
    editor: (onSubmitDocument: () => Promise<CodebookWriteOutcome>) => (
      <CodebookEntityEditor
        mode="create"
        sessionKey="nested-entity"
        subject={{ entity: 'node', type: 'pending' }}
        initialDraft={{
          name: 'Place',
          color: 'node-color-seq-2',
          icon: 'add-a-place',
          shape: { default: 'square' },
        }}
        existingEntityNames={[]}
        onSubmit={onSubmitDocument}
        onApplied={() => undefined}
      />
    ),
  },
] as const;

describe('a codebook editor saved from inside another form', () => {
  it.each(editors)(
    'saves $name without saving the form it was opened from',
    async ({ save, editor }) => {
      const user = userEvent.setup();
      const onStageSubmit = vi.fn();
      const onSubmitDocument = vi.fn(applied);
      render(
        <StageFormAround onStageSubmit={onStageSubmit}>
          {editor(onSubmitDocument)}
        </StageFormAround>,
      );

      // The researcher's own half-finished question, which the enclosing form
      // holds and nobody asked to save. Read as a hidden element because the
      // open dialog takes the rest of the page out of the accessibility tree,
      // which is what a modal is supposed to do.
      const promptText = await screen.findByRole('textbox', {
        name: 'Prompt text',
        hidden: true,
      });
      expect(promptText).toHaveValue(HALF_TYPED);

      if (save === 'Save validation') {
        // The validation editor refuses an unchanged draft, so there has to be
        // a change before its save is live at all.
        await user.click(screen.getByRole('checkbox', { name: 'Required' }));
      }
      await user.click(screen.getByRole('button', { name: save }));

      // The codebook edit really happened, so what follows is about where its
      // submit went rather than about a button that did nothing.
      expect(onSubmitDocument).toHaveBeenCalledOnce();
      expect(onStageSubmit).not.toHaveBeenCalled();
      expect(promptText).toHaveValue(HALF_TYPED);
    },
  );
});
