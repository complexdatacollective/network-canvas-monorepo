import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@acme/tailwind-config/globals.css';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Fresco Analytics ',
  description: 'This is the analytics dashboard for Fresco.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css"
        />
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
