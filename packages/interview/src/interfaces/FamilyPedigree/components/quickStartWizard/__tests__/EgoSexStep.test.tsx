import { render } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { personNameFieldSpy } = vi.hoisted(() => ({
  personNameFieldSpy: vi.fn(),
}));

vi.mock('../../PersonNameField', () => ({
  default: (props: unknown) => {
    personNameFieldSpy(props);
    return <div data-testid="person-name-field" />;
  },
}));

vi.mock('../../BiologicalSexField', () => ({
  default: () => <div data-testid="biological-sex-field" />,
}));

import EgoSexStep from '../EgoSexStep';

describe('EgoSexStep', () => {
  beforeEach(() => {
    personNameFieldSpy.mockClear();
  });

  test('preserves the existing ego identity when validating its name', () => {
    render(<EgoSexStep currentEntityId="ego-1" initialValue="Alex" />);

    expect(personNameFieldSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentEntityId: 'ego-1',
        initialValue: 'Alex',
        label: 'What is your name?',
      }),
    );
  });
});
