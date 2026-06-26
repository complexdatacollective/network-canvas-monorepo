import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ENTITY_ATTRIBUTE_REFERENCE,
  asEntityAttributeReference,
  entityAttributeReference,
  getEntityAttributeReferenceDescriptor,
} from '../entity-attribute-reference';

describe('entityAttributeReference', () => {
  it('exports the marker constant', () => {
    expect(ENTITY_ATTRIBUTE_REFERENCE).toBe('entityAttributeReference');
  });

  it('tags the schema with a retrievable descriptor', () => {
    const schema = entityAttributeReference({ subject: 'stageSubject' });
    expect(getEntityAttributeReferenceDescriptor(schema)).toEqual({
      subject: 'stageSubject',
    });
  });

  it('exposes the descriptor through an optional wrapper (meta on inner type)', () => {
    const schema = entityAttributeReference({ subject: 'ego' }).optional();
    const inner = schema._zod.def.innerType as z.ZodType;
    expect(getEntityAttributeReferenceDescriptor(inner)).toEqual({
      subject: 'ego',
    });
  });

  it('carries requireType and sibling-subject descriptors', () => {
    const schema = entityAttributeReference({
      subject: { sibling: 'createEdge', entity: 'edge' },
      requireType: ['ordinal'],
    });
    expect(getEntityAttributeReferenceDescriptor(schema)).toEqual({
      subject: { sibling: 'createEdge', entity: 'edge' },
      requireType: ['ordinal'],
    });
  });

  it('returns undefined for an untagged schema', () => {
    expect(getEntityAttributeReferenceDescriptor(z.string())).toBeUndefined();
  });

  it('asEntityAttributeReference returns the id unchanged at runtime', () => {
    expect(asEntityAttributeReference('var-1')).toBe('var-1');
  });
});
