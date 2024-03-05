import { Heading, ListItem, Paragraph, UnorderedList } from '@acme/ui';
import Link from '~/components/Link';

export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto my-10">
          <Heading variant="h1">404 - Not found</Heading>
          <div className="bg-black h-[2px] w-full" />
          <Heading variant="h2">The requested page could not be found.</Heading>
          <Paragraph>
            This is probably because the page has been moved or deleted. We
            apologize for any inconvenience this has caused.
          </Paragraph>
          <Paragraph>Please try the following:</Paragraph>
          <UnorderedList>
            <ListItem>
              Use the <strong className="font-bold">Return Home</strong> button
              (at the bottom of this page) to try to locate to the home page.
            </ListItem>
            <ListItem>
              Check your address bar for spelling mistakes or typos.
            </ListItem>
            <ListItem>
              Contact the project team if you believe you are seeing this page
              in error, including details of the page you were trying to reach.
            </ListItem>
          </UnorderedList>
          <Link href="/">Return Home</Link>
        </div>
      </body>
    </html>
  );
}
