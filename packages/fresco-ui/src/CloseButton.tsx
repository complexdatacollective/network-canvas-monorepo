'use client';

import { X } from 'lucide-react';
import {
  type ComponentPropsWithRef,
  createContext,
  forwardRef,
  useContext,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton } from './Button';

/**
 * Whether a close button shows its name as a tooltip (the default). A region
 * whose language this package has no words for, such as an interview, turns
 * it off: the tooltip would be English whatever the region's language. The
 * button is then named in English for screen readers only, like any text only
 * a screen reader reads.
 */
export const CloseButtonTooltipContext = createContext(true);

const CloseButton = forwardRef<
  HTMLButtonElement,
  Partial<ComponentPropsWithRef<typeof IconButton>>
>((props, ref) => {
  const intl = useAppIntl();
  const showsTooltip = useContext(CloseButtonTooltipContext);
  const { className, icon = <X />, title, variant = 'text', ...rest } = props;
  if (!showsTooltip) {
    return (
      <IconButton
        ref={ref}
        color="dynamic"
        {...rest}
        icon={icon}
        variant={variant}
        aria-label={title ?? 'Close'}
        lang={title === undefined ? 'en' : undefined}
        className={className}
      />
    );
  }
  const label = title ?? intl.formatMessage(commonMessages.close);
  return (
    <IconButton
      ref={ref}
      color="dynamic"
      {...rest}
      icon={icon}
      title={label}
      variant={variant}
      aria-label={label}
      className={className}
    />
  );
});

CloseButton.displayName = 'CloseButton';

export default CloseButton;
