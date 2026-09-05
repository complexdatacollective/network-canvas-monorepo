import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext, type ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';

import type { StageFormStoreApi } from '../../stageEditorContext.ts';
import RowField, { arrayScopedValues } from '../RowField.tsx';
import { requiredRow, uniqueRowAttribute } from '../rowValidators.ts';

const Control = InputField as ComponentType<Record<string, unknown>>;

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

  it('shows every failing rule once the row has been edited', async () => {
    const user = userEvent.setup();
    function Host() {
      return (
        <FormStoreProvider>
          <RowField
            name="options[0].label"
            label="Label"
            component={Control}
            value="Yes"
            allValues={arrayScopedValues('options', [
              { label: 'Yes' },
              { label: 'Yes' },
            ])}
            validators={[requiredRow(), uniqueRowAttribute()]}
          />
        </FormStoreProvider>
      );
    }
    render(<Host />);

    const control = await screen.findByRole('textbox', { name: 'Label' });
    expect(screen.queryByText('Labels must be unique')).toBeNull();
    await user.type(control, '!');
    await screen.findByText('Labels must be unique');
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
