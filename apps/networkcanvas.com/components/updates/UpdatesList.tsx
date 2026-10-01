'use client';

import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from '@codaco/fresco-ui/Accordion';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button, IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Tag from '@codaco/fresco-ui/Tag';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { foldText } from '@codaco/fresco-ui/utils/foldText';
import { EmptyResults } from '~/components/ui/EmptyResults';
import { SiteLink } from '~/components/ui/SiteLink';
import { updateIllustrations } from '~/components/updates/illustrations/updateIllustrations';
import { tools } from '~/lib/content';
import { Link } from '~/lib/i18n/navigation';
import type { Update } from '~/lib/siteContent';
import { type UpdateAppId, updateAppIds } from '~/lib/updateApps';

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

// Link destinations are not part of what a reader sees, so they do not match.
function searchableText(update: Update) {
  const text = `${update.title} ${update.summary} ${update.details ?? ''}`;
  return foldText(text.replace(/\]\([^)]*\)/g, ']'));
}

type AppFilter = 'all' | UpdateAppId;

const appFilters: readonly AppFilter[] = ['all', ...updateAppIds];

function appName(id: UpdateAppId) {
  return tools.find((tool) => tool.id === id)?.name ?? id;
}

function visibleUpdatesFor(
  updates: readonly (Update & { searchText: string })[],
  query: string,
  app: AppFilter,
) {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  return updates.filter(
    (update) =>
      (app === 'all' || update.apps.includes(app)) &&
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
  const latestId = updates[0]?.id;
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [app, setApp] = useState<AppFilter>('all');
  const searchable = useMemo(
    () =>
      updates.map((update) => ({
        ...update,
        searchText: searchableText(update),
      })),
    [updates],
  );
  const visibleUpdates = visibleUpdatesFor(searchable, query, app);
  const narrowed = query.trim() !== '' || app !== 'all';

  const showUpdates = (nextQuery: string, nextApp: AppFilter) => {
    setQuery(nextQuery);
    setApp(nextApp);
    setOpenIds(
      nextQuery.trim()
        ? visibleUpdatesFor(searchable, nextQuery, nextApp).map(
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
      setApp('all');
      setOpenIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
    };

    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [updates]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="tablet-portrait:flex-row tablet-portrait:items-center flex flex-col gap-4">
        {/* A field adds a bottom margin whenever a sibling follows it. */}
        <div className="min-w-0 flex-1">
          <UnconnectedField
            name="updates-search"
            label={t('search.label')}
            labelHidden
            component={InputField}
            type="search"
            value={query}
            onChange={(value) => showUpdates(value ?? '', app)}
            placeholder={t('search.placeholder')}
            prefixComponent={<Search aria-hidden />}
            suffixComponent={
              query ? (
                <IconButton
                  size="md"
                  variant="text"
                  aria-label={t('search.clear')}
                  icon={<X aria-hidden />}
                  onClick={() => showUpdates('', app)}
                />
              ) : undefined
            }
            size="md"
          />
        </div>
        <div
          role="group"
          aria-label={t('filter.label')}
          className="tablet-portrait:flex-nowrap flex shrink-0 flex-wrap gap-2"
        >
          {appFilters.map((filter) => (
            <Tag
              key={filter}
              pressed={app === filter}
              onPressedChange={() => showUpdates(query, filter)}
              size="lg"
              pressedTone="primary"
              uppercase={false}
            >
              {filter === 'all' ? t('filter.all') : appName(filter)}
            </Tag>
          ))}
        </div>
      </div>
      <Paragraph
        margin="none"
        intent="meta"
        emphasis="muted"
        aria-live="polite"
        className="mt-3"
      >
        {narrowed
          ? t('search.results', {
              count: visibleUpdates.length,
              total: updates.length,
            })
          : null}
      </Paragraph>
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
        className="mt-6 gap-0"
      >
        {visibleUpdates.map((update) => {
          const illustration = updateIllustrations[update.id];
          const date = new Date(update.date);
          const open = openIds.includes(update.id);
          return (
            <AccordionItem
              key={update.id}
              value={update.id}
              render={<li />}
              className="group tablet-portrait:grid-cols-[6rem_1.5rem_minmax(0,1fr)] tablet-portrait:gap-x-6 grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4"
            >
              <time
                dateTime={update.date}
                className="tablet-portrait:col-start-1 tablet-portrait:row-start-1 tablet-portrait:pt-0.5 tablet-portrait:pb-0 tablet-portrait:text-right col-start-2 row-start-1 flex flex-col pb-3"
              >
                <Heading level="h4" margin="none" render={<span />}>
                  {format.dateTime(date, {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </Heading>{' '}
                <Paragraph
                  render={<span />}
                  intent="smallText"
                  emphasis="muted"
                  margin="none"
                >
                  {format.dateTime(date, { year: 'numeric', timeZone: 'UTC' })}
                </Paragraph>
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
              <div className="tablet-portrait:col-start-3 tablet-portrait:row-start-1 tablet-portrait:row-span-2 col-start-2 row-start-2 pb-12">
                <Surface
                  as="article"
                  noContainer
                  spacing="none"
                  shadow="sm"
                  aria-labelledby={update.id}
                >
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
                  <div className="tablet-portrait:p-8 p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {update.id === latestId ? (
                        <Badge color="neon-coral" uppercase>
                          {t('latest')}
                        </Badge>
                      ) : null}
                      {update.apps.map((id) => (
                        <Fragment key={id}>
                          {' '}
                          <Tag size="sm" uppercase={false}>
                            {appName(id)}
                          </Tag>
                        </Fragment>
                      ))}
                    </div>
                    <Heading
                      level="h2"
                      variant="subheading"
                      margin="none"
                      id={update.id}
                      className="scroll-mt-8"
                    >
                      {update.title}
                    </Heading>
                    <div className="mt-3">
                      <RenderMarkdown
                        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                        components={markdownComponents}
                      >
                        {update.summary}
                      </RenderMarkdown>
                    </div>
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
                                variant="outline"
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
                        variant="outline"
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
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
