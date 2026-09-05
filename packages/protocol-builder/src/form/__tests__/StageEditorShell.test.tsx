import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
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
      cancel: () => session.cancel(),
      getResourceGateway: () => session.getResourceGateway(),
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

  it('sees content a capability is holding out of sight', async () => {
    const user = userEvent.setup();
    const session = createSession();
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

    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await user.type(
      await screen.findByRole('textbox', {
        name: 'Where the interview continues',
      }),
      'finish',
    );
    // Now the only field carrying anything is parked out of sight: there is no
    // field at the capability's own path, and nothing was in the draft this
    // stage was opened with.
    await user.click(
      screen.getByRole('button', { name: 'Toggle advanced options' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));

    // The researcher is asked before it goes, because there is something to
    // lose — and switching off without asking would also skip the clearing,
    // leaving skip logic active in a stage that says it has none.
    await user.click(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    );
    await waitFor(() =>
      expect([...outlineItems()][0]?.textContent).toBe(
        'Skip logicSwitched off',
      ),
    );
  });

  it('follows the page when a nested component reorders its sections', async () => {
    const user = userEvent.setup();
    const session = createSession();
    // The order lives in a component of its own, so reordering re-renders that
    // subtree and nothing else — the outline beside it is never told.
    function ReorderableSections() {
      const [reversed, setReversed] = useState(false);
      const sections = ['Introduction', 'Closing'];
      const shown = reversed ? [...sections].toReversed() : sections;
      return (
        <>
          <button type="button" onClick={() => setReversed(true)}>
            Reverse the sections
          </button>
          {shown.map((title) => (
            <BuilderSection key={title} title={title}>
              <ProtocolField
                name={title === 'Introduction' ? 'title' : 'label'}
                label={`${title} text`}
                component={InputField}
              />
            </BuilderSection>
          ))}
        </>
      );
    }
    function Host() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell controller={controller}>
          <ReorderableSections />
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <Host />
      </DialogProvider>,
    );

    await waitFor(() => expect(outlineItems()).toHaveLength(2));
    expect([...outlineItems()].map((item) => item.textContent)).toEqual([
      'IntroductionFinished',
      'ClosingFinished',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Reverse the sections' }),
    );

    await waitFor(() =>
      expect([...outlineItems()].map((item) => item.textContent)).toEqual([
        'ClosingFinished',
        'IntroductionFinished',
      ]),
    );
  });

  it('asks again about content entered after a capability was cleared', async () => {
    const user = userEvent.setup();
    const session = createSession({
      fields: { ...initialFields, skipLogic: { action: 'SKIP' } },
    });
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
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <ContainerCapability />
      </DialogProvider>,
    );

    // Clearing it parks a record at the capability's own path, holding
    // nothing.
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await user.click(screen.getByRole('button', { name: 'Clear skip logic' }));

    // What is typed now lives BENEATH that record, which has no standing to
    // say the capability is empty any more.
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'What this stage does' }),
      'SHOW',
    );
    await user.click(screen.getByRole('switch', { name: 'Skip logic' }));

    // Asked again, because there is something to lose again — and a switch-off
    // that skipped the question would skip the clearing with it.
    expect(
      await screen.findByRole('button', { name: 'Clear skip logic' }),
    ).toBeInTheDocument();
  });

  it('sees a capability filled in by a control that owns its parent', async () => {
    const user = userEvent.setup();
    const session = createSession();
    // One compound control owns `settings`; the capability owns a path inside
    // it, and no field is registered there.
    function CompoundControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={typeof value?.enabled === 'string' ? value.enabled : ''}
          onChange={(event) => onChange?.({ enabled: event.target.value })}
        />
      );
    }
    function NestedCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Advanced settings"
            capability={{
              fields: ['settings.enabled'],
              confirmClear: {
                title: 'This will clear your advanced settings',
                description: 'The settings you chose will be deleted.',
                confirmLabel: 'Clear settings',
              },
            }}
          >
            <ProtocolField<typeof CompoundControl>
              name="settings"
              label="Settings"
              component={CompoundControl}
            />
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <NestedCapability />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));

    // The value reaches the capability's path from the control above it, so
    // there is something to lose and the researcher has to be asked.
    expect(
      await screen.findByRole('button', { name: 'Clear settings' }),
    ).toBeInTheDocument();
  });

  it('sees a capability carried by a control that is hidden above it', async () => {
    const user = userEvent.setup();
    const session = createSession();
    function CompoundControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={typeof value?.enabled === 'string' ? value.enabled : ''}
          onChange={(event) => onChange?.({ enabled: event.target.value })}
        />
      );
    }
    function HiddenAncestor() {
      const controller = useStageEditorController(session, 'stage-form');
      const [shown, setShown] = useState(true);
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Advanced settings"
            capability={{
              fields: ['settings.enabled'],
              confirmClear: {
                title: 'This will clear your advanced settings',
                description: 'The settings you chose will be deleted.',
                confirmLabel: 'Clear settings',
              },
            }}
          >
            <button type="button" onClick={() => setShown((was) => !was)}>
              Toggle the control
            </button>
            {shown && (
              <ProtocolField<typeof CompoundControl>
                name="settings"
                label="Settings"
                component={CompoundControl}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <HiddenAncestor />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    // Parked whole, with the capability's value inside it.
    await user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));

    expect(
      await screen.findByRole('button', { name: 'Clear settings' }),
    ).toBeInTheDocument();

    // And confirming has to reach into that parked control, or the value it is
    // still holding is replayed into the stage on save.
    await user.click(screen.getByRole('button', { name: 'Clear settings' }));
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.click(
      await screen.findByRole('button', { name: 'Toggle the control' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Settings' })).toHaveValue(''),
    );
  });

  it('clears a capability whose path is a name rather than a route', async () => {
    const user = userEvent.setup();
    const session = createSession();
    function OpaqueCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      const [shown, setShown] = useState(true);
      return (
        <StageEditorShell controller={controller}>
          <BuilderSection
            title="Prompt override"
            capability={{
              // A protocol-authored key, canonically formatted. It is one
              // name containing a space, not a route through anything.
              fields: ['["prompt text"]'],
              confirmClear: {
                title: 'This will clear your prompt override',
                description: 'The text you entered will be deleted.',
                confirmLabel: 'Clear override',
              },
            }}
          >
            <button type="button" onClick={() => setShown((was) => !was)}>
              Toggle the control
            </button>
            {shown && (
              <ProtocolField
                name="prompt text"
                nameMode="opaque"
                label="Prompt text"
                component={InputField}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <OpaqueCapability />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Prompt override' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Ask about work',
    );
    await user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Prompt override' }));
    await user.click(screen.getByRole('button', { name: 'Clear override' }));

    await user.click(screen.getByRole('switch', { name: 'Prompt override' }));
    await user.click(
      await screen.findByRole('button', { name: 'Toggle the control' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
        '',
      ),
    );
  });

  it('shows the undone value after the host undoes a change', async () => {
    const user = userEvent.setup();
    const session = createSession({ onFinish: () => undefined });
    renderEditor(session);

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.title).toBe(
        'A new heading',
      ),
    );

    // What a host's undo control does. The controls were built from the draft
    // this replaces, so leaving them mounted would go on showing the value
    // that was just undone — and write it back on the next save.
    act(() => {
      session.undo();
    });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Welcome to the study',
      ),
    );
  });

  it('saves no trace of a capability cleared out of the control above it', async () => {
    const user = userEvent.setup();
    const session = createSession();
    function CompoundControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={typeof value?.enabled === 'string' ? value.enabled : ''}
          onChange={(event) => onChange?.({ enabled: event.target.value })}
        />
      );
    }
    function OnlyProperty() {
      const controller = useStageEditorController(session, 'stage-form');
      const [shown, setShown] = useState(true);
      return (
        <StageEditorShell
          controller={controller}
          actions={({ formId }) => (
            <SubmitButton form={formId}>Finished editing</SubmitButton>
          )}
        >
          <BuilderSection
            title="Advanced settings"
            capability={{
              fields: ['settings.enabled'],
              confirmClear: {
                title: 'This will clear your advanced settings',
                description: 'The settings you chose will be deleted.',
                confirmLabel: 'Clear settings',
              },
            }}
          >
            <button type="button" onClick={() => setShown((was) => !was)}>
              Toggle the control
            </button>
            {shown && (
              <ProtocolField<typeof CompoundControl>
                name="settings"
                label="Settings"
                component={CompoundControl}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <OnlyProperty />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Settings' }),
      'yes',
    );
    // The capability's path is the only thing this parked control holds.
    await user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.click(screen.getByRole('button', { name: 'Clear settings' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // Emptying the control that carried it has to take the container with it.
    // An empty object left behind is not "no capability" to the schema.
    await waitFor(() =>
      expect(
        Object.hasOwn(session.getSnapshot().editedSection.fields, 'settings'),
      ).toBe(false),
    );
  });

  it('shows the redone value after an undo is redone', async () => {
    const user = userEvent.setup();
    const session = createSession({ onFinish: () => undefined });
    renderEditor(session);

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.title).toBe(
        'A new heading',
      ),
    );

    act(() => {
      session.undo();
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Welcome to the study',
      ),
    );

    // Back to the content this form submitted — but the controls have been
    // rebuilt from the undo since, so returning to it is a move like any
    // other.
    act(() => {
      session.redo();
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'A new heading',
      ),
    );
  });

  it('leaves an emptied row in the list when a capability inside it is cleared', async () => {
    const user = userEvent.setup();
    const session = createSession();
    function RowControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={
            typeof value?.optionalSetting === 'string'
              ? value.optionalSetting
              : ''
          }
          onChange={(event) =>
            onChange?.({ optionalSetting: event.target.value })
          }
        />
      );
    }
    function RowCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      const [shown, setShown] = useState(true);
      return (
        <StageEditorShell
          controller={controller}
          actions={({ formId }) => (
            <SubmitButton form={formId}>Finished editing</SubmitButton>
          )}
        >
          <BuilderSection
            title="Row setting"
            capability={{
              fields: ['items[0].optionalSetting'],
              confirmClear: {
                title: 'This will clear the setting',
                description: 'The value you entered will be deleted.',
                confirmLabel: 'Clear setting',
              },
            }}
          >
            <button type="button" onClick={() => setShown((was) => !was)}>
              Toggle the control
            </button>
            {shown && (
              <ProtocolField<typeof RowControl>
                name="items[0]"
                label="First item"
                component={RowControl}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <RowCapability />
      </DialogProvider>,
    );

    await user.click(screen.getByRole('switch', { name: 'Row setting' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'First item' }),
      'on',
    );
    await user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Row setting' }));
    await user.click(screen.getByRole('button', { name: 'Clear setting' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // The row survives as an empty row. Removing its index would leave a hole
    // and renumber nothing, which is not what clearing a setting means.
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.items).toEqual([{}]),
    );
  });

  it('does not let a submit that changed nothing explain a later redo', async () => {
    const user = userEvent.setup();
    const session = createSession({ onFinish: () => undefined });
    renderEditor(session);

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.title).toBe(
        'A new heading',
      ),
    );

    // Saving again without changing anything writes no commands, so nothing
    // ever arrives for a marker to explain.
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    act(() => {
      session.undo();
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Welcome to the study',
      ),
    );

    act(() => {
      session.redo();
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'A new heading',
      ),
    );
  });

  it('empties a control elsewhere on the page when a capability is cleared', async () => {
    const user = userEvent.setup();
    const session = createSession();
    function CompoundControl({
      value,
      onChange,
      ...rest
    }: {
      value?: Record<string, unknown>;
      onChange?: (next: Record<string, unknown>) => void;
      id?: string;
      disabled?: boolean;
    }) {
      return (
        <input
          {...rest}
          type="text"
          value={typeof value?.enabled === 'string' ? value.enabled : ''}
          onChange={(event) => onChange?.({ enabled: event.target.value })}
        />
      );
    }
    // The control carrying the capability's path lives in ANOTHER section, so
    // closing the capability does not unmount it — it stays registered,
    // holding whatever the clear left in it.
    function ControlElsewhere() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell
          controller={controller}
          actions={({ formId }) => (
            <SubmitButton form={formId}>Finished editing</SubmitButton>
          )}
        >
          <BuilderSection title="Details">
            <ProtocolField<typeof CompoundControl>
              name="settings"
              label="Settings"
              component={CompoundControl}
            />
          </BuilderSection>
          <BuilderSection
            title="Advanced settings"
            capability={{
              fields: ['settings.enabled'],
              confirmClear: {
                title: 'This will clear your advanced settings',
                description: 'The settings you chose will be deleted.',
                confirmLabel: 'Clear settings',
              },
            }}
          >
            <ProtocolField
              name="interviewScript"
              label="Notes"
              component={InputField}
            />
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <ControlElsewhere />
      </DialogProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Settings' }), 'yes');

    // Open it, then switch it off: the capability's path is carried by the
    // control in the other section, so there is something to lose.
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.click(screen.getByRole('switch', { name: 'Advanced settings' }));
    await user.click(
      await screen.findByRole('button', { name: 'Clear settings' }),
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // The control is still on screen and still registered. Emptying it has to
    // take the container with it, or a blank `settings` reaches the stage.
    expect(screen.getByRole('textbox', { name: 'Settings' })).toHaveValue('');
    await waitFor(() =>
      expect(
        Object.hasOwn(session.getSnapshot().editedSection.fields, 'settings'),
      ).toBe(false),
    );
  });

  it('clears a hidden value that was never an answer', async () => {
    const user = userEvent.setup();
    const session = createSession({
      // Present, but not an answer: `hasAnswer` reads whitespace as blank, so
      // nothing will offer to confirm its deletion.
      fields: { ...initialFields, interviewScript: '   ' },
    });
    function BlankCapability() {
      const controller = useStageEditorController(session, 'stage-form');
      const [shown, setShown] = useState(true);
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
              fields: ['interviewScript'],
              confirmClear: {
                title: 'This will clear your interview script',
                description: 'The text you entered will be deleted.',
                confirmLabel: 'Clear script',
              },
            }}
          >
            <button type="button" onClick={() => setShown((was) => !was)}>
              Toggle the control
            </button>
            {shown && (
              <ProtocolField
                name="interviewScript"
                label="Interviewer script text"
                component={InputField}
              />
            )}
          </BuilderSection>
        </StageEditorShell>
      );
    }
    render(
      <DialogProvider>
        <BlankCapability />
      </DialogProvider>,
    );

    await user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );
    // Parked while the section is still open, so closing the section cannot
    // discard it.
    await user.click(
      screen.getByRole('button', { name: 'Toggle the control' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Interviewer guidance' }),
    );

    // Nothing to confirm, because nothing there was an answer — but switching
    // it off still has to mean off.
    expect(screen.queryByRole('button', { name: 'Clear script' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(
        Object.hasOwn(
          session.getSnapshot().editedSection.fields,
          'interviewScript',
        ),
      ).toBe(false),
    );
  });

  it('does not rebuild its own controls when it saves them', async () => {
    const user = userEvent.setup();
    const session = createSession({ onFinish: () => undefined });
    let mounts = 0;
    function MountCounter() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return null;
    }
    function CountingEditor() {
      const controller = useStageEditorController(session, 'stage-form');
      return (
        <StageEditorShell
          controller={controller}
          actions={({ formId }) => (
            <SubmitButton form={formId}>Finished editing</SubmitButton>
          )}
        >
          <BuilderSection title="Page content">
            <MountCounter />
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
    render(
      <DialogProvider>
        <CountingEditor />
      </DialogProvider>,
    );
    await waitFor(() => expect(mounts).toBe(1));

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'A new heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.title).toBe(
        'A new heading',
      ),
    );

    // The form store is keyed by the draft, and saving moves the draft — but
    // to the very values these controls are already showing. Rebuilding them
    // for that would throw away focus and scroll position on every save.
    expect(mounts).toBe(1);
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

  it('does not remember a write the session refused', async () => {
    const user = userEvent.setup();
    const session = createSession();
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
      cancel: () => session.cancel(),
      getResourceGateway: () => session.getResourceGateway(),
    };

    render(
      <DialogProvider>
        <RefusingEditor session={refusing} />
      </DialogProvider>,
    );

    await user.clear(screen.getByRole('textbox', { name: 'Page heading' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Page heading' }),
      'Refused heading',
    );
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await screen.findByText('This stage is read-only', { exact: false });

    // The draft moves elsewhere, then arrives at the content the refused
    // submit had attempted. Nothing this form wrote ever landed, so this is an
    // external change like any other and the controls have to follow it.
    act(() => {
      session.replaceAuthoritativeStage({
        fields: { label: 'Welcome', title: 'Somewhere else', items: [] },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Somewhere else',
      ),
    );

    act(() => {
      session.replaceAuthoritativeStage({
        fields: { label: 'Welcome', title: 'Refused heading', items: [] },
        manifestRevision: { sequence: 3n, hash: 'revision-3' },
      });
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
        'Refused heading',
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
