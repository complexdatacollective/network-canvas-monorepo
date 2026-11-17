import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import {
  STAGE_NAME_WORDING,
  stageNameWordingFor,
} from '../stage-wording/stage-names.ts';
import { stageSchema } from '../stages/index.ts';
import { SUPPLIED_LANGUAGES } from '../supplied-text.ts';

/** The arguments a message uses, and the keys of the one `select` it holds. */
const argumentsOf = (message: string) => {
  const elements = parse(message, { ignoreTag: true });
  const names = new Set<string>();
  const visit = (nodes: typeof elements) => {
    for (const node of nodes) {
      if (node.type === TYPE.argument || node.type === TYPE.select) {
        names.add(node.value);
      }
      if (node.type === TYPE.select) {
        for (const option of Object.values(node.options)) {
          visit(option.value);
        }
      }
    }
  };
  visit(elements);
  return names;
};

const STAGE_TYPES = stageSchema.options.map(
  (option) => option.shape.type.value,
);

describe('the stage name wording', () => {
  it('is supplied in exactly the languages Network Canvas supplies wording in', () => {
    expect(SUPPLIED_LANGUAGES.length).toBeGreaterThan(0);
    expect(Object.keys(STAGE_NAME_WORDING).toSorted()).toEqual(
      [...SUPPLIED_LANGUAGES].toSorted(),
    );
  });

  it('is found for a region of a supplied language, and for no other language', () => {
    expect(stageNameWordingFor('es-ES')).toBe(STAGE_NAME_WORDING.es);
    expect(stageNameWordingFor('zh-TW')).toBe(STAGE_NAME_WORDING['zh-Hant']);
    expect(stageNameWordingFor('es-MX')).toBeUndefined();
    expect(stageNameWordingFor('en-GB')).toBeUndefined();
    expect(stageNameWordingFor('sw')).toBeUndefined();
  });

  it('names every kind of stage in every language', () => {
    expect(STAGE_TYPES.length).toBeGreaterThan(0);
    for (const [locale, wording] of Object.entries(STAGE_NAME_WORDING)) {
      expect(Object.keys(wording.types).toSorted(), locale).toEqual(
        [...STAGE_TYPES].toSorted(),
      );
      for (const name of Object.values(wording.types)) {
        expect(name.trim(), locale).not.toBe('');
      }
    }
  });

  it('is a message with the same arguments in every language', () => {
    for (const [locale, wording] of Object.entries(STAGE_NAME_WORDING)) {
      expect(argumentsOf(wording.name), locale).toEqual(
        new Set(['parts', 'subject', 'type', 'qualifier']),
      );
      expect(argumentsOf(wording.panels), locale).toEqual(new Set(['source']));
      expect(argumentsOf(wording.media), locale).toEqual(new Set(['media']));
      expect(argumentsOf(wording.finish), locale).toEqual(new Set(['finish']));
    }
  });
});
