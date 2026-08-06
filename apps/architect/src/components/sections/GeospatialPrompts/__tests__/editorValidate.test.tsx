import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The cross-class exclusivity gate now runs as `editorValidate`, captured
// from the mocked `DialogArrayField`, the same way an earlier revision
// captured `onBeforeSave` — see GeospatialPrompts.tsx's comment on why
// `editorValidate` (with its `initialValues` context) replaced `onBeforeSave`
// for this check.
type EditorValidate = (
  values: Record<string, unknown>,
  context?: { initialValues?: unknown },
) => Record<string, unknown> | undefined;

let capturedEditorValidate: EditorValidate | undefined;

vi.mock('~/components/Form/arrayFields/DialogArrayField', () => ({
  default: (props: { editorValidate?: EditorValidate }) => {
    capturedEditorValidate = props.editorValidate;
    return <div data-testid="dialog-array-field" />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import GeospatialPrompts from '../GeospatialPrompts';

// `loc` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture shape:
// written both by a form field (validated, stage s1) and — here — a
// geospatial selection prompt (unvalidated, stage s2).
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          loc: { name: 'Location', type: 'location' },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'loc', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'Geospatial',
      label: 'G',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'loc' }],
    },
  ],
};

const renderWithStore = (protocol: unknown): EditorValidate => {
  capturedEditorValidate = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      stageEditorDraft,
    },
  });
  const committedStage = {
    id: 's2',
    type: 'Geospatial',
    subject: { entity: 'node', type: 'person' },
  } as unknown as Stage;

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={committedStage}
          stageId="s2"
          formId="edit-stage"
        >
          <GeospatialPrompts
            stagePath="stages[1]"
            stagePosition={1}
            interfaceType="Geospatial"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );
  expect(screen.getByTestId('dialog-array-field')).toBeInTheDocument();
  const editorValidate = capturedEditorValidate;
  if (!editorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return editorValidate;
};

describe('GeospatialPrompts editorValidate cross-class gate', () => {
  it('returns a field error keyed at variable with the mirror message', () => {
    const editorValidate = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);

    expect(editorValidate({ id: 'p1', text: 'T', variable: 'loc' })).toEqual({
      variable:
        '"Location" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('escapes when the pick equals the prompt’s original committed variable (editing without changing)', () => {
    const editorValidate = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);

    expect(
      editorValidate(
        { id: 'p1', text: 'T', variable: 'loc' },
        { initialValues: { variable: 'loc' } },
      ),
    ).toBeUndefined();
  });

  it('allows a save with no cross-class conflict', () => {
    const geospatialOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const editorValidate = renderWithStore(geospatialOnly);

    expect(
      editorValidate({ id: 'p1', text: 'T', variable: 'loc' }),
    ).toBeUndefined();
  });
});
