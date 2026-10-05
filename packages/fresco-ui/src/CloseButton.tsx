'use client';

import { X } from 'lucide-react';
import { type ComponentPropsWithRef, forwardRef } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton } from './Button';

const CloseButton = forwardRef<
  HTMLButtonElement,
  Partial<ComponentPropsWithRef<typeof IconButton>>
>((props, ref) => {
  const intl = useAppIntl();
  const {
    className,
    icon = <X />,
    title = intl.formatMessage(commonMessages.close),
    variant = 'text',
    ...rest
  } = props;
  return (
    <IconButton
      ref={ref}
      color="dynamic"
      {...rest}
      icon={icon}
      title={title}
      variant={variant}
      aria-label={title}
      className={className}
    />
  );
});

CloseButton.displayName = 'CloseButton';

export default CloseButton;
