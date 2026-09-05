import { configureStore, type Middleware } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';
import { guardState } from '~/hooks/useProtocolNavGuard';
import { renderQueuedMessage } from '~/test/renderQueuedMessage';

const mocks = vi.hoisted(() => ({
  openDialog: vi.fn(),
  setLocation: vi.fn(),
  launchPreview: vi.fn(),
  hasSkipLogicSection: vi.fn(() => true),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/protocol/stage/stage-1', mocks.setLocation],
}));

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mocks.openDialog }),
}));

vi.mock('~/components/PreviewHost/launchPreview', () => ({
  launchPreview: mocks.launchPreview,
}));

vi.mock('~/hooks/useStageEditorKeyboard', () => ({
  useStageEditorKeyboard: () => undefined,
}));

// The heading owns the `label` field in the real editor; the stub section
// below registers it instead so this test does not depend on auto-naming.
vi.mock('../StageHeading', () => ({ default: () => null }));

vi.mock('~/components/ProjectNav/StageEditorNav', () => ({
  default: ({
    onCancel,
    onPreview,
    isStageInvalid,
  }: {
    onCancel: () => void;
    onPreview: () => void;
    isStageInvalid: boolean;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" onClick={onPreview} disabled={isStageInvalid}>
        Preview
      </button>
    </div>
  ),
}));

// One section registering every field the committed stage owns, so the form's
// values are the whole stage apart from the identity no field owns.
vi.mock('../Interfaces', async () => {
  const { default: Field } = await import('@codaco/fresco-ui/form/Field/Field');
  const { default: InputField } =
    await import('@codaco/fresco-ui/form/fields/InputField');

  // Stable identities: `initialValue` is a register-effect dependency.
  const SUBJECT = { entity: 'node', type: 'person' };
  const FORM = {
    title: 'Add person',
    fields: [{ variable: 'name', prompt: 'Name' }],
  };
  const PROMPTS = [{ id: 'prompt-1', text: 'Who do you know?' }];
  const Hidden = (() => null) as ComponentType<Record<string, unknown>>;

  const StageFields = () => (
    <>
      <Field
        name="label"
        label="Label"
        component={InputField}
        initialValue="Name some people"
      />
      <Field
        name="subject"
        label="Subject"
        component={Hidden}
        initialValue={SUBJECT}
      />
      <Field name="form" label="Form" component={Hidden} initialValue={FORM} />
      <Field
        name="prompts"
        label="Prompts"
        component={Hidden}
        initialValue={PROMPTS}
      />
    </>
  );

  return {
    getInterface: () => ({ sections: [StageFields], template: {} }),
    interfaceHasSkipLogicSection: () => mocks.hasSkipLogicSection(),
  };
});

import StageEditor from '../StageEditor';

const STAGE_ID = 'stage-1';

// Schema-valid skip logic (single-rule filter against the test codebook), as a
// hand-authored or externally generated protocol may carry on any stage type.
const SKIP_LOGIC = {
  action: 'SKIP',
  filter: {
    rules: [
      {
        type: 'node',
        id: 'rule-1',
        options: { type: 'person', operator: 'EXISTS' },
      },
    ],
  },
};

const makeProtocol = (
  stageOverrides: Record<string, unknown> = {},
): CurrentProtocol =>
  ({
    name: 'Test Protocol',
    schemaVersion: 8,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'Name', type: 'text', component: 'Text' },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
    stages: [
      {
        id: STAGE_ID,
        type: 'NameGenerator',
        label: 'Name some people',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'Add person',
          fields: [{ variable: 'name', prompt: 'Name' }],
        },
        prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
        ...stageOverrides,
      } as Stage,
    ],
  }) as CurrentProtocol;

type RecordedAction = { type?: string; payload?: unknown };

type UpdateStageAction = {
  type: string;
  payload: {
    stageId: string | null;
    stage: Record<string, unknown>;
    index?: number;
  };
};

// The editor promotes its stage and its draft codebook in one action.
const findUpdateStage = (
  dispatched: RecordedAction[],
): UpdateStageAction | undefined =>
  dispatched.find(
    (action) => action.type === 'stages/commitStageEditorDraft',
  ) as UpdateStageAction | undefined;

const renderEditor = (
  options: { stageOverrides?: Record<string, unknown> } = {},
) => {
  const protocol = makeProtocol(options.stageOverrides);
  const dispatched: RecordedAction[] = [];
  // Sits after the thunk middleware, so it records only resolved plain
  // actions (the `stages/commitStageEditorDraft` dispatch the save produces).
  const recordDispatch: Middleware = () => (next) => (action) => {
    dispatched.push(action as RecordedAction);
    return next(action);
  };
  const store = configureStore({
    reducer: {
      activeProtocol: () => ({ past: [], present: protocol, future: [] }),
      app: () => ({}),
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }).concat(recordDispatch),
  });

  return {
    store,
    dispatched,
    ...render(
      <Provider store={store}>
        <StageEditor id={STAGE_ID} />
      </Provider>,
    ),
  };
};

describe('StageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Module state shared with the navigation guards; a test that leaves a
    // confirmation pending would otherwise gag the next one.
    guardState.prompting = false;
    mocks.openDialog.mockResolvedValue(false);
    mocks.launchPreview.mockResolvedValue({ kind: 'delivered' });
    // Most interfaces render the SkipLogic section; the Anonymisation-shaped
    // tests below opt out per test.
    mocks.hasSkipLogicSection.mockReturnValue(true);
  });

  it('enables Preview for a valid stage', async () => {
    renderEditor();

    // The live mirror carries registered fields only, so the stage's `id` and
    // `type` have to be merged back before validation — otherwise no stage
    // ever validates and Preview is permanently disabled.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    });
  });

  it('previews the stage as it is currently configured', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Renamed stage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(mocks.launchPreview).toHaveBeenCalled();
    });
    const { protocol } = mocks.launchPreview.mock.calls[0]![0] as {
      protocol: CurrentProtocol;
    };
    expect(protocol.stages[0]).toMatchObject({
      id: STAGE_ID,
      type: 'NameGenerator',
      label: 'Renamed stage',
    });
  });

  it('confirms before discarding an edit the mirror has not caught up with', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    });

    // No await between the edit and the click: the mirror's coalescing window
    // has not elapsed, so a reader of the last mirrored values still sees a
    // pristine draft.
    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Renamed stage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(mocks.openDialog).toHaveBeenCalledTimes(1);
      const dialog = mocks.openDialog.mock.calls[0]?.[0] as {
        title?: ReactNode;
      };
      expect(renderQueuedMessage(dialog.title)).toBe(
        'Discard unsaved stage changes?',
      );
    });
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });

  // One decision, one prompt. Back already refuses to stack a second
  // confirmation on a first (`guardState.prompting`), and since the wording
  // converged the two dialogs are byte-identical — so a researcher who cancels
  // and then presses Back was being asked to answer the same question twice,
  // about the same draft, in the same words.
  it('never stacks a second discard confirmation on the first', async () => {
    // A confirmation that stays on screen, as a real one does until answered.
    mocks.openDialog.mockReturnValue(new Promise(() => undefined));
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Renamed stage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(mocks.openDialog).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await Promise.resolve();

    expect(mocks.openDialog).toHaveBeenCalledTimes(1);
    // The interlock Back reads, so the two exits cannot each open their own.
    expect(guardState.prompting).toBe(true);
  });

  it('releases the interlock once the confirmation is answered', async () => {
    renderEditor();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Renamed stage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(mocks.openDialog).toHaveBeenCalledTimes(1);
    });

    // Declining leaves the researcher in the editor, and the next Cancel or
    // Back must be able to ask again.
    await waitFor(() => {
      expect(guardState.prompting).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(mocks.openDialog).toHaveBeenCalledTimes(2);
    });
  });

  describe('browser unload guard', () => {
    it('blocks unload only while the draft is dirty, flushing the mirror first', async () => {
      renderEditor();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
      });

      // Pristine draft: unload proceeds without a prompt.
      const cleanEvent = new Event('beforeunload', { cancelable: true });
      act(() => {
        window.dispatchEvent(cleanEvent);
      });
      expect(cleanEvent.defaultPrevented).toBe(false);
      // jsdom's legacy `returnValue` alias reflects cancellation: still true
      // (not cancelled) because the handler never assigned it.
      expect(cleanEvent.returnValue).toBe(true);

      // Edit, then unload inside the mirror's coalescing window with no await
      // in between: only a synchronous in-handler flush can see this edit, so
      // this also proves the flush happens before the dirty read.
      fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
        target: { value: 'Renamed stage' },
      });
      const dirtyEvent = new Event('beforeunload', { cancelable: true });
      act(() => {
        window.dispatchEvent(dirtyEvent);
      });
      expect(dirtyEvent.defaultPrevented).toBe(true);
      expect(dirtyEvent.returnValue).toBe(false);
    });

    it('removes the unload listener when the editor unmounts', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      try {
        const { unmount } = renderEditor();
        await waitFor(() => {
          expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
        });

        const added = addSpy.mock.calls
          .filter(([type]) => type === 'beforeunload')
          .map(([, listener]) => listener);
        expect(added.length).toBeGreaterThan(0);

        unmount();

        // Every attached unload listener is detached with the editor, so a
        // clean session elsewhere in the app stays eligible for the
        // back/forward cache.
        const removed = removeSpy.mock.calls
          .filter(([type]) => type === 'beforeunload')
          .map(([, listener]) => listener);
        for (const listener of added) {
          expect(removed).toContain(listener);
        }
      } finally {
        addSpy.mockRestore();
        removeSpy.mockRestore();
      }
    });
  });

  describe('committed skipLogic preservation', () => {
    const submitStageForm = (container: HTMLElement) => {
      const form = container.querySelector('form');
      expect(form).not.toBeNull();
      fireEvent.submit(form!);
    };

    it('carries committed skipLogic through a zero-edit save when no section owns it', async () => {
      // Anonymisation-shaped interface: its section list omits SkipLogic, so
      // no field can ever register the key.
      mocks.hasSkipLogicSection.mockReturnValue(false);
      const { container, dispatched } = renderEditor({
        stageOverrides: { skipLogic: SKIP_LOGIC },
      });
      // Preview enabling proves the merged wip stage still validates.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
      });

      submitStageForm(container);

      await waitFor(() => {
        expect(findUpdateStage(dispatched)).toBeDefined();
      });
      const action = findUpdateStage(dispatched)!;
      // The commit always replaces the stage wholesale (a key the form no
      // longer carries has been removed, not left untouched), so it must not
      // silently delete the schema-valid,
      // runtime-honored key the editor never showed.
      expect(action.payload.stage.skipLogic).toEqual(SKIP_LOGIC);
    });

    it('does not invent a skipLogic key for a stage that never had one', async () => {
      mocks.hasSkipLogicSection.mockReturnValue(false);
      const { container, dispatched } = renderEditor();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
      });

      submitStageForm(container);

      await waitFor(() => {
        expect(findUpdateStage(dispatched)).toBeDefined();
      });
      expect('skipLogic' in findUpdateStage(dispatched)!.payload.stage).toBe(
        false,
      );
    });

    it('still drops an absent skipLogic when the interface owns a SkipLogic section', async () => {
      // The form carries no skipLogic (section toggled off); on an interface
      // that renders the section, that absence means the researcher removed
      // it, and the save must not resurrect the committed value.
      const { container, dispatched } = renderEditor({
        stageOverrides: { skipLogic: SKIP_LOGIC },
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
      });

      submitStageForm(container);

      await waitFor(() => {
        expect(findUpdateStage(dispatched)).toBeDefined();
      });
      expect('skipLogic' in findUpdateStage(dispatched)!.payload.stage).toBe(
        false,
      );
    });
  });
});
