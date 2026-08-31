import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../controller.ts';
import BuilderSection from '../../sections/BuilderSection.tsx';
import StageNameSection from '../../sections/StageNameSection.tsx';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import ProtocolField from '../ProtocolField.tsx';
import StageEditorShell from '../StageEditorShell.tsx';

const initialFields: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
};

function createSession(
  options: Readonly<{
    fields?: SectionDoc;
    readOnly?: boolean;
    onFinish?: (request: FinishRequest) => void;
  }> = {},
) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: options.fields ?? initialFields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access:
      options.readOnly === true
        ? { mode: 'readOnly', reason: 'spectator' }
        : { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Stage editor shell test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    ...(options.onFinish === undefined ? {} : { onFinish: options.onFinish }),
  });
}

function Editor({ session }: { session: ProtocolBuilderSessionStore }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId, readOnly }) => (
        <SubmitButton form={formId} disabled={readOnly}>
          Finished editing
        </SubmitButton>
      )}
    >
      <StageNameSection position={{ index: 1, total: 3 }} />
      <BuilderSection title="Page content">
        <ProtocolField
          name="title"
          label="Page heading"
          component={InputField}
          required
        />
      </BuilderSection>
      <BuilderSection
        title="Interviewer guidance"
        capability={{
          fields: ['interviewScript'],
          confirmClear: {
            title: 'This will clear your interview script',
            description: 'The text you entered will be deleted.',
            confirmLabel: 'Clear script',
          },
        }}
      >
        <ProtocolField
          name="interviewScript"
          label="Interviewer script text"
          component={InputField}
        />
      </BuilderSection>
    </StageEditorShell>
  );
}

function renderEditor(session: ProtocolBuilderSessionStore) {
  return render(
    <DialogProvider>
      <Editor session={session} />
    </DialogProvider>,
  );
}

const outlineItems = () =>
  screen
    .getByRole('navigation', { name: 'Stage sections' })
    .querySelectorAll('button');

describe('StageEditorShell', () => {
  it('lists every mounted section in the order they appear on the page', async () => {
    renderEditor(createSession());

    await waitFor(() => expect(outlineItems()).toHaveLength(3));
    expect([...outlineItems()].map((item) => item.textContent)).toEqual([
      'Stage nameFinished',
      'Page contentFinished',
      'Interviewer guidanceSwitched off',
    ]);
  });

  it('reports a section whose required field is empty as unfinished', async () => {
    renderEditor(
      createSession({ fields: { label: '', title: '', items: [] } }),
    );

    await waitFor(() => expect(outlineItems()).toHaveLength(3));
    expect([...outlineItems()].map((item) => item.textContent)).toEqual([
      'Stage nameNot finished',
      'Page contentNot finished',
      'Interviewer guidanceSwitched off',
    ]);
  });

  it('moves focus to the section it was asked to jump to', async () => {
    const user = userEvent.setup();
    renderEditor(createSession());
    await waitFor(() => expect(outlineItems()).toHaveLength(3));

    const pageContent = [...outlineItems()][1];
    await user.click(pageContent as HTMLElement);

    // The section is a region named by its own heading, so arriving there
    // announces which section it is.
    expect(document.activeElement).toHaveAccessibleName('Page content');
  });

  it('sends only the fields that changed when the stage is saved', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const session = createSession({ onFinish });
    renderEditor(session);

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(request.stageDocument).toEqual({
      id: 'stage-1',
      type: 'Information',
      label: 'Welcome',
      title: 'A new heading',
      items: [],
    });
  });

  it('removes a capability the researcher switched off', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const session = createSession({
      onFinish,
      fields: { ...initialFields, interviewScript: 'Read this aloud' },
    });
    renderEditor(session);

    await user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear script' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    // Absent, which is how the protocol schema spells "this stage has no
    // interviewer guidance" — not null, and not an empty string.
    expect(Object.hasOwn(request.stageDocument, 'interviewScript')).toBe(false);
  });

  it('keeps a switched-off capability out of the way until it is asked for', async () => {
    renderEditor(createSession());

    await waitFor(() => expect(outlineItems()).toHaveLength(3));
    expect(
      screen.queryByRole('textbox', { name: 'Interviewer script text' }),
    ).toBeNull();
  });

  it('reports exactly one problem for a field that owns it', async () => {
    const user = userEvent.setup();
    renderEditor(createSession({ fields: { label: 'Welcome', items: [] } }));

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() =>
      expect(
        screen.getAllByText('This field is required.', { exact: false }),
      ).toHaveLength(1),
    );
  });

  it('refuses to save a stage the session has made read-only', async () => {
    const onFinish = vi.fn();
    const { container } = renderEditor(
      createSession({ onFinish, readOnly: true }),
    );

    expect(
      screen.getByRole('button', { name: 'Finished editing' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: 'Page heading' }),
    ).toBeDisabled();
    // The stage name sits outside any section's fieldset, so nothing but the
    // field itself can refuse to be edited here.
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toBeDisabled();

    // A disabled button is the host's chrome, not the guarantee. Submitting
    // the form directly is what a keyboard, a stale render or another host's
    // own button can still do.
    const form = container.querySelector('form');
    if (form === null) throw new Error('the editor rendered no form');
    fireEvent.submit(form);

    await waitFor(() =>
      expect(
        screen.getByText('This stage is read-only', { exact: false }),
      ).toBeInTheDocument(),
    );
    expect(onFinish).not.toHaveBeenCalled();
  });
});
