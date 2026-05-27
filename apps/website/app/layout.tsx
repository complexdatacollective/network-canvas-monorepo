import '@fontsource-variable/nunito';
import '@fontsource-variable/inclusive-sans';
import '~/app/globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://networkcanvas.com'),
  title: {
    default: 'Network Canvas',
    template: '%s | Network Canvas',
  },
  description:
    'Network Canvas provides free and open-source software for surveying networks, designed around the needs of both researchers and their participants.',
  icons: {
    icon: '/images/logos/network-canvas-mark.svg',
  },
  openGraph: {
    title: 'Network Canvas',
    description:
      'Free and open-source software for surveying networks, designed around the needs of both researchers and their participants.',
    url: 'https://networkcanvas.com',
    siteName: 'Network Canvas',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="root overflow-x-hidden">{children}</body>
    </html>
  );
}
