import { render } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodebookVariablesSynthetic } from '../CodebookVariablesSynthetic';

/**
 * How often the list asks the schema what the protocol's interfaces imply.
 *
 * `collectInterfaceImpliedRules` walks every stage and every reference in the
 * document. Asked per ROW, a type with thirty attributes walked the protocol
 * thirty times per render — and every synthetic edit replaces the variables
 * record, so editing got slower the more attributes the type had and the
 * larger the protocol grew. This is the only thing that can notice: the list
 * renders identically either way.
 */

const walks = vi.hoisted(() => vi.fn());

vi.mock('@codaco/protocol-validation', async (original) => {
  const actual = await original<typeof import('@codaco/protocol-validation')>();
  return {
    ...actual,
    collectInterfaceImpliedRules: (
      ...args: Parameters<typeof actual.collectInterfaceImpliedRules>
    ) => {
      walks();
      return actual.collectInterfaceImpliedRules(...args);
    },
  };
});

const PROTOCOL = {
  stages: [
    {
      id: 'qa',
      type: 'NameGeneratorQuickAdd',
      label: 'Quick Add Name Generator',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'v_0',
    },
  ],
};

/** Enough attributes that one walk per row would be unmistakable. */
const VARIABLES: Record<string, unknown> = Object.fromEntries(
  Array.from({ length: 8 }, (_unused, index) => [
    `v_${index}`,
    { name: `attribute_${index}`, type: 'text', component: 'Text' },
  ]),
);

const Harness = () => {
  const [value, setValue] = useState(VARIABLES);
  return (
    <CodebookVariablesSynthetic
      name="variables"
      value={value}
      onChange={(next) => setValue(next ?? {})}
      entity="node"
      type="person"
      protocol={PROTOCOL}
    />
  );
};

beforeEach(() => {
  walks.mockReset();
});

describe('the implied-rule walk behind the list', () => {
  it('walks the protocol once for the whole list, not once per attribute', () => {
    render(<Harness />);

    expect(walks).toHaveBeenCalledTimes(1);
  });
});
