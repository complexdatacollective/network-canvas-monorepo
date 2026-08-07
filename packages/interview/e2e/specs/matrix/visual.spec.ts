import { expect } from '@playwright/test';

import { matrixTest } from '../../fixtures/matrix-test.js';
import { ALL_SUITES } from '../../matrix/all-scenarios.js';
import { installScenario } from '../../matrix/run-scenario.js';
import type { ScenarioContext } from '../../matrix/types.js';

const GEOSPATIAL_STRESS_SCENARIO = 'core-click-select-and-prompt-panel';

async function attachGeospatialDiagnostics(
  page: ScenarioContext['page'],
  phase: 'initial' | 'final',
): Promise<void> {
  if (process.env.E2E_VISUAL_DEBUG !== 'geospatial') return;

  const panel = page.getByTestId('collapsible-prompts');
  const diagnostics = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const computedStyle = getComputedStyle(element);

    return {
      computedTransform: computedStyle.transform,
      devicePixelRatio,
      inlineTransform: element.style.transform,
      rect: {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      },
    };
  });

  console.log(
    `[geospatial-visual-debug] ${phase} ${JSON.stringify(diagnostics)}`,
  );
  await matrixTest.info().attach(`geospatial-${phase}.json`, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  });
}

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
        const isGeospatialStressScenario =
          suite.interfaceType === 'Geospatial' &&
          scenario.id === GEOSPATIAL_STRESS_SCENARIO;
        if (isGeospatialStressScenario) {
          await stage.geospatial.waitForMapIdle();
          await expect(page.getByTestId('collapsible-prompts')).toHaveCSS(
            'transform',
            'none',
          );
          await attachGeospatialDiagnostics(page, 'initial');
        }
        await interview.captureInitial(mask);
        await scenario.run(ctx);
        if (isGeospatialStressScenario) {
          await attachGeospatialDiagnostics(page, 'final');
        }
        await interview.captureFinal(mask);
      },
    );
  }
}
