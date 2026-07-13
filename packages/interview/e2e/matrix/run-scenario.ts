import { expect, matrixTest } from '../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import type {
  InterfaceScenarios,
  ScenarioContext,
  ScenarioDefinition,
} from './types.js';

/**
 * Install a scenario's protocol + seeded interview and navigate to its
 * starting step. Shared by the matrix runner and the visual suite.
 */
export async function installScenario(
  scenario: ScenarioDefinition,
  ctx: ScenarioContext,
): Promise<void> {
  const synth = scenario.build();
  const result = buildSyntheticPayload(synth, {
    protocolName: `matrix-${scenario.id}`,
    assets: scenario.assets,
    currentStep: scenario.currentStep,
    seedNetwork: scenario.seedNetwork,
    stageMetadata: scenario.stageMetadata,
  });
  const { protocolId } = await ctx.protocol.installPayload(result);
  const interviewId = await ctx.protocol.createInterview(
    protocolId,
    `matrix-${scenario.id}`,
    {
      network: result.session.network,
      ...(result.session.stageMetadata != null
        ? { stageMetadata: result.session.stageMetadata }
        : {}),
    },
  );
  ctx.interview.interviewId = interviewId;
  await ctx.interview.goto(result.currentStep);
}

export function defineScenarioTests(suite: InterfaceScenarios): void {
  for (const scenario of suite.scenarios) {
    const tags = scenario.smoke ? ' @smoke' : '';
    matrixTest(
      `${suite.interfaceType}: ${scenario.id}${tags}`,
      async ({ page, interview, stage, protocol, ariaSnapshot }) => {
        if (scenario.chromiumOnly) {
          matrixTest.skip(
            !matrixTest.info().project.name.startsWith('chromium'),
            'chromium-only scenario',
          );
        }
        if (scenario.slow) {
          matrixTest.slow();
        }
        const ctx: ScenarioContext = { page, interview, stage, protocol };
        await installScenario(scenario, ctx);
        await ariaSnapshot('initial');
        await scenario.run(ctx);
        await ariaSnapshot('final');
      },
    );
  }
}

export { expect };
