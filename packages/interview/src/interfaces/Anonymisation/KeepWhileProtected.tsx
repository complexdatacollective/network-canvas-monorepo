'use client';

import { type ReactNode, useState } from 'react';

/**
 * Renders `children` with `values` once they are first given, then keeps them
 * mounted, hidden and with the last values given, while `values` is
 * undefined. A form in `children` therefore keeps what the participant entered
 * through a spell in which its answers cannot be shown, such as a passphrase
 * being replaced and then restored. `values` must keep its identity while its
 * answers are unchanged.
 */
export default function KeepWhileProtected<T>({
  values,
  children,
}: {
  values: T | undefined;
  children: (values: T) => ReactNode;
}) {
  const [kept, setKept] = useState(values);
  if (values !== undefined && values !== kept) setKept(values);

  const shown = values ?? kept;
  if (shown === undefined) return null;

  return (
    <div hidden={values === undefined} className="contents">
      {children(shown)}
    </div>
  );
}
