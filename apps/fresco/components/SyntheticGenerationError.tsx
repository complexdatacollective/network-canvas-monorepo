'use client';

import { AppErrorMessage, AppMessage } from '@codaco/app-i18n/react';
import { syntheticGenerationMessages } from '~/i18n/syntheticGenerationMessages';
import type { SyntheticGenerationFailure } from '~/schemas/synthetic-interviews';

export default function SyntheticGenerationError({
  error,
  details,
  diagnostic,
}: SyntheticGenerationFailure) {
  return (
    <div className="space-y-3">
      <p>
        <AppErrorMessage error={error} />
      </p>
      {details && details.length > 0 && (
        <ul className="list-disc space-y-3 ps-5">
          {details.map((detail, index) => (
            <li key={index}>
              <strong>
                <AppErrorMessage error={detail.subject} />
              </strong>
              <p>
                <AppErrorMessage error={detail.reason} />
              </p>
            </li>
          ))}
        </ul>
      )}
      {diagnostic && (
        <details>
          <summary className="cursor-pointer">
            <AppMessage
              message={syntheticGenerationMessages.technicalDetails}
            />
          </summary>
          <pre className="mt-2 text-sm wrap-break-word whitespace-pre-wrap">
            {diagnostic}
          </pre>
        </details>
      )}
    </div>
  );
}
