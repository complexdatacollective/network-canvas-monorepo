import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CodebookVariablesSynthetic } from '../CodebookVariablesSynthetic';

/**
 * The type editor's per-attribute list.
 *
 * Asserted on the RECORD it writes back, because that record is what the type
 * editor saves: the whole definition is replaced on commit, so an attribute
 * this control does not touch has to come out of it unchanged.
 */

const VARIABLES: Record<string, unknown> = {
  v_age: { name: 'age', type: 'number', component: 'Number' },
  v_name: { name: 'name', type: 'text', component: 'Text' },
  v_layout: { name: 'position', type: 'layout' },
  not_a_variable: { label: 'stray' },
};

const QUICK_ADD_PROTOCOL = {
  stages: [
    {
      id: 'qa',
      type: 'NameGeneratorQuickAdd',
      label: 'Quick Add Name Generator',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'v_name',
    },
  ],
};

type HarnessProps = {
  variables?: Record<string, unknown>;
  protocol?: unknown;
  onValue?: (next: Record<string, unknown>) => void;
};

const Harness = ({
  variables = VARIABLES,
  protocol,
  onValue,
}: HarnessProps) => {
  const [value, setValue] = useState(variables);
  return (
    <CodebookVariablesSynthetic
      name="variables"
      value={value}
      onChange={(next) => {
        const record = next ?? {};
        setValue(record);
        onValue?.(record);
      }}
      entity="node"
      type="person"
      protocol={protocol}
    />
  );
};

const expand = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

describe('one disclosure per attribute', () => {
  it('names each section after its attribute, in alphabetical order', () => {
    render(<Harness />);

    const names = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '');
    expect(names[0]).toMatch(/^age/);
    expect(names[1]).toMatch(/^name/);
  });

  it('skips an attribute with nothing to generate', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: /^position/ }),
    ).not.toBeInTheDocument();
  });

  it('skips a record that is not an attribute at all', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: /^stray/ }),
    ).not.toBeInTheDocument();
  });

  it('says so when the type has no attributes yet', () => {
    render(<Harness variables={{}} />);
    expect(screen.getByText(/no attributes yet/)).toBeInTheDocument();
  });
});

describe('what the list writes back', () => {
  it('changes only the attribute that was edited', () => {
    const written: Record<string, unknown>[] = [];
    render(<Harness onValue={(next) => written.push(next)} />);

    expand('name');
    fireEvent.change(
      screen.getByRole('combobox', {
        name: 'What the generated text looks like',
      }),
      { target: { value: 'occupation' } },
    );

    expect(written.at(-1)).toEqual({
      ...VARIABLES,
      v_name: {
        name: 'name',
        type: 'text',
        component: 'Text',
        synthetic: { generator: 'occupation' },
      },
    });
  });

  it('removes the key again on reset', () => {
    const written: Record<string, unknown>[] = [];
    render(
      <Harness
        variables={{
          v_name: {
            name: 'name',
            type: 'text',
            component: 'Text',
            synthetic: { generator: 'occupation' },
          },
        }}
        onValue={(next) => written.push(next)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/ }));
    expect(written.at(-1)).toEqual({
      v_name: { name: 'name', type: 'text', component: 'Text' },
    });
  });
});

describe('rules the protocol implies reach the controls', () => {
  it('disables missingness on an attribute a quick-add stage always answers', () => {
    render(<Harness protocol={QUICK_ADD_PROTOCOL} />);
    expand('name');

    expect(
      screen.getByRole('spinbutton', { name: 'Chance of no answer' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Always answered — ‘Quick Add Name Generator’ cannot leave this attribute blank, so it is never missing.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves another attribute of the same type alone', () => {
    render(<Harness protocol={QUICK_ADD_PROTOCOL} />);
    expand('age');

    expect(
      screen.getByRole('spinbutton', { name: 'Chance of no answer' }),
    ).not.toBeDisabled();
  });
});
