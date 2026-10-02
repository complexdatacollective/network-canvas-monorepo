import { describe, expect, it } from 'vitest';

import { CodebookNameSchema } from '@codaco/shared-consts';

import migrationV3toV4 from '../migration.ts';

describe('Migration V3 to V4', () => {
  const makeProtocol = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 3 as const,
    codebook: {
      node: {},
      edge: {},
      ego: { name: 'ego' },
    },
    stages: [],
    ...overrides,
  });

  const isObject = (value: unknown): value is object =>
    typeof value === 'object' && value !== null;

  function getNestedValue(obj: unknown, ...keys: string[]): unknown {
    let current = obj;
    for (const key of keys) {
      if (
        current === null ||
        current === undefined ||
        typeof current !== 'object'
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  const migrateVariableName = (name: string) => {
    const protocol = makeProtocol({
      codebook: {
        node: {
          person: {
            name: 'Person',
            variables: {
              v1: { name },
            },
          },
        },
        edge: {},
        ego: { name: 'ego' },
      },
    });

    const migrated = migrationV3toV4.migrate(protocol, {});
    return getNestedValue(
      migrated.codebook,
      'node',
      'person',
      'variables',
      'v1',
      'name',
    );
  };

  describe('variable name sanitization', () => {
    it.each([
      ['first name'],
      ['var!@#$name'],
      ['namé'],
      ['naïve'],
      ['名前'],
      ['اسم'],
    ])('keeps %s, which is already a valid name', (name) => {
      expect(migrateVariableName(name)).toBe(name);
    });

    it.each([
      ['  first name ', 'first name'],
      ['first\tname', 'first name'],
      ['first\r\n\r\nname', 'first name'],
      ['na\u0007me', 'name'],
      ['name\u0000', 'name'],
      ['na\uFFFEme\uFFFF', 'name'],
      ['\u0007 name', 'name'],
      ['nam\u0065\u0301', 'namé'],
      ['bad\uD800surrogate', 'bad\uFFFDsurrogate'],
    ])('tidies %j to %j', (name, expected) => {
      expect(migrateVariableName(name)).toBe(expected);
    });

    it('names an attribute after its id when nothing of its name is left', () => {
      expect(migrateVariableName(' \t\u0007 ')).toBe('v1');
    });

    it('produces names that schema 9 accepts', () => {
      for (const name of [
        ' \u0085padded\u0085 ',
        'mixed\u0000\u001F\u007F\u009Fcontrols',
        'cafe\u0301',
        '\uFEFFbom',
      ]) {
        expect(CodebookNameSchema.safeParse(migrateVariableName(name))).toEqual(
          expect.objectContaining({ success: true }),
        );
      }
    });

    it('preserves allowed characters (letters, numbers, . _ - :)', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: {
                v1: { name: 'valid.name_with-special:chars123' },
              },
            },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      expect(
        getNestedValue(
          migrated.codebook,
          'node',
          'person',
          'variables',
          'v1',
          'name',
        ),
      ).toBe('valid.name_with-special:chars123');
    });
  });

  describe('variable name deduplication', () => {
    it('adds numerical suffix when sanitized names collide', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: {
                v1: { name: 'my var' },
                v2: { name: 'my var ' },
                v3: { name: 'my\tvar' },
              },
            },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const names = [
        getNestedValue(
          migrated.codebook,
          'node',
          'person',
          'variables',
          'v1',
          'name',
        ),
        getNestedValue(
          migrated.codebook,
          'node',
          'person',
          'variables',
          'v2',
          'name',
        ),
        getNestedValue(
          migrated.codebook,
          'node',
          'person',
          'variables',
          'v3',
          'name',
        ),
      ];

      expect(names).toEqual(['my var', 'my var2', 'my var3']);
    });
  });

  describe('option value sanitization', () => {
    it('sanitizes ordinal/categorical option values', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: {
                v1: {
                  name: 'category',
                  options: [
                    { label: 'Option A', value: 'hello world' },
                    { label: 'Option B', value: 'foo!bar' },
                    { label: 'Option C', value: ' größer\u0000 ' },
                    { label: 'Option D', value: 3 },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const options = getNestedValue(
        migrated.codebook,
        'node',
        'person',
        'variables',
        'v1',
        'options',
      ) as Array<{
        value: string;
      }>;
      expect(options.map((option) => option.value)).toEqual([
        'hello world',
        'foo!bar',
        'größer',
        3,
      ]);
    });

    it('deduplicates option values with numerical suffixes', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: {
                v1: {
                  name: 'category',
                  options: [
                    { label: 'A', value: 'a b' },
                    { label: 'B', value: ' a b' },
                  ],
                },
              },
            },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const options = getNestedValue(
        migrated.codebook,
        'node',
        'person',
        'variables',
        'v1',
        'options',
      ) as Array<{
        value: string;
      }>;
      expect(options.map((o) => o.value)).toEqual(['a b', 'a b2']);
    });
  });

  describe('rules that compare against a changed option value', () => {
    const rule = (
      type: string,
      attribute: string,
      value: unknown,
      entityType?: string,
    ) => ({
      id: `${type}-${attribute}`,
      type,
      options: {
        ...(entityType && { type: entityType }),
        attribute,
        operator: 'EXACTLY',
        value,
      },
    });

    const categorical = (values: unknown[]) => ({
      name: 'category',
      type: 'categorical',
      options: values.map((value) => ({ label: String(value), value })),
    });

    const protocol = makeProtocol({
      codebook: {
        node: {
          person: {
            name: 'Person',
            variables: {
              closeness: categorical(['very close ', 'close', 'close ']),
            },
          },
          place: {
            name: 'Place',
            variables: { closeness: categorical(['very close ', 'far']) },
          },
        },
        edge: {
          knows: {
            name: 'knows',
            variables: { how: categorical(['work\u0000', 'school']) },
          },
        },
        ego: {
          name: 'ego',
          variables: { mood: categorical([' happy', 'sad']) },
        },
      },
      stages: [
        {
          id: 'filtered',
          filter: {
            join: 'OR',
            rules: [
              rule('alter', 'closeness', 'very close ', 'person'),
              rule('alter', 'closeness', 'close ', 'person'),
              rule('alter', 'closeness', ['close', 'very close '], 'person'),
              rule('edge', 'how', 'work\u0000', 'knows'),
              rule('alter', 'closeness', 'very close ', 'missing'),
            ],
          },
          skipLogic: {
            action: 'SHOW',
            filter: { rules: [rule('ego', 'mood', ' happy')] },
          },
          panels: [
            {
              id: 'panel',
              filter: {
                rules: [rule('alter', 'closeness', 'very close ', 'place')],
              },
            },
            { id: 'unfiltered' },
          ],
        },
        { id: 'plain', type: 'Information' },
      ],
    });

    const migrated = migrationV3toV4.migrate(protocol, {});
    const stage = getNestedValue(migrated.stages, '0');
    const ruleValues = (...path: string[]) =>
      (
        getNestedValue(stage, ...path, 'rules') as {
          options: { value: unknown };
        }[]
      ).map(({ options }) => options.value);

    it('renames the value in stage filter rules of the same attribute', () => {
      expect(ruleValues('filter')).toEqual([
        'very close',
        // The second "close" option was suffixed, but a rule naming "close "
        // meant the option whose value that was.
        'close2',
        ['close', 'very close'],
        'work',
        // No such entity type, so the rule is not about this attribute.
        'very close ',
      ]);
    });

    it('renames the value in skip logic and panel filter rules', () => {
      expect(ruleValues('skipLogic', 'filter')).toEqual(['happy']);
      expect(ruleValues('panels', '0', 'filter')).toEqual(['very close']);
    });

    it('leaves the rest of the stages as they were', () => {
      expect(getNestedValue(stage, 'filter', 'join')).toBe('OR');
      expect(getNestedValue(stage, 'skipLogic', 'action')).toBe('SHOW');
      expect(getNestedValue(stage, 'panels', '1')).toEqual({
        id: 'unfiltered',
      });
      expect(getNestedValue(migrated.stages, '1')).toEqual({
        id: 'plain',
        type: 'Information',
      });
    });
  });

  describe('type name sanitization', () => {
    it('sanitizes node type names', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            t1: { name: ' My Type!\n' },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      expect(getNestedValue(migrated.codebook, 'node', 't1', 'name')).toBe(
        'My Type!',
      );
    });

    it('sanitizes edge type names', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {},
          edge: {
            e1: { name: 'kennt\tgut' },
          },
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      expect(getNestedValue(migrated.codebook, 'edge', 'e1', 'name')).toBe(
        'kennt gut',
      );
    });
  });

  describe('type name deduplication', () => {
    it('adds numerical suffix when sanitized type names collide', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            t1: { name: 'my type' },
            t2: { name: 'my type ' },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const names = [
        getNestedValue(migrated.codebook, 'node', 't1', 'name'),
        getNestedValue(migrated.codebook, 'node', 't2', 'name'),
      ];
      expect(names).toEqual(['my type', 'my type2']);
    });
  });

  describe('additionalAttributes filtering', () => {
    it('removes non-boolean additionalAttributes from prompts', () => {
      const protocol = makeProtocol({
        stages: [
          {
            prompts: [
              {
                id: 'p1',
                text: 'test',
                additionalAttributes: [
                  { variable: 'v1', value: true },
                  { variable: 'v2', value: 'some string' },
                  { variable: 'v3', value: false },
                  { variable: 'v4', value: 42 },
                ],
              },
            ],
          },
        ],
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const attrs = getNestedValue(
        migrated.stages,
        '0',
        'prompts',
        '0',
        'additionalAttributes',
      ) as Array<{
        variable: string;
        value: unknown;
      }>;
      expect(attrs).toHaveLength(2);
      expect(attrs.at(0)?.value).toBe(true);
      expect(attrs.at(1)?.value).toBe(false);
    });

    it('removes additionalAttributes entirely if no boolean entries remain', () => {
      const protocol = makeProtocol({
        stages: [
          {
            prompts: [
              {
                id: 'p1',
                text: 'test',
                additionalAttributes: [
                  { variable: 'v1', value: 'string' },
                  { variable: 'v2', value: 42 },
                ],
              },
            ],
          },
        ],
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const prompt = (
        migrated.stages as Array<{ prompts: Array<Record<string, unknown>> }>
      )
        .at(0)
        ?.prompts.at(0);
      expect(prompt).not.toHaveProperty('additionalAttributes');
    });

    it('does not modify prompts without additionalAttributes', () => {
      const protocol = makeProtocol({
        stages: [
          {
            prompts: [{ id: 'p1', text: 'test' }],
          },
        ],
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const prompt = (
        migrated.stages as Array<{ prompts: Array<Record<string, unknown>> }>
      )
        .at(0)
        ?.prompts.at(0);
      expect(prompt).not.toHaveProperty('additionalAttributes');
      expect(prompt?.id).toBe('p1');
    });

    it('does not modify stages without prompts', () => {
      const protocol = makeProtocol({
        stages: [{ id: 's1', type: 'Information' }],
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const stage = (migrated.stages as Array<Record<string, unknown>>).at(0);
      expect(stage?.id).toBe('s1');
    });
  });

  describe('schema version bump', () => {
    it('sets schemaVersion to 4', () => {
      const protocol = makeProtocol();
      const migrated = migrationV3toV4.migrate(protocol, {});
      expect(migrated.schemaVersion).toBe(4);
    });
  });

  describe('migration metadata', () => {
    it('has correct from and to versions', () => {
      expect(migrationV3toV4.from).toBe(3);
      expect(migrationV3toV4.to).toBe(4);
    });

    it('has migration notes', () => {
      expect(migrationV3toV4.notes).toBeDefined();
      expect(typeof migrationV3toV4.notes).toBe('string');
      if (migrationV3toV4.notes) {
        expect(migrationV3toV4.notes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('preserves existing data', () => {
    it('does not modify properties outside codebook and stages', () => {
      const protocol = makeProtocol({
        description: 'My protocol',
        lastModified: '2025-01-01',
        customField: { nested: true },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const result = migrated as Record<string, unknown>;
      expect(result.description).toBe('My protocol');
      expect(result.lastModified).toBe('2025-01-01');
      expect(result.customField).toEqual({ nested: true });
    });

    it('does not add options to variables that have none', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: {
              name: 'Person',
              variables: {
                v1: { name: 'name', type: 'text' },
              },
            },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const v1 = getNestedValue(
        migrated.codebook,
        'node',
        'person',
        'variables',
        'v1',
      ) as Record<string, unknown>;
      expect(v1).not.toHaveProperty('options');
    });

    it('does not add variables to types that have none', () => {
      const protocol = makeProtocol({
        codebook: {
          node: {
            person: { name: 'Person' },
          },
          edge: {},
          ego: { name: 'ego' },
        },
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const person = getNestedValue(
        migrated.codebook,
        'node',
        'person',
      ) as Record<string, unknown>;
      expect(person).not.toHaveProperty('variables');
    });

    // A plain object assigned a `__proto__` key takes the value as its
    // prototype, losing the entry; it must stay an entry, still counted when
    // names are made unique, so validation can refuse the id.
    it.each([
      ['a type', ['node'], 'Person2'],
      ['a variable', ['node', 'person', 'variables'], 'first'],
    ])('keeps %s whose id is __proto__ as an entry', (_, path, name) => {
      const protocol = makeProtocol({
        codebook: JSON.parse(
          '{"node":{"person":{"name":"Person","variables":{"__proto__":{"name":"first"},"v1":{"name":"first"}}},"__proto__":{"name":"Person"}},"edge":{},"ego":{"name":"ego"}}',
        ),
      });

      const migrated = migrationV3toV4.migrate(protocol, {});
      const record = getNestedValue(migrated.codebook, ...path);

      expect(isObject(record) && Object.hasOwn(record, '__proto__')).toBe(true);
      expect(isObject(record) && Object.getPrototypeOf(record)).toBe(
        Object.prototype,
      );
      expect(getNestedValue(record, '__proto__', 'name')).toBe(name);
    });
  });
});
