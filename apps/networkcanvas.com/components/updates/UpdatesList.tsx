'use client';

import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';

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
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';
import Tag, { type TagColor } from '@codaco/fresco-ui/Tag';
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
import {
  type UpdateAppId,
  updateAppIds,
  type UpdateKind,
  updateKinds,
} from '~/lib/updateApps';

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
function searchableText(update: Update, locale: string) {
  const text = `${update.title} ${update.summary} ${update.details ?? ''}`;
  return foldText(text.replace(/\]\((?:[^()]|\([^()]*\))*\)/g, ']'), locale);
}

type AppFilter = 'all' | UpdateAppId;

const appFilters: readonly AppFilter[] = ['all', ...updateAppIds];

function appName(id: UpdateAppId) {
  return tools.find((tool) => tool.id === id)?.name ?? id;
}

const kindStyles: Record<
  UpdateKind,
  { color: TagColor; dotClassName: string; spacingClassName: string }
> = {
  launch: {
    color: 'neon-coral',
    dotClassName: 'bg-neon-coral',
    spacingClassName: 'pb-12',
  },
  feature: {
    color: 'sea-serpent',
    dotClassName: 'bg-sea-serpent',
    spacingClassName: 'pb-10',
  },
  fix: {
    color: 'mustard',
    dotClassName: 'bg-mustard',
    spacingClassName: 'pb-8',
  },
};

type Filters = { query: string; app: AppFilter; kinds: UpdateKind[] };

const noFilters: Filters = { query: '', app: 'all', kinds: [] };

function visibleUpdatesFor(
  updates: readonly (Update & { searchText: string })[],
  { query, app, kinds }: Filters,
  locale: string,
) {
  const terms = foldText(query, locale).split(/\s+/).filter(Boolean);
  return updates.filter(
    (update) =>
      (app === 'all' || update.apps.includes(app)) &&
      (kinds.length === 0 || kinds.includes(update.kind)) &&
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
  const [filters, setFilters] = useState<Filters>(noFilters);
  const { query, app, kinds } = filters;
  const searchable = useMemo(
    () =>
      updates.map((update) => ({
        ...update,
        searchText: searchableText(update, locale),
      })),
    [updates, locale],
  );
  const visibleUpdates = visibleUpdatesFor(searchable, filters, locale);
  const narrowed = query.trim() !== '' || app !== 'all' || kinds.length > 0;

  const showUpdates = (changes: Partial<Filters>) => {
    const next = { ...filters, ...changes };
    setFilters(next);
    setOpenIds(
      next.query.trim()
        ? visibleUpdatesFor(searchable, next, locale).map((update) => update.id)
        : [],
    );
  };

  // A link to one update has to reveal it even when it is collapsed.
  useEffect(() => {
    const reveal = () => {
      const id = updateIdFromHash(updates);
      if (!id) return;
      setFilters(noFilters);
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
      <Surface
        noContainer
        spacing="none"
        shadow="sm"
        className="tablet-portrait:p-6 flex flex-col gap-4 p-4"
      >
        {/* A field adds a bottom margin whenever a sibling follows it. */}
        <div className="min-w-0">
          <UnconnectedField
            name="updates-search"
            label={t('search.label')}
            labelHidden
            component={InputField}
            type="search"
            value={query}
            onChange={(value) => showUpdates({ query: value ?? '' })}
            placeholder={t('search.placeholder')}
            prefixComponent={<Search aria-hidden />}
            suffixComponent={
              query ? (
                <IconButton
                  size="md"
                  variant="text"
                  aria-label={t('search.clear')}
                  icon={<X aria-hidden />}
                  onClick={() => showUpdates({ query: '' })}
                />
              ) : undefined
            }
            size="md"
          />
        </div>
        <div className="tablet-portrait:grid-cols-[auto_minmax(0,1fr)] grid grid-cols-1 items-center gap-x-4 gap-y-3">
          <Heading
            level="h4"
            variant="all-caps"
            margin="none"
            render={<span aria-hidden />}
          >
            {t('filter.appHeading')}
          </Heading>
          <SegmentedSwitcher
            size="sm"
            value={app}
            onValueChange={(next) => showUpdates({ app: next })}
            options={appFilters.map((filter) => ({
              value: filter,
              label: filter === 'all' ? t('filter.all') : appName(filter),
            }))}
            aria-label={t('filter.label')}
            className="justify-self-start"
          />
          <Heading
            level="h4"
            variant="all-caps"
            margin="none"
            render={<span aria-hidden />}
          >
            {t('filter.kindHeading')}
          </Heading>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t('filter.kindLabel')}
              className="flex flex-wrap gap-2"
            >
              {updateKinds.map((kind) => (
                <Tag
                  key={kind}
                  color={kindStyles[kind].color}
                  pressed={kinds.includes(kind)}
                  onPressedChange={(pressed) =>
                    showUpdates({
                      kinds: pressed
                        ? [...kinds, kind]
                        : kinds.filter((selected) => selected !== kind),
                    })
                  }
                  uppercase={false}
                >
                  {t(`filter.kinds.${kind}`)}
                </Tag>
              ))}
            </div>
            <div className="ml-auto flex min-h-8 items-center gap-3">
              <Paragraph
                margin="none"
                intent="meta"
                emphasis="muted"
                aria-live="polite"
              >
                {t('search.results', {
                  count: visibleUpdates.length,
                  total: updates.length,
                })}
              </Paragraph>
              {narrowed ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => showUpdates(noFilters)}
                >
                  {t('search.clearAll')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Surface>
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
          const launch = update.kind === 'launch';
          const style = kindStyles[update.kind];
          const illustration = launch
            ? updateIllustrations[update.id]
            : undefined;
          const date = new Date(update.date);
          const open = openIds.includes(update.id);
          const content = (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Tag size="sm" color={style.color} uppercase={false}>
                  {t(`kinds.${update.kind}`)}
                </Tag>
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
                level={launch ? 'h2' : 'h3'}
                variant={launch ? 'subheading' : 'default'}
                render={({ children, ...props }) => (
                  <h2 {...props}>{children}</h2>
                )}
                margin="none"
                id={update.id}
                lang="en"
                className="scroll-mt-8"
              >
                {update.title}
              </Heading>
              <div className="mt-3" lang="en">
                <RenderMarkdown
                  allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
                  components={markdownComponents}
                >
                  {update.summary}
                </RenderMarkdown>
              </div>
              {update.details ? (
                <>
                  <AccordionPanel inert={!open} lang="en">
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
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={update.link}>
                    {t('readMore')}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </>
          );
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
                  {format.dateTime(date, {
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </Paragraph>
              </time>
              <div
                aria-hidden
                className="tablet-portrait:col-start-2 relative col-start-1 row-span-2 row-start-1 flex justify-center"
              >
                <span
                  className={cx(
                    'border-text relative z-10 mt-1 size-5 rounded-full border-4',
                    style.dotClassName,
                  )}
                />
                <span className="bg-text/10 absolute top-1 -bottom-2 left-1/2 w-1 -translate-x-1/2 rounded-full group-last:hidden" />
              </div>
              <div
                className={cx(
                  'tablet-portrait:col-start-3 tablet-portrait:row-start-1 tablet-portrait:row-span-2 col-start-2 row-start-2',
                  style.spacingClassName,
                )}
              >
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
                  <div
                    className={
                      launch
                        ? 'tablet-portrait:p-8 p-6'
                        : 'tablet-portrait:px-8 tablet-portrait:py-6 p-5'
                    }
                  >
                    {content}
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
