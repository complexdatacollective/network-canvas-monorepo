import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldNamespace from '@codaco/fresco-ui/form/FieldNamespace';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';

const fixtures = vi.hoisted(() => {
  const textVariable = (name: string) => ({
    name,
    type: 'text' as const,
    component: 'Text' as const,
  });
  const codebook = {
    ego: { variables: {} },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          'displayName': textVariable('Display name'),
          // Variable IDs are author-chosen, so they may match the wizard's
          // own control keys.
          'is-donor': textVariable('Donor answer'),
          'role': textVariable('Role answer'),
          'nickname': {
            ...textVariable('Nickname'),
            validation: { differentFrom: 'displayName' },
          },
        },
      },
    },
    edge: {},
  };

  return {
    codebook,
    nodeForm: [
      { variable: 'is-donor', prompt: 'Protocol donor question' },
      { variable: 'role', prompt: 'Protocol role question' },
      { variable: 'nickname', prompt: 'Protocol nickname question' },
    ],
    validationContext: {
      codebook,
      network: { ego: { attributes: {} }, nodes: [], edges: [] },
      stageSubject: null,
    },
  };
});

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    if (selector === 'nodeType') return 'person';
    if (selector === 'nodeLabelVariable') return 'displayName';
    if (selector === 'nodeForm') return fixtures.nodeForm;
    if (selector === 'stageVariables') {
      return fixtures.codebook.node.person.variables;
    }
    return fixtures.validationContext;
  },
}));

vi.mock('../../utils/nodeUtils', () => ({
  getNodeType: 'nodeType',
  getNodeLabelVariable: 'nodeLabelVariable',
  getNodeForm: 'nodeForm',
}));

vi.mock('../../../../selectors/protocol', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../selectors/protocol')>();
  return {
    ...actual,
    getCodebookVariablesForSubjectType: 'stageVariables',
  };
});

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

import PedigreeNodeFormFields from '../PedigreeNodeFormFields';

const store = configureStore({ reducer: () => ({}) });

function renderMember({ name, nickname }: { name: string; nickname: string }) {
  const onSubmit = vi.fn(() => ({ success: true as const }));
  render(
    <Provider store={store}>
      <Form onSubmit={onSubmit}>
        <FieldNamespace prefix="egg-parent">
          <Field
            name="is-donor"
            label="Wizard donor control"
            component={InputField}
            initialValue="wizard control"
          />
          <Field
            name="role"
            label="Wizard role control"
            component={InputField}
            initialValue="step-parent"
          />
          <Field
            name="name"
            label="Wizard name control"
            component={InputField}
            initialValue={name}
          />
          <PedigreeNodeFormFields
            initialValues={{
              'is-donor': 'protocol donor answer',
              'role': 'protocol role answer',
              nickname,
            }}
          />
        </FieldNamespace>
        <button type="submit">Save</button>
      </Form>
    </Provider>,
  );
  return onSubmit;
}

describe('PedigreeNodeFormFields', () => {
  it('keeps protocol fields apart from same-named wizard controls', async () => {
    const user = userEvent.setup();
    const onSubmit = renderMember({ name: 'Sam', nickname: 'Kit' });

    expect(screen.getByText('Protocol donor question')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      'egg-parent': {
        'is-donor': 'wizard control',
        'role': 'step-parent',
        'name': 'Sam',
        'attributes': {
          'is-donor': 'protocol donor answer',
          'role': 'protocol role answer',
          'nickname': 'Kit',
        },
      },
    });
  });

  it('compares against the live label control outside the protocol namespace', async () => {
    const user = userEvent.setup();
    const onSubmit = renderMember({ name: 'Sam', nickname: 'Sam' });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/must be different/i, undefined, {
        timeout: 2000,
      }),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
