'use client';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import NuqsClearFilters from '~/components/DataTable/nuqs/NuqsClearFilters';
import NuqsFacetedFilter from '~/components/DataTable/nuqs/NuqsFacetedFilter';
import NuqsSearchFilter from '~/components/DataTable/nuqs/NuqsSearchFilter';

import ExportActivityFeed from './ExportActivityFeed';
import { formatActivityType } from './messages';
import { activityTypes } from './types';

const messages = defineMessages({
  filterByActivityDetails: {
    id: 'fresco.ActivityFeed.ActivityFeedToolbar.filterByActivityDetails',
    defaultMessage: 'Filter by activity details...',
    description:
      'Placeholder in the text search box above the activity feed table on the dashboard. The search matches the description text of each activity entry.',
  },
  filterType: {
    id: 'fresco.ActivityFeed.ActivityFeedToolbar.filterType',
    defaultMessage: 'Filter Type...',
    description:
      'Label of the button that opens the activity-type filter above the activity feed table. Type means the kind of activity (for example a sign-in or a protocol upload), not a verb.',
  },
  searchType: {
    id: 'fresco.ActivityFeed.ActivityFeedToolbar.searchType',
    defaultMessage: 'Search Type...',
    description:
      'Placeholder in the search box inside the activity-type filter list, for finding a kind of activity by name. Type is a noun (kind of activity), not a verb.',
  },
  noTypeFound: {
    id: 'fresco.ActivityFeed.ActivityFeedToolbar.noTypeFound',
    defaultMessage: 'No type found.',
    description:
      'Message in the activity-type filter list when nothing matches what the researcher typed. Type is a noun (kind of activity).',
  },
});

const clearableFilters = ['q', 'type'] as const;

export default function ActivityFeedToolbar() {
  const intl = useAppIntl();

  return (
    <div className="tablet-landscape:flex-row tablet-landscape:flex-wrap flex w-full flex-col items-center justify-center gap-2">
      <NuqsSearchFilter
        paramKey="q"
        placeholder={intl.formatMessage(messages.filterByActivityDetails)}
        className="tablet-landscape:min-w-0 tablet-landscape:flex-1 tablet-landscape:max-w-xl w-full min-w-fit"
      />
      <NuqsFacetedFilter
        paramKey="type"
        values={activityTypes}
        getLabel={(value) => formatActivityType(intl, value)}
        placeholder={intl.formatMessage(messages.filterType)}
        searchPlaceholder={intl.formatMessage(messages.searchType)}
        emptyMessage={intl.formatMessage(messages.noTypeFound)}
      />
      <ExportActivityFeed />
      <NuqsClearFilters paramKeys={clearableFilters} />
    </div>
  );
}
