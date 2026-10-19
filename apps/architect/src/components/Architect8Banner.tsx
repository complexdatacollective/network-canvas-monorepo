import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import { useAppSelector } from '~/ducks/hooks';
import {
  getActiveProtocolId,
  getProtocolOwnedHere,
  getStorageUnavailable,
} from '~/ducks/modules/app';
import { useNavigateToArchitect9 } from '~/hooks/useNavigateToArchitect9';
import { isProtocolPath } from '~/hooks/useProtocolNavGuard';
import { getProtocol } from '~/selectors/protocol';
import { IS_SUBPATH_BUILD } from '~/utils/appBase';
import { architect9UpgradeUrl } from '~/utils/architect9Handoff';

const messages = defineMessages({
  thisIsArchitect8: {
    id: 'architect.architect8Banner.thisIsArchitect8',
    defaultMessage:
      'This is Architect 8, for schema 8 protocols. Upgrading this protocol creates a schema 9 copy of it in Architect 9 and leaves the original unchanged.',
    description:
      'Banner across the protocol editor when the previous Architect release runs inside the current one. "Schema 8" and "schema 9" are protocol format versions.',
  },
  upgradeToSchema9: {
    id: 'architect.architect8Banner.upgradeToSchema9',
    defaultMessage: 'Upgrade to schema 9',
    description:
      'Button in the Architect 8 banner that opens the current Architect to upgrade a copy of the open protocol to protocol format version 9.',
  },
});

// A slim strip across the protocol editor, shown only by the Architect 8 build
// served inside Architect 9 (at /v8/), so a researcher always knows which
// Architect they are in and has a way to the newer one.
//
// The action refuses, rather than hides, when the tab does not hold the saved
// copy: Architect 9 upgrades the library row, which a read-only tab (the
// protocol is open in another tab, as ProtocolLockBanner explains just below)
// or a tab that could not save at all does not have on screen.
const Architect8BannerStrip = () => {
  const intl = useAppIntl();
  const [location] = useLocation();
  const protocolId = useAppSelector(getActiveProtocolId);
  const schemaVersion = useAppSelector(
    (state) => getProtocol(state)?.schemaVersion,
  );
  const ownedHere = useAppSelector(getProtocolOwnedHere);
  const storageUnavailable = useAppSelector(getStorageUnavailable);
  const navigateToArchitect9 = useNavigateToArchitect9();

  if (
    !isProtocolPath(location) ||
    protocolId === null ||
    schemaVersion === undefined ||
    schemaVersion >= 9
  ) {
    return null;
  }

  return (
    <Alert
      variant="info"
      density="compact"
      className="border-outline my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-7 py-2.5 shadow-none!"
    >
      <AlertDescription className="flex items-center justify-between gap-5 text-sm">
        <span>{intl.formatMessage(messages.thisIsArchitect8)}</span>
        <Button
          size="sm"
          className="shrink-0"
          disabled={!ownedHere || storageUnavailable}
          onClick={() =>
            void navigateToArchitect9(architect9UpgradeUrl(protocolId), {
              requireSavedProtocol: true,
            })
          }
        >
          {intl.formatMessage(messages.upgradeToSchema9)}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

const Architect8Banner = () =>
  IS_SUBPATH_BUILD ? <Architect8BannerStrip /> : null;

export default Architect8Banner;
