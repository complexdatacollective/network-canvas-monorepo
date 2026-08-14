import { configureStore } from '@reduxjs/toolkit';
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import {
  asEntityAttributeReference,
  type ComposerFormField,
  type FormField,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';

/**
 * Issue #1385: a required boolean authored as a `Toggle` rendered a switch
 * that showed a definite "No" for a value the store did not hold, so
 * `required` blocked the participant on a question that looked answered.
 */
function makeWrapper() {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: NODE_TYPE,
              variables: {
                requiredToggle: {
                  name: 'requiredToggle',
                  type: 'boolean',
                  component: 'Toggle',
                  validation: { required: true },
                },
                optionalToggle: {
                  name: 'optionalToggle',
                  type: 'boolean',
                  component: 'Toggle',
                },
                // Componentless, so a NetworkComposer field decides the
                // control — the only way a boolean carries `options` while
                // being rendered by a `Toggle`.
                singletonOptions: {
                  name: 'singletonOptions',
                  type: 'boolean',
                  options: [{ label: 'Yes', value: true }],
                  validation: { required: true },
                },
              },
            },
          },
        },
        stages: [{ id: 'stage1', type: 'FamilyPedigree' }],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  };
}

function FormHarness({
  fields,
}: {
  fields: Array<FormField | ComposerFormField>;
}) {
  const { fieldComponents } = useProtocolForm({
    fields,
    subject: { entity: 'node', type: NODE_TYPE },
  });

  return <Form onSubmit={() => ({ success: true })}>{fieldComponents}</Form>;
}

describe('useProtocolForm required boolean rendering', () => {
  it('renders a required boolean as an unselected Yes/No choice, not a switch', () => {
    render(
      <FormHarness
        fields={[
          {
            variable: asEntityAttributeReference('requiredToggle'),
            prompt: 'Do you live alone?',
          },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByRole('switch')).toBeNull();
    const group = screen.getByRole('radiogroup');
    const options = screen.getAllByRole('radio');
    expect(group).toBeVisible();
    expect(options.map((option) => option.textContent)).toEqual(['Yes', 'No']);
    // Nothing is chosen, and nothing claims to be — which is what `required`
    // is about to enforce.
    for (const option of options) {
      expect(option).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('leaves an optional boolean as a switch', () => {
    render(
      <FormHarness
        fields={[
          {
            variable: asEntityAttributeReference('optionalToggle'),
            prompt: 'Do you live alone?',
          },
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.getByRole('switch')).toBeVisible();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('does not carry codebook options into the swapped control', () => {
    render(
      <FormHarness
        fields={[
          {
            variable: asEntityAttributeReference('singletonOptions'),
            component: 'Toggle',
            label: 'Are you employed?',
          } as ComposerFormField,
        ]}
      />,
      { wrapper: makeWrapper() },
    );

    // A toggle is unconditionally two-valued. Rendering the codebook's single
    // option instead would turn a required question into one the participant
    // can only answer one way.
    expect(
      screen.getAllByRole('radio').map((option) => option.textContent),
    ).toEqual(['Yes', 'No']);
  });

  it('reports the control that actually renders to analytics', () => {
    const { result } = renderHook(
      () =>
        useProtocolForm({
          fields: [
            {
              variable: asEntityAttributeReference('requiredToggle'),
              prompt: 'Do you live alone?',
            },
            {
              variable: asEntityAttributeReference('optionalToggle'),
              prompt: 'Do you have a car?',
            },
          ],
          subject: { entity: 'node', type: NODE_TYPE },
        }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.componentByVariable).toEqual({
      requiredToggle: 'Boolean',
      optionalToggle: 'Toggle',
    });
  });
});
