'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { posthog } from 'posthog-js';
import { type ReactNode, useId, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import Link from '~/components/Link';
import {
  ARTICLE_COMMENT_MAX_LENGTH,
  type ArticleFeedback as Feedback,
  type ArticleRating,
  articleFeedbackEvent,
} from '~/lib/analytics/articleFeedback';

type Status = 'ratingSent' | 'ratingRemoved';

// Each result gets a new id, so the live region's text node is replaced and
// announced even when the message matches the previous one.
type Announcement = { status: Status; id: number };

const COMMUNITY_URL = 'https://community.networkcanvas.com';

const renderCommunityLink = (chunks: ReactNode) => (
  <Link href={COMMUNITY_URL}>{chunks}</Link>
);

export default function ArticleFeedback({ docPath }: { docPath: string }) {
  const t = useTranslations('ArticleFeedback');
  const locale = useLocale();
  const questionId = useId();
  const commentId = useId();

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const announce = (status: Status) =>
    setAnnouncement((previous) => ({ status, id: (previous?.id ?? 0) + 1 }));

  const send = (next: Feedback) => {
    setFeedback(next);
    // Analytics only starts on the production site; elsewhere the prompt
    // works the same and sends nothing.
    if (posthog.__loaded) {
      posthog.capture(
        'survey sent',
        articleFeedbackEvent(next, { docPath, locale }),
      );
    }
  };

  const rating = feedback?.rating ?? null;
  const comment = feedback?.comment ?? '';

  const rate = (choice: ArticleRating) => {
    const nextRating = rating === choice ? null : choice;
    send({
      submissionId: feedback?.submissionId ?? crypto.randomUUID(),
      rating: nextRating,
      comment,
    });
    announce(nextRating === null ? 'ratingRemoved' : 'ratingSent');
  };

  const sendComment = () => {
    const nextComment = draft?.trim() ?? '';
    if (nextComment === '') return;
    send({
      submissionId: feedback?.submissionId ?? crypto.randomUUID(),
      rating,
      comment: nextComment,
    });
    setDraft(null);
  };

  if (comment !== '') {
    return (
      <section className="border-outline mt-12 border-t pt-6">
        <Paragraph
          // Sending replaces the prompt, so focus moves to the thanks.
          ref={(thanks: HTMLParagraphElement | null) => thanks?.focus()}
          tabIndex={-1}
          margin="none"
          className="font-bold focus:outline-none"
        >
          {t('thanks')}
        </Paragraph>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={questionId}
      className="border-outline mt-12 flex flex-col gap-4 border-t pt-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span id={questionId} className="font-bold">
          {t('question')}
        </span>
        <div role="group" aria-labelledby={questionId} className="flex gap-2">
          <Button
            size="sm"
            aria-pressed={rating === 'yes'}
            icon={<ThumbsUp aria-hidden />}
            onClick={() => rate('yes')}
          >
            {t('yes')}
          </Button>
          <Button
            size="sm"
            aria-pressed={rating === 'no'}
            icon={<ThumbsDown aria-hidden />}
            onClick={() => rate('no')}
          >
            {t('no')}
          </Button>
        </div>
      </div>

      {rating !== null && (
        <div className="flex flex-col gap-2">
          <label htmlFor={commentId} className="font-bold">
            {t('commentLabel')}
          </label>
          <TextAreaField
            id={commentId}
            maxLength={ARTICLE_COMMENT_MAX_LENGTH}
            className="[&>textarea]:field-sizing-content [&>textarea]:max-h-60 [&>textarea]:min-h-24"
            value={draft ?? ''}
            onChange={(next) => setDraft(next ?? '')}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Paragraph intent="smallText" margin="none">
              {t.rich('forumNote', { link: renderCommunityLink })}
            </Paragraph>
            <Button
              size="sm"
              color="primary"
              disabled={(draft ?? '').trim() === ''}
              onClick={sendComment}
            >
              {t('send')}
            </Button>
          </div>
        </div>
      )}

      {/* The pressed button already shows a rating, so its result is only
          announced. */}
      <p role="status" className="sr-only">
        {announcement !== null && (
          <span key={announcement.id}>{t(announcement.status)}</span>
        )}
      </p>
    </section>
  );
}
