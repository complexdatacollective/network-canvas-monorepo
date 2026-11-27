import type { Codebook } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { testTypeId, testVariableId, testId } from '../../testing/testId.ts';
import type { RuleDraft } from '../rule.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const FRIEND = testTypeId('friend');
const AGE = testVariableId('age');
const BORN = testVariableId('born');
const CLOSENESS = testVariableId('closeness');
const EGO_NAME = testVariableId('egoName');
const HOME = testVariableId('home');
const MOOD = testVariableId('mood');
const NOTE = testVariableId('note');
const SECRET = testVariableId('secret');
const STRENGTH = testVariableId('strength');
const HEIGHT = testVariableId('height');
const FLAG = testVariableId('flag');

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
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        [AGE]: { name: 'Age', type: 'number' },
        [MOOD]: {
          name: 'Mood',
          type: 'categorical',
          options: [
            {
              id: testId('option/Mood/happy'),
              label: { en: 'Happy' },
              value: 'happy',
            },
            {
              id: testId('option/Mood/sad'),
              label: { en: 'Sad' },
              value: 'sad',
            },
          ],
        },
        [NOTE]: { name: 'Note', type: 'text' },
        // A date attribute whose picker records years, between two bounds:
        // the two things a rule's date operand has to still agree with, and
        // both of them ordinary edits to the variable long after a rule was
        // written against it.
        [BORN]: {
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '1800', max: '1810' },
        },
        // Encrypted: answered in the interview with ciphertext only the
        // participant's passphrase opens, so a rule over interview answers
        // cannot read it.
        [SECRET]: {
          name: 'Secret',
          type: 'text',
          encrypted: true,
        },
      },
    },
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-3',
      shape: { default: 'circle' },
    },
  },
  edge: {
    [FRIEND]: {
      name: 'Friend',
      color: 'edge-color-seq-3',
      variables: {
        [CLOSENESS]: {
          name: 'Closeness',
          type: 'scalar',
        },
      },
    },
  },
  ego: {
    variables: {
      [EGO_NAME]: { name: 'EgoName', type: 'text' },
    },
  },
  // A position on a sociogram, which no rule can compare against: a layout
  // the codebook still describes and no rule can be built on.
  layouts: {
    [HOME]: { name: 'Home' },
  },
});

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const personSection = sectionId({ kind: 'codebookNode', typeId: PERSON });
const friendSection = sectionId({ kind: 'codebookEdge', typeId: FRIEND });
const egoSection = sectionId({ kind: 'codebookEgo' });
const homeSection = sectionId({ kind: 'codebookLayout', layoutId: HOME });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });

/**
 * The protocol sections a rule test's editing session is opened on.
 *
 * Richer than `testCodebook` on purpose: the pure rule modules read a codebook,
 * while a test that drives the EDITOR needs attributes that make the editor's
 * own behaviour observable — a second attribute of the same type so a cleared
 * operator is evidence of the cascade, option values that are numbers so `1`
 * and `"1"` can be told apart, and one layout no rule can be built on.
 */
const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: {
    name: 'Rule editing',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
  },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: { en: 'Welcome' },
    title: { en: 'Welcome' },
    items: [],
  },
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-2',
    shape: { default: 'square' },
    variables: {
      [AGE]: { name: 'Age', type: 'number' },
      // A second attribute of the SAME type, so a change of attribute leaves
      // the operator that was chosen for the first one still on offer: that is
      // what makes a cleared operator evidence of the cascade rather than of
      // the option simply having gone.
      [HEIGHT]: { name: 'Height', type: 'number' },
      // A scalar is recorded as a number on a normalised scale, and is offered
      // the same comparison operators a number is.
      [CLOSENESS]: {
        name: 'Closeness',
        type: 'scalar',
      },
      // A yes/no attribute: the one whose operand control has a value for
      // every state it can be in, so "unanswered" cannot be one of them
      // unless the operand table says so.
      [FLAG]: {
        name: 'Flag',
        type: 'boolean',
        component: 'Boolean',
      },
      // Text, so an operator a NUMBER accepts can be stored against it.
      [NOTE]: { name: 'Note', type: 'text' },
      // A date attribute whose picker is bounded, and coarse enough that the
      // bounds are readable off the control the researcher meets.
      [BORN]: {
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '1800', max: '1810' },
      },
      [MOOD]: {
        name: 'Mood',
        type: 'categorical',
        options: [
          {
            id: testId('option/Mood/happy'),
            label: { en: 'Happy' },
            value: 'happy',
          },
          { id: testId('option/Mood/sad'), label: { en: 'Sad' }, value: 'sad' },
        ],
      },
      // An option-bearing attribute whose option VALUES are numbers, which is
      // what makes the difference between `1` and `"1"` observable: the
      // interview compares an operand against the stored answer by identity.
      [STRENGTH]: {
        name: 'Strength',
        type: 'ordinal',
        options: [
          { id: testId('option/Strength/1'), label: { en: 'Weak' }, value: 1 },
          {
            id: testId('option/Strength/2'),
            label: { en: 'Strong' },
            value: 2,
          },
        ],
      },
      // Encrypted, so only a panel over an imported file may name it.
      [SECRET]: {
        name: 'Secret',
        type: 'text',
        encrypted: true,
      },
    },
  },
  [friendSection]: {
    name: 'Friend',
    color: 'edge-color-seq-3',
  },
  [egoSection]: {
    variables: {
      [EGO_NAME]: { name: 'EgoName', type: 'text' },
    },
  },
  // A position on a sociogram: a layout the codebook still describes, and
  // that no rule can be built against.
  [homeSection]: { name: 'Home' },
};

export const nodeRule = (id: string): RuleDraft => ({
  id,
  type: 'node',
  options: { type: PERSON, operator: 'EXISTS' },
});

/**
 * The protocol a rule test's editor is opened over, with the stage carrying
 * whatever rules the test starts from.
 */
export function ruleSections(
  rules?: readonly RuleDraft[],
): Record<string, SectionDoc> {
  return {
    ...baseSections,
    [stageSection]: {
      ...baseSections[stageSection],
      ...(rules === undefined
        ? {}
        : { skipLogic: { filter: { rules: [...rules] } } }),
    },
  };
}
