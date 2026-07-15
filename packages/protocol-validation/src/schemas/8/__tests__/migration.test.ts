import { describe, expect, it } from 'vitest';

import type { Protocol } from '~/schemas';

import migrationV7toV8 from '../migration';
import ProtocolSchemaV8 from '../schema';

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
              variables: { name: { name: 'Name', type: 'text' } },
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
              variables: { name: { name: 'Name', type: 'text' } },
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
              variables: { name: { name: 'Name', type: 'text' } },
            },
          },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: { weight: { name: 'Weight', type: 'text' } },
            },
          },
          ego: { variables: { egoName: { name: 'EgoName', type: 'text' } } },
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

    it("defaults otherVariablePrompt to 'Please specify' when no label", () => {
      // No otherOptionLabel is present, so the migrated protocol still trips a
      // separate Stage A cross-ref (otherOptionLabel required); assert on the
      // migrated shape directly to isolate the otherVariablePrompt backfill.
      const migratedRaw = migrationV7toV8.migrate(
        buildBinProtocol({ otherVariable: 'other' }),
        { name: 'Test Protocol' },
      ) as unknown as {
        stages: { prompts?: { otherVariablePrompt?: unknown }[] }[];
      };
      expect(migratedRaw.stages[0]?.prompts?.[0]?.otherVariablePrompt).toBe(
        'Please specify',
      );
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

    it('drops a color outside the ord-color-seq palette', () => {
      const migratedRaw = migrationV7toV8.migrate(
        buildOrdinalProtocol({ color: 'coral' }),
        { name: 'Test Protocol' },
      );
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('color');
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

    it('leaves a prompt without color untouched', () => {
      const migratedRaw = migrationV7toV8.migrate(buildOrdinalProtocol({}), {
        name: 'Test Protocol',
      });
      const parsed = ProtocolSchemaV8.parse(migratedRaw);
      const stage = parsed.stages[0];
      if (stage && 'prompts' in stage) {
        expect(stage.prompts[0]).not.toHaveProperty('color');
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

  describe('NameGenerator behaviours normalisation', () => {
    const buildNgProtocol = (behaviours: Record<string, unknown>) =>
      ({
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

    it('keeps highlight when edges.create is absent', () => {
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
            prompts: [
              {
                id: 'p1',
                text: 'Position',
                layout: { layoutVariable: 'layoutPos' },
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
        expect(stage.prompts[0]).toHaveProperty(
          'highlight.allowHighlighting',
          true,
        );
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
              variables: { name: { name: 'Name', type: 'text' } },
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
              variables: { name: { name: 'Name', type: 'text' } },
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
});
