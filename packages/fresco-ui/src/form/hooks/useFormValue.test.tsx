import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import InputField from '../fields/InputField';
import FormStoreProvider from '../store/formStoreProvider';
import useFormStore from './useFormStore';
import { useFormHasValue, useFormValue } from './useFormValue';

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

  it('reads a name held only as a container of leaves', async () => {
    function ContainerProbe() {
      const { parameters } = useFormValue(['parameters'] as const);
      return <output>{JSON.stringify(parameters ?? null)}</output>;
    }

    render(
      <FormStoreProvider>
        <Field
          name="parameters.type"
          label="Type"
          component={InputField}
          initialValue="relative"
        />
        <Field
          name="parameters.unit"
          label="Unit"
          component={InputField}
          initialValue="days"
        />
        <ContainerProbe />
      </FormStoreProvider>,
    );

    expect(
      await screen.findByText('{"type":"relative","unit":"days"}'),
    ).toBeVisible();
  });

  it('hands out the same container until a leaf beneath it changes', async () => {
    // The assembled container is a fresh object every time it is built, so an
    // unstable reference here would re-render every subscriber on every
    // keystroke anywhere in the form, and loop any effect that depends on it.
    const seen: unknown[] = [];

    function ContainerProbe() {
      const { parameters } = useFormValue(['parameters'] as const);
      useEffect(() => {
        seen.push(parameters);
      }, [parameters]);
      return null;
    }

    function StoreWriter() {
      const setFieldValue = useFormStore((store) => store.setFieldValue);
      return (
        <>
          <button
            type="button"
            onClick={() => setFieldValue('label', 'Age at diagnosis')}
          >
            change label
          </button>
          <button
            type="button"
            onClick={() => setFieldValue('parameters.type', 'absolute')}
          >
            change type
          </button>
        </>
      );
    }

    render(
      <FormStoreProvider>
        <Field
          name="label"
          label="Label"
          component={InputField}
          initialValue="Age"
        />
        <Field
          name="parameters.type"
          label="Type"
          component={InputField}
          initialValue="relative"
        />
        <ContainerProbe />
        <StoreWriter />
      </FormStoreProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toHaveValue('relative');
    });
    const settled = seen.length;

    fireEvent.click(screen.getByRole('button', { name: 'change label' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Label')).toHaveValue('Age at diagnosis');
    });
    expect(seen).toHaveLength(settled);

    fireEvent.click(screen.getByRole('button', { name: 'change type' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toHaveValue('absolute');
    });
    expect(seen).toHaveLength(settled + 1);
    expect(seen.at(-1)).toEqual({ type: 'absolute' });
  });
});

describe('useFormHasValue', () => {
  it('separates a field the form holds from one it has never seen', async () => {
    function PresenceProbe() {
      const present = useFormHasValue([
        'label',
        'parameters',
        'missing',
      ] as const);
      return <output>{JSON.stringify(present)}</output>;
    }

    render(
      <FormStoreProvider>
        <Field name="label" label="Label" component={InputField} />
        <Field
          name="parameters.type"
          label="Type"
          component={InputField}
          initialValue="relative"
        />
        <PresenceProbe />
      </FormStoreProvider>,
    );

    // `label` registered without an initial value: its value read is the same
    // `undefined` as the name the form has never held, and only this tells
    // them apart.
    expect(
      await screen.findByText(
        '{"label":true,"parameters":true,"missing":false}',
      ),
    ).toBeVisible();
  });

  it('still reports a container whose leaves have all unmounted', async () => {
    function PresenceProbe() {
      const { parameters } = useFormHasValue(['parameters'] as const);
      return <output>{String(parameters)}</output>;
    }

    function CollapsibleSection() {
      const [open, setOpen] = useState(true);
      return (
        <>
          {open && (
            <Field
              name="parameters.type"
              label="Type"
              component={InputField}
              initialValue="relative"
            />
          )}
          <button type="button" onClick={() => setOpen(false)}>
            collapse
          </button>
        </>
      );
    }

    render(
      <FormStoreProvider>
        <CollapsibleSection />
        <PresenceProbe />
      </FormStoreProvider>,
    );

    expect(await screen.findByText('true')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));

    // A collapsed section's parked value is still a value this form holds.
    await waitFor(() => {
      expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
    });
    expect(screen.getByText('true')).toBeVisible();
  });
});
