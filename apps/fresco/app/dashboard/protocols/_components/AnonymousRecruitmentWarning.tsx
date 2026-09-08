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
      'Researcher-facing protocols / AnonymousRecruitmentWarning: Please Note',
  },
  anonymousRecruitmentIsEnabledThisMeansThat: {
    id: 'fresco.protocols.AnonymousRecruitmentWarning.anonymousRecruitmentIsEnabledThisMeansThat',
    defaultMessage:
      'Anonymous recruitment is enabled. This means that participants can self-enroll in your study without needing to be invited, by visiting the protocol-specific onboarding link. To disable anonymous recruitment, visit <tag1>the settings page</tag1>.',
    description:
      'Researcher-facing protocols / AnonymousRecruitmentWarning: Anonymous recruitment is enabled. This means that participants can self-enroll in your study without needing to be invit',
  },
});

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
              tag1: (chunks) => (
                <Link href="/dashboard/settings">{chunks}</Link>
              ),
            },
          )}
        </AlertDescription>
      </Alert>
    </ResponsiveContainer>
  );
}
