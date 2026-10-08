import { describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  createEncryptionStore,
  encryptionFor,
  NODE_TYPE,
  outOfBoundsHeader,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { addNode } from '../../store/modules/session';
import {
  rejectedWriteMessage,
  writeSubmissionResult,
} from '../writeSubmissionResult';

async function storeWith({ refused }: { refused: boolean }) {
  const { header } = await encryptionFor('pw');
  return createEncryptionStore([], undefined, undefined, {
    header: refused ? outOfBoundsHeader(header) : header,
  });
}

const addProtectedPerson = (store: Awaited<ReturnType<typeof storeWith>>) =>
  store.dispatch(
    addNode({
      type: NODE_TYPE,
      attributeData: { name: 'Alice' },
      useEncryption: true,
      currentStep: 0,
    }),
  );

describe('the reason a protected answer was not saved', () => {
  it('asks for the passphrase while one could still be entered', async () => {
    const store = await storeWith({ refused: false });

    expect(writeSubmissionResult(await addProtectedPerson(store))).toEqual({
      success: false,
      formErrors: [
        createMessageError(runtimeMessages.protectedAnswersNotSaved),
      ],
    });
    await expect(addProtectedPerson(store).unwrap()).rejects.toSatisfy(
      (error) =>
        rejectedWriteMessage(error) ===
        runtimeMessages.protectedAnswersNotSaved,
    );
  });

  it('says protected answers cannot be saved, never asking for a passphrase, when none can open the interview', async () => {
    const store = await storeWith({ refused: true });

    expect(writeSubmissionResult(await addProtectedPerson(store))).toEqual({
      success: false,
      formErrors: [
        createMessageError(runtimeMessages.protectedAnswersUnavailable),
      ],
    });
    await expect(addProtectedPerson(store).unwrap()).rejects.toSatisfy(
      (error) =>
        rejectedWriteMessage(error) ===
        runtimeMessages.protectedAnswersUnavailable,
    );
    expect(store.getState().session.network.nodes).toEqual([]);
  });
});
