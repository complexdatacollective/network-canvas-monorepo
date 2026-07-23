import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSiteContent } from '~/lib/siteContent';

const validFiles = {
  'latest-news.csv': `id,title_en,title_es,href
second,Second news,Segunda noticia,https://example.com/second
first,First news,Primera noticia,https://example.com/first
`,
  'publications.csv': `id,title_en,title_es,source_en,source_es,authors,href
p1,Publication 1,Publicación 1,Journal 1,Revista 1,Author 1,https://example.com/p1
p2,Publication 2,Publicación 2,Journal 2,Revista 2,Author 2,https://example.com/p2
p3,Publication 3,Publicación 3,Journal 3,Revista 3,Author 3,https://example.com/p3
p4,Publication 4,Publicación 4,Journal 4,Revista 4,Author 4,https://example.com/p4
p5,Publication 5,Publicación 5,Journal 5,Revista 5,Author 5,https://example.com/p5
p6,Publication 6,Publicación 6,Journal 6,Revista 6,Author 6,https://example.com/p6
p7,Publication 7,Publicación 7,Journal 7,Revista 7,Author 7,https://example.com/p7
p8,Publication 8,Publicación 8,Journal 8,Revista 8,Author 8,https://example.com/p8
p9,Publication 9,Publicación 9,Journal 9,Revista 9,Author 9,https://example.com/p9
`,
  'grants.csv': `id,title_en,title_es,pis_en,pis_es,description_en,description_es,logo,logo_alt_en,logo_alt_es,href
grant,Grant,Subvención,PI: Person,IP: Persona,"Line one, with comma
Line two",Línea uno,/images/logo.png,Institution,Institución,https://example.com/grant
`,
  'core-team.csv': `id,name,institution_en,institution_es,photo
person,Person Name,Institution,Institución,/images/person.jpg
`,
};

async function writeValidFiles(directory: string): Promise<void> {
  await Promise.all(
    Object.entries(validFiles).map(([filename, source]) =>
      writeFile(join(directory, filename), source),
    ),
  );
}

describe('loadSiteContent', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'networkcanvas-content-'));
    await writeValidFiles(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('selects Spanish fields and preserves CSV row order', async () => {
    const content = await loadSiteContent('es', directory);

    expect(content.newsItems.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'second', title: 'Segunda noticia' },
      { id: 'first', title: 'Primera noticia' },
    ]);
  });

  it('limits publications to the first eight rows', async () => {
    const content = await loadSiteContent('en-US', directory);

    expect(content.publications.map(({ id }) => id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      'p7',
      'p8',
    ]);
  });

  it('parses quoted commas and embedded newlines', async () => {
    const content = await loadSiteContent('en-GB', directory);

    expect(content.grants[0]?.description).toBe(
      'Line one, with comma\nLine two',
    );
  });

  it('validates the shipped content files', async () => {
    const content = await loadSiteContent('en-US');

    expect(
      [
        content.newsItems,
        content.publications,
        content.grants,
        content.coreTeam,
      ].every((records) => records.length > 0),
    ).toBe(true);
    expect(content.newsItems).toContainEqual(
      expect.objectContaining({
        id: 'summer-2026-app-release',
        href: '/summer-2026-update',
      }),
    );
  });

  it.each([
    {
      name: 'duplicate id',
      filename: 'latest-news.csv',
      row: 'row 3',
      field: 'id',
      source: `id,title_en,title_es,href
duplicate,First,Primera,https://example.com/first
duplicate,Second,Segunda,https://example.com/second
`,
    },
    {
      name: 'blank translation',
      filename: 'grants.csv',
      row: 'row 2',
      field: 'description_es',
      source: `id,title_en,title_es,pis_en,pis_es,description_en,description_es,logo,logo_alt_en,logo_alt_es,href
grant,Grant,Subvención,PI: Person,IP: Persona,Description,,/images/logo.png,Institution,Institución,https://example.com/grant
`,
    },
    {
      name: 'invalid URL',
      filename: 'publications.csv',
      row: 'row 2',
      field: 'href',
      source: `id,title_en,title_es,source_en,source_es,authors,href
p1,Publication,Publicación,Journal,Revista,Author,http://example.com/p1
`,
    },
    {
      name: 'invalid image',
      filename: 'core-team.csv',
      row: 'row 2',
      field: 'photo',
      source: `id,name,institution_en,institution_es,photo
person,Person Name,Institution,Institución,person.jpg
`,
    },
  ])(
    'reports $name with file, row, and field',
    async ({ filename, row, field, source }) => {
      await writeFile(join(directory, filename), source);

      await expect(loadSiteContent('es', directory)).rejects.toThrow(
        `${filename}: ${row}: ${field}`,
      );
    },
  );

  it('reports a missing file as an empty dataset', async () => {
    await rm(join(directory, 'latest-news.csv'));

    await expect(loadSiteContent('en-US', directory)).rejects.toThrow(
      'latest-news.csv: dataset must contain at least one row',
    );
  });

  it('rejects a header-only dataset', async () => {
    await writeFile(
      join(directory, 'latest-news.csv'),
      'id,title_en,title_es,href\n',
    );

    await expect(loadSiteContent('en-US', directory)).rejects.toThrow(
      'latest-news.csv: dataset must contain at least one row',
    );
  });
});
