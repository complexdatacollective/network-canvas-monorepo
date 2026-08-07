import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol, Stage } from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

const mocks = vi.hoisted(() => ({
  openDialog: vi.fn(),
  setLocation: vi.fn(),
  launchPreview: vi.fn(),
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
  };
});

import StageEditor from '../StageEditor';

const STAGE_ID = 'stage-1';

const makeProtocol = (): CurrentProtocol =>
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
      } as Stage,
    ],
  }) as CurrentProtocol;

const renderEditor = () => {
  const protocol = makeProtocol();
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
      }),
  });

  return {
    store,
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
    mocks.openDialog.mockResolvedValue(false);
    mocks.launchPreview.mockResolvedValue({ kind: 'delivered' });
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
      expect(mocks.openDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Unsaved Changes' }),
      );
    });
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });
});
