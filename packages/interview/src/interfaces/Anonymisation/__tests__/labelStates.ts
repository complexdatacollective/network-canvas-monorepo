import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import {
  makeEncryptedPerson,
  makePlainPerson,
  NODE_TYPE,
} from './encryptionFixtures';

export const LABEL_PASSPHRASE = 'pw';

/**
 * Each state a node's label can be in, with the label the node shows in it.
 * Anything that names a person must name them by that same label, so tests
 * of announcements and accessible names run through every one.
 */
export type LabelState = {
  state: string;
  /** The label the node shows in this state. */
  shows: string;
  /** The passphrase in force, if any. */
  passphrase?: string;
  /** Whether every decryption stays under way, so the label is decrypting. */
  holdDecryption?: boolean;
  makeNode: (id: string) => Promise<NcNode>;
};

export const labelStates: LabelState[] = [
  {
    state: 'a plain name',
    shows: 'Alice',
    makeNode: (id) => Promise.resolve(makePlainPerson(id, 'Alice')),
  },
  {
    state: 'no name, shown as its type',
    shows: 'Person',
    makeNode: (id) =>
      Promise.resolve({
        [entityPrimaryKeyProperty]: id,
        type: NODE_TYPE,
        [entityAttributesProperty]: { age: 40 },
      }),
  },
  {
    state: 'an encrypted name while locked',
    shows: '🔒',
    makeNode: (id) => makeEncryptedPerson(id, 'Alice', LABEL_PASSPHRASE),
  },
  {
    state: 'an encrypted name while it decrypts',
    shows: '🔒',
    passphrase: LABEL_PASSPHRASE,
    holdDecryption: true,
    makeNode: (id) => makeEncryptedPerson(id, 'Alice', LABEL_PASSPHRASE),
  },
  {
    state: 'an encrypted name once decrypted',
    shows: 'Alice',
    passphrase: LABEL_PASSPHRASE,
    makeNode: (id) => makeEncryptedPerson(id, 'Alice', LABEL_PASSPHRASE),
  },
  {
    state: 'an encrypted name that cannot be read',
    shows: '⚠️',
    passphrase: 'wrong',
    makeNode: (id) => makeEncryptedPerson(id, 'Alice', LABEL_PASSPHRASE),
  },
];

/** The text of every live region on the page. */
export const liveRegionTexts = () =>
  [...document.querySelectorAll('[aria-live]')].map(
    (region) => region.textContent ?? '',
  );
