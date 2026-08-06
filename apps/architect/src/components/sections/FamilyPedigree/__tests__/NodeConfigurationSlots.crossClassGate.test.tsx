import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';

// FamilyPedigree's node label is a VALIDATED writer; its three structural node
// slots remain UNVALIDATED writers. Each carries the matching picker exclusion
// and field-level `crossClassPick` gate.
// ValidatedField is mocked to EXPOSE both the validation rules object and the
// picker's filtered options — the capture-a-handler-prop idiom
// NodeConfiguration.crossClassGate.test.tsx (NetworkComposer) uses for this
// app's other field-level gates. ValidatedFieldArray is mocked to capture the
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
vi.mock(
  '~/components/sections/fields/EntitySelectField/EntitySelectField',
  () => ({ default: () => null }),
);
vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));
let capturedValidationSectionProps: Record<string, unknown> | undefined;
vi.mock('~/components/sections/CodebookVariableValidationSection', () => ({
  default: (props: Record<string, unknown>) => {
    capturedValidationSectionProps = props;
    return null;
  },
}));
vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  default: () => null,
}));
vi.mock('../NodeFormFieldPreview', () => ({ default: () => null }));

type CapturedField = {
  validation?: Record<string, unknown>;
  componentProps?: Record<string, unknown>;
};
const capturedFields: Record<string, CapturedField | undefined> = {};
vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    validation,
    componentProps,
  }: {
    name: string;
    validation?: Record<string, unknown>;
    componentProps?: Record<string, unknown>;
  }) => {
    capturedFields[name] = { validation, componentProps };
    return <div data-testid={`field-${name}`} />;
  },
}));

let capturedEditorValidate:
  | ((
      values: Record<string, unknown>,
      props?: { initialValues?: unknown },
    ) => Record<string, unknown>)
  | undefined;
vi.mock('~/components/Form/ValidatedFieldArray', () => ({
  default: ({
    componentProps,
  }: {
    componentProps?: Record<string, unknown>;
  }) => {
    const editorValidate = componentProps?.editorValidate;
    if (typeof editorValidate === 'function') {
      capturedEditorValidate = editorValidate as typeof capturedEditorValidate;
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
  const options = capturedFields[fieldName]?.componentProps?.options;
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
// unvalidated, so it must exclude/reject `freeLabel` as a node label.
const STRUCTURAL_PEDIGREE_STAGE = {
  id: 's3',
  type: 'FamilyPedigree',
  label: 'P3',
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
  draftNodeConfig?: Record<string, unknown>;
  initialNodeConfig?: Record<string, unknown>;
}) => {
  for (const key of Object.keys(capturedFields)) {
    delete capturedFields[key];
  }
  capturedValidationSectionProps = undefined;
  capturedEditorValidate = undefined;
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      form: (
        state = {
          'edit-stage': {
            values: { nodeConfig: { type: 'person', ...draftNodeConfig } },
            ...(initialNodeConfig
              ? { initial: { nodeConfig: initialNodeConfig } }
              : {}),
          },
        },
      ) => state,
    },
  });
  render(
    <Provider store={store}>
      <NodeConfiguration
        form="edit-stage"
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="FamilyPedigree"
      />
    </Provider>,
  );
};

describe('FamilyPedigree NodeConfiguration slot picker exclusions', () => {
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
      initialNodeConfig: { type: 'person', nodeLabelVariable: 'usedLabel' },
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

  it('rejects a label pick an unvalidated structural writer already claims', () => {
    renderComponent({
      protocol: protocolWith([STRUCTURAL_PEDIGREE_STAGE]),
    });
    expect(
      slotValidatorFor('nodeConfig.nodeLabelVariable')('freeLabel'),
    ).toContain('is written without validation');
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
});
