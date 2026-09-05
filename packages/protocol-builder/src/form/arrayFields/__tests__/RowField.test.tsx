import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext, useEffect, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';

import type { StageFormStoreApi } from '../../stageEditorContext.ts';
import RowField, { arrayScopedValues } from '../RowField.tsx';
import {
  allowedVariableNameRow,
  requiredRow,
  uniqueRowAttribute,
} from '../rowValidators.ts';

const Control = InputField as ComponentType<Record<string, unknown>>;

/**
 * A control that announces its own value as it mounts, which the rich-text
 * editor an option label is typed into really does (see `Option.tsx`).
 */
function EchoOnMount({
  id,
  name,
  value,
  onChange,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  'id'?: string;
  'name'?: string;
  'value'?: unknown;
  'onChange'?: (value: unknown) => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  useEffect(() => {
    onChange?.(value);
    // Mount only, exactly as the editors that do this emit it: once, as they
    // initialise. Re-running on every render would be a different scenario.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, []);

  return (
    <input
      id={id}
      name={name}
      readOnly
      value={typeof value === 'string' ? value : ''}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    />
  );
}

const EchoControl = EchoOnMount as ComponentType<Record<string, unknown>>;

function StoreProbe({
  onReady,
}: {
  onReady: (api: StageFormStoreApi) => void;
}) {
  const storeApi = useContext(FormStoreContext);
  if (storeApi) onReady(storeApi);
  return null;
}

describe('RowField', () => {
  it('says nothing about a row the researcher has not touched', async () => {
    render(
      <FormStoreProvider>
        <RowField
          name="options[0].label"
          label="Label"
          component={Control}
          value=""
          validators={[requiredRow()]}
        />
      </FormStoreProvider>,
    );

    await screen.findByRole('textbox', { name: 'Label' });
    expect(screen.queryByText('Required')).toBeNull();
  });

  it('says nothing when a control merely announces its value at mount', async () => {
    const received: unknown[] = [];
    render(
      <FormStoreProvider>
        <RowField
          name="options[0].label"
          label="Label"
          component={EchoControl}
          value=""
          onChange={(next: unknown) => received.push(next)}
          validators={[requiredRow()]}
        />
      </FormStoreProvider>,
    );

    await screen.findByRole('textbox', { name: 'Label' });
    // The echo really did arrive, so the silence below is the rule working and
    // not the control failing to speak.
    expect(received).toEqual(['']);
    expect(screen.queryByText('Required')).toBeNull();
  });

  it('shows every failing rule once the row has been edited', async () => {
    const user = userEvent.setup();
    function Host() {
      return (
        <FormStoreProvider>
          <RowField
            name="options[0].value"
            label="Value"
            component={Control}
            // Two rules fail at once: another row already exports under this
            // value, and a space cannot appear in an export column name.
            value="yes please"
            allValues={arrayScopedValues('options', [
              { value: 'yes please' },
              { value: 'yes please' },
            ])}
            validators={[
              requiredRow(),
              uniqueRowAttribute(),
              allowedVariableNameRow('option value'),
            ]}
          />
        </FormStoreProvider>
      );
    }
    render(<Host />);

    const control = await screen.findByRole('textbox', { name: 'Value' });
    expect(screen.queryByText('Values must be unique')).toBeNull();
    expect(screen.queryByText(/Not a valid option value/)).toBeNull();
    await user.type(control, '!');
    // Both, not just the first: a row is edited in place, so a cell that
    // reported its problems one at a time would send the researcher back to
    // the same box for each of them.
    await screen.findByText('Values must be unique');
    await screen.findByText(/Not a valid option value/);
  });

  it('reveals its errors without an edit when the array asks it to', async () => {
    render(
      <FormStoreProvider>
        <RowField
          name="options[0].label"
          label="Label"
          component={Control}
          value=""
          validators={[requiredRow()]}
          forceShowErrors
        />
      </FormStoreProvider>,
    );

    await screen.findByText('Required');
  });

  it('registers no field, so its errors can only ever be displayed', async () => {
    let storeApi: StageFormStoreApi | undefined;
    render(
      <FormStoreProvider>
        <StoreProbe
          onReady={(api) => {
            storeApi = api;
          }}
        />
        <RowField
          name="options[0].label"
          label="Label"
          component={Control}
          value=""
          validators={[requiredRow()]}
          forceShowErrors
        />
      </FormStoreProvider>,
    );

    await screen.findByText('Required');
    // The governing rule for every array editor: the whole list is one field,
    // and no row is registered under a path of its own. A row that registered
    // `options[0].label` would leave a deleted option's value behind in the
    // store, to be written back into the protocol on the next save.
    await waitFor(() => expect(storeApi).toBeDefined());
    expect([...storeApi!.getState().fields.keys()]).toEqual([]);
    expect(storeApi!.getState().isValid).toBe(true);
  });
});
