import { matrixTest } from '../../fixtures/matrix-test.js';
import { ALL_SUITES } from '../../matrix/all-scenarios.js';
import { installScenario } from '../../matrix/run-scenario.js';
import type { ScenarioContext } from '../../matrix/types.js';

/**
 * Pixel visual suite. Runs only the `visual`-flagged scenarios of every
 * interface across the `*-visual` Playwright projects (chromium/firefox/webkit),
 * capturing initial + final screenshots. Captures are CI-only (the matrix
 * fixture wires `createCaptureInterview` with `enabled: !!process.env.CI`), so
 * locally this validates the flow while the actual PNGs are written in the
 * pinned-Playwright Docker update run. Scenario `captureMask` locators (e.g.
 * Anonymisation's animated EncryptedBackground) are threaded into both captures.
 */
for (const suite of ALL_SUITES) {
  for (const scenario of suite.scenarios) {
    if (!scenario.visual) continue;
    matrixTest(
      `visual ${suite.interfaceType}: ${scenario.id}`,
      async ({ page, interview, stage, protocol }) => {
        if (scenario.chromiumOnly) {
          matrixTest.skip(
            !matrixTest.info().project.name.startsWith('chromium'),
            'chromium-only scenario',
          );
        }
        if (scenario.slow) matrixTest.slow();
        const ctx: ScenarioContext = { page, interview, stage, protocol };
        await installScenario(scenario, ctx);
        const mask = scenario.captureMask?.(page);
        await interview.captureInitial(mask);
        await scenario.run(ctx);
        await interview.captureFinal(mask);
      },
    );
  }
}
