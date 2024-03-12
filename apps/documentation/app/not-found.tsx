import { Heading, ListItem, Paragraph, UnorderedList } from '@codaco/ui';
import { Quicksand } from 'next/font/google';

import Link from '~/components/Link';

const quicksand = Quicksand({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

export default function NotFound() {
  return (
    <html lang="en" className={`${quicksand.className} antialiased`}>
      <body className="flex h-screen items-center justify-center">
        <div className="max-w-lg p-3 sm:p-0">
          <Heading variant="h1">404 - Not found</Heading>
          <div className="h-[2px] w-full bg-rich-black" />
          <Heading variant="h2">The requested page could not be found.</Heading>
          <Paragraph>
            This is most likely to have happened because the page has been moved
            or deleted. We apologize for any inconvenience this has caused.
          </Paragraph>
          <Paragraph>Please try the following:</Paragraph>
          <UnorderedList>
            <ListItem>
              If you typed the page address in the address bar, make sure that
              it is spelled correctly.
            </ListItem>
            <ListItem>
              Use the &apos;return home&apos; link below to navigate to the home
              page, and then navigate to the page you are looking for using the
              menus.
            </ListItem>
            <ListItem>
              Contact the project team if you believe you are seeing this page
              in error, including details of the page you were trying to reach.
              Please email us at{' '}
              <Link href="mailto:info@networkcanvas.com">
                info@networkcanvas.com
              </Link>
              .
            </ListItem>
          </UnorderedList>
          <Link href="/">Return Home</Link>
        </div>
      </body>
    </html>
  );
}
