import { expect } from 'storybook/test';

// A passphrase field uses fresco-ui's suppressPasswordManager. Where the
// browser supports -webkit-text-security, the field is a text input that the
// property masks, so password managers never see it as a credential. Elsewhere
// it falls back to a password input. Either way the value must stay hidden.
export async function expectMaskedPassphraseField(field: HTMLElement) {
  await expect(field).toHaveAttribute('autocomplete', 'off');
  if (CSS.supports('-webkit-text-security', 'disc')) {
    await expect(field).toHaveAttribute('type', 'text');
    await expect(
      getComputedStyle(field).getPropertyValue('-webkit-text-security'),
    ).toBe('disc');
  } else {
    await expect(field).toHaveAttribute('type', 'password');
  }
}
