import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { stageSchema } from '@codaco/protocol-validation';

import { informationScenarios } from './information.scenarios.js';
import { OPTION_INVENTORY } from './option-inventory.js';
import { sharedSuiteClaims } from './shared-claims.js';
import type { InterfaceScenarios } from './types.js';

// Interface tasks append their registry import here as they land. Task 27
// replaces this list with the all-scenarios.ts aggregator.
const ALL_SUITES: InterfaceScenarios[] = [informationScenarios];

describe('e2e matrix coverage manifest', () => {
  it('every inventoried option key is claimed by at least one scenario', () => {
    const claimed = new Set<string>(
      ALL_SUITES.flatMap((s) =>
        s.scenarios.flatMap((sc) =>
          sc.covers.map((key) => `${s.interfaceType}:${key}`),
        ),
      ),
    );
    for (const claim of sharedSuiteClaims) claimed.add(claim);

    const missing: string[] = [];
    for (const [iface, keys] of Object.entries(OPTION_INVENTORY)) {
      // Only enforce interfaces whose registry has landed
      if (
        !ALL_SUITES.some((s) => s.interfaceType === iface) &&
        !sharedSuiteClaims.some((c) => c.startsWith(`${iface}:`))
      ) {
        continue;
      }
      for (const key of keys) {
        if (!claimed.has(`${iface}:${key}`)) missing.push(`${iface}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('scenario ids are unique and exactly one smoke scenario per interface', () => {
    for (const suite of ALL_SUITES) {
      const ids = suite.scenarios.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const smokeCount = suite.scenarios.filter((s) => s.smoke).length;
      expect(
        smokeCount,
        `${suite.interfaceType} must have exactly 1 smoke scenario`,
      ).toBe(1);
    }
  });

  it('every landed interface inventory includes the top-level and prompt-level stage schema keys', () => {
    // Base keys every stage carries; covered globally, not per-interface.
    const BASE_KEYS = new Set(['id', 'type', 'label']);
    // Inventory keys are free-form (e.g. 'items[].size'); a schema key counts
    // as inventoried when any inventory key starts with it.
    const inventoryCoversSchemaKey = (
      inventory: readonly string[],
      schemaKey: string,
    ) => inventory.some((k) => k === schemaKey || k.startsWith(schemaKey));

    const unwrap = (schema: z.ZodType): z.ZodType => {
      let current = schema;
      for (;;) {
        if (
          current instanceof z.ZodOptional ||
          current instanceof z.ZodNullable
        ) {
          current = current.unwrap() as z.ZodType;
          continue;
        }
        // Zod 4 pipes/effects expose the inner schema via `in`
        if ('in' in current && current.in instanceof z.ZodType) {
          current = current.in;
          continue;
        }
        return current;
      }
    };

    const landed = new Set(ALL_SUITES.map((s) => s.interfaceType));
    const options: readonly z.ZodType[] =
      stageSchema instanceof z.ZodUnion ? stageSchema.options : [];
    expect(options.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const option of options) {
      const objectSchema = unwrap(option);
      if (!(objectSchema instanceof z.ZodObject)) continue;
      const shape = objectSchema.shape as Record<string, z.ZodType>;
      const typeField = shape.type;
      const literal =
        typeField && typeField instanceof z.ZodLiteral
          ? String(typeField.value)
          : undefined;
      if (!literal || !landed.has(literal)) continue;

      const inventory = OPTION_INVENTORY[literal] ?? [];
      for (const key of Object.keys(shape)) {
        if (BASE_KEYS.has(key)) continue;
        if (!inventoryCoversSchemaKey(inventory, key)) {
          missing.push(`${literal}:${key}`);
        }
        // Prompt-level keys: walk the prompts array element shape
        if (key === 'prompts') {
          const promptsSchema = unwrap(shape[key]!);
          if (promptsSchema instanceof z.ZodArray) {
            const element = unwrap(promptsSchema.element as z.ZodType);
            if (element instanceof z.ZodObject) {
              for (const promptKey of Object.keys(element.shape)) {
                if (promptKey === 'id') continue;
                if (
                  !inventoryCoversSchemaKey(inventory, `prompts[].${promptKey}`)
                ) {
                  missing.push(`${literal}:prompts[].${promptKey}`);
                }
              }
            }
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every shared claim is backed by a real suite scenario or pending suite', () => {
    // Until Task 26 (cross-cutting suite) lands, shared claims are only
    // asserted to reference inventoried keys of known interfaces.
    for (const claim of sharedSuiteClaims) {
      const [iface, key] = claim.split(':');
      expect(iface && key, `malformed shared claim: ${claim}`).toBeTruthy();
      expect(
        OPTION_INVENTORY[iface!] ?? [],
        `shared claim references unknown inventory: ${claim}`,
      ).toContain(key!);
    }
  });
});
