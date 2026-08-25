import { en, Faker } from '@faker-js/faker';

/**
 * Default participant-facing copy for a synthetically built protocol.
 *
 * Split out of the old `ValueGenerator`, which combined this with the
 * constrained value-drawing the deleted `generateNetwork` engine needed.
 * Building a protocol needs none of that machinery — only readable stand-in
 * text for prompts and presets an author did not supply.
 */
export class PromptTextGenerator {
  private faker: Faker;

  constructor(seed: number) {
    this.faker = new Faker({ locale: [en] });
    this.faker.seed(seed);
  }

  /**
   * Plausible prompt copy for a stage type, so a built protocol reads like a
   * real one in Storybook rather than showing placeholder text.
   */
  generatePromptText(stageType: string): string {
    switch (stageType) {
      case 'NameGenerator':
      case 'NameGeneratorQuickAdd':
        return 'Please name the people you are close to.';
      case 'NameGeneratorRoster':
        return 'Please select the people you know from this list.';
      case 'Sociogram':
        return 'Place people in the circles based on how close you are to them.';
      case 'Narrative':
        return 'Review the network and add any annotations.';
      case 'DyadCensus':
        return 'Do these two people know each other?';
      case 'OneToManyDyadCensus':
        return 'Does this person have a relationship with any of the people below?';
      case 'OrdinalBin':
        return 'How much do you agree with each person?';
      case 'CategoricalBin':
        return 'Which categories does each person belong to?';
      case 'EgoForm':
        return 'Please tell us about yourself.';
      case 'TieStrengthCensus':
        return 'How strong is the relationship between these two people?';
      case 'AlterForm':
        return 'Please provide details about each person.';
      case 'AlterEdgeForm':
        return 'Please describe each relationship.';
      case 'FamilyPedigree':
        return 'Please create your family pedigree by adding family members.';
      case 'Geospatial':
        return 'Please select a location on the map for this person.';
      default:
        return 'Please complete this step.';
    }
  }

  generatePresetLabel(): string {
    return this.faker.word.words(2);
  }
}
