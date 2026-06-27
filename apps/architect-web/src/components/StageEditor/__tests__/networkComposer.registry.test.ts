import { describe, expect, it } from 'vitest';

import { INTERFACE_TYPES } from '../../Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '../Interfaces';

describe('NetworkComposer registry', () => {
  it('has an editor config with sections', () => {
    const config = getInterface('NetworkComposer');
    expect(config.sections.length).toBeGreaterThan(0);
    expect(config.documentation).toContain('http');
  });

  it('appears in the stage-type picker as a Sociograms entry', () => {
    const entry = INTERFACE_TYPES.find((i) => i.type === 'NetworkComposer');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sociograms');
  });
});
