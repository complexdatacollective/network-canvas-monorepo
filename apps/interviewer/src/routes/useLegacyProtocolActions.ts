import { useCallback, useMemo, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { showLegacyProtocolInfo } from '~/components/legacyProtocolDialogs';
import type { Schema8CardActions } from '~/components/ProtocolCarousel/DeckSlotCard';
import type { ProtocolWithCounts } from '~/lib/db/types';
import { getBundledLegacyInterviewer } from '~/lib/legacyInterviewer';

// What Home does with schema 8 protocols beyond what it does with any
// protocol: show a stored one's details. A schema 8 protocol is never
// upgraded, at import or later. Starting, resuming and deleting are the same
// as for any protocol.
export function useLegacyProtocolActions() {
  const { openDialog } = useDialog();
  // Read once: the define is an object literal, new on every read.
  const [interviewer] = useState(getBundledLegacyInterviewer);

  const onShowInfo = useCallback(
    (protocol: ProtocolWithCounts) => {
      void showLegacyProtocolInfo(openDialog, protocol);
    },
    [openDialog],
  );

  const schema8 = useMemo<Schema8CardActions>(
    () => ({
      interviewer,
      onShowInfo,
    }),
    [interviewer, onShowInfo],
  );

  return { schema8 };
}
