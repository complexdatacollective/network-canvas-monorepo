import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchParams } from '~/app/dashboard/_components/ActivityFeed/types';
import type { Events, Prisma } from '~/lib/db/generated/client';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('~/lib/cache', () => ({ safeCacheTag: vi.fn() }));

const { findMany, count, groupBy } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));
vi.mock('~/lib/db', () => ({
  prisma: { events: { findMany, count, groupBy } },
}));

import { fetchActivities } from '../activityFeed';

const params: SearchParams = {
  page: 1,
  perPage: 10,
  sort: 'none',
  sortField: 'timestamp',
  q: null,
  type: null,
};

function activity(index: number, added = false): Events {
  return {
    id: `event-${String(index).padStart(4, '0')}`,
    timestamp: new Date(Date.UTC(2026, 8, 5, 12, 0, -index)),
    type: added ? 'Participant(s) Added' : 'User Login',
    message: added ? 'User Ada added 2 participants.' : 'User Ada logged in.',
    localization: added
      ? { kind: 'participantsAdded', values: { username: 'Ada', count: 2 } }
      : { kind: 'userLogin', values: { username: 'Ada' } },
  };
}

let records: Events[];

// This database seam applies the old raw-text predicate and cursor/offset
// semantics. Localized matching is performed by the real query implementation.
function matchingRecords(where?: Prisma.EventsWhereInput) {
  return records.filter((event) => {
    const message = where?.message;
    if (
      message &&
      typeof message === 'object' &&
      typeof message.contains === 'string' &&
      !event.message.includes(message.contains)
    )
      return false;
    const type = where?.type;
    return !(
      type &&
      typeof type === 'object' &&
      Array.isArray(type.in) &&
      !type.in.includes(event.type)
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  records = [activity(0), activity(1, true), activity(2)];
  findMany.mockImplementation((args: Prisma.EventsFindManyArgs) => {
    const matching = matchingRecords(args.where);
    const orders = Array.isArray(args.orderBy)
      ? args.orderBy
      : args.orderBy
        ? [args.orderBy]
        : [];
    matching.sort((a, b) => {
      for (const order of orders) {
        for (const field of ['timestamp', 'type', 'message', 'id'] as const) {
          const direction = order[field];
          if (typeof direction !== 'string') continue;
          const left = a[field];
          const right = b[field];
          if (left < right) return direction === 'asc' ? -1 : 1;
          if (left > right) return direction === 'asc' ? 1 : -1;
        }
      }
      return 0;
    });
    const cursor = args.cursor?.id;
    const offset =
      (cursor ? matching.findIndex((event) => event.id === cursor) : 0) +
      (args.skip ?? 0);
    return Promise.resolve(
      matching.slice(offset, offset + (args.take ?? matching.length)),
    );
  });
  count.mockImplementation((args: Prisma.EventsCountArgs) =>
    Promise.resolve(matchingRecords(args.where).length),
  );
  groupBy.mockImplementation((args: Prisma.EventsGroupByArgs) => {
    const groups = new Map<string, number>();
    for (const event of matchingRecords(args.where))
      groups.set(event.type, (groups.get(event.type) ?? 0) + 1);
    return Promise.resolve(
      Array.from(groups, ([type, total]) => ({
        type,
        _count: { _all: total },
      })),
    );
  });
});

describe('localized activity search', () => {
  it.each(['añadió', '«Ada» añadió 2 participantes.'])(
    'finds displayed Spanish details using %s',
    async (q) => {
      const result = await fetchActivities({ ...params, q }, 'es');
      expect(result.events.map(({ id }) => id)).toEqual(['event-0001']);
      expect(result.pageCount).toBe(1);
      expect(result.events[0]?.message).toBe('User Ada added 2 participants.');
    },
  );

  it('keeps original English and historical or unknown metadata searchable verbatim', async () => {
    records.push(
      {
        ...activity(3),
        message: 'Historical needle: Study Blue',
        localization: null,
      },
      {
        ...activity(4),
        message: 'Unknown metadata needle: Study Blue',
        localization: { kind: 'future-kind', values: {} },
      },
    );
    const original = await fetchActivities({ ...params, q: 'added' }, 'es');
    expect(original.events.map(({ id }) => id)).toEqual(['event-0001']);
    const legacy = await fetchActivities(
      { ...params, q: 'needle: Study Blue' },
      'es',
    );
    expect(legacy.events.map(({ id }) => id)).toEqual([
      'event-0003',
      'event-0004',
    ]);
    expect(legacy.pageCount).toBe(1);
  });

  it('counts every match before selecting later pages across bounded database batches', async () => {
    records = Array.from({ length: 1005 }, (_, index) =>
      activity(index, index === 2 || index === 502 || index === 1002),
    );
    const result = await fetchActivities(
      { ...params, q: 'añadió', page: 3, perPage: 1 },
      'es',
    );
    expect(result.events.map(({ id }) => id)).toEqual(['event-1002']);
    expect(result.pageCount).toBe(3);
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const [args] of findMany.mock.calls as [Prisma.EventsFindManyArgs][]) {
      expect(args.take).toBeGreaterThan(0);
      expect(args.take).toBeLessThanOrEqual(500);
      expect(args.orderBy).toEqual([{ timestamp: 'desc' }, { id: 'desc' }]);
    }
    expect(count).not.toHaveBeenCalled();
  });

  it('passes type and deterministic sort constraints through every search batch', async () => {
    const result = await fetchActivities(
      {
        ...params,
        q: 'Ada',
        type: ['Participant(s) Added'],
        sort: 'asc',
        sortField: 'type',
      },
      'es',
    );
    expect(result.events.map(({ id }) => id)).toEqual(['event-0001']);
    expect(result.pageCount).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: { in: ['Participant(s) Added'] } },
        orderBy: [{ id: 'asc' }],
      }),
    );
  });

  it('keeps concurrent locale results separate and leaves stored records unchanged', async () => {
    const original = structuredClone(records);
    const [spanish, english] = await Promise.all([
      fetchActivities({ ...params, q: 'añadió' }, 'es'),
      fetchActivities({ ...params, q: 'añadió' }, 'en'),
    ]);
    expect(spanish.events.map(({ id }) => id)).toEqual(['event-0001']);
    expect(spanish.pageCount).toBe(1);
    expect(english).toEqual({ events: [], pageCount: 0 });
    expect(records).toEqual(original);
  });

  it('retains the efficient SQL count and pagination path without a search term', async () => {
    const result = await fetchActivities(
      { ...params, page: 2, perPage: 1 },
      'es',
    );
    expect(result.events.map(({ id }) => id)).toEqual(['event-0001']);
    expect(result.pageCount).toBe(3);
    expect(count).toHaveBeenCalledExactlyOnceWith({ where: {} });
    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      take: 1,
      skip: 1,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      where: {},
    });
  });
});

describe('localized activity Type sorting', () => {
  it('includes historical prototype-key types without breaking later pages', async () => {
    records = [
      { ...activity(0), type: 'constructor' },
      { ...activity(1), type: 'toString' },
      { ...activity(2), type: 'Protocol Installed' },
    ];
    const result = await fetchActivities(
      { ...params, sortField: 'type', sort: 'asc', page: 2, perPage: 1 },
      'es',
    );
    expect(result.events.map(({ id }) => id)).toEqual(['event-0002']);
    expect(result.pageCount).toBe(3);
  });

  it.each([
    ['en', 'asc', ['event-0000', 'event-0001']],
    ['en', 'desc', ['event-0001', 'event-0000']],
    ['es', 'asc', ['event-0001', 'event-0000']],
    ['es', 'desc', ['event-0000', 'event-0001']],
  ] as const)('orders the visible %s labels %s', async (locale, sort, ids) => {
    records = [
      { ...activity(0), type: 'Protocol Installed' },
      { ...activity(1), type: 'User Login' },
    ];
    const result = await fetchActivities(
      { ...params, sortField: 'type', sort },
      locale,
    );
    expect(result.events.map(({ id }) => id)).toEqual(ids);
    expect(result.pageCount).toBe(1);
  });

  it.each(['asc', 'desc'] as const)(
    'uses stable IDs across equal translated and historical labels in %s order',
    async (sort) => {
      records = [
        { ...activity(0), type: 'Protocol Installed' },
        { ...activity(1), type: 'Protocolo instalado' },
        { ...activity(2), type: 'Protocol Installed' },
      ];
      const result = await fetchActivities(
        { ...params, sortField: 'type', sort, page: 2, perPage: 1 },
        'es',
      );
      expect(result.events.map(({ id }) => id)).toEqual(['event-0001']);
      expect(result.pageCount).toBe(3);
      expect(findMany).toHaveBeenCalledExactlyOnceWith({
        where: { type: { in: ['Protocol Installed', 'Protocolo instalado'] } },
        orderBy: [{ id: sort }],
        skip: 1,
        take: 1,
      });
    },
  );

  it('locates a later page across localized type groups without scanning their rows', async () => {
    records = Array.from({ length: 1005 }, (_, index) => ({
      ...activity(index),
      type: index < 1002 ? 'User Login' : 'Protocol Installed',
    }));
    const result = await fetchActivities(
      { ...params, sortField: 'type', sort: 'asc', page: 502, perPage: 2 },
      'es',
    );
    expect(result.events.map(({ id }) => id)).toEqual([
      'event-1002',
      'event-1003',
    ]);
    expect(result.pageCount).toBe(503);
    expect(findMany).toHaveBeenCalledExactlyOnceWith({
      where: { type: { in: ['Protocol Installed'] } },
      orderBy: [{ id: 'asc' }],
      skip: 0,
      take: 2,
    });
  });

  it('searches before counting and paging across localized type groups', async () => {
    records = Array.from({ length: 1005 }, (_, index) => ({
      ...activity(index, index === 2 || index === 502 || index === 1002),
      type: index < 1000 ? 'Protocol Installed' : 'User Login',
    }));
    const [spanish, english] = await Promise.all([
      fetchActivities(
        {
          ...params,
          q: 'añadió',
          sortField: 'type',
          sort: 'asc',
          page: 2,
          perPage: 1,
        },
        'es',
      ),
      fetchActivities(
        {
          ...params,
          q: 'added',
          sortField: 'type',
          sort: 'asc',
          page: 2,
          perPage: 1,
        },
        'en',
      ),
    ]);
    expect(spanish.events.map(({ id }) => id)).toEqual(['event-0002']);
    expect(english.events.map(({ id }) => id)).toEqual(['event-0502']);
    expect(spanish.pageCount).toBe(3);
    expect(english.pageCount).toBe(3);
  });
});
