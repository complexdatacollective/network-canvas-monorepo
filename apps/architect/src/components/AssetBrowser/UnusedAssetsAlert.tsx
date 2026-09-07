import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { getUnusedAssets } from '~/selectors/issues';
const messages = defineMessages({
  unused: {
    id: 'architect.assetBrowser.unusedAssetsAlert.unused',
    defaultMessage:
      '{count, plural, one {# unused resource} other {# unused resources}}',
    description:
      'Visible text in components / AssetBrowser / UnusedAssetsAlert.',
  },
  notUsedByAnyStage: {
    id: 'architect.assetBrowser.unusedAssetsAlert.notUsedByAnyStage',
    defaultMessage:
      '{count, plural, one {This resource is not used by any stage in your protocol and is marked <strong>Unused</strong> below. Reference it in a stage, or remove it to keep your protocol tidy.} other {These resources are not used by any stage in your protocol and are marked <strong>Unused</strong> below. Reference them in a stage, or remove them to keep your protocol tidy.}}',
    description:
      'Visible text in components / AssetBrowser / UnusedAssetsAlert.',
  },
});

/**
 * Page-level warning shown in the Resource Library when the protocol contains
 * resources that aren't referenced by any stage. Renders nothing when every
 * resource is in use.
 */
const UnusedAssetsAlert = () => {
  const intl = useAppIntl();
  const { count } = useSelector(getUnusedAssets);

  if (count === 0) {
    return null;
  }

  return (
    <Alert variant="warning">
      <AlertTitle>
        {intl.formatMessage(messages.unused, {
          count: count,
        })}
      </AlertTitle>
      <AlertDescription>
        {intl.formatMessage(messages.notUsedByAnyStage, {
          count,

          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </AlertDescription>
    </Alert>
  );
};

export default UnusedAssetsAlert;
