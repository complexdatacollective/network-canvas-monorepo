import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { addNode } from '../../../store/modules/session';
import { setPassphrase } from '../../../store/modules/ui';
import { useProtectedFormValues } from '../useProtectedFormValues';
import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
  NODE_TYPE,
} from './encryptionFixtures';

const fields = [{ variable: 'name' }, { variable: 'age' }];

async function renderValues() {
  const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
  const store = createEncryptionStore([person]);
  store.dispatch(setPassphrase('pw'));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const rendered = renderHook(
    ({ entity }: { entity: NcNode }) =>
      useProtectedFormValues(entity, fields, encryptedVariables),
    { wrapper, initialProps: { entity: person } },
  );
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return { ...rendered, person, store };
}

function readyValues(result: {
  current: ReturnType<typeof useProtectedFormValues>;
}) {
  const current = result.current;
  if (current.status !== 'ready') {
    throw new Error(`Expected ready values, got ${current.status}`);
  }
  return current.values;
}

describe('useProtectedFormValues', () => {
  it('hands a form the same values object while the answers are unchanged', async () => {
    const { result, rerender, person, store } = await renderValues();
    const opened = readyValues(result);
    expect(opened).toEqual({ name: 'Alice', age: 40 });

    rerender({ entity: person });
    expect(readyValues(result)).toBe(opened);

    await act(async () => {
      await store.dispatch(
        addNode({
          type: NODE_TYPE,
          attributeData: { age: 30 },
          useEncryption: true,
          currentStep: 0,
        }),
      );
    });
    rerender({ entity: person });
    expect(readyValues(result)).toBe(opened);
  });

  it('hands a form new values when an answer changes', async () => {
    const { result, rerender, person } = await renderValues();
    const opened = readyValues(result);

    rerender({
      entity: {
        ...person,
        [entityAttributesProperty]: {
          ...person[entityAttributesProperty],
          age: 41,
        },
      },
    });

    const changed = readyValues(result);
    expect(changed).not.toBe(opened);
    expect(changed).toEqual({ name: 'Alice', age: 41 });
  });
});
