import { Languages } from 'lucide-react';
import { useId, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import LocaleSelect from '@codaco/fresco-ui/form/fields/LocaleSelect';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useArchitectLocale } from './ArchitectI18nProvider';
import { architectLocales } from './locales';

const messages = defineMessages({
  title: {
    id: 'architect.language.title',
    defaultMessage: 'Language settings',
    description:
      'Heading and accessible name for the app language settings dialog.',
  },
  label: {
    id: 'architect.language.label',
    defaultMessage: 'Architect language',
    description: 'Label of the app interface language selector.',
  },
  automatic: {
    id: 'architect.language.automatic',
    defaultMessage: 'Automatic (browser language)',
    description:
      'Language choice that follows browser preferences instead of a fixed language.',
  },
  hint: {
    id: 'architect.language.hint',
    defaultMessage:
      'Choose the language for Architect on this device. Automatic follows your browser language. This does not change protocol content or the language of an interview preview.',
    description:
      'Explains device persistence, browser negotiation, and separation from protocol content.',
  },
  saved: {
    id: 'architect.language.saved',
    defaultMessage: 'Language saved on this device.',
    description:
      'Announced after the language preference is persisted successfully.',
  },
  failed: {
    id: 'architect.language.failed',
    defaultMessage:
      'Architect is using this language, but could not save the preference on this device. Choose it again on your next visit.',
    description:
      'Announced when browser storage blocks persistence; the local choice still applies.',
  },
});

export default function LanguageSettings() {
  const intl = useAppIntl();
  const controller = useArchitectLocale();
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const id = useId();
  if (controller === null) return null;
  const { preference, setLocale, saved } = controller;
  return (
    <>
      <IconButton
        variant="text"
        color="dynamic"
        size="sm"
        icon={<Languages />}
        aria-label={intl.formatMessage(messages.title)}
        onClick={() => {
          setChanged(false);
          setOpen(true);
        }}
      />
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title={intl.formatMessage(messages.title)}
        footer={
          <Button onClick={() => setOpen(false)}>
            {intl.formatMessage(commonMessages.close)}
          </Button>
        }
      >
        <Paragraph id={`${id}-hint`}>
          {intl.formatMessage(messages.hint)}
        </Paragraph>
        <label className="text-sm font-bold" htmlFor={id}>
          {intl.formatMessage(messages.label)}
        </label>
        <LocaleSelect
          id={id}
          name="architect-language"
          options={architectLocales}
          value={preference}
          automaticLabel={intl.formatMessage(messages.automatic)}
          aria-describedby={`${id}-hint`}
          onChange={(next) => {
            setLocale(next);
            setChanged(true);
          }}
        />
        {changed && saved !== null && (
          <Paragraph role="status">
            {intl.formatMessage(saved ? messages.saved : messages.failed)}
          </Paragraph>
        )}
      </Dialog>
    </>
  );
}
