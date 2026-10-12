import { createLogger } from 'redux-logger';

import type { SecretRedactors } from '../redactSecrets';

const isTest = import.meta.env?.MODE === 'test';

export const createLoggerMiddleware = ({
  redactAction,
  redactState,
}: SecretRedactors) =>
  createLogger({
    level: 'info',
    collapsed: true,
    logger: console,
    predicate: () => !isTest,
    actionTransformer: redactAction,
    stateTransformer: redactState,
  });
