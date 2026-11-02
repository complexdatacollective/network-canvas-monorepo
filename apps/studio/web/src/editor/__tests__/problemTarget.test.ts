import { describe, expect, it } from 'vitest';

import { locateProblem } from '../problemTarget.ts';

const stages = [{ id: 'first' }, { id: 'second' }];

describe('where a validation problem is', () => {
  it('names the screen and every field name it could have, most specific first', () => {
    expect(
      locateProblem(['stages', 1, 'prompts', 0, 'text', 'en-US'], stages),
    ).toEqual({
      kind: 'stage',
      stageId: 'second',
      fieldNames: [
        'prompts[0].text.en-US',
        'prompts[0].text',
        'prompts[0]',
        'prompts',
      ],
    });
  });

  it('has no field to name for a problem about the screen as a whole', () => {
    expect(locateProblem(['stages', 0], stages)).toEqual({
      kind: 'stage',
      stageId: 'first',
      fieldNames: [],
    });
  });

  it('leaves a screen the protocol does not have to the outline', () => {
    expect(locateProblem(['stages', 7, 'title'], stages)).toEqual({
      kind: 'outline',
    });
    expect(locateProblem(['stages'], stages)).toEqual({ kind: 'outline' });
    expect(locateProblem([], stages)).toEqual({ kind: 'outline' });
  });

  it('opens the codebook, the assets, or the settings for what is not a screen', () => {
    expect(locateProblem(['codebook', 'node', 'person'], stages)).toEqual({
      kind: 'section',
      section: 'codebook',
    });
    expect(locateProblem(['assetManifest', 'a1'], stages)).toEqual({
      kind: 'section',
      section: 'assets',
    });
    expect(locateProblem(['name'], stages)).toEqual({
      kind: 'section',
      section: 'settings',
    });
  });
});
