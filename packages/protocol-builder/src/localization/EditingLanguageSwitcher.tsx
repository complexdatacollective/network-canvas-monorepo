import { ChevronDown, Languages } from 'lucide-react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { languageMessages, useLanguageName } from './languageNames.ts';
import { localeDirection, missingLocales } from './localizedText.ts';
import { useEditingLanguage } from './ProtocolLocalization.tsx';

export type EditingLanguageSwitcherProps = Readonly<{
  /** The localized string being edited, so each language can say whether it is translated. */
  value: unknown;
  disabled?: boolean;
  className?: string;
}>;

/**
 * Chooses which of the protocol's languages the editor is writing in.
 *
 * Every localized field draws one beside its control and they all move
 * together, so the menu doubles as the field's record of which languages its
 * text still has to be translated into. A protocol written in one language has
 * nothing to choose between, and draws nothing.
 */
export function EditingLanguageSwitcher({
  value,
  disabled = false,
  className,
}: EditingLanguageSwitcherProps) {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { localization, locale, setLocale } = useEditingLanguage();

  if (
    localization === undefined ||
    locale === undefined ||
    localization.locales.length < 2
  ) {
    return null;
  }

  const missing = new Set(missingLocales(value, localization));

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              size="sm"
              variant="text"
              icon={<Languages aria-hidden="true" />}
            />
          }
        >
          <span className="sr-only">
            {intl.formatMessage(languageMessages.editingLanguage)}
          </span>
          <span lang={locale} dir={localeDirection(locale)}>
            {languageName(locale)}
          </span>
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            aria-label={intl.formatMessage(languageMessages.editingLanguage)}
            value={locale}
            onValueChange={(next) => {
              if (typeof next === 'string') setLocale(next);
            }}
          >
            {localization.locales.map((declared) => (
              <DropdownMenuRadioItem
                key={declared}
                value={declared}
                closeOnClick
                className="gap-3"
              >
                <span lang={declared} dir={localeDirection(declared)}>
                  {languageName(declared)}
                </span>
                {declared === localization.defaultLocale && (
                  <Badge size="sm" tone="neutral" appearance="outline">
                    {intl.formatMessage(languageMessages.defaultLanguage)}
                  </Badge>
                )}
                {missing.has(declared) && (
                  <Badge size="sm" tone="warning" appearance="outline">
                    {intl.formatMessage(languageMessages.missingTranslation)}
                  </Badge>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {locale === localization.defaultLocale && (
        <Badge size="sm" tone="neutral" appearance="outline">
          {intl.formatMessage(languageMessages.defaultLanguage)}
        </Badge>
      )}
      {missing.size > 0 && (
        <Badge size="sm" tone="warning" appearance="outline">
          {intl.formatMessage(languageMessages.missingCount, {
            count: missing.size,
          })}
        </Badge>
      )}
    </div>
  );
}
