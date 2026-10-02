import { describe, expect, it } from 'vitest';

import { GET } from '~/app/api/updates.json/route';
import { loadUpdates } from '~/lib/siteContent';
import { buildUpdatesFeed } from '~/lib/updatesFeed';

describe('buildUpdatesFeed', () => {
  it('keeps released versions only and makes site links absolute', () => {
    const feed = buildUpdatesFeed([
      {
        id: 'launch',
        date: '2026-03-10',
        kind: 'launch',
        versions: [
          { app: 'architect', version: '8.1.0' },
          { app: 'interviewer' },
        ],
        apps: ['architect', 'interviewer'],
        title: 'A launch',
        summary: 'See [the announcement](/launch-announcement).',
        details: 'Ask on [the forum](https://community.networkcanvas.com/).',
        link: '/launch-announcement',
      },
    ]);

    expect(feed).toEqual({
      schemaVersion: 1,
      updates: [
        {
          id: 'launch',
          date: '2026-03-10',
          kind: 'launch',
          versions: { architect: '8.1.0' },
          title: 'A launch',
          summary:
            'See [the announcement](https://networkcanvas.com/launch-announcement).',
          details: 'Ask on [the forum](https://community.networkcanvas.com/).',
          link: 'https://networkcanvas.com/launch-announcement',
        },
      ],
    });
  });

  it('serves every published update as JSON', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual(
      buildUpdatesFeed(await loadUpdates()),
    );
  });
});
