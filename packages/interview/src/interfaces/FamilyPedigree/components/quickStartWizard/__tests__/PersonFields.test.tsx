import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

vi.mock('~/hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('~/forms/useProtocolForm', () => ({
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

  it('renders a biological sex radio with all four values when askBiologicalSex is true (default)', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields namespace="child" />
      </Form>,
    );

    expect(screen.getByText('Biological sex')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Female' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Male' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Intersex' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Unknown' })).toBeTruthy();
  });

  it('does not render the biological sex field when askBiologicalSex is false', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields namespace="new-egg-source" askBiologicalSex={false} />
      </Form>,
    );

    expect(screen.queryByText('Biological sex')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Female' })).toBeNull();
  });
});
