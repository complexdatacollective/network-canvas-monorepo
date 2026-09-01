'use client';

import {
  ArrowUpRight,
  Rows3,
  Search,
  Star,
  UsersRound,
  Waypoints,
  X,
} from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { IconButton } from '@codaco/fresco-ui/Button';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ProtocolCard } from '@codaco/fresco-ui/ProtocolCard';
import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ProtocolPattern } from '~/components/protocol-gallery/ProtocolPattern';
import { Container } from '~/components/ui/Container';
import type { GalleryProtocol } from '~/lib/protocolGallery';
import { protocolGalleryHref } from '~/lib/siteUrls';

type FilterId = 'all' | 'sociograms' | 'rosters' | 'dyadCensus';
type SortId = 'newest' | 'oldest' | 'titleAsc' | 'titleDesc';

const sortConfig: Record<
  SortId,
  { property: '*' | 'shortName'; direction: 'asc' | 'desc'; type: 'string' }
> = {
  newest: { property: '*', direction: 'desc', type: 'string' },
  oldest: { property: '*', direction: 'asc', type: 'string' },
  titleAsc: { property: 'shortName', direction: 'asc', type: 'string' },
  titleDesc: { property: 'shortName', direction: 'desc', type: 'string' },
};
const sortIds: SortId[] = ['newest', 'oldest', 'titleAsc', 'titleDesc'];
const galleryFuseOptions = { threshold: 0.15, includeScore: false } as const;
const GRID_MIN_ITEM_WIDTH = 400;
const GRID_GAP_UNITS = 6;
const TWO_COLUMN_MEDIA_QUERY = '(min-width: 1024px)';
const galleryFilterKeys = ['searchText'];

function galleryProtocolKey(protocol: GalleryProtocol): string {
  return protocol.slug;
}

function galleryProtocolText(protocol: GalleryProtocol): string {
  return protocol.shortName;
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

class ProtocolGalleryGridLayout extends GridLayout<GalleryProtocol> {
  emphasizeFeatured = true;

  override getItemStyles(key?: Key): CSSProperties {
    const styles: CSSProperties = {
      height: '100%',
      minWidth: 0,
      width: '100%',
    };

    if (!this.emphasizeFeatured) return styles;
    if (key === undefined || this.getColumnCount() < 2) return styles;
    return this.items.get(key)?.value.featured
      ? { ...styles, gridColumn: 'span 2 / span 2' }
      : styles;
  }
}

function GalleryProtocolCardBody({
  protocol,
  expanded,
}: {
  protocol: GalleryProtocol;
  expanded: boolean;
}) {
  const t = useTranslations('ProtocolGallery.collection');

  return (
    <>
      <Heading
        level="h3"
        margin="none"
        className={
          expanded
            ? 'text-3xl leading-tight font-black'
            : 'text-xl leading-tight font-black'
        }
      >
        {protocol.shortName}
      </Heading>
      <Paragraph margin="none" intent="smallText" emphasis="muted">
        {protocol.title}
      </Paragraph>
      <Paragraph
        margin="none"
        intent="smallText"
        className={expanded ? 'max-w-3xl' : undefined}
      >
        {expanded ? protocol.summary : protocol.description}
      </Paragraph>
      <div className="flex flex-wrap gap-2">
        {protocol.usesSociograms ? (
          <Badge color="sea-serpent">{t('filters.sociograms')}</Badge>
        ) : null}
        {protocol.usesRosters ? (
          <Badge color="mustard">{t('filters.rosters')}</Badge>
        ) : null}
        {protocol.usesDyadCensus ? (
          <Badge color="neon-coral">{t('filters.dyadCensus')}</Badge>
        ) : null}
      </div>
      <span className="text-primary mt-auto flex items-center gap-2 pt-4 text-sm font-bold">
        {t('viewDetails')}
        <ArrowUpRight
          aria-hidden
          className="size-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5 motion-reduce:transform-none"
        />
      </span>
    </>
  );
}

function GalleryProtocolCard({
  protocol,
  itemProps,
  expanded,
}: {
  protocol: GalleryProtocol;
  itemProps: ItemProps;
  expanded: boolean;
}) {
  const t = useTranslations('ProtocolGallery.collection');
  const tFeatured = useTranslations('ProtocolGallery.intro');
  const locale = useLocale();

  return (
    <a
      {...itemProps}
      href={protocolGalleryHref(locale, protocol.slug)}
      aria-label={t('openProtocol', { title: protocol.shortName })}
      className="focusable group block size-full rounded transition-transform hover:-translate-y-1 focus-visible:-translate-y-1 motion-reduce:transform-none"
    >
      {protocol.featured ? (
        <ProtocolCard
          background={
            <ProtocolPattern
              name={protocol.title}
              className="absolute inset-0 size-full"
            />
          }
          gradientClassName="from-transparent via-surface/85 to-surface via-45% to-65%"
          className="bg-surface text-surface-contrast flex size-full flex-col shadow-lg"
        >
          <div className="absolute inset-x-0 top-7 z-10 flex justify-end px-7">
            <Badge className="gap-1.5">
              <Star aria-hidden className="size-3" />
              {tFeatured('featured')}
            </Badge>
          </div>
          <div className="relative z-10 mt-24 flex flex-1 flex-col gap-3 p-7">
            <GalleryProtocolCardBody protocol={protocol} expanded={expanded} />
          </div>
        </ProtocolCard>
      ) : (
        <Surface
          noContainer
          spacing="md"
          shadow="lg"
          className="bg-surface/55 text-text flex size-full flex-col gap-3 backdrop-blur-md"
        >
          <GalleryProtocolCardBody protocol={protocol} expanded={false} />
        </Surface>
      )}
    </a>
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
  const [query, setQuery] = useState('');
  const [resultCount, setResultCount] = useState(protocols.length);
  const [fitsTwoColumns, setFitsTwoColumns] = useState(true);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const mediaQuery = window.matchMedia(TWO_COLUMN_MEDIA_QUERY);
    const sync = () => setFitsTwoColumns(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  const filteredProtocols = useMemo(
    () => protocols.filter((protocol) => matchesFilter(protocol, filter)),
    [filter, protocols],
  );
  const layout = useMemo(
    () =>
      new ProtocolGalleryGridLayout({
        minItemWidth: GRID_MIN_ITEM_WIDTH,
        gap: GRID_GAP_UNITS,
      }),
    [],
  );
  const expandFeatured =
    filter === 'all' && query.trim().length === 0 && fitsTwoColumns;
  layout.emphasizeFeatured = expandFeatured;
  const activeSort = sortConfig[sort];

  useEffect(() => {
    if (query.trim().length === 0) {
      setResultCount(filteredProtocols.length);
    }
  }, [filteredProtocols, query]);

  return (
    <section aria-label={t('heading')}>
      <Container className="mt-0! mb-0!">
        <p aria-live="polite" className="sr-only">
          {t('results', { count: resultCount })}
        </p>

        <Surface
          noContainer
          spacing="sm"
          shadow="xs"
          className="bg-surface/85 backdrop-blur-md"
        >
          <div className="min-w-0">
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
                    size="md"
                    variant="text"
                    aria-label={t('clearSearch')}
                    icon={<X aria-hidden className="size-4" />}
                    onClick={() => setQuery('')}
                  />
                ) : undefined
              }
              size="md"
            />
          </div>
          <div className="tablet-landscape:flex-row tablet-landscape:items-center tablet-landscape:justify-between mt-4 flex min-w-0 flex-col gap-4">
            <div className="min-w-0 overflow-x-auto pb-1">
              <SegmentedSwitcher
                value={filter}
                onValueChange={setFilter}
                aria-label={t('filterLabel')}
                size="md"
                options={[
                  { value: 'all', label: t('filters.all') },
                  {
                    value: 'sociograms',
                    label: t('filters.sociograms'),
                    icon: Waypoints,
                  },
                  {
                    value: 'rosters',
                    label: t('filters.rosters'),
                    icon: UsersRound,
                  },
                  {
                    value: 'dyadCensus',
                    label: t('filters.dyadCensus'),
                    icon: Rows3,
                  },
                ]}
              />
            </div>
            <SelectField
              id="protocol-sort"
              name="protocol-sort"
              aria-label={t('sortLabel')}
              value={sort}
              onChange={(value) => setSort(parseSortId(value))}
              options={sortIds.map((id) => ({
                value: id,
                label: t(`sortOptions.${id}`),
              }))}
              size="md"
              className="w-fit shrink-0"
            />
          </div>
        </Surface>
      </Container>

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
        sortRules={[
          { property: 'featured', direction: 'desc', type: 'boolean' },
          activeSort,
        ]}
        animate={prefersReducedMotion !== true}
        animationKey={`${filter}-${sort}-${query}`}
        className="[&_[data-stagger-item]]:size-full"
        emptyState={
          <div className="bg-surface/55 mx-auto max-w-lg rounded p-10 backdrop-blur-md">
            <Heading level="h3" margin="none" className="text-2xl">
              {t('emptyHeading')}
            </Heading>
            <Paragraph margin="none" className="text-text/70 mt-3">
              {t('emptyDescription')}
            </Paragraph>
          </div>
        }
        renderItem={(protocol, itemProps) => (
          <GalleryProtocolCard
            protocol={protocol}
            itemProps={itemProps}
            expanded={protocol.featured && expandFeatured}
          />
        )}
      >
        {(collectionElements) => (
          <Container
            maxWidth="full"
            className="tablet-landscape:mb-32! mt-6! mb-20!"
          >
            {collectionElements}
          </Container>
        )}
      </Collection>
    </section>
  );
}
