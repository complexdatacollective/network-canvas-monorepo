import { describe, expect, it } from 'vitest';

import { isVariableId } from '@codaco/protocol-validation';

import { assignCodebookIds, sketchVariableId } from '../objectIds.ts';

describe('assignCodebookIds', () => {
  it('gives a layout a stable UUID apart from a variable of its key, and renames its source path', () => {
    const compile = () => {
      const protocol: Record<string, unknown> = {
        codebook: {
          node: { person: { name: 'Person', variables: { place: {} } } },
          layouts: { place: { name: 'place' } },
        },
        stages: [],
      };
      const sourceMap = assignCodebookIds(
        protocol,
        new Map([['codebook.layouts.place.name', 'design.layout']]),
      );
      return { protocol, sourceMap };
    };
    const first = compile();
    const { codebook } = first.protocol;
    if (
      typeof codebook !== 'object' ||
      codebook === null ||
      !('layouts' in codebook) ||
      typeof codebook.layouts !== 'object' ||
      codebook.layouts === null
    ) {
      throw new Error('No layouts');
    }
    const [layoutId] = Object.keys(codebook.layouts);

    expect(layoutId).toEqual(
      expect.toSatisfy(
        (id: string) => isVariableId(id) && id !== sketchVariableId('place'),
      ),
    );
    expect(compile().protocol).toEqual(first.protocol);
    expect([...first.sourceMap]).toEqual([
      [`codebook.layouts.${layoutId}.name`, 'design.layout'],
    ]);
  });
});
