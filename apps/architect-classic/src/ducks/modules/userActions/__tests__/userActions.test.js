/* eslint-env jest */

import { actionLocks } from '../userActions';

describe('userActions', () => {
  it('exports actionLocks', () => {
    expect(actionLocks).toEqual(
      expect.objectContaining({
        loading: expect.any(Function),
        protocols: expect.any(Function),
        saving: expect.any(Function),
      }),
    );
  });
});
