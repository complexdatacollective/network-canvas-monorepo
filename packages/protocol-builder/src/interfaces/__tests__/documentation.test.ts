import { describe, expect, it } from 'vitest';

import {
  DOCS_BASE_URL,
  interfaceDocumentationUrl,
  protocolAuthoringLinks,
} from '../documentation.ts';

/**
 * Where every host sends a researcher for help.
 *
 * The addresses live in this package because protocol authoring is what the
 * documentation is about — the rule editor links to two of them itself — and a
 * host that restated one would be free to drift from what the package's own
 * sections link to. These assertions are what makes that single copy real.
 */
describe('the documentation a stage editor links to', () => {
  it('addresses the documentation site', () => {
    expect(DOCS_BASE_URL).toBe('https://documentation.networkcanvas.com/en');
  });

  it('links skip logic and network filtering to their key-concept pages', () => {
    expect(protocolAuthoringLinks.skipLogic).toBe(
      'https://documentation.networkcanvas.com/en/design-protocols/key-concepts/skip-logic/',
    );
    expect(protocolAuthoringLinks.networkFiltering).toBe(
      'https://documentation.networkcanvas.com/en/design-protocols/key-concepts/network-filtering/',
    );
  });

  it('builds an interface page address from its slug', () => {
    expect(interfaceDocumentationUrl('geospatial')).toBe(
      'https://documentation.networkcanvas.com/en/design-protocols/interface-documentation/geospatial/',
    );
  });
});
