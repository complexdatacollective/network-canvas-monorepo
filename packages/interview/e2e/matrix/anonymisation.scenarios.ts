import { z } from 'zod';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { AnonymisationFixture } from '../fixtures/anonymisation-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const PASSPHRASE_MISMATCH =
  'This passphrase does not match the one used earlier in this interview. Check it and try again.';

const ByteArraySchema = z.array(z.number().int().min(0).max(255));

/**
 * The interview's encryption header exactly as the format writes it. Strict,
 * so a header that grew or lost a field fails here.
 */
const EncryptionHeaderSchema = z.strictObject({
  version: z.literal(1),
  method: z.literal('AES-256-GCM'),
  kdf: z.strictObject({
    algorithm: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.literal(600_000),
    salt: ByteArraySchema.length(16),
  }),
  check: z.strictObject({
    iv: ByteArraySchema.length(12),
    data: ByteArraySchema.nonempty(),
  }),
});

/**
 * A node holding encrypted answers in the current format. Each answer's
 * metadata is its IV alone: the key is the interview's, described once by the
 * header, so a per-value salt (the schema 8 format) fails the strict object.
 */
const CurrentFormatNodeSchema = z.object({
  [entityAttributesProperty]: z.record(z.string(), z.unknown()),
  [entitySecureAttributesMeta]: z.record(
    z.string(),
    z.strictObject({ iv: ByteArraySchema.length(12) }),
  ),
});

/** A network whose single node holds encrypted answers. */
const EncryptedNetworkSchema = z.object({
  encryption: EncryptionHeaderSchema,
  nodes: z.tuple([CurrentFormatNodeSchema]),
});

/**
 * Checks that `network` holds one node whose only encrypted answer is a short
 * name stored in the current format, and returns the network's header.
 */
function expectEncryptedName(network: unknown, plaintext: string) {
  const {
    encryption,
    nodes: [node],
  } = EncryptedNetworkSchema.parse(network);
  expectEncryptedNameOn(node, plaintext);
  return encryption;
}

/**
 * Checks that `node`'s only encrypted answer is a short name stored in the
 * current format.
 */
function expectEncryptedNameOn(node: unknown, plaintext: string) {
  const parsed = CurrentFormatNodeSchema.parse(node);
  const attributes = parsed[entityAttributesProperty];
  const ciphertexts = Object.keys(parsed[entitySecureAttributesMeta]).map(
    (variableId) => ByteArraySchema.parse(attributes[variableId]),
  );
  expect(ciphertexts).toHaveLength(1);
  // A value is padded to whole 32-byte blocks before encryption, and GCM
  // appends a 16-byte tag: a name shorter than one block is 48 bytes.
  expect(ciphertexts[0]).toHaveLength(32 + 16);
  expect(Object.values(attributes)).not.toContain(plaintext);
}

/**
 * The animated EncryptionBackground (EncryptedBackground.tsx:367-371, rendered
 * at Anonymisation.tsx:75) never settles and draws unseeded Math.random names
 * that are NOT aria-hidden, so every scenario sandwiches the Anonymisation
 * stage between Information stages and drives run() so that both the runner's
 * 'initial' and 'final' aria snapshots land on a neighbouring (background-free)
 * stage. The `.transform-3d` root of that background is masked via captureMask
 * for the Task 27 pixel-visual suite.
 */
export const anonymisationScenarios: InterfaceScenarios = {
  interfaceType: 'Anonymisation',
  scenarios: [
    {
      id: 'markdown-explanation-happy-path',
      covers: [
        'explanationText.title',
        'explanationText.body',
        'label',
        'interviewScript',
        'passwordField.showToggle',
      ],
      smoke: true,
      visual: true,
      captureMask: (page) => [page.locator('.transform-3d')],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Welcome',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          label: 'Internal Label',
          interviewScript: 'Say hello',
          explanationText: {
            title: 'Data Anonymisation',
            body: '## How It Works\n\nUse a **memorable** phrase.\n\n1. Choose one\n2. Confirm it',
          },
        });
        synth.addInformationStage({
          title: 'Thank you',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // dismiss the intro Information stage

        await expect(
          page.getByRole('heading', { name: 'Data Anonymisation' }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'How It Works' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'memorable' }),
        ).toBeVisible();
        // Ordered-list items from the markdown body render as real content.
        await expect(page.getByText('Choose one')).toBeVisible();
        await expect(page.getByText('Confirm it')).toBeVisible();

        // Dead-config: label/interviewScript never render in the interview DOM.
        await expect(page.getByText('Internal Label')).toHaveCount(0);
        await expect(page.getByText('Say hello')).toHaveCount(0);

        await anon.togglePasswordVisibility();
        await expect(anon.passphraseField()).toHaveAttribute('type', 'text');

        await anon.fillPassphrase('my secret phrase');
        await anon.submit();

        await expect(anon.successAlert('chosen')).toBeVisible();
        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Thank you' }),
        ).toBeVisible();
      },
    },

    {
      id: 'required-mismatch-beforeNext-gating',
      covers: [
        'passphraseFields.required',
        'confirmField.sameAs',
        'beforeNext.gating',
        'validation.minLength.default',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase.',
          },
        });
        synth.addInformationStage({
          title: 'Complete',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation (step 1)

        // passphraseFields.required: submitting an empty form surfaces a
        // required error under each field, does not navigate, and leaves the
        // stage un-ready.
        await anon.submit();
        await expect(anon.passphraseError()).toBeVisible();
        await expect(anon.confirmError()).toBeVisible();
        await expect(anon.passphraseError()).toContainText(
          /answer this question/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);
        await expect(page).toHaveURL(/step=1/);
        expect(await interview.nextButtonHasPulse()).toBe(false);

        // beforeNext.gating through the REAL nav path: clicking the nav Next
        // button runs useBeforeNext, which requestSubmit()s the form. With the
        // form invalid the gate returns false and blocks advancement — and,
        // because it uses requestSubmit (not native <form>.submit()), no GET
        // navigation fires, so the participant is NOT ejected to
        // `/?passphrase=…`. The URL stays on step 1 and the errors persist.
        await interview.nextButton.click();
        await expect(page).toHaveURL(/step=1/);
        await expect(anon.passphraseError()).toBeVisible();

        // confirmField.sameAs: two different values fail the confirm field's
        // sameAs check; still no success, still gated on the stage.
        await anon.fillMismatched('passphrase-A', 'passphrase-B');
        await anon.submit();
        await expect(anon.confirmError()).toBeVisible();
        await expect(anon.confirmError()).toContainText(/same as/i);
        await expect(anon.successAlert()).toHaveCount(0);
        await expect(anon.passphraseField()).toBeVisible();

        // validation.minLength.default: the stage sets no minimum, so a
        // passphrase being chosen must still be at least 8 characters.
        await anon.fillPassphrase('seven77');
        await anon.submit();
        await expect(anon.passphraseError()).toContainText(
          /enter at least 8 characters/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);

        // A valid, matching passphrase releases the gate: the stage becomes
        // ready and advancement succeeds. Ending on the closing Information
        // stage keeps the final aria snapshot off the animated background.
        await anon.fillPassphrase('matching-passphrase');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();
        expect(await interview.nextButtonHasPulse()).toBe(true);
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'min-max-length-validation',
      covers: [
        'validation.minLength',
        'validation.minLength.belowDefault',
        'validation.maxLength',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        // The minimum is below the default of 8 on purpose: a researcher's own
        // minimum replaces the default, even when it is lower.
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase between 4 and 20 characters.',
          },
          validation: { minLength: 4, maxLength: 20 },
        });
        synth.addInformationStage({
          title: 'Complete',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation

        await anon.fillPassphrase('abc');
        await anon.submit();
        await expect(anon.passphraseError()).toContainText(
          /enter at least 4 characters/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);

        await anon.fillPassphrase('this passphrase is far too long');
        await anon.submit();
        await expect(anon.passphraseError()).toContainText(
          /enter at most 20 characters/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);

        // The stated maximum is inclusive: exactly 20 characters passes the
        // passphrase field. The confirmation differs, so the form is refused
        // on sameAs alone; once that error is shown the whole form has been
        // validated, and the passphrase field carries none.
        await anon.fillMismatched('p'.repeat(20), 'q'.repeat(20));
        await anon.submit();
        await expect(anon.confirmError()).toContainText(/same as/i);
        await expect(anon.passphraseField()).toHaveAttribute(
          'aria-invalid',
          'false',
        );
        await expect(anon.passphraseError()).toHaveCount(0);
        await expect(anon.successAlert()).toHaveCount(0);

        // validation.minLength.belowDefault: exactly the researcher's minimum
        // of 4 is accepted, though it is shorter than the default of 8.
        await anon.fillPassphrase('abcd');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();

        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'backwards-nav-and-revisit-persistence',
      covers: ['beforeNext.backwardsAllowed', 'passphrase.persistOnRevisit'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase.',
          },
        });
        synth.addInformationStage({
          title: 'Complete',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation (step 1)

        // beforeNext.backwardsAllowed: Back from an empty form is never gated.
        await page.getByTestId('previous-button').click();
        await expect(page).toHaveURL(/step=0/);
        await expect(
          page.getByRole('heading', { name: 'Introduction' }),
        ).toBeVisible();

        // Forward again: the stage was not skipped and re-shows its form.
        await interview.next();
        await expect(anon.passphraseField()).toBeVisible();

        await anon.fillPassphrase('remember-me-1234');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();

        await interview.next(); // Anonymisation -> Complete
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        // passphrase.persistOnRevisit: navigating back re-enters the stage in
        // its success state (the key stays in force; the form is NOT re-shown),
        // saying the passphrase was entered already rather than set just now.
        await page.getByTestId('previous-button').click();
        await expect(anon.successAlert('earlier')).toBeVisible();
        await expect(anon.passphraseField()).toHaveCount(0);

        // End on the background-free closing Information stage.
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'encrypted-downstream-write',
      covers: ['encryptedVariable.downstreamWrite'],
      visual: true,
      slow: true,
      captureMask: (page) => [page.locator('.transform-3d')],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'This study encrypts participant names.',
          },
        });
        const generator = synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        generator.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, stage, protocol }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation

        await anon.fillPassphrase('correct-horse-battery');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();
        await interview.next(); // Anonymisation -> NameGeneratorQuickAdd

        await stage.quickAdd.addNode('Alice');
        // Visible label still decrypts for display (useNodeLabel).
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        // The name is stored as ciphertext with only its IV beside it, and the
        // network carries the header the first passphrase created.
        expectEncryptedName(
          await protocol.getNetworkState(interview.interviewId),
          'Alice',
        );

        // Wait for the successful quick-add submission to finish resetting
        // before the scenario's final accessibility snapshot is captured.
        await expect(page.getByTestId('quick-add-input')).toHaveValue('');
      },
    },

    {
      id: 'missing-and-wrong-passphrase-prompter',
      covers: [
        'encryptedVariable.resume.locked',
        'encryptedVariable.resume.persistedFormat',
        'encryptedVariable.missingPassphrase.prompter',
        'encryptedVariable.wrongPassphrase.rejected',
      ],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'This study encrypts participant names.',
          },
        });
        const generator = synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        generator.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, stage, protocol }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation

        // Set a passphrase live and add a node, so the node's ciphertext is
        // valid for the passphrase entered in this run (no seedNetwork — a
        // pre-seeded node has no real secure attributes to decrypt).
        await anon.fillPassphrase('first-phrase');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();
        await interview.next(); // -> NameGeneratorQuickAdd (step 2)

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
        const header = expectEncryptedName(
          await protocol.getNetworkState(interview.interviewId),
          'Alice',
        );

        // encryptedVariable.resume.locked: leaving and resuming remounts the
        // interview from its session, so the key is gone from memory. The
        // answer stays encrypted; nothing shows it in the clear.
        await interview.resume();
        await expect(page.getByRole('option', { name: '🔒' })).toBeVisible();
        await expect(page.getByText('Alice')).toHaveCount(0);

        // encryptedVariable.resume.persistedFormat: the session the interview
        // resumed from holds the answer in the current format, and the same
        // header, so the passphrase chosen before leaving still derives the
        // key.
        const stored = await page.evaluate(
          (id) => window.__test.getStoredSession(id),
          interview.interviewId,
        );
        expect(expectEncryptedName(stored?.network, 'Alice')).toEqual(header);

        // encryptedVariable.missingPassphrase.prompter
        await expect.poll(() => stage.quickAdd.isDisabled()).toBe(true);
        await expect(anon.prompterButton()).toBeVisible();
        await expect(anon.prompterButton()).toContainText('🔑');

        // A passphrase was chosen in this interview, so the prompter asks for
        // it rather than for a new one: one field, no confirmation.
        await anon.openPrompter();
        await expect(
          anon.prompterDialog('Enter your Passphrase'),
        ).toBeVisible();
        await expect(anon.confirmField()).toHaveCount(0);

        // encryptedVariable.wrongPassphrase.rejected: a passphrase that does
        // not unlock the saved answer is checked, turned away under the field,
        // and never put in force, so the answer stays locked rather than
        // failing to decrypt.
        const releaseCheck = await anon.holdKeyDerivation();
        await anon.submitPrompterPassphrase('wrong-phrase');
        await expect(anon.checkingStatus()).toBeVisible();
        await expect(anon.prompterSubmitButton()).toBeDisabled();
        await releaseCheck();
        await expect(anon.passphraseError()).toHaveText(PASSPHRASE_MISMATCH);
        await expect(anon.checkingStatus()).toHaveCount(0);
        await expect(anon.passphraseField()).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        await expect(
          anon.prompterDialog('Enter your Passphrase'),
        ).toBeVisible();
        // The open dialog hides the rest of the page from the accessibility
        // tree, so the list behind it is looked up hidden.
        await expect(
          page.getByRole('option', { name: '🔒', includeHidden: true }),
        ).toHaveCount(1);
        await expect(page.getByText('Alice')).toHaveCount(0);

        // The original passphrase is accepted, and unlocks the answer.
        await anon.submitPrompterPassphrase('first-phrase');
        await expect(anon.prompterDialog('Enter your Passphrase')).toHaveCount(
          0,
        );
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
        await expect(anon.prompterButton()).toHaveCount(0);
        await expect.poll(() => stage.quickAdd.isDisabled()).toBe(false);
      },
    },

    {
      id: 'resume-in-portrait-unlocks-through-prompter',
      covers: ['encryptedVariable.missingPassphrase.horizontalPrompter'],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'This study encrypts participant names.',
          },
        });
        const generator = synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        generator.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, stage }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation

        await anon.fillPassphrase('first-phrase');
        await anon.submit();
        await expect(anon.successAlert()).toBeVisible();
        await interview.next(); // -> NameGeneratorQuickAdd (step 2)

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        // The participant resumes on a phone held upright, where the
        // navigation is a bar along the bottom of the screen rather than a
        // rail down its side. The key is gone from memory.
        const portrait = { width: 390, height: 844 };
        await page.setViewportSize(portrait);
        await interview.resume();
        await expect(page.getByRole('option', { name: '🔒' })).toBeVisible();
        await expect.poll(() => stage.quickAdd.isDisabled()).toBe(true);

        const navigation = page.getByRole('navigation');
        await expect
          .poll(async () => {
            const bar = await navigation.boundingBox();
            return (
              bar !== null &&
              bar.width > bar.height &&
              Math.round(bar.y + bar.height) === portrait.height
            );
          })
          .toBe(true);

        // encryptedVariable.missingPassphrase.horizontalPrompter: the prompter
        // is in the bottom bar, wholly on screen and inside it.
        const prompter = navigation.getByRole('button', {
          name: 'Enter your Passphrase',
          exact: true,
        });
        await expect(prompter).toContainText('🔑');
        await expect(prompter).toBeInViewport({ ratio: 1 });
        await expect
          .poll(async () => {
            const bar = await navigation.boundingBox();
            const button = await prompter.boundingBox();
            return (
              bar !== null &&
              button !== null &&
              button.x >= bar.x &&
              button.y >= bar.y &&
              button.x + button.width <= bar.x + bar.width &&
              button.y + button.height <= bar.y + bar.height
            );
          })
          .toBe(true);

        // A passphrase was chosen in this interview, so the prompter asks for
        // it once, and entering it unlocks the answer.
        await anon.openPrompter();
        await expect(
          anon.prompterDialog('Enter your Passphrase'),
        ).toBeVisible();
        await expect(anon.confirmField()).toHaveCount(0);
        await anon.submitPrompterPassphrase('first-phrase');
        await expect(anon.prompterDialog('Enter your Passphrase')).toHaveCount(
          0,
        );
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
        await expect(anon.prompterButton()).toHaveCount(0);
        await expect.poll(() => stage.quickAdd.isDisabled()).toBe(false);
      },
    },

    {
      id: 'resume-asks-for-chosen-passphrase',
      covers: [
        'passphrase.resume.verifyMode',
        'passphrase.resume.wrongRejectedBeforeAnyAnswer',
        'passphrase.checkingStatus',
        'beforeNext.submitsPassphrase',
      ],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase.',
          },
        });
        synth.addInformationStage({
          title: 'Complete',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, protocol }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation (step 1)

        // Nothing has been chosen yet, so the stage asks for a passphrase to
        // be chosen and confirmed.
        await expect(anon.confirmField()).toBeVisible();
        await expect(anon.chosenEarlierNotice()).toHaveCount(0);
        await anon.fillPassphrase('first-phrase');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();
        const header = EncryptionHeaderSchema.parse(
          (await protocol.getNetworkState(interview.interviewId))?.encryption,
        );

        // The participant leaves before answering anything that is encrypted
        // and resumes on the same stage. The key is gone from memory; the
        // header is all the session holds of the passphrase.
        await interview.resume();
        const stored = await page.evaluate(
          (id) => window.__test.getStoredSession(id),
          interview.interviewId,
        );
        expect(
          EncryptionHeaderSchema.parse(stored?.network.encryption),
        ).toEqual(header);
        expect(stored?.network.nodes).toEqual([]);

        // passphrase.resume.verifyMode: the stage asks for the passphrase
        // chosen earlier, in one field, and says why.
        await expect(anon.chosenEarlierNotice()).toBeVisible();
        await expect(anon.passphraseField()).toBeVisible();
        await expect(anon.confirmField()).toHaveCount(0);
        await expect(anon.successAlert()).toHaveCount(0);

        // passphrase.resume.wrongRejectedBeforeAnyAnswer: with no answer to
        // fail to decrypt, a wrong passphrase is still checked against the
        // header and refused. It is shorter than the 8 characters a chosen
        // passphrase needs, and the refusal is the mismatch, not its length:
        // length rules only apply where a passphrase is chosen.
        // passphrase.checkingStatus: the check is announced while it runs,
        // and the form cannot be submitted again meanwhile.
        const releaseCheck = await anon.holdKeyDerivation();
        await anon.passphraseField().fill('wrong');
        await anon.submit();
        await expect(anon.checkingStatus()).toBeVisible();
        await expect(anon.submitButton()).toBeDisabled();
        await releaseCheck();
        await expect(anon.passphraseError()).toHaveText(PASSPHRASE_MISMATCH);
        await expect(anon.checkingStatus()).toHaveCount(0);
        await expect(anon.passphraseField()).toHaveAttribute(
          'aria-invalid',
          'true',
        );
        await expect(anon.successAlert()).toHaveCount(0);

        // beforeNext.submitsPassphrase: Next checks the entered passphrase
        // too, shows the same check under way, and stays on the stage when
        // it is refused.
        await anon.passphraseField().fill('still-wrong');
        const releaseNextCheck = await anon.holdKeyDerivation();
        await interview.nextButton.click();
        await expect(anon.checkingStatus()).toBeVisible();
        await releaseNextCheck();
        await expect(anon.checkingStatus()).toHaveCount(0);
        await expect(page).toHaveURL(/step=1/);
        await expect(anon.passphraseError()).toHaveText(PASSPHRASE_MISMATCH);

        // The passphrase chosen earlier, submitted through Next, is accepted
        // and moves on. Re-entering it leaves the header as it was.
        await anon.passphraseField().fill('first-phrase');
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
        expect(
          (await protocol.getNetworkState(interview.interviewId))?.encryption,
        ).toEqual(header);

        // The key is in force: on a revisit the stage says the passphrase was
        // entered already.
        await page.getByTestId('previous-button').click();
        await expect(anon.successAlert('earlier')).toBeVisible();
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'schema-8-answers-unavailable-new-passphrase',
      covers: [
        'encryptedVariable.schema8.unavailableWithoutPrompt',
        'encryptedVariable.schema8.newPassphrase',
        'encryptedVariable.schema8.newAnswerCurrentFormat',
        'encryptedVariable.schema8.oldAnswerStaysUnavailable',
      ],
      chromiumOnly: true,
      slow: true,
      seedNetwork: true,
      schema8Encryption: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        const nicknameVar = person.addVariable({
          name: 'nickname',
          type: 'text',
        });
        // Adds only an unprotected answer, so nothing on this stage needs a
        // passphrase except reading the protected one it already holds.
        const earlier = synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nicknameVar.id,
        });
        earlier.addPrompt({ text: 'People named before the update' });
        synth.addManualNode(
          earlier.id,
          person.id,
          'alice',
          { [nameVar.id]: 'Alice', [nicknameVar.id]: 'Al' },
          { promptIndices: [0] },
        );
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase.',
          },
        });
        const later = synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        later.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, stage, protocol }) => {
        const anon = new AnonymisationFixture(page);

        // encryptedVariable.schema8.unavailableWithoutPrompt: an interview
        // saved before the update loads with its protected answer shown as
        // unavailable. No passphrase could read it, so none is asked for.
        await expect(
          page.getByRole('option', { name: 'Answer unavailable' }),
        ).toBeVisible();
        await expect(anon.prompterButton()).toHaveCount(0);
        await expect(page.getByText('Alice')).toHaveCount(0);
        const before = await protocol.getNetworkState(interview.interviewId);
        expect(before).not.toHaveProperty('encryption');
        const [storedAlice] = before?.nodes ?? [];
        expect(
          Object.keys(storedAlice?.[entitySecureAttributesMeta] ?? {}),
        ).toHaveLength(1);
        expect(
          Object.values(storedAlice?.[entitySecureAttributesMeta] ?? {})[0],
        ).toHaveProperty('salt');

        // encryptedVariable.schema8.newPassphrase: the stage asks for a
        // passphrase to be chosen, not for one chosen earlier.
        await interview.next(); // -> Anonymisation (step 1)
        await expect(anon.confirmField()).toBeVisible();
        await expect(anon.chosenEarlierNotice()).toHaveCount(0);
        await anon.fillPassphrase('fresh-phrase');
        await anon.submit();
        await expect(anon.successAlert('chosen')).toBeVisible();
        const header = EncryptionHeaderSchema.parse(
          (await protocol.getNetworkState(interview.interviewId))?.encryption,
        );

        // encryptedVariable.schema8.newAnswerCurrentFormat: a new answer is
        // stored under the header the new passphrase created, with only its
        // IV beside it.
        await interview.next(); // -> NameGeneratorQuickAdd (step 2)
        await expect(anon.prompterButton()).toHaveCount(0);
        await stage.quickAdd.addNode('Bob');
        await expect(page.getByRole('option', { name: 'Bob' })).toBeVisible();
        await expect(page.getByTestId('quick-add-input')).toHaveValue('');
        const after = await protocol.getNetworkState(interview.interviewId);
        expect(EncryptionHeaderSchema.parse(after?.encryption)).toEqual(header);
        expect(after?.nodes).toHaveLength(2);
        expectEncryptedNameOn(after?.nodes[1], 'Bob');

        // encryptedVariable.schema8.oldAnswerStaysUnavailable: the key now in
        // force does not make the old answer readable, and it is left as it
        // was stored.
        expect(after?.nodes[0]).toEqual(storedAlice);
        await page.getByTestId('previous-button').click();
        await expect(anon.successAlert('earlier')).toBeVisible();
        await page.getByTestId('previous-button').click();
        await expect(
          page.getByRole('option', { name: 'Answer unavailable' }),
        ).toBeVisible();
        await expect(page.getByText('Alice')).toHaveCount(0);
        await expect(anon.prompterButton()).toHaveCount(0);
      },
    },
  ],
};
