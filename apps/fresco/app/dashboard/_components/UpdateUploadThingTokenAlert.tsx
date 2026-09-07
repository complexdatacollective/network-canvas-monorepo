import { defineMessages } from '@codaco/app-i18n/messages';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Link from '~/components/Link';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';
import { getAppSetting } from '~/queries/appSettings';
import { getStorageProvider } from '~/queries/storageProvider';

const messages = defineMessages({
  configurationUpdateRequired: {
    id: 'fresco.UpdateUploadThingTokenAlert.configurationUpdateRequired',
    defaultMessage: 'Configuration update required',
    description:
      'Researcher-facing UpdateUploadThingTokenAlert: Configuration update required',
  },
  youNeedToAddANewUploadThing: {
    id: 'fresco.UpdateUploadThingTokenAlert.youNeedToAddANewUploadThing',
    defaultMessage:
      'You need to add a new UploadThing API key before you can upload protocols. See the <tag1> upgrade documentation </tag1> for more information.',
    description:
      'Researcher-facing UpdateUploadThingTokenAlert: You need to add a new UploadThing API key before you can upload protocols. See the  upgrade documentation  for more info',
  },
});

export default async function UpdateUploadThingTokenAlert() {
  const intl = await getServerIntl();

  const storageProvider = await getStorageProvider();
  if (storageProvider === 's3') return null;

  const uploadThingToken =
    env.UPLOADTHING_TOKEN ?? (await getAppSetting('uploadThingToken'));
  if (uploadThingToken) return null;

  return (
    <Alert variant="destructive">
      <AlertTitle>
        {intl.formatMessage(messages.configurationUpdateRequired)}
      </AlertTitle>
      <AlertDescription>
        {intl.formatMessage(messages.youNeedToAddANewUploadThing, {
          tag1: (chunks) => (
            <Link
              href="https://documentation.networkcanvas.com/en/fresco/deployment/upgrading#uploadthing-variable-update"
              target="_blank"
            >
              {chunks}
            </Link>
          ),
        })}
      </AlertDescription>
    </Alert>
  );
}
