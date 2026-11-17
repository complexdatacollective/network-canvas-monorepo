import { describe, expect, it } from 'vitest';

import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';

import { asTheEditorShowsIt } from '../../__tests__/support/messages.ts';
import { committedPreview } from '../resources.ts';

// What the editor shows for a resource the protocol names, when this host
// cannot give it one. The protocol builder formats a failure's message in the
// reader's language when it is an encoded reference, and shows it as written
// otherwise — so a plain-English message stays English in every language.
describe('a committed resource the host cannot show', () => {
  const manifest = {
    // A manifest entry whose source carries no content hash: nothing this
    // host stored, as a protocol imported with its files left behind has.
    photo: { type: 'image', name: 'Photo', source: 'photo.png' },
  };

  it('says Studio has no copy, in the reader’s language', () => {
    const outcome = committedPreview(manifest, 'photo');
    if (outcome.status !== 'failed') throw new Error('expected a refusal');

    expect(outcome.failure).toMatchObject({
      reason: 'not-found',
      resourceId: 'photo',
    });
    expect(asTheEditorShowsIt(outcome.failure.message)).toBe(
      'Studio has no copy of this file. Import it again to use it here.',
    );
    const translated = createAppIntl({
      locale: 'en-GB',
      messages: { 'studio.resourceFailure.noCopy': 'Translated: no copy' },
    });
    expect(formatMessageError(outcome.failure.message, translated)).toBe(
      'Translated: no copy',
    );
  });

  it('says the protocol does not hold one it never had', () => {
    const outcome = committedPreview(manifest, 'missing');
    if (outcome.status !== 'failed') throw new Error('expected a refusal');

    expect(asTheEditorShowsIt(outcome.failure.message)).toBe(
      'That file is not part of this protocol.',
    );
  });
});
