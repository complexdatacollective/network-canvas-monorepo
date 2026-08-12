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

  it('returns an opaque __proto__ field as an own property', async () => {
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      '__proto__',
    );

    function ValueProbe() {
      const values = useFormValue(['__proto__'], 'opaque');
      return (
        <>
          <output>{String(Object.hasOwn(values, '__proto__'))}</output>
          <output>{String(Reflect.get(values, '__proto__'))}</output>
          <output>
            {String(Object.getPrototypeOf(values) === Object.prototype)}
          </output>
        </>
      );
    }

    render(
      <FormStoreProvider>
        <Field
          name="__proto__"
          nameMode="opaque"
          label="Prototype value"
          component={InputField}
          initialValue="preserved"
        />
        <ValueProbe />
      </FormStoreProvider>,
    );

    expect((await screen.findAllByText('true')).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(await screen.findByText('preserved')).toBeVisible();
    expect(
      Object.getOwnPropertyDescriptor(Object.prototype, '__proto__'),
    ).toEqual(prototypeDescriptor);
  });
});
