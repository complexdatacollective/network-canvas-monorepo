import type { Faker } from '@faker-js/faker';

import type { SyntheticTextGenerator } from '@codaco/protocol-validation';

/**
 * The text each declarable generator produces. Keyed by the schema's own
 * generator list, so adding a generator there fails to typecheck here until
 * it can actually be drawn.
 *
 * Each takes the generator to draw from rather than closing over one: every
 * value in a synthetic interview comes from the session's own seeded stream,
 * and text drawn from a module-level faker would be text a seed does not fix.
 */
const GENERATORS: Record<SyntheticTextGenerator, (faker: Faker) => string> = {
  neutralWords: (faker) => faker.lorem.words(2),
  personName: (faker) => faker.person.fullName(),
  firstName: (faker) => faker.person.firstName(),
  lastName: (faker) => faker.person.lastName(),
  placeName: (faker) => faker.location.city(),
  organisationName: (faker) => faker.company.name(),
  occupation: (faker) => faker.person.jobTitle(),
  email: (faker) => faker.internet.email(),
  phoneNumber: (faker) => faker.phone.number(),
  streetAddress: (faker) => faker.location.streetAddress(),
  sentence: (faker) => faker.lorem.sentence(),
  paragraph: (faker) => faker.lorem.paragraph(),
};

/**
 * A value for a text variable, honouring its declared generator.
 *
 * `missingProbability` is deliberately NOT applied here: whether an unanswered
 * value is even possible depends on the interface doing the asking, which this
 * function cannot see. Callers that can leave a variable unanswered apply it
 * themselves; callers whose interface cannot (a quick-add name generator will
 * not create a node from an empty field) simply do not.
 */
export const generateTextValue = (
  generator: SyntheticTextGenerator,
  faker: Faker,
): string => GENERATORS[generator](faker);
