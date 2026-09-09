import { z } from 'zod';

import {
  PresenceSchema,
  ProtocolIdSchema,
  SectionHolderSchema,
  SectionIdSchema,
  SectionIssueSchema,
} from './schemas.ts';

export const protocolErrors = {
  PROTOCOL_NOT_FOUND: {
    message: 'no such protocol',
    data: z.object({ protocolId: ProtocolIdSchema }),
  },
  SECTION_NOT_FOUND: {
    message: 'no such section',
    data: z.object({ sectionId: SectionIdSchema }),
  },
} as const;

export const lockErrors = {
  NOT_LOCK_HOLDER: {
    message: 'the section is not locked by this caller',
    data: z.object({
      sectionId: SectionIdSchema,
      holder: PresenceSchema.optional(),
    }),
  },
} as const;

export const shapeErrors = {
  INVALID_SHAPE: {
    message: 'the document is not shaped like this section',
    data: z.object({
      sectionId: SectionIdSchema,
      issues: z.array(SectionIssueSchema),
    }),
  },
} as const;

export const refactorErrors = {
  SECTIONS_LOCKED: {
    message: 'another editor holds a section this change has to write',
    data: z.object({ blocked: z.array(SectionHolderSchema) }),
  },
} as const;
