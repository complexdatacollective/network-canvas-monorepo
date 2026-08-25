import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
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

// FamilyPedigree's node label is a VALIDATED writer; its three structural node
// slots remain UNVALIDATED writers. Each carries the matching picker exclusion
// and field-level `crossClassPick` gate.
// ArchitectField is mocked to EXPOSE both the validation rules object and the
// picker's filtered options — the capture-a-handler-prop idiom
// NodeConfiguration.crossClassGate.test.tsx (NetworkComposer) uses for this
// app's other field-level gates. ArchitectArrayField is mocked to capture the
// nodeConfig.form dialog's editorValidate, so the intra-draft MIRROR (a form
// field picking a variable a still-unsaved slot drafts) is pinned too.
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@codaco/fresco-ui/Section', () => ({
  default: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title} data-component="Section">
      {children}
    </section>
  ),
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
// The label's validation section is a real nested form over the selected
// codebook variable; stubbing it keeps that second store out of this test and
// exposes the subject/variable the label pick hands it.
let capturedValidationSectionProps: Record<string, unknown> | undefined;
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: (props: Record<string, unknown>) => {
    capturedValidationSectionProps = props;
    return null;
  },
}));

type CapturedField = {
  hint?: ReactNode;
  inline?: boolean;
  label?: string;
  validation?: Record<string, unknown>;
  options?: unknown;
};
const capturedFields: Record<string, CapturedField | undefined> = {};
vi.mock('~/components/Form/ArchitectField', () => ({
  default: ({
    name,
    hint,
    inline,
    label,
    validation,
    options,
  }: {
    name: string;
    hint?: ReactNode;
    inline?: boolean;
    label: string;
    validation?: Record<string, unknown>;
    options?: unknown;
  }) => {
    capturedFields[name] = { hint, inline, label, validation, options };
    return <div data-testid={`field-${name}`} />;
  },
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
// The picker's sibling list travels the other way, as `editorProps`, so a test
// can prove the gate and the picker read the same rows.
let capturedEditorProps: Record<string, unknown> | undefined;
vi.mock('~/components/Form/ArchitectArrayField', () => ({
  default: ({
    editorValidate,
    editorProps,
  }: {
    editorValidate?: (
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ) => Record<string, unknown>;
    editorProps?: Record<string, unknown>;
  }) => {
    if (typeof editorValidate === 'function') {
      capturedEditorValidate = editorValidate;
      capturedEditorProps = editorProps;
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

// Same-class validated control: another pedigree's label may safely reuse the
// same variable.
const OTHER_PEDIGREE_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P2',
  nodeConfig: { type: 'person', nodeLabelVariable: 'freeLabel' },
};

// Cross-class control: relationshipVariable is structural and therefore
// unvalidated, so it must exclude/reject `freeLabel` as a node label. Its id
// stays clear of the stage under edit (`s3`), which is excluded from the
// composer views.
const STRUCTURAL_PEDIGREE_STAGE = {
  id: 's4',
  type: 'FamilyPedigree',
  label: 'P4',
  nodeConfig: { type: 'person', relationshipVariable: 'freeLabel' },
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
  capturedValidationSectionProps = undefined;
  capturedEditorValidate = undefined;
  capturedEditorProps = undefined;
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

  return {
    /**
     * Rewrites `nodeConfig.form` the way the array editor does when the
     * researcher adds or removes a row: the stage form holds it immediately,
     * the saved stage does not carry it until the editor is saved.
     */
    setPedigreeFormFields: (fields: Record<string, unknown>[]) => {
      if (!context) throw new Error('stage form context was not captured');
      const storeApi = (context as StageFormContextValue).storeApi;
      act(() => {
        storeApi.getState().setFieldValue('nodeConfig.form', fields);
      });
    },
  };
};

/** The `editorValidate` as it stands now, not as it stood at mount. */
const currentEditorValidate = () => {
  if (!capturedEditorValidate) {
    throw new Error('editorValidate was not captured');
  }
  return capturedEditorValidate;
};

const currentSiblingFields = () => capturedEditorProps?.siblingFields;

describe('FamilyPedigree NodeConfiguration slot picker exclusions', () => {
  it('groups the attribute mappings in a nested Section with inline fields', () => {
    renderComponent({ protocol: protocolWith([]) });

    const familyMemberData = screen.getByRole('region', {
      name: 'Family member data',
    });
    const attributes = screen.getByRole('region', {
      name: 'Family member attributes',
    });
    const formConfiguration = screen.getByRole('region', {
      name: 'Form configuration',
    });

    expect(attributes).toHaveAttribute('data-component', 'Section');
    expect(familyMemberData).toContainElement(attributes);
    expect(familyMemberData).toContainElement(formConfiguration);
    expect(attributes).not.toContainElement(formConfiguration);
    expect(capturedFields['nodeConfig.nodeLabelVariable']).toMatchObject({
      label: 'Display label',
      inline: true,
    });
    expect(capturedFields['nodeConfig.egoVariable']).toMatchObject({
      label: 'Participant identifier',
      inline: true,
    });
    expect(capturedFields['nodeConfig.relationshipVariable']).toMatchObject({
      label: 'Relationship to participant',
      inline: true,
    });
    expect(capturedFields['nodeConfig.biologicalSexVariable']).toMatchObject({
      label: 'Biological sex',
      inline: true,
    });
  });

  it('edits the label as a node variable, preserving every text validation rule', () => {
    renderComponent({
      protocol: protocolWith([]),
      draftNodeConfig: { nodeLabelVariable: 'freeLabel' },
    });

    expect(capturedValidationSectionProps).toMatchObject({
      entity: 'node',
      type: 'person',
      variableId: 'freeLabel',
    });
  });

  it('keeps variables validated elsewhere for the label and drops them from structural slots', () => {
    renderComponent({ protocol: protocolWith([FORM_STAGE]) });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).toContain(
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

  it('keeps a variable another validated label writer already claims', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).toContain(
      'freeLabel',
    );
  });

  it('drops a variable an unvalidated structural writer already claims from the label pool', () => {
    renderComponent({
      protocol: protocolWith([STRUCTURAL_PEDIGREE_STAGE]),
    });
    expect(slotOptionValuesFor('nodeConfig.nodeLabelVariable')).not.toContain(
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
    // The sibling structural text slot has no escape for the label's value.
    expect(
      slotOptionValuesFor('nodeConfig.relationshipVariable'),
    ).not.toContain('usedLabel');
  });
});

describe('FamilyPedigree NodeConfiguration slot cross-class gates', () => {
  it('allows a label pick collected by another validated field and rejects it from structural slots', () => {
    renderComponent({ protocol: protocolWith([FORM_STAGE]) });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('usedLabel'),
    ).toBeUndefined();
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

  it('allows a pick another validated label writer already claims', () => {
    renderComponent({ protocol: protocolWith([OTHER_PEDIGREE_STAGE]) });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel'),
    ).toBeUndefined();
  });

  // The label's own picker drops this variable (the sibling case above), so
  // reaching the gate at all means a stale draft or an imported protocol —
  // and the refusal names the interface that claims it, rather than the
  // generic cross-class wording, because a variable an interface slot OWNS is
  // refused for that stronger reason. `findExclusiveVariableConflicts` reports
  // the same pairing, so the editor and the schema agree.
  it('rejects a label pick an unvalidated structural writer already claims', () => {
    renderComponent({
      protocol: protocolWith([STRUCTURAL_PEDIGREE_STAGE]),
    });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel'),
    ).toContain('is set by the Family Pedigree interface');
  });

  it('allows a label pick this stage’s own form also validates', () => {
    renderComponent({ protocol: protocolWith([]) });
    const allValues = {
      nodeConfig: { type: 'person', form: [{ variable: 'freeLabel' }] },
    };
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel', allValues),
    ).toBeUndefined();
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeFlag', allValues),
    ).toBeUndefined();
  });
});

describe('FamilyPedigree nodeConfig.form editorValidate intra-draft mirror', () => {
  it('allows a field to share the validated label and rejects a structural slot draft', () => {
    renderComponent({
      protocol: protocolWith([]),
      draftNodeConfig: {
        nodeLabelVariable: 'freeLabel',
        relationshipVariable: 'usedLabel',
      },
    });
    if (!capturedEditorValidate) {
      throw new Error('editorValidate was not captured');
    }
    expect(
      capturedEditorValidate(
        { variable: 'freeLabel', component: 'Text', validation: {} },
        { initialValues: {} },
      ),
    ).toEqual({});
    expect(
      capturedEditorValidate(
        { variable: 'usedLabel', component: 'Text', validation: {} },
        { initialValues: {} },
      ),
    ).toEqual({
      variable:
        '"Used Label" is written without validation by another stage, so it cannot be used as a form field',
    });
  });

  // The rows to check against are the ones in the OPEN editor, not the ones on
  // the saved stage. A field added in this session is not on the saved stage
  // yet, so a committed sibling list would let its variable be picked a second
  // time — and would not hide it in the picker either — leaving a stage the
  // schema refuses on save.
  it('rejects a variable a field added in this editing session already collects', () => {
    const { setPedigreeFormFields } = renderComponent({
      protocol: protocolWith([]),
    });

    setPedigreeFormFields([{ variable: 'freeLabel', component: 'Text' }]);

    expect(
      currentEditorValidate()({
        variable: 'freeLabel',
        component: 'Text',
        validation: {},
      }).variable,
    ).toBe(
      'This attribute is already collected by another field in this form. Choose a different attribute, or edit the existing field instead.',
    );
    expect(currentSiblingFields()).toEqual([
      { variable: 'freeLabel', component: 'Text' },
    ]);
  });

  it('stops rejecting a variable whose field was removed in this editing session', () => {
    const { setPedigreeFormFields } = renderComponent({
      protocol: protocolWith([]),
      initialNodeConfig: {
        form: [{ variable: 'freeLabel', component: 'Text' }],
      },
    });

    setPedigreeFormFields([]);

    expect(
      currentEditorValidate()({
        variable: 'freeLabel',
        component: 'Text',
        validation: {},
      }).variable,
    ).toBeUndefined();
    expect(currentSiblingFields()).toEqual([]);
  });
});
