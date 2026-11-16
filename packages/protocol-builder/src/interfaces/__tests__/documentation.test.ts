import { describe, expect, it } from 'vitest';

import { stageTypeDocumentationUrl } from '../documentation.ts';

describe('the documentation a stage editor links to', () => {
  /**
   * The documentation site files some interfaces under a name that is not
   * their stage type, so the page address comes from the slug table rather
   * than from the type.
   */
  it('links an interface to the page the documentation files it under', () => {
    expect(stageTypeDocumentationUrl('AlterForm')).toMatch(
      /\/design-protocols\/interface-documentation\/per-alter-form\/$/,
    );
    expect(stageTypeDocumentationUrl('FinishSession')).toMatch(
      /\/design-protocols\/interface-documentation\/finish-screen\/$/,
    );
  });
});
