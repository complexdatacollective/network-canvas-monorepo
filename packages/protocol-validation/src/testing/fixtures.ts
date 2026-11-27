/**
 * Builders for tests of protocols, published to the workspace only (the
 * package's source `exports`, not its npm `publishConfig`): every package's
 * tests build their fixtures with these, so that no test writes the grammar
 * of a protocol by hand.
 */

import { fieldBlockMarkdown } from '../localization/fieldBlock.ts';

/** The id of a field, read leniently: a field without one is not placed. */
const fieldIdOf = (field: object): string | undefined => {
  const id: unknown = Reflect.get(field, 'id');
  return typeof id === 'string' ? id : undefined;
};

/**
 * A form for a test: its `fields`, and a document in `locale` that places
 * each field that has an id, in order, after `before` (markdown, such as a
 * heading and a paragraph) and with nothing else.
 */
export const formOf = <Field extends object>(
  fields: readonly Field[],
  {
    before,
    locale = 'en',
  }: Readonly<{ before?: string; locale?: string }> = {},
) => ({
  content: {
    [locale]: [
      ...(before === undefined ? [] : [before]),
      ...fields.flatMap((field) => {
        const id = fieldIdOf(field);
        return id === undefined ? [] : [fieldBlockMarkdown(id)];
      }),
    ].join('\n\n'),
  },
  fields: [...fields],
});
