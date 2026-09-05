'use client';

import { FileDown } from 'lucide-react';
import { useCallback, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button, type ButtonProps } from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';

import ProtocolImportDropzone from './ProtocolImportDropzone';

const messages = defineMessages({
  importProtocols: {
    id: 'fresco.ProtocolImport.ProtocolImportPopover.importProtocols',
    defaultMessage: 'Import protocols',
    description:
      'Researcher-facing ProtocolImport / ProtocolImportPopover: Import protocols',
  },
});

type ProtocolImportPopoverProps = {
  onFilesAccepted: (files: File[]) => void;
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  buttonDisabled?: boolean;
  className?: string;
};

export default function ProtocolImportPopover({
  onFilesAccepted,
  buttonVariant,
  buttonSize,
  buttonDisabled,
  className,
}: ProtocolImportPopoverProps) {
  const intl = useAppIntl();

  const [open, setOpen] = useState(false);

  const handleFilesAccepted = useCallback(
    (files: File[]) => {
      setOpen(false);
      onFilesAccepted(files);
    },
    [onFilesAccepted],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          disabled={buttonDisabled}
          variant={buttonVariant}
          size={buttonSize}
          className={className}
          icon={<FileDown />}
        >
          {intl.formatMessage(messages.importProtocols)}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={intl.formatMessage(messages.importProtocols)}
        align="end"
        className="w-full max-w-md"
      >
        <ProtocolImportDropzone onFilesAccepted={handleFilesAccepted} />
      </PopoverContent>
    </Popover>
  );
}
