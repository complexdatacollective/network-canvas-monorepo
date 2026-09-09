import { z } from 'zod';

import {
  PresenceSchema,
  ProtocolIdSchema,
  ResourceGatewayFailureSchema,
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

/**
 * The staged resources a submit asked to promote could not be committed, so
 * neither they nor the section were written: the submit is the only place the
 * two become one revision, and half of it is not an outcome a host offers.
 */
export const promotionErrors = {
  PROMOTION_FAILED: {
    message: 'the resources this submit promotes could not be committed',
    data: z.object({
      sectionId: SectionIdSchema,
      failure: ResourceGatewayFailureSchema,
    }),
  },
} as const;

export const existenceErrors = {
  SECTION_EXISTS: {
    message: 'the protocol already has this section',
    data: z.object({ sectionId: SectionIdSchema }),
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

/**
 * A change spanning sections cannot be made because one of them is held.
 * "Another editor" includes another editor of this session: a stage editor
 * holding its own draft would submit the change away again.
 */
export const lockedSectionErrors = {
  SECTIONS_LOCKED: {
    message: 'another editor holds a section this change has to write',
    data: z.object({ blocked: z.array(SectionHolderSchema) }),
  },
} as const;

/**
 * What the change would remove is still named where the host will not take the
 * reference out, so making it would leave the protocol naming something that
 * no longer exists.
 *
 * Two things put a reference here. A refactor CANNOT remove one — a stage's own
 * subject, a quick-add attribute — because there is no list entry to drop that
 * leaves a stage the researcher would recognise. A `delete` WILL not: a stage
 * another stage jumps to, or describes the people of, is a decision somebody
 * made about that other stage, and rewriting it as a side effect of removing
 * this one is not a deletion anybody asked for.
 *
 * Either way, the references are what the dialog tells the researcher is using
 * the thing they asked to remove.
 */
export const referenceErrors = {
  REFERENCES_REMAIN: {
    message: 'the change would leave references this host cannot remove',
    data: z.object({ remaining: z.array(SectionReferenceSchema) }),
  },
} as const;

export const refactorErrors = {
  ...lockedSectionErrors,
  ...referenceErrors,
} as const;
