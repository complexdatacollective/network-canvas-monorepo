import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUseFormContext } = vi.hoisted(() => ({
  mockUseFormContext: vi.fn(),
}));

vi.mock('../Editor', () => ({
  useFormContext: mockUseFormContext,
}));

vi.mock('../Form/ValidatedField', () => ({
  default: () => null,
}));

vi.mock('./autoStageName/useAutoStageName', () => ({
  useAutoStageName: () => ({ onLabelBlur: vi.fn() }),
}));

vi.mock('~/components/StageTypeImage', () => ({
  default: () => null,
}));

vi.mock('./Interfaces', () => ({
  getInterface: (type: string) => ({
    name: `Interface:${type}`,
    documentation: undefined,
  }),
}));

import StageHeading, { HeadingInput } from './StageHeading';

describe('HeadingInput', () => {
  it('preserves hero styling while using required and shared error semantics', () => {
    render(
      <HeadingInput
        required
        input={{
          name: 'label',
          value: '',
          onChange: vi.fn(),
          onBlur: vi.fn(),
          onFocus: vi.fn(),
        }}
        meta={{ touched: true, invalid: true, error: 'Required' }}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Stage name' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required');
  });
});

describe('StageHeading', () => {
  it('reads the stage type from context initialValues', () => {
    mockUseFormContext.mockReturnValue({
      initialValues: { type: 'NameGenerator' },
    });

    render(<StageHeading stageNumber={1} totalStages={3} isNewStage={false} />);

    expect(screen.getByText('Interface:NameGenerator')).toBeInTheDocument();
  });

  it('renders nothing when the stage type is absent', () => {
    mockUseFormContext.mockReturnValue({ initialValues: {} });

    const { container } = render(
      <StageHeading stageNumber={1} totalStages={3} isNewStage={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
