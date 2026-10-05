import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// QuickAddField reads node presentation state through useStageSelector.
// Dispatch on the selector sentinel exported by the (mocked) selector modules.
vi.mock('../../../../selectors/session', () => ({
  getNodeColorSelector: 'getNodeColorSelector',
  getNodeTypeDefinition: 'getNodeTypeDefinition',
  getPromptAdditionalAttributes: 'getPromptAdditionalAttributes',
  resolveNodeShape: () => 'circle',
}));

vi.mock('../../../../selectors/name-generator', () => ({
  getCanAddMultipleNodes: 'getCanAddMultipleNodes',
  getNodeIconName: 'getNodeIconName',
}));

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    switch (selector) {
      case 'getNodeColorSelector':
        return 'node-color-seq-1';
      case 'getNodeTypeDefinition':
        return { shape: 'circle' };
      case 'getPromptAdditionalAttributes':
        return {};
      case 'getNodeIconName':
        return 'add-a-person';
      case 'getCanAddMultipleNodes':
        return true;
      default:
        return undefined;
    }
  },
}));

import QuickAddField from '../QuickAddField';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const openField = async () => {
  await userEvent.click(screen.getByTestId('quick-add-toggle'));
  return screen.findByTestId('quick-add-input');
};

describe('QuickAddField', () => {
  afterEach(() => {
    cleanup();
  });

  it('stays open when blur is caused by the submit-disabled input', async () => {
    // Simulate a slow submission (e.g. attribute encryption): the form store
    // renders isSubmitting=true, which disables the input mid-submit. WebKit
    // then blurs the focused-but-now-disabled input and dispatches that blur
    // through React. That blur must not close the field.
    const deferred = createDeferred();
    const onSubmit = vi.fn(async () => {
      await deferred.promise;
      return { success: true };
    });

    render(
      <Form onSubmit={onSubmit}>
        <QuickAddField name="name" placeholder="Type a name" disabled={false} />
      </Form>,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    // The submitting render must have committed before the engine-style blur.
    await waitFor(() => expect(input).toBeDisabled());

    // jsdom does not blur a control that becomes disabled, so dispatch the
    // blur WebKit produces in that situation ourselves.
    fireEvent.blur(input);

    deferred.resolve();

    await waitFor(() =>
      expect(screen.getByTestId('quick-add-input')).not.toBeDisabled(),
    );

    // Open, cleared, and ready for the next name.
    expect(screen.getByTestId('quick-add-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('quick-add-input')).toHaveValue('');
    expect(screen.getByTestId('quick-add-input')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByTestId('quick-add-toggle')).toHaveAccessibleName(
      'Quick add input',
    );
  });

  it('treats a dotted protocol variable containing a dangerous segment as opaque', async () => {
    const onSubmit = vi.fn(async () => ({ success: true as const }));

    render(
      <Form onSubmit={onSubmit}>
        <QuickAddField
          name="safe.__proto__.polluted"
          placeholder="Type a name"
          disabled={false}
        />
      </Form>,
    );

    const input = await openField();
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        'safe.__proto__.polluted': 'Alice',
      });
    });
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });

  it('resets from the owning form success signal when submitting renders are batched', async () => {
    function Harness() {
      const [successfulSubmissionCount, setSuccessfulSubmissionCount] =
        useState(0);

      return (
        <Form
          onSubmit={() => {
            setSuccessfulSubmissionCount((count) => count + 1);
            return { success: true };
          }}
        >
          <QuickAddField
            name="name"
            placeholder="Type a name"
            disabled={false}
            successfulSubmissionCount={successfulSubmissionCount}
          />
        </Form>
      );
    }

    render(<Harness />);

    const input = await openField();
    await userEvent.type(input, 'Alice');
    fireEvent.submit(input.closest('form')!);

    await waitFor(() =>
      expect(screen.getByTestId('quick-add-input')).toHaveValue(''),
    );
    expect(screen.getByTestId('quick-add-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('closes when the user blurs the enabled input', async () => {
    render(
      <Form onSubmit={vi.fn(async () => ({ success: true }))}>
        <QuickAddField name="name" placeholder="Type a name" disabled={false} />
      </Form>,
    );

    const input = await openField();
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.getByTestId('quick-add-toggle')).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });
});
