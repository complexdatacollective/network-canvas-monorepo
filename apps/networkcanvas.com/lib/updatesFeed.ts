import type { Update } from '~/lib/siteContent';
import type { UpdateAppId, UpdateKind } from '~/lib/updateApps';

const websiteOrigin = 'https://networkcanvas.com';

const updatesFeedSchemaVersion = 1;

type UpdatesFeedEntry = {
  id: string;
  date: string;
  kind: UpdateKind;
  versions: Partial<Record<UpdateAppId, string>>;
  title: string;
  summary: string;
  details?: string;
  link?: string;
};

type UpdatesFeed = {
  schemaVersion: typeof updatesFeedSchemaVersion;
  updates: UpdatesFeedEntry[];
};

function absoluteUrl(href: string) {
  return href.startsWith('/') ? `${websiteOrigin}${href}` : href;
}

function absoluteMarkdownLinks(markdown: string) {
  return markdown.replace(
    /\]\((\/[^)\s]*)\)/g,
    (_match, href: string) => `](${absoluteUrl(href)})`,
  );
}

export function buildUpdatesFeed(updates: readonly Update[]): UpdatesFeed {
  return {
    schemaVersion: updatesFeedSchemaVersion,
    updates: updates.map((update) => ({
      id: update.id,
      date: update.date,
      kind: update.kind,
      versions: Object.fromEntries(
        update.versions.flatMap(({ app, version }) =>
          version ? [[app, version]] : [],
        ),
      ),
      title: update.title,
      summary: absoluteMarkdownLinks(update.summary),
      ...(update.details
        ? { details: absoluteMarkdownLinks(update.details) }
        : {}),
      ...(update.link ? { link: absoluteUrl(update.link) } : {}),
    })),
  };
}
