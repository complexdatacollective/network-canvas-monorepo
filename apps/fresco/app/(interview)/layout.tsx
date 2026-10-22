import { type Metadata } from 'next';

import { defineMessages } from '@codaco/app-i18n/messages';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import EndSessionRecording from '~/app/(interview)/_components/EndSessionRecording';
import { getServerIntl } from '~/i18n/server';

const messages = defineMessages({
  pageTitle: {
    id: 'fresco.interview.metadata.pageTitle',
    defaultMessage: 'Network Canvas Fresco - Interview',
    description:
      'Browser tab title for the participant-facing interview pages. Keep "Network Canvas Fresco" unchanged in all languages.',
  },
  pageDescription: {
    id: 'fresco.interview.metadata.pageDescription',
    defaultMessage: 'Interview',
    description:
      'Short page description (search-engine and link-preview metadata) for the participant-facing interview pages. A single word naming the activity.',
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const intl = await getServerIntl();
  return {
    title: intl.formatMessage(messages.pageTitle),
    description: intl.formatMessage(messages.pageDescription),
  };
}

// The region sets no `lang` or `dir` of its own: it inherits the document's,
// which the root layout sets from the language Fresco negotiated for this
// request, and which is the language of everything rendered here outside the
// interview. The interview itself (`Shell`) sets its own `lang`/`dir` from the
// language it resolves, so each part of the page declares what it shows.
function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemedRegion
      theme="interview"
      className="flex h-screen max-h-screen flex-col"
    >
      <EndSessionRecording />
      {children}
    </ThemedRegion>
  );
}

export default RootLayout;
