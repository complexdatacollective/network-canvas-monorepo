import { createLogger } from 'redux-logger';

import type { EncryptedValueRedaction } from '../redactEncryptedValues';

export const createInterviewLogger = (redaction: EncryptedValueRedaction) =>
  createLogger({
    level: 'info',
    collapsed: true,
    logger: console,
    predicate: () => import.meta.env?.MODE !== 'test',
    actionTransformer: redaction.action,
    stateTransformer: redaction.state,
  });
