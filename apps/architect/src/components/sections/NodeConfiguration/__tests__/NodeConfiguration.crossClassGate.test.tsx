import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

// Task 9 fix round 1 (controller-approved gap closure): NetworkComposer is
// the one stage carrying both writer classes on the SAME draft — an
// unvalidated `quickAdd`/`convexHullVariable` alongside a validated
// `nodeForm.fields` form — so an intra-editor pick the Task 8 picker
// exclusions can't see (they only compare against the COMMITTED protocol)
// can still create a cross-class pair here. This mount-level test covers
// both halves of the new gate: (a) the SAVED document's role map (with the
// committed-value escape), and (b) the live DRAFT's own nodeForm.fields list.
//
// The heavy editor chrome is stubbed the way NodeConfiguration.test.tsx
// stubs it; unlike that file, ValidatedField is mocked to EXPOSE the
// `validation` rules object (specifically `crossClassPick`, the custom
// validator function `getValidations` (~/utils/validations.ts) passes
// straight through since it's a function, not a declarative rule) for
// direct invocation — the same capture-a-handler-prop idiom used throughout
// this project's Task 9 tests, applied here to a field-level validator
// instead of a dialog's editorValidate/onBeforeSave.
vi.mock('~/components/EditorLayout', () => ({
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock('~/components/IssueAnchor', () => ({ default: () => null }));
vi.mock('~/components/NewVariableWindow', () => ({
  default: () => null,
  useNewVariableWindowState: (initial: unknown) => [initial, () => undefined],
}));
vi.mock('~/components/EditableAttributesList/EditableAttributesList', () => ({
  default: () => <div data-testid="attributes-list" />,
}));

const capturedValidation: Record<string, Record<string, unknown> | undefined> =
  {};
vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({
    name,
    validation,
  }: {
    name: string;
    validation?: Record<string, unknown>;
  }) => {
    capturedValidation[name] = validation;
    return <div data-testid={`field-${name}`} />;
  },
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { NodeConfigurationComponent } from '../NodeConfiguration';

type CrossClassValidator = (
  value: unknown,
  allValues?: Record<string, unknown>,
) => string | undefined;

const crossClassValidatorFor = (fieldName: string): CrossClassValidator => {
  const validator = capturedValidation[fieldName]?.crossClassPick;
  if (typeof validator !== 'function') {
    throw new Error(`No crossClassPick validator captured for ${fieldName}`);
  }
  return validator as CrossClassValidator;
};

// `cat` (categorical) and `label` (text) are each written by an AlterForm
// field elsewhere (validated, stage s1) — the same fixture shape
// pickerExclusions.test.ts/roleMap.test.ts use, covering check (a) for both
// convexHullVariable (categorical) and quickAdd (text).
const PROTOCOL_WITH_FORM_CONFLICTS = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
          label: { name: 'Label', type: 'text' },
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
      form: {
        fields: [
          { variable: 'cat', prompt: 'P' },
          { variable: 'label', prompt: 'Q' },
        ],
      },
    },
  ],
};

const renderComponent = (
  protocol: unknown = PROTOCOL_WITH_FORM_CONFLICTS,
  editFormInitial?: Record<string, unknown>,
) => {
  for (const key of Object.keys(capturedValidation)) {
    delete capturedValidation[key];
  }
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol }) => state,
      form: (
        state = editFormInitial
          ? { 'edit-stage': { initial: editFormInitial } }
          : {},
      ) => state,
    },
  });
  render(
    <Provider store={store}>
      <NodeConfigurationComponent
        entity="node"
        type="person"
        form="edit-stage"
        handleCreateVariable={() => undefined}
        handleChangeFields={() => undefined}
        layoutVariablesForSubject={[]}
        categoricalVariablesForSubject={[]}
        quickAddOptionsForSubject={[]}
      />
    </Provider>,
  );
};

describe('NodeConfiguration (NetworkComposer) cross-class gate', () => {
  describe('(a) saved-document role map', () => {
    it('rejects quickAdd picking a variable a form elsewhere already collects', () => {
      renderComponent();
      const errors = crossClassValidatorFor('quickAdd')('label');
      expect(errors).toBe(
        '"Label" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('rejects convexHullVariable picking a variable a form elsewhere already collects', () => {
      renderComponent();
      const errors = crossClassValidatorFor('convexHullVariable')('cat');
      expect(errors).toBe(
        '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('escapes quickAdd when the pick equals the stage’s original committed value', () => {
      renderComponent(PROTOCOL_WITH_FORM_CONFLICTS, { quickAdd: 'label' });
      expect(crossClassValidatorFor('quickAdd')('label')).toBeUndefined();
    });

    it('escapes convexHullVariable when the pick equals the stage’s original committed value', () => {
      renderComponent(PROTOCOL_WITH_FORM_CONFLICTS, {
        convexHullVariable: 'cat',
      });
      expect(
        crossClassValidatorFor('convexHullVariable')('cat'),
      ).toBeUndefined();
    });

    it('allows a pick with no saved-document conflict', () => {
      const conflictFree = {
        ...PROTOCOL_WITH_FORM_CONFLICTS,
        stages: [],
      };
      renderComponent(conflictFree);
      expect(crossClassValidatorFor('quickAdd')('label')).toBeUndefined();
      expect(
        crossClassValidatorFor('convexHullVariable')('cat'),
      ).toBeUndefined();
    });
  });

  describe('(b) intra-editor draft collision with nodeForm.fields', () => {
    it('rejects quickAdd colliding with the SAME draft’s nodeForm.fields, with no saved-doc conflict', () => {
      const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] };
      renderComponent(conflictFree);
      const errors = crossClassValidatorFor('quickAdd')('label', {
        nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
      });
      expect(errors).toBe(
        '"Label" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('rejects convexHullVariable colliding with the SAME draft’s nodeForm.fields', () => {
      const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] };
      renderComponent(conflictFree);
      const errors = crossClassValidatorFor('convexHullVariable')('cat', {
        nodeForm: { fields: [{ variable: 'cat', component: 'CheckboxGroup' }] },
      });
      expect(errors).toBe(
        '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('still blocks when quickAdd is unchanged but nodeForm.fields is the side that newly adds the pair', () => {
      const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] };
      // quickAdd's OWN original committed value is 'label', but nodeForm.fields
      // did NOT have 'label' committed — this draft's nodeForm side is what
      // newly creates the pair, so it still blocks: the escape requires BOTH
      // sides to have already carried this exact pair in the committed stage.
      renderComponent(conflictFree, { quickAdd: 'label' });
      const errors = crossClassValidatorFor('quickAdd')('label', {
        nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
      });
      expect(errors).toBe(
        '"Label" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('still blocks when nodeForm.fields already had the variable but quickAdd is the side that newly picks it', () => {
      const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] };
      // The committed stage's nodeForm.fields already wrote 'label', but
      // quickAdd's OWN committed value was something else — quickAdd's fresh
      // pick of 'label' is what creates the pair here, so it still blocks.
      renderComponent(conflictFree, {
        quickAdd: 'other',
        nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
      });
      const errors = crossClassValidatorFor('quickAdd')('label', {
        nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
      });
      expect(errors).toBe(
        '"Label" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
      );
    });

    it('allows a pick with no intra-draft collision', () => {
      const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] };
      renderComponent(conflictFree);
      const errors = crossClassValidatorFor('quickAdd')('label', {
        nodeForm: { fields: [{ variable: 'other', component: 'Text' }] },
      });
      expect(errors).toBeUndefined();
    });
  });

  // Controller-requested refinement: a pre-existing conflict already present
  // in the SAVED document must never block re-saving unchanged — that is the
  // timeline alert's job, not this gate's. Only a pair this draft actually
  // introduces (either side changed away from its own committed value)
  // still blocks with no escape (covered above).
  describe('(b) escape for a pre-existing identical pair already in the saved document', () => {
    it('quickAdd re-saves cleanly when the committed stage already had this exact pair, unchanged', () => {
      renderComponent(
        { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] },
        {
          quickAdd: 'label',
          nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
        },
      );
      const errors = crossClassValidatorFor('quickAdd')('label', {
        nodeForm: { fields: [{ variable: 'label', component: 'Text' }] },
      });
      expect(errors).toBeUndefined();
    });

    it('convexHullVariable re-saves cleanly when the committed stage already had this exact pair, unchanged', () => {
      renderComponent(
        { ...PROTOCOL_WITH_FORM_CONFLICTS, stages: [] },
        {
          convexHullVariable: 'cat',
          nodeForm: {
            fields: [{ variable: 'cat', component: 'CheckboxGroup' }],
          },
        },
      );
      const errors = crossClassValidatorFor('convexHullVariable')('cat', {
        nodeForm: { fields: [{ variable: 'cat', component: 'CheckboxGroup' }] },
      });
      expect(errors).toBeUndefined();
    });
  });
});
