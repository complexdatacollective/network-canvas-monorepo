import '@fontsource-variable/nunito';
import '@fontsource-variable/inclusive-sans';
import '~/app/globals.css';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
