import type { ReactNode } from 'react';

import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';

/**
 * The `<main id="main-content">` for a route that sits outside the app shell.
 *
 * Site, focused and participant routes have no area layout, and the area
 * layout is what owns that landmark inside the app (§5.3). So each of those
 * screens renders its own — which is how every route in §5.2 comes to render
 * exactly one (§11.2), on all four branches rather than only the app's.
 *
 * The two shipped focused screens render theirs themselves, inside their own
 * layout; this is the same landmark for the screens that are still
 * placeholders, and the centring they have in common.
 */
export default function ScreenMain({ children }: { children: ReactNode }) {
  return (
    <main
      id={DEFAULT_SKIP_TARGET_ID}
      className="flex h-full flex-col items-center justify-center p-4"
    >
      {children}
    </main>
  );
}
