import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import {
  getUsesRetiredMapboxToken,
  getUsesTestingMapboxToken,
} from '~/selectors/issues';
const messages = defineMessages({
  revokedMapboxTestingToken: {
    id: 'architect.testingMapboxTokenAlert.revokedMapboxTestingToken',
    defaultMessage: 'Revoked Mapbox testing token',
    description: 'Visible text in components / TestingMapboxTokenAlert.',
  },
  thisProtocolUsesARetiredNetwork: {
    id: 'architect.testingMapboxTokenAlert.thisProtocolUsesARetiredNetwork',
    defaultMessage:
      'This protocol uses a retired Network Canvas Mapbox testing token. It was revoked on 2 September 2026, so maps in Geospatial stages will not load. Replace it with your own token in the Resource Library.',
    description: 'Visible text in components / TestingMapboxTokenAlert.',
  },
  howToGetAMapboxToken: {
    id: 'architect.testingMapboxTokenAlert.howToGetAMapboxToken',
    defaultMessage: 'How to get a Mapbox token',
    description: 'Visible text in components / TestingMapboxTokenAlert.',
  },
  usingATestingMapboxToken: {
    id: 'architect.testingMapboxTokenAlert.usingATestingMapboxToken',
    defaultMessage: 'Using a testing Mapbox token',
    description: 'Visible text in components / TestingMapboxTokenAlert.',
  },
  thisProtocolUsesNetworkCanvasSShared: {
    id: 'architect.testingMapboxTokenAlert.thisProtocolUsesNetworkCanvasSShared',
    defaultMessage:
      "This protocol uses Network Canvas's shared Mapbox testing token so the map renders out of the box. It is rate-limited and for evaluation only. Before you deploy this study, replace it with your own token in the Resource Library.",
    description: 'Visible text in components / TestingMapboxTokenAlert.',
  },
});

const MAPBOX_TOKEN_HELP_URL =
  'https://docs.mapbox.com/help/getting-started/access-tokens/';

const openMapboxTokenHelp = () => {
  window.open(MAPBOX_TOKEN_HELP_URL, '_blank', 'noopener,noreferrer');
};

/**
 * Timeline notice about Network Canvas's shared Mapbox testing token, which is
 * embedded in geospatial templates so the map works out of the box.
 *
 * - Current token: a warning, reminding the researcher to swap in their own
 *   token before fielding the study.
 * - Retired token, revoked in the Mapbox console: an error, because every
 *   Geospatial map in the protocol now fails to load. A protocol carrying both
 *   shows only this one — the broken map is the thing to fix, and replacing
 *   the token clears the reminder as well.
 *
 * Renders nothing for protocols that carry neither.
 */
const TestingMapboxTokenAlert = () => {
  const intl = useAppIntl();
  const usesTestingToken = useSelector(getUsesTestingMapboxToken);
  const usesRetiredToken = useSelector(getUsesRetiredMapboxToken);

  if (usesRetiredToken) {
    return (
      <Alert variant="destructive" className="mx-auto mb-10 max-w-3xl">
        <AlertTitle>
          {intl.formatMessage(messages.revokedMapboxTestingToken)}
        </AlertTitle>
        <AlertDescription className="space-y-4 text-sm">
          <span className="block">
            {intl.formatMessage(messages.thisProtocolUsesARetiredNetwork)}
          </span>
          <Button
            color="destructive"
            size="sm"
            className="[--component-bg:var(--destructive)] [--component-text:oklch(var(--white))]"
            onClick={openMapboxTokenHelp}
          >
            {intl.formatMessage(messages.howToGetAMapboxToken)}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!usesTestingToken) {
    return null;
  }

  return (
    <Alert variant="warning" className="mx-auto mb-10 max-w-3xl">
      <AlertTitle>
        {intl.formatMessage(messages.usingATestingMapboxToken)}
      </AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          {intl.formatMessage(messages.thisProtocolUsesNetworkCanvasSShared)}
        </span>
        <Button
          color="warning"
          size="sm"
          className="[--component-bg:var(--warning)] [--component-text:oklch(var(--white))]"
          onClick={openMapboxTokenHelp}
        >
          {intl.formatMessage(messages.howToGetAMapboxToken)}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default TestingMapboxTokenAlert;
