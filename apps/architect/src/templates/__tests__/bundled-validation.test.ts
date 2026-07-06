import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { BUNDLED_TEMPLATES } from '~/templates';
import { developmentProtocol } from '~/templates/development-protocol';
import { sampleProtocol } from '~/templates/sample-protocol';

// Architect opens these via `openBundledTemplate`, which deliberately skips the
// migration step (bundled protocols are assumed to already be at the current
// schema version). A protocol that drifts from the schema therefore fails the
// "Protocol Validation Failed" dialog before reaching the editor, so this test
// guards every bundled protocol against the live schema.
const bundledProtocols: { name: string; protocol: CurrentProtocol }[] = [
  { name: 'Sample Protocol', protocol: sampleProtocol },
  { name: 'Development Protocol', protocol: developmentProtocol },
  ...BUNDLED_TEMPLATES.map((template) => ({
    name: template.name,
    protocol: template.protocol,
  })),
];

describe('bundled protocols validate against the current schema', () => {
  for (const { name, protocol } of bundledProtocols) {
    it(`${name} passes validateProtocol`, async () => {
      const result = await validateProtocol(protocol);
      const issues = result.success
        ? []
        : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      expect(issues).toStrictEqual([]);
    });
  }
});
