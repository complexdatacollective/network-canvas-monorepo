import { expect, type Locator, type Page } from "@playwright/test";

type CaptureOptions = {
	mask?: Locator[];
};

type CaptureInterviewFn = (name: string, options?: CaptureOptions) => Promise<void>;

/**
 * Interview fixture for e2e tests.
 *
 * Handles interview shell and navigation concerns.
 * Use the `stage` fixture for stage-specific interactions.
 */
export class InterviewFixture {
	readonly page: Page;
	private captureFn: CaptureInterviewFn | null = null;

	/**
	 * The interview ID. Must be set before using navigation methods.
	 * Typically set in beforeEach after creating the interview in beforeAll.
	 */
	interviewId = "";

	/**
	 * Optional prefix for screenshot names. Set this in beforeAll/beforeEach
	 * to avoid snapshot name collisions between test files testing the same stages.
	 */
	snapshotPrefix = "";

	/**
	 * When true, afterEach hooks should skip calling next().
	 * Set this in tests that call next() or finishInterview() themselves
	 * (e.g. form stages with post-submit waits, or finish tests).
	 */
	skipNext = false;

	constructor(page: Page) {
		this.page = page;
	}

	/**
	 * Set the capture function for automatic screenshots.
	 * Called by the interview-test fixture to wire up captureInterview.
	 */
	setCaptureFn(fn: CaptureInterviewFn): void {
		this.captureFn = fn;
	}

	/**
	 * Manually capture a screenshot with the given name.
	 * Useful in afterEach hooks to capture end state.
	 * The snapshotPrefix is NOT automatically prepended - use the full name you want.
	 */
	async capture(name: string, options?: CaptureOptions): Promise<void> {
		if (this.captureFn) {
			const resolvedOptions = this.resolveCaptureMasks(options);
			await this.captureFn(name, resolvedOptions);
		}
	}

	private resolveCaptureMasks(options?: CaptureOptions): CaptureOptions {
		const videoLocator = this.page.locator("video");
		const existingMasks = options?.mask ?? [];

		return {
			...options,
			mask: [...existingMasks, videoLocator],
		};
	}

	/**
	 * Navigate directly to a stage by index.
	 * Navigates to the host app with both interviewId and step query params.
	 */
	async goto(stageIndex: number): Promise<void> {
		if (!this.interviewId) {
			throw new Error("interviewId must be set before calling goto(). Set it in beforeEach.");
		}

		await this.page.goto(`/?interviewId=${this.interviewId}&step=${stageIndex}`);
		await this.waitForStageLoad();
	}

	async captureInitial(): Promise<void> {
		if (!this.interviewId) {
			throw new Error("interviewId must be set before calling goto(). Set it in beforeEach.");
		}

		const stageIndex = this.getCurrentStep() ?? "unknown";

		await this.waitForStageLoad();

		const prefix = this.snapshotPrefix ? `${this.snapshotPrefix}-` : "";
		await this.capture(`${prefix}stage-${stageIndex}`);
	}

	async captureFinal(): Promise<void> {
		const step = this.getCurrentStep();
		if (step) {
			await this.page.evaluate(() => {
				const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
				const scrollables = all.filter((el) => {
					const style = getComputedStyle(el);
					const overflowY = style.overflowY;
					const canScroll = overflowY === "auto" || overflowY === "scroll";
					return canScroll && el.scrollHeight > el.clientHeight;
				});
				scrollables.forEach((el) => {
					el.scrollTop = el.scrollHeight;
				});
				window.scrollTo(0, document.documentElement.scrollHeight);
			});
			// Buffer for the post-interaction ResizeObserver/React commit cycle
			// to propagate to the DOM (in particular, for `data-cb-layout-pending`
			// to flip to `true` if a CategoricalBin layout debounce was just armed).
			await this.page.waitForTimeout(100);
			// Wait for any in-flight CategoricalBin layout debounce to commit.
			// The hook surfaces `data-cb-layout-pending` on `.catbin-outer` while
			// its 120ms ResizeObserver-settle timer is armed; once cleared, the
			// committed dimensions are reflected in `cols`/`rows`. No-op for any
			// stage that doesn't render a categorical bin.
			await this.page.waitForFunction(() => !document.querySelector("[data-cb-layout-pending]"), null, {
				timeout: 5_000,
			});

			const prefix = this.snapshotPrefix ? `${this.snapshotPrefix}-` : "";
			await this.capture(`${prefix}stage-${step}-final`);
		}
	}

	get nextButton(): Locator {
		return this.page.getByTestId("next-button");
	}

	async nextButtonHasPulse(): Promise<boolean> {
		const className = await this.nextButton.getAttribute("class");
		return className?.includes("bg-success") ?? false;
	}

	/**
	 * Click next and wait for the new stage to be fully mounted.
	 *
	 * The Shell uses a two-phase transition: first the URL updates (controlled
	 * step changes immediately), then the exit animation plays, then the new
	 * stage mounts. We wait for the URL change and then for the stage element
	 * to reflect the new Redux step index (set only after exit animation).
	 */
	async next(): Promise<void> {
		const before = this.getCurrentStep();
		await this.nextButton.click();
		if (before !== null) {
			await this.page.waitForURL(
				(url) => {
					const match = /step=(\d+)/.exec(url.toString());
					return match ? match[1] !== before : false;
				},
				{ timeout: 20_000 },
			);
		}
	}

	/**
	 * Click next to dismiss an intro panel and wait for the form section to
	 * finish entering. Use on stages whose first interaction is a form field
	 * immediately after dismissing the intro (AlterForm, AlterEdgeForm) — the
	 * intro→form swap is animated and Playwright otherwise races the input mount.
	 */
	async dismissIntro(): Promise<void> {
		await this.nextButton.click();
		await this.page
			.locator('[data-stage-section="form"][data-stage-ready="true"]')
			.waitFor({ state: "visible", timeout: 5_000 });
	}

	/**
	 * Complete the FinishSession stage: click Finish, confirm the dialog.
	 *
	 * Note: in the standalone host the onFinish handler is a no-op — no URL
	 * redirect occurs after finishing.
	 */
	async finishInterview(): Promise<void> {
		await expect(this.page.getByRole("heading", { name: "Finish Interview" })).toBeVisible();

		await this.page.getByRole("button", { name: "Finish" }).click();

		const dialog = this.page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		await dialog.getByRole("button", { name: "Finish Interview" }).click();
	}

	/**
	 * Navigate to an interview and wait for it to load.
	 * Use this in beforeEach to set the starting URL.
	 */
	async navigateTo(interviewId: string, step?: number): Promise<void> {
		this.interviewId = interviewId;
		const params = new URLSearchParams({ interviewId });
		if (step !== undefined) {
			params.set("step", String(step));
		}
		await this.page.goto(`/?${params.toString()}`);
		await this.waitForStageLoad();
	}

	private getCurrentStep(): string | null {
		const match = /step=(\d+)/.exec(this.page.url());
		return match?.[1] ?? null;
	}

	private async waitForStageLoad(): Promise<void> {
		const mainLocator = this.page.locator("main[data-theme-interview]");
		const currentStep = this.getCurrentStep();

		try {
			await expect(mainLocator).toBeVisible({ timeout: 15000 });
			// If we know the expected step, wait for the Shell's two-phase
			// transition to complete. The motion.div gets data-stage-step={n} only
			// after handleExitComplete updates Redux (via onExitComplete or timer).
			if (currentStep !== null) {
				await this.page.locator(`[data-stage-step="${currentStep}"]`).waitFor({ state: "attached", timeout: 5_000 });
			}
		} catch (error) {
			const url = this.page.url();
			const title = await this.page.title();
			const bodyText = await this.page
				.locator("body")
				.textContent()
				.catch(() => "N/A");

			const diagnostics = [
				"Interview stage load failed",
				`URL: ${url}`,
				`Title: ${title}`,
				`Body content (truncated): ${bodyText?.slice(0, 500) ?? "empty"}`,
			].join("\n");

			throw new Error(`${diagnostics}\n\nOriginal error: ${String(error)}`);
		}
	}
}
