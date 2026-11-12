'use client';

import Image from 'next/image';
import { type ReactNode, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { UploadThingTokenFormWithoutProvider } from '~/app/(blobs)/(setup)/_components/UploadThingTokenForm';
import FormDialog from '~/components/FormDialog';
import Link from '~/components/Link';

const messages = defineMessages({
  requiredEnvironmentVariableUpdate: {
    id: 'fresco.UploadThingModal.requiredEnvironmentVariableUpdate',
    defaultMessage: 'Required Environment Variable Update',
    description:
      'Title of the dialog shown on the dashboard asking the researcher to supply a new UploadThing API key, which is stored as an environment variable.',
  },
  theFrescoUpdateYouInstalledRequiresA: {
    id: 'fresco.UploadThingModal.theFrescoUpdateYouInstalledRequiresA',
    defaultMessage:
      'The Fresco update you installed requires a new UploadThing API key. Until you add it, you will not be able to upload new protocols. Existing protocols will continue to function.',
    description:
      'Explanatory text under the title of the UploadThing key dialog on the dashboard. Says why a new UploadThing API key is needed after a Fresco update and what stops working until it is added.',
  },
  updatingTheKeyShouldTakeAMatter: {
    id: 'fresco.UploadThingModal.updatingTheKeyShouldTakeAMatter',
    defaultMessage:
      'Updating the key should take a matter of minutes, and can be completed using the following steps:',
    description:
      'Sentence introducing the numbered list of steps in the UploadThing key dialog for getting the new API key. The steps follow directly below it.',
  },
  visitTheUploadThingDashboard: {
    id: 'fresco.UploadThingModal.visitTheUploadThingDashboard',
    defaultMessage: 'Visit the <tag1> UploadThing dashboard </tag1>',
    description:
      "Step 1 in the UploadThing key dialog. The tag1 element is a link that opens the UploadThing website's dashboard in a new tab; keep the tags around the link text.",
  },
  selectYourProject: {
    id: 'fresco.UploadThingModal.selectYourProject',
    defaultMessage: 'Select your project.',
    description:
      "Step 2 in the UploadThing key dialog: choose the researcher's UploadThing project on the UploadThing website.",
  },
  selectTheAPIKeysTab: {
    id: 'fresco.UploadThingModal.selectTheAPIKeysTab',
    defaultMessage: 'Select the API Keys tab.',
    description:
      'Step 3 in the UploadThing key dialog: open the tab named API Keys on the UploadThing website. API Keys is the name of that tab there.',
  },
  ensureYouHaveTheSDKV7Tab: {
    id: 'fresco.UploadThingModal.ensureYouHaveTheSDKV7Tab',
    defaultMessage: 'Ensure you have the <tag1>SDK v7+</tag1> tab selected.',
    description:
      'Step 4 in the UploadThing key dialog: make sure the tab named SDK v7+ is selected on the UploadThing website. The tag1 element makes the tab name bold.',
  },
  copyTheTokenByClickingTheCopy: {
    id: 'fresco.UploadThingModal.copyTheTokenByClickingTheCopy',
    defaultMessage:
      'Copy the token by clicking the Copy button (see screenshot below).',
    description:
      'Step 5 in the UploadThing key dialog: use the Copy button on the UploadThing website to copy the API token. A screenshot of that page follows. Copy names a button there.',
  },
  uploadThingAPIKeyDashboard: {
    id: 'fresco.UploadThingModal.uploadThingAPIKeyDashboard',
    defaultMessage: 'UploadThing API key dashboard',
    description:
      'Alternative text of the screenshot in step 5 of the UploadThing key dialog, which shows the API keys page of the UploadThing website; read only by screen readers.',
  },
  pasteTheTokenIntoTheFieldBelow: {
    id: 'fresco.UploadThingModal.pasteTheTokenIntoTheFieldBelow',
    defaultMessage:
      'Paste the token into the field below and click "save and continue".',
    description:
      'Step 6 in the UploadThing key dialog: paste the copied token into the field below and submit. "save and continue" refers to the submit button, whose label is a separate message.',
  },
});

const renderDashboardLinkChunks = (chunks: ReactNode[]) => (
  <Link href="https://uploadthing.com/dashboard/" target="_blank">
    {chunks}
  </Link>
);

const renderStrongChunks = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

function UploadThingModal() {
  const intl = useAppIntl();

  const [open, setOpen] = useState(true);
  // The store sits above the dialog so the dialog can read the form's
  // submission and stay open while the token is saved.
  return (
    <FormStoreProvider>
      <FormDialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={intl.formatMessage(messages.requiredEnvironmentVariableUpdate)}
        description={intl.formatMessage(
          messages.theFrescoUpdateYouInstalledRequiresA,
        )}
      >
        <Paragraph>
          {intl.formatMessage(messages.updatingTheKeyShouldTakeAMatter)}
        </Paragraph>
        <ol className="ms-4 mt-6 list-inside list-decimal">
          <li>
            {intl.formatMessage(messages.visitTheUploadThingDashboard, {
              tag1: renderDashboardLinkChunks,
            })}
          </li>
          <li>{intl.formatMessage(messages.selectYourProject)}</li>
          <li>{intl.formatMessage(messages.selectTheAPIKeysTab)}</li>
          <li>
            {intl.formatMessage(messages.ensureYouHaveTheSDKV7Tab, {
              tag1: renderStrongChunks,
            })}
          </li>
          <li>
            {intl.formatMessage(messages.copyTheTokenByClickingTheCopy)}
            <Image
              src="/images/uploadthing-key.png"
              width={500}
              height={300}
              alt={intl.formatMessage(messages.uploadThingAPIKeyDashboard)}
              className="w-full"
            />
          </li>
          <li>{intl.formatMessage(messages.pasteTheTokenIntoTheFieldBelow)}</li>
        </ol>
        <UploadThingTokenFormWithoutProvider />
      </FormDialog>
    </FormStoreProvider>
  );
}

export default UploadThingModal;
