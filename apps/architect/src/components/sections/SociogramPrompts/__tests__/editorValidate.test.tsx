import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The cross-class exclusivity gate now runs as `editorValidate`, captured
// from the mocked `DialogArrayField` the same way the redux-form era test
// captured `onBeforeSave` — see SociogramPrompts.tsx's comment on why
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
import SociogramPrompts from '../SociogramPrompts';

// `flagged` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture
// shape: written both by a form field (validated, stage s1) and — here — the
// sociogram's own highlight toggle (unvalidated, stage s2).
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          flagged: { name: 'Flagged', type: 'boolean' },
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
      form: { fields: [{ variable: 'flagged', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'Sociogram',
      label: 'S',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'p1',
          text: 'T',
          layout: { layoutVariable: 'layoutVar' },
          highlight: { allowHighlighting: true, variable: 'flagged' },
        },
      ],
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
    type: 'Sociogram',
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
          <SociogramPrompts
            stagePath="stages[1]"
            stagePosition={1}
            interfaceType="Sociogram"
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

describe('SociogramPrompts editorValidate cross-class gate', () => {
  it('returns a field error keyed at highlight.variable with the mirror message', () => {
    const editorValidate = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);

    expect(
      editorValidate({
        id: 'p1',
        text: 'T',
        highlight: { allowHighlighting: true, variable: 'flagged' },
      }),
    ).toEqual({
      'highlight.variable':
        '"Flagged" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('escapes when the pick equals the prompt’s original committed highlight variable (editing without changing)', () => {
    const editorValidate = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);
    const value = {
      id: 'p1',
      text: 'T',
      highlight: { allowHighlighting: true, variable: 'flagged' },
    };

    expect(editorValidate(value, { initialValues: value })).toBeUndefined();
  });

  it('allows a save with no cross-class conflict', () => {
    const sociogramOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const editorValidate = renderWithStore(sociogramOnly);

    expect(
      editorValidate({
        id: 'p1',
        text: 'T',
        highlight: { allowHighlighting: true, variable: 'flagged' },
      }),
    ).toBeUndefined();
  });

  it('is a no-op when highlighting is disabled (no variable picked)', () => {
    const editorValidate = renderWithStore(PROTOCOL_WITH_FORM_CONFLICT);

    expect(
      editorValidate({
        id: 'p1',
        text: 'T',
        highlight: { allowHighlighting: false },
      }),
    ).toBeUndefined();
  });
});
