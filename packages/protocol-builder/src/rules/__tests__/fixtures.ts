import type { Codebook } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import type { RuleDraft } from '../rule.ts';

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

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const personSection = sectionId({ kind: 'codebookNode', typeId: 'person' });
const friendSection = sectionId({ kind: 'codebookEdge', typeId: 'friend' });
const egoSection = sectionId({ kind: 'codebookEgo' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });

/**
 * The protocol sections a rule test's editing session is opened on.
 *
 * Richer than `testCodebook` on purpose: the pure rule modules read a codebook,
 * while a test that drives the EDITOR needs attributes that make the editor's
 * own behaviour observable — a second attribute of the same type so a cleared
 * operator is evidence of the cascade, option values that are numbers so `1`
 * and `"1"` can be told apart, and one attribute no rule can be built on.
 */
const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Rule editing', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
  [personSection]: {
    name: 'Person',
    color: 'node-color-seq-2',
    shape: { default: 'square' },
    variables: {
      age: { name: 'Age', type: 'number' },
      // A second attribute of the SAME type, so a change of attribute leaves
      // the operator that was chosen for the first one still on offer: that is
      // what makes a cleared operator evidence of the cascade rather than of
      // the option simply having gone.
      height: { name: 'Height', type: 'number' },
      // A scalar is recorded as a number on a normalised scale, and is offered
      // the same comparison operators a number is.
      closeness: { name: 'Closeness', type: 'scalar' },
      // A yes/no attribute: the one whose operand control has a value for
      // every state it can be in, so "unanswered" cannot be one of them
      // unless the operand table says so.
      flag: { name: 'Flag', type: 'boolean', component: 'Boolean' },
      // Text, so an operator a NUMBER accepts can be stored against it.
      note: { name: 'Note', type: 'text' },
      // Answered with a point on the sociogram: an attribute the codebook
      // still describes, and that no rule can be built against.
      home: { name: 'Home', type: 'layout' },
      // A date attribute whose picker is bounded, and coarse enough that the
      // bounds are readable off the control the researcher meets.
      born: {
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '1800', max: '1810' },
      },
      mood: {
        name: 'Mood',
        type: 'categorical',
        options: [
          { label: 'Happy', value: 'happy' },
          { label: 'Sad', value: 'sad' },
        ],
      },
      // An option-bearing attribute whose option VALUES are numbers, which is
      // what makes the difference between `1` and `"1"` observable: the
      // interview compares an operand against the stored answer by identity.
      strength: {
        name: 'Strength',
        type: 'ordinal',
        options: [
          { label: 'Weak', value: 1 },
          { label: 'Strong', value: 2 },
        ],
      },
    },
  },
  [friendSection]: { name: 'Friend', color: 'edge-color-seq-3' },
  [egoSection]: { variables: { egoName: { name: 'EgoName', type: 'text' } } },
};

export const nodeRule = (id: string): RuleDraft => ({
  id,
  type: 'node',
  options: { type: 'person', operator: 'EXISTS' },
});

export function createSession(rules?: readonly RuleDraft[]) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: {
      label: 'Welcome',
      title: 'Welcome',
      items: [],
      ...(rules === undefined
        ? {}
        : { skipLogic: { filter: { rules: [...rules] } } }),
    },
    protocolSections: baseSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Rule editing',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}
