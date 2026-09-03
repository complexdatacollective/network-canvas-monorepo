'use client';

import { useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { GallerySidebar } from '~/components/protocol-gallery/GallerySidebar';
import { ProtocolGalleryCard } from '~/components/protocol-gallery/ProtocolGalleryCard';
import { Container } from '~/components/ui/Container';
import {
  applyFacets,
  countFacetValues,
  toggleFacetValue,
} from '~/lib/galleryFacets';
import {
  type SortId,
  sortGalleryProtocols,
  sortRules,
} from '~/lib/gallerySort';
import type { GalleryProtocol } from '~/lib/protocolGallery';

// `minMatchCharLength: 1` so a one-letter query (an initial, an acronym's
// first letter) still matches rather than hiding everything.
const galleryFuseOptions = {
  threshold: 0.15,
  includeScore: false,
  minMatchCharLength: 1,
} as const;
const galleryFilterKeys = ['searchText'];
const GRID_MIN_ITEM_WIDTH = 300;
const GRID_GAP_UNITS = 6;
const GRID_MAX_COLUMNS = 3;

function galleryProtocolKey(protocol: GalleryProtocol): string {
  return protocol.slug;
}

function galleryProtocolText(protocol: GalleryProtocol): string {
  return protocol.shortName;
}

function pickFields(protocol: GalleryProtocol): string[] {
  return protocol.fields;
}

function pickEdgeGeneration(protocol: GalleryProtocol): string[] {
  return protocol.edgeGeneration;
}

export function ProtocolGallery({
  protocols,
}: {
  protocols: GalleryProtocol[];
}) {
  const t = useTranslations('ProtocolGallery.collection');
  const [query, setQuery] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [sort, setSort] = useState<SortId>('newest');
  const [resultCount, setResultCount] = useState(protocols.length);
  const prefersReducedMotion = useReducedMotion();

  const fieldOptions = useMemo(
    () => countFacetValues(protocols, pickFields),
    [protocols],
  );
  const edgeOptions = useMemo(
    () => countFacetValues(protocols, pickEdgeGeneration),
    [protocols],
  );
  const filteredProtocols = useMemo(
    () =>
      sortGalleryProtocols(
        applyFacets(protocols, {
          fields: selectedFields,
          edgeGeneration: selectedEdges,
        }),
        sort,
      ),
    [protocols, selectedEdges, selectedFields, sort],
  );
  const layout = useMemo(
    () =>
      new GridLayout<GalleryProtocol>({
        minItemWidth: GRID_MIN_ITEM_WIDTH,
        gap: GRID_GAP_UNITS,
        maxColumns: GRID_MAX_COLUMNS,
      }),
    [],
  );

  useEffect(() => {
    if (query.trim().length === 0) {
      setResultCount(filteredProtocols.length);
    }
  }, [filteredProtocols, query]);

  const activeSort = sortRules[sort];
  const hasActiveFilters =
    query.trim().length > 0 ||
    selectedFields.length > 0 ||
    selectedEdges.length > 0;
  const clearFilters = () => {
    setQuery('');
    setSelectedFields([]);
    setSelectedEdges([]);
  };

  return (
    <section aria-label={t('heading')}>
      <Container
        maxWidth="full"
        margin="none"
        className="tablet-landscape:mb-32 mt-10 mb-20"
      >
        <div className="tablet-landscape:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] grid grid-cols-1 gap-8">
          <GallerySidebar
            query={query}
            onQueryChange={setQuery}
            resultCount={resultCount}
            total={protocols.length}
            facets={[
              {
                id: 'fields',
                label: t('facets.fields'),
                options: fieldOptions,
                selected: selectedFields,
                onToggle: (value) =>
                  setSelectedFields((current) =>
                    toggleFacetValue(current, value),
                  ),
              },
              {
                id: 'edgeGeneration',
                label: t('facets.edgeGeneration'),
                options: edgeOptions,
                selected: selectedEdges,
                onToggle: (value) =>
                  setSelectedEdges((current) =>
                    toggleFacetValue(current, value),
                  ),
              },
            ]}
            sort={sort}
            onSortChange={setSort}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />

          <div className="min-w-0">
            <Heading level="h2" margin="none" className="sr-only">
              {t('heading')}
            </Heading>
            <Collection
              items={filteredProtocols}
              keyExtractor={galleryProtocolKey}
              textValueExtractor={galleryProtocolText}
              layout={layout}
              selectionMode="none"
              nativeItemSemantics
              filterQuery={query.trim()}
              filterExecution="sync"
              filterKeys={galleryFilterKeys}
              filterFuseOptions={galleryFuseOptions}
              filterDebounceMs={150}
              onFilterResultsChange={(_, matchCount) =>
                setResultCount(matchCount)
              }
              sortBy={activeSort.property}
              sortDirection={activeSort.direction}
              sortType={activeSort.type}
              sortRules={[
                { property: 'featured', direction: 'desc', type: 'boolean' },
                activeSort,
              ]}
              animate={prefersReducedMotion !== true}
              animationKey={[
                sort,
                query,
                selectedFields.join('|'),
                selectedEdges.join('|'),
              ].join('::')}
              scrollable={false}
              className="[&_[data-stagger-item]]:size-full"
              emptyState={
                hasActiveFilters ? (
                  <Surface
                    noContainer
                    spacing="lg"
                    shadow="sm"
                    role="status"
                    className="mx-auto max-w-lg"
                  >
                    <Heading level="h3" margin="none">
                      {t('emptyHeading')}
                    </Heading>
                    <Paragraph margin="none" emphasis="muted" className="mt-3">
                      {t('emptyDescription')}
                    </Paragraph>
                  </Surface>
                ) : (
                  // Without a filter, an empty collection can only mean the
                  // items have not been mounted yet.
                  <Spinner />
                )
              }
              renderItem={(protocol, itemProps) => (
                <ProtocolGalleryCard
                  protocol={protocol}
                  itemProps={itemProps}
                />
              )}
            >
              {(collectionElements) => collectionElements}
            </Collection>
          </div>
        </div>
      </Container>
    </section>
  );
}
