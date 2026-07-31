'use client';

import {
  ArrowUpRight,
  LayoutGrid,
  Rows3,
  Search,
  UsersRound,
  Waypoints,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { IconButton } from '@codaco/fresco-ui/Button';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Pill from '@codaco/fresco-ui/Pill';
import { ProtocolCard as DeckProtocolCard } from '@codaco/fresco-ui/ProtocolCard';
import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ProtocolPattern } from '~/components/protocol-gallery/ProtocolPattern';
import { Link } from '~/lib/i18n/navigation';
import type { GalleryProtocol } from '~/lib/protocolGallery';

type FilterId = 'all' | 'sociograms' | 'rosters' | 'dyadCensus';
type SortId = 'newest' | 'oldest' | 'titleAsc' | 'titleDesc';
type ViewId = 'cards' | 'table';

const sortConfig: Record<
  SortId,
  { property: '*' | 'title'; direction: 'asc' | 'desc'; type: 'string' }
> = {
  newest: { property: '*', direction: 'desc', type: 'string' },
  oldest: { property: '*', direction: 'asc', type: 'string' },
  titleAsc: { property: 'title', direction: 'asc', type: 'string' },
  titleDesc: { property: 'title', direction: 'desc', type: 'string' },
};
const sortIds: SortId[] = ['newest', 'oldest', 'titleAsc', 'titleDesc'];
const galleryFuseOptions = { threshold: 0.15 } as const;
const galleryFilterKeys = ['searchText'];

function galleryProtocolKey(protocol: GalleryProtocol): string {
  return protocol.slug;
}

function galleryProtocolText(protocol: GalleryProtocol): string {
  return protocol.title;
}

function parseSortId(value: unknown): SortId {
  switch (value) {
    case 'newest':
    case 'oldest':
    case 'titleAsc':
    case 'titleDesc':
      return value;
    default:
      return 'newest';
  }
}

function matchesFilter(protocol: GalleryProtocol, filter: FilterId): boolean {
  if (filter === 'sociograms') return protocol.usesSociograms;
  if (filter === 'rosters') return protocol.usesRosters;
  if (filter === 'dyadCensus') return protocol.usesDyadCensus;
  return true;
}

function GalleryProtocolCard({
  protocol,
  itemProps,
}: {
  protocol: GalleryProtocol;
  itemProps: ItemProps;
}) {
  const t = useTranslations('ProtocolGallery.collection');

  return (
    <Link
      {...itemProps}
      href={`/protocol-gallery/${protocol.slug}`}
      aria-label={t('openProtocol', { title: protocol.title })}
      className="focusable group block h-full rounded transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transform-none"
    >
      <DeckProtocolCard
        background={
          <ProtocolPattern
            name={protocol.title}
            className="absolute inset-0 size-full"
          />
        }
        className="elevation-low h-full min-h-[32rem]"
      >
        <div className="relative z-10 flex size-full flex-col gap-[max(10px,2.5cqi)] p-[6cqi]">
          <div className="flex flex-wrap gap-2">
            {protocol.usesSociograms ? (
              <Badge variant="outline">{t('filters.sociograms')}</Badge>
            ) : null}
            {protocol.usesRosters ? (
              <Badge variant="outline">{t('filters.rosters')}</Badge>
            ) : null}
            {protocol.usesDyadCensus ? (
              <Badge variant="outline">{t('filters.dyadCensus')}</Badge>
            ) : null}
          </div>
          <Heading
            level="h3"
            margin="none"
            className="flex-1 content-center text-[max(18px,5cqi)] leading-[1.05] font-black wrap-break-word hyphens-auto"
          >
            {protocol.title}
          </Heading>
          <Paragraph
            margin="none"
            className="text-sm leading-relaxed text-current/80"
          >
            {protocol.description}
          </Paragraph>
          <span className="text-primary flex items-center gap-2 text-[max(13px,3.25cqi)] font-bold">
            {t('viewProtocol')}
            <ArrowUpRight
              aria-hidden
              className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5 motion-reduce:transform-none"
            />
          </span>
        </div>
      </DeckProtocolCard>
    </Link>
  );
}

function ProtocolRow({
  protocol,
  itemProps,
}: {
  protocol: GalleryProtocol;
  itemProps: ItemProps;
}) {
  const t = useTranslations('ProtocolGallery.collection');

  return (
    <Link
      {...itemProps}
      href={`/protocol-gallery/${protocol.slug}`}
      aria-label={t('openProtocol', { title: protocol.title })}
      className="focusable elevation-low group bg-surface/80 tablet-landscape:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_auto] grid gap-4 rounded p-5 backdrop-blur-sm transition-transform hover:translate-x-1 focus-visible:translate-x-1 motion-reduce:transform-none"
    >
      <div className="min-w-0">
        <span className="font-heading block text-lg font-black text-balance wrap-break-word">
          {protocol.title}
        </span>
        <span className="text-text/60 mt-1 block text-sm">
          {protocol.authors}
        </span>
      </div>
      <div>
        <span className="font-heading text-text/55 tablet-landscape:hidden block text-xs font-bold uppercase">
          {t('fieldLabel')}
        </span>
        <span className="text-sm">{protocol.fields}</span>
      </div>
      <div>
        <span className="font-heading text-text/55 tablet-landscape:hidden block text-xs font-bold uppercase">
          {t('populationLabel')}
        </span>
        <span className="text-sm">{protocol.population}</span>
      </div>
      <div>
        <span className="font-heading text-text/55 tablet-landscape:hidden block text-xs font-bold uppercase">
          {t('methodLabel')}
        </span>
        <span className="text-sm">{protocol.edgeGeneration}</span>
      </div>
      <ArrowUpRight
        aria-hidden
        className="text-primary tablet-landscape:self-center size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5 motion-reduce:transform-none"
      />
    </Link>
  );
}

export function ProtocolGallery({
  protocols,
}: {
  protocols: GalleryProtocol[];
}) {
  const t = useTranslations('ProtocolGallery.collection');
  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('newest');
  const [view, setView] = useState<ViewId>('cards');
  const [query, setQuery] = useState('');
  const [resultCount, setResultCount] = useState(protocols.length);

  const filteredProtocols = useMemo(
    () => protocols.filter((protocol) => matchesFilter(protocol, filter)),
    [filter, protocols],
  );
  const layout = useMemo(
    () =>
      view === 'cards'
        ? new GridLayout<GalleryProtocol>({ minItemWidth: 310, gap: 6 })
        : new ListLayout<GalleryProtocol>({ gap: 3 }),
    [view],
  );
  const activeSort = sortConfig[sort];

  useEffect(() => {
    if (query.trim().length === 0) {
      setResultCount(filteredProtocols.length);
    }
  }, [filteredProtocols, query]);

  return (
    <section aria-labelledby="protocol-gallery-heading">
      <div className="tablet-landscape:flex-row tablet-landscape:items-end tablet-landscape:justify-between flex flex-col gap-6">
        <div className="max-w-2xl">
          <Heading
            id="protocol-gallery-heading"
            level="h2"
            margin="none"
            className="text-4xl"
          >
            {t('heading')}
          </Heading>
          <Paragraph margin="none" className="text-text/70 mt-4 text-lg">
            {t('introduction')}
          </Paragraph>
        </div>
        <p aria-live="polite" className="font-heading text-text/70 font-bold">
          {t('results', { count: resultCount })}
        </p>
      </div>

      <Collection
        items={filteredProtocols}
        keyExtractor={galleryProtocolKey}
        textValueExtractor={galleryProtocolText}
        layout={layout}
        selectionMode="none"
        nativeItemSemantics
        aria-label={t('heading')}
        filterQuery={query}
        filterExecution="sync"
        filterKeys={galleryFilterKeys}
        filterFuseOptions={galleryFuseOptions}
        filterDebounceMs={150}
        onFilterResultsChange={(_, matchCount) => setResultCount(matchCount)}
        sortBy={activeSort.property}
        sortDirection={activeSort.direction}
        sortType={activeSort.type}
        animate
        animationKey={`${filter}-${sort}-${view}-${query}`}
        emptyState={
          <div className="bg-surface/75 mx-auto max-w-lg rounded p-10 backdrop-blur-sm">
            <Heading level="h3" margin="none" className="text-2xl">
              {t('emptyHeading')}
            </Heading>
            <Paragraph margin="none" className="text-text/70 mt-3">
              {t('emptyDescription')}
            </Paragraph>
          </div>
        }
        renderItem={(protocol, itemProps) =>
          view === 'cards' ? (
            <GalleryProtocolCard protocol={protocol} itemProps={itemProps} />
          ) : (
            <ProtocolRow protocol={protocol} itemProps={itemProps} />
          )
        }
      >
        {(collectionElements) => (
          <>
            <div className="bg-surface/60 mt-10 rounded p-4 backdrop-blur-md">
              <div>
                <UnconnectedField
                  name="protocol-search"
                  label={t('searchLabel')}
                  labelHidden
                  component={InputField}
                  type="search"
                  value={query}
                  onChange={(value) => setQuery(value ?? '')}
                  placeholder={t('searchPlaceholder')}
                  className="w-full"
                  prefixComponent={<Search aria-hidden className="size-5" />}
                  suffixComponent={
                    query ? (
                      <IconButton
                        size="sm"
                        variant="text"
                        aria-label={t('clearSearch')}
                        icon={<X aria-hidden className="size-4" />}
                        onClick={() => setQuery('')}
                      />
                    ) : undefined
                  }
                />
              </div>
              <div className="tablet-landscape:flex-row tablet-landscape:items-center tablet-landscape:justify-between mt-4 flex flex-col gap-4">
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="sr-only">{t('filterLabel')}</legend>
                  {[
                    { value: 'all' as const, label: t('filters.all') },
                    {
                      value: 'sociograms' as const,
                      label: t('filters.sociograms'),
                      icon: <Waypoints aria-hidden className="size-4" />,
                    },
                    {
                      value: 'rosters' as const,
                      label: t('filters.rosters'),
                      icon: <UsersRound aria-hidden className="size-4" />,
                    },
                    {
                      value: 'dyadCensus' as const,
                      label: t('filters.dyadCensus'),
                      icon: <Rows3 aria-hidden className="size-4" />,
                    },
                  ].map((option) => {
                    const isSelected = filter === option.value;
                    return (
                      <Pill
                        key={option.value}
                        as="button"
                        size="lg"
                        variant={isSelected ? 'filled' : 'outline'}
                        aria-pressed={isSelected}
                        icon={option.icon}
                        onClick={() => setFilter(option.value)}
                        className={
                          isSelected
                            ? 'focusable bg-primary text-primary-contrast border-primary hover:bg-primary/90'
                            : 'focusable bg-surface text-text/70 hover:bg-primary/10 hover:text-primary'
                        }
                      >
                        {option.label}
                      </Pill>
                    );
                  })}
                </fieldset>
                <div className="tablet-landscape:w-auto flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                  <UnconnectedField
                    name="protocol-sort"
                    label={t('sortLabel')}
                    labelHidden
                    component={SelectField}
                    value={sort}
                    onChange={(value) => setSort(parseSortId(value))}
                    options={sortIds.map((id) => ({
                      value: id,
                      label: t(`sortOptions.${id}`),
                    }))}
                    className="tablet-landscape:w-56 w-full sm:w-56"
                  />
                  <SegmentedSwitcher
                    value={view}
                    onValueChange={setView}
                    aria-label={t('viewLabel')}
                    size="sm"
                    options={[
                      {
                        value: 'cards',
                        label: t('views.cards'),
                        icon: LayoutGrid,
                      },
                      { value: 'table', label: t('views.table'), icon: Rows3 },
                    ]}
                  />
                </div>
              </div>
            </div>

            {view === 'table' ? (
              <div
                aria-hidden
                className="font-heading text-text/55 tablet-landscape:grid mt-6 hidden grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.15fr)_auto] gap-4 px-5 text-xs font-bold tracking-wide uppercase"
              >
                <span>{t('tableHeaders.study')}</span>
                <span>{t('tableHeaders.field')}</span>
                <span>{t('tableHeaders.population')}</span>
                <span>{t('tableHeaders.methods')}</span>
                <span className="size-5" />
              </div>
            ) : null}

            <div className="mt-6">{collectionElements}</div>
          </>
        )}
      </Collection>
    </section>
  );
}
