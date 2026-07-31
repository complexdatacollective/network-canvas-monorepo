import { createAction } from '@reduxjs/toolkit';

import type { CurrentProtocol } from '@codaco/protocol-validation';

export type AcceptedProtocolCommit = {
  id: string;
  protocol: CurrentProtocol;
  persistenceAllowed: boolean;
};

// Validation is the admission boundary for canonical protocol storage. The
// library listener persists only this action, never arbitrary timeline edits.
export const protocolCommitAccepted = createAction<AcceptedProtocolCommit>(
  'protocolCommit/accepted',
);
