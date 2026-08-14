import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import Scalar from '../Scalar';

beforeAll(() => {
  // fresco-ui's invalid-submit handler scrolls the first invalid field into
  // view; jsdom implements no scrolling.
  Element.prototype.scrollTo ??= () => undefined;
});

const renderParameters = (minLabel?: string, maxLabel?: string) => {
  const onSubmit = vi.fn((_values: Record<string, unknown>) => ({
    success: true as const,
  }));
  const { container } = render(
    <Form onSubmit={onSubmit}>
      <Scalar
        name="parameters"
        initialParameters={{
          ...(minLabel === undefined ? {} : { minLabel }),
          ...(maxLabel === undefined ? {} : { maxLabel }),
        }}
      />
    </Form>,
  );

  const submit = async () => {
    const form = container.querySelector('form');
    if (!form) throw new Error('form element was not rendered');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByLabelText(/Minimum label/)).toBeInTheDocument();
    });
  };

  return { onSubmit, submit };
};

// Issue #1383 reported that a blank required Visual Analog Scale endpoint
// label saves and is replaced by a default. It is not: both labels are
// `required`, so the save is refused and the researcher is sent to the first
// blank one. Pinned here so the reported behaviour cannot appear later.
describe('Visual Analog Scale endpoint labels', () => {
  it('refuses to save while an endpoint label is blank', async () => {
    const { onSubmit, submit } = renderParameters(undefined, 'Very close');

    await submit();

    await waitFor(() => {
      expect(screen.getAllByText('This field is required.').length).toBe(1);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to save while both endpoint labels are blank', async () => {
    const { onSubmit, submit } = renderParameters();

    await submit();

    await waitFor(() => {
      expect(screen.getAllByText('This field is required.').length).toBe(2);
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('never substitutes a default label', async () => {
    const { submit } = renderParameters();

    await submit();

    expect(screen.getByLabelText(/Minimum label/)).toHaveValue('');
    expect(screen.getByLabelText(/Maximum label/)).toHaveValue('');
  });

  it('saves once both labels are supplied', async () => {
    const { onSubmit, submit } = renderParameters('Not at all close', '');

    fireEvent.change(screen.getByLabelText(/Maximum label/), {
      target: { value: 'Very close' },
    });
    await submit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      parameters: { minLabel: 'Not at all close', maxLabel: 'Very close' },
    });
  });
});
