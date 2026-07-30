import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import {
  SyntheticDataConstraintError,
  type ConstraintConflict,
} from '@codaco/protocol-utilities';

import { GenerationFailureDescription } from '../GenerationFailureDescription';

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders same-id conflicts from different subjects without duplicate React keys', () => {
  const conflicts: ConstraintConflict[] = [
    {
      entity: 'node',
      entityType: 'person',
      entityTypeName: 'Person',
      variableIds: ['name'],
      variableNames: ['Name'],
      rules: ['required'],
      reason: 'first conflict',
    },
    {
      entity: 'node',
      entityType: 'place',
      entityTypeName: 'Place',
      variableIds: ['name'],
      variableNames: ['Name'],
      rules: ['unique'],
      reason: 'second conflict',
    },
  ];
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  render(
    <GenerationFailureDescription
      error={new SyntheticDataConstraintError(conflicts)}
    />,
  );

  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(
    consoleError.mock.calls.some((call) =>
      call.some(
        (argument) =>
          typeof argument === 'string' &&
          argument.includes('Encountered two children with the same key'),
      ),
    ),
  ).toBe(false);
});
