// The decision guide (./decision-guide.md): the judgment calls an experienced Network Canvas
// designer makes, mapped onto the StudyDesign schema (../design/schema.ts).
// It is the long, byte-stable tail of the cached step-2 system prompt
// (./design.ts), so nothing may be interpolated into it. Bump the version in
// the header line whenever the text changes: the header makes a cache or
// behaviour change traceable to a guide revision.
//
// Every field name, kind and enum value below must exist in the schema, and
// the guide must never suggest something the schema cannot express
// (asserted in part by __tests__/decision-guide.test.ts).

import guide from './decision-guide.md';

export const DECISION_GUIDE = guide.trimEnd();
