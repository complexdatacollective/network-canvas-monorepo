'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { MonoCaption } from '~/components/protocol-gallery/Eyebrow';
import { FacetGroup } from '~/components/protocol-gallery/FacetGroup';
import type { FacetOption } from '~/lib/galleryFacets';
import { parseSortId, type SortId, sortIds } from '~/lib/gallerySort';

export type GalleryFacet = {
  id: string;
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
};

export function GallerySidebar({
  query,
  onQueryChange,
  resultCount,
  total,
  facets,
  sort,
  onSortChange,
  hasActiveFilters,
  onClearFilters,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
  total: number;
  facets: GalleryFacet[];
  sort: SortId;
  onSortChange: (sort: SortId) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const t = useTranslations('ProtocolGallery.collection');

  return (
    <aside
      aria-label={t('filterLabel')}
      className="tablet-landscape:sticky tablet-landscape:top-24 tablet-landscape:self-start min-w-0"
    >
      <Surface
        noContainer
        spacing="md"
        shadow="xs"
        className="flex flex-col gap-6"
      >
        <div className="min-w-0">
          <UnconnectedField
            name="protocol-search"
            label={t('searchLabel')}
            labelHidden
            component={InputField}
            type="search"
            value={query}
            onChange={(value) => onQueryChange(value ?? '')}
            placeholder={t('searchPlaceholder')}
            className="w-full"
            prefixComponent={<Search aria-hidden />}
            suffixComponent={
              query ? (
                <IconButton
                  size="md"
                  variant="text"
                  aria-label={t('clearSearch')}
                  icon={<X aria-hidden />}
                  onClick={() => onQueryChange('')}
                />
              ) : undefined
            }
            size="md"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <MonoCaption aria-live="polite">
              {t('resultsOfTotal', { count: resultCount, total })}
            </MonoCaption>
            {hasActiveFilters ? (
              <Button variant="link" size="sm" onClick={onClearFilters}>
                {t('clearFilters')}
              </Button>
            ) : null}
          </div>
        </div>

        {facets.map((facet) => (
          <FacetGroup
            key={facet.id}
            label={facet.label}
            options={facet.options}
            selected={facet.selected}
            onToggle={facet.onToggle}
          />
        ))}

        <hr className="my-0" />

        <UnconnectedField
          name="protocol-sort"
          label={t('sortLabel')}
          component={RadioGroupField}
          orientation="vertical"
          size="sm"
          value={sort}
          onChange={(value) => onSortChange(parseSortId(value))}
          options={sortIds.map((id) => ({
            value: id,
            label: t(`sortOptions.${id}`),
          }))}
        />
      </Surface>
    </aside>
  );
}
