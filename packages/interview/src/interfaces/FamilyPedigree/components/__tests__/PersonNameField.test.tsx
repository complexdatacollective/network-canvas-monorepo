import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import Form from '@codaco/fresco-ui/form/Form';
import type { NcNode } from '@codaco/shared-consts';

const fixtures = vi.hoisted(() => {
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
            validation: { required: true, unique: true },
          },
        },
      },
    },
    edge: {},
  };

  return {
    codebook,
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
    return fixtures.validationContext;
  },
}));

vi.mock('../../utils/nodeUtils', () => ({
  getNodeType: 'nodeType',
  getNodeLabelVariable: 'nodeLabelVariable',
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
});
