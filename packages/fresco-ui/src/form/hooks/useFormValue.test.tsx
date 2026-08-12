import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import InputField from '../fields/InputField';
import FormStoreProvider from '../store/formStoreProvider';
import { useFormValue } from './useFormValue';

describe('useFormValue', () => {
  it('reads an opaque dotted field name as one key', async () => {
    function ValueProbe() {
      const value = useFormValue(['favorite.color'], 'opaque')[
        'favorite.color'
      ];
      return <output>{typeof value === 'string' ? value : ''}</output>;
    }

    render(
      <FormStoreProvider>
        <Field
          name="favorite.color"
          nameMode="opaque"
          label="Favorite color"
          component={InputField}
          initialValue="blue"
        />
        <ValueProbe />
      </FormStoreProvider>,
    );

    expect(await screen.findByText('blue')).toBeVisible();
  });
});
