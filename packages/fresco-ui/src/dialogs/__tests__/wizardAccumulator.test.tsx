import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Field from '../../form/Field/Field';
import InputField from '../../form/fields/InputField';
import DialogProvider, { type WizardStep } from '../DialogProvider';
import useDialog from '../useDialog';
import { useWizard } from '../useWizard';

/**
 * These tests pin the wizard's own step-value accumulator (useWizardState's
 * `dataRef`), independent of whatever the form store's `getFormValues()`
 * currently does with unmounted fields. A multi-step wizard shares one
 * FormStoreProvider across steps but only the active step's fields are
 * registered — so the wizard must fold each step's field values into its own
 * accumulator as the step unmounts, rather than relying on the store to keep
 * reporting values for fields nobody has registered anymore.
 */

function FirstNameStep() {
  return <Field name="firstName" label="First name" component={InputField} />;
}

function LastNameStep() {
  return <Field name="lastName" label="Last name" component={InputField} />;
}

function PlainFinishStep() {
  return <div>Nothing to fill in here</div>;
}

function TestWizard({
  onResult,
  steps,
}: {
  onResult: (result: unknown) => void;
  steps: WizardStep[];
}) {
  const { openDialog } = useDialog();

  const handleOpen = async () => {
    const result = await openDialog({
      type: 'wizard',
      title: 'Test Wizard',
      steps,
    });
    onResult(result);
  };

  return (
    <button type="button" onClick={handleOpen}>
      Open
    </button>
  );
}

async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Open'));
  await screen.findByRole('dialog');
}

async function waitForClose() {
  // Matches DialogProvider's closeDialog animation timeout.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

describe('Wizard accumulator', () => {
  const user = userEvent.setup();

  it("folds each step's field values into the finish payload as steps unmount", async () => {
    const onResult = vi.fn();

    render(
      <DialogProvider>
        <TestWizard
          onResult={onResult}
          steps={[
            { title: 'Step 1', content: FirstNameStep },
            { title: 'Step 2', content: LastNameStep },
            { title: 'Step 3', content: PlainFinishStep },
          ]}
        />
      </DialogProvider>,
    );

    await openWizard(user);

    await user.type(screen.getByLabelText('First name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Last name');

    await user.type(screen.getByLabelText('Last name'), 'Smith');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Nothing to fill in here');

    // Step 3 has no registered fields, so getFormValues() at finish is empty
    // — the whole payload must come from folding steps 1 and 2 as they
    // unmounted.
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await waitForClose();

    expect(onResult).toHaveBeenCalledWith({
      firstName: 'Alice',
      lastName: 'Smith',
    });
  });

  it('preserves a value typed on a step when navigating back before ever continuing past it', async () => {
    const onResult = vi.fn();

    function DebugDataStep() {
      const { data } = useWizard();
      return (
        <div data-testid="wizard-data">
          {typeof data.lastName === 'string' ? data.lastName : ''}
        </div>
      );
    }

    render(
      <DialogProvider>
        <TestWizard
          onResult={onResult}
          steps={[
            { title: 'Step 1', content: DebugDataStep },
            { title: 'Step 2', content: LastNameStep },
            { title: 'Step 3', content: PlainFinishStep },
          ]}
        />
      </DialogProvider>,
    );

    await openWizard(user);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Last name');

    // Type on step 2 but only go Back — step 2 is never "Next-ed" past.
    await user.type(screen.getByLabelText('Last name'), 'Partial');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    // The Back navigation itself must have folded step 2's field into the
    // accumulator — visible immediately on step 1 via wizard `data`, with no
    // need to revisit step 2.
    await screen.findByTestId('wizard-data');
    expect(screen.getByTestId('wizard-data')).toHaveTextContent('Partial');

    // Continue forward again: the field should restore its typed value...
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Last name')).toHaveValue('Partial');

    // ...and the final resolved object should still contain it.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Nothing to fill in here');
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await waitForClose();

    expect(onResult).toHaveBeenCalledWith({ lastName: 'Partial' });
  });

  it('replaces a stale array-shaped answer wholly when a revisited step shrinks it', async () => {
    const onResult = vi.fn();

    function CountStep() {
      const { data, setStepData } = useWizard();
      const count = typeof data.count === 'number' ? data.count : 0;
      return (
        <div>
          <span data-testid="count-value">{count}</span>
          <button type="button" onClick={() => setStepData({ count: 3 })}>
            Count 3
          </button>
          <button type="button" onClick={() => setStepData({ count: 2 })}>
            Count 2
          </button>
        </div>
      );
    }

    function PeopleStep() {
      const { data } = useWizard();
      const count = typeof data.count === 'number' ? data.count : 0;
      return (
        <div>
          {Array.from({ length: count }, (_, i) => (
            <Field
              key={i}
              name={`people[${i}].name`}
              label={`Person ${i + 1}`}
              component={InputField}
            />
          ))}
        </div>
      );
    }

    render(
      <DialogProvider>
        <TestWizard
          onResult={onResult}
          steps={[
            { title: 'Step 1', content: CountStep },
            { title: 'Step 2', content: PeopleStep },
            { title: 'Step 3', content: PlainFinishStep },
          ]}
        />
      </DialogProvider>,
    );

    await openWizard(user);

    // Set count to 3 and fill all three entries.
    await user.click(screen.getByText('Count 3'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Person 3');

    await user.type(screen.getByLabelText('Person 1'), 'P0');
    await user.type(screen.getByLabelText('Person 2'), 'P1');
    await user.type(screen.getByLabelText('Person 3'), 'P2');

    // Go back and shrink the count to 2.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('count-value');
    await user.click(screen.getByText('Count 2'));
    expect(screen.getByTestId('count-value')).toHaveTextContent('2');

    // Continue forward again — only 2 fields render now.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Person 2');
    expect(screen.queryByLabelText('Person 3')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Nothing to fill in here');
    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await waitForClose();

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 2,
        people: [{ name: 'P0' }, { name: 'P1' }],
      }),
    );
  });
});
