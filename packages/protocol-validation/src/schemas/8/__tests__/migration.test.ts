import { describe, expect, it } from 'vitest';

import type { Protocol } from '../../index.ts';
import migrationV7toV8 from '../migration.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Comprehensive tests for V7 to V8 migration
 * Tests all transformations described in the migration notes:
 * - Remove deprecated 'displayVariable' from node and edge definitions
 * - Remove 'options' from Toggle boolean variables
 * - Change filter type from "alter" to "node"
 * - Update schemaVersion to 8 and add experiments field
 */
describe('Migration V7 to V8', () => {
  describe('displayVariable removal', () => {
    it('removes displayVariable from node definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              displayVariable: 'name', // This should be removed
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      // displayVariable should be removed from node definition
      expect(parsed.codebook.node?.person).not.toHaveProperty(
        'displayVariable',
      );
      // Other properties should remain
      expect(parsed.codebook.node?.person?.name).toBe('Person');
      expect(parsed.codebook.node?.person?.color).toBe('node-color-seq-1');
    });

    it('removes displayVariable from edge definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              displayVariable: 'closeness', // This should be removed
              variables: {
                closeness: {
                  name: 'Closeness',
                  type: 'ordinal',
                  options: [
                    { label: 'Not Close', value: 1 },
                    { label: 'Very Close', value: 3 },
                  ],
                },
              },
            },
          },
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      // displayVariable should be removed from edge definition
      expect(parsed.codebook.edge?.knows).not.toHaveProperty('displayVariable');
      // Other properties should remain
      expect(parsed.codebook.edge?.knows?.name).toBe('Knows');
      expect(parsed.codebook.edge?.knows?.color).toBe('edge-color-seq-1');
    });

    it('removes displayVariable from multiple node and edge types', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              displayVariable: 'name',
            },
            organization: {
              name: 'Organization',
              color: 'node-color-seq-2',
              displayVariable: 'orgName',
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              displayVariable: 'strength',
            },
            collaborates: {
              name: 'Collaborates',
              displayVariable: 'frequency',
            },
          },
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      // All displayVariable properties should be removed
      expect(parsed.codebook.node?.person).not.toHaveProperty(
        'displayVariable',
      );
      expect(parsed.codebook.node?.organization).not.toHaveProperty(
        'displayVariable',
      );
      expect(parsed.codebook.edge?.knows).not.toHaveProperty('displayVariable');
      expect(parsed.codebook.edge?.collaborates).not.toHaveProperty(
        'displayVariable',
      );
    });
  });

  describe('Toggle variable options removal', () => {
    it('removes options from boolean Toggle variables in node definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                isActive: {
                  name: 'IsActive',
                  type: 'boolean',
                  component: 'Toggle',
                  options: [
                    // This should be removed
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
                hasPets: {
                  name: 'HasPets',
                  type: 'boolean',
                  component: 'Boolean', // Not a Toggle, options should remain
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const isActive = parsed.codebook.node?.person?.variables?.isActive;
      const hasPets = parsed.codebook.node?.person?.variables?.hasPets;

      // Toggle should not have options
      expect(isActive).not.toHaveProperty('options');
      expect(isActive).toMatchObject({ type: 'boolean', component: 'Toggle' });

      // Boolean component should keep options
      expect(hasPets).toHaveProperty('options');
      if (hasPets && 'options' in hasPets) {
        expect(hasPets.options).toEqual([
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]);
      }
    });

    it('removes options from boolean Toggle variables in edge definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {
            knows: {
              name: 'Knows',
              variables: {
                isReciprocal: {
                  name: 'IsReciprocal',
                  type: 'boolean',
                  component: 'Toggle',
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(
        parsed.codebook.edge?.knows?.variables?.isReciprocal,
      ).not.toHaveProperty('options');
    });

    it('removes options from boolean Toggle variables in ego definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              employed: {
                name: 'Employed',
                type: 'boolean',
                component: 'Toggle',
                options: [
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ],
              },
              student: {
                name: 'Student',
                type: 'boolean',
                component: 'Toggle',
                options: [
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ],
              },
            },
          },
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.ego?.variables?.employed).not.toHaveProperty(
        'options',
      );
      expect(parsed.codebook.ego?.variables?.student).not.toHaveProperty(
        'options',
      );
    });

    it('does not remove options from non-Toggle boolean variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                hasChildren: {
                  name: 'HasChildren',
                  type: 'boolean',
                  component: 'Boolean',
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      // Boolean (not Toggle) should keep options
      expect(
        parsed.codebook.node?.person?.variables?.hasChildren,
      ).toHaveProperty('options');
    });

    // Thirteenth-wave Finding 2: the v8 schema now rejects an explicitly
    // empty boolean options array (the control renders no buttons at all, so
    // the variable can never be answered). Removing the property restores the
    // runtime's Yes/No default, keeping existing protocols valid.
    it('removes an explicitly empty options array from a Boolean variable', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                hasChildren: {
                  name: 'HasChildren',
                  type: 'boolean',
                  component: 'Boolean',
                  options: [],
                  validation: { required: true },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as unknown as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      expect(
        parsed.data?.codebook.node?.person?.variables?.hasChildren,
      ).not.toHaveProperty('options');
      expect(
        parsed.data?.codebook.node?.person?.variables?.hasChildren,
      ).toHaveProperty('validation.required', true);
    });

    // Twenty-eighth-wave Finding 1: the v8 shape rule now accepts
    // `options: []` on a componentless boolean directly (variable.ts), so
    // this strip is no longer the only thing standing between a v7 import and
    // rejection here — but it still runs ahead of the v8 parse, so a
    // componentless v7 boolean with an empty options array was never
    // import-blocked in the first place, and keeps migrating to the Yes/No
    // default (rather than surfacing as a value-less `options: []` a v8
    // Boolean-rendered NetworkComposer field could still choke on).
    it('removes an explicitly empty options array from a componentless boolean variable too', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                hasChildren: {
                  name: 'HasChildren',
                  type: 'boolean',
                  options: [],
                  validation: { required: true },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as unknown as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      expect(
        parsed.data?.codebook.node?.person?.variables?.hasChildren,
      ).not.toHaveProperty('options');
      expect(
        parsed.data?.codebook.node?.person?.variables?.hasChildren,
      ).toHaveProperty('validation.required', true);
    });

    it('does not affect non-boolean variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                category: {
                  name: 'Category',
                  type: 'categorical',
                  options: [
                    { label: 'Friend', value: 'friend' },
                    { label: 'Family', value: 'family' },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const category = parsed.codebook.node?.person?.variables?.category;
      // Categorical variables should keep options
      expect(category).toHaveProperty('options');
      if (category && 'options' in category) {
        expect(category.options).toHaveLength(2);
      }
    });
  });

  describe('categorical rule operand arrays', () => {
    const buildV7 = (ruleOptions: Record<string, unknown>) => ({
      schemaVersion: 7 as const,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: {
              cat: {
                name: 'cat',
                type: 'categorical',
                component: 'CheckboxGroup',
                options: [
                  { label: 'Family', value: 'family' },
                  { label: 'Work', value: 'work' },
                ],
              },
              ord: {
                name: 'ord',
                type: 'ordinal',
                component: 'RadioGroup',
                options: [
                  { label: 'Low', value: 1 },
                  { label: 'High', value: 2 },
                ],
              },
            },
          },
        },
        edge: {},
        ego: {},
      },
      stages: [
        {
          id: 'stage1',
          type: 'NameGenerator',
          label: 'Test Stage',
          form: { fields: [{ variable: 'cat', prompt: 'Pick' }] },
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'prompt1', text: 'Test prompt' }],
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [{ type: 'node', id: 'rule1', options: ruleOptions }],
            },
          },
        },
      ],
    });

    const migrateRuleValue = (
      ruleOptions: Record<string, unknown>,
    ): unknown => {
      const migrated = migrationV7toV8.migrate(buildV7(ruleOptions), {
        name: 'Test Protocol',
      }) as unknown as {
        stages: {
          skipLogic?: {
            filter?: { rules?: { options?: { value?: unknown } }[] };
          };
        }[];
      };
      return migrated.stages[0]?.skipLogic?.filter?.rules?.[0]?.options?.value;
    };

    it('wraps a scalar categorical EXACTLY operand in an array', () => {
      expect(
        migrateRuleValue({
          type: 'person',
          attribute: 'cat',
          operator: 'EXACTLY',
          value: 'family',
        }),
      ).toEqual(['family']);
    });

    it('wraps a scalar categorical INCLUDES operand in an array', () => {
      expect(
        migrateRuleValue({
          type: 'person',
          attribute: 'cat',
          operator: 'INCLUDES',
          value: 'family',
        }),
      ).toEqual(['family']);
    });

    it('leaves an already-array categorical operand untouched', () => {
      expect(
        migrateRuleValue({
          type: 'person',
          attribute: 'cat',
          operator: 'EXACTLY',
          value: ['family', 'work'],
        }),
      ).toEqual(['family', 'work']);
    });

    it('does not wrap a categorical OPTIONS_* count operand', () => {
      expect(
        migrateRuleValue({
          type: 'person',
          attribute: 'cat',
          operator: 'OPTIONS_EQUALS',
          value: 2,
        }),
      ).toBe(2);
    });

    it('does not wrap an ordinal EXACTLY operand', () => {
      expect(
        migrateRuleValue({
          type: 'person',
          attribute: 'ord',
          operator: 'EXACTLY',
          value: 1,
        }),
      ).toBe(1);
    });

    it('produces a protocol that still validates against schema 8', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildV7({
          type: 'person',
          attribute: 'cat',
          operator: 'EXACTLY',
          value: 'family',
        }),
        { name: 'Test Protocol' },
      );
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
    });

    it('does not wrap when a different entity shares the attribute id as categorical', () => {
      // `shared` is categorical on `place` but text on `person`; a rule scoped
      // to `person` must stay scalar and not be rewritten to an array just
      // because another entity defines a categorical variable with the same id.
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { shared: { name: 'shared', type: 'text' } },
            },
            place: {
              name: 'Place',
              color: 'node-color-seq-2',
              variables: {
                shared: {
                  name: 'shared',
                  type: 'categorical',
                  component: 'CheckboxGroup',
                  options: [{ label: 'A', value: 'a' }],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'NameGenerator',
            label: 'Test Stage',
            form: { fields: [{ variable: 'shared', prompt: 'Pick' }] },
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'prompt1', text: 'Test prompt' }],
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    type: 'node',
                    id: 'rule1',
                    options: {
                      type: 'person',
                      attribute: 'shared',
                      operator: 'EXACTLY',
                      value: 'x',
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      }) as unknown as {
        stages: {
          skipLogic?: {
            filter?: { rules?: { options?: { value?: unknown } }[] };
          };
        }[];
      };

      expect(
        migrated.stages[0]?.skipLogic?.filter?.rules?.[0]?.options?.value,
      ).toBe('x');
    });
  });

  describe('filter type transformation', () => {
    it("transforms 'alter' to 'node' in stage panel filter rules", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'NameGenerator',
            label: 'Test Stage',
            form: { fields: [{ variable: 'name', prompt: 'Name' }] },
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'prompt1', text: 'Test prompt' }],
            panels: [
              {
                id: 'panel1',
                dataSource: 'existing',
                title: 'Panel 1',
                filter: {
                  rules: [
                    {
                      type: 'alter', // Should become "node"
                      id: 'rule1',
                      options: {
                        type: 'person',
                        operator: 'EXISTS',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const stage = parsed.stages[0];
      if (stage && 'panels' in stage) {
        expect(stage.panels?.[0]?.filter?.rules?.[0]?.type).toBe('node');
      }
    });

    it("transforms 'alter' to 'node' in stage skipLogic filter rules", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'NameGenerator',
            label: 'Test Stage',
            form: { fields: [{ variable: 'name', prompt: 'Name' }] },
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'prompt1', text: 'Test prompt' }],
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    type: 'alter', // Should become "node"
                    id: 'rule1',
                    options: {
                      type: 'person',
                      operator: 'EXISTS',
                    },
                  },
                ],
              },
            },
          },
        ],
      };

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const stage = parsed.stages[0];
      if (stage && 'skipLogic' in stage) {
        expect(stage.skipLogic?.filter?.rules?.[0]?.type).toBe('node');
      }
    });

    it("transforms 'alter' to 'node' in stage filter rules", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                category: {
                  name: 'Category',
                  type: 'categorical',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                },
                layoutPos: {
                  name: 'LayoutPos',
                  type: 'layout',
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'Sociogram',
            label: 'Test Stage',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'prompt1',
                text: 'Test prompt',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
            filter: {
              rules: [
                {
                  type: 'alter', // Should become "node"
                  id: 'rule1',
                  options: {
                    type: 'person',
                    operator: 'EXISTS',
                  },
                },
              ],
            },
          },
        ],
      };

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const stage = parsed.stages[0];
      if (stage && 'filter' in stage) {
        expect(stage.filter?.rules?.[0]?.type).toBe('node');
      }
    });

    it("transforms multiple 'alter' filter rules in various locations", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                category: {
                  name: 'Category',
                  type: 'categorical',
                  component: 'CheckboxGroup',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                },
                layoutPos: {
                  name: 'LayoutPos',
                  type: 'layout',
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'NameGenerator',
            label: 'Test Stage',
            form: { fields: [{ variable: 'category', prompt: 'Pick' }] },
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'prompt1', text: 'Test prompt' }],
            panels: [
              {
                id: 'panel1',
                dataSource: 'existing',
                title: 'Panel 1',
                filter: {
                  rules: [
                    {
                      type: 'alter',
                      id: 'rule4',
                      options: { type: 'person', operator: 'EXISTS' },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'stage2',
            type: 'Sociogram',
            label: 'Sociogram Stage',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'prompt2',
                text: 'Test prompt',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
            filter: {
              join: 'AND',
              rules: [
                {
                  type: 'alter',
                  id: 'rule1',
                  options: { type: 'person', operator: 'EXISTS' },
                },
                {
                  type: 'alter',
                  id: 'rule2',
                  options: { type: 'person', operator: 'NOT_EXISTS' },
                },
              ],
            },
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    type: 'alter',
                    id: 'rule3',
                    options: { type: 'person', operator: 'EXISTS' },
                  },
                ],
              },
            },
          },
        ],
      };

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const nameGenStage = parsed.stages[0];
      if (nameGenStage && 'panels' in nameGenStage) {
        const panels = nameGenStage.panels as
          | Array<{ filter?: { rules?: Array<{ type?: string }> } }>
          | undefined;
        expect(panels?.[0]?.filter?.rules?.[0]?.type).toBe('node');
      }

      const sociogramStage = parsed.stages[1];
      if (
        sociogramStage &&
        'filter' in sociogramStage &&
        'skipLogic' in sociogramStage
      ) {
        expect(sociogramStage.filter?.rules?.[0]?.type).toBe('node');
        expect(sociogramStage.filter?.rules?.[1]?.type).toBe('node');
        expect(sociogramStage.skipLogic?.filter?.rules?.[0]?.type).toBe('node');
      }
    });

    it("preserves 'ego' and 'edge' filter types", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                category: {
                  name: 'Category',
                  type: 'categorical',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                },
                layoutPos: {
                  name: 'LayoutPos',
                  type: 'layout',
                },
              },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
            },
          },
          ego: { variables: { mood: { name: 'Mood', type: 'text' } } },
        },
        stages: [
          {
            id: 'stage1',
            type: 'Sociogram',
            label: 'Test Stage',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'prompt1',
                text: 'Test prompt',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
            // A stage node/edge filter rejects ego rules, so edge + alter→node
            // sit here while the ego rule (with attribute) lives in skipLogic,
            // where ego rules are permitted.
            filter: {
              join: 'AND',
              rules: [
                {
                  type: 'edge',
                  id: 'rule2',
                  options: { type: 'knows', operator: 'EXISTS' },
                },
                {
                  type: 'alter',
                  id: 'rule3',
                  options: { type: 'person', operator: 'EXISTS' },
                },
              ],
            },
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    type: 'ego',
                    id: 'rule1',
                    options: { attribute: 'mood', operator: 'EXISTS' },
                  },
                ],
              },
            },
          },
        ],
      };

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const stage = parsed.stages[0];
      if (stage && 'filter' in stage && 'skipLogic' in stage) {
        expect(stage.skipLogic?.filter?.rules?.[0]?.type).toBe('ego');
        expect(stage.filter?.rules?.[0]?.type).toBe('edge');
        expect(stage.filter?.rules?.[1]?.type).toBe('node');
      }
    });
  });

  describe('schema version and experiments field update', () => {
    it('updates schemaVersion from 7 to 8', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [],
      } as Protocol<7>;

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });

      expect(migrated.schemaVersion).toBe(8);
    });

    it('adds experiments field', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [],
      } as Protocol<7>;

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });

      expect(migrated).toHaveProperty('experiments');
      expect(migrated.experiments).toEqual({});
    });

    it('preserves other top-level fields while adding experiments', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        description: 'Test protocol',
        lastModified: '2025-01-01T00:00:00.000Z',
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [],
      } as Protocol<7>;

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });

      expect(migrated.schemaVersion).toBe(8);
      expect(migrated.description).toBe('Test protocol');
      expect(migrated.lastModified).toBe('2025-01-01T00:00:00.000Z');
      expect(migrated.experiments).toEqual({});
    });
  });

  describe('comprehensive migration validation', () => {
    it('successfully migrates a complex protocol with all transformations and validates against V8 schema', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        description: 'Complex test protocol',
        lastModified: '2025-01-01T00:00:00.000Z',
        codebook: {
          ego: {
            variables: {
              employed: {
                name: 'Employed',
                type: 'boolean',
                component: 'Toggle',
                options: [
                  // Should be removed
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ],
              },
              age: {
                name: 'Age',
                type: 'number',
              },
            },
          },
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              displayVariable: 'name', // Should be removed
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                  component: 'Text',
                },
                isActive: {
                  name: 'IsActive',
                  type: 'boolean',
                  component: 'Toggle',
                  options: [
                    // Should be removed
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
                category: {
                  name: 'Category',
                  type: 'categorical',
                  options: [
                    // Should NOT be removed (not a Toggle)
                    { label: 'Friend', value: 'friend' },
                    { label: 'Family', value: 'family' },
                  ],
                },
                layoutPos: {
                  name: 'LayoutPos',
                  type: 'layout',
                },
              },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              displayVariable: 'closeness', // Should be removed
              variables: {
                closeness: {
                  name: 'Closeness',
                  type: 'ordinal',
                  options: [
                    { label: 'Not Close', value: 1 },
                    { label: 'Very Close', value: 3 },
                  ],
                },
                confirmed: {
                  name: 'Confirmed',
                  type: 'boolean',
                  component: 'Toggle',
                  options: [
                    // Should be removed
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
        },
        stages: [
          {
            id: 'nameGenerator1',
            type: 'NameGenerator',
            label: 'Generate Names',
            subject: {
              entity: 'node',
              type: 'person',
            },
            form: {
              fields: [
                {
                  variable: 'name',
                  prompt: 'Enter name',
                },
              ],
            },
            prompts: [
              {
                id: 'prompt1',
                text: 'Who do you know?',
              },
            ],
            skipLogic: {
              action: 'SKIP',
              filter: {
                rules: [
                  {
                    type: 'alter', // Should become "node"
                    id: 'rule2',
                    options: {
                      type: 'person',
                      operator: 'EXISTS',
                    },
                  },
                ],
              },
            },
            panels: [
              {
                id: 'panel1',

                dataSource: 'existing',

                title: 'Panel 1',
                filter: {
                  rules: [
                    {
                      type: 'alter', // Should become "node"
                      id: 'rule3',
                      options: {
                        type: 'person',
                        operator: 'EXISTS',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: {
              entity: 'node',
              type: 'person',
            },
            prompts: [
              {
                id: 'prompt1',
                text: 'Position nodes',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
            filter: {
              rules: [
                {
                  type: 'alter', // Should become "node"
                  id: 'rule1',
                  options: {
                    type: 'person',
                    attribute: 'category',
                    operator: 'EXACTLY',
                    value: 'friend',
                  },
                },
              ],
            },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });

      // Validate against V8 schema
      const result = ProtocolSchemaV8.safeParse(migratedRaw);

      expect(result.success).toBe(true);
    });

    it('handles empty protocol correctly', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });

      expect(migrated.schemaVersion).toBe(8);
      expect(migrated.experiments).toEqual({});

      // Validate against V8 schema
      const result = ProtocolSchemaV8.safeParse(migrated);
      expect(result.success).toBe(true);
    });
  });

  describe('iconVariant to icon rename', () => {
    it('renames iconVariant to icon on node definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              iconVariant: 'add-a-person',
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.icon).toBe('add-a-person');
      expect(parsed.codebook.node?.person).not.toHaveProperty('iconVariant');
    });

    it('handles node definitions without iconVariant', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person).not.toHaveProperty('iconVariant');
      expect(parsed.codebook.node?.person?.name).toBe('Person');
    });
  });

  describe('shape field addition', () => {
    it('adds default circle shape to all node definitions', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                },
              },
            },
            organization: {
              name: 'Organization',
              color: 'node-color-seq-2',
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.shape).toEqual({
        default: 'circle',
      });
      expect(parsed.codebook.node?.organization?.shape).toEqual({
        default: 'circle',
      });
    });
  });

  describe('automaticLayout flatten', () => {
    const buildV7 = (
      stageType: 'Sociogram' | 'Narrative',
      behaviours?: Record<string, unknown>,
    ) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { pos: { name: 'Pos', type: 'layout' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: stageType,
            label: 'Stage',
            subject: { entity: 'node', type: 'person' },
            ...(behaviours ? { behaviours } : {}),
            ...(stageType === 'Sociogram'
              ? {
                  prompts: [
                    {
                      id: 'p1',
                      text: 'Position',
                      layout: { layoutVariable: 'pos' },
                    },
                  ],
                }
              : {
                  presets: [
                    { id: 'preset1', label: 'View', layoutVariable: 'pos' },
                  ],
                }),
          },
        ],
      }) as unknown as Protocol<7>;

    const migratedStage = (
      p: Protocol<7>,
      expectedType: 'Sociogram' | 'Narrative',
    ) => {
      const parsed = ProtocolSchemaV8.parse(
        migrationV7toV8.migrate(p, { name: 'Test Protocol' }),
      );
      const stage = parsed.stages[0];
      expect(stage?.type).toBe(expectedType);
      if (!stage || stage.type !== expectedType) {
        throw new Error(`Expected ${expectedType} stage`);
      }
      return stage;
    };

    it('flattens a Sociogram automaticLayout object to its enabled boolean', () => {
      const stage = migratedStage(
        buildV7('Sociogram', { automaticLayout: { enabled: true } }),
        'Sociogram',
      );
      expect(stage.behaviours?.automaticLayout).toBe(true);
    });

    it('flattens enabled:false to false', () => {
      const stage = migratedStage(
        buildV7('Sociogram', { automaticLayout: { enabled: false } }),
        'Sociogram',
      );
      expect(stage.behaviours?.automaticLayout).toBe(false);
    });

    it('leaves a Sociogram without automaticLayout untouched (no behaviours added)', () => {
      const stage = migratedStage(buildV7('Sociogram'), 'Sociogram');
      expect(stage.behaviours?.automaticLayout).toBeUndefined();
    });

    it('leaves a Narrative without automaticLayout unset (absent = off)', () => {
      const stage = migratedStage(buildV7('Narrative'), 'Narrative');
      expect(stage.behaviours?.automaticLayout).toBeUndefined();
    });

    it('does not add automaticLayout to a Narrative, preserving other behaviours', () => {
      const stage = migratedStage(
        buildV7('Narrative', { allowRepositioning: true }),
        'Narrative',
      );
      expect(stage.behaviours?.automaticLayout).toBeUndefined();
      expect(stage.behaviours?.allowRepositioning).toBe(true);
    });
  });

  describe('loop removal', () => {
    it('removes loop from Information stage items', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Intro',
            items: [
              {
                id: 'item1',
                type: 'asset',
                content: 'video-asset-1',
                loop: false,
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const stage = parsed.stages[0];
      if (stage && 'items' in stage) {
        expect(stage.items[0]).not.toHaveProperty('loop');
        expect(stage.items[0]?.content).toBe('video-asset-1');
      }
    });

    it('removes loop from video/audio assets in the manifest', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        assetManifest: {
          'video-asset-1': {
            id: 'video-asset-1',
            name: 'intro.mp4',
            type: 'video',
            source: 'intro.mp4',
            loop: true,
          },
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.assetManifest?.['video-asset-1']).not.toHaveProperty(
        'loop',
      );
      expect(parsed.assetManifest?.['video-asset-1']?.name).toBe('intro.mp4');
    });
  });

  describe('scalar value bounds', () => {
    const scalarProtocol = (validation: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                closeness: {
                  name: 'Closeness',
                  type: 'scalar',
                  component: 'VisualAnalogScale',
                  validation,
                },
                age: {
                  name: 'Age',
                  type: 'number',
                  component: 'Number',
                  validation: { minValue: 0, maxValue: 100 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      }) as Protocol<7>;

    const migrateScalar = (validation: Record<string, unknown>) =>
      ProtocolSchemaV8.parse(
        migrationV7toV8.migrate(scalarProtocol(validation), {
          name: 'Test Protocol',
        }),
      ).codebook.node?.person?.variables;

    it('drops a complete pair', () => {
      const closeness = migrateScalar({ minValue: 2, maxValue: 10 })?.closeness;

      expect(closeness).not.toHaveProperty('validation.minValue');
      expect(closeness).not.toHaveProperty('validation.maxValue');
    });

    it('drops a lone minValue', () => {
      const closeness = migrateScalar({ minValue: 7 })?.closeness;

      expect(closeness).not.toHaveProperty('validation.minValue');
    });

    it('drops a lone maxValue', () => {
      const closeness = migrateScalar({ maxValue: 7 })?.closeness;

      expect(closeness).not.toHaveProperty('validation.maxValue');
    });

    it('keeps the requiredness a dropped minValue conferred', () => {
      const closeness = migrateScalar({ minValue: 7 })?.closeness;

      expect(closeness).toHaveProperty('validation.required', true);
    });

    it('leaves other validation rules on the scalar intact', () => {
      const closeness = migrateScalar({
        required: true,
        minValue: 2,
        maxValue: 10,
      })?.closeness;

      expect(closeness).toHaveProperty('validation.required', true);
    });

    it('leaves number variable bounds intact', () => {
      const age = migrateScalar({ required: true })?.age;

      expect(age).toHaveProperty('validation.minValue', 0);
      expect(age).toHaveProperty('validation.maxValue', 100);
    });
  });

  describe('min* validator implies required', () => {
    it('sets required:true on a node variable with minValue', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                age: {
                  name: 'Age',
                  type: 'number',
                  component: 'Number',
                  validation: { minValue: 0, maxValue: 100 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const age = parsed.codebook.node?.person?.variables?.age;
      expect(age).toHaveProperty('validation.required', true);
      expect(age).toHaveProperty('validation.minValue', 0);
      expect(age).toHaveProperty('validation.maxValue', 100);
    });

    it('sets required:true on a node variable with minLength', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: {
                  name: 'Nickname',
                  type: 'text',
                  component: 'Text',
                  validation: { minLength: 2 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.variables?.nickname).toHaveProperty(
        'validation.required',
        true,
      );
    });

    it('sets required:true on an edge variable with minSelected', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                contexts: {
                  name: 'Contexts',
                  type: 'categorical',
                  component: 'CheckboxGroup',
                  options: [
                    { label: 'Work', value: 'work' },
                    { label: 'Home', value: 'home' },
                  ],
                  validation: { minSelected: 1 },
                },
              },
            },
          },
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.edge?.knows?.variables?.contexts).toHaveProperty(
        'validation.required',
        true,
      );
    });

    it('sets required:true on an ego variable with minValue', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              householdSize: {
                name: 'HouseholdSize',
                type: 'number',
                component: 'Number',
                validation: { minValue: 1 },
              },
            },
          },
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.ego?.variables?.householdSize).toHaveProperty(
        'validation.required',
        true,
      );
    });

    it('leaves an already-required variable unchanged', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                age: {
                  name: 'Age',
                  type: 'number',
                  component: 'Number',
                  validation: { required: true, minValue: 0 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.variables?.age).toHaveProperty(
        'validation.required',
        true,
      );
    });

    it('does not set required for a variable with only maxValue', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                age: {
                  name: 'Age',
                  type: 'number',
                  component: 'Number',
                  validation: { maxValue: 100 },
                },
                bio: {
                  name: 'Bio',
                  type: 'text',
                  component: 'Text',
                  validation: { maxLength: 200 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const variables = parsed.codebook.node?.person?.variables;
      expect(variables?.age).not.toHaveProperty('validation.required');
      expect(variables?.bio).not.toHaveProperty('validation.required');
    });

    it('does not affect variables without validation', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.variables?.name).not.toHaveProperty(
        'validation',
      );
    });

    // Ninth-wave Finding 5: an inert below-floor minLength (v7 never enforced
    // a floor, so -1 constrained nothing) must be stripped BEFORE this
    // backfill runs, or the backfill fabricates requiredness the protocol
    // never actually had. The floor strip removes minLength first, so by the
    // time this step inspects the validation map there is no minLength left
    // to trigger it.
    it('does not fabricate required from a below-floor minLength that gets stripped', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: {
                  name: 'Nickname',
                  type: 'text',
                  component: 'Text',
                  validation: { minLength: -1 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const nickname = parsed.codebook.node?.person?.variables?.nickname;
      expect(nickname).not.toHaveProperty('validation.required');
      expect(nickname).not.toHaveProperty('validation.minLength');
    });
  });

  describe('ego unique validation removal', () => {
    it('strips validation.unique from ego variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              ssn: {
                name: 'SSN',
                type: 'text',
                validation: { unique: true, minLength: 9 },
              },
            },
          },
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const ssn = parsed.codebook.ego?.variables?.ssn;
      expect(ssn).toHaveProperty('validation');
      expect(ssn).not.toHaveProperty('validation.unique');
      // Other validators are preserved (minLength implies required).
      expect(ssn).toHaveProperty('validation.minLength', 9);
    });

    it('leaves unique on non-ego (node) variables untouched', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: {
                  name: 'Name',
                  type: 'text',
                  validation: { unique: true },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      expect(parsed.codebook.node?.person?.variables?.name).toHaveProperty(
        'validation.unique',
        true,
      );
    });
  });

  describe('ordinal minSelected/maxSelected removal', () => {
    it('strips minSelected and maxSelected from ordinal variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                rating: {
                  name: 'Rating',
                  type: 'ordinal',
                  options: [
                    { label: 'Low', value: 1 },
                    { label: 'High', value: 2 },
                  ],
                  validation: {
                    required: true,
                    minSelected: 1,
                    maxSelected: 2,
                  },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const rating = parsed.codebook.node?.person?.variables?.rating;
      expect(rating).not.toHaveProperty('validation.minSelected');
      expect(rating).not.toHaveProperty('validation.maxSelected');
      expect(rating).toHaveProperty('validation.required', true);
    });

    it('preserves the implied required when stripping minSelected from an ordinal without explicit required', () => {
      // minSelected implied required in older protocols; the strip must not
      // silently drop that coupling (the later min*->required step cannot see
      // minSelected once it has been removed here).
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                rating: {
                  name: 'Rating',
                  type: 'ordinal',
                  options: [
                    { label: 'Low', value: 1 },
                    { label: 'High', value: 2 },
                  ],
                  validation: {
                    minSelected: 1,
                  },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const rating = parsed.codebook.node?.person?.variables?.rating;
      expect(rating).not.toHaveProperty('validation.minSelected');
      expect(rating).toHaveProperty('validation.required', true);
    });

    it('keeps minSelected/maxSelected on categorical variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                tags: {
                  name: 'Tags',
                  type: 'categorical',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                  validation: { minSelected: 1, maxSelected: 2 },
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const tags = parsed.codebook.node?.person?.variables?.tags;
      expect(tags).toHaveProperty('validation.minSelected', 1);
      expect(tags).toHaveProperty('validation.maxSelected', 2);
    });
  });

  describe('boolean option value coercion', () => {
    it('coerces boolean option values to strings on ordinal/categorical', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                pick: {
                  name: 'Pick',
                  type: 'categorical',
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
                rank: {
                  name: 'Rank',
                  type: 'ordinal',
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const pick = parsed.codebook.node?.person?.variables?.pick;
      const rank = parsed.codebook.node?.person?.variables?.rank;
      if (pick && 'options' in pick) {
        expect(pick.options).toEqual([
          { label: 'Yes', value: 'true' },
          { label: 'No', value: 'false' },
        ]);
      }
      if (rank && 'options' in rank) {
        expect(rank.options).toEqual([
          { label: 'Yes', value: 'true' },
          { label: 'No', value: 'false' },
        ]);
      }
    });

    it('does not coerce boolean-variable options', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                hasPets: {
                  name: 'HasPets',
                  type: 'boolean',
                  component: 'Boolean',
                  options: [
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const hasPets = parsed.codebook.node?.person?.variables?.hasPets;
      if (hasPets && 'options' in hasPets) {
        expect(hasPets.options).toEqual([
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]);
      }
    });
  });

  describe('encrypted removal on non-text-node variables', () => {
    it('strips encrypted from ego, edge and non-text node variables', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                secretName: {
                  name: 'SecretName',
                  type: 'text',
                  encrypted: true,
                },
                secretAge: {
                  name: 'SecretAge',
                  type: 'number',
                  encrypted: true,
                },
              },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                edgeSecret: {
                  name: 'EdgeSecret',
                  type: 'text',
                  encrypted: true,
                },
              },
            },
          },
          ego: {
            variables: {
              egoSecret: { name: 'EgoSecret', type: 'text', encrypted: true },
            },
          },
        },
        stages: [],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      // Node text variable keeps encrypted.
      expect(
        parsed.codebook.node?.person?.variables?.secretName,
      ).toHaveProperty('encrypted', true);
      // Non-text node variable loses encrypted.
      expect(
        parsed.codebook.node?.person?.variables?.secretAge,
      ).not.toHaveProperty('encrypted');
      // Edge and ego variables lose encrypted regardless of type.
      expect(
        parsed.codebook.edge?.knows?.variables?.edgeSecret,
      ).not.toHaveProperty('encrypted');
      expect(parsed.codebook.ego?.variables?.egoSecret).not.toHaveProperty(
        'encrypted',
      );
    });
  });

  describe('form.title removal on form stages', () => {
    it('deletes form.title on EgoForm, AlterForm and AlterEdgeForm', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                weight: { name: 'Weight', type: 'text', component: 'Text' },
              },
            },
          },
          ego: {
            variables: {
              egoName: { name: 'EgoName', type: 'text', component: 'Text' },
            },
          },
        },
        stages: [
          {
            id: 'egoForm1',
            type: 'EgoForm',
            label: 'Ego',
            introductionPanel: { title: 'Intro', text: 'Hello' },
            form: {
              title: 'About You',
              fields: [{ variable: 'egoName', prompt: 'Name?' }],
            },
          },
          {
            id: 'alterForm1',
            type: 'AlterForm',
            label: 'Alter',
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: 'Intro', text: 'Hello' },
            form: {
              title: 'About Them',
              fields: [{ variable: 'name', prompt: 'Name?' }],
            },
          },
          {
            id: 'alterEdgeForm1',
            type: 'AlterEdgeForm',
            label: 'Edge',
            subject: { entity: 'edge', type: 'knows' },
            introductionPanel: { title: 'Intro', text: 'Hello' },
            form: {
              title: 'About Edge',
              fields: [{ variable: 'weight', prompt: 'Weight?' }],
            },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);

      const [ego, alter, alterEdge] = parsed.stages;
      if (ego && 'form' in ego) expect(ego.form).not.toHaveProperty('title');
      if (alter && 'form' in alter)
        expect(alter.form).not.toHaveProperty('title');
      if (alterEdge && 'form' in alterEdge)
        expect(alterEdge.form).not.toHaveProperty('title');
    });
  });

  describe('CategoricalBin otherVariablePrompt backfill', () => {
    const buildBinProtocol = (prompt: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                cat: {
                  name: 'Cat',
                  type: 'categorical',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                },
                other: { name: 'Other', type: 'text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'bin1',
            type: 'CategoricalBin',
            label: 'Bin',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'Sort', variable: 'cat', ...prompt }],
          },
        ],
      }) as Protocol<7>;

    it('backfills otherVariablePrompt from otherOptionLabel when present', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: 'other',
          otherOptionLabel: 'Something else',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'otherVariablePrompt',
          'Something else',
        );
      }
    });

    it("defaults otherVariablePrompt to 'Please specify' and otherOptionLabel to 'Other' when neither is set", () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({ otherVariable: 'other' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'otherVariablePrompt',
          'Please specify',
        );
        expect(stage.prompts[0]).toHaveProperty('otherOptionLabel', 'Other');
      }
    });

    it('backfills otherOptionLabel from an authored otherVariablePrompt', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: 'other',
          otherVariablePrompt: 'Which other category?',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'otherOptionLabel',
          'Which other category?',
        );
      }
    });

    it('leaves an authored otherOptionLabel untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: 'other',
          otherVariablePrompt: 'My prompt',
          otherOptionLabel: 'My label',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('otherOptionLabel', 'My label');
      }
    });

    it('leaves an existing otherVariablePrompt untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: 'other',
          otherVariablePrompt: 'My prompt',
          otherOptionLabel: 'Other label',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'otherVariablePrompt',
          'My prompt',
        );
      }
    });

    it('does not add otherVariablePrompt when otherVariable is absent', () => {
      const migratedRaw = migrationV7toV8.migrate(buildBinProtocol({}), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('otherVariablePrompt');
      }
    });

    it('drops otherOptionLabel and otherVariablePrompt when otherVariable is absent', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('otherOptionLabel');
        expect(stage.prompts[0]).not.toHaveProperty('otherVariablePrompt');
      }
    });

    it('drops an orphaned otherOptionLabel on its own', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({ otherOptionLabel: 'Other' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('otherOptionLabel');
      }
    });

    it('drops an empty-string otherVariable along with its orphans', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: '',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('otherVariable');
        expect(stage.prompts[0]).not.toHaveProperty('otherOptionLabel');
        expect(stage.prompts[0]).not.toHaveProperty('otherVariablePrompt');
      }
    });

    it('keeps otherOptionLabel and otherVariablePrompt when otherVariable is set', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({
          otherVariable: 'other',
          otherOptionLabel: 'Other',
          otherVariablePrompt: 'Please specify',
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('otherOptionLabel', 'Other');
        expect(stage.prompts[0]).toHaveProperty(
          'otherVariablePrompt',
          'Please specify',
        );
      }
    });
  });

  describe('OrdinalBin prompt color normalisation', () => {
    const buildOrdinalProtocol = (prompt: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                rating: {
                  name: 'Rating',
                  type: 'ordinal',
                  options: [
                    { label: 'Low', value: 1 },
                    { label: 'High', value: 2 },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ob1',
            type: 'OrdinalBin',
            label: 'Rate',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              { id: 'p1', text: 'Rate', variable: 'rating', ...prompt },
            ],
          },
        ],
      }) as Protocol<7>;

    it('replaces a color outside the ord-color-seq palette', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildOrdinalProtocol({ color: 'coral' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('color', 'ord-color-seq-1');
      }
    });

    it('keeps a color from the ord-color-seq palette', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildOrdinalProtocol({ color: 'ord-color-seq-3' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('color', 'ord-color-seq-3');
      }
    });

    it('defaults colorless prompts to the first palette color and keeps authored ones', () => {
      const protocol = buildOrdinalProtocol({});
      const typedStages = protocol.stages as Array<Record<string, unknown>>;
      (typedStages[0]!.prompts as Array<Record<string, unknown>>).push(
        { id: 'p2', text: 'Rate again', variable: 'rating' },
        {
          id: 'p3',
          text: 'Rate once more',
          variable: 'rating',
          color: 'ord-color-seq-7',
        },
      );
      const migratedRaw = migrationV7toV8.migrate(protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('color', 'ord-color-seq-1');
        expect(stage.prompts[1]).toHaveProperty('color', 'ord-color-seq-1');
        expect(stage.prompts[2]).toHaveProperty('color', 'ord-color-seq-7');
      }
    });
  });

  describe('TieStrengthCensus negativeLabel default', () => {
    const buildTscProtocol = (negativeLabel?: string) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {},
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                strength: {
                  name: 'Strength',
                  type: 'ordinal',
                  options: [
                    { label: 'Low', value: 1 },
                    { label: 'High', value: 2 },
                  ],
                },
              },
            },
          },
          ego: {},
        },
        stages: [
          {
            id: 'tsc1',
            type: 'TieStrengthCensus',
            label: 'TSC',
            subject: { entity: 'node', type: 'person' },
            introductionPanel: { title: 'Intro', text: 'Hello' },
            prompts: [
              {
                id: 'p1',
                text: 'How close?',
                createEdge: 'knows',
                edgeVariable: 'strength',
                ...(negativeLabel !== undefined ? { negativeLabel } : {}),
              },
            ],
          },
        ],
      }) as Protocol<7>;

    it("defaults an empty negativeLabel to 'No relationship'", () => {
      const migratedRaw = migrationV7toV8.migrate(buildTscProtocol(''), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'negativeLabel',
          'No relationship',
        );
      }
    });

    it("defaults a missing negativeLabel to 'No relationship'", () => {
      const migratedRaw = migrationV7toV8.migrate(buildTscProtocol(undefined), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'negativeLabel',
          'No relationship',
        );
      }
    });

    it('leaves a non-empty negativeLabel untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(buildTscProtocol('Distant'), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('negativeLabel', 'Distant');
      }
    });
  });

  describe('Information title backfill', () => {
    const buildInfoProtocol = (stage: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: { ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            items: [{ id: 'item1', type: 'text', content: 'Welcome' }],
            ...stage,
          },
        ],
      }) as Protocol<7>;

    it('backfills a missing title from the stage label', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildInfoProtocol({ label: 'Welcome Screen' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      expect(parsed.stages[0]).toHaveProperty('title', 'Welcome Screen');
    });

    it("backfills 'Information' when there is no usable label", () => {
      const migratedRaw = migrationV7toV8.migrate(buildInfoProtocol({}), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      expect(parsed.stages[0]).toHaveProperty('title', 'Information');
      expect(parsed.stages[0]).toHaveProperty('label', 'Stage 1');
    });

    it('leaves an authored title untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildInfoProtocol({ label: 'Welcome Screen', title: 'Hello!' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      expect(parsed.stages[0]).toHaveProperty('title', 'Hello!');
    });
  });

  describe('NameGenerator form.title backfill', () => {
    const buildNgFormProtocol = (form: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'NG',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'Who do you know?' }],
            form: {
              fields: [{ variable: 'name', prompt: 'Name?' }],
              ...form,
            },
          },
        ],
      }) as Protocol<7>;

    it('backfills a missing form.title from the subject node type name', () => {
      const migratedRaw = migrationV7toV8.migrate(buildNgFormProtocol({}), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'form' in stage) {
        expect(stage.form).toHaveProperty('title', 'Add Person');
      }
    });

    it('backfills an empty form.title', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgFormProtocol({ title: '' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'form' in stage) {
        expect(stage.form).toHaveProperty('title', 'Add Person');
      }
    });

    it('leaves an authored form.title untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgFormProtocol({ title: 'Add a friend' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'form' in stage) {
        expect(stage.form).toHaveProperty('title', 'Add a friend');
      }
    });
  });

  describe('Sociogram/Narrative background normalisation', () => {
    const buildCanvasProtocol = (
      type: 'Sociogram' | 'Narrative',
      stage: Record<string, unknown>,
    ) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                layout: { name: 'Layout', type: 'layout' },
              },
            },
          },
          ego: {},
        },
        assetManifest: {
          asset1: {
            id: 'asset1',
            name: 'Background',
            type: 'image',
            source: 'background.svg',
          },
        },
        stages: [
          {
            id: 'canvas1',
            type,
            label: 'Canvas',
            subject: { entity: 'node', type: 'person' },
            ...(type === 'Sociogram'
              ? {
                  prompts: [
                    {
                      id: 'p1',
                      text: 'Position people',
                      layout: { layoutVariable: 'layout' },
                    },
                  ],
                }
              : {
                  presets: [
                    {
                      id: 'preset1',
                      label: 'Preset',
                      layoutVariable: 'layout',
                    },
                  ],
                }),
            ...stage,
          },
        ],
      }) as Protocol<7>;

    const migrateAndGetBackground = (
      type: 'Sociogram' | 'Narrative',
      stage: Record<string, unknown>,
    ) => {
      const migratedRaw = migrationV7toV8.migrate(
        buildCanvasProtocol(type, stage),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const parsedStage = parsed.stages[0];
      if (!parsedStage || !('background' in parsedStage)) {
        throw new Error('stage has no background');
      }
      return parsedStage.background;
    };

    it('adds a 4-ring background to a Sociogram with none', () => {
      expect(migrateAndGetBackground('Sociogram', {})).toEqual({
        concentricCircles: 4,
      });
    });

    it('adds a 4-ring background to a Narrative with none', () => {
      expect(migrateAndGetBackground('Narrative', {})).toEqual({
        concentricCircles: 4,
      });
    });

    it('backfills concentricCircles on an image-less background', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { skewedTowardCenter: true },
        }),
      ).toEqual({ concentricCircles: 4, skewedTowardCenter: true });
    });

    it('keeps a zero circle count (renders no rings)', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { concentricCircles: 0 },
        }),
      ).toEqual({ concentricCircles: 0 });
    });

    it('replaces a negative circle count', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { concentricCircles: -2 },
        }),
      ).toEqual({ concentricCircles: 4 });
    });

    it('keeps an image background and drops a leftover circle count', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { image: 'asset1', concentricCircles: 3 },
        }),
      ).toEqual({ image: 'asset1' });
    });

    it('keeps a Narrative image background and drops a leftover circle count', () => {
      expect(
        migrateAndGetBackground('Narrative', {
          background: { image: 'asset1', concentricCircles: 3 },
        }),
      ).toEqual({ image: 'asset1' });
    });

    it('leaves a valid circles background untouched', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { concentricCircles: 6, skewedTowardCenter: false },
        }),
      ).toEqual({ concentricCircles: 6, skewedTowardCenter: false });
    });

    it('replaces an array background with the default', () => {
      expect(migrateAndGetBackground('Sociogram', { background: [] })).toEqual({
        concentricCircles: 4,
      });
    });

    it('strips unknown keys from a background', () => {
      expect(
        migrateAndGetBackground('Sociogram', {
          background: { useImage: true, concentricCircles: 2 },
        }),
      ).toEqual({ concentricCircles: 2 });
    });

    it('drops an empty-string image and falls back to circles', () => {
      expect(
        migrateAndGetBackground('Sociogram', { background: { image: '' } }),
      ).toEqual({ concentricCircles: 4 });
    });
  });

  describe('NameGenerator behaviours normalisation', () => {
    const buildNgProtocol = (behaviours: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'NG',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            behaviours,
          },
        ],
      }) as Protocol<7>;

    const getBehaviours = (
      raw: unknown,
    ): Record<string, unknown> | undefined => {
      const typed = raw as {
        stages: { behaviours?: Record<string, unknown> }[];
      };
      return typed.stages[0]?.behaviours;
    };

    it('removes maxNodes when maxNodes < 1', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgProtocol({ minNodes: 1, maxNodes: 0 }),
        { name: 'Test Protocol' },
      );
      const behaviours = getBehaviours(migratedRaw);
      expect(behaviours).not.toHaveProperty('maxNodes');
      expect(behaviours).toHaveProperty('minNodes', 1);
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
    });

    it('removes maxNodes when maxNodes < minNodes', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgProtocol({ minNodes: 5, maxNodes: 2 }),
        { name: 'Test Protocol' },
      );
      const behaviours = getBehaviours(migratedRaw);
      expect(behaviours).not.toHaveProperty('maxNodes');
      expect(behaviours).toHaveProperty('minNodes', 5);
    });

    it('removes minNodes when minNodes < 0', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgProtocol({ minNodes: -1, maxNodes: 5 }),
        { name: 'Test Protocol' },
      );
      const behaviours = getBehaviours(migratedRaw);
      expect(behaviours).not.toHaveProperty('minNodes');
      expect(behaviours).toHaveProperty('maxNodes', 5);
    });

    it('leaves a satisfiable behaviours block untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildNgProtocol({ minNodes: 1, maxNodes: 5 }),
        { name: 'Test Protocol' },
      );
      const behaviours = getBehaviours(migratedRaw);
      expect(behaviours).toEqual({ minNodes: 1, maxNodes: 5 });
    });

    it('normalises NameGeneratorQuickAdd behaviours too', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { name: { name: 'Name', type: 'text' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ngqa1',
            type: 'NameGeneratorQuickAdd',
            label: 'NGQA',
            subject: { entity: 'node', type: 'person' },
            quickAdd: 'name',
            prompts: [{ id: 'p1', text: 'Who?' }],
            behaviours: { minNodes: 3, maxNodes: 1 },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const behaviours = getBehaviours(migratedRaw);
      expect(behaviours).not.toHaveProperty('maxNodes');
      expect(behaviours).toHaveProperty('minNodes', 3);
    });
  });

  describe('Sociogram highlight/edges conflict resolution', () => {
    it('drops highlight when both edges.create and highlight.allowHighlighting set', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { layoutPos: { name: 'LayoutPos', type: 'layout' } },
            },
          },
          edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
          ego: {},
        },
        stages: [
          {
            id: 'socio1',
            type: 'Sociogram',
            label: 'Socio',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
                edges: { create: 'knows' },
                highlight: { allowHighlighting: true },
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('highlight');
        expect(stage.prompts[0]).toHaveProperty('edges.create', 'knows');
      }
    });

    const buildSociogramProtocol = (prompt: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                layoutPos: { name: 'LayoutPos', type: 'layout' },
                isClose: { name: 'Close', type: 'boolean' },
              },
            },
          },
          edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
          ego: {},
        },
        stages: [
          {
            id: 'socio1',
            type: 'Sociogram',
            label: 'Socio',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
                ...prompt,
              },
            ],
          },
        ],
      }) as Protocol<7>;

    it('keeps highlight when edges.create is absent', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildSociogramProtocol({
          highlight: { allowHighlighting: true, variable: 'isClose' },
        }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'highlight.allowHighlighting',
          true,
        );
      }
    });

    it('turns highlighting off when no highlight variable is set', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildSociogramProtocol({ highlight: { allowHighlighting: true } }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty(
          'highlight.allowHighlighting',
          false,
        );
      }
    });

    it('drops an edges object with neither create nor display', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildSociogramProtocol({ edges: {} }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('edges');
      }
    });

    it('keeps a display-only edges object', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildSociogramProtocol({ edges: { display: ['knows'] } }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).toHaveProperty('edges.display', ['knows']);
      }
    });

    it('drops an edges object whose display is an empty array', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildSociogramProtocol({ edges: { display: [] } }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('edges');
      }
    });
  });

  describe('Information item size normalisation', () => {
    it('uppercase-folds size on asset items', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Info',
            items: [
              {
                id: 'i1',
                type: 'asset',
                content: 'image-asset-1',
                size: 'medium',
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'items' in stage) {
        expect(stage.items[0]).toHaveProperty('size', 'MEDIUM');
      }
    });

    it('drops size values not in SMALL/MEDIUM/LARGE', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Info',
            items: [
              {
                id: 'i1',
                type: 'asset',
                content: 'image-asset-1',
                size: 'gigantic',
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'items' in stage) {
        expect(stage.items[0]).not.toHaveProperty('size');
      }
    });

    it('removes size from text items', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Info',
            items: [
              {
                id: 'i1',
                type: 'text',
                content: 'Some text',
                size: 'LARGE',
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'items' in stage) {
        expect(stage.items[0]).not.toHaveProperty('size');
        expect(stage.items[0]?.type).toBe('text');
      }
    });
  });

  describe('empty-rules filter removal', () => {
    it('drops a stage.filter whose rules array is empty', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { layoutPos: { name: 'LayoutPos', type: 'layout' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'socio1',
            type: 'Sociogram',
            label: 'Socio',
            subject: { entity: 'node', type: 'person' },
            filter: { join: 'AND', rules: [] },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage) {
        expect(stage).not.toHaveProperty('filter');
      }
    });

    it('drops a panel filter whose rules array is empty', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'NG',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            panels: [
              {
                id: 'panel1',
                title: 'Panel 1',
                dataSource: 'existing',
                filter: { rules: [] },
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'panels' in stage) {
        expect(stage.panels?.[0]).not.toHaveProperty('filter');
      }
    });

    it('drops skipLogic entirely when its filter rules array is empty', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'NG',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            skipLogic: { action: 'SKIP', filter: { rules: [] } },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage) {
        expect(stage).not.toHaveProperty('skipLogic');
      }
    });

    it('leaves a non-empty filter untouched', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { layoutPos: { name: 'LayoutPos', type: 'layout' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'socio1',
            type: 'Sociogram',
            label: 'Socio',
            subject: { entity: 'node', type: 'person' },
            filter: {
              rules: [
                {
                  type: 'node',
                  id: 'r1',
                  options: { type: 'person', operator: 'EXISTS' },
                },
              ],
            },
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
              },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'filter' in stage) {
        expect(stage.filter?.rules).toHaveLength(1);
      }
    });
  });

  describe('stage label backfill', () => {
    it('fills missing or empty stage labels with a one-based positional default', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          { id: 's1', type: 'Information', label: 'Welcome' },
          { id: 's2', type: 'Information', label: '' },
          { id: 's3', type: 'Information', label: '   ' },
          { id: 's4', type: 'Information' },
        ],
      } as Protocol<7>;

      const migrated = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      }) as unknown as { stages: { label?: unknown }[] };

      // Existing labels are preserved; missing/empty/whitespace are replaced
      // with "Stage <one-based index>".
      expect(migrated.stages[0]?.label).toBe('Welcome');
      expect(migrated.stages[1]?.label).toBe('Stage 2');
      expect(migrated.stages[2]?.label).toBe('Stage 3');
      expect(migrated.stages[3]?.label).toBe('Stage 4');
    });
  });

  describe('required free-text field backfills', () => {
    it("backfills an empty prompt text with 'Continue'", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { pos: { name: 'Pos', type: 'layout' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'socio1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              { id: 'p1', text: '', layout: { layoutVariable: 'pos' } },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { prompts?: { text?: unknown }[] }[];
        }
      ).stages[0];
      expect(stage?.prompts?.[0]?.text).toBe('Continue');
    });

    it("backfills an empty form-field prompt from the referenced variable's name", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: { name: 'Nickname', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add',
              fields: [{ variable: 'nickname', prompt: '' }],
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { form?: { fields?: { prompt?: unknown }[] } }[];
        }
      ).stages[0];
      expect(stage?.form?.fields?.[0]?.prompt).toBe('Nickname');
    });

    it("backfills an empty form-field prompt with 'Answer' when the variable is unresolvable", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: { name: 'Nickname', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add',
              fields: [{ variable: 'ghostVar', prompt: '' }],
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const stage = (
        migratedRaw as unknown as {
          stages: { form?: { fields?: { prompt?: unknown }[] } }[];
        }
      ).stages[0];
      expect(stage?.form?.fields?.[0]?.prompt).toBe('Answer');
    });

    it('backfills an empty introductionPanel title from the stage label and text with a generic', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: { name: 'Nickname', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'af1',
            type: 'AlterForm',
            label: 'About this person',
            subject: { entity: 'node', type: 'person' },
            form: { fields: [{ variable: 'nickname', prompt: 'Name?' }] },
            introductionPanel: { title: '', text: '' },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { introductionPanel?: { title?: unknown; text?: unknown } }[];
        }
      ).stages[0];
      expect(stage?.introductionPanel?.title).toBe('About this person');
      expect(stage?.introductionPanel?.text).toBe('Welcome.');
    });

    it("backfills an empty Information text item content with 'Information.'", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Intro',
            title: 'Welcome page',
            items: [{ id: 'i1', type: 'text', content: '' }],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { items?: { content?: unknown }[] }[];
        }
      ).stages[0];
      expect(stage?.items?.[0]?.content).toBe('Information.');
    });

    it('drops an Information asset item whose content (asset id) is empty', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: {} },
        stages: [
          {
            id: 'info1',
            type: 'Information',
            label: 'Intro',
            title: 'Welcome page',
            items: [
              { id: 'i1', type: 'asset', content: '' },
              { id: 'i2', type: 'text', content: 'Kept' },
            ],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { items?: { id?: unknown }[] }[];
        }
      ).stages[0];
      expect(stage?.items).toHaveLength(1);
      expect(stage?.items?.[0]?.id).toBe('i2');
    });

    it("backfills an empty Narrative preset label by position ('Preset 1')", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { pos: { name: 'Pos', type: 'layout' } },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'narr1',
            type: 'Narrative',
            label: 'Narrative',
            subject: { entity: 'node', type: 'person' },
            presets: [{ id: 'preset1', label: '', layoutVariable: 'pos' }],
            background: { concentricCircles: 4 },
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { presets?: { label?: unknown }[] }[];
        }
      ).stages[0];
      expect(stage?.presets?.[0]?.label).toBe('Preset 1');
    });

    it("backfills an empty side-panel title by position ('Panel 1')", () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nickname: { name: 'Nickname', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'ng1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add person',
              fields: [{ variable: 'nickname', prompt: 'Name?' }],
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
            panels: [{ id: 'panel1', dataSource: 'existing', title: '' }],
          },
        ],
      } as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: { panels?: { title?: unknown }[] }[];
        }
      ).stages[0];
      expect(stage?.panels?.[0]?.title).toBe('Panel 1');
    });

    it('drops a NameGeneratorRoster searchOptions with an empty matchProperties array', () => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: { nickname: { name: 'Nickname', type: 'text' } },
            },
          },
          edge: {},
          ego: {},
        },
        assetManifest: {
          roster1: {
            id: 'roster1',
            name: 'roster.csv',
            type: 'network',
            source: 'roster.csv',
          },
        },
        stages: [
          {
            id: 'ngr1',
            type: 'NameGeneratorRoster',
            label: 'Roster',
            subject: { entity: 'node', type: 'person' },
            dataSource: 'roster1',
            prompts: [{ id: 'p1', text: 'Pick someone' }],
            searchOptions: { fuzziness: 0.5, matchProperties: [] },
          },
        ],
      } as unknown as Protocol<7>;

      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      expect(() => ProtocolSchemaV8.parse(migratedRaw)).not.toThrow();
      const stage = (
        migratedRaw as unknown as {
          stages: Record<string, unknown>[];
        }
      ).stages[0];
      expect(stage).not.toHaveProperty('searchOptions');
    });
  });

  describe('external-data panel edge-rule removal (ext-panel-edge-rule)', () => {
    const buildV7 = (panel: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: { knows: { name: 'Knows', color: 'edge-color-seq-1' } },
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add',
              fields: [{ variable: 'name', prompt: 'Name' }],
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
            panels: [panel],
          },
        ],
      }) as unknown as Protocol<7>;

    const migratedPanel = (panel: Record<string, unknown>) => {
      const migrated = migrationV7toV8.migrate(buildV7(panel), {
        name: 'Test Protocol',
      }) as unknown as {
        stages: { panels?: { filter?: unknown }[] }[];
      };
      return migrated.stages[0]?.panels?.[0];
    };

    it('drops an edge rule from a non-existing panel filter but keeps node rules and join', () => {
      const panel = migratedPanel({
        id: 'panel1',
        title: 'External',
        dataSource: 'external1',
        filter: {
          join: 'AND',
          rules: [
            {
              type: 'edge',
              id: 'r1',
              options: { type: 'knows', operator: 'EXISTS' },
            },
            {
              type: 'alter',
              id: 'r2',
              options: { type: 'person', operator: 'EXISTS' },
            },
          ],
        },
      }) as { filter?: { join?: string; rules?: { type?: string }[] } };
      expect(panel.filter?.rules).toHaveLength(1);
      expect(panel.filter?.rules?.[0]?.type).toBe('node');
      expect(panel.filter?.join).toBe('AND');
    });

    it('removes the filter entirely when only edge rules remain', () => {
      const panel = migratedPanel({
        id: 'panel1',
        title: 'External',
        dataSource: 'external1',
        filter: {
          rules: [
            {
              type: 'edge',
              id: 'r1',
              options: { type: 'knows', operator: 'EXISTS' },
            },
          ],
        },
      });
      expect(panel).not.toHaveProperty('filter');
    });

    it('leaves edge rules on an existing-data panel untouched', () => {
      const panel = migratedPanel({
        id: 'panel1',
        title: 'Existing',
        dataSource: 'existing',
        filter: {
          rules: [
            {
              type: 'edge',
              id: 'r1',
              options: { type: 'knows', operator: 'EXISTS' },
            },
          ],
        },
      }) as { filter?: { rules?: { type?: string }[] } };
      expect(panel.filter?.rules?.[0]?.type).toBe('edge');
    });

    it('migrates an external-panel edge-rule protocol to valid schema-8 output', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildV7({
          id: 'panel1',
          title: 'External',
          dataSource: 'external1',
          filter: {
            rules: [
              {
                type: 'edge',
                id: 'r1',
                options: { type: 'knows', operator: 'EXISTS' },
              },
            ],
          },
        }),
        { name: 'Test Protocol' },
      );
      expect(ProtocolSchemaV8.safeParse(migratedRaw).success).toBe(true);
    });
  });

  describe('multi-rule filter join backfill (filter-rule-count)', () => {
    const twoNodeRules = {
      rules: [
        {
          type: 'alter',
          id: 'r1',
          options: { type: 'person', operator: 'EXISTS' },
        },
        {
          type: 'alter',
          id: 'r2',
          options: { type: 'person', operator: 'NOT_EXISTS' },
        },
      ],
    };

    const buildV7 = (stage: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
                pos: { name: 'Pos', type: 'layout' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [stage],
      }) as unknown as Protocol<7>;

    it('backfills join:OR on a multi-rule stage filter with no join', () => {
      const migrated = migrationV7toV8.migrate(
        buildV7({
          id: 'stage1',
          type: 'Sociogram',
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'p1', text: 'Position', layout: { layoutVariable: 'pos' } },
          ],
          filter: { ...twoNodeRules },
        }),
        { name: 'Test Protocol' },
      ) as unknown as { stages: { filter?: { join?: string } }[] };
      expect(migrated.stages[0]?.filter?.join).toBe('OR');
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    it('backfills join:OR on a multi-rule skipLogic filter with no join', () => {
      const migrated = migrationV7toV8.migrate(
        buildV7({
          id: 'stage1',
          type: 'Sociogram',
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'p1', text: 'Position', layout: { layoutVariable: 'pos' } },
          ],
          skipLogic: { action: 'SKIP', filter: { ...twoNodeRules } },
        }),
        { name: 'Test Protocol' },
      ) as unknown as {
        stages: { skipLogic?: { filter?: { join?: string } } }[];
      };
      expect(migrated.stages[0]?.skipLogic?.filter?.join).toBe('OR');
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    it('backfills join:OR on a multi-rule panel filter with no join', () => {
      const migrated = migrationV7toV8.migrate(
        buildV7({
          id: 'stage1',
          type: 'NameGenerator',
          label: 'Generate',
          subject: { entity: 'node', type: 'person' },
          form: {
            title: 'Add',
            fields: [{ variable: 'name', prompt: 'Name' }],
          },
          prompts: [{ id: 'p1', text: 'Who?' }],
          panels: [
            {
              id: 'panel1',
              title: 'Existing',
              dataSource: 'existing',
              filter: { ...twoNodeRules },
            },
          ],
        }),
        { name: 'Test Protocol' },
      ) as unknown as {
        stages: { panels?: { filter?: { join?: string } }[] }[];
      };
      expect(migrated.stages[0]?.panels?.[0]?.filter?.join).toBe('OR');
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    it('leaves a single-rule filter join undefined', () => {
      const migrated = migrationV7toV8.migrate(
        buildV7({
          id: 'stage1',
          type: 'Sociogram',
          label: 'Sociogram',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            { id: 'p1', text: 'Position', layout: { layoutVariable: 'pos' } },
          ],
          filter: {
            rules: [
              {
                type: 'alter',
                id: 'r1',
                options: { type: 'person', operator: 'EXISTS' },
              },
            ],
          },
        }),
        { name: 'Test Protocol' },
      ) as unknown as { stages: { filter?: { join?: string } }[] };
      expect(migrated.stages[0]?.filter?.join).toBeUndefined();
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });
  });

  describe('non-renderable form-field removal (formfield-nonrenderable)', () => {
    const buildAlterForm = (fields: Record<string, unknown>[]) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
                homeLoc: { name: 'Home', type: 'location' },
                pos: { name: 'Pos', type: 'layout' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'stage1',
            type: 'AlterForm',
            label: 'About',
            subject: { entity: 'node', type: 'person' },
            form: { fields },
            introductionPanel: { title: 'Intro', text: 'Welcome.' },
          },
        ],
      }) as unknown as Protocol<7>;

    it('drops layout/location fields but keeps renderable fields and validates', () => {
      const migrated = migrationV7toV8.migrate(
        buildAlterForm([
          { variable: 'name', prompt: 'Name' },
          { variable: 'homeLoc', prompt: 'Home' },
          { variable: 'pos', prompt: 'Pos' },
        ]),
        { name: 'Test Protocol' },
      ) as unknown as {
        stages: { form?: { fields?: { variable?: string }[] } }[];
      };
      const fields = migrated.stages[0]?.form?.fields;
      expect(fields).toHaveLength(1);
      expect(fields?.[0]?.variable).toBe('name');
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });
  });

  describe('empty-form stage removal (form-fields-min1)', () => {
    const buildProtocol = (formStage: Record<string, unknown>) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
                homeLoc: { name: 'Home', type: 'location' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          formStage,
          {
            id: 'keep',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add',
              fields: [{ variable: 'name', prompt: 'Name' }],
            },
            prompts: [{ id: 'p1', text: 'Who?' }],
          },
        ],
      }) as unknown as Protocol<7>;

    it('drops an authored EgoForm with no fields and validates', () => {
      const migrated = migrationV7toV8.migrate(
        buildProtocol({
          id: 'empty',
          type: 'EgoForm',
          label: 'Ego',
          form: { fields: [] },
          introductionPanel: { title: 'Intro', text: 'Welcome.' },
        }),
        { name: 'Test Protocol' },
      ) as unknown as { stages: { id?: string }[] };
      expect(migrated.stages.map((s) => s.id)).toEqual(['keep']);
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    it('drops an AlterForm emptied by non-renderable field removal', () => {
      const migrated = migrationV7toV8.migrate(
        buildProtocol({
          id: 'onlyLocation',
          type: 'AlterForm',
          label: 'About',
          subject: { entity: 'node', type: 'person' },
          form: { fields: [{ variable: 'homeLoc', prompt: 'Home' }] },
          introductionPanel: { title: 'Intro', text: 'Welcome.' },
        }),
        { name: 'Test Protocol' },
      ) as unknown as { stages: { id?: string }[] };
      expect(migrated.stages.map((s) => s.id)).toEqual(['keep']);
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    const buildWithSkipTo = (stageId: string) =>
      ({
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                name: { name: 'Name', type: 'text', component: 'Text' },
              },
            },
          },
          edge: {},
          ego: {},
        },
        stages: [
          {
            id: 'src',
            type: 'NameGenerator',
            label: 'Generate',
            subject: { entity: 'node', type: 'person' },
            form: { title: 'Add', fields: [{ variable: 'name', prompt: 'N' }] },
            prompts: [{ id: 'p1', text: 'Who?' }],
            skipLogic: {
              action: 'SKIP',
              filter: {
                join: 'OR',
                rules: [
                  {
                    type: 'node',
                    id: 'rule1',
                    options: { type: 'person', operator: 'EXISTS' },
                  },
                ],
              },
              destination: { type: 'stage', stageId },
            },
          },
          { id: 'empty', type: 'EgoForm', label: 'Ego', form: { fields: [] } },
          {
            id: 'keep',
            type: 'Information',
            label: 'Info',
            items: [{ id: 'i1', type: 'text', content: 'Hello' }],
          },
        ],
      }) as unknown as Protocol<7>;

    type MigratedSkip = {
      stages: { id?: string; skipLogic?: { destination?: unknown } }[];
    };

    it('clears a skip destination pointing at a dropped stage', () => {
      const migrated = migrationV7toV8.migrate(buildWithSkipTo('empty'), {
        name: 'Test Protocol',
      }) as unknown as MigratedSkip;

      expect(migrated.stages.map((s) => s.id)).toEqual(['src', 'keep']);
      expect(migrated.stages[0]?.skipLogic?.destination).toBeUndefined();
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });

    it('preserves a skip destination pointing at a surviving stage', () => {
      const migrated = migrationV7toV8.migrate(buildWithSkipTo('keep'), {
        name: 'Test Protocol',
      }) as unknown as MigratedSkip;

      expect(migrated.stages[0]?.skipLogic?.destination).toEqual({
        type: 'stage',
        stageId: 'keep',
      });
      expect(ProtocolSchemaV8.safeParse(migrated).success).toBe(true);
    });
  });

  describe('migration metadata', () => {
    it('has correct from and to versions', () => {
      expect(migrationV7toV8.from).toBe(7);
      expect(migrationV7toV8.to).toBe(8);
    });

    it('has migration notes', () => {
      expect(migrationV7toV8.notes).toBeDefined();
      expect(typeof migrationV7toV8.notes).toBe('string');
      if (migrationV7toV8.notes) {
        expect(migrationV7toV8.notes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('DatePicker parameter and validation floor normalisation', () => {
    const migrateVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          ego: { variables },
        },
        stages: [],
      };
      return migrationV7toV8.migrate(v7Protocol as unknown as Protocol<7>, {
        name: 'Test Protocol',
      });
    };

    it('truncates finer-than-resolution bounds and strips coarser ones', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'year_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '2020-05-03', max: '2021' },
        },
        b: {
          name: 'full_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '2020', max: '2021-06-15' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.min', '2020');
      expect(variables?.a).toHaveProperty('parameters.max', '2021');
      expect(variables?.b).not.toHaveProperty('parameters.min');
      expect(variables?.b).toHaveProperty('parameters.max', '2021-06-15');
    });

    it('strips both bounds when min is after max, and malformed values', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'window',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2021-06', max: '2020-01' },
        },
        b: {
          name: 'junk',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: 'not-a-date' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
      expect(variables?.a).not.toHaveProperty('parameters.max');
      expect(variables?.b).not.toHaveProperty('parameters.min');
    });

    it('deletes a value that merely slices into a valid-looking prefix', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'full_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '2020-01-01oops' },
        },
        b: {
          name: 'year_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '2020garbage' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
      expect(variables?.b).not.toHaveProperty('parameters.min');
    });

    // Eleventh-wave Finding 1: a year-zero full-resolution bound is a real,
    // round-tripping ISO date, but the native HTML date input starts at year
    // 0001, so no selectable value could ever satisfy it — the migration
    // strips it the same way as the other unusable bounds. Years 0001-0999
    // survive (the deliberate full-resolution small-year support).
    it('strips a full-resolution year-zero bound but keeps a small-year one', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'year_zero',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { max: '0000-12-31' },
        },
        b: {
          name: 'small_year',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '0001-01-01' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.max');
      expect(variables?.b).toHaveProperty('parameters.min', '0001-01-01');
    });

    // Sixth-wave Finding 1: an unsupported `type` (e.g. a legacy 'week'
    // resolution) was treated as 'full' for the bounds logic but left in
    // place, so the migrated document failed the strictObject's
    // full/month/year enum. The stray key must be deleted, falling back to
    // the schema's own 'full' default.
    it('deletes an unsupported DatePicker type and keeps a valid bound', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'week_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'week', min: '2020-01-01' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.type');
      expect(variables?.a).toHaveProperty('parameters.min', '2020-01-01');
    });

    // Twenty-third-wave Finding 7: this normaliser only touched `type`,
    // `min`, and `max`, leaving every other key in place. `datePickerParametersSchema`
    // (variable.ts) is a strictObject accepting only those three keys, so a
    // v7 DatePicker parameters record carrying a stray key from elsewhere —
    // e.g. a RelativeDatePicker `anchor` — failed the v8 schema outright and
    // blocked the protocol from being imported at all, unlike
    // `normalizeRelativeDatePickerParameters`, which already stripped keys
    // outside its own set.
    it('removes an unsupported parameter key (e.g. a RelativeDatePicker anchor) from a DatePicker record', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'anchor_leftover',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '2020-01-01', anchor: '2020-01-01' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.anchor');
      expect(variables?.a).toHaveProperty('parameters.min', '2020-01-01');
    });

    it('removes an arbitrary stray DatePicker parameter key', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'stray_key',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '2020-01-01', foo: 1 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.foo');
      expect(variables?.a).toHaveProperty('parameters.min', '2020-01-01');
    });

    it('leaves a fully valid DatePicker parameters record untouched', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'valid_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2020-01', max: '2020-06' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters', {
        type: 'month',
        min: '2020-01',
        max: '2020-06',
      });
    });

    // Tenth-wave Finding 4: the codebook step previously skipped
    // RelativeDatePicker variables entirely, so a loose v7 parameters record
    // (small-year anchor, negative or fractional offsets, stray keys)
    // migrated into a document the v8 strictObject rejects on import.
    it('preserves a fully valid RelativeDatePicker parameters record untouched', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-01-01', before: 30 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.anchor', '2020-01-01');
      expect(variables?.a).toHaveProperty('parameters.before', 30);
    });

    it('removes a RelativeDatePicker anchor before the native date range', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '0000-12-31', before: 30 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.anchor');
      expect(variables?.a).toHaveProperty('parameters.before', 30);
    });

    it('preserves RelativeDatePicker anchors throughout the native date range', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative_1',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '0001-01-01', before: 30 },
        },
        b: {
          name: 'relative_99',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '0099-12-31', before: 30 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.anchor', '0001-01-01');
      expect(variables?.b).toHaveProperty('parameters.anchor', '0099-12-31');
    });

    it('removes negative and non-integer RelativeDatePicker offsets', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative_negative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-01-01', before: -5 },
        },
        b: {
          name: 'relative_fractional',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-01-01', after: 1.5 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.before');
      expect(variables?.a).toHaveProperty('parameters.anchor', '2020-01-01');
      expect(variables?.b).not.toHaveProperty('parameters.after');
      expect(variables?.b).toHaveProperty('parameters.anchor', '2020-01-01');
    });

    it('removes a stray RelativeDatePicker parameter key', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-01-01', min: '2019-01-01' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
      expect(variables?.a).toHaveProperty('parameters.anchor', '2020-01-01');
    });

    // Nineteenth-wave Finding 1: `component` is OPTIONAL on both datetime
    // members, so a v7 codebook variable can declare an anchor/before/after
    // window with no component at all. Routing it to the DatePicker
    // normaliser left `anchor`/`before` untouched and the v8 variable union
    // then rejected the whole protocol on import.
    it('normalises a componentless relative-shaped parameters record', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'relative_small_year',
          type: 'datetime',
          parameters: { anchor: '0050-01-01', before: -2 },
        },
        b: {
          name: 'relative_valid_anchor',
          type: 'datetime',
          parameters: { anchor: '2020-01-01', after: -3 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.anchor', '0050-01-01');
      expect(variables?.a).not.toHaveProperty('parameters.before');
      expect(variables?.b).toHaveProperty('parameters.anchor', '2020-01-01');
      expect(variables?.b).not.toHaveProperty('parameters.after');
    });

    it('still applies DatePicker truncation to a componentless picker', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'componentless_year_picker',
          type: 'datetime',
          parameters: { type: 'year', min: '2020-05-03' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.min', '2020');
      expect(variables?.a).toHaveProperty('parameters.type', 'year');
    });

    it('leaves declared-component datetime variables on their own normaliser', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'declared_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '2020-05-03' },
        },
        b: {
          name: 'declared_relative',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '0050-01-01', before: -2 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.min', '2020');
      expect(variables?.b).toHaveProperty('parameters.anchor', '0050-01-01');
      expect(variables?.b).not.toHaveProperty('parameters.before');
    });

    // A record carrying keys from BOTH parameter shapes matches neither
    // strictObject member, so no inference is safe: the pre-existing
    // DatePicker reading stands rather than guessing at relative intent.
    // Twenty-third-wave Finding 7: the DatePicker normaliser now strips keys
    // outside its own set, so the surviving relative-only `before` key is
    // removed here too — the routing decision (DatePicker, made by the
    // caller's `isRelativeDatePickerShape` check before this normaliser ever
    // runs) is unaffected by that later strip.
    it('keeps the DatePicker reading for a mixed-key componentless record, then strips the incompatible key', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'mixed_shape',
          type: 'datetime',
          parameters: { type: 'year', min: '2020-05-03', before: -2 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.min', '2020');
      expect(variables?.a).not.toHaveProperty('parameters.before');
    });

    // Audit sweep: this step's componentless inference must agree with the
    // analyser's `isRelativeDatePickerShape`, which now reads an explicitly
    // null `component` (and a null member key) as absent. Testing `component
    // === undefined` here left a null-component relative record on the
    // DatePicker normaliser, so its relative anchor and negative offset
    // survived untouched while the analyser — running over these same raw
    // records in the contradiction-strip step — read it as a relative window.
    it('normalises a null-component relative-shaped parameters record', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'null_component_relative',
          type: 'datetime',
          component: null,
          parameters: { anchor: '0050-01-01', before: -2 },
        },
        b: {
          name: 'null_member_key_relative',
          type: 'datetime',
          parameters: { anchor: '0050-01-01', after: -3, min: null },
        },
      });
      const variables = (
        migratedRaw as unknown as {
          codebook: { ego: { variables: Record<string, unknown> } };
        }
      ).codebook.ego.variables;
      expect(variables.a).toHaveProperty('parameters.anchor', '0050-01-01');
      expect(variables.a).not.toHaveProperty('parameters.before');
      expect(variables.b).toHaveProperty('parameters.anchor', '0050-01-01');
      expect(variables.b).not.toHaveProperty('parameters.after');
    });

    // Third-wave Finding 2: isValidCalendarDate must not fall into
    // Date.UTC's two-digit-year coercion (a year 0-99 silently becoming
    // 1900-1999), which would falsely reject a real four-digit year like
    // '0099' during normalisation.
    it('keeps a real four-digit date whose year is below 100', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'full_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '0099-12-31' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('parameters.min', '0099-12-31');
    });

    it('still strips an impossible calendar date with a small year', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'full_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { min: '0099-02-30' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
    });

    // Eighth-wave Finding 2: a coarse-resolution (year/month) bound whose
    // year is below 1000 must be deleted, not truncated-and-kept — the
    // interview builds that resolution's year options unpadded via
    // `y.toString()`, so a zero-padded small-year bound could never match a
    // stored value. Full resolution is unaffected (see the small-year test
    // above, which keeps '0099-12-31' unchanged).
    it('strips a year-resolution bound whose year is below 1000, keeping a valid sibling bound', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'year_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'year', min: '0099', max: '2020' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
      expect(variables?.a).toHaveProperty('parameters.max', '2020');
    });

    it('strips a month-resolution bound truncated down from a small-year full date', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'month_picker',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '0099-05-03' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('parameters.min');
    });

    it('strips negative count-valued rules and preserves optional zero-valued maxima', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'first_name',
          type: 'text',
          validation: { maxLength: 0, minLength: -2, required: true },
        },
        b: {
          name: 'last_name',
          type: 'text',
          validation: { minLength: 0, maxLength: 1 },
        },
        c: {
          name: 'tags',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
          validation: { maxSelected: 0 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.maxLength');
      expect(variables?.a).not.toHaveProperty('validation.minLength');
      expect(variables?.a).toHaveProperty('validation.required', true);
      expect(variables?.b).toHaveProperty('validation.minLength', 0);
      expect(variables?.b).toHaveProperty('validation.maxLength', 1);
      expect(variables?.c).toHaveProperty('validation.maxSelected', 0);
    });

    it('normalizes selection-count floors on node and edge variables while preserving 0/1 boundaries', () => {
      const categorical = (
        name: string,
        validation: Record<string, number>,
      ) => ({
        name,
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        validation,
      });
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {
                nodeNegativeCounts: categorical('NodeNegativeCounts', {
                  minSelected: -1,
                  maxSelected: -1,
                }),
                nodeBoundaryCounts: categorical('NodeBoundaryCounts', {
                  minSelected: 0,
                  maxSelected: 1,
                }),
              },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                edgeNegativeCounts: categorical('EdgeNegativeCounts', {
                  minSelected: -1,
                  maxSelected: -1,
                }),
                edgeBoundaryCounts: categorical('EdgeBoundaryCounts', {
                  minSelected: 0,
                  maxSelected: 1,
                }),
              },
            },
          },
          ego: {},
        },
        stages: [],
      };
      const parsed = ProtocolSchemaV8.parse(
        migrationV7toV8.migrate(v7Protocol as unknown as Protocol<7>, {
          name: 'Test Protocol',
        }),
      );
      const nodeVariables = parsed.codebook.node?.person?.variables;
      const edgeVariables = parsed.codebook.edge?.knows?.variables;

      expect(nodeVariables?.nodeNegativeCounts).not.toHaveProperty(
        'validation.minSelected',
      );
      expect(nodeVariables?.nodeNegativeCounts).not.toHaveProperty(
        'validation.maxSelected',
      );
      expect(nodeVariables?.nodeBoundaryCounts).toHaveProperty(
        'validation.minSelected',
        0,
      );
      expect(nodeVariables?.nodeBoundaryCounts).toHaveProperty(
        'validation.maxSelected',
        1,
      );
      expect(edgeVariables?.edgeNegativeCounts).not.toHaveProperty(
        'validation.minSelected',
      );
      expect(edgeVariables?.edgeNegativeCounts).not.toHaveProperty(
        'validation.maxSelected',
      );
      expect(edgeVariables?.edgeBoundaryCounts).toHaveProperty(
        'validation.minSelected',
        0,
      );
      expect(edgeVariables?.edgeBoundaryCounts).toHaveProperty(
        'validation.maxSelected',
        1,
      );
    });

    // V8 puts `.int()` on all six numeric bound rules (minLength, maxLength,
    // minValue, maxValue, minSelected, maxSelected — validation.ts), but v7
    // is a `looseObject` that never enforced it, so a hand-authored
    // fractional value survives migration untouched and then fails v8
    // validation on import — the exact class of import blocker the other
    // repairs in this file close.
    it('strips a fractional minValue and maxSelected while keeping an integer sibling rule', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'age',
          type: 'number',
          validation: { minValue: 1.5, maxValue: 10 },
        },
        b: {
          name: 'tags',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
          validation: { minSelected: 1, maxSelected: 2.7 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.minValue');
      expect(variables?.a).toHaveProperty('validation.maxValue', 10);
      expect(variables?.b).not.toHaveProperty('validation.maxSelected');
      expect(variables?.b).toHaveProperty('validation.minSelected', 1);
    });

    // minValue/maxValue have no floor (a number variable's range may be
    // negative), so a negative INTEGER must survive while a fractional value
    // on any of the six rules is stripped regardless of sign or magnitude.
    it('strips fractional values from all six numeric bound rules, keeping their integer siblings', () => {
      const migratedRaw = migrateVariables({
        n: {
          name: 'n',
          type: 'number',
          validation: { minValue: -5, maxValue: 10.5 },
        },
        t: {
          name: 't',
          type: 'text',
          validation: { minLength: 2.5, maxLength: 20 },
        },
        c: {
          name: 'c',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
          validation: { minSelected: 1, maxSelected: 2.7 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.n).toHaveProperty('validation.minValue', -5);
      expect(variables?.n).not.toHaveProperty('validation.maxValue');
      expect(variables?.t).not.toHaveProperty('validation.minLength');
      expect(variables?.t).toHaveProperty('validation.maxLength', 20);
      expect(variables?.c).toHaveProperty('validation.minSelected', 1);
      expect(variables?.c).not.toHaveProperty('validation.maxSelected');
    });

    it('does not fabricate required from a fractional minValue that gets stripped', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'age',
          type: 'number',
          validation: { minValue: 1.5 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.minValue');
      expect(variables?.a).not.toHaveProperty('validation.required');
    });
  });

  describe('contradictory validation rule removal', () => {
    const migrateVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          ego: { variables },
        },
        stages: [],
      };
      return migrationV7toV8.migrate(v7Protocol as unknown as Protocol<7>, {
        name: 'Test Protocol',
      });
    };

    it('strips zero maxima when migration backfills requiredness from a zero minimum', () => {
      const migratedRaw = migrateVariables({
        text: {
          name: 'comment',
          type: 'text',
          validation: { minLength: 0, maxLength: 0 },
        },
        choices: {
          name: 'choices',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
          validation: { minSelected: 0, maxSelected: 0 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);

      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.text).toHaveProperty('validation.required', true);
      expect(variables?.text).toHaveProperty('validation.minLength', 0);
      expect(variables?.text).not.toHaveProperty('validation.maxLength');
      expect(variables?.choices).toHaveProperty('validation.required', true);
      expect(variables?.choices).toHaveProperty('validation.minSelected', 0);
      expect(variables?.choices).not.toHaveProperty('validation.maxSelected');
    });

    it('strips both members of an inverted pair', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'age',
          type: 'number',
          validation: { minValue: 10, maxValue: 2, required: true },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.minValue');
      expect(variables?.a).not.toHaveProperty('validation.maxValue');
      expect(variables?.a).toHaveProperty('validation.required', true);
    });

    it('strips sameAs and differentFrom when they name one target', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'text',
          validation: { sameAs: 'b', differentFrom: 'b' },
        },
        b: { name: 'b', type: 'text' },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.sameAs');
      expect(variables?.a).not.toHaveProperty('validation.differentFrom');
    });

    it('strips the comparators forming a strict cycle, keeping bounds', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: { minValue: 0, greaterThanVariable: 'b' },
        },
        b: {
          name: 'b',
          type: 'number',
          validation: { greaterThanVariable: 'a' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.greaterThanVariable');
      expect(variables?.b).not.toHaveProperty('validation.greaterThanVariable');
      expect(variables?.a).toHaveProperty('validation.minValue', 0);
    });

    it('keeps sameAs when stripping a strict comparator inside its group', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: { sameAs: 'b', greaterThanVariable: 'b' },
        },
        b: { name: 'b', type: 'number' },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('validation.sameAs', 'b');
      expect(variables?.a).not.toHaveProperty('validation.greaterThanVariable');
    });

    // Ninth-wave Finding 3: A's sameAs already forces the {a, b} group; the
    // one-way `lessThanOrEqualToVariable` merely sits between the two — it
    // did not itself group them (only a sameAs edge, or a genuine strongly-
    // connected comparator cycle, does that). The minimal-strip repair takes
    // the sameAs edge only, and the `<=` rule survives migration intact.
    it('strips sameAs only when a one-way comparator sits inside a sameAs group, keeping the comparator', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: {
            maxValue: 5,
            sameAs: 'b',
            lessThanOrEqualToVariable: 'b',
          },
        },
        b: { name: 'b', type: 'number', validation: { minValue: 10 } },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.sameAs');
      expect(variables?.a).toHaveProperty(
        'validation.lessThanOrEqualToVariable',
        'b',
      );
      expect(variables?.a).toHaveProperty('validation.maxValue', 5);
      expect(variables?.b).toHaveProperty('validation.minValue', 10);
    });

    // Twentieth-wave Finding 2: the comparator SCC between the two pinned
    // variables is what empties the group; c's sameAs is satisfiable and
    // unrelated, so the repair must leave it standing.
    it('strips the comparator cycle that empties a group, keeping an unrelated sameAs', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: {
            minValue: 0,
            maxValue: 0,
            greaterThanOrEqualToVariable: 'b',
          },
        },
        b: {
          name: 'b',
          type: 'number',
          validation: {
            minValue: 1,
            maxValue: 1,
            greaterThanOrEqualToVariable: 'a',
          },
        },
        c: { name: 'c', type: 'number', validation: { sameAs: 'a' } },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.c).toHaveProperty('validation.sameAs', 'a');
      expect(variables?.a).not.toHaveProperty(
        'validation.greaterThanOrEqualToVariable',
      );
      expect(variables?.b).not.toHaveProperty(
        'validation.greaterThanOrEqualToVariable',
      );
      expect(variables?.a).toHaveProperty('validation.minValue', 0);
      expect(variables?.b).toHaveProperty('validation.maxValue', 1);
    });

    it('strips a sameAs categorical group whose option values share nothing', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { sameAs: 'b' },
        },
        b: {
          name: 'b',
          type: 'categorical',
          options: [
            { label: 'Green', value: 'green' },
            { label: 'Yellow', value: 'yellow' },
          ],
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.sameAs');
    });

    it('strips validation references to a differently-typed variable', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'text',
          validation: { sameAs: 'b', required: true },
        },
        b: { name: 'b', type: 'number' },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.sameAs');
      expect(variables?.a).toHaveProperty('validation.required', true);
    });

    it('leaves coherent rules untouched (negative control)', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'start',
          type: 'number',
          validation: { minValue: 0, maxValue: 10, lessThanVariable: 'b' },
        },
        b: {
          name: 'end',
          type: 'number',
          validation: { greaterThanVariable: 'a', maxValue: 100 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).toHaveProperty('validation.minValue', 0);
      expect(variables?.a).toHaveProperty('validation.maxValue', 10);
      expect(variables?.a).toHaveProperty('validation.lessThanVariable', 'b');
      expect(variables?.b).toHaveProperty(
        'validation.greaterThanVariable',
        'a',
      );
    });

    // Twenty-third-wave Finding 1: removing any ONE edge from an odd cycle
    // makes the remainder bipartite, so the fixpoint loop's single-pass
    // strip only needs to remove that one edge's declarations — not every
    // edge in the triangle (the old over-strip behaviour, which discarded
    // two otherwise-valid authored constraints alongside the truly
    // contradictory one). The edge is chosen deterministically by its own
    // canonical sorted key, which — for this authoring order, with no
    // sameAs grouping — picks a's declaration.
    it('strips only one differentFrom edge from an odd boolean cycle, keeping the rest satisfiable', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'boolean',
          validation: { differentFrom: 'b', required: true },
        },
        b: {
          name: 'b',
          type: 'boolean',
          validation: { differentFrom: 'c', required: true },
        },
        c: {
          name: 'c',
          type: 'boolean',
          validation: { differentFrom: 'a', required: true },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.differentFrom');
      expect(variables?.b).toHaveProperty('validation.differentFrom', 'c');
      expect(variables?.c).toHaveProperty('validation.differentFrom', 'a');
      expect(variables?.a).toHaveProperty('validation.required', true);
      expect(variables?.b).toHaveProperty('validation.required', true);
      expect(variables?.c).toHaveProperty('validation.required', true);
    });

    // Third-wave Finding 1: a triangle plus a branch rule hanging off one of
    // its members. The old whole-component strip removed d's differentFrom
    // too; the fix reconstructs only the triangle itself. Twenty-third-wave
    // Finding 1 additionally keeps two of the triangle's own three edges.
    it('keeps a branch differentFrom rule and two of the triangle edges hanging off an odd boolean cycle', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'boolean',
          validation: { differentFrom: 'b' },
        },
        b: {
          name: 'b',
          type: 'boolean',
          validation: { differentFrom: 'c' },
        },
        c: {
          name: 'c',
          type: 'boolean',
          validation: { differentFrom: 'a' },
        },
        d: {
          name: 'd',
          type: 'boolean',
          validation: { differentFrom: 'a' },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.differentFrom');
      expect(variables?.b).toHaveProperty('validation.differentFrom', 'c');
      expect(variables?.c).toHaveProperty('validation.differentFrom', 'a');
      expect(variables?.d).toHaveProperty('validation.differentFrom', 'a');
    });

    // Twenty-third-wave Finding 1: the migration end-to-end test the finding
    // asked for — a triangle among a/b/c plus TWO unrelated, satisfiable
    // constraints elsewhere (e/f's own differentFrom pair, and g's own
    // bounds) all survive the same migration pass that repairs the triangle.
    it('keeps unrelated constraints untouched while repairing an odd boolean cycle end-to-end', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'boolean',
          validation: { differentFrom: 'b' },
        },
        b: {
          name: 'b',
          type: 'boolean',
          validation: { differentFrom: 'c' },
        },
        c: {
          name: 'c',
          type: 'boolean',
          validation: { differentFrom: 'a' },
        },
        e: {
          name: 'e',
          type: 'boolean',
          validation: { differentFrom: 'f' },
        },
        f: { name: 'f', type: 'boolean', validation: {} },
        g: {
          name: 'g',
          type: 'number',
          validation: { minValue: 0, maxValue: 10 },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      // Exactly one edge of the triangle is gone; two survive.
      expect(variables?.a).not.toHaveProperty('validation.differentFrom');
      expect(variables?.b).toHaveProperty('validation.differentFrom', 'c');
      expect(variables?.c).toHaveProperty('validation.differentFrom', 'a');
      // Wholly unrelated constraints are untouched.
      expect(variables?.e).toHaveProperty('validation.differentFrom', 'f');
      expect(variables?.g).toHaveProperty('validation.minValue', 0);
      expect(variables?.g).toHaveProperty('validation.maxValue', 10);
    });

    // Third-wave Finding 4: A sameAs B (also stated as differentFrom, making
    // the pair itself class-7 contradictory) plus a strict comparator inside
    // the same sameAs group. Stripping sameAs+differentFrom alone already
    // resolves the group; applying every contradiction's strips from the
    // SAME pre-strip pass (the old behaviour) would additionally strip
    // greaterThanVariable even though it is fine once the group is gone.
    it('keeps a strict comparator that only looked group-internal in the same pre-strip pass', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'number',
          validation: {
            sameAs: 'b',
            differentFrom: 'b',
            greaterThanVariable: 'b',
          },
        },
        b: { name: 'b', type: 'number' },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.sameAs');
      expect(variables?.a).not.toHaveProperty('validation.differentFrom');
      expect(variables?.a).toHaveProperty(
        'validation.greaterThanVariable',
        'b',
      );
    });

    // Fifth-wave Finding 2: the fixpoint loop's bound must scale with the
    // data, not stay fixed — a fixed 100-pass cap is exhausted by a protocol
    // with more than 100 independent contradictions, since each pass here
    // only strips the rules of ONE contradiction. 101 variables, each with
    // its own inverted minValue/maxValue pair, are 101 completely
    // independent local (class 1) contradictions — no sameAs/comparator
    // relationships between them — so repairing all of them needs at least
    // 101 passes.
    it('fully repairs more independent contradictions than a fixed 100-pass cap would allow', () => {
      const variables: Record<string, unknown> = {};
      for (let index = 0; index < 101; index++) {
        variables[`v${index}`] = {
          name: `v${index}`,
          type: 'number',
          validation: { minValue: 10, maxValue: 2 },
        };
      }
      const migratedRaw = migrateVariables(variables);
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const parsedVariables = parsed.data?.codebook.ego?.variables ?? {};
      expect(Object.keys(parsedVariables)).toHaveLength(101);
      for (const variable of Object.values(parsedVariables)) {
        expect(variable).not.toHaveProperty('validation.minValue');
        expect(variable).not.toHaveProperty('validation.maxValue');
      }
    });

    // Thirteenth-wave Finding 4: independent LOCAL repairs are now applied in
    // one batch per pass instead of one per pass. The migrated result must be
    // identical to what the one-at-a-time loop produced.
    it('produces the one-at-a-time result for many independent inverted-bound variables', () => {
      const variables: Record<string, unknown> = {};
      const expected: Record<string, unknown> = {};
      for (let index = 0; index < 250; index++) {
        variables[`v${index}`] = {
          name: `v${index}`,
          type: 'number',
          validation: { minValue: 10, maxValue: 2, required: true },
        };
        expected[`v${index}`] = {
          name: `v${index}`,
          type: 'number',
          validation: { required: true },
        };
      }
      const migratedRaw = migrateVariables(variables);
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.codebook.ego?.variables).toEqual(expected);
    });

    // Two local contradictions on ONE variable are not pairwise disjoint, so
    // they cannot share a pass; the fixpoint still repairs both.
    it('repairs two local contradictions on the same variable across passes', () => {
      const migratedRaw = migrateVariables({
        a: {
          name: 'a',
          type: 'categorical',
          options: [
            { label: 'x', value: 'x' },
            { label: 'y', value: 'y' },
          ],
          validation: { minSelected: 5, maxSelected: 1, required: true },
        },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;
      expect(variables?.a).not.toHaveProperty('validation.minSelected');
      expect(variables?.a).not.toHaveProperty('validation.maxSelected');
      expect(variables?.a).toHaveProperty('validation.required', true);
    });

    // Local repairs batch; a/b's sameAs+differentFrom+greaterThanVariable
    // trio reports two overlapping structural contradictions over the same
    // {a, b} (a conflictingReferencePair and a sameAsGroupConflict), so
    // batching's disjointness check still defers one of them to a later
    // pass — the strict comparator that only looked group-internal before
    // the sameAs group was dissolved survives.
    it('batches local repairs without changing structural repair behaviour', () => {
      const variables: Record<string, unknown> = {
        a: {
          name: 'a',
          type: 'number',
          validation: {
            sameAs: 'b',
            differentFrom: 'b',
            greaterThanVariable: 'b',
          },
        },
        b: { name: 'b', type: 'number' },
      };
      for (let index = 0; index < 50; index++) {
        variables[`v${index}`] = {
          name: `v${index}`,
          type: 'number',
          validation: { minValue: 10, maxValue: 2, required: true },
        };
      }
      const migratedRaw = migrateVariables(variables);
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(parsed.success).toBe(true);
      const parsedVariables = parsed.data?.codebook.ego?.variables;
      expect(parsedVariables?.a).not.toHaveProperty('validation.sameAs');
      expect(parsedVariables?.a).not.toHaveProperty('validation.differentFrom');
      expect(parsedVariables?.a).toHaveProperty(
        'validation.greaterThanVariable',
        'b',
      );
      for (let index = 0; index < 50; index++) {
        expect(parsedVariables?.[`v${index}`]).toEqual({
          name: `v${index}`,
          type: 'number',
          validation: { required: true },
        });
      }
    });

    // Batching now extends beyond the local classes to every structural
    // class whose `variableIds` names its full participant set (see
    // `NON_BATCHABLE_CONTRADICTION_CLASSES` in migration.ts). This exercises
    // several DISJOINT contradictions spanning different classes —
    // invertedBounds (n), conflictingReferencePair (r1/r2), and a
    // strictComparatorCycle (c1/c2) — alongside the classic INTERDEPENDENT
    // cluster (x/y's sameAs+differentFrom+greaterThanVariable trio, which
    // reports two contradictions over the same pair and so cannot fully
    // resolve in the same pass as the disjoint ones). The whole protocol
    // still migrates to something that validates, with exactly the expected
    // rules stripped from every group.
    it('batches disjoint repairs across several structural classes while still resolving an interdependent cluster', () => {
      const migratedRaw = migrateVariables({
        n: {
          name: 'n',
          type: 'number',
          validation: { minValue: 10, maxValue: 2, required: true },
        },
        r1: {
          name: 'r1',
          type: 'text',
          validation: { sameAs: 'r2', differentFrom: 'r2' },
        },
        r2: { name: 'r2', type: 'text' },
        c1: {
          name: 'c1',
          type: 'number',
          validation: { minValue: 0, greaterThanVariable: 'c2' },
        },
        c2: {
          name: 'c2',
          type: 'number',
          validation: { greaterThanVariable: 'c1' },
        },
        x: {
          name: 'x',
          type: 'number',
          validation: {
            sameAs: 'y',
            differentFrom: 'y',
            greaterThanVariable: 'y',
          },
        },
        y: { name: 'y', type: 'number' },
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      const variables = parsed.data?.codebook.ego?.variables;

      expect(variables?.n).not.toHaveProperty('validation.minValue');
      expect(variables?.n).not.toHaveProperty('validation.maxValue');
      expect(variables?.n).toHaveProperty('validation.required', true);

      expect(variables?.r1).not.toHaveProperty('validation.sameAs');
      expect(variables?.r1).not.toHaveProperty('validation.differentFrom');

      expect(variables?.c1).not.toHaveProperty(
        'validation.greaterThanVariable',
      );
      expect(variables?.c2).not.toHaveProperty(
        'validation.greaterThanVariable',
      );
      expect(variables?.c1).toHaveProperty('validation.minValue', 0);

      expect(variables?.x).not.toHaveProperty('validation.sameAs');
      expect(variables?.x).not.toHaveProperty('validation.differentFrom');
      expect(variables?.x).toHaveProperty(
        'validation.greaterThanVariable',
        'y',
      );
    });
  });

  describe('otherVariable and quickAdd required backfill', () => {
    const migrate = (protocol: Record<string, unknown>) =>
      migrationV7toV8.migrate(protocol as unknown as Protocol<7>, {
        name: 'Test Protocol',
      }) as unknown as {
        codebook: {
          node: { person: { variables: Record<string, unknown> } };
        };
      };

    const protocolWith = (
      variables: Record<string, unknown>,
      stages: unknown[],
    ) => ({
      schemaVersion: 7 as const,
      codebook: { node: { person: { name: 'Person', color: 'c', variables } } },
      stages,
    });

    it('sets required on otherVariable and quickAdd targets, overriding explicit false', () => {
      const migrated = migrate(
        protocolWith(
          {
            other: { name: 'other', type: 'text' },
            quick: {
              name: 'quick',
              type: 'text',
              validation: { required: false },
            },
            untouched: { name: 'untouched', type: 'text' },
          },
          [
            {
              id: 's1',
              type: 'CategoricalBin',
              label: 'Bin',
              subject: { entity: 'node', type: 'person' },
              prompts: [
                {
                  id: 'p1',
                  text: 'T',
                  variable: 'untouched',
                  otherVariable: 'other',
                  otherVariablePrompt: 'W',
                  otherOptionLabel: 'O',
                },
              ],
            },
            {
              id: 's2',
              type: 'NameGeneratorQuickAdd',
              label: 'QA',
              subject: { entity: 'node', type: 'person' },
              quickAdd: 'quick',
              prompts: [{ id: 'p2', text: 'T' }],
            },
          ],
        ),
      );
      const variables = migrated.codebook.node.person.variables;
      expect(variables.other).toHaveProperty('validation.required', true);
      expect(variables.quick).toHaveProperty('validation.required', true);
      expect(variables.untouched).not.toHaveProperty('validation.required');
    });

    it('leaves other rules on the target intact', () => {
      const migrated = migrate(
        protocolWith(
          {
            other: {
              name: 'other',
              type: 'text',
              validation: { maxLength: 10 },
            },
          },
          [
            {
              id: 's1',
              type: 'CategoricalBin',
              label: 'Bin',
              subject: { entity: 'node', type: 'person' },
              prompts: [
                {
                  id: 'p1',
                  text: 'T',
                  variable: 'other2x',
                  otherVariable: 'other',
                  otherVariablePrompt: 'W',
                  otherOptionLabel: 'O',
                },
              ],
            },
          ],
        ),
      );
      expect(migrated.codebook.node.person.variables.other).toHaveProperty(
        'validation.maxLength',
        10,
      );
      expect(migrated.codebook.node.person.variables.other).toHaveProperty(
        'validation.required',
        true,
      );
    });
  });

  // Fuzz finding (migration-fuzz.test.ts): v7's loose validation object
  // admits rule keys v8 has never defined, wrong-typed rule values, and
  // rules parked on a variable type whose v8 rule set does not list them.
  // All of them failed the v8 strict per-type pick and blocked the import.
  describe('validation-rule shape strips', () => {
    const migrateEgoVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: { variables } },
        stages: [],
      } as unknown as Protocol<7>;
      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      return parsed.data?.codebook.ego?.variables ?? {};
    };

    it('strips a wrong-typed rule value without fabricating requiredness', () => {
      const variables = migrateEgoVariables({
        nickname: {
          name: 'nickname',
          type: 'text',
          component: 'Text',
          validation: { minLength: '3' },
        },
      });
      expect(variables.nickname).not.toHaveProperty('validation.minLength');
      expect(variables.nickname).not.toHaveProperty('validation.required');
    });

    it('strips unknown rule keys, keeping the known siblings', () => {
      const variables = migrateEgoVariables({
        nickname: {
          name: 'nickname',
          type: 'text',
          component: 'Text',
          validation: { pattern: '^a', minWords: 2, maxLength: 12 },
        },
      });
      expect(variables.nickname).not.toHaveProperty('validation.pattern');
      expect(variables.nickname).not.toHaveProperty('validation.minWords');
      expect(variables.nickname).toHaveProperty('validation.maxLength', 12);
    });

    it('strips a wrong-typed reference target', () => {
      const variables = migrateEgoVariables({
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { sameAs: 7 },
        },
      });
      expect(variables.age).not.toHaveProperty('validation.sameAs');
    });

    it('strips a rule parked on a type v8 does not allow it on, preserving the implied requiredness', () => {
      const variables = migrateEgoVariables({
        nickname: {
          name: 'nickname',
          type: 'text',
          component: 'Text',
          validation: { minValue: 5 },
        },
      });
      expect(variables.nickname).not.toHaveProperty('validation.minValue');
      // v7 treated any min* validator as implying the field was required.
      expect(variables.nickname).toHaveProperty('validation.required', true);
    });

    it('strips requiredAcceptsNull (no v8 variable type accepts it)', () => {
      const variables = migrateEgoVariables({
        age: {
          name: 'age',
          type: 'number',
          component: 'Number',
          validation: { requiredAcceptsNull: true, required: true },
        },
      });
      expect(variables.age).not.toHaveProperty(
        'validation.requiredAcceptsNull',
      );
      expect(variables.age).toHaveProperty('validation.required', true);
    });

    it('removes validation from a layout variable entirely', () => {
      const variables = migrateEgoVariables({
        pos: {
          name: 'pos',
          type: 'layout',
          validation: { required: true },
        },
      });
      expect(variables.pos).not.toHaveProperty('validation');
    });
  });

  // Fuzz finding (migration-fuzz.test.ts): the v8 variable union has no
  // member pairing a variable type with a control it cannot render, so a
  // hand-edited or legacy pairing (or an unrecognised control name) failed
  // every union member and blocked the import.
  describe('component normalisation', () => {
    const migrateEgoVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: { variables } },
        stages: [],
      } as unknown as Protocol<7>;
      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      return parsed.data?.codebook.ego?.variables ?? {};
    };

    it("replaces a component that cannot render the variable's type with the type's standard control", () => {
      const variables = migrateEgoVariables({
        nickname: { name: 'nickname', type: 'text', component: 'Number' },
      });
      expect(variables.nickname).toHaveProperty('component', 'Text');
    });

    it("routes a datetime replacement by its parameters' shape", () => {
      const variables = migrateEgoVariables({
        lastSeen: {
          name: 'lastSeen',
          type: 'datetime',
          component: 'Text',
          parameters: { anchor: '2024-06-01', before: 180, after: 0 },
        },
        dob: {
          name: 'dob',
          type: 'datetime',
          component: 'Toggle',
          parameters: { type: 'year', min: '1950', max: '2026' },
        },
      });
      expect(variables.lastSeen).toHaveProperty(
        'component',
        'RelativeDatePicker',
      );
      expect(variables.dob).toHaveProperty('component', 'DatePicker');
    });

    it('replaces a non-string component', () => {
      const variables = migrateEgoVariables({
        age: { name: 'age', type: 'number', component: 5 },
      });
      expect(variables.age).toHaveProperty('component', 'Number');
    });

    it('removes a component from a layout variable', () => {
      const variables = migrateEgoVariables({
        pos: { name: 'pos', type: 'layout', component: 'Text' },
      });
      expect(variables.pos).not.toHaveProperty('component');
    });
  });

  // Fuzz finding (migration-fuzz.test.ts): v8 option values are strings or
  // whole numbers with string labels, and boolean options are labelled
  // true/false choices; v7-legal fractional values, numeric labels, and
  // wrong-typed boolean entries all blocked the import.
  describe('option entry normalisation', () => {
    const migrateEgoVariables = (variables: Record<string, unknown>) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: { node: {}, edge: {}, ego: { variables } },
        stages: [],
      } as unknown as Protocol<7>;
      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      return parsed.data?.codebook.ego?.variables ?? {};
    };

    it('coerces a fractional numeric option value to its string form', () => {
      const variables = migrateEgoVariables({
        rating: {
          name: 'rating',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Half', value: 0.5 },
            { label: 'One', value: 1 },
          ],
        },
      });
      const rating = variables.rating;
      if (!rating || !('options' in rating)) {
        throw new Error('expected rating options');
      }
      expect(rating.options).toEqual([
        { label: 'Half', value: '0.5' },
        { label: 'One', value: 1 },
      ]);
    });

    it('coerces a numeric option label to its display string', () => {
      const variables = migrateEgoVariables({
        rating: {
          name: 'rating',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 7, value: 'seven' },
            { label: 'Eight', value: 'eight' },
          ],
        },
      });
      const rating = variables.rating;
      if (!rating || !('options' in rating)) {
        throw new Error('expected rating options');
      }
      expect(rating.options).toEqual([
        { label: '7', value: 'seven' },
        { label: 'Eight', value: 'eight' },
      ]);
    });

    it('drops a malformed boolean option entry, keeping the well-formed one', () => {
      const variables = migrateEgoVariables({
        employed: {
          name: 'employed',
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: false },
          ],
        },
      });
      const employed = variables.employed;
      if (!employed || !('options' in employed)) {
        throw new Error('expected employed options');
      }
      expect(employed.options).toEqual([{ label: 'No', value: false }]);
    });

    it('removes boolean options entirely when no well-formed entry remains', () => {
      const variables = migrateEgoVariables({
        employed: {
          name: 'employed',
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: 'Yes', value: 1 },
            { label: 2, value: false },
          ],
        },
      });
      // Falls back to the runtime's standard Yes/No choices.
      expect(variables.employed).not.toHaveProperty('options');
    });
  });

  // Fuzz finding (migration-fuzz.test.ts): a datetime `parameters` that is
  // not a plain object (a hand-edited string, list, or null) fails both v8
  // parameters strictObjects and blocked the import.
  describe('wrong-typed datetime parameters record', () => {
    const migrateDatetime = (parameters: unknown) => {
      const v7Protocol = {
        schemaVersion: 7 as const,
        codebook: {
          node: {},
          edge: {},
          ego: {
            variables: {
              dob: {
                name: 'dob',
                type: 'datetime',
                component: 'DatePicker',
                parameters,
              },
            },
          },
        },
        stages: [],
      } as unknown as Protocol<7>;
      const migratedRaw = migrationV7toV8.migrate(v7Protocol, {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.safeParse(migratedRaw);
      expect(
        parsed.success,
        JSON.stringify(!parsed.success && parsed.error.issues, null, 2),
      ).toBe(true);
      return parsed.data?.codebook.ego?.variables?.dob;
    };

    it('removes a string parameters record', () => {
      expect(migrateDatetime('full')).not.toHaveProperty('parameters');
    });

    it('removes an array parameters record', () => {
      expect(migrateDatetime([])).not.toHaveProperty('parameters');
    });

    it('removes a null parameters record', () => {
      expect(migrateDatetime(null)).not.toHaveProperty('parameters');
    });
  });
});
