import { Link } from '@tanstack/react-router';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { buttonVariants } from '@codaco/fresco-ui/Button';
import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

/**
 * Marketing's home, at `/` (§5.2, #1251).
 *
 * It is what the managed service answers at its root, signed in or out — a
 * researcher who is already signed in gets to their own work through the site
 * header, not by having this page taken away from them. A self-hosted instance
 * never renders it: `/` is a redirect-only route there, because a self-hoster's
 * origin root is the URL they hand their researchers (§10.4, and the guard in
 * `router.tsx`).
 *
 * The copy says what Studio is and offers the two things a visitor can
 * actually do — create an account, or sign in. Nothing here is invented:
 * plans live behind `/pricing`, which #1253 builds, and there are no figures,
 * quotes or named users to stand in for evidence that does not exist yet.
 */

const messages = defineMessages({
  intro: {
    id: 'studio.marketing.intro',
    defaultMessage:
      'Studio is where research teams design personal network interviews, run them with participants online, and keep the data they collect together in one study.',
    description:
      "The marketing page's one-sentence description of what Studio is.",
  },
  createAccount: {
    id: 'studio.marketing.createAccount',
    defaultMessage: 'Create an account',
    description: "The marketing page's primary call to action.",
  },
  signIn: {
    id: 'studio.marketing.signIn',
    defaultMessage: 'Sign in',
    description: "The marketing page's sign-in link.",
  },
  seePlans: {
    id: 'studio.marketing.seePlans',
    defaultMessage: 'See what a plan includes',
    description: "The marketing page's link to the pricing page.",
  },
  capabilitiesHeading: {
    id: 'studio.marketing.capabilitiesHeading',
    defaultMessage: 'What you can do with it',
    description: "Heading of the marketing page's three-capability section.",
  },
  designTitle: {
    id: 'studio.marketing.designTitle',
    defaultMessage: 'Design the interview',
    description: 'Title of the protocol-design capability card.',
  },
  designDescription: {
    id: 'studio.marketing.designDescription',
    defaultMessage:
      'Build a protocol from the same interfaces Network Canvas has always used — name generators, sociograms, forms — and change it without starting again.',
    description: 'Body of the protocol-design capability card.',
  },
  collectTitle: {
    id: 'studio.marketing.collectTitle',
    defaultMessage: 'Collect from participants',
    description: 'Title of the data-collection capability card.',
  },
  collectDescription: {
    id: 'studio.marketing.collectDescription',
    defaultMessage:
      'Send participants a link. They answer in their own browser, on their own device, with no software to install.',
    description: 'Body of the data-collection capability card.',
  },
  exportTitle: {
    id: 'studio.marketing.exportTitle',
    defaultMessage: 'Take the data out',
    description: 'Title of the data-export capability card.',
  },
  exportDescription: {
    id: 'studio.marketing.exportDescription',
    defaultMessage:
      'Export the networks you collected in the formats analysis software reads, whenever you want them.',
    description: 'Body of the data-export capability card.',
  },
  selfHostHeading: {
    id: 'studio.marketing.selfHostHeading',
    defaultMessage: 'Or run it yourself',
    description: "Heading of the marketing page's self-hosting section.",
  },
  selfHostBody: {
    id: 'studio.marketing.selfHostBody',
    defaultMessage:
      'Studio is open source. An institution that needs its participant data to stay on its own infrastructure can host the same software itself.',
    description: "Body of the marketing page's self-hosting section.",
  },
});

const CAPABILITIES: readonly {
  title: MessageDescriptor;
  description: MessageDescriptor;
}[] = [
  { title: messages.designTitle, description: messages.designDescription },
  { title: messages.collectTitle, description: messages.collectDescription },
  { title: messages.exportTitle, description: messages.exportDescription },
];

export default function Marketing() {
  const intl = useAppIntl();
  return (
    <main id={DEFAULT_SKIP_TARGET_ID}>
      <div className="tablet-portrait:px-8 mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
        <div className="flex flex-col gap-6">
          {/* The product's name is a brand, not copy — it stays as it is in
              every locale. */}
          <Heading level="h1" margin="none" {...routeFocusTargetProps}>
            {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- brand name */}
            Network Canvas Studio
          </Heading>
          <Paragraph className="max-w-prose text-lg" margin="none">
            {intl.formatMessage(messages.intro)}
          </Paragraph>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className={buttonVariants({ color: 'primary' })}
              to="/sign-up"
            >
              {intl.formatMessage(messages.createAccount)}
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/sign-in"
            >
              {intl.formatMessage(messages.signIn)}
            </Link>
            <Link className={buttonVariants({ variant: 'link' })} to="/pricing">
              {intl.formatMessage(messages.seePlans)}
            </Link>
          </div>
        </div>

        <section
          aria-labelledby="capabilities-heading"
          className="flex flex-col gap-6"
        >
          <Heading id="capabilities-heading" level="h2" margin="none">
            {intl.formatMessage(messages.capabilitiesHeading)}
          </Heading>
          <ul className="tablet-portrait:grid-cols-3 grid list-none gap-4 p-0">
            {CAPABILITIES.map((capability) => (
              <li key={capability.title.id}>
                <Surface className="h-full" spacing="md">
                  <Heading level="h3" margin="none">
                    {intl.formatMessage(capability.title)}
                  </Heading>
                  <Paragraph className="mt-2" margin="none">
                    {intl.formatMessage(capability.description)}
                  </Paragraph>
                </Surface>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="self-hosting-heading">
          <Heading id="self-hosting-heading" level="h2">
            {intl.formatMessage(messages.selfHostHeading)}
          </Heading>
          <Paragraph className="max-w-prose" margin="none">
            {intl.formatMessage(messages.selfHostBody)}
          </Paragraph>
        </section>
      </div>
    </main>
  );
}
