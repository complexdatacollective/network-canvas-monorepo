import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { useDialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../../../ProtocolBuilder.tsx';
import { createResourceHost } from '../../../resources/components/__tests__/resourceHost.ts';
import type { InMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import CreateCodebookVariableDialog, {
  type CreateCodebookVariableSession,
} from '../CreateCodebookVariableDialog.tsx';

const PERSON = sectionId({ kind: 'codebookNode', typeId: 'person' });

function AddAttribute() {
  const { session, openSession, closeSession, onSessionExited } =
    useDialogSession<CreateCodebookVariableSession>();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          openSession({
            key: crypto.randomUUID(),
            subject: { entity: 'node', type: 'person' },
            variableId: crypto.randomUUID(),
          })
        }
      >
        Add attribute
      </button>
      {session !== null && (
        <CreateCodebookVariableDialog
          session={session}
          onClose={closeSession}
          onExitComplete={onSessionExited}
        />
      )}
    </>
  );
}

const drafts = new Set<() => boolean>();
const registerDraft = (hasDraft: () => boolean) => {
  drafts.add(hasDraft);
  return () => {
    drafts.delete(hasDraft);
  };
};
const hostSeesUnsavedWork = () => [...drafts].some((hasDraft) => hasDraft());

const open = async (host: InMemoryHost) => {
  const user = userEvent.setup();
  render(
    <DialogProvider>
      <ProtocolBuilder
        adapter={host.adapter}
        protocolId={host.protocolId}
        dialogDraftRegistrar={registerDraft}
      >
        <AddAttribute />
      </ProtocolBuilder>
    </DialogProvider>,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Add attribute' }),
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Create attribute',
  });
  return { user, dialog };
};

const attributeNames = (host: InMemoryHost): string[] => {
  const variables: unknown = host.store.read(PERSON).document.variables;
  if (typeof variables !== 'object' || variables === null) return [];
  return Object.values(variables).flatMap((variable: unknown) =>
    typeof variable === 'object' &&
    variable !== null &&
    'name' in variable &&
    typeof variable.name === 'string'
      ? [variable.name]
      : [],
  );
};

describe('creating an attribute from the codebook', () => {
  it('writes the attribute to its type and closes', async () => {
    const host = createResourceHost();
    const { user, dialog } = await open(host);

    await user.type(
      within(dialog).getByRole('textbox', { name: /Attribute name/ }),
      'shoe_size',
    );
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: /Attribute type/ }),
      'Number',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create attribute' }),
    );

    await waitFor(() => expect(attributeNames(host)).toContain('shoe_size'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('closes without asking when nothing was entered', async () => {
    const { user, dialog } = await open(createResourceHost());
    expect(hostSeesUnsavedWork()).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('asks before discarding what was entered, and tells the host about it', async () => {
    const host = createResourceHost();
    const { user, dialog } = await open(host);
    const name = within(dialog).getByRole('textbox', {
      name: /Attribute name/,
    });

    await user.type(name, 'abandoned');
    expect(hostSeesUnsavedWork()).toBe(true);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    expect(name).toHaveValue('abandoned');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(attributeNames(host)).not.toContain('abandoned');
    expect(hostSeesUnsavedWork()).toBe(false);
  });

  it('takes the researcher to the name a refused save marked', async () => {
    const host = createResourceHost();
    const { user, dialog: first } = await open(host);
    const fill = async (dialog: HTMLElement) => {
      await user.type(
        within(dialog).getByRole('textbox', { name: /Attribute name/ }),
        'shoe_size',
      );
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: /Attribute type/ }),
        'Number',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Create attribute' }),
      );
    };
    await fill(first);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Add attribute' }));
    const second = await screen.findByRole('dialog', {
      name: 'Create attribute',
    });
    await fill(second);

    const name = within(second).getByRole('textbox', {
      name: /Attribute name/,
    });
    await waitFor(() => expect(name).toBeInvalid());
    expect(name).toHaveFocus();
    expect(attributeNames(host)).toEqual(['shoe_size']);
  });
});
