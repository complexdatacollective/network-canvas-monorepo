/* eslint-disable import/prefer-default-export */

import testState from './testState.json' with { type: 'json' };

export const getMockState = (mergeProps?: Record<string, unknown>) => ({
  ...testState,
  ...mergeProps,
});
