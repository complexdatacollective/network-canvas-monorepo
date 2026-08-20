import { describe, expect, it } from 'vitest';

import {
  buildComposerFieldOverlay,
  composerDraftValues,
  composerNormalizeField,
  composerValidationViews,
  crossFormRenderedVariables,
  isVariableUsedBySibling,
  sharedFormValidationView,
  sharedFormValidationViews,
} from '../composerHelpers';

describe('composerNormalizeField', () => {
  it('keeps id, component and parameters on the field but strips codebook + scaffolding props', () => {
    const out = composerNormalizeField({
      id: 'x',
      _createNewVariable: 'Age',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
      options: [{ label: 'a', value: 'a' }],
      validation: { required: true },
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
      parameters: { min: 0 },
      label: 'Age',
    });
  });

  it('omits a blank label so the variable-name caption fallback applies', () => {
    const out = composerNormalizeField({
      id: 'x',
      variable: 'age',
      component: 'Number',
      label: '   ',
    });
    expect(out).toEqual({
      id: 'x',
      variable: 'age',
      component: 'Number',
    });
  });
});

describe('buildComposerFieldOverlay', () => {
  const fields = [
    { id: 'f0', variable: 'age', component: 'Number', parameters: { min: 0 } },
    {
      variable: 'birth_date',
      component: 'DatePicker',
      parameters: { type: 'year' },
    },
    { component: 'Text' },
  ];

  it('keys each field’s component/parameters by the variable it renders, skipping variable-less rows', () => {
    expect(buildComposerFieldOverlay(fields)).toEqual({
      age: { component: 'Number', parameters: { min: 0 } },
      birth_date: { component: 'DatePicker', parameters: { type: 'year' } },
    });
  });

  // Eleventh-wave Finding 4: the field being edited is excluded at
  // construction time by its array index, so an id-less imported field
  // (ComposerFormFieldSchema.id is optional) is excluded exactly like one
  // Architect created with an id.
  it('excludes the field at excludeIndex, including an id-less field', () => {
    expect(buildComposerFieldOverlay(fields, 1)).toEqual({
      age: { component: 'Number', parameters: { min: 0 } },
    });
    expect(buildComposerFieldOverlay(fields, 0)).toEqual({
      birth_date: { component: 'DatePicker', parameters: { type: 'year' } },
    });
  });

  it('ignores an out-of-range excludeIndex (a not-yet-committed new item)', () => {
    expect(buildComposerFieldOverlay(fields, fields.length)).toEqual(
      buildComposerFieldOverlay(fields),
    );
  });

  it('returns an empty overlay for a non-array value', () => {
    expect(buildComposerFieldOverlay(undefined)).toEqual({});
  });
});

// Sixteenth-wave Finding 1: ComposerFormSchema rejects a form naming one
// variable twice, so the editor must refuse the duplicate before the save —
// the overlay above cannot, being keyed by variable.
describe('isVariableUsedBySibling', () => {
  const fields = [
    { id: 'f0', variable: 'age', component: 'Number' },
    { variable: 'birth_date', component: 'DatePicker' },
    { component: 'Text' },
  ];

  it('reports a variable another committed field already writes, id-less or not', () => {
    expect(isVariableUsedBySibling(fields, 'age')).toBe(true);
    expect(isVariableUsedBySibling(fields, 'birth_date')).toBe(true);
  });

  it('reports nothing for a variable no field writes', () => {
    expect(isVariableUsedBySibling(fields, 'name')).toBe(false);
  });

  it('ignores the row at excludeIndex so a field keeping its own variable is not self-blocked', () => {
    expect(isVariableUsedBySibling(fields, 'age', 0)).toBe(false);
    expect(isVariableUsedBySibling(fields, 'birth_date', 1)).toBe(false);
    // Excluding one row does not excuse a different row's claim.
    expect(isVariableUsedBySibling(fields, 'birth_date', 0)).toBe(true);
  });

  it('reports nothing for a blank variable or a non-array value', () => {
    expect(isVariableUsedBySibling(fields, '')).toBe(false);
    expect(isVariableUsedBySibling(undefined, 'age')).toBe(false);
  });
});

// Thirty-fifth-wave finding: the editor-side counterpart of schema.ts's
// `collectComposerFieldOverrides` + `unknownRenderingFor` — which of a
// subject's variables some OTHER composer stage's form renders with its own
// control, so `makeFieldEditorValidate` can drop them from its checked set.
describe('crossFormRenderedVariables', () => {
  const stages = [
    {
      id: 'stage-1',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [
          { variable: 'age', component: 'Number' },
          { component: 'Text' },
        ],
      },
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'closeness', component: 'Number' }] },
        },
      ],
    },
    {
      id: 'stage-2',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [{ variable: 'birth_date', component: 'DatePicker' }],
      },
    },
    {
      id: 'stage-3',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'place' },
      nodeForm: { fields: [{ variable: 'visited', component: 'Toggle' }] },
    },
    {
      id: 'stage-4',
      type: 'NameGenerator',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'nickname' }] },
    },
  ];

  it('collects node-form variables of the subject across all other stages', () => {
    expect(
      crossFormRenderedVariables(stages, { entity: 'node', type: 'person' }),
    ).toEqual(new Set(['age', 'birth_date']));
  });

  it('collects edge-form variables by their edge subject', () => {
    expect(
      crossFormRenderedVariables(stages, { entity: 'edge', type: 'knows' }),
    ).toEqual(new Set(['closeness']));
    expect(
      crossFormRenderedVariables(stages, { entity: 'edge', type: 'likes' }),
    ).toEqual(new Set());
  });

  it('ignores other subjects and non-NetworkComposer stages', () => {
    // stage-3 is another node type; stage-4's shared FormFieldSchema fields
    // carry no component of their own, so they never render anything.
    expect(
      crossFormRenderedVariables(stages, { entity: 'node', type: 'place' }),
    ).toEqual(new Set(['visited']));
    expect(
      crossFormRenderedVariables(stages, {
        entity: 'node',
        type: 'person',
      }).has('nickname'),
    ).toBe(false);
  });

  it('excludes the stage being edited', () => {
    expect(
      crossFormRenderedVariables(
        stages,
        { entity: 'node', type: 'person' },
        'stage-1',
      ),
    ).toEqual(new Set(['birth_date']));
  });

  it('returns an empty set for missing stages or a type-less subject', () => {
    expect(
      crossFormRenderedVariables(undefined, { entity: 'node', type: 'person' }),
    ).toEqual(new Set());
    expect(
      crossFormRenderedVariables(stages, { entity: 'node', type: null }),
    ).toEqual(new Set());
  });
});

describe('composerValidationViews', () => {
  const stages = [
    {
      id: 'node-year',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [
          {
            variable: 'born',
            component: 'DatePicker',
            parameters: { type: 'year' },
          },
          { variable: 'age', component: 'Number' },
        ],
      },
      edges: [
        {
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [{ variable: 'closeness', component: 'Number' }],
          },
        },
      ],
    },
    {
      id: 'node-full',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [{ variable: 'born', component: 'DatePicker', parameters: {} }],
      },
    },
  ];

  it('preserves one distinct resolved overlay per matching node form', () => {
    expect(
      composerValidationViews(stages, { entity: 'node', type: 'person' }),
    ).toEqual([
      {
        renderedVariableIds: new Set(['born', 'age']),
        overlay: {
          born: {
            component: 'DatePicker',
            parameters: { type: 'year' },
          },
          age: { component: 'Number', parameters: undefined },
        },
      },
      {
        renderedVariableIds: new Set(['born']),
        overlay: {
          born: { component: 'DatePicker', parameters: {} },
        },
      },
    ]);
  });

  it('collects matching edge forms and excludes the current stage', () => {
    expect(
      composerValidationViews(
        stages,
        { entity: 'edge', type: 'knows' },
        'node-full',
      ),
    ).toEqual([
      {
        renderedVariableIds: new Set(['closeness']),
        overlay: {
          closeness: { component: 'Number', parameters: undefined },
        },
      },
    ]);
    expect(
      composerValidationViews(
        stages,
        { entity: 'node', type: 'person' },
        'node-year',
      ),
    ).toHaveLength(1);
  });
});

describe('sharedFormValidationView', () => {
  it('keeps live field variables and marks the edited draft as part of the view', () => {
    expect(
      sharedFormValidationView([
        { variable: 'a' },
        { variable: 'b' },
        { label: 'Not assigned yet' },
      ]),
    ).toEqual({
      renderedVariableIds: new Set(['a', 'b']),
      overlay: {},
      includesEditedVariable: true,
    });
  });
});

describe('sharedFormValidationViews', () => {
  const stages = [
    {
      type: 'AlterForm',
      subject: { entity: 'node', type: 'person' },
      form: {
        fields: [{ variable: 'nickname' }, { variable: 'birth_date' }],
      },
    },
    {
      type: 'NameGenerator',
      subject: { entity: 'node', type: 'person' },
      form: { fields: [{ variable: 'nickname' }] },
    },
    {
      type: 'AlterEdgeForm',
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [{ variable: 'closeness' }] },
    },
    {
      type: 'FamilyPedigree',
      nodeConfig: {
        type: 'person',
        form: [{ variable: 'diagnosis' }],
      },
    },
    // A second pedigree on a DIFFERENT node type. FamilyPedigree carries no
    // literal `subject`: its subject is declared on the stage schema as
    // `nodeConfig.type` (see stage-subject-resolution.ts) and resolved by the
    // collector, so these two stages must land in different views. Reading a
    // hit's own subject is the only thing that separates them — recover the
    // entity without its type, and `staff_role` is admitted for a person
    // subject as a fourth view alongside the three person stages above.
    // (A fourth view, not a merged one: `variablesByStage` is keyed by stage
    // index, so two stages can never share one.)
    {
      type: 'FamilyPedigree',
      nodeConfig: {
        type: 'organisation',
        form: [{ variable: 'staff_role' }],
      },
    },
    {
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      nodeForm: {
        fields: [{ variable: 'composer_only', component: 'Text' }],
      },
    },
  ];

  it('keeps each matching shared form as a separate codebook-rendered view', () => {
    expect(
      sharedFormValidationViews(stages, {
        entity: 'node',
        type: 'person',
      }),
    ).toEqual([
      {
        renderedVariableIds: new Set(['nickname', 'birth_date']),
        overlay: {},
      },
      {
        renderedVariableIds: new Set(['nickname']),
        overlay: {},
      },
      {
        renderedVariableIds: new Set(['diagnosis']),
        overlay: {},
      },
    ]);
  });

  it('resolves a pedigree field against its own declared node type', () => {
    expect(
      sharedFormValidationViews(stages, {
        entity: 'node',
        type: 'organisation',
      }),
    ).toEqual([
      {
        renderedVariableIds: new Set(['staff_role']),
        overlay: {},
      },
    ]);
  });

  it('collects edge views and ignores NetworkComposer fields', () => {
    expect(
      sharedFormValidationViews(stages, {
        entity: 'edge',
        type: 'knows',
      }),
    ).toEqual([
      {
        renderedVariableIds: new Set(['closeness']),
        overlay: {},
      },
    ]);
    expect(
      sharedFormValidationViews(stages, {
        entity: 'node',
        type: null,
      }),
    ).toEqual([]);
  });
});

// Audit sweep: `handleChangeComponent` nulls `options` when a boolean row
// switches between Toggle and Boolean (withFieldsHandlers), and for a composer
// field — where `options` stays on the CODEBOOK variable, not the field — that
// null means "inherit", exactly as it already does for component/parameters.
// Passing the raw null through installed it over the codebook options and made
// `booleanDomain` fall back to the unrestricted {true, false}, so the editor
// missed a contradiction the codebook options really do create.
describe('composerDraftValues', () => {
  it('reads a null options reset as inheritance', () => {
    expect(
      composerDraftValues({
        variable: 'consented',
        component: 'Boolean',
        options: null,
      }),
    ).toEqual({
      variable: 'consented',
      component: 'Boolean',
      options: undefined,
      parameters: undefined,
    });
  });

  it('keeps a real options array as an override', () => {
    const options = [{ label: 'Yes', value: true }];
    expect(
      composerDraftValues({ variable: 'consented', options }).options,
    ).toBe(options);
  });

  it('still reads null component and parameters as inheritance', () => {
    const draft = composerDraftValues({
      variable: 'birth_date',
      component: null,
      parameters: null,
    });
    expect(draft.component).toBeUndefined();
    expect(draft.parameters).toBeUndefined();
  });
});
