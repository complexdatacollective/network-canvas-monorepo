import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

/**
 * Play-function steps for the passphrase prompter: the key button in the
 * navigation, in either orientation, and the dialog it opens.
 */

// Deriving the key takes a moment, and longer under a loaded test run.
const CHECK_TIMEOUT = 10_000;

// The key button is the navigation's: a stage may offer its own button with
// the same name, such as Family Pedigree's notice under the family.
async function openPrompter(title: string) {
  const navigation = within(await screen.findByRole('navigation'));
  await userEvent.click(
    await navigation.findByRole(
      'button',
      { name: 'Enter your passphrase' },
      { timeout: CHECK_TIMEOUT },
    ),
  );
  return within(await screen.findByRole('dialog', { name: title }));
}

// Each label also carries a visual required marker.
const passphraseField = (dialog: ReturnType<typeof within>) =>
  dialog.getByLabelText(/^Passphrase/, { selector: 'input' });

async function submitAndWaitForAcceptance(dialog: ReturnType<typeof within>) {
  await userEvent.click(
    dialog.getByRole('button', { name: 'Submit passphrase' }),
  );
  await waitFor(
    () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    { timeout: CHECK_TIMEOUT },
  );
  await expect(
    screen.queryByText('Checking your passphrase…'),
  ).not.toBeInTheDocument();
}

/**
 * Chooses the interview's passphrase through the prompter, in an interview
 * where none has been chosen yet.
 */
export async function choosePassphraseInPrompter(passphrase: string) {
  const dialog = await openPrompter('Choose a passphrase');
  await userEvent.type(passphraseField(dialog), passphrase);
  await userEvent.type(
    dialog.getByLabelText(/^Confirm Passphrase/, { selector: 'input' }),
    passphrase,
  );
  await submitAndWaitForAcceptance(dialog);
}

/**
 * Enters the passphrase chosen earlier in the interview through the
 * prompter, which asks for it once without confirmation.
 */
export async function enterPassphraseInPrompter(passphrase: string) {
  const dialog = await openPrompter('Enter your passphrase');
  await expect(
    dialog.queryByLabelText(/^Confirm Passphrase/, { selector: 'input' }),
  ).not.toBeInTheDocument();
  await userEvent.type(passphraseField(dialog), passphrase);
  await submitAndWaitForAcceptance(dialog);
}
