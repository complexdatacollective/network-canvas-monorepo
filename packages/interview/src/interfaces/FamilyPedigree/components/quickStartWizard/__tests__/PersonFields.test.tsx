import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

vi.mock('../../../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

const protocolForm = vi.hoisted(() => ({ passphraseNeeded: false }));
vi.mock('../../../../../forms/useProtocolForm', () => ({
  default: () => ({
    fieldComponents: null,
    passphraseNeeded: protocolForm.passphraseNeeded,
  }),
}));

vi.mock('../../PersonNameField', () => ({
  default: ({
    initialValue,
    label,
    formNeedsPassphrase,
  }: {
    initialValue?: string;
    label: string;
    formNeedsPassphrase?: boolean;
  }) => (
    <>
      <input aria-label={label} defaultValue={initialValue} />
      {formNeedsPassphrase && (
        <button type="button">Enter your Passphrase</button>
      )}
    </>
  ),
}));

import PersonFields from '../PersonFields';

describe('PersonFields', () => {
  beforeEach(() => {
    protocolForm.passphraseNeeded = false;
  });

  it('renders the name field', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields />
      </Form>,
    );

    expect(screen.getByRole('textbox', { name: /name/i })).toBeTruthy();
  });

  it('renders the biological sex question with all values', () => {
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

  it('preselects the initial biological sex when editing a person', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields initial={{ biologicalSex: 'female' }} />
      </Form>,
    );

    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
  });

  it("preselects Don't know when editing a person with no stored biological sex", () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields initial={{ name: 'Legacy Person' }} />
      </Form>,
    );

    expect(screen.getByRole('radio', { name: 'Don’t know' })).toBeChecked();
  });

  it('has the name field offer the passphrase when the rest of the form needs it', () => {
    protocolForm.passphraseNeeded = true;
    render(
      <Form onSubmit={() => ({ success: true })}>
        <PersonFields />
      </Form>,
    );

    expect(
      screen.getByRole('button', { name: 'Enter your Passphrase' }),
    ).toBeInTheDocument();
  });
});
