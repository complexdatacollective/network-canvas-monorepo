import {
  defineStageEditorPart,
  type UnregisteredIn,
} from '../src/stageEditorParts.ts';
import { InformationEditor } from './fixtures.ts';

/**
 * MUST NOT COMPILE: an interface that has an editor and is still listed as
 * waiting for one.
 *
 * The list is documentation a reviewer trusts, so a stale entry is worse than
 * no list at all: it says a family has not landed when it has.
 */
const PARTS = [
  defineStageEditorPart({ Information: InformationEditor }),
] as const;

export const AWAITING = [
  'Information',
] as const satisfies readonly UnregisteredIn<typeof PARTS>[];
