import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Codebook, Variable } from '@codaco/protocol-validation';
import type * as CodebookSelectors from '~/selectors/codebook';

type Subject = { entity: 'node' | 'edge' | 'ego'; type?: string };

// A codebook holding one duplicate-name pair per scope: renaming `subject_var`
// to `taken_var` must be rejected inline for ego and node variables alike.
const codebook = {
  ego: {
    variables: {
      'ego-subject': { name: 'subject_var', type: 'text' },
      'ego-taken': { name: 'taken_var', type: 'text' },
    },
  },
  node: {
    person: {
      variables: {
        'node-subject': { name: 'subject_var', type: 'text' },
        'node-taken': { name: 'taken_var', type: 'text' },
      },
    },
  },
} as unknown as Codebook;

const variableFixtures = {
  'ego-subject': {
    uuid: 'ego-subject',
    name: 'subject_var',
    entity: 'ego' as const,
    entityType: null,
    type: 'text',
  },
  'node-subject': {
    uuid: 'node-subject',
    name: 'subject_var',
    entity: 'node' as const,
    entityType: 'person',
    type: 'text',
  },
};

const subjectsSeen: Subject[] = [];

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock('~/ducks/modules/protocol/codebook', () => ({
  updateVariableByUUID: vi.fn(),
}));

vi.mock('~/selectors/codebook', async (importOriginal) => {
  const actual = await importOriginal<typeof CodebookSelectors>();
  return {
    ...actual,
    // Resolve against the real selector, but record the subject the component
    // builds so a regression to `type: 'node'` for ego is caught directly.
    getVariablesForSubject: (_state: unknown, subject: Subject) => {
      subjectsSeen.push(subject);
      return actual.getVariablesForSubjectSelector(
        { activeProtocol: { present: { codebook } } } as never,
        subject,
      );
    },
    makeGetVariableWithEntity: (uuid: string) => () =>
      variableFixtures[uuid as keyof typeof variableFixtures],
    // The editor reads the variable's own definition (type, options,
    // validation, synthetic) separately from its entity placement.
    makeGetVariable: (uuid: string) => () => {
      const fixture = variableFixtures[uuid as keyof typeof variableFixtures];
      return fixture ? { name: fixture.name, type: fixture.type } : undefined;
    },
  };
});

const { ConnectedVariablePill, VariablePill } = await import('../VariablePill');

const startEditing = async (uuid: string) => {
  render(<ConnectedVariablePill animated editable uuid={uuid} />);
  const pill = screen.getByRole('button', {
    name: 'Edit variable: subject_var',
  });
  fireEvent.click(pill);

  return screen.findByRole('textbox', { name: 'Variable name' });
};

describe('ConnectedVariablePill', () => {
  beforeEach(() => {
    subjectsSeen.length = 0;
  });

  it('uses an accessible button to open the variable editor directly', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });

    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    expect(pill).toHaveAttribute('data-variable-pill-preview', 'collapsed');
    expect(pill).not.toHaveStyle({ position: 'fixed' });
    expect(pill).toHaveClass(
      'cursor-pointer',
      'effect-shadow-sm',
      'hover:effect-shadow',
      'focus-visible:effect-shadow',
      'transition-shadow',
      'ease-out',
    );
    expect(pill).not.toHaveClass('spring-short');

    fireEvent.click(pill);
    expect(
      await screen.findByRole('dialog', { name: 'Edit variable' }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.variable-pill')).toHaveLength(1);
    expect(
      document.querySelector('[data-variable-pill-editor-name]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-variable-pill-editor-name]')?.parentElement,
    ).toHaveClass('flex', 'justify-center');
    expect(
      document.querySelector('[data-variable-pill-editor-body]'),
    ).toBeInTheDocument();
    expect(document.querySelector('.bg-overlay')).toBeInTheDocument();
  });

  it('moves the popup downward only after the pill settles', async () => {
    await startEditing('node-subject');
    const surface = document.querySelector(
      '[data-variable-pill-editor-surface]',
    );
    const arrow = document.querySelector('[data-variable-pill-editor-arrow]');

    expect(surface).toHaveStyle({
      opacity: '0',
      transform: 'translateY(-10px)',
    });
    expect(arrow?.parentElement).toBe(surface);

    await waitFor(
      () => {
        expect(surface).toHaveStyle({
          opacity: '1',
          transform: 'none',
        });
      },
      { timeout: 2500 },
    );
  });

  it('shows the concise edit instruction on keyboard focus', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });

    fireEvent.focus(pill);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Click to edit',
    );
  });

  it('expands out of layout on hover while preserving its placeholder', async () => {
    const { container } = render(
      <ConnectedVariablePill animated editable uuid="node-subject" />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });
    const placeholder = container.querySelector(
      '[data-variable-pill-placeholder]',
    );
    const label = pill.querySelector<HTMLElement>(
      '[data-variable-pill-label]',
    )!;
    expect(placeholder).not.toBeNull();
    Object.defineProperties(label, {
      clientWidth: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 400 },
    });
    vi.spyOn(
      placeholder as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 148,
      height: 48,
      left: 100,
      right: 340,
      top: 100,
      width: 240,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(pill);

    await waitFor(() => {
      expect(pill).toHaveAttribute('data-variable-pill-preview', 'expanded');
    });
    expect(pill).toHaveStyle({ position: 'fixed', top: '100px' });
    expect(placeholder).toHaveStyle({ height: '48px', width: '240px' });

    fireEvent.pointerLeave(pill);
    await waitFor(() => {
      expect(pill).toHaveAttribute('data-variable-pill-preview', 'collapsed');
    });
    fireEvent.pointerEnter(pill);
    await waitFor(() => {
      expect(pill).toHaveAttribute('data-variable-pill-preview', 'expanded');
    });

    expect(pill).toHaveStyle({ left: '100px', top: '100px' });
    expect(placeholder).toHaveStyle({ height: '48px', width: '240px' });
  });

  it('stays in place when the label already fits and validations are absent', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });
    const label = pill.querySelector<HTMLElement>(
      '[data-variable-pill-label]',
    )!;
    Object.defineProperties(label, {
      clientWidth: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 160 },
    });

    fireEvent.pointerEnter(pill);

    await waitFor(() =>
      expect(pill).toHaveAttribute('data-variable-pill-preview', 'collapsed'),
    );
    expect(pill).not.toHaveStyle({ position: 'fixed' });
  });

  it('reads metadata from the connected codebook variable', () => {
    render(<ConnectedVariablePill uuid="node-subject" />);

    expect(screen.queryByTitle('No validation rules')).not.toBeInTheDocument();
    expect(
      screen.getByTitle('Neutral words generator (default)'),
    ).toBeInTheDocument();
  });

  it('reveals an editable distribution only while previewing or editing', async () => {
    const { container } = render(
      <ConnectedVariablePill editable uuid="node-subject" />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });
    const placeholder = container.querySelector(
      '[data-variable-pill-placeholder]',
    );
    const label = pill.querySelector<HTMLElement>(
      '[data-variable-pill-label]',
    )!;
    Object.defineProperties(label, {
      clientWidth: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 160 },
    });
    vi.spyOn(
      placeholder as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 148,
      height: 48,
      left: 100,
      right: 340,
      top: 100,
      width: 240,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    expect(
      screen.queryByTitle('Neutral words generator (default)'),
    ).not.toBeInTheDocument();

    fireEvent.pointerEnter(pill);

    expect(
      await screen.findByTitle('Neutral words generator (default)'),
    ).toBeInTheDocument();
  });

  it('opens an autofocus editor with actions outside the pill', async () => {
    const input = await startEditing('node-subject');

    expect(
      screen.getByRole('dialog', { name: 'Edit variable' }),
    ).toBeInTheDocument();
    expect(input).toHaveFocus();
    // Both actions sit below the editor rather than inside the pill header,
    // which holds only the name field.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });

    fireEvent.change(input, { target: { value: 'renamed_var' } });
    expect(saveButton).toBeEnabled();
  });

  // Submitting and dismissing are both asynchronous — validation resolves
  // before the form calls back, and the close guard is a promise — so the
  // popover has to be seen to close before focus can be judged.
  const expectClosedWithFocusReturned = async () => {
    await waitFor(
      () => {
        expect(
          screen.queryByRole('dialog', { name: 'Edit variable' }),
        ).not.toBeInTheDocument();
      },
      { timeout: 2500 },
    );
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Edit variable: subject_var' }),
        ).toHaveFocus();
      },
      { timeout: 2500 },
    );
  };

  it('returns focus to the pill after saving an edit', async () => {
    const input = await startEditing('node-subject');
    fireEvent.change(input, { target: { value: 'renamed_var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await expectClosedWithFocusReturned();
  });

  it('returns focus to the pill after cancelling an edit', async () => {
    await startEditing('node-subject');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expectClosedWithFocusReturned();
  });

  it('keeps the modal mounted while cancellation returns the pill', async () => {
    await startEditing('node-subject');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        document.querySelector('[data-variable-pill-editor-name]'),
      ).toHaveAttribute('data-variable-pill-returning', 'true');
    });
    expect(
      document.querySelector('[data-variable-pill-editor-name]'),
    ).toHaveAttribute('data-variable-pill-editing', 'false');
    expect(
      screen.queryByRole('textbox', { name: 'Variable name' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Edit variable' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.bg-overlay')).toHaveClass('!opacity-0');

    await expectClosedWithFocusReturned();
  });

  it('aligns the popup arrow and allows viewport-height expansion', async () => {
    await startEditing('node-subject');

    expect(
      document.querySelector('[data-variable-pill-editor-body]'),
    ).toHaveClass('mt-4', 'max-h-[calc(100dvh-7rem)]');
    expect(
      document.querySelector('[data-variable-pill-editor-arrow]'),
    ).toHaveClass('-top-4');
    expect(
      document.querySelector('[data-variable-pill-editor-scroll]'),
    ).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });

  it('rejects renaming an ego variable to an existing ego variable name', async () => {
    const input = await startEditing('ego-subject');
    fireEvent.change(input, { target: { value: 'taken_var' } });

    expect(await screen.findByText(/is already in use/)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    // Ego has no entity type; a `type` here resolves to the non-existent
    // `codebook.ego.<type>.variables` and silently finds nothing.
    expect(subjectsSeen.at(-1)).toEqual({ entity: 'ego', type: undefined });
  });

  it('rejects renaming a node variable to an existing name in the same type', async () => {
    const input = await startEditing('node-subject');
    fireEvent.change(input, { target: { value: 'taken_var' } });

    expect(await screen.findByText(/is already in use/)).toBeInTheDocument();
    expect(subjectsSeen.at(-1)).toEqual({ entity: 'node', type: 'person' });
  });

  it('allows an ego variable to keep its own name', async () => {
    const input = await startEditing('ego-subject');
    fireEvent.change(input, { target: { value: 'subject_var' } });

    expect(screen.queryByText(/is already in use/)).not.toBeInTheDocument();
  });
});

describe('VariablePill', () => {
  it('uses a data element and a static border for a non-interactive reference', () => {
    const { container } = render(
      <VariablePill label="subject_var" type="text" />,
    );
    const pill = container.querySelector('data');

    expect(pill).toHaveAttribute('value', 'subject_var');
    expect(pill).toHaveClass('bg-(--variable-pill-accent)');
    expect(pill).toHaveClass('cursor-default');
    expect(pill).toHaveClass('effect-shadow-sm');
    expect(pill).not.toHaveClass('hover:effect-shadow');
    expect(pill).not.toHaveClass('variable-pill-effect-border');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('allows animation to be enabled independently of editability', () => {
    const { container } = render(
      <VariablePill animated label="subject_var" type="text" />,
    );
    const pill = container.querySelector('data');

    expect(pill).toHaveClass('variable-pill-effect-border');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows validation rules and the resolved synthetic distribution', () => {
    const variable = {
      name: 'subject_var',
      type: 'number',
      validation: {
        required: true,
        minValue: 0,
        maxValue: 100,
        unique: true,
      },
      synthetic: {
        distribution: 'lognormal',
        mean: 50,
        sd: 10,
      },
    } satisfies Variable;

    render(
      <VariablePill
        label={variable.name}
        type={variable.type}
        variable={variable}
      />,
    );

    expect(screen.getByTitle('Required')).toBeInTheDocument();
    expect(
      document.querySelector('[data-variable-pill-validation="required"]'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Minimum value: 0')).toBeInTheDocument();
    expect(screen.getByTitle('Maximum value: 100')).toBeInTheDocument();
    expect(screen.getByTitle('Unique value')).toBeInTheDocument();
    const validationList = document.querySelector(
      '[data-variable-pill-validation-list]',
    );
    const validationSummary = document.querySelector(
      '[data-variable-pill-validation-summary]',
    );
    expect(validationList).toHaveClass('hidden', '@min-[24rem]:flex');
    expect(validationList?.children).toHaveLength(4);
    expect(validationSummary).toHaveClass('flex', '@min-[24rem]:hidden');
    expect(validationSummary).toHaveAttribute('title', 'Has validation rules');
    expect(screen.getByTitle('Log-normal distribution')).toBeInTheDocument();
    expect(
      document.querySelector('[data-variable-pill-distribution="lognormal"]'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Validation: Required/)).toHaveClass('sr-only');
  });

  it('expands to reveal collapsed validations even when the label fits', async () => {
    const variable = {
      name: 'subject_var',
      type: 'number',
      validation: {
        required: true,
        minValue: 0,
        maxValue: 100,
        unique: true,
      },
    } satisfies Variable;
    const { container } = render(
      <VariablePill
        editable
        uuid="node-subject"
        label={variable.name}
        type={variable.type}
        variable={variable}
      />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });
    const placeholder = container.querySelector(
      '[data-variable-pill-placeholder]',
    );
    const label = pill.querySelector<HTMLElement>(
      '[data-variable-pill-label]',
    )!;
    Object.defineProperties(label, {
      clientWidth: { configurable: true, value: 160 },
      scrollWidth: { configurable: true, value: 160 },
    });
    vi.spyOn(
      placeholder as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue({
      bottom: 148,
      height: 48,
      left: 100,
      right: 420,
      top: 100,
      width: 320,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerEnter(pill);

    await waitFor(() => {
      expect(pill).toHaveAttribute('data-variable-pill-preview', 'expanded');
    });
    expect(pill).toHaveStyle({ position: 'fixed', top: '100px' });
  });

  it('makes the pill a container and preserves minimum label width', () => {
    const variable = {
      name: 'subject_var',
      type: 'number',
      validation: { required: true },
    } satisfies Variable;
    render(
      <VariablePill
        label={variable.name}
        type={variable.type}
        variable={variable}
      />,
    );
    const label = screen.getByText('subject_var');
    const contents = label.closest('.\\@container');

    expect(contents).toBeInTheDocument();
    expect(label.parentElement).toHaveClass('min-w-24');
  });

  it('keeps the no-validation state accessible without adding an icon', () => {
    const variable = {
      name: 'subject_var',
      type: 'text',
    } satisfies Variable;

    render(
      <VariablePill
        label={variable.name}
        type={variable.type}
        variable={variable}
      />,
    );

    expect(screen.queryByTitle('No validation rules')).not.toBeInTheDocument();
    expect(screen.getByText(/No validation rules/)).toHaveClass('sr-only');
    expect(
      screen.getByTitle('Neutral words generator (default)'),
    ).toBeInTheDocument();
  });
});
