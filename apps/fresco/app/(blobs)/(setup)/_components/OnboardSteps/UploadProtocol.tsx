'use client';
import { parseAsInteger, useQueryState } from 'nuqs';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ProtocolImportDropzone from '~/components/ProtocolImport/ProtocolImportDropzone';
import { useProtocolImport } from '~/hooks/useProtocolImport';

const messages = defineMessages({
  importProtocols: {
    id: 'fresco.OnboardSteps.UploadProtocol.importProtocols',
    defaultMessage: 'Import Protocols',
    description:
      'Researcher-facing OnboardSteps / UploadProtocol: Import Protocols',
  },
  ifYouHaveAlreadyCreatedANetwork: {
    id: 'fresco.OnboardSteps.UploadProtocol.ifYouHaveAlreadyCreatedANetwork',
    defaultMessage:
      'If you have already created a Network Canvas protocol ( <tag1>.netcanvas</tag1>) you can import it now.',
    description:
      'Researcher-facing OnboardSteps / UploadProtocol: If you have already created a Network Canvas protocol ( .netcanvas) you can import it now.',
  },
  ifYouDonAposTHaveA: {
    id: 'fresco.OnboardSteps.UploadProtocol.ifYouDonAposTHaveA',
    defaultMessage:
      "If you don't have a protocol yet, you can upload one later from the dashboard.",
    description:
      "Researcher-facing OnboardSteps / UploadProtocol: If you don't have a protocol yet, you can upload one later from the dashboard.",
  },
});

function ConfigureStudy() {
  const intl = useAppIntl();

  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(1),
  );

  const { importProtocols } = useProtocolImport();

  const handleNextStep = () => {
    void setCurrentStep(currentStep + 1);
  };

  return (
    <div className="flex w-full flex-col items-stretch justify-between">
      <Heading level="h2">
        {intl.formatMessage(messages.importProtocols)}
      </Heading>
      <Paragraph>
        {intl.formatMessage(messages.ifYouHaveAlreadyCreatedANetwork, {
          tag1: (chunks) => <code>{chunks}</code>,
        })}
      </Paragraph>
      <Paragraph>{intl.formatMessage(messages.ifYouDonAposTHaveA)}</Paragraph>
      <ProtocolImportDropzone onFilesAccepted={importProtocols} />
      <div className="mt-6 flex justify-end">
        <Button onClick={handleNextStep} color="primary">
          {intl.formatMessage(commonMessages.continue)}
        </Button>
      </div>
    </div>
  );
}

export default ConfigureStudy;
