import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { DragControls } from 'motion/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import {
  reducer as formReducer,
  reduxForm,
  type InjectedFormProps,
} from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

// Final-review sweep: additionalAttributes stamps are UNVALIDATED writers, so
// each row's variable picker carries a field-level `crossClassPick` validator
// (the same shape as NetworkComposer's quickAdd — a sync validator, so an
// invalid pick blocks the prompt dialog's save). ValidatedField is mocked to
// EXPOSE the validation rules object for direct invocation — the
// capture-a-handler-prop idiom NodeConfiguration.crossClassGate.test.tsx uses
// for this app's other field-level gates.
vi.mock('../../enhancers/withCreateVariableHandler', () => ({
  default:
    (WrappedComponent: ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => (
      <WrappedComponent
        {...props}
        handleCreateVariable={() => undefined}
        handleDeleteVariable={() => undefined}
        normalizeKeyDown={() => undefined}
      />
    ),
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
import Attribute, { type AttributeValue } from '../Attribute';

type CrossClassValidator = (value: unknown) => string | undefined;

const crossClassValidatorFor = (fieldName: string): CrossClassValidator => {
  const validator = capturedValidation[fieldName]?.crossClassPick;
  if (typeof validator !== 'function') {
    throw new Error(`No crossClassPick validator captured for ${fieldName}`);
  }
  return validator as CrossClassValidator;
};

// `flagged` mirrors the pickerExclusions.test.ts/roleMap.test.ts fixture
// shape: written by a form field (validated, stage s1) — the OPPOSITE class
// to this stamp — and, in the same-class variant below, by a FamilyPedigree
// nomination prompt (unvalidated, stage s2) instead.
const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        flagged: { name: 'Flagged', type: 'boolean' },
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
  form: { fields: [{ variable: 'flagged', prompt: 'P' }] },
};

const NOMINATION_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P',
  nodeConfig: { type: 'person' },
  nominationPrompts: [{ id: 'p1', text: 'T', variable: 'flagged' }],
};

const protocolWith = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: CODEBOOK,
  stages,
});

type FormValues = { additionalAttributes: AttributeValue[] };

const renderRow = (protocol: unknown, committedRow?: AttributeValue): void => {
  for (const key of Object.keys(capturedValidation)) {
    delete capturedValidation[key];
  }
  const Harness = (_props: InjectedFormProps<FormValues>) => (
    <Attribute
      arrayName="additionalAttributes"
      fieldName="additionalAttributes[0]"
      form="attribute-gate-test"
      showErrors={false}
      item={committedRow ?? {}}
      index={0}
      itemCount={1}
      isNewItem={!committedRow}
      onChange={() => undefined}
      onUpdate={() => undefined}
      onCancel={() => undefined}
      onDelete={() => undefined}
      onEdit={() => undefined}
      onMove={() => undefined}
      isSortable={false}
      isBeingEdited={false}
      disabled={false}
      readOnly={false}
      dragControls={{} as DragControls}
      variableOptions={[
        { label: 'Flagged', value: 'flagged', type: 'boolean' },
      ]}
      entity="node"
      type="person"
    />
  );
  const ReduxHarness = reduxForm<FormValues>({ form: 'attribute-gate-test' })(
    Harness,
  );
  const store = configureStore({
    reducer: {
      form: formReducer,
      activeProtocol: (state = { present: protocol }) => state,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  render(
    <Provider store={store}>
      <ReduxHarness
        initialValues={{
          additionalAttributes: committedRow ? [committedRow] : [],
        }}
      />
    </Provider>,
  );
};

describe('Attribute (additionalAttributes stamp) cross-class gate', () => {
  it('rejects a pick a form elsewhere already collects, with the mirror message', () => {
    renderRow(protocolWith([FORM_STAGE]));
    expect(
      crossClassValidatorFor('additionalAttributes[0].variable')('flagged'),
    ).toBe(
      '"Flagged" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    );
  });

  it('escapes when the pick equals the row’s committed variable (editing without changing)', () => {
    renderRow(protocolWith([FORM_STAGE]), { variable: 'flagged', value: true });
    expect(
      crossClassValidatorFor('additionalAttributes[0].variable')('flagged'),
    ).toBeUndefined();
  });

  it('allows a pick only an unvalidated writer elsewhere already claims (same class)', () => {
    renderRow(protocolWith([NOMINATION_STAGE]));
    expect(
      crossClassValidatorFor('additionalAttributes[0].variable')('flagged'),
    ).toBeUndefined();
  });

  it('allows a pick with no use anywhere', () => {
    renderRow(protocolWith([]));
    expect(
      crossClassValidatorFor('additionalAttributes[0].variable')('flagged'),
    ).toBeUndefined();
  });
});
