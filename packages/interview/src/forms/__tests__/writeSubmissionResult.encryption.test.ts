import { describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  createEncryptionStore,
  NODE_TYPE,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import { addNode } from '../../store/modules/session';
import {
  rejectedWriteMessage,
  writeSubmissionResult,
} from '../writeSubmissionResult';

const addProtectedPerson = (store: ReturnType<typeof createEncryptionStore>) =>
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
    const store = createEncryptionStore([]);

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
});
