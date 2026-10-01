import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSiteContent } from '~/lib/siteContent';

const validFiles = {
  'latest-news.csv': `id,title_en,title_es,title_zh-Hans,title_de,href
second,Second news,Segunda noticia,第二条新闻,Zweite Meldung,https://example.com/second
first,First news,Primera noticia,第一条新闻,Erste Meldung,https://example.com/first
`,
  'publications.csv': `id,title_en,title_es,title_zh-Hans,title_de,source_en,source_es,source_zh-Hans,source_de,authors,href,year
p1,Publication 1,Publicación 1,出版物 1,Publikation 1,Journal 1,Revista 1,期刊 1,Zeitschrift 1,Author 1,https://example.com/p1,2021
p2,Publication 2,Publicación 2,出版物 2,Publikation 2,Journal 2,Revista 2,期刊 2,Zeitschrift 2,Author 2,https://example.com/p2,2022
p3,Publication 3,Publicación 3,出版物 3,Publikation 3,Journal 3,Revista 3,期刊 3,Zeitschrift 3,Author 3,https://example.com/p3,2023
p4,Publication 4,Publicación 4,出版物 4,Publikation 4,Journal 4,Revista 4,期刊 4,Zeitschrift 4,Author 4,https://example.com/p4,2024
p5,Publication 5,Publicación 5,出版物 5,Publikation 5,Journal 5,Revista 5,期刊 5,Zeitschrift 5,Author 5,https://example.com/p5,2025
p6,Publication 6,Publicación 6,出版物 6,Publikation 6,Journal 6,Revista 6,期刊 6,Zeitschrift 6,Author 6,https://example.com/p6,2026
p7,Publication 7,Publicación 7,出版物 7,Publikation 7,Journal 7,Revista 7,期刊 7,Zeitschrift 7,Author 7,https://example.com/p7,2027
p8,Publication 8,Publicación 8,出版物 8,Publikation 8,Journal 8,Revista 8,期刊 8,Zeitschrift 8,Author 8,https://example.com/p8,2028
p9,Publication 9,Publicación 9,出版物 9,Publikation 9,Journal 9,Revista 9,期刊 9,Zeitschrift 9,Author 9,https://example.com/p9,2029
`,
  'grants.csv': `id,title_en,title_es,title_zh-Hans,title_de,pis_en,pis_es,pis_zh-Hans,pis_de,description_en,description_es,description_zh-Hans,description_de,logo,logo_alt_en,logo_alt_es,logo_alt_zh-Hans,logo_alt_de,href
grant,Grant,Subvención,资助,Förderung,PI: Person,IP: Persona,首席研究员：某人,Projektleitung: Person,"Line one, with comma
Line two",Línea uno,第一行,Zeile eins,/images/logo.png,Institution,Institución,机构,Institution,https://example.com/grant
`,
  'core-team.csv': `id,name,institution_en,institution_es,institution_zh-Hans,institution_de,photo
person,Person Name,Institution,Institución,机构,Institution,/images/person.jpg
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

  it('selects Simplified Chinese fields and preserves CSV row order', async () => {
    const content = await loadSiteContent('zh-Hans', directory);

    expect(content.newsItems.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'second', title: '第二条新闻' },
      { id: 'first', title: '第一条新闻' },
    ]);
  });

  it('selects German fields and preserves CSV row order', async () => {
    const content = await loadSiteContent('de', directory);

    expect(content.newsItems.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'second', title: 'Zweite Meldung' },
      { id: 'first', title: 'Erste Meldung' },
    ]);
  });

  it('returns every publication row in file order', async () => {
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
      'p9',
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
      source: `id,title_en,title_es,title_zh-Hans,title_de,href
duplicate,First,Primera,第一,Erste,https://example.com/first
duplicate,Second,Segunda,第二,Zweite,https://example.com/second
`,
    },
    {
      name: 'blank translation',
      filename: 'grants.csv',
      row: 'row 2',
      field: 'description_es',
      source: `id,title_en,title_es,title_zh-Hans,title_de,pis_en,pis_es,pis_zh-Hans,pis_de,description_en,description_es,description_zh-Hans,description_de,logo,logo_alt_en,logo_alt_es,logo_alt_zh-Hans,logo_alt_de,href
grant,Grant,Subvención,资助,Förderung,PI: Person,IP: Persona,首席研究员：某人,Projektleitung: Person,Description,,描述,Beschreibung,/images/logo.png,Institution,Institución,机构,Institution,https://example.com/grant
`,
    },
    {
      name: 'invalid URL',
      filename: 'publications.csv',
      row: 'row 2',
      field: 'href',
      source: `id,title_en,title_es,title_zh-Hans,title_de,source_en,source_es,source_zh-Hans,source_de,authors,href,year
p1,Publication,Publicación,出版物,Publikation,Journal,Revista,期刊,Zeitschrift,Author,http://example.com/p1,2024
`,
    },
    {
      name: 'invalid year',
      filename: 'publications.csv',
      row: 'row 2',
      field: 'year',
      source: `id,title_en,title_es,title_zh-Hans,title_de,source_en,source_es,source_zh-Hans,source_de,authors,href,year
p1,Publication,Publicación,出版物,Publikation,Journal,Revista,期刊,Zeitschrift,Author,https://example.com/p1,26
`,
    },
    {
      name: 'unsafe internal URL',
      filename: 'latest-news.csv',
      row: 'row 2',
      field: 'href',
      source: `id,title_en,title_es,title_zh-Hans,title_de,href
unsafe,Unsafe news,Noticia insegura,不安全的新闻,Unsichere Meldung,/\\evil.com
`,
    },
    {
      name: 'invalid image',
      filename: 'core-team.csv',
      row: 'row 2',
      field: 'photo',
      source: `id,name,institution_en,institution_es,institution_zh-Hans,institution_de,photo
person,Person Name,Institution,Institución,机构,Institution,person.jpg
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
      'id,title_en,title_es,title_zh-Hans,title_de,href\n',
    );

    await expect(loadSiteContent('en-US', directory)).rejects.toThrow(
      'latest-news.csv: dataset must contain at least one row',
    );
  });
});
