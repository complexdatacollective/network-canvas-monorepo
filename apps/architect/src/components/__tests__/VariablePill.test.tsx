import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      await screen.findByRole('dialog', { name: 'Edit variable' }),
    ).toBeInTheDocument();
  });

  it('describes the edit action in a tooltip on keyboard focus', async () => {
    render(<ConnectedVariablePill animated editable uuid="node-subject" />);
    const pill = screen.getByRole('button', {
      name: 'Edit variable: subject_var',
    });

    fireEvent.focus(pill);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Edit variable: subject_var',
    );
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
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Edit variable' }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Edit variable: subject_var' }),
    ).toHaveFocus();
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
});
