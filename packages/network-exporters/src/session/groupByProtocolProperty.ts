import { groupBy } from 'es-toolkit';

import { protocolProperty } from '@codaco/shared-consts';

import type { FormattedSession } from '../input';

export default function groupByProtocolProperty<S extends FormattedSession>(
  sessions: S[],
): Record<string, S[]> {
  return groupBy(sessions, (s) => s.sessionVariables[protocolProperty]);
}
