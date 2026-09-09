import { z } from 'zod';

import {
  PresenceSchema,
  ProtocolIdSchema,
  SectionHolderSchema,
  SectionIdSchema,
  SectionIssueSchema,
  SectionReferenceSchema,
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
  /**
   * The subject is still named where the host cannot remove the reference —
   * a stage's own subject, a quick-add attribute — so applying the change
   * would leave the protocol naming something that no longer exists. The
   * references are what a codebook dialog tells the researcher is using it.
   */
  REFERENCES_REMAIN: {
    message: 'the change would leave references this host cannot remove',
    data: z.object({ remaining: z.array(SectionReferenceSchema) }),
  },
} as const;
