import type { IntlShape } from '@codaco/app-i18n/messages';

export type BioTriadOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Reformat generated labels when a queued wizard changes language. */
  getLabel?: (intl: IntlShape) => string;
};
