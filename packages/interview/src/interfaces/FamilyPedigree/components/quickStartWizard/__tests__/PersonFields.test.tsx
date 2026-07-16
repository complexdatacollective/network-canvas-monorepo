import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

vi.mock('../../../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('../../../../../forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
}));

import PersonFields from '../PersonFields';

describe('PersonFields', () => {
  it('renders the name field', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields />
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: /name/i })).toBeTruthy();
  });

  it('renders the biological sex question with all values when askBiologicalSex is true (default)', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields namespace="child" />
      </Form>,
    );

    expect(
      screen.getByText('What sex was this person recorded as at birth?'),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Female' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Male' })).toBeTruthy();
    expect(
      screen.getByRole('radio', {
        name: 'Intersex or a variation in sex characteristics',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Don’t know' })).toBeTruthy();
    expect(
      screen.getByRole('radio', { name: 'Prefer not to say' }),
    ).toBeTruthy();
  });

  it('does not render the biological sex field when askBiologicalSex is false', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields namespace="new-egg-source" askBiologicalSex={false} />
      </Form>,
    );

    expect(
      screen.queryByText('What sex was this person recorded as at birth?'),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Female' })).toBeNull();
  });
});
