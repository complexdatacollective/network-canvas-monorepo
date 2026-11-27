import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import type { Codebook } from '@codaco/protocol-validation';

type Subject = { entity: 'node' | 'edge' | 'ego'; type?: string };

// A codebook holding one duplicate-name pair per scope: renaming `subject_var`
// to `taken_var` must be rejected inline for ego and node variables alike.
const PERSON = testTypeId('person');

const codebook = {
  ego: {
    variables: {
      [testVariableId('ego-subject')]: {
        name: 'subject_var',
        type: 'text',
      },
      [testVariableId('ego-taken')]: { name: 'taken_var', type: 'text' },
    },
  },
  node: {
    [PERSON]: {
      variables: {
        [testVariableId('node-subject')]: {
          name: 'subject_var',
          type: 'text',
        },
        [testVariableId('node-taken')]: { name: 'taken_var', type: 'text' },
        [testVariableId('node-colour')]: {
          name: 'colour',
          type: 'categorical',
          options: [{ label: 'Red', value: 'red' }],
        },
        [testVariableId('node-warm-dark')]: { name: 'warm_dark', type: 'text' },
        [testVariableId('node-shade')]: {
          name: 'shade',
          type: 'categorical',
          options: [{ label: 'Dark', value: 'dark' }],
        },
      },
    },
  },
} as unknown as Codebook;

const variableFixtures = {
  [testVariableId('ego-subject')]: {
    uuid: testVariableId('ego-subject'),
    name: 'subject_var',
    entity: 'ego' as const,
    entityType: null,
    type: 'text',
  },
  [testVariableId('node-subject')]: {
    uuid: testVariableId('node-subject'),
    name: 'subject_var',
    entity: 'node' as const,
    entityType: PERSON,
    type: 'text',
  },
  [testVariableId('node-shade')]: {
    uuid: testVariableId('node-shade'),
    name: 'shade',
    entity: 'node' as const,
    entityType: PERSON,
    type: 'categorical',
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
      return actual.getVariablesForSubject(
        { activeProtocol: { present: { codebook } } } as never,
        subject,
      );
    },
    makeGetVariableWithEntity: (uuid: string) => () =>
      variableFixtures[uuid as keyof typeof variableFixtures],
  };
});

// The codebook's layouts, which a node attribute may not be named like.
vi.mock('~/selectors/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/selectors/protocol')>();
  return {
    ...actual,
    getCodebook: () => ({
      ...codebook,
      layouts: { [testVariableId('seating layout')]: { name: 'seating' } },
    }),
  };
});

const { ConnectedVariablePill, VariablePill } = await import('../VariablePill');
const { updateVariableByUUID } =
  await import('~/ducks/modules/protocol/codebook');

const startEditing = async (uuid: string) => {
  const fixture = variableFixtures[uuid];
  if (!fixture) throw new Error(`No variable fixture ${uuid}`);
  render(<ConnectedVariablePill animated editable uuid={uuid} />);
  const pill = screen.getByRole('button', {
    name: `Edit attribute name: ${fixture.name}`,
  });
  fireEvent.click(pill);

  return screen.findByRole('textbox', { name: 'Attribute name' });
};

describe('ConnectedVariablePill', () => {
  beforeEach(() => {
    subjectsSeen.length = 0;
  });

  it('uses an accessible button to open the variable name editor directly', async () => {
    render(
      <ConnectedVariablePill
        animated
        editable
        uuid={testVariableId('node-subject')}
      />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });

    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');

    fireEvent.click(pill);
    expect(
      await screen.findByRole('dialog', { name: 'Edit attribute name' }),
    ).toBeInTheDocument();
  });

  it('forwards Tailwind layout constraints', () => {
    const { container } = render(
      <ConnectedVariablePill
        className="max-w-64"
        uuid={testVariableId('node-subject')}
      />,
    );

    expect(container.querySelector('data')).toHaveClass('max-w-64');
  });

  it('describes the edit action in a tooltip on keyboard focus', async () => {
    render(
      <ConnectedVariablePill
        animated
        editable
        uuid={testVariableId('node-subject')}
      />,
    );
    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });

    fireEvent.focus(pill);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Edit attribute name: subject_var',
    );
  });

  it('opens an autofocus modal editor with actions outside the pill', async () => {
    const input = await startEditing(testVariableId('node-subject'));

    const dialog = screen.getByRole('dialog', { name: 'Edit attribute name' });

    expect(dialog).toBeInTheDocument();
    // The trigger's default percentage max-width constrains its normal layout,
    // but the viewport overlay must regain the internal editing width.
    await waitFor(() =>
      expect(dialog.querySelector('.variable-pill')).toHaveStyle({
        width: '320px',
      }),
    );
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
    const input = await startEditing(testVariableId('node-subject'));
    fireEvent.change(input, { target: { value: 'renamed_var' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });
    expect(pill).toHaveFocus();
  });

  it('returns focus to the pill after cancelling an edit', async () => {
    await startEditing(testVariableId('node-subject'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const pill = screen.getByRole('button', {
      name: 'Edit attribute name: subject_var',
    });
    expect(pill).toHaveFocus();
  });

  it('rejects renaming an ego variable to an existing ego variable name', async () => {
    const input = await startEditing(testVariableId('ego-subject'));
    fireEvent.change(input, { target: { value: 'taken_var' } });

    expect(
      await screen.findByText('this type already has an attribute called that'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('variable-name-field-error')).toBeInTheDocument();
    // Ego has no entity type; a `type` here resolves to the non-existent
    // `codebook.ego.<type>.variables` and silently finds nothing.
    expect(subjectsSeen.at(-1)).toEqual({ entity: 'ego', type: undefined });
  });

  it('rejects renaming a node variable to an existing name in the same type', async () => {
    const input = await startEditing(testVariableId('node-subject'));
    fireEvent.change(input, { target: { value: 'taken_var' } });

    expect(
      await screen.findByText('this type already has an attribute called that'),
    ).toBeInTheDocument();
    expect(subjectsSeen.at(-1)).toEqual({ entity: 'node', type: PERSON });
  });

  it('rejects renaming a node variable to the name of a layout', async () => {
    const input = await startEditing(testVariableId('node-subject'));
    fireEvent.change(input, { target: { value: 'Seating' } });

    expect(
      await screen.findByText('the codebook already has a layout called that'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('lets an ego variable take the name of a layout', async () => {
    const input = await startEditing(testVariableId('ego-subject'));
    fireEvent.change(input, { target: { value: 'seating' } });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText('the codebook already has a layout called that'),
    ).not.toBeInTheDocument();
  });

  it('allows an ego variable to keep its own name', async () => {
    const input = await startEditing(testVariableId('ego-subject'));
    fireEvent.change(input, { target: { value: 'subject_var' } });

    expect(
      screen.queryByText('this type already has an attribute called that'),
    ).not.toBeInTheDocument();
  });

  describe('names in any script', () => {
    it.each([
      ['amigo cercano', 'amigo cercano'],
      ['友人', '友人'],
      ['Collègue', 'Collègue'],
      // Padding and a decomposed accent are tidied as the name is saved.
      ['  Colle\u0300gue ', 'Collègue'],
    ])('saves %j as %j', async (typed, saved) => {
      const input = await startEditing(testVariableId('node-subject'));
      fireEvent.change(input, { target: { value: typed } });

      expect(screen.queryByTestId('variable-name-field-error')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(updateVariableByUUID).toHaveBeenLastCalledWith(
        testVariableId('node-subject'),
        {
          name: saved,
        },
      );
    });

    it('refuses a name with a control character', async () => {
      const input = await startEditing(testVariableId('node-subject'));
      fireEvent.change(input, { target: { value: 'bad\tname' } });

      expect(
        await screen.findByText(
          'a name cannot contain line breaks, tabs or other control characters',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeDisabled();
    });

    it('refuses a name of nothing but spaces', async () => {
      const input = await startEditing(testVariableId('node-subject'));
      fireEvent.change(input, { target: { value: '   ' } });

      expect(
        await screen.findByText('You must enter an attribute name'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeDisabled();
    });

    it('treats a name that differs only in case or composition as taken', async () => {
      const input = await startEditing(testVariableId('node-subject'));
      fireEvent.change(input, { target: { value: 'TAKEN_VAR ' } });

      expect(
        await screen.findByText(
          'this type already has an attribute called that',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('export columns', () => {
    const expectRefused = async (
      uuid: string,
      name: string,
      message: string,
    ) => {
      const input = await startEditing(uuid);
      fireEvent.change(input, { target: { value: name } });

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeDisabled();
    };

    it('refuses a name that is a column of a sibling categorical attribute’s option', async () => {
      await expectRefused(
        testVariableId('node-subject'),
        'colour_red',
        'The export already has a column called “colour_red” for option “red” of the attribute “colour”. Choose a different name.',
      );
    });

    it('refuses a name that is a position column of a codebook layout', async () => {
      await expectRefused(
        testVariableId('node-subject'),
        'seating_x',
        'The export already has a column called “seating_x” for the positions in the layout “seating”. Choose a different name.',
      );
    });

    it('refuses a name for a categorical attribute whose option column a sibling already has', async () => {
      await expectRefused(
        testVariableId('node-shade'),
        'warm',
        'Option “dark” of “warm” would be exported to a column called “warm_dark”, but the attribute “warm_dark” already has a column called “warm_dark”. Change the option value or the attribute name.',
      );
    });

    it('refuses a name that is a built-in column of the exported file', async () => {
      await expectRefused(
        testVariableId('node-subject'),
        'networkCanvasEgoUUID',
        'The export already has a built-in column called “networkCanvasEgoUUID”, so an attribute cannot be named “networkCanvasEgoUUID”. Choose a different name.',
      );
    });

    it('refuses a name that an export writes as a sibling’s column', async () => {
      await expectRefused(
        testVariableId('node-subject'),
        'colour red',
        'In the export, the name “colour red” and the column “colour_red” of the attribute “colour” would become the same column, “colour_red”. Choose a different name.',
      );
    });

    it('lets a name through that only resembles a sibling’s column', async () => {
      const input = await startEditing(testVariableId('node-subject'));
      fireEvent.change(input, { target: { value: 'colour-red' } });

      expect(screen.queryByTestId('variable-name-field-error')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeEnabled();
    });
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

    // The frame keeps a 16px viewport gutter, and the 1.5x pill plus its 24px
    // padding on each side fits inside that frame instead of overflowing it.
    await waitFor(() => {
      const frameLeft = Number.parseFloat(dialog.style.left);
      const frameWidth = Number.parseFloat(dialog.style.width);
      const editorWidth = Number.parseFloat(editor.style.width);

      expect(frameLeft).toBeGreaterThanOrEqual(16);
      expect(frameLeft + frameWidth).toBeLessThanOrEqual(
        window.innerWidth - 16,
      );
      expect(editorWidth * 1.5 + 48).toBeLessThanOrEqual(frameWidth);
    });
  });

  it('renders a non-interactive reference as a data element carrying the variable name', () => {
    const { container } = render(
      <VariablePill label="subject_var" type="text" />,
    );

    expect(container.querySelector('data')).toHaveAttribute(
      'value',
      'subject_var',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
