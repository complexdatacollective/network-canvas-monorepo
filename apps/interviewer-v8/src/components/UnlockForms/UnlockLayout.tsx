import type { ReactNode } from 'react';

// Shared two-column shell for every unlock body (PIN, passphrase, biometric,
// recovery). The decorative emblem sits beside the actionable text + form on
// comfortable widths and stacks above it on phone portrait. The meaningful
// content is first in source order so a screen reader never reaches the
// aria-hidden emblem before the text/form; the `order-*` utilities put the
// emblem visually first (top when stacked, left when two-column) at every width
// without changing that DOM order.
export function UnlockLayout({
  emblem,
  children,
}: {
  emblem: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="phone-landscape:flex-row phone-landscape:items-start phone-landscape:gap-8 phone-landscape:text-left flex flex-col items-center gap-6 text-center">
      <div className="order-last flex min-w-0 flex-1 flex-col">{children}</div>
      <div className="phone-landscape:pt-1 order-first shrink-0">{emblem}</div>
    </div>
  );
}
