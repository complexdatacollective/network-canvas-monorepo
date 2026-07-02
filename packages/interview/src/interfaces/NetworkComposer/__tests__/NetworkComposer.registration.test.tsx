import { describe, expect, it } from 'vitest';

import getInterface from '../../index';
import NetworkComposer from '../NetworkComposer';

describe('NetworkComposer registration', () => {
  it('is returned by getInterface for the NetworkComposer type', () => {
    expect(getInterface('NetworkComposer')).toBe(NetworkComposer);
  });
});
