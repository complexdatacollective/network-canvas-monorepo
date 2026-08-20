import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

type EditorValidate = (
  values: Record<string, unknown>,
  props?: { editIndex?: number },
) => Record<string, unknown>;

let capturedEditorValidate: EditorValidate | undefined;
let capturedEditorProps: { siblingDiseases?: unknown } | undefined;

// The row dialog is exercised by DiseaseFields' own suites; here the array
// field exists only to hand over the gate it was configured with, and the
// props it passes the picker.
vi.mock('~/components/Form/arrayFields/DialogArrayField', () => ({
  default: ({
    editorValidate,
    editorProps,
  }: {
    editorValidate?: EditorValidate;
    editorProps?: { siblingDiseases?: unknown };
  }) => {
    capturedEditorValidate = editorValidate;
    capturedEditorProps = editorProps;
    return null;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import Diseases from '../Diseases';

/** The stage as SAVED: one disease, mapping one variable. */
const COMMITTED_DISEASES = [
  {
    label: 'Asthma',
    color: 'node-1',
    variable: 'var-1',
    inheritancePattern: 'complex',
  },
];

const renderDiseases = () => {
  capturedEditorValidate = undefined;
  capturedEditorProps = undefined;

  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          present: { schemaVersion: 8, codebook: { node: {} }, stages: [] },
        },
      ) => state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  let context: StageFormContextValue | null = null;
  const Probe = () => {
    context = useStageFormContext();
    return null;
  };

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 's1',
              type: 'NarrativePedigree',
              diseases: COMMITTED_DISEASES,
            } as unknown as Stage
          }
          stageId="s1"
          formId="edit-stage"
        >
          <Probe />
          <Diseases
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="NarrativePedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  return {
    /**
     * Rewrites `diseases` the way the array editor does when the researcher
     * adds or removes a row: the stage form holds it immediately, the saved
     * stage does not carry it until the editor is saved.
     */
    setRows: (rows: Record<string, unknown>[]) => {
      if (!context) throw new Error('stage form context was not captured');
      act(() => {
        (context as StageFormContextValue).storeApi
          .getState()
          .setFieldValue('diseases', rows);
      });
    },
  };
};

/** The gate as it stands now, not as it stood at mount. */
const currentValidate = (): EditorValidate => {
  if (!capturedEditorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return capturedEditorValidate;
};

describe('NarrativePedigree Diseases gate reads the live rows', () => {
  it('rejects a variable a row added in THIS session already maps', () => {
    const { setRows } = renderDiseases();
    setRows([
      ...COMMITTED_DISEASES,
      { label: 'Eczema', color: 'node-2', variable: 'var-2' },
    ]);

    expect(
      currentValidate()({ variable: 'var-2', label: 'Psoriasis' }),
    ).toEqual({
      variable:
        'This attribute is already mapped by another disease. Choose a different attribute, or edit the existing disease instead.',
    });
  });

  it('rejects a name a row added in THIS session already uses, however it is cased', () => {
    const { setRows } = renderDiseases();
    setRows([
      ...COMMITTED_DISEASES,
      { label: 'Eczema', color: 'node-2', variable: 'var-2' },
    ]);

    expect(currentValidate()({ variable: 'var-3', label: 'eczema' })).toEqual({
      label:
        'Another disease already uses this name. Give this one a name participants can tell apart.',
    });
  });

  it('frees the variable and the name of a row deleted in THIS session', () => {
    const { setRows } = renderDiseases();
    setRows([]);

    expect(currentValidate()({ variable: 'var-1', label: 'Asthma' })).toEqual(
      {},
    );
  });

  it('gives the picker the same live rows the gate reads', () => {
    const { setRows } = renderDiseases();
    const rows = [
      ...COMMITTED_DISEASES,
      { label: 'Eczema', color: 'node-2', variable: 'var-2' },
    ];
    setRows(rows);

    expect(capturedEditorProps?.siblingDiseases).toEqual(rows);
  });
});
