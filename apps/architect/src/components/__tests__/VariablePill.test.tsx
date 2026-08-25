import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';

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
  const actual = await importOriginal<typeof import('~/selectors/codebook')>();
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
  };
});

const { ConnectedVariablePill, VariablePill } = await import('../VariablePill');

const startEditing = async (uuid: string) => {
  render(<ConnectedVariablePill animated editable uuid={uuid} />);
  const pill = screen.getByRole('button', {
    name: 'Edit attribute name: subject_var',
  });
  fireEvent.click(pill);

  return screen.findByRole('textbox', { name: 'Attribute name' });
};

describe('ConnectedVariablePill', () => {
  beforeEach(() => {
    subjectsSeen.length = 0;
  });

  it('uses an accessible button to open the variable name editor directly', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });

    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    expect(pill).toHaveClass(
      'cursor-pointer',
      'effect-shadow-sm',
      'hover:effect-shadow',
      'hover:-translate-y-0.5',
      'focus-visible:effect-shadow',
      'focus-visible:-translate-y-0.5',
    );

    fireEvent.click(pill);
    expect(
      await screen.findByRole('dialog', { name: 'Edit attribute name' }),
    ).toBeInTheDocument();
  });

  it('forwards Tailwind layout constraints', () => {
    const { container } = render(
      <ConnectedVariablePill className="max-w-64" uuid="node-subject" />,
    );

    expect(container.querySelector('data')).toHaveClass('max-w-64');
  });

  it('describes the edit action in a tooltip on keyboard focus', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });

    fireEvent.focus(pill);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Edit attribute name: subject_var',
    );
  });

  it('opens an autofocus modal editor with actions outside the pill', async () => {
    const input = await startEditing('node-subject');

    const dialog = screen.getByRole('dialog', { name: 'Edit attribute name' });

    expect(dialog).toBeInTheDocument();
    // The trigger's default percentage max-width constrains its normal layout,
    // but the viewport overlay must regain the internal editing width.
    expect(dialog.querySelector('.variable-pill')).toHaveStyle({
      width: '320px',
    });
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });

    expect(saveButton).toBeDisabled();

    fireEvent.change(input, { target: { value: 'renamed_var' } });
    expect(saveButton).toBeEnabled();

    fireEvent.change(input, { target: { value: 'subject_var' } });
    expect(saveButton).toBeDisabled();
  });

  it('returns focus to the pill after saving an edit', async () => {
    const input = await startEditing('node-subject');
    fireEvent.change(input, { target: { value: 'renamed_var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });
    expect(pill).toHaveFocus();
  });

  it('returns focus to the pill after cancelling an edit', async () => {
    await startEditing('node-subject');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });
    expect(pill).toHaveFocus();
  });

  it('rejects renaming an ego variable to an existing ego variable name', async () => {
    const input = await startEditing('ego-subject');
    fireEvent.change(input, { target: { value: 'taken_var' } });

    expect(await screen.findByText(/is already in use/)).toBeInTheDocument();
    expect(screen.getByTestId('variable-name-field-error')).toBeInTheDocument();
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
  it('keeps a wide name editor inside the viewport', async () => {
    render(
      <VariablePill
        className="max-w-full"
        editable
        label="subject_var"
        type="text"
      />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });
    vi.spyOn(pill, 'getBoundingClientRect').mockReturnValue({
      bottom: 148,
      height: 48,
      left: 100,
      right: 900,
      top: 100,
      width: 800,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.click(pill);
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit attribute name',
    });
    const editor = dialog.querySelector<HTMLElement>('.variable-pill');
    if (!editor) throw new Error('variable pill editor did not render');

    const frameLeft = Number.parseFloat(dialog.style.left);
    const frameWidth = Number.parseFloat(dialog.style.width);
    const editorWidth = Number.parseFloat(editor.style.width);

    // The frame keeps a 16px viewport gutter, and the 1.5x pill plus its 24px
    // padding on each side fits inside that frame instead of overflowing it.
    expect(frameLeft).toBeGreaterThanOrEqual(16);
    expect(frameLeft + frameWidth).toBeLessThanOrEqual(window.innerWidth - 16);
    expect(editorWidth * 1.5 + 48).toBeLessThanOrEqual(frameWidth);
  });

  it('uses a data element and a static border for a non-interactive reference', () => {
    const { container } = render(
      <VariablePill label="subject_var" type="text" />,
    );
    const pill = container.querySelector('data');

    expect(pill).toHaveAttribute('value', 'subject_var');
    expect(pill).toHaveClass('bg-(--variable-pill-accent)');
    expect(pill).toHaveClass('cursor-default');
    expect(pill).toHaveClass('effect-shadow-sm');
    expect(pill).toHaveClass('w-max', 'max-w-full', 'min-w-0');
    expect(pill?.firstElementChild).toHaveClass(
      'grid-cols-[3rem_minmax(0,auto)]',
    );
    expect(pill?.firstElementChild).not.toHaveClass('w-full');
    expect(pill).not.toHaveClass('hover:effect-shadow');
    expect(pill).not.toHaveClass('variable-pill-effect-border');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('accepts Tailwind layout constraints through className', () => {
    const { container } = render(
      <VariablePill
        className="max-w-[7cm]"
        label="participant_neighbourhood_connection_frequency"
        type="text"
      />,
    );
    const pill = container.querySelector('data');

    expect(pill).toHaveClass('w-max', 'max-w-[7cm]');
    expect(pill).not.toHaveClass('max-w-full');
  });

  it('allows animation to be enabled independently of editability', () => {
    const { container } = render(
      <VariablePill animated label="subject_var" type="text" />,
    );
    const pill = container.querySelector('data');

    expect(pill).toHaveClass('variable-pill-effect-border');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
