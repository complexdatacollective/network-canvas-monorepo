import { describe, expect, it, vi } from 'vitest';

import {
  type Codebook,
  type LocalizedString,
  type Stage,
  type Variables,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

import { translationText } from '../../localization/localizedText.ts';
import { enIntl } from '../../testing/i18n.ts';
import { testTypeId, testVariableId, testId } from '../../testing/testId.ts';
import { operatorsForSubject, ruleVariableTypes } from '../operators.ts';
import type { OperandOptionProblem } from '../ruleCodebook.ts';
import {
  operandDateProblems,
  operandOptionProblems,
  ruleAttributeType,
  ruleEntityTypeExists,
  ruleEntityTypeOptions,
  ruleOperatorOptions,
  ruleOperatorSubject,
  ruleVariableChoices,
  ruleLayoutOptions,
  ruleVariableDateParameters,
  ruleVariableOptions,
  ruleVariables,
  ruleVariableType,
} from '../ruleCodebook.ts';
import { testCodebook } from './fixtures.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const FRIEND = testTypeId('friend');
const GHOST = testTypeId('ghost');
const AGE = testVariableId('age');
const BORN = testVariableId('born');
const EGO_NAME = testVariableId('egoName');
const FAVOURITE_COLOUR = testVariableId('favouriteColour');
const HOME = testVariableId('home');
const MET = testVariableId('met');
const MOOD = testVariableId('mood');
const NOTE = testVariableId('note');
const SECRET = testVariableId('secret');
const STRENGTH = testVariableId('strength');
const CALLED = testVariableId('called');
const GRADUATED = testVariableId('graduated');
const JOINED = testVariableId('joined');
const RANK = testVariableId('rank');
const SEEN = testVariableId('seen');
const UNNAMED = testVariableId('unnamed');
const BLANK = testTypeId('blank');
const PLAIN = testTypeId('plain');
const AGREES = testVariableId('agrees');

const inEnglish = (label: LocalizedString) => translationText(label, 'en');

const codebook = testCodebook;

describe('the rule variable-type catalogue', () => {
  it('is the schema’s own catalogue, less the types no operand can be entered for', () => {
    // Read from the schema rather than from a host display configuration, and
    // narrowed by one thing only: whether the protocol can hold a value to
    // compare an attribute of that type against. Every variable type has
    // one; a layout, which is answered with a point, is not a variable type.
    expect([...ruleVariableTypes].toSorted()).toEqual(
      [...VariableTypesKeys].toSorted(),
    );
  });

  it('offers operators for every type it offers at all', () => {
    for (const type of ruleVariableTypes) {
      expect(ruleOperatorOptions(type).length).toBeGreaterThan(0);
    }
    expect(ruleOperatorOptions('layout')).toEqual([]);
  });

  it('offers only the existence operators before an attribute is chosen', () => {
    expect(ruleOperatorOptions('exists').map(({ value }) => value)).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
    expect([...operatorsForSubject('exists')]).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
  });

  it('offers text attributes their four comparisons', () => {
    expect(ruleOperatorOptions('text').map(({ value }) => value)).toEqual([
      'EXACTLY',
      'NOT',
      'CONTAINS',
      'DOES_NOT_CONTAIN',
    ]);
  });

  it('offers a categorical attribute the operators that count its options', () => {
    // Only a multi-select attribute HAS a number of selected options, so these
    // four are offered for it and for nothing else.
    expect(
      ruleOperatorOptions('categorical').map(({ value }) => value),
    ).toEqual([
      'EXACTLY',
      'NOT',
      'INCLUDES',
      'EXCLUDES',
      'OPTIONS_GREATER_THAN',
      'OPTIONS_LESS_THAN',
      'OPTIONS_EQUALS',
      'OPTIONS_NOT_EQUALS',
    ]);
    expect(ruleOperatorOptions('ordinal').map(({ value }) => value)).toEqual([
      'EXACTLY',
      'NOT',
      'INCLUDES',
      'EXCLUDES',
    ]);
  });
});

/**
 * The list is narrower than the schema on purpose, and a native select shows
 * its placeholder for a value that matches no option — so an operator left out
 * of the list is one the researcher cannot see, cannot correct, and saves back
 * unchanged.
 */
describe('an operator a stored rule holds that the list leaves out', () => {
  it('adds a presence operator the schema still accepts, selectable', () => {
    const options = ruleOperatorOptions('number', 'EXISTS');

    expect(options.at(-1)).toEqual({
      value: 'EXISTS',
      label: 'exists (no longer offered)',
    });
    // The schema accepts it, so the researcher is being shown their own rule
    // rather than sent to fix something that is not wrong.
    expect(options.at(-1)?.disabled).toBeUndefined();
  });

  it('adds an operator the attribute’s type does not allow, disabled', () => {
    expect(ruleOperatorOptions('text', 'GREATER_THAN').at(-1)).toEqual({
      value: 'GREATER_THAN',
      label: 'is greater than (not valid for this attribute)',
      disabled: true,
    });
  });

  it('adds nothing for an operator the list already holds, or for a non-operator', () => {
    const offered = ruleOperatorOptions('number');
    expect(ruleOperatorOptions('number', 'GREATER_THAN')).toEqual(offered);
    expect(ruleOperatorOptions('number', undefined)).toEqual(offered);
    expect(ruleOperatorOptions('number', 'NOT_AN_OPERATOR')).toEqual(offered);
  });
});

describe('the operators an encrypted attribute is offered', () => {
  const variables = ruleVariables(codebook, 'node', PERSON);

  it('asks only whether it is answered, where rules read interview answers', () => {
    expect(ruleOperatorSubject(variables, SECRET)).toBe('encrypted');
    expect(ruleOperatorOptions('encrypted').map(({ value }) => value)).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
  });

  it('compares it like any text attribute where the rule set allows that', () => {
    expect(
      ruleOperatorSubject(variables, SECRET, {
        allowEncryptedAttributes: true,
      }),
    ).toBe('text');
  });

  it('leaves an attribute that is not encrypted to its type', () => {
    expect(ruleOperatorSubject(variables, NOTE)).toBe('text');
    expect(ruleOperatorSubject(variables, AGE)).toBe('number');
  });

  it('offers the presence operators for a rule with no attribute it can type', () => {
    expect(ruleOperatorSubject(variables, undefined)).toBe('exists');
    expect(ruleOperatorSubject(variables, FAVOURITE_COLOUR)).toBe('exists');
  });

  it('keeps a stored comparison on screen, disabled', () => {
    // The schema refuses every comparison on it, so the stored one has to be
    // replaced rather than saved back.
    expect(ruleOperatorOptions('encrypted', 'EXACTLY').at(-1)).toEqual({
      value: 'EXACTLY',
      label: 'is exactly (not valid for this attribute)',
      disabled: true,
    });
  });
});

/**
 * A rule's operand is compared against the stored answer verbatim, so the date
 * control has to be the same control the attribute is answered with — bounds
 * included. Reading only the resolution left a rule able to name a date the
 * attribute's own picker could never record.
 */
describe('the date picker a rule’s operand inherits', () => {
  const variables: Readonly<Variables> = Object.freeze({
    [BORN]: {
      name: 'Born',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1800', max: '1810' },
    },
    [SEEN]: {
      name: 'Seen',
      type: 'datetime',
      component: 'DatePicker',
    },
    [MET]: {
      name: 'Met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { anchor: '2020-01-01', before: 30, after: 30 },
    },
    // The same picker with nothing authored on it, which is where the window
    // is derived from the clock rather than from the codebook.
    [CALLED]: {
      name: 'Called',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { before: 30 },
    },
    // A month-resolution picker, so a month outside 01-12 has somewhere to be
    // asked about — and with no bounds authored, so the window it offers is
    // the one the control synthesises.
    [JOINED]: {
      name: 'Joined',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'month' },
    },
    // The same, one resolution coarser: a bare year dropdown.
    [GRADUATED]: {
      name: 'Graduated',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year' },
    },
    [AGE]: { name: 'Age', type: 'number' },
  });

  it('carries every bound the attribute’s own picker honours', () => {
    // Stated as the two dates the picker resolves the authored bounds TO,
    // which is how it holds them internally and what its dropdowns are built
    // from: a coarse bound's absent month and day both read as 1, exactly as
    // `parseYmd` reads them. `compareDateStrings` truncates to the shorter of
    // the two before comparing, so a `"1800"` operand still sits on the floor
    // rather than below it.
    expect(ruleVariableDateParameters(variables, BORN)).toEqual({
      type: 'year',
      min: '1800-01-01',
      max: '1810-01-01',
    });
    expect(operandDateProblems(variables, BORN, 'EXACTLY', '1800')).toEqual([]);
    expect(operandDateProblems(variables, BORN, 'EXACTLY', '1799')).toEqual([
      { kind: 'outOfRange', value: '1799' },
    ]);
  });

  /**
   * A month or year DatePicker is not an input anyone types into: it is a pair
   * of closed dropdowns built from a window the control SYNTHESISES when the
   * codebook authors none — `DATE_PICKER_DEFAULT_MIN` through today. A stored
   * operand outside that window names a year the dropdown does not contain, so
   * no participant answer can ever equal it, and the operand control the rule
   * editor itself renders cannot select it either.
   *
   * `@codaco/interview`'s `buildDatePickerBoundProps` states the same
   * asymmetry from the submission side: it synthesises nothing for a
   * DatePicker precisely because "month/year resolutions render closed
   * dropdown lists that can't accept an out-of-window typed value in the first
   * place".
   */
  it('derives the window a coarse picker offers when the codebook authors none', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-27T12:00:00.000Z');
    try {
      expect(ruleVariableDateParameters(variables, JOINED)).toEqual({
        type: 'month',
        min: '1920-01-01',
        max: '2026-07-27',
      });
      expect(ruleVariableDateParameters(variables, GRADUATED)).toEqual({
        type: 'year',
        min: '1920-01-01',
        max: '2026-07-27',
      });

      expect(
        operandDateProblems(variables, GRADUATED, 'EXACTLY', '1800'),
      ).toEqual([{ kind: 'outOfRange', value: '1800' }]);
      expect(
        operandDateProblems(variables, JOINED, 'EXACTLY', '1919-12'),
      ).toEqual([{ kind: 'outOfRange', value: '1919-12' }]);
      expect(
        operandDateProblems(variables, JOINED, 'EXACTLY', '2027-01'),
      ).toEqual([{ kind: 'outOfRange', value: '2027-01' }]);

      // And every date the dropdowns DO offer is left alone.
      expect(
        operandDateProblems(variables, GRADUATED, 'EXACTLY', '1920'),
      ).toEqual([]);
      expect(
        operandDateProblems(variables, JOINED, 'EXACTLY', '1950-06'),
      ).toEqual([]);
      expect(
        operandDateProblems(variables, JOINED, 'EXACTLY', '2026-07'),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invents no bound the codebook does not hold', () => {
    expect(ruleVariableDateParameters(variables, SEEN)).toEqual({
      type: 'full',
    });
  });

  /**
   * A relative date picker names no `min`/`max` of its own — it names a window
   * — and the interview turns that window into the hard bounds a submitted
   * answer is validated against (`buildDatePickerBoundProps`). Reading the
   * parameters verbatim found no bound and left the rule editor free to
   * compare against a date no participant can ever give.
   */
  it('derives the window a relative date picker actually offers', () => {
    expect(ruleVariableDateParameters(variables, MET)).toEqual({
      type: 'full',
      min: '2019-12-02',
      max: '2020-01-31',
    });
  });

  it('anchors an unanchored relative date picker on today, as the picker does', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-27T12:00:00.000Z');
    try {
      expect(ruleVariableDateParameters(variables, CALLED)).toEqual({
        type: 'full',
        min: '2026-06-27',
        max: '2026-07-27',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives anything that is not a date attribute the default picker', () => {
    expect(ruleVariableDateParameters(variables, AGE)).toEqual({
      type: 'full',
    });
    expect(ruleVariableDateParameters(variables, undefined)).toEqual({
      type: 'full',
    });
  });

  /**
   * The same picker read from the other side: a date a rule ALREADY holds,
   * against the picker the attribute has now.
   *
   * The resolution and the bounds are ordinary edits to the variable, made
   * long after the rule was written and by someone who cannot see it — and
   * nothing else can catch the result. The operand table asks only that a
   * date operand be text, the protocol schema asks the same, and the
   * interview compares the operand against the stored answer verbatim.
   */
  describe('a date the rule already holds', () => {
    it('reports one recorded at a resolution the attribute no longer uses', () => {
      expect(
        operandDateProblems(variables, BORN, 'EXACTLY', '2020-05'),
      ).toEqual([
        { kind: 'wrongResolution', value: '2020-05', resolution: 'year' },
      ]);
      // The other direction of the same retype: an attribute answered with a
      // full date, holding a rule written when it recorded years.
      expect(operandDateProblems(variables, SEEN, 'EXACTLY', '2020')).toEqual([
        { kind: 'wrongResolution', value: '2020', resolution: 'full' },
      ]);
    });

    it('reports one outside the dates the attribute can record', () => {
      expect(operandDateProblems(variables, BORN, 'EXACTLY', '1799')).toEqual([
        { kind: 'outOfRange', value: '1799' },
      ]);
      expect(operandDateProblems(variables, BORN, 'EXACTLY', '1811')).toEqual([
        { kind: 'outOfRange', value: '1811' },
      ]);
    });

    it('says nothing about a date the attribute can still record', () => {
      // Including both bounds themselves, which are dates the picker offers.
      for (const value of ['1800', '1805', '1810']) {
        expect(operandDateProblems(variables, BORN, 'EXACTLY', value)).toEqual(
          [],
        );
      }
      expect(
        operandDateProblems(variables, SEEN, 'EXACTLY', '2020-05-14'),
      ).toEqual([]);
    });

    it('reports one outside a relative picker’s window', () => {
      expect(
        operandDateProblems(variables, MET, 'EXACTLY', '2019-12-01'),
      ).toEqual([{ kind: 'outOfRange', value: '2019-12-01' }]);
      expect(
        operandDateProblems(variables, MET, 'EXACTLY', '2020-02-01'),
      ).toEqual([{ kind: 'outOfRange', value: '2020-02-01' }]);
      // Both ends of the window are dates the picker offers.
      for (const value of ['2019-12-02', '2020-01-01', '2020-01-31']) {
        expect(operandDateProblems(variables, MET, 'EXACTLY', value)).toEqual(
          [],
        );
      }
    });

    /**
     * A rule names the anchor its picker had when it was written; an
     * UNANCHORED relative picker re-derives its window from the clock on every
     * answer, so the same operand slides out of range as time passes. The
     * editor reports against the window as of today — which is the window the
     * interview will apply to the next answer — rather than against the one
     * that was current when the rule was authored.
     */
    it('judges an unanchored window as of today, not as of the day the rule was written', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime('2026-07-27T12:00:00.000Z');
        expect(
          operandDateProblems(variables, CALLED, 'EXACTLY', '2026-07-01'),
        ).toEqual([]);

        vi.setSystemTime('2026-09-01T12:00:00.000Z');
        expect(
          operandDateProblems(variables, CALLED, 'EXACTLY', '2026-07-01'),
        ).toEqual([{ kind: 'outOfRange', value: '2026-07-01' }]);
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * A date of the right shape that the calendar does not have. The native
     * date and month controls sanitise these away rather than committing
     * them, so no participant answer can ever equal one — but the protocol
     * schema holds a rule operand as `unknown`, so an imported or hand-edited
     * protocol reaches here with one.
     */
    it('reports one the calendar does not have', () => {
      expect(
        operandDateProblems(variables, SEEN, 'EXACTLY', '2020-02-31'),
      ).toEqual([{ kind: 'impossibleDate', value: '2020-02-31' }]);
      expect(
        operandDateProblems(variables, SEEN, 'EXACTLY', '2020-13-01'),
      ).toEqual([{ kind: 'impossibleDate', value: '2020-13-01' }]);
      expect(
        operandDateProblems(variables, JOINED, 'EXACTLY', '2020-13'),
      ).toEqual([{ kind: 'impossibleDate', value: '2020-13' }]);
      // A leap day IS on the calendar, in a leap year and not otherwise.
      expect(
        operandDateProblems(variables, SEEN, 'EXACTLY', '2020-02-29'),
      ).toEqual([]);
      expect(
        operandDateProblems(variables, SEEN, 'EXACTLY', '2021-02-29'),
      ).toEqual([{ kind: 'impossibleDate', value: '2021-02-29' }]);
    });

    it('says nothing about an operand that is not a date at all', () => {
      // A pattern comparison's operand is a regular expression, which is text
      // at any resolution — `.*` is not a date the picker has to be able to
      // record, and reporting it would refuse a rule that works.
      expect(operandDateProblems(variables, BORN, 'CONTAINS', '18')).toEqual(
        [],
      );
      // A rule against an attribute that is not a date, and one whose operand
      // has not been entered yet: unfinished, and reported as unfinished.
      expect(operandDateProblems(variables, AGE, 'EXACTLY', 5)).toEqual([]);
      expect(
        operandDateProblems(variables, BORN, 'EXACTLY', undefined),
      ).toEqual([]);
      expect(operandDateProblems(variables, BORN, 'EXACTLY', '')).toEqual([]);
    });
  });
});

/**
 * A codebook holds shapes the editor's own fixtures do not: an edge authored
 * without a colour, entities and attributes whose researcher-facing name has
 * been emptied, a boolean variable carrying the labels its control puts on
 * true and false.
 */
describe('codebook entries that are legal but sparse', () => {
  const sparseCodebook: Readonly<Codebook> = Object.freeze({
    node: {
      [BLANK]: {
        name: '',
        color: 'node-color-seq-4',
        shape: { default: 'circle' },
        variables: {
          [UNNAMED]: { name: '', type: 'text' },
          [AGREES]: {
            name: 'Agrees',
            type: 'boolean',
            options: [
              { label: { en: 'Yes' }, value: true },
              { label: { en: 'No' }, value: false },
            ],
          },
          [RANK]: {
            name: 'Rank',
            type: 'ordinal',
            options: [
              { id: testId('option/Rank/1'), label: { en: '' }, value: 1 },
            ],
          },
        },
      },
    },
    // No colour: the schema leaves an edge's colour optional.
    edge: { [PLAIN]: { name: '' } },
  });

  it('falls back to the first edge colour when an edge has none', () => {
    expect(ruleEntityTypeOptions(sparseCodebook, 'edge', {})).toEqual([
      { value: PLAIN, label: PLAIN, color: 'edge-color-seq-1' },
    ]);
  });

  it('names an entity type and an attribute by id when neither has a name', () => {
    // A blank label would leave the researcher with a rule they cannot read,
    // and a radio with no accessible name at all.
    expect(ruleEntityTypeOptions(sparseCodebook, 'node', {})[0]?.label).toBe(
      BLANK,
    );
    expect(
      ruleVariableOptions(ruleVariables(sparseCodebook, 'node', BLANK)),
    ).toContainEqual({
      value: UNNAMED,
      label: UNNAMED,
      type: 'text',
    });
  });

  it('does not offer a boolean control’s own labels as rule operands', () => {
    // A boolean variable carries `options`, but they are what its input
    // control prints for true and false — comparing the attribute against the
    // word "Yes" is a rule that matches nothing.
    const variables = ruleVariables(sparseCodebook, 'node', BLANK);
    expect(ruleVariableChoices(variables, AGREES, inEnglish)).toBeUndefined();
  });

  it('names an authored option by its value when it has no label', () => {
    const variables = ruleVariables(sparseCodebook, 'node', BLANK);
    expect(ruleVariableChoices(variables, RANK, inEnglish)).toEqual([
      { value: 1, label: '1' },
    ]);
  });
});

describe('reading the codebook for a rule', () => {
  it('offers an alter rule nothing until an entity type is chosen', () => {
    expect(ruleVariables(codebook, 'node', undefined)).toEqual({});
  });

  it('offers the variables of the entity type a rule names', () => {
    expect(
      ruleVariableOptions(ruleVariables(codebook, 'node', PERSON)),
    ).toEqual([
      { value: AGE, label: 'Age', type: 'number' },
      { value: MOOD, label: 'Mood', type: 'categorical' },
      { value: NOTE, label: 'Note', type: 'text' },
      { value: BORN, label: 'Born', type: 'datetime' },
      // Whether it was answered can still be asked of an encrypted attribute.
      { value: SECRET, label: 'Secret', type: 'text' },
    ]);
  });

  it('lists a layout as unavailable only for node types that have it', () => {
    // A layout no rule can be built against is MARKED rather than left out.
    // Dropping it made "not offered" and "not in the codebook" the same thing
    // to a picker reading this list, and a stored layout — still in the
    // codebook — was reported as one the researcher had deleted. It is
    // listed for the node types a stage places in it, and no others.
    const stages: Stage[] = [
      {
        id: testId('sociogram'),
        type: 'Sociogram',
        label: { en: 'Sociogram' },
        subject: { entity: 'node', types: [PERSON] },
        layout: HOME,
        background: { concentricCircles: 3 },
        prompts: [{ id: testId('prompt'), text: { en: 'Place people' } }],
      },
    ];
    expect(ruleLayoutOptions(codebook, stages, PERSON, undefined)).toEqual([
      {
        value: HOME,
        label: 'Home',
        unavailableReason:
          'This attribute cannot be used in a rule. Choose another one.',
        unavailableForType: true,
      },
    ]);
    expect(ruleLayoutOptions(codebook, stages, PLACE, undefined)).toEqual([]);
    expect(ruleAttributeType(codebook, 'node', PERSON, HOME)).toBe('layout');
  });

  it('resolves a stored rule’s layout by name from a codebook given without stages', () => {
    // A codebook given to a rule editor outside a stage editor carries no
    // stages to say which node types have the layout. The layout a stored
    // rule names is still listed by its name, and read as a layout rather
    // than as an attribute the codebook has lost.
    expect(ruleLayoutOptions(codebook, undefined, PLACE, HOME)).toEqual([
      {
        value: HOME,
        label: 'Home',
        unavailableReason:
          'This attribute cannot be used in a rule. Choose another one.',
        unavailableForType: true,
      },
    ]);
    expect(ruleLayoutOptions(codebook, undefined, PLACE, undefined)).toEqual(
      [],
    );
    expect(ruleAttributeType(codebook, 'node', PLACE, HOME)).toBe('layout');
    expect(ruleAttributeType(codebook, 'edge', FRIEND, HOME)).toBeUndefined();
  });

  it('reads an ego rule against the ego codebook', () => {
    expect(
      ruleVariableOptions(ruleVariables(codebook, 'ego', undefined)),
    ).toEqual([{ value: EGO_NAME, label: 'EgoName', type: 'text' }]);
  });

  it('offers nothing for an entity type the codebook no longer has', () => {
    expect(ruleVariables(codebook, 'node', GHOST)).toEqual({});
    expect(ruleEntityTypeExists(codebook, 'node', GHOST)).toBe(false);
    expect(ruleEntityTypeExists(codebook, 'node', PERSON)).toBe(true);
  });

  it('answers undefined for the type of a deleted attribute', () => {
    const variables = ruleVariables(codebook, 'node', PERSON);
    expect(ruleVariableType(variables, FAVOURITE_COLOUR)).toBeUndefined();
    expect(ruleVariableType(variables, AGE)).toBe('number');
  });

  it('keeps option values in the type the codebook authored them with', () => {
    const variables = ruleVariables(codebook, 'node', PERSON);
    expect(ruleVariableChoices(variables, MOOD, inEnglish)).toEqual([
      { value: 'happy', label: 'Happy' },
      { value: 'sad', label: 'Sad' },
    ]);
    expect(ruleVariableChoices(variables, AGE, inEnglish)).toBeUndefined();
  });

  it('lists the entity types a rule may be pointed at', () => {
    expect(ruleEntityTypeOptions(codebook, 'node', {})).toEqual([
      {
        value: PERSON,
        label: 'Person',
        color: 'node-color-seq-2',
        shape: 'square',
      },
      {
        value: PLACE,
        label: 'Place',
        color: 'node-color-seq-3',
        shape: 'circle',
      },
    ]);
    expect(ruleEntityTypeOptions(codebook, 'edge', {})).toEqual([
      { value: FRIEND, label: 'Friend', color: 'edge-color-seq-3' },
    ]);
  });
});

/**
 * A rule can be left naming an option that is no longer there — a collaborator
 * renames "Retired" to "Not working", or deletes it — and nothing else notices:
 * the attribute still exists, the operator is still legal for its type, and the
 * operand is still the shape an option value has.
 */
describe('an operand naming an option the attribute no longer offers', () => {
  const variables = ruleVariables(codebook, 'node', PERSON);

  it('names the option that went missing', () => {
    expect(
      operandOptionProblems(variables, MOOD, 'EXACTLY', 'retired'),
    ).toEqual([{ kind: 'unknownOption', value: 'retired' }]);
  });

  it('says nothing about an option the attribute still authors', () => {
    expect(operandOptionProblems(variables, MOOD, 'EXACTLY', 'happy')).toEqual(
      [],
    );
  });

  it('checks every member of a list operand', () => {
    expect(
      operandOptionProblems(variables, MOOD, 'INCLUDES', [
        'happy',
        'retired',
        'lapsed',
      ]),
    ).toEqual([
      { kind: 'unknownOption', value: 'retired' },
      { kind: 'unknownOption', value: 'lapsed' },
    ]);
  });

  it('holds the option to the type the codebook authored it with', () => {
    // The interview compares the operand against the stored answer by
    // identity, so the string "1" is not the option whose value is 1.
    const numericOptions: Readonly<Codebook> = {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [STRENGTH]: {
              name: 'Strength',
              type: 'ordinal',
              options: [
                {
                  id: testId('option/Strength/1'),
                  label: { en: 'Weak' },
                  value: 1,
                },
                {
                  id: testId('option/Strength/2'),
                  label: { en: 'Strong' },
                  value: 2,
                },
              ],
            },
          },
        },
      },
    };
    const ordinal = ruleVariables(numericOptions, 'node', PERSON);

    expect(operandOptionProblems(ordinal, STRENGTH, 'EXACTLY', 1)).toEqual([]);
    expect(operandOptionProblems(ordinal, STRENGTH, 'EXACTLY', '1')).toEqual([
      { kind: 'unknownOption', value: '1' },
    ]);
    // The widening that let a number attribute take a fraction has no business
    // here: an ordinal answers with one of its own options.
    expect(operandOptionProblems(ordinal, STRENGTH, 'EXACTLY', 0.5)).toEqual([
      { kind: 'unknownOption', value: 0.5 },
    ]);
  });

  it('says nothing about a comparison whose operand is not an option', () => {
    // A number attribute's operand is typed out, not picked, so there is no
    // option list to hold it to; a presence rule compares nothing at all.
    expect(operandOptionProblems(variables, AGE, 'EXACTLY', 41)).toEqual([]);
    expect(operandOptionProblems(variables, MOOD, 'EXISTS', 'retired')).toEqual(
      [],
    );
  });

  it('says nothing about an operand that has not been entered yet', () => {
    expect(
      operandOptionProblems(variables, MOOD, 'EXACTLY', undefined),
    ).toEqual([]);
    expect(operandOptionProblems(variables, MOOD, 'INCLUDES', [])).toEqual([]);
    // The three other spellings of "nothing has been entered": a null the
    // schema tolerates, and the empty values the two option controls hold
    // before anything is picked.
    expect(operandOptionProblems(variables, MOOD, 'EXACTLY', null)).toEqual([]);
    expect(operandOptionProblems(variables, MOOD, 'EXACTLY', '')).toEqual([]);
  });

  it('says nothing about an attribute the codebook has lost', () => {
    expect(
      operandOptionProblems(variables, FAVOURITE_COLOUR, 'EXACTLY', 'blue'),
    ).toEqual([]);
  });
});

/**
 * The v7→v8 migration coerces a boolean OPTION DEFINITION to its string form
 * (`true` becomes `"true"`) and leaves the rule operands that name it alone,
 * so a migrated protocol can hold `[true]` beside the option `"true"`. The
 * interview compares by identity, and `true !== "true"`: the rule reads
 * perfectly and can never match.
 *
 * Excluding such a value from the membership test — which a type guard in the
 * filter did — reported nothing at all about the one operand guaranteed never
 * to match.
 */
describe('an operand that is not the shape an option can have', () => {
  const variables = ruleVariables(codebook, 'node', PERSON);

  /**
   * `describedAs` is a message DESCRIPTOR, so the noun phrase is chosen in the
   * reader's language wherever the problem is finally rendered. Formatted here
   * so these assertions still name the words a researcher reads, and still
   * fail when that copy changes.
   */
  const asPhrases = (problems: readonly OperandOptionProblem[]) =>
    problems.map((problem) =>
      problem.kind === 'unusableValue'
        ? {
            kind: problem.kind,
            describedAs: enIntl.formatMessage(problem.describedAs),
          }
        : problem,
    );

  it('reports a boolean left behind by the migration', () => {
    expect(
      asPhrases(operandOptionProblems(variables, MOOD, 'INCLUDES', [true])),
    ).toEqual([{ kind: 'unusableValue', describedAs: 'a true/false value' }]);
  });

  it('reports a null member rather than skipping it', () => {
    expect(
      asPhrases(operandOptionProblems(variables, MOOD, 'INCLUDES', [null])),
    ).toEqual([{ kind: 'unusableValue', describedAs: 'an empty value' }]);
  });

  it('reports an object member', () => {
    expect(
      asPhrases(operandOptionProblems(variables, MOOD, 'INCLUDES', [{}])),
    ).toEqual([{ kind: 'unusableValue', describedAs: 'an object' }]);
  });

  it('reports a bare value that is not a list at all', () => {
    expect(
      asPhrases(operandOptionProblems(variables, MOOD, 'INCLUDES', true)),
    ).toEqual([{ kind: 'unusableValue', describedAs: 'a true/false value' }]);
  });

  it('reports every member of a mixed operand, in its own voice', () => {
    expect(
      asPhrases(
        operandOptionProblems(variables, MOOD, 'INCLUDES', [
          'happy',
          true,
          'retired',
          [1],
        ]),
      ),
    ).toEqual([
      { kind: 'unusableValue', describedAs: 'a true/false value' },
      { kind: 'unknownOption', value: 'retired' },
      { kind: 'unusableValue', describedAs: 'a list' },
    ]);
  });

  it('names the kind of value without choosing a language', () => {
    // The regression the descriptor exists for. A phrase chosen here would be
    // frozen into the editor's encoded refusal, and read as English inside an
    // otherwise Spanish sentence.
    const [problem] = operandOptionProblems(variables, MOOD, 'INCLUDES', true);
    expect(problem).toEqual({
      kind: 'unusableValue',
      describedAs: expect.objectContaining({
        id: 'protocolBuilder.ruleCodebook.unusableValueBoolean',
      }),
    });
  });
});
