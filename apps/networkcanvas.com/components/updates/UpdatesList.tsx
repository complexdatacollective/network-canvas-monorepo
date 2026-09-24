'use client';

import { Search, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Tag from '@codaco/fresco-ui/Tag';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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
  if (href.startsWith('/')) {
    return <NativeLink render={<Link href={href} />}>{children}</NativeLink>;
  }
  if (href.startsWith('https://')) {
    return (
      <NativeLink href={href} target="_blank" rel="noreferrer">
        {children}
      </NativeLink>
    );
  }
  return <NativeLink href={href}>{children}</NativeLink>;
}

const markdownComponents = { a: MarkdownLink };

function normalizeForSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}

// Link destinations are not part of what a reader sees, so they do not match.
function searchableText(update: Update) {
  return normalizeForSearch(
    `${update.title} ${update.body.replace(/\]\([^)]*\)/g, ']')}`,
  );
}

type AppFilter = 'all' | UpdateAppId;

const appFilters: readonly AppFilter[] = ['all', ...updateAppIds];

const appNames: Record<UpdateAppId, string> = {
  architect: 'Architect',
  interviewer: 'Interviewer',
  fresco: 'Fresco',
};

function visibleUpdatesFor(
  updates: readonly (Update & { searchText: string })[],
  query: string,
  app: AppFilter,
) {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  return updates.filter(
    (update) =>
      (app === 'all' || update.apps.includes(app)) &&
      terms.every((term) => update.searchText.includes(term)),
  );
}

function updateIdFromHash(updates: readonly Update[]) {
  const id = decodeURIComponent(window.location.hash.slice(1));
  return updates.some((update) => update.id === id) ? id : undefined;
}

export function UpdatesList({ updates }: { updates: readonly Update[] }) {
  const t = useTranslations('UpdatesPage');
  const format = useFormatter();
  const latestId = updates[0]?.id;
  const [openIds, setOpenIds] = useState<string[]>(latestId ? [latestId] : []);
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

  // Every search match opens so the text that matched is on screen; without a
  // search, only the newest update left in view does.
  const showUpdates = (nextQuery: string, nextApp: AppFilter) => {
    setQuery(nextQuery);
    setApp(nextApp);
    const visible = visibleUpdatesFor(searchable, nextQuery, nextApp);
    setOpenIds(
      nextQuery.trim()
        ? visible.map((update) => update.id)
        : visible.slice(0, 1).map((update) => update.id),
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
              {filter === 'all' ? t('filter.all') : appNames[filter]}
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
        <div className="py-10 text-center">
          <Heading level="h3" margin="none">
            {t('search.emptyHeading')}
          </Heading>
          <Paragraph margin="none" emphasis="muted" className="mt-3">
            {t('search.emptyDescription')}
          </Paragraph>
        </div>
      ) : null}
      <Accordion<string>
        multiple
        value={openIds}
        onValueChange={setOpenIds}
        className="divide-text/10 mt-2 gap-0 divide-y"
      >
        {visibleUpdates.map((update) => (
          <AccordionItem key={update.id} value={update.id} className="py-6">
            <AccordionHeader
              render={({ children, ...props }) => (
                <h2 {...props}>{children}</h2>
              )}
              id={update.id}
              className="scroll-mt-24"
            >
              <AccordionTrigger className="text-text items-start text-left text-3xl tracking-normal normal-case">
                <span className="flex flex-col gap-2">
                  {update.id === latestId ? (
                    <Heading
                      level="h4"
                      variant="all-caps"
                      margin="none"
                      render={<span />}
                      className="text-link"
                    >
                      {t('latest')}
                    </Heading>
                  ) : null}
                  <span className="text-pretty">{update.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <Paragraph
                      render={<span />}
                      intent="meta"
                      emphasis="muted"
                      margin="none"
                      className="font-normal"
                    >
                      <time dateTime={update.date}>
                        {t('published', {
                          date: format.dateTime(new Date(update.date), {
                            dateStyle: 'long',
                            timeZone: 'UTC',
                          }),
                        })}
                      </time>
                    </Paragraph>
                    <span className="flex flex-wrap gap-1.5">
                      {update.apps.map((id) => (
                        <Fragment key={id}>
                          {' '}
                          <Tag size="sm" uppercase={false}>
                            {appNames[id]}
                          </Tag>
                        </Fragment>
                      ))}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel
              className="mt-0"
              inert={!openIds.includes(update.id)}
            >
              <div className="pt-4">
                <RenderMarkdown
                  allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                  components={markdownComponents}
                >
                  {update.body}
                </RenderMarkdown>
              </div>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
