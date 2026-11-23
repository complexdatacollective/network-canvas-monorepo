'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { posthog } from 'posthog-js';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { COMMUNITY_FORUM_URL } from '@codaco/shared-consts';
import Link from '~/components/Link';
import {
  ARTICLE_COMMENT_MAX_LENGTH,
  type ArticleContext,
  type ArticleFeedback as Feedback,
  type ArticleRating,
  articleFeedbackEvent,
  articleFeedbackShownEvent,
} from '~/lib/analytics/articleFeedback';
import { usePathname } from '~/navigation';

const renderCommunityLink = (chunks: ReactNode) => (
  <Link href={COMMUNITY_FORUM_URL}>{chunks}</Link>
);

export default function ArticleFeedback() {
  const docPath = usePathname();
  const { section } = useParams<{ section: string }>();
  const locale = useLocale();

  // Keyed by path, so moving to another article starts a new response.
  return (
    <Prompt key={docPath} docPath={docPath} section={section} locale={locale} />
  );
}

function Prompt({ docPath, section, locale }: ArticleContext) {
  const t = useTranslations('ArticleFeedback');
  const questionId = useId();
  const promptRef = useRef<HTMLElement>(null);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [draft, setDraft] = useState('');
  // Each rating renders its message under a new key, so the live region's
  // text node is replaced and announced even though the message repeats.
  const [ratingsSent, setRatingsSent] = useState(0);

  useEffect(() => {
    const prompt = promptRef.current;
    if (prompt === null) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      if (posthog.__loaded) {
        posthog.capture(
          'survey shown',
          articleFeedbackShownEvent({ docPath, section, locale }),
        );
      }
    });
    observer.observe(prompt);
    return () => observer.disconnect();
  }, [docPath, section, locale]);

  const send = (next: Feedback) => {
    setFeedback(next);
    // Analytics only starts on the production site; elsewhere the prompt
    // works the same and sends nothing.
    if (posthog.__loaded) {
      posthog.capture(
        'survey sent',
        articleFeedbackEvent(next, { docPath, section, locale }),
      );
    }
  };

  const rating = feedback?.rating ?? null;

  const rate = (choice: ArticleRating) => {
    if (rating === choice) return;
    send({
      submissionId: feedback?.submissionId ?? crypto.randomUUID(),
      rating: choice,
      comment: '',
    });
    setRatingsSent((count) => count + 1);
  };

  const sendComment = () => {
    const comment = draft.trim();
    if (feedback === null || comment === '') return;
    send({ ...feedback, comment });
  };

  if (feedback !== null && feedback.comment !== '') {
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
      ref={promptRef}
      aria-labelledby={questionId}
      className="border-outline mt-12 flex flex-col gap-4 border-t pt-6"
    >
      <div>
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
        <Paragraph role="status" margin="none" className="not-empty:mt-3">
          {ratingsSent > 0 && <span key={ratingsSent}>{t('ratingSent')}</span>}
        </Paragraph>
      </div>

      {rating !== null && (
        <div className="flex flex-col gap-2">
          <TextAreaField
            aria-label={t('commentLabel')}
            placeholder={t('commentLabel')}
            maxLength={ARTICLE_COMMENT_MAX_LENGTH}
            className="[&>textarea]:field-sizing-content [&>textarea]:max-h-60 [&>textarea]:min-h-24"
            value={draft}
            onChange={(next) => setDraft(next ?? '')}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Paragraph intent="smallText" margin="none">
              {t.rich('forumNote', { link: renderCommunityLink })}
            </Paragraph>
            <Button
              size="sm"
              color="primary"
              disabled={draft.trim() === ''}
              onClick={sendComment}
            >
              {t('send')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
