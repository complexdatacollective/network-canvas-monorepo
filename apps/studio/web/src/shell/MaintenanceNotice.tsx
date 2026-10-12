import { useQueryClient, type Query } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';

import { refusalOf } from '../runtime/errors.ts';

const messages = defineMessages({
  maintenance: {
    id: 'studio.maintenance.notice',
    defaultMessage:
      'Studio is down for maintenance. This page will carry on by itself once Studio is back.',
    description:
      'Shown above every screen while the server refuses requests because it is down for maintenance.',
  },
});

const refusedForMaintenance = (query: Query): boolean =>
  query.isActive() &&
  refusalOf(query.state.fetchFailureReason ?? query.state.error)?.kind ===
    'maintenance';

function useMaintenanceRefusal(): boolean {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onChange: () => void) => cache.subscribe(onChange),
    [cache],
  );
  return useSyncExternalStore(subscribe, () =>
    cache.getAll().some(refusedForMaintenance),
  );
}

export default function MaintenanceNotice({
  className = 'm-0 rounded-none',
}: {
  className?: string;
}) {
  const intl = useAppIntl();
  const refused = useMaintenanceRefusal();
  if (!refused) return null;
  return (
    <Alert variant="warning" density="compact" className={className}>
      {intl.formatMessage(messages.maintenance)}
    </Alert>
  );
}
