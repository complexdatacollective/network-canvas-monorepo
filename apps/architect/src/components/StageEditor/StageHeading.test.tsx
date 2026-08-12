import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { mockUseStageInitialValue } = vi.hoisted(() => ({
  mockUseStageInitialValue: vi.fn(),
}));

vi.mock('./stageFormHooks', () => ({
  useStageInitialValue: (path: string) =>
    mockUseStageInitialValue(path) as unknown,
}));

vi.mock('../Form/ArchitectField', () => ({
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
  it('preserves hero styling while surfacing the field state the form injects', () => {
    const onChange = vi.fn();

    render(
      <HeadingInput
        name="label"
        value=""
        onChange={onChange}
        characterLimit={50}
        aria-required
        aria-invalid
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('maxlength', '50');

    fireEvent.change(input, { target: { value: 'A new name' } });
    expect(onChange).toHaveBeenCalledWith('A new name');
  });

  it('notifies the auto-namer when the control loses focus', () => {
    const onFieldBlur = vi.fn();

    render(<HeadingInput name="label" value="" onFieldBlur={onFieldBlur} />);

    fireEvent.blur(screen.getByRole('textbox'));
    expect(onFieldBlur).toHaveBeenCalledTimes(1);
  });
});

describe('StageHeading', () => {
  it('reads the stage type from the committed stage', () => {
    mockUseStageInitialValue.mockImplementation((path: string) =>
      path === 'type' ? 'NameGenerator' : undefined,
    );

    render(<StageHeading stageNumber={1} totalStages={3} isNewStage={false} />);

    expect(screen.getByText('Interface:NameGenerator')).toBeInTheDocument();
  });

  it('renders nothing when the stage type is absent', () => {
    mockUseStageInitialValue.mockReturnValue(undefined);

    const { container } = render(
      <StageHeading stageNumber={1} totalStages={3} isNewStage={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
