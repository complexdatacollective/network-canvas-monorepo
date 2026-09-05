import type { Codebook } from '@codaco/protocol-validation';

/**
 * One codebook every rule test reads against.
 *
 * Deliberately typed as the schema's own `Codebook` rather than a loose
 * record: the package reaches its codebook through the editor's protocol
 * context, which has already parsed it, and a fixture that could not be parsed
 * would prove nothing about what the rule code actually receives.
 */
export const testCodebook: Readonly<Codebook> = Object.freeze({
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        age: { name: 'Age', type: 'number' },
        mood: {
          name: 'Mood',
          type: 'categorical',
          options: [
            { label: 'Happy', value: 'happy' },
            { label: 'Sad', value: 'sad' },
          ],
        },
        note: { name: 'Note', type: 'text' },
        // A date attribute whose picker records years, between two bounds:
        // the two things a rule's date operand has to still agree with, and
        // both of them ordinary edits to the variable long after a rule was
        // written against it.
        born: {
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '1800', max: '1810' },
        },
        // Answered with a point on the sociogram, which no rule can compare
        // against: an attribute the codebook still describes and no rule can
        // be built on.
        home: { name: 'Home', type: 'layout' },
      },
    },
    place: {
      name: 'Place',
      color: 'node-color-seq-3',
      shape: { default: 'circle' },
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-3',
      variables: { closeness: { name: 'Closeness', type: 'scalar' } },
    },
  },
  ego: {
    variables: { egoName: { name: 'EgoName', type: 'text' } },
  },
});
