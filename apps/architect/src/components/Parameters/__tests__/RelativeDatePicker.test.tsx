import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import Parameters from '../Parameters';
import RelativeDatePicker from '../RelativeDatePicker';

const renderPicker = (initialParameters?: Record<string, unknown>) => {
  render(
    <Form onSubmit={() => ({ success: true })}>
      <RelativeDatePicker
        name="parameters"
        initialParameters={initialParameters}
      />
    </Form>,
  );
};

// The anchor control only mounts once "Use interview date" is off, which the
// component derives from whether an anchor is already set.
const renderWithAnchor = (anchor: string) => renderPicker({ anchor });

describe('RelativeDatePicker parameters', () => {
  it('gives the day-offset inputs accessible names', () => {
    renderPicker();

    expect(
      screen.getByRole('spinbutton', { name: 'Days before' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('spinbutton', { name: 'Days after' }),
    ).toBeInTheDocument();
  });

  it.each(['Days before', 'Days after'])(
    'rejects a negative %s offset',
    async (label) => {
      renderPicker();
      const input = screen.getByRole('spinbutton', { name: label });

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(
          screen.getByText('Too small. Value must be at least 0.'),
        ).toBeInTheDocument();
      });
    },
  );

  it.each(['Days before', 'Days after'])(
    'clears the error once %s is corrected to zero',
    async (label) => {
      renderPicker();
      const input = screen.getByRole('spinbutton', { name: label });

      fireEvent.change(input, { target: { value: '-5' } });
      fireEvent.blur(input);
      await waitFor(() => {
        expect(
          screen.getByText('Too small. Value must be at least 0.'),
        ).toBeInTheDocument();
      });

      fireEvent.change(input, { target: { value: '0' } });
      await waitFor(() => {
        expect(
          screen.queryByText('Too small. Value must be at least 0.'),
        ).not.toBeInTheDocument();
      });
    },
  );
});

// Audit sweep: `parameters.min` on the anchor control configures the picker's
// selectable range; it does not validate the committed value. Without a
// matching editor rule the dialog saved a below-floor anchor and the protocol
// validation listener then threw a blocking invalid-protocol dialog offering
// to revert the edit.
describe('RelativeDatePicker anchor year floor', () => {
  it('accepts a schema-valid anchor whose year is below 100', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0050-01-01' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText(/Anchor date must use a year/),
      ).not.toBeInTheDocument();
    });
  });

  it('offers and accepts the schema floor', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    expect(anchor).toHaveAttribute('min', '0001-01-01');

    fireEvent.change(anchor, { target: { value: '0001-01-01' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText('Anchor date must use a year of 0001 or later'),
      ).not.toBeInTheDocument();
    });
  });

  it('accepts an anchor year in the previously-rejected 0100-0999 range', async () => {
    renderWithAnchor('2020-01-01');
    const anchor = screen.getByLabelText(/Specific Anchor Date/);

    fireEvent.change(anchor, { target: { value: '0999-12-31' } });
    fireEvent.blur(anchor);

    await waitFor(() => {
      expect(
        screen.queryByText(/Anchor date must use a year/),
      ).not.toBeInTheDocument();
    });
  });
});

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

/**
 * Trying the other date control and coming back is an ordinary researcher
 * action — both controls are offered for a `datetime` variable — and the
 * observer that reacts to the change clears every `parameters.*` leaf. The row
 * prop the editor was given is pre-edit and does not move, so the editor must
 * read what the FORM now holds rather than what the row once did.
 */
describe('RelativeDatePicker after an input-control change', () => {
  const COMMITTED = { anchor: '2020-01-01', before: 180 };

  const renderSwitchable = () => {
    let storeApi: StoreApi | null = null;
    const CaptureStore = () => {
      storeApi = useContext(FormStoreContext) ?? null;
      return null;
    };

    const onSubmit = vi.fn(() => ({ success: true }));

    const Harness = ({ component }: { component: string }) => (
      <Form onSubmit={onSubmit}>
        <CaptureStore />
        <Parameters
          type="datetime"
          component={component}
          name="parameters"
          initialParameters={COMMITTED}
        />
        <button type="submit">Save</button>
      </Form>
    );

    const { rerender } = render(<Harness component="RelativeDatePicker" />);

    // Swaps the input control the way `withFieldsHandlers` does: the editor for
    // the outgoing control unmounts, and the observer clears the parameters.
    const switchControlTo = (component: string) => {
      rerender(<Harness component={component} />);
      const api = storeApi;
      if (!api) throw new Error('form store was not captured');
      act(() => api.getState().clearValue('parameters'));
    };

    return { onSubmit, switchControlTo };
  };

  const interviewDateToggle = () =>
    screen.getByRole('switch', { name: /Use interview date/ });

  it('falls back to the interview date once the committed anchor has been cleared', () => {
    const { switchControlTo } = renderSwitchable();
    expect(interviewDateToggle()).not.toBeChecked();

    switchControlTo('DatePicker');
    switchControlTo('RelativeDatePicker');

    expect(interviewDateToggle()).toBeChecked();
    expect(screen.queryByLabelText(/Specific Anchor Date/)).toBeNull();
  });

  it('saves without demanding an anchor the researcher never cleared', async () => {
    const { onSubmit, switchControlTo } = renderSwitchable();

    switchControlTo('DatePicker');
    switchControlTo('RelativeDatePicker');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText('This field is required.')).toBeNull();
  });

  it('keeps the anchor input mounted while a fresh anchor is being typed', () => {
    renderPicker();

    fireEvent.click(interviewDateToggle());

    // The anchor is empty for the whole interval between the toggle and the
    // first keystroke, so a derived or effect-synced toggle would snap back on
    // here and take the input with it.
    expect(interviewDateToggle()).not.toBeChecked();
    expect(screen.getByLabelText(/Specific Anchor Date/)).toBeInTheDocument();
  });
});
