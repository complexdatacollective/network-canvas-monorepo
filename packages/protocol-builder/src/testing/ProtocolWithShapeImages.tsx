import { useState, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { createInMemoryHost } from './host/createInMemoryHost.ts';

const HOME_SHAPE =
  '<svg viewBox="0 0 100 100"><path d="M8 48 L50 10 L92 48 V92 H8 Z" fill="var(--node-color, #e04f6d)"/><path d="M8 48 L50 10 L92 48" fill="none" stroke="var(--node-color-dark, #a8324c)" stroke-width="8" stroke-linejoin="round"/><rect id="label-area" x="18" y="52" width="64" height="32" fill="#ffffff"/></svg>';
const SCHOOL_SHAPE =
  '<svg viewBox="0 0 100 100"><rect x="6" y="34" width="88" height="58" rx="6" fill="#f2b84b"/><path d="M50 6 L50 34 M50 8 L72 16 L50 24" fill="#d9483b" stroke="#5b3a1e" stroke-width="4" stroke-linejoin="round"/><rect id="label-area" x="14" y="46" width="72" height="36" fill="#3b2a12"/></svg>';

/**
 * A protocol holding two shape images, `home-image` and `school-image`, so a
 * story can draw them and the shape browser can offer them. The host is in
 * memory: nothing is saved.
 */
export function ProtocolWithShapeImages({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [host] = useState(() =>
    createInMemoryHost({
      sections: {
        [sectionId({ kind: 'settings' })]: {
          name: 'Custom shapes',
          schemaVersion: 9,
          localization: { defaultLocale: 'en', locales: ['en'] },
        },
        [sectionId({ kind: 'assets' })]: {
          'home-image': { type: 'image', name: 'home.svg', source: 'home.svg' },
          'school-image': {
            type: 'image',
            name: 'school.svg',
            source: 'school.svg',
          },
        },
      },
      assetContent: {
        'home.svg': new Blob([HOME_SHAPE], { type: 'image/svg+xml' }),
        'school.svg': new Blob([SCHOOL_SHAPE], { type: 'image/svg+xml' }),
      },
    }),
  );
  return (
    <DialogProvider>
      <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
        {children}
      </ProtocolBuilder>
    </DialogProvider>
  );
}
