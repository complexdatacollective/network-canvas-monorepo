import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import Link from '~/components/Link';
import { getServerIntl } from '~/i18n/server';
import { getAppSetting } from '~/queries/appSettings';

const messages = defineMessages({
  pleaseNote: {
    id: 'fresco.protocols.AnonymousRecruitmentWarning.pleaseNote',
    defaultMessage: 'Please Note',
    description:
      'Title of an information box on the dashboard overview, shown only while the anonymous recruitment setting is switched on.',
  },
  anonymousRecruitmentIsEnabledThisMeansThat: {
    id: 'fresco.protocols.AnonymousRecruitmentWarning.anonymousRecruitmentIsEnabledThisMeansThat',
    defaultMessage:
      'Anonymous recruitment is enabled. This means that participants can self-enroll in your study without needing to be invited, by visiting the protocol-specific onboarding link. To disable anonymous recruitment, visit <tag1>the settings page</tag1>.',
    description:
      "Text of the information box shown while anonymous recruitment is on: anyone with a protocol's onboarding link can start an interview without an invitation. tag1 wraps a link to the Settings page.",
  },
});

const renderSettingsLinkChunks = (chunks: ReactNode[]) => (
  <Link href="/dashboard/settings">{chunks}</Link>
);

export default async function AnonymousRecruitmentWarning() {
  const intl = await getServerIntl();

  const allowAnonymousRecruitment = await getAppSetting(
    'allowAnonymousRecruitment',
  );

  if (!allowAnonymousRecruitment) return null;

  return (
    <ResponsiveContainer maxWidth="3xl">
      <Alert variant="info" className="m-0">
        <AlertTitle>{intl.formatMessage(messages.pleaseNote)}</AlertTitle>
        <AlertDescription>
          {intl.formatMessage(
            messages.anonymousRecruitmentIsEnabledThisMeansThat,
            {
              tag1: renderSettingsLinkChunks,
            },
          )}
        </AlertDescription>
      </Alert>
    </ResponsiveContainer>
  );
}
