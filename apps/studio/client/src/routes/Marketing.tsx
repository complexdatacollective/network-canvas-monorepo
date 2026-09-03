import { Link } from '@tanstack/react-router';

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

const CAPABILITIES = [
  {
    title: 'Design the interview',
    description:
      'Build a protocol from the same interfaces Network Canvas has always used — name generators, sociograms, forms — and change it without starting again.',
  },
  {
    title: 'Collect from participants',
    description:
      'Send participants a link. They answer in their own browser, on their own device, with no software to install.',
  },
  {
    title: 'Take the data out',
    description:
      'Export the networks you collected in the formats analysis software reads, whenever you want them.',
  },
];

export default function Marketing() {
  return (
    <main id={DEFAULT_SKIP_TARGET_ID}>
      <div className="tablet-portrait:px-8 mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
        <div className="flex flex-col gap-6">
          <Heading level="h1" margin="none" {...routeFocusTargetProps}>
            Network Canvas Studio
          </Heading>
          <Paragraph className="max-w-prose text-lg" margin="none">
            Studio is where research teams design personal network interviews,
            run them with participants online, and keep the data they collect
            together in one study.
          </Paragraph>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className={buttonVariants({ color: 'primary' })}
              to="/sign-up"
            >
              <span className="text-box-trim">Create an account</span>
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              to="/sign-in"
            >
              <span className="text-box-trim">Sign in</span>
            </Link>
            <Link className={buttonVariants({ variant: 'link' })} to="/pricing">
              See what a plan includes
            </Link>
          </div>
        </div>

        <section
          aria-labelledby="capabilities-heading"
          className="flex flex-col gap-6"
        >
          <Heading id="capabilities-heading" level="h2" margin="none">
            What you can do with it
          </Heading>
          <ul className="tablet-portrait:grid-cols-3 grid list-none gap-4 p-0">
            {CAPABILITIES.map((capability) => (
              <li key={capability.title}>
                <Surface className="h-full" spacing="md">
                  <Heading level="h3" margin="none">
                    {capability.title}
                  </Heading>
                  <Paragraph className="mt-2" margin="none">
                    {capability.description}
                  </Paragraph>
                </Surface>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="self-hosting-heading">
          <Heading id="self-hosting-heading" level="h2">
            Or run it yourself
          </Heading>
          <Paragraph className="max-w-prose" margin="none">
            Studio is open source. An institution that needs its participant
            data to stay on its own infrastructure can host the same software
            itself.
          </Paragraph>
        </section>
      </div>
    </main>
  );
}
