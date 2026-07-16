import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type FormField,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

const NODE_TYPE = 'person';
const NAME_VAR = 'name';

// A FamilyPedigree stage has no top-level subject, so getStageSubject — and
// therefore the base validation context's stageSubject — is null.
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
                [NAME_VAR]: {
                  name: NAME_VAR,
                  type: 'text',
                  component: 'Text',
                  validation: { unique: true },
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

const fields: FormField[] = [
  { variable: asEntityAttributeReference(NAME_VAR), prompt: 'Name' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstFieldStageSubject(node: ReactNode): unknown {
  const element = Array.isArray(node) ? node[0] : node;
  if (!isValidElement(element)) return undefined;
  if (!isRecord(element.props)) return undefined;
  const validationContext = element.props.validationContext;
  if (!isRecord(validationContext)) return undefined;
  return validationContext.stageSubject;
}

describe('useProtocolForm stageSubject', () => {
  it('uses the provided subject as the validation stageSubject on a subjectless stage', () => {
    const { result } = renderHook(
      () =>
        useProtocolForm({
          fields,
          subject: { entity: 'node', type: NODE_TYPE },
        }),
      { wrapper: makeWrapper() },
    );

    const stageSubject = firstFieldStageSubject(result.current.fieldComponents);

    // Without the fix the stageSubject would be null (from the subjectless
    // stage), which the unique/sameAs/differentFrom validators dereference.
    expect(stageSubject).toEqual({
      entity: 'node',
      type: NODE_TYPE,
    });
  });
});
