'use client';

import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from '@codaco/fresco-ui/Accordion';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  getMarkdownLabelText,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { foldText } from '@codaco/fresco-ui/utils/foldText';
import { EmptyResults } from '~/components/ui/EmptyResults';
import { SiteLink } from '~/components/ui/SiteLink';
import { updateIllustrations } from '~/components/updates/illustrations/updateIllustrations';
import { Link } from '~/lib/i18n/navigation';
import type { Update, UpdateProminence } from '~/lib/siteContent';
import { parseUpdateDate } from '~/lib/updateDates';

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) return <>{children}</>;
  return <SiteLink href={href}>{children}</SiteLink>;
}

const markdownComponents = { a: MarkdownLink };

// Only what a reader sees is searchable: link destinations and definitions
// are not.
function searchableText(update: Update, locale: string) {
  const text = [
    update.title,
    ...[update.summary, update.details]
      .filter((part): part is string => Boolean(part))
      .map(getMarkdownLabelText),
  ].join(' ');
  return foldText(text, locale);
}

const titleSizes = {
  launch: 'text-2xl',
  featured: 'text-2xl',
  normal: 'text-xl',
  mini: 'text-lg',
} as const satisfies Record<UpdateProminence, string>;

function visibleUpdatesFor(
  updates: readonly (Update & { searchText: string })[],
  query: string,
  locale: string,
) {
  const terms = foldText(query, locale).split(/\s+/).filter(Boolean);
  return updates.filter((update) =>
    terms.every((term) => update.searchText.includes(term)),
  );
}

function updateIdFromHash(updates: readonly Update[]) {
  let id: string;
  try {
    id = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return undefined;
  }
  return updates.some((update) => update.id === id) ? id : undefined;
}

export function UpdatesList({ updates }: { updates: readonly Update[] }) {
  const t = useTranslations('UpdatesPage');
  const format = useFormatter();
  const locale = useLocale();
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const searchable = useMemo(
    () =>
      updates.map((update) => ({
        ...update,
        searchText: searchableText(update, locale),
      })),
    [updates, locale],
  );
  const visibleUpdates = visibleUpdatesFor(searchable, query, locale);
  const narrowed = query.trim() !== '';

  const showUpdates = (nextQuery: string) => {
    setQuery(nextQuery);
    setOpenIds(
      nextQuery.trim()
        ? visibleUpdatesFor(searchable, nextQuery, locale).map(
            (update) => update.id,
          )
        : [],
    );
  };

  // A link to one update has to reveal it even when it is collapsed.
  useEffect(() => {
    const reveal = () => {
      const id = updateIdFromHash(updates);
      if (!id) return;
      setQuery('');
      setOpenIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
    };

    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [updates]);

  return (
    <div className="mx-auto max-w-6xl">
      <search className="mx-auto block max-w-2xl">
        {/* A field adds a bottom margin whenever a sibling follows it. */}
        <div>
          <UnconnectedField
            name="updates-search"
            label={t('search.label')}
            labelHidden
            component={InputField}
            type="search"
            value={query}
            onChange={(value) => showUpdates(value ?? '')}
            placeholder={t('search.placeholder')}
            prefixComponent={<Search aria-hidden />}
            suffixComponent={
              query ? (
                <IconButton
                  size="md"
                  variant="text"
                  aria-label={t('search.clear')}
                  icon={<X aria-hidden />}
                  onClick={() => showUpdates('')}
                />
              ) : undefined
            }
            size="md"
          />
        </div>
        <Paragraph
          margin="none"
          intent="meta"
          emphasis="muted"
          role="status"
          className="mt-3"
        >
          {narrowed
            ? t('search.results', {
                count: visibleUpdates.length,
                total: updates.length,
              })
            : null}
        </Paragraph>
      </search>
      {visibleUpdates.length === 0 ? (
        <div className="py-6">
          <EmptyResults
            heading={t('search.emptyHeading')}
            description={t('search.emptyDescription')}
          />
        </div>
      ) : null}
      <Accordion<string>
        multiple
        value={openIds}
        onValueChange={setOpenIds}
        render={<ol />}
        className="mt-16 gap-0"
      >
        {visibleUpdates.map((update) => {
          const illustration =
            update.prominence === 'launch' || update.prominence === 'featured'
              ? updateIllustrations[update.id]
              : undefined;
          const mini = update.prominence === 'mini';
          const { date, precision } = parseUpdateDate(update.date);
          const open = openIds.includes(update.id);
          return (
            <AccordionItem
              key={update.id}
              value={update.id}
              render={<li />}
              className="group"
            >
              <article
                aria-labelledby={update.id}
                className="tablet-portrait:grid-cols-[6rem_1.5rem_minmax(0,1fr)] tablet-portrait:gap-x-6 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-6"
              >
                <time
                  dateTime={update.date}
                  className="tablet-portrait:col-start-1 tablet-portrait:row-start-1 tablet-portrait:pt-0.5 tablet-portrait:pb-0 tablet-portrait:text-right col-start-2 row-start-1 flex flex-col pb-3"
                >
                  <Heading level="h4" margin="none" render={<span />}>
                    {format.dateTime(
                      date,
                      precision === 'year'
                        ? { year: 'numeric', timeZone: 'UTC' }
                        : {
                            month: 'short',
                            ...(precision === 'day' ? { day: 'numeric' } : {}),
                            timeZone: 'UTC',
                          },
                    )}
                  </Heading>
                  {precision === 'year' ? null : (
                    <>
                      {' '}
                      <Paragraph
                        render={<span />}
                        intent="smallText"
                        emphasis="muted"
                        margin="none"
                      >
                        {format.dateTime(date, {
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </Paragraph>
                    </>
                  )}
                </time>
                <div
                  aria-hidden
                  className="tablet-portrait:col-start-2 relative col-start-1 row-span-2 row-start-1 flex justify-center"
                >
                  <span
                    className={cx(
                      'border-text relative z-10 mt-1 size-5 rounded-full border-4',
                      illustration?.dotClassName ?? 'bg-primary',
                    )}
                  />
                  <span className="bg-text/10 absolute top-1 -bottom-2 left-1/2 w-1 -translate-x-1/2 rounded-full group-last:hidden" />
                </div>
                <div
                  className={cx(
                    'tablet-portrait:col-start-3 tablet-portrait:row-start-1 tablet-portrait:row-span-2 tablet-portrait:pl-6 col-start-2 row-start-2',
                    mini ? 'pb-8' : 'pb-12',
                  )}
                >
                  <Surface noContainer spacing="none" shadow="sm">
                    {illustration ? (
                      <div
                        className={cx(
                          'tablet-portrait:px-10 px-4 pt-4',
                          illustration.bandClassName,
                        )}
                      >
                        <illustration.Illustration />
                      </div>
                    ) : null}
                    <div
                      className={
                        mini
                          ? 'tablet-portrait:px-8 px-6 py-4'
                          : 'tablet-portrait:p-8 p-6'
                      }
                    >
                      <Heading
                        level="h2"
                        variant="subheading"
                        margin="none"
                        id={update.id}
                        className={cx(
                          'scroll-mt-8',
                          titleSizes[update.prominence],
                        )}
                      >
                        {update.title}
                      </Heading>
                      {update.summary ? (
                        <div className="mt-3">
                          <RenderMarkdown
                            allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                            components={markdownComponents}
                          >
                            {update.summary}
                          </RenderMarkdown>
                        </div>
                      ) : null}
                      {update.details ? (
                        <>
                          <AccordionPanel inert={!open}>
                            <RenderMarkdown
                              allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                              components={markdownComponents}
                            >
                              {update.details}
                            </RenderMarkdown>
                          </AccordionPanel>
                          <AccordionHeader render={<div />} className="mt-4">
                            <BaseAccordion.Trigger
                              aria-describedby={update.id}
                              render={
                                <Button
                                  variant="raised"
                                  size="sm"
                                  iconPosition="right"
                                  icon={
                                    <ChevronDown
                                      aria-hidden
                                      className="transition-transform [[data-panel-open]>&]:rotate-180"
                                    />
                                  }
                                />
                              }
                            >
                              {open ? t('details.hide') : t('details.show')}
                            </BaseAccordion.Trigger>
                          </AccordionHeader>
                        </>
                      ) : null}
                      {update.link ? (
                        <Button
                          asChild
                          variant="raised"
                          size="sm"
                          className="mt-4"
                        >
                          <Link href={update.link}>
                            {t('readMore')}
                            <ArrowRight aria-hidden />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </Surface>
                </div>
              </article>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
