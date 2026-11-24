import { describe, expect, it } from 'vitest';

import {
  type LocalizedString,
  migrateProtocol,
} from '@codaco/protocol-validation';
import {
  INFORMATION_PAGE_ASSETS,
  INFORMATION_PAGES,
  type InformationPageFixture,
  schema8MarkdownAsStandard,
} from '@codaco/protocol-validation/testing/information-pages';

import { SyntheticInterview } from '../SyntheticInterview.ts';
import type { AssetBlockInput, TextInput } from '../types.ts';

const SIZES: Readonly<Record<string, AssetBlockInput['size']>> = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
};

const isTextInput = (value: unknown): value is TextInput =>
  typeof value === 'string' || (typeof value === 'object' && value !== null);

/**
 * A schema 8 page as an Information stage's parts: its title, its text
 * item, and each file as a block. A synthetic interview is given schema 9
 * text, so a text item written as a string is given as the migration reads
 * it, rewritten as standard markdown (`schema8MarkdownAsStandard`); one already in
 * schema 9 form is given as it is. The other difference is the block's
 * settings: a block takes the settings it is given, where the migration
 * gives each item those it was shown with (an audio recording at the start
 * of the line, played once; no size for one).
 */
const stageInput = (page: InformationPageFixture) => {
  const [first, ...rest] = page.items;
  const text = first?.type === 'text' ? first.content : undefined;
  const files = first?.type === 'text' ? rest : page.items;
  const blocks = files.map((item): AssetBlockInput => {
    const { content: assetId, size, description } = item;
    if (typeof assetId !== 'string' || !(assetId in INFORMATION_PAGE_ASSETS)) {
      throw new Error(`Not a file of the pages: ${String(assetId)}`);
    }
    const audio =
      INFORMATION_PAGE_ASSETS[assetId as keyof typeof INFORMATION_PAGE_ASSETS]
        .type === 'audio';
    const sized = typeof size === 'string' ? SIZES[size] : undefined;
    return {
      assetId,
      ...(audio ? { align: 'start', loop: false } : sized && { size: sized }),
      ...(isTextInput(description) && { description }),
    };
  });
  return {
    title: isTextInput(page.title) ? page.title : '',
    ...(typeof text === 'string'
      ? { text: schema8MarkdownAsStandard(text, 'multiple') }
      : isTextInput(text) && { text }),
    blocks,
    label: page.label ?? 'Intro',
  };
};

// Every page, once through the 8 to 9 migration and once as an Information
// stage of a synthetic interview, in one protocol each.
const migrated = () => {
  const protocol = migrateProtocol(
    {
      name: 'Protocol',
      schemaVersion: 8,
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: INFORMATION_PAGE_ASSETS,
      stages: INFORMATION_PAGES.map((page) => ({
        id: page.name,
        type: 'Information',
        label: page.label ?? 'Intro',
        ...(page.title !== undefined && { title: page.title }),
        items: page.items,
      })),
    },
    9,
  );
  const synth = new SyntheticInterview();
  synth.setLocalization({ defaultLocale: 'en', locales: ['en'] });
  for (const page of INFORMATION_PAGES) {
    synth.addInformationStage(stageInput(page));
  }
  const built = synth.getProtocol().stages as { content?: LocalizedString }[];
  return INFORMATION_PAGES.map((page, index) => {
    const stage = protocol.stages[index];
    return {
      name: page.name,
      migration: stage?.type === 'Information' ? stage.content : undefined,
      synthetic: built[index]?.content,
    };
  });
};

// The two writers of a page join its parts alike once its text is in
// schema 9 form: what the migration writes from a schema 8 page is what a
// synthetic interview writes from the same parts in that form.
describe('an Information stage written as the 8 to 9 migration writes its page', () => {
  const cases = migrated();

  it('covers every page', () => {
    expect(cases).toHaveLength(INFORMATION_PAGES.length);
  });

  it.each(cases)('writes $name the same', ({ migration, synthetic }) => {
    expect(migration).toBeDefined();
    expect(synthetic).toEqual(migration);
  });
});
