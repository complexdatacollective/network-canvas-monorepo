import { configureStore } from '@reduxjs/toolkit';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// Final-review sweep: FamilyPedigree's four nodeConfig slots are UNVALIDATED
// writers, each carrying a picker exclusion (excludeValidatedUses with the
// slot's own draft value as escape) and a field-level `crossClassPick` gate.
// ArchitectField is mocked to EXPOSE both the validation rules object and the
// picker's filtered options — the capture-a-handler-prop idiom
// NodeConfiguration.crossClassGate.test.tsx (NetworkComposer) uses for this
// app's other field-level gates. ArchitectArrayField is mocked to capture the
// nodeConfig.form dialog's editorValidate, so the intra-draft MIRROR (a form
// field picking a variable a still-unsaved slot drafts) is pinned too.
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
// Breaks a static import chain (FieldFields -> ValidationSection ->
// ~/components/Validations) that a different in-flight batch has mid-rewrite;
// ArchitectArrayField is mocked below too, so FieldFields is never rendered.
vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));

type CapturedField = {
  validation?: Record<string, unknown>;
  options?: unknown;
};
const capturedFields: Record<string, CapturedField | undefined> = {};
vi.mock('~/components/Form/ArchitectField', () => ({
  default: ({
    name,
    validation,
    options,
  }: {
    name: string;
    validation?: Record<string, unknown>;
    options?: unknown;
  }) => {
    capturedFields[name] = { validation, options };
    return <div data-testid={`field-${name}`} />;
  },
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
vi.mock('~/components/Form/ArchitectArrayField', () => ({
  default: ({
    editorValidate,
  }: {
    editorValidate?: (
      values: Record<string, unknown>,
      props?: { initialValues?: unknown },
    ) => Record<string, unknown>;
  }) => {
    if (typeof editorValidate === 'function') {
      capturedEditorValidate = editorValidate;
    }
    return <div data-testid="field-array" />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import NodeConfiguration from '../NodeConfiguration';

type SlotValidator = (
  value: unknown,
  allValues?: unknown,
) => string | undefined;

const slotValidatorFor = (fieldName: string): SlotValidator => {
  const validator = capturedFields[fieldName]?.validation?.crossClassPick;
  if (typeof validator !== 'function') {
    throw new Error(`No crossClassPick validator captured for ${fieldName}`);
  }
  return validator as SlotValidator;
};

const slotOptionValuesFor = (fieldName: string): string[] => {
  const options = capturedFields[fieldName]?.options;
  if (!Array.isArray(options)) {
    throw new Error(`No options captured for ${fieldName}`);
  }
  return options.map((option: { value: string }) => option.value);
};

// `usedLabel` is a text variable an AlterForm field elsewhere collects
// (validated, stage s1); `freeLabel` has no saved use anywhere — the
// discriminating pair for the text slots. `usedFlag`/`freeFlag` mirror it for
// the boolean slot, and `usedSex`/`freeSex` (carrying the canonical
// biological-sex option set, imported so `optionsMatch` genuinely passes) for
// the categorical slot.
const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        usedLabel: { name: 'Used Label', type: 'text' },
        freeLabel: { name: 'Free Label', type: 'text' },
        usedFlag: { name: 'Used Flag', type: 'boolean' },
        freeFlag: { name: 'Free Flag', type: 'boolean' },
        usedSex: {
          name: 'Used Sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
        freeSex: {
          name: 'Free Sex',
          type: 'categorical',
          options: BIOLOGICAL_SEX_OPTIONS,
        },
      },
    },
  },
};

const FORM_STAGE = {
  id: 's1',
  type: 'AlterForm',
  label: 'F',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 'T', text: 'X' },
  form: {
    fields: [
      { variable: 'usedLabel', prompt: 'P' },
      { variable: 'usedFlag', prompt: 'Q' },
      { variable: 'usedSex', prompt: 'R' },
    ],
  },
};

// The same-class control: `freeLabel` written by ANOTHER FamilyPedigree
// stage's slot (unvalidated) must never be excluded or rejected here.
const OTHER_PEDIGREE_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P2',
  nodeConfig: { type: 'person', nodeLabelVariable: 'freeLabel' },
};

const protocolWith = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: CODEBOOK,
  stages,
});

const renderComponent = ({
  protocol,
  draftNodeConfig,
  initialNodeConfig,
}: {
  protocol: unknown;
  draftNodeConfig?: Record<string, string>;
  initialNodeConfig?: Record<string, unknown>;
}) => {
  for (const key of Object.keys(capturedFields)) {
    delete capturedFields[key];
  }
  capturedEditorValidate = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
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
              id: 's3',
              type: 'FamilyPedigree',
              nodeConfig: { type: 'person', ...initialNodeConfig },
            } as unknown as Stage
          }
          stageId="s3"
          formId="edit-stage"
        >
          <Probe />
          <NodeConfiguration
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType="FamilyPedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  if (draftNodeConfig && context) {
    const storeApi = (context as StageFormContextValue).storeApi;
    act(() => {
      for (const [field, value] of Object.entries(draftNodeConfig)) {
        storeApi.getState().setFieldValue(`nodeConfig.${field}`, value);
      }
    });
  }
};

describe('FamilyPedigree NodeConfiguration slot picker exclusions', () => {
  it('drops a variable a form elsewhere already validates from every slot pool', () => {
    renderComponent({ protocol: protocolWith([FORM_STAGE]) });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).not.toContain(
      'usedLabel',
    );
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).toContain(
      'freeLabel',
    );
    expect(slotOptionValuesFor('nodeConfig.egoVariable')).not.toContain(
      'usedFlag',
    );
    expect(slotOptionValuesFor('nodeConfig.egoVariable')).toContain('freeFlag');
    expect(
      slotOptionValuesFor('nodeConfig.relationshipVariable'),
    ).not.toContain('usedLabel');
    expect(
      slotOptionValuesFor('nodeConfig.biologicalSexVariable'),
    ).not.toContain('usedSex');
    expect(slotOptionValuesFor('nodeConfig.biologicalSexVariable')).toContain(
      'freeSex',
    );
  });

  it('keeps a variable only an unvalidated writer elsewhere already claims (same class)', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).toContain(
      'freeLabel',
    );
  });

  it('keeps the slot’s own current pick offered even when conflicted', () => {
    renderComponent({
      protocol: protocolWith([FORM_STAGE]),
      draftNodeConfig: { nodeLabelVariable: 'usedLabel' },
    });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).toContain(
      'usedLabel',
    );
    // The sibling text slot escapes only its OWN value.
    expect(
      slotOptionValuesFor('nodeConfig.relationshipVariable'),
    ).not.toContain('usedLabel');
  });
});

describe('FamilyPedigree NodeConfiguration slot cross-class gates', () => {
  it('every slot rejects a pick a form elsewhere already collects, with the mirror message', () => {
    renderComponent({ protocol: protocolWith([FORM_STAGE]) });
    expect(slotValidatorFor('nodeConfig.nodeLabelVariable')('usedLabel')).toBe(
      '"Used Label" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    );
    expect(slotValidatorFor('nodeConfig.egoVariable')('usedFlag')).toContain(
      'is collected by a form elsewhere',
    );
    expect(
      slotValidatorFor('nodeConfig.relationshipVariable')('usedLabel'),
    ).toContain('is collected by a form elsewhere');
    expect(
      slotValidatorFor('nodeConfig.biologicalSexVariable')('usedSex'),
    ).toContain('is collected by a form elsewhere');
  });

  it('escapes when the pick equals the slot’s committed value (pre-existing conflict stays saveable)', () => {
    renderComponent({
      protocol: protocolWith([FORM_STAGE]),
      initialNodeConfig: { nodeLabelVariable: 'usedLabel' },
    });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('usedLabel'),
    ).toBeUndefined();
  });

  it('allows a pick only an unvalidated writer elsewhere already claims (same class)', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel'),
    ).toBeUndefined();
  });

  it('rejects a pick this stage’s own still-unsaved nodeConfig.form draft collects (intra-draft)', () => {
    renderComponent({ protocol: protocolWith([]) });
    const allValues = {
      nodeConfig: { type: 'person', form: [{ variable: 'freeLabel' }] },
    };
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel', allValues),
    ).toContain('is collected by a form elsewhere');
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeFlag', allValues),
    ).toBeUndefined();
  });
});

describe('FamilyPedigree nodeConfig.form editorValidate intra-draft mirror', () => {
  it('rejects a form-field pick a still-unsaved slot drafts, and allows an unconflicted one', () => {
    renderComponent({
      protocol: protocolWith([]),
      draftNodeConfig: { nodeLabelVariable: 'freeLabel' },
    });
    if (!capturedEditorValidate) {
      throw new Error('editorValidate was not captured');
    }
    expect(
      capturedEditorValidate(
        { variable: 'freeLabel', component: 'Text', validation: {} },
        { initialValues: {} },
      ),
    ).toEqual({
      variable:
        '"Free Label" is written without validation by another stage, so it cannot be used as a form field',
    });
    expect(
      capturedEditorValidate(
        { variable: 'usedLabel', component: 'Text', validation: {} },
        { initialValues: {} },
      ),
    ).toEqual({});
  });
});
