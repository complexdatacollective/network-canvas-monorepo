import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
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

function Editor({
  session,
  pageContentTitle = 'Page content',
}: {
  session: ProtocolBuilderSessionStore;
  pageContentTitle?: string;
}) {
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
      <BuilderSection title={pageContentTitle}>
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

function renderEditor(
  session: ProtocolBuilderSessionStore,
  pageContentTitle?: string,
) {
  return render(
    <DialogProvider>
      <Editor session={session} pageContentTitle={pageContentTitle} />
    </DialogProvider>,
  );
}

function RefusingEditor({ session }: { session: ProtocolBuilderSession }) {
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <BuilderSection title="Page content">
        <ProtocolField
          name="title"
          label="Page heading"
          component={InputField}
          required
        />
      </BuilderSection>
    </StageEditorShell>
  );
}

/**
 * A capability whose second field is behind a plain conditional render, so
 * hiding it parks the value rather than discarding it — the shape of a
 * collapsed group of advanced options inside a capability.
 */
function CapabilityEditor({
  session,
}: {
  session: ProtocolBuilderSessionStore;
}) {
  const controller = useStageEditorController(session, 'stage-form');
  const [advancedShown, setAdvancedShown] = useState(true);

  return (
    <StageEditorShell
      controller={controller}
      actions={({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      )}
    >
      <BuilderSection
        title="Interviewer guidance"
        capability={{
          fields: ['interviewScript', 'interviewScriptStyle'],
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
        <button type="button" onClick={() => setAdvancedShown(false)}>
          Hide advanced options
        </button>
        {advancedShown && (
          <ProtocolField
            name="interviewScriptStyle"
            label="Script style"
            component={InputField}
          />
        )}
      </BuilderSection>
    </StageEditorShell>
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

  it('reports a capability the researcher switched off as switched off', async () => {
    const user = userEvent.setup();
    renderEditor(
      createSession({
        fields: { ...initialFields, interviewScript: 'Read this aloud' },
      }),
    );
    await waitFor(() => expect(outlineItems()).toHaveLength(3));
    expect([...outlineItems()][2]?.textContent).toBe(
      'Interviewer guidanceFinished',
    );

    await user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear script' }));

    // The value the capability owned is gone, so the section is off — not
    // still reading as configured from the draft it was opened with.
    await waitFor(() =>
      expect([...outlineItems()][2]?.textContent).toBe(
        'Interviewer guidanceSwitched off',
      ),
    );
  });

  it('keeps a section\u2019s fields when only its title changes', async () => {
    const session = createSession({ fields: { label: 'Welcome', items: [] } });
    const { rerender } = renderEditor(session);
    await waitFor(() =>
      expect([...outlineItems()][1]?.textContent).toBe(
        'Page contentNot finished',
      ),
    );

    rerender(
      <DialogProvider>
        <Editor session={session} pageContentTitle="Screen content" />
      </DialogProvider>,
    );

    // Renaming a section says nothing about what is inside it: its required
    // field is still empty, so it is still unfinished.
    await waitFor(() =>
      expect([...outlineItems()][1]?.textContent).toBe(
        'Screen contentNot finished',
      ),
    );
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

  it('reports a lease lost between opening the form and saving it', async () => {
    const user = userEvent.setup();
    const session = createSession();
    // Access is still editable to everything that rendered, and the session
    // refuses the write anyway — the shape of losing a lease between the last
    // render and the submit.
    const refusing: ProtocolBuilderSession = {
      subscribe: (listener) => session.subscribe(listener),
      getSnapshot: () => session.getSnapshot(),
      getServerSnapshot: () => session.getServerSnapshot(),
      dispatch: () => {
        throw new SessionReadOnlyError();
      },
      undo: () => session.undo(),
      redo: () => session.redo(),
      validate: () => session.validate(),
      requestCompoundEdit: (request) => session.requestCompoundEdit(request),
      finish: () => session.finish(),
    };

    render(
      <DialogProvider>
        <RefusingEditor session={refusing} />
      </DialogProvider>,
    );

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() =>
      expect(
        screen.getByText('This stage is read-only', { exact: false }),
      ).toBeInTheDocument(),
    );
  });

  it('clears a capability\u2019s hidden fields when it is switched off', async () => {
    const user = userEvent.setup();
    const session = createSession({
      fields: {
        ...initialFields,
        interviewScript: 'Read this aloud',
        interviewScriptStyle: 'formal',
      },
    });
    render(
      <DialogProvider>
        <CapabilityEditor session={session} />
      </DialogProvider>,
    );

    // Parked with its value intact, so closing the capability around it never
    // unmounts it again.
    await user.click(
      screen.getByRole('button', { name: 'Hide advanced options' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    await user.click(screen.getByRole('button', { name: 'Clear script' }));

    await waitFor(() =>
      expect([...outlineItems()][0]?.textContent).toBe(
        'Interviewer guidanceSwitched off',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    await waitFor(() => {
      const { fields } = session.getSnapshot().editedSection;
      expect(Object.hasOwn(fields, 'interviewScript')).toBe(false);
      expect(Object.hasOwn(fields, 'interviewScriptStyle')).toBe(false);
    });
  });

  it('shows the refreshed fields when the host replaces the same stage', async () => {
    const user = userEvent.setup();
    const session = createSession();
    renderEditor(session);

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'Typed before promotion',
    );

    // What a host does when a spectator is promoted to editor: the stage is
    // the same, but its authoritative content is not the one this form was
    // opened with.
    act(() => {
      session.replaceAuthoritativeStage({
        fields: {
          label: 'Welcome',
          title: 'Refreshed elsewhere',
          items: [],
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });

    // A field that merely re-registers keeps the value it was holding, so
    // without a fresh form the promoted editor would show — and then save —
    // what it had typed over a screen that had moved on.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Refreshed elsewhere',
      ),
    );
  });

  it('does not call a whitespace-only answer finished', async () => {
    renderEditor(
      createSession({ fields: { label: '   ', title: '  ', items: [] } }),
    );

    // Fresco's required validator trims, so a form that accepted this would
    // reject it on submit. The outline has to say the same thing the submit
    // will.
    await waitFor(() => expect(outlineItems()).toHaveLength(3));
    expect([...outlineItems()].map((item) => item.textContent)).toEqual([
      'Stage nameNot finished',
      'Page contentNot finished',
      'Interviewer guidanceSwitched off',
    ]);
  });

  it('does not treat merely opening a capability as configuring it', async () => {
    const user = userEvent.setup();
    const session = createSession();
    // A capability that owns a CONTAINER path while its controls register the
    // parts inside it — the shape skip logic has.
    function ContainerCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Skip logic"
            capability={{
              fields: ['skipLogic'],
              confirmClear: {
                title: 'This will clear your skip logic',
                description: 'The rules you created will be deleted.',
                confirmLabel: 'Clear skip logic',
              },
            }}
          >
            <ProtocolField
              name="skipLogic.action"
              label="What this stage does"
              component={InputField}
            />
            <ProtocolField
              name="skipLogic.destination"
              label="Where the interview continues"
              component={InputField}
            />
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <ContainerCapability />
      </DialogProvider>,
    );

    // Opening it mounts the controls, which is enough for the form to assemble
    // an object at the capability's own path — but nobody has entered anything.
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await screen.findByRole('textbox', { name: 'What this stage does' });
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));

    // No confirmation, because there is nothing to lose.
    expect(
      screen.queryByRole('button', { name: 'Clear skip logic' }),
    ).toBeNull();
    await waitFor(() =>
      expect([...outlineItems()][0]?.textContent).toBe(
        'Skip logicSwitched off',
      ),
    );
  });

  it('clears a hidden part of a container capability for good', async () => {
    const user = userEvent.setup();
    const session = createSession({
      fields: {
        ...initialFields,
        skipLogic: { action: 'SKIP', destination: 'finish' },
      },
    });
    function ContainerCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      const [advancedShown, setAdvancedShown] = useState(true);
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Skip logic"
            capability={{
              fields: ['skipLogic'],
              confirmClear: {
                title: 'This will clear your skip logic',
                description: 'The rules you created will be deleted.',
                confirmLabel: 'Clear skip logic',
              },
            }}
          >
            <ProtocolField
              name="skipLogic.action"
              label="What this stage does"
              component={InputField}
            />
            <button
              type="button"
              onClick={() => setAdvancedShown((shown) => !shown)}
            >
              Toggle advanced options
            </button>
            {advancedShown && (
              <ProtocolField
                name="skipLogic.destination"
                label="Where the interview continues"
                component={InputField}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <ContainerCapability />
      </DialogProvider>,
    );

    // Parked with its value intact, inside the capability rather than at it —
    // so closing the capability around it never unmounts it, and a tombstone
    // left at the container path does not reach it.
    await user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await user.click(screen.getByRole('button', { name: 'Clear skip logic' }));

    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );

    // Bringing the hidden part back must not hand over content the researcher
    // has already confirmed deleting.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', {
          name: 'Where the interview continues',
        }),
      ).toHaveValue(''),
    );
  });

  it('explains a prerequisite before it explains a switch', async () => {
    const session = createSession();
    function DisabledCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Interviewer guidance"
            disabled
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
    render(
      <DialogProvider>
        <DisabledCapability />
      </DialogProvider>,
    );

    // The researcher cannot switch this on until the thing it depends on is
    // chosen, so "switched off" would explain the wrong obstacle — and would
    // explain it differently depending only on whether content already exists.
    await waitFor(() =>
      expect([...outlineItems()][0]?.textContent).toBe(
        'Interviewer guidanceNot available yet',
      ),
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
    // Read-only is not the same as switched off. A spectator still needs to
    // see how much of the stage is done.
    await waitFor(() =>
      expect([...outlineItems()][1]?.textContent).toBe('Page contentFinished'),
    );

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
