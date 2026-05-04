import { expect, type Locator, type Page } from "@playwright/test";
import { expectURL } from "../helpers/expectations.js";

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
			await this.page.waitForTimeout(100);

			const prefix = this.snapshotPrefix ? `${this.snapshotPrefix}-` : "";
			await this.capture(`${prefix}stage-${step}-final`);
		}
	}

	get nextButton(): Locator {
		return this.page.getByTestId("next-button");
	}

	async nextButtonHasPulse(): Promise<boolean> {
		const className = await this.nextButton.getAttribute("class");
		return className?.includes("animate-pulse-glow") ?? false;
	}

	/**
	 * Click next and wait for the step URL param to change.
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
		const mainLocator = this.page.locator("main[data-interview]");

		try {
			await expect(mainLocator).toBeVisible({ timeout: 15000 });
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

export { expectURL };
