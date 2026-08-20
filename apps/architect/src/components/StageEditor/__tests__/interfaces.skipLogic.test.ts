import { describe, expect, it } from 'vitest';

import { INTERFACE_TYPES } from '~/components/Screens/NewStageScreen/interfaceOptions';

import { interfaceHasSkipLogicSection } from '../Interfaces';

describe('SkipLogic section coverage', () => {
  it('gives Anonymisation the SkipLogic section', () => {
    // Anonymisation used to be the ONE interface without it, which made the
    // overwrite save silently delete a committed, schema-valid `skipLogic`
    // key the editor never showed. The maintainer chose the section over
    // tightening the schema; `withStageIdentity`'s carry-through remains as
    // the backstop for any interface that omits it, but Anonymisation itself
    // must render the real control.
    expect(interfaceHasSkipLogicSection('Anonymisation')).toBe(true);
  });

  it('every creatable interface renders SkipLogic, so the save backstop is dormant', () => {
    // Not a law of nature — a future interface may legitimately omit skip
    // logic, and the carry-through in StageEditor keeps its saved key intact.
    // This exists so that omission is a CONSCIOUS choice: whoever removes the
    // section from an interface must come here and exempt it, having read the
    // above.
    const missing = INTERFACE_TYPES.map(({ type }) => type).filter(
      (type) => !interfaceHasSkipLogicSection(type),
    );
    expect(missing).toEqual([]);
  });
});
