import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
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

  // The control is a textarea so that a long name wraps instead of being cut
  // off at the edge of the column. Its height comes from a copy of the text
  // laid out behind it: nothing measures anything, so the copy going stale is
  // the one way the height can be wrong.
  it('lays the same text out behind the control, which is what gives it its height', () => {
    const { container, rerender } = render(
      <HeadingInput name="label" value="" placeholder="Enter stage name..." />,
    );

    const sizingCopy = container.querySelector('[aria-hidden="true"]');
    // The trailing space is load-bearing: it holds the height of a line that
    // ends in whitespace, which a block would otherwise collapse away.
    expect(sizingCopy?.textContent).toBe('Enter stage name... ');

    rerender(
      <HeadingInput
        name="label"
        value="How you know each person"
        placeholder="Enter stage name..."
      />,
    );

    expect(sizingCopy?.textContent).toBe('How you know each person ');
    // One control, not two: the copy is scenery, and a second textbox would
    // be offered to a screen reader as another field to fill in.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('collapses line breaks pasted into the name onto a single line', () => {
    const onChange = vi.fn();

    render(<HeadingInput name="label" value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Close ties\nand weak ties\r\nboth' },
    });

    expect(onChange).toHaveBeenCalledWith('Close ties and weak ties both');
  });

  it('submits the form on Enter rather than typing a line break into the name', () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <HeadingInput name="label" value="Close ties" />
        <button type="submit">Finished Editing</button>
      </form>,
    );

    const control = screen.getByRole('textbox');
    const enter = createEvent.keyDown(control, { key: 'Enter' });
    fireEvent(control, enter);

    // Without the preventDefault the keystroke reaches the textarea and adds a
    // line to a value that is meant to be one line.
    expect(enter.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['has no submit button', false],
    ['has only a disabled submit button', true],
  ])('leaves Enter inert when the form %s', (_case, withDisabledButton) => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <HeadingInput name="label" value="Close ties" />
        {withDisabledButton && (
          <button type="submit" disabled>
            Finished Editing
          </button>
        )}
      </form>,
    );

    const control = screen.getByRole('textbox');
    const enter = createEvent.keyDown(control, { key: 'Enter' });
    fireEvent(control, enter);

    // What the browser does with an <input>: no default button to press, so
    // Enter does nothing at all.
    expect(enter.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
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
