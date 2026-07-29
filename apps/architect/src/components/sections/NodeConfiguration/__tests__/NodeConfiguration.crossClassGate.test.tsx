import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

// Composer scope-change consequentials: NetworkComposer's quickAdd is now a
// VALIDATED writer (its interview input honours the target variable's
// codebook validation — see network-composer.ts), so its save-time gate now
// mirrors Form.tsx's form-field gate exactly: reject a pick some bin/
// highlight/census/etc. elsewhere already writes WITHOUT validation, using
// the mirror message, with the usual committed-value escape. There is no
// intra-draft check any more — nodeForm.fields is also a validated writer
// (same class as quickAdd), so no cross-class pair can form between them,
// and convexHullVariable is untagged entirely (never gated, never
// restricted — see pickerExclusions.test.ts for its picker coverage).
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

type CrossClassValidator = (value: unknown) => string | undefined;

const crossClassValidatorFor = (fieldName: string): CrossClassValidator => {
  const validator = capturedValidation[fieldName]?.crossClassPick;
  if (typeof validator !== 'function') {
    throw new Error(`No crossClassPick validator captured for ${fieldName}`);
  }
  return validator as CrossClassValidator;
};

// `label` is a text variable written by an AlterForm field elsewhere
// (validated, stage s1) and by a FamilyPedigree nodeLabelVariable (unvalidated,
// stage s2) — the same "one hit each direction" fixture shape
// pickerExclusions.test.ts/roleMap.test.ts use, sized for quickAdd's TEXT-only
// picker.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
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
      form: { fields: [{ variable: 'label', prompt: 'Q' }] },
    },
    {
      id: 's2',
      type: 'FamilyPedigree',
      label: 'P',
      nodeConfig: { type: 'person', nodeLabelVariable: 'label' },
    },
  ],
};

const renderComponent = (
  protocol: unknown = PROTOCOL_WITH_FORM_CONFLICT,
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

describe('NodeConfiguration (NetworkComposer) quickAdd cross-class gate', () => {
  it('rejects a pick a bin/nomination/etc. elsewhere already writes without validation', () => {
    renderComponent();
    const errors = crossClassValidatorFor('quickAdd')('label');
    expect(errors).toBe(
      '"Label" is written without validation by another stage, so it cannot be used as a form field',
    );
  });

  it('escapes when the pick equals the stage’s original committed value', () => {
    renderComponent(PROTOCOL_WITH_FORM_CONFLICT, { quickAdd: 'label' });
    expect(crossClassValidatorFor('quickAdd')('label')).toBeUndefined();
  });

  it('allows a pick with no saved-document conflict', () => {
    const conflictFree = { ...PROTOCOL_WITH_FORM_CONFLICT, stages: [] };
    renderComponent(conflictFree);
    expect(crossClassValidatorFor('quickAdd')('label')).toBeUndefined();
  });

  it('allows a pick that only a form elsewhere already validates (no unvalidated hit)', () => {
    const validatedOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[0]],
    };
    renderComponent(validatedOnly);
    expect(crossClassValidatorFor('quickAdd')('label')).toBeUndefined();
  });
});

describe('NodeConfiguration (NetworkComposer) convexHullVariable is never gated', () => {
  it('carries no crossClassPick validator — convexHullVariable is untagged, not an attribute writer', () => {
    renderComponent();
    expect(capturedValidation.convexHullVariable).toEqual({});
  });
});
