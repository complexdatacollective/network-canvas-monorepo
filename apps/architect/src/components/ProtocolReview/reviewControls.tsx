import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'wouter';

import { Button, type ButtonProps } from '@codaco/fresco-ui/Button';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';

/**
 * A button that stays focusable while it is unavailable, so a keyboard or
 * screen reader user still finds it and hears why (`aria-describedby` naming
 * the visible reason), as they would see it. `unavailable` marks it
 * `aria-disabled`, which Button's `ui-disabled` styles answer, and refuses
 * the activation.
 */
export const GuardedButton = ({
  unavailable = false,
  onClick,
  ...props
}: ButtonProps & { unavailable?: boolean }) => (
  <Button
    {...props}
    aria-disabled={unavailable || undefined}
    onClick={(event: MouseEvent<HTMLButtonElement>) => {
      if (unavailable) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    }}
  />
);

/**
 * A link to a place in the protocol. Following it closes whatever review
 * surface it sits in (`onFollow`), and the router takes the researcher there.
 */
export const ProtocolPlaceLink = ({
  href,
  onFollow,
  children,
  className,
}: {
  href: string;
  onFollow: () => void;
  children: ReactNode;
  className?: string;
}) => (
  <NativeLink
    className={className}
    render={<Link href={href} onClick={onFollow} />}
  >
    {children}
  </NativeLink>
);
