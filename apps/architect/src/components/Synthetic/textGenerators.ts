import type { SyntheticTextGenerator } from '@codaco/protocol-validation';

/**
 * How each text generator is named to a researcher.
 *
 * A record over the schema's own generator union, so a generator added to
 * `@codaco/protocol-validation` fails the typecheck here rather than rendering
 * its internal identifier — and one home for the wording, so the codebook
 * editor's select, its collapsed summary, and the read-only overview's
 * attribute table cannot come to name the same generator three ways.
 */
export const TEXT_GENERATOR_LABELS: Record<SyntheticTextGenerator, string> = {
  neutralWords: 'Neutral words',
  personName: 'Person names',
  firstName: 'First names',
  lastName: 'Last names',
  placeName: 'Place names',
  organisationName: 'Organisation names',
  occupation: 'Occupations',
  email: 'Email addresses',
  phoneNumber: 'Phone numbers',
  streetAddress: 'Street addresses',
  sentence: 'Sentences',
  paragraph: 'Paragraphs',
};
