import { z } from 'zod';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { AnonymisationFixture } from '../fixtures/anonymisation-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

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

        await expect(anon.successAlert()).toBeVisible();
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

        // A valid, matching passphrase releases the gate: the stage becomes
        // ready and advancement succeeds. Ending on the closing Information
        // stage keeps the final aria snapshot off the animated background.
        await anon.fillPassphrase('matching-passphrase');
        await anon.submit();
        await expect(anon.successAlert()).toBeVisible();
        expect(await interview.nextButtonHasPulse()).toBe(true);
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'min-max-length-validation',
      covers: ['validation.minLength', 'validation.maxLength'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Introduction',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase between 8 and 20 characters.',
          },
          validation: { minLength: 8, maxLength: 20 },
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

        await anon.fillPassphrase('short');
        await anon.submit();
        await expect(anon.passphraseError()).toContainText(
          /enter at least 8 characters/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);

        await anon.fillPassphrase('this passphrase is far too long');
        await anon.submit();
        await expect(anon.passphraseError()).toContainText(
          /enter fewer than 20 characters/i,
        );
        await expect(anon.successAlert()).toHaveCount(0);

        await anon.fillPassphrase('just right!');
        await anon.submit();
        await expect(anon.successAlert()).toBeVisible();

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
        await expect(anon.successAlert()).toBeVisible();

        await interview.next(); // Anonymisation -> Complete
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();

        // passphrase.persistOnRevisit: navigating back re-enters the stage in
        // its success state (ui.passphrase persisted; the form is NOT re-shown).
        await page.getByTestId('previous-button').click();
        await expect(anon.successAlert()).toBeVisible();
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
      covers: ['experiments.encryptedVariables=true+encryptedVariable'],
      visual: true,
      slow: true,
      captureMask: (page) => [page.locator('.transform-3d')],
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
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
        await expect(anon.successAlert()).toBeVisible();
        await interview.next(); // Anonymisation -> NameGeneratorQuickAdd

        await stage.quickAdd.addNode('Alice');
        // Visible label still decrypts for display (useNodeLabel).
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const node = network!.nodes[0]!;
        const attrs = node[entityAttributesProperty];
        const nameVarId = Object.keys(attrs)[0]!;
        // Ciphertext is a number[], never the plaintext string.
        expect(Array.isArray(attrs[nameVarId])).toBe(true);
        expect(attrs[nameVarId]).not.toBe('Alice');

        // Encrypted values move into _secureAttributes (not part of NcNode's
        // public type) — narrow via schema parse instead of a type assertion.
        const SecureNodeSchema = z.object({
          _secureAttributes: z.record(
            z.string(),
            z.object({
              iv: z.array(z.number()).length(12),
              salt: z.array(z.number()).length(16),
            }),
          ),
        });
        const { _secureAttributes } = SecureNodeSchema.parse(node);
        expect(_secureAttributes[nameVarId]).toBeDefined();
      },
    },

    {
      id: 'encrypted-off-not-decrypted',
      covers: ['experiments.encryptedVariables=absent'],
      // With the experiment off, useEncryption short-circuits to false, so the
      // write is plaintext (no PBKDF2) — a fast round-trip, not crypto-heavy.
      build: () => {
        const synth = new SyntheticInterview();
        // setExperiments is never called: getShouldEncryptNames stays false,
        // so the decrypt path in useNodeAttributes is disabled.
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
        generator.addPrompt({ text: 'Add a person' });
        synth.addInformationStage({
          title: 'Complete',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, protocol }) => {
        const anon = new AnonymisationFixture(page);
        await interview.next(); // Introduction -> Anonymisation

        await anon.fillPassphrase('unused-phrase');
        await anon.submit();
        await expect(anon.successAlert()).toBeVisible();
        await interview.next(); // Anonymisation -> NameGeneratorQuickAdd

        await page.getByTestId('quick-add-toggle').click();
        await page.getByTestId('quick-add-input').fill('Alice');
        await page.getByTestId('quick-add-input').press('Enter');

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.nodes
                .length ?? 0,
          )
          .toBe(1);

        // experiments.encryptedVariables=absent is the master switch: with it
        // off, NameGenerator's useEncryption short-circuits to false so the name
        // is written as plaintext, and useNodeAttributes likewise skips
        // decryption. The two paths are aligned, so the label renders the stored
        // plaintext directly — 'Alice' is visible, not undecryptable ciphertext.
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        const node = network!.nodes[0]!;
        const attrs = node[entityAttributesProperty];
        const nameVarId = Object.keys(attrs)[0]!;
        // Stored as plaintext, not ciphertext: a plain string value and no
        // secure-attribute metadata (contrast encrypted-downstream-write, which
        // stores an array + entitySecureAttributesMeta with the experiment on).
        expect(attrs[nameVarId]).toBe('Alice');
        expect(node[entitySecureAttributesMeta]).toBeUndefined();

        // End on the background-free closing Information stage.
        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Complete' }),
        ).toBeVisible();
      },
    },

    {
      id: 'missing-and-wrong-passphrase-prompter',
      covers: [
        'encryptedVariable.missingPassphrase.prompter',
        'encryptedVariable.wrongPassphrase.invalid',
      ],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
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

        // Set a passphrase live and add a node, so the node's ciphertext is
        // valid for the passphrase entered in this run (no seedNetwork — a
        // pre-seeded node has no real secure attributes to decrypt).
        await anon.fillPassphrase('first-phrase');
        await anon.submit();
        await expect(anon.successAlert()).toBeVisible();
        await interview.next(); // -> NameGeneratorQuickAdd (step 2)

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        // Simulate a resumed session: clear the in-memory passphrase while the
        // already-encrypted node stays in the shared graph. (A page reload
        // cannot stand in here — the e2e host's onSync is a no-op, so a reload
        // drops the live-added node rather than persisting it. Clearing
        // ui.passphrase in the live store reproduces the same "encrypted node,
        // no passphrase" state. The expression is passed as a string so the
        // store's untyped `dispatch` is never referenced from typed code.)
        await page.evaluate(
          "window.__interviewStore.dispatch({ type: 'ui/setPassphrase', payload: '' })",
        );

        // encryptedVariable.missingPassphrase.prompter
        await expect.poll(() => stage.quickAdd.isDisabled()).toBe(true);
        await expect(anon.prompterButton()).toBeVisible();
        await expect(anon.prompterButton()).toContainText('🔑');

        // encryptedVariable.wrongPassphrase.invalid: a wrong passphrase yields
        // the decrypt-failure fallback (useNodeAttributes.tsx:92) and flips the
        // prompter to the ⚠️ invalid state (distinct from the missing '🔒' path).
        await anon.openPrompter();
        await anon.submitPrompterPassphrase('wrong-phrase');
        await expect(page.getByRole('option', { name: '⚠️' })).toBeVisible();
        await expect(anon.prompterButton()).toContainText('⚠️');

        // The correct passphrase restores the decrypted label.
        await anon.openPrompter();
        await anon.submitPrompterPassphrase('first-phrase');
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
      },
    },
  ],
};
