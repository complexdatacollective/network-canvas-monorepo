import { Languages } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';

import { languageMessages, LanguageSettings } from './LanguageSettings';
import { interviewerLocales } from './locales';

// Reuse the full device preference control inside the shared keyboard/touch
// popover. The home footer has room for this independently of the deck header.
export function LanguageMenu() {
  const intl = useAppIntl();
  const selectedLocale = interviewerLocales.find(
    (entry) => entry.locale === intl.locale,
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="text"
          icon={<Languages aria-hidden size={18} />}
          aria-label={intl.formatMessage(languageMessages.label)}
        >
          <span lang={selectedLocale?.locale ?? intl.locale}>
            {selectedLocale?.label ?? intl.locale}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-sm max-w-(--available-width)">
        <LanguageSettings />
      </PopoverContent>
    </Popover>
  );
}
