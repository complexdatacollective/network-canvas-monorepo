import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WizardContext } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Form from '@codaco/fresco-ui/form/Form';
import type { NcNode } from '@codaco/shared-consts';

const fixtures = vi.hoisted(() => {
  const nameValidation: Record<string, unknown> = {};
  const aliasValidation: Record<string, unknown> = {};
  const codebook = {
    ego: { variables: {} },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: {
            name: 'name',
            type: 'text' as const,
            component: 'Text' as const,
            validation: nameValidation,
          },
          alias: {
            name: 'Alias',
            type: 'text' as const,
            component: 'Text' as const,
            validation: aliasValidation,
          },
          secret: {
            name: 'Secret',
            type: 'text' as const,
            component: 'Text' as const,
            encrypted: true,
          },
        },
      },
    },
    edge: {},
  };

  return {
    codebook,
    nameValidation,
    aliasValidation,
    passphrase: {
      isEnabled: false,
      passphrase: undefined,
      passphraseInvalid: false,
      submitPassphrase: () => Promise.resolve(false),
    },
    nodeForm: [{ variable: 'alias', prompt: 'What else do they go by?' }],
    localNodes: new Map<string, NcNode>(),
    validationContext: {
      codebook,
      network: {
        ego: { attributes: {} },
        nodes: [] as NcNode[],
        edges: [],
      },
      stageSubject: null,
    },
  };
});

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    if (selector === 'nodeType') return 'person';
    if (selector === 'nodeLabelVariable') return 'name';
    // The rest of the person's attributes, as the wizard's protocol form
    // collects them. `getNodeForm` strips the label variable, which is why the
    // field here has to name that one itself.
    if (selector === 'nodeForm') return fixtures.nodeForm;
    return fixtures.validationContext;
  },
}));

vi.mock('../../utils/nodeUtils', () => ({
  getNodeType: 'nodeType',
  getNodeLabelVariable: 'nodeLabelVariable',
  getNodeForm: 'nodeForm',
}));

vi.mock('../../FamilyPedigreeContext', () => ({
  useFamilyPedigreeStore: (
    selector: (state: { network: { nodes: Map<string, NcNode> } }) => unknown,
  ) => selector({ network: { nodes: fixtures.localNodes } }),
}));

vi.mock('../../../../store/modules/protocol', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../store/modules/protocol')>();
  return {
    ...actual,
    getCodebook: () => fixtures.codebook,
  };
});

// Decrypting stored values for validation reads the passphrase from Redux;
// these people have none to decrypt. FamilyPedigree.encryption.test.tsx
// checks the name against encrypted ones.
vi.mock('../../../../forms/useValidationNetwork', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../forms/useValidationNetwork')
    >();
  return {
    ...actual,
    useValidationNetwork: ({ network }: { network: unknown }) => ({ network }),
  };
});

vi.mock('../../../Anonymisation/usePassphrase', () => ({
  usePassphrase: () => fixtures.passphrase,
}));

vi.mock('../../../../selectors/forms', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../selectors/forms')>();
  return {
    ...actual,
    getValidationContext: 'validationContext',
  };
});

import PersonNameField from '../PersonNameField';

const store = configureStore({ reducer: () => ({}) });

function renderForm(
  children: React.ReactNode,
  onSubmit = vi.fn(() => ({ success: true as const })),
) {
  render(
    <Provider store={store}>
      <Form onSubmit={onSubmit}>
        {children}
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );
  return onSubmit;
}

describe('PersonNameField', () => {
  beforeEach(() => {
    fixtures.localNodes = new Map();
    for (const validation of [
      fixtures.nameValidation,
      fixtures.aliasValidation,
    ]) {
      for (const rule of Object.keys(validation)) delete validation[rule];
    }
    fixtures.nameValidation.required = true;
    fixtures.nameValidation.unique = true;
    fixtures.passphrase.isEnabled = false;
  });

  it('applies the label variable required rule', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(<PersonNameField label="Name" />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/required/i)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('applies uniqueness against people in the in-progress pedigree', async () => {
    fixtures.localNodes = new Map([
      [
        'existing',
        {
          _uid: 'existing',
          type: 'person',
          attributes: { name: 'Alice' },
        },
      ],
    ]);
    const user = userEvent.setup();
    const onSubmit = renderForm(<PersonNameField label="Name" />);

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      /must be unique/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not compare an edited person with their own stored name', async () => {
    fixtures.localNodes = new Map([
      [
        'existing',
        {
          _uid: 'existing',
          type: 'person',
          attributes: { name: 'Alice' },
        },
      ],
    ]);
    const user = userEvent.setup();
    const onSubmit = renderForm(
      <PersonNameField
        label="Name"
        initialValue="Alice"
        currentEntityId="existing"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('allows multiple optional pedigree names to be left blank', async () => {
    fixtures.nameValidation.required = false;
    fixtures.localNodes = new Map([
      [
        'unnamed',
        {
          _uid: 'unnamed',
          type: 'person',
          attributes: { name: '' },
        },
      ],
    ]);
    const user = userEvent.setup();
    const onSubmit = renderForm(<PersonNameField label="Name" />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('rejects duplicate names entered in one multi-person wizard', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      <>
        <FieldNamespace prefix="first">
          <PersonNameField label="First name" />
        </FieldNamespace>
        <FieldNamespace prefix="second">
          <PersonNameField label="Second name" />
        </FieldNamespace>
      </>,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'First name' }),
      'Alice',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Second name' }),
      'Alice',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const errors = await screen.findAllByTestId(/name-field-error$/);
    expect(errors).toHaveLength(2);
    for (const error of errors) {
      expect(error).toHaveTextContent(/must be unique/i);
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a name already entered on a completed wizard step', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      <WizardContext.Provider
        value={{
          currentStep: 1,
          totalSteps: 2,
          data: {},
          completedStepValues: {
            0: { 'egg-parent': { name: 'Alice' } },
          },
          setStepData: vi.fn(),
          setNextEnabled: vi.fn(),
          setBackEnabled: vi.fn(),
          setNextLabel: vi.fn(),
          setBeforeNext: vi.fn(),
          goToStep: vi.fn(),
        }}
      >
        <FieldNamespace prefix="sperm-parent">
          <PersonNameField label="Name" />
        </FieldNamespace>
      </WizardContext.Provider>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      /must be unique/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ignores names retained by an unmounted creation branch', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      <>
        <Field
          name="selection"
          label="Choose a person"
          component={RadioGroupField}
          options={[
            { value: 'new', label: 'Create a new person' },
            { value: 'existing', label: 'Existing person' },
          ]}
          initialValue="new"
        />
        <FieldGroup
          watch={['selection']}
          condition={(values) => values.selection === 'new'}
        >
          <FieldNamespace prefix="discarded">
            <PersonNameField label="Discarded name" />
          </FieldNamespace>
        </FieldGroup>
        <FieldNamespace prefix="active">
          <PersonNameField label="Active name" />
        </FieldNamespace>
      </>,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Discarded name' }),
      'Alice',
    );
    await user.click(screen.getByRole('radio', { name: 'Existing person' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Active name' }),
      'Alice',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('applies comparison rules within the current person namespace', async () => {
    fixtures.nameValidation.unique = false;
    fixtures.nameValidation.sameAs = 'alias';
    const user = userEvent.setup();
    const onSubmit = renderForm(
      <FieldNamespace prefix="parent">
        <Field name="alias" label="Alias" component={InputField} />
        <PersonNameField label="Name" />
      </FieldNamespace>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Alias' }), 'Alice');
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Bob');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      /same as/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('PersonNameField offering the passphrase', () => {
  beforeEach(() => {
    fixtures.localNodes = new Map();
    for (const validation of [
      fixtures.nameValidation,
      fixtures.aliasValidation,
    ]) {
      for (const rule of Object.keys(validation)) delete validation[rule];
    }
    fixtures.passphrase.isEnabled = true;
  });

  const passphraseButton = () =>
    screen.queryByRole('button', { name: /^enter your passphrase$/i });

  it('offers it when the name is compared with a protected answer of the person being edited', () => {
    fixtures.nameValidation.differentFrom = 'secret';
    renderForm(<PersonNameField label="Name" currentEntityId="existing" />);

    expect(passphraseButton()).toBeVisible();
  });

  it('offers it when a node form answer is compared with a protected answer of the person being edited', () => {
    fixtures.aliasValidation.sameAs = 'secret';
    renderForm(<PersonNameField label="Name" currentEntityId="existing" />);

    expect(passphraseButton()).toBeVisible();
  });

  it('does not offer it for a new person, who has no protected answers to compare with', () => {
    fixtures.nameValidation.differentFrom = 'secret';
    fixtures.aliasValidation.sameAs = 'secret';
    renderForm(<PersonNameField label="Name" />);

    expect(passphraseButton()).not.toBeInTheDocument();
  });
});
