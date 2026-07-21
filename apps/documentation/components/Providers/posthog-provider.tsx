'use client';

import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react';
import posthog from 'posthog-js';
import type { ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

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
          The documentation could not continue. Reload the page to try again, or
          return to the documentation home page.
        </Paragraph>
        <div className="flex flex-wrap gap-3">
          <Button color="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button
            color="primary"
            variant="outline"
            onClick={() => window.location.assign('/en')}
          >
            Documentation home
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
