import type { Locator, Page } from '@playwright/test';

import type { SyntheticInterview } from '@codaco/protocol-utilities';

import type { InterviewFixture } from '../fixtures/interview-fixture.js';
import type { ProtocolFixture } from '../fixtures/protocol-fixture.js';
import type { StageFixture } from '../fixtures/stage-fixture.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';

export type ScenarioContext = {
  page: Page;
  interview: InterviewFixture;
  stage: StageFixture;
  protocol: ProtocolFixture;
};

export type ScenarioDefinition = {
  /** kebab-case, unique within the interface file */
  id: string;
  /** option keys from option-inventory.ts this scenario claims */
  covers: readonly string[];
  /** include in the firefox/webkit smoke subset (exactly one per interface) */
  smoke?: true;
  /** include in the pixel visual suite (representative or pixels-only option) */
  visual?: true;
  /** chromium-only functional cells (e.g. Geospatial map visuals) */
  chromiumOnly?: true;
  /** mark test.slow() (e.g. Geospatial, crypto-heavy Anonymisation) */
  slow?: true;
  /** returns a fully-configured builder */
  build: () => SyntheticInterview;
  /** asset files to register + copy (synthetic-payload adapter convention) */
  assets?: SyntheticAssetSpec[];
  /** start step (default 0); driven via the URL, not the session */
  currentStep?: number;
  /** install synth.getNetwork() as the starting network (default false) */
  seedNetwork?: boolean;
  /** seeded stage metadata (e.g. NarrativePedigree source-stage state) */
  stageMetadata?: unknown;
  /** extra pixel-capture masks (visual suite only, e.g. EncryptedBackground) */
  captureMask?: (page: Page) => Locator[];
  /** interactions + functional assertions; aria snapshots wrap this */
  run: (ctx: ScenarioContext) => Promise<void>;
};

export type InterfaceScenarios = {
  interfaceType: string;
  scenarios: readonly ScenarioDefinition[];
};
