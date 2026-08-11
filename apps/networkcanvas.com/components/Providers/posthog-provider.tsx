'use client';

import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react';
import posthog from 'posthog-js';
import type { ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

// Deliberately not translated: this renders when the app tree has already
// failed, which includes the case where the locale messages are what failed to
// load. Each string is whole and self-contained so it can be localised later
// without being reassembled from fragments.
function AppErrorFallback() {
  return (
    <main
      role="alert"
      aria-labelledby="app-error-title"
      className="publish-colors bg-background text-text flex min-h-dvh items-center justify-center p-4"
    >
      <div className="w-full max-w-lg">
        <Heading id="app-error-title" level="h1">
          Something went wrong
        </Heading>
        <Paragraph>
          This page could not continue. Reload to try again, or return to the
          home page.
        </Paragraph>
        <div className="flex flex-wrap gap-3">
          <Button color="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button
            color="primary"
            variant="outline"
            onClick={() => window.location.assign('/')}
          >
            Home page
          </Button>
        </div>
      </div>
    </main>
  );
}

export function PostHogClientProvider({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary
        fallback={AppErrorFallback}
        additionalProperties={{ feature: 'app-error-boundary' }}
      >
        {children}
      </PostHogErrorBoundary>
    </PostHogProvider>
  );
}
