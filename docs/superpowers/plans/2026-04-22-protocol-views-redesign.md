# Protocol views redesign — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Home route's visual language to the six protocol-editing routes in `apps/architect-vite`, with a 50/50 split-pane layout (live iframe preview + editor column) on `/protocol` and `/protocol/stage/:stageId`, and a reskinned single-column layout on `/protocol/assets`, `/protocol/codebook`, `/protocol/summary`, `/protocol/experiments`.

**Architecture:** Build a small set of shared primitives under `apps/architect-vite/src/components/shared/` (`ProtocolHeader`, new `Button`, `Card`, `SplitPane`, `PreviewIframe`, `TimelineRail`/`TimelineStation`), plus a new `preview` Redux slice that owns upload state. Refactor each route to consume the primitives. Retire `ProtocolControlBar` last, once all its former duties live elsewhere.

**Tech stack:** React + TypeScript, Wouter, Redux Toolkit, redux-form, motion/react, Tailwind CSS 4.2, Vitest + @testing-library/react, custom Fresco preview pipeline (`src/utils/preview/uploadPreview.ts`).

**Spec:** `docs/superpowers/specs/2026-04-22-protocol-views-redesign-design.md`

---

## File map

**New files (all under `apps/architect-vite/src/components/shared/`):**

- `PillButton.tsx` — sea-green primary CTA / white secondary / neutral tertiary pill button variants (new component; legacy `Button` stays put for untouched call sites).
- `Card.tsx` — white surface with Home's soft shadow.
- `ProtocolHeader.tsx` — fixed top bar with logo, version badge, breadcrumb, action slot.
- `SplitPane.tsx` — responsive 50/50 layout primitive.
- `PreviewIframe.tsx` — iframe wrapper that owns debounced upload + reload.
- `TimelineRail.tsx` — horizontal rail container that integrates with `motion/react` Reorder.
- `TimelineStation.tsx` — station circle + pill label for a single stage.
- `Badge.tsx` — small uppercase tracked label pill (used for version badge and stage-type badge).

**New slice:**

- `apps/architect-vite/src/ducks/modules/preview.ts` — `{ status, url, error, lastUploadedAt, lastUploadedHash }`.
- `apps/architect-vite/src/selectors/protocol.ts` — add `getIsProtocolDirty` selector derived from `canUndo`.

**Modified files:**

- `src/components/Protocol.tsx` — becomes split-pane layout; composes `ProtocolHeader` + `PreviewIframe` + Overview/Timeline.
- `src/components/Overview.tsx` — restyled as a `Card`, uses `PillButton`.
- `src/components/Timeline/Timeline.tsx` — restyled with `TimelineRail` + `TimelineStation`.
- `src/components/Timeline/InsertButton.tsx` — restyled as a rail "+" circle.
- `src/components/StageEditor/StageEditor.tsx` — retires its local `ControlBar`; header actions move to `ProtocolHeader`; form sections wrap in `Card`.
- `src/components/StageEditor/StageHeading.tsx` — restyled as a `Card`; stage-type badge added.
- `src/components/pages/StageEditorPage.tsx` — composes `ProtocolHeader` + `SplitPane` + `PreviewIframe`.
- `src/components/pages/AssetsPage.tsx`, `CodebookPage.tsx`, `SummaryPage.tsx`, `ExperimentsPage.tsx` — each composed with `ProtocolHeader`, content wrapped in `Card`s on a centered column.
- `src/ducks/store.ts` — registers the `preview` reducer.
- `src/selectors/protocol.ts` — new `getIsProtocolDirty` selector.

**Deleted files:**

- `src/components/ProtocolControlBar.tsx` — retired in the final task, once nothing depends on it.

**Untouched but referenced:**

- `src/utils/preview/uploadPreview.ts` — `uploadProtocolForPreview` is the upload engine `PreviewIframe` consumes.
- `src/lib/legacy-ui/components/Button.tsx` — left in place for untouched call sites.
- `src/images/landing/architect-icon.png` — shared with Home.
- `src/styles/tailwind.css` — no changes; uses existing CSS variables.

---

## Pre-work (Task 0)

### Task 0: Pre-flight checks

Inventory the risks called out in the spec before touching code.

**Files:** None modified — this task produces notes the reviewer can eyeball.

- [ ] **Step 1: Verify the Interviewer stage deep-link contract**

Read `apps/architect-vite/src/utils/preview/uploadPreview.ts` and confirm that `uploadProtocolForPreview(protocol, stageIndex)` returns a `previewUrl` that actually honors `stageIndex`. Look for where the URL is constructed on the server side (or in the request body) and inspect a real returned URL in the browser if possible.

If the URL does not deep-link to a stage, the `/protocol/stage` preview falls back to loading from stage 0; leave a `TODO` note in the spec if a follow-up is required.

Commit nothing at this step — record findings in a scratch note.

- [ ] **Step 2: Inventory every consumer of `ProtocolControlBar`**

Run:

```bash
rg "ProtocolControlBar" apps/architect-vite/src
```

Expected: `src/components/Protocol.tsx` and `src/components/__tests__/ProtocolControlBar.test.tsx`. If anything else references it, note it — the refactor has to preserve those behaviors elsewhere before deletion.

- [ ] **Step 3: Inventory every consumer of `StageEditor`'s local `ControlBar` block**

Run:

```bash
rg "ControlBar" apps/architect-vite/src/components/StageEditor
```

Expected: a single usage inside `StageEditor.tsx` rendering Cancel + Preview + Finished Editing. Confirm — its buttons move to the header.

- [ ] **Step 4: Sanity-check that all six routes still render today**

Run `pnpm --filter architect-vite dev`, open the app, load the development protocol, and visit each route: `/protocol`, `/protocol/stage/<someId>`, `/protocol/assets`, `/protocol/codebook`, `/protocol/summary`, `/protocol/experiments`. Confirm each renders without error. This is the baseline.

- [ ] **Step 5: Commit a no-op scratch file documenting the findings**

Create `apps/architect-vite/PROTOCOL_REDESIGN_NOTES.md` with:

```markdown
# Protocol redesign — implementation notes

## Pre-flight

- Stage deep-link: [supported | not supported — fallback to stage 0]
- `ProtocolControlBar` consumers: [list]
- StageEditor `ControlBar` usages: single block in `StageEditor.tsx`
- All six routes render on baseline: yes
```

```bash
git add apps/architect-vite/PROTOCOL_REDESIGN_NOTES.md
git commit -m "docs: protocol redesign pre-flight notes"
```

(This file is deleted in Task 14.)

---

## Shared primitives

### Task 1: `PillButton` component

Introduces three variants matching Home's button language: `primary` (sea-green with 3D shadow), `secondary` (white with soft shadow), `tertiary` (transparent).

**Files:**
- Create: `apps/architect-vite/src/components/shared/PillButton.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/PillButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/PillButton.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PillButton from "../PillButton";

describe("<PillButton />", () => {
	it("renders children and handles click", async () => {
		const onClick = vi.fn();
		render(
			<PillButton variant="primary" onClick={onClick}>
				Create protocol
			</PillButton>,
		);
		const btn = screen.getByRole("button", { name: /create protocol/i });
		btn.click();
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("applies primary variant styles", () => {
		render(<PillButton variant="primary">Go</PillButton>);
		const btn = screen.getByRole("button");
		expect(btn).toHaveClass("rounded-full");
		expect(btn.getAttribute("style")).toContain("hsl(168 100% 39%)");
	});

	it("respects disabled", () => {
		render(
			<PillButton variant="primary" disabled>
				Go
			</PillButton>,
		);
		expect(screen.getByRole("button")).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/PillButton.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PillButton`**

```tsx
// apps/architect-vite/src/components/shared/PillButton.tsx
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

export type PillButtonVariant = "primary" | "secondary" | "tertiary";
export type PillButtonSize = "md" | "sm";

type Props = {
	variant: PillButtonVariant;
	size?: PillButtonSize;
	icon?: ReactNode;
	iconPosition?: "left" | "right";
	children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const SEA_GREEN = "hsl(168 100% 39%)";
const SEA_GREEN_DARK = "hsl(168 100% 26%)";
const INK = "hsl(240 35% 17%)";

const baseClass =
	"inline-flex items-center justify-center gap-2.5 rounded-full font-heading font-bold uppercase tracking-[0.15em] cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-50";

const sizeClass: Record<PillButtonSize, string> = {
	md: "px-7 py-4 text-[12.5px]",
	sm: "px-5 py-2.5 text-[11px]",
};

const PillButton = forwardRef<HTMLButtonElement, Props>(function PillButton(
	{ variant, size = "md", icon, iconPosition = "left", children, className = "", style, ...rest },
	ref,
) {
	const variantStyle =
		variant === "primary"
			? { background: SEA_GREEN, color: "#fff", boxShadow: `0 4px 0 ${SEA_GREEN_DARK}` }
			: variant === "secondary"
				? { background: "#fff", color: INK, boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }
				: { background: "transparent", color: INK };

	const composed = `${baseClass} ${sizeClass[size]} ${className}`.trim();
	const inlineStyle = { ...variantStyle, ...style };

	return (
		<button ref={ref} type="button" className={composed} style={inlineStyle} {...rest}>
			{icon && iconPosition === "left" && <span className="flex items-center">{icon}</span>}
			{children}
			{icon && iconPosition === "right" && <span className="flex items-center">{icon}</span>}
		</button>
	);
});

export default PillButton;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/PillButton.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Lint + typecheck**

```bash
pnpm --filter architect-vite typecheck
pnpm lint:fix
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/architect-vite/src/components/shared/PillButton.tsx apps/architect-vite/src/components/shared/__tests__/PillButton.test.tsx
git commit -m "feat(architect-vite): add PillButton shared primitive"
```

---

### Task 2: `Card` component

White surface with the shadow token from Home (`0 4px 12px rgba(22,21,43,0.08)`), rounded, consistent padding.

**Files:**
- Create: `apps/architect-vite/src/components/shared/Card.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/Card.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/Card.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Card from "../Card";

describe("<Card />", () => {
	it("renders children with card styles", () => {
		render(<Card>content</Card>);
		const el = screen.getByText("content").parentElement!;
		expect(el).toHaveClass("bg-white");
		expect(el.getAttribute("style")).toContain("rgba(22,21,43,0.08)");
	});

	it("accepts padding prop", () => {
		render(
			<Card padding="lg" data-testid="card">
				x
			</Card>,
		);
		expect(screen.getByTestId("card")).toHaveClass("p-8");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/Card.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Card`**

```tsx
// apps/architect-vite/src/components/shared/Card.tsx
import { type HTMLAttributes, type ReactNode } from "react";

type CardPadding = "sm" | "md" | "lg";

const paddingClass: Record<CardPadding, string> = {
	sm: "p-4",
	md: "p-6",
	lg: "p-8",
};

type Props = {
	padding?: CardPadding;
	children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export default function Card({ padding = "md", children, className = "", style, ...rest }: Props) {
	const composed = `bg-white rounded-2xl ${paddingClass[padding]} ${className}`.trim();
	return (
		<div
			className={composed}
			style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.08)", ...style }}
			{...rest}
		>
			{children}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/Card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/Card.tsx apps/architect-vite/src/components/shared/__tests__/Card.test.tsx
git commit -m "feat(architect-vite): add Card shared primitive"
```

---

### Task 3: `Badge` component

Small uppercase tracked label used in Home's version pill and the new stage-type badge.

**Files:**
- Create: `apps/architect-vite/src/components/shared/Badge.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/Badge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/Badge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "../Badge";

describe("<Badge />", () => {
	it("renders children", () => {
		render(<Badge color="hsl(168 100% 26%)">web</Badge>);
		expect(screen.getByText("web")).toBeInTheDocument();
	});

	it("applies uppercase tracked styles", () => {
		render(<Badge color="hsl(168 100% 26%)">web</Badge>);
		const el = screen.getByText("web");
		expect(el).toHaveClass("uppercase");
		expect(el).toHaveClass("font-bold");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/Badge.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `Badge`**

```tsx
// apps/architect-vite/src/components/shared/Badge.tsx
import { type ReactNode } from "react";

type Props = {
	color: string;
	background?: string;
	children: ReactNode;
};

export default function Badge({ color, background, children }: Props) {
	return (
		<span
			className="rounded-full px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-[0.15em]"
			style={{
				background: background ?? `color-mix(in srgb, ${color} 18%, transparent)`,
				color,
			}}
		>
			{children}
		</span>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/Badge.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/Badge.tsx apps/architect-vite/src/components/shared/__tests__/Badge.test.tsx
git commit -m "feat(architect-vite): add Badge shared primitive"
```

---

### Task 4: `ProtocolHeader` component

Fixed top bar matching Home's header visually, but parameterized for editor context: protocol breadcrumb on the left (logo, version badge, protocol name, optional subsection), slot for right-side actions.

**Files:**
- Create: `apps/architect-vite/src/components/shared/ProtocolHeader.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/ProtocolHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/ProtocolHeader.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProtocolHeader from "../ProtocolHeader";

describe("<ProtocolHeader />", () => {
	it("renders protocol name in the breadcrumb", () => {
		render(<ProtocolHeader protocolName="MyProtocol" />);
		expect(screen.getByText("MyProtocol")).toBeInTheDocument();
	});

	it("renders subsection after a separator when provided", () => {
		render(<ProtocolHeader protocolName="MyProtocol" subsection="Assets" />);
		expect(screen.getByText("Assets")).toBeInTheDocument();
	});

	it("renders action slot on the right", () => {
		render(
			<ProtocolHeader
				protocolName="P"
				actions={<button type="button">Save</button>}
			/>,
		);
		expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
	});

	it("calls onLogoClick when logo is clicked", async () => {
		const onLogoClick = vi.fn();
		render(<ProtocolHeader protocolName="P" onLogoClick={onLogoClick} />);
		screen.getByRole("button", { name: /architect home/i }).click();
		expect(onLogoClick).toHaveBeenCalledOnce();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/ProtocolHeader.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ProtocolHeader`**

```tsx
// apps/architect-vite/src/components/shared/ProtocolHeader.tsx
import { type ReactNode } from "react";
import architectIcon from "~/images/landing/architect-icon.png";
import { appVersion } from "~/utils/appVersion";
import Badge from "./Badge";

type Props = {
	protocolName: string;
	subsection?: string;
	actions?: ReactNode;
	onLogoClick?: () => void;
};

export default function ProtocolHeader({ protocolName, subsection, actions, onLogoClick }: Props) {
	return (
		<header
			className="fixed left-0 right-0 top-0 z-30 flex items-center gap-4 px-6 py-3"
			style={{ background: "#F3EFF6" }}
		>
			<button
				type="button"
				aria-label="Architect home"
				onClick={onLogoClick}
				className="flex cursor-pointer items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-3"
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.08)" }}
			>
				<img src={architectIcon} alt="" className="size-10 rounded-full" />
				<span className="font-heading text-base font-extrabold">Architect</span>
				<Badge color="hsl(168 100% 26%)">v{appVersion}</Badge>
			</button>

			<nav
				aria-label="Protocol breadcrumb"
				className="flex min-w-0 items-center gap-2 font-heading text-sm font-bold"
				style={{ color: "hsl(240 35% 17%)" }}
			>
				<span className="truncate max-w-[32ch]">{protocolName}</span>
				{subsection && (
					<>
						<span aria-hidden style={{ color: "hsl(220 4% 44%)" }}>
							▸
						</span>
						<span className="truncate max-w-[32ch]" style={{ color: "hsl(220 4% 44%)" }}>
							{subsection}
						</span>
					</>
				)}
			</nav>

			{actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
		</header>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/ProtocolHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/ProtocolHeader.tsx apps/architect-vite/src/components/shared/__tests__/ProtocolHeader.test.tsx
git commit -m "feat(architect-vite): add ProtocolHeader shared primitive"
```

---

### Task 5: `SplitPane` component

Responsive 50/50 layout. Above 1280px: 50/50. 1024–1279px: 40/60. Below 1024px: collapses to a toggleable preview panel on top of the editor (closed by default).

**Files:**
- Create: `apps/architect-vite/src/components/shared/SplitPane.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/SplitPane.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/SplitPane.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SplitPane from "../SplitPane";

describe("<SplitPane />", () => {
	it("renders both left and right slots", () => {
		render(<SplitPane left={<div>PREVIEW</div>} right={<div>EDITOR</div>} />);
		expect(screen.getByText("PREVIEW")).toBeInTheDocument();
		expect(screen.getByText("EDITOR")).toBeInTheDocument();
	});

	it("supports a narrow-viewport toggle", () => {
		render(
			<SplitPane
				left={<div>PREVIEW</div>}
				right={<div>EDITOR</div>}
				narrowPreviewOpen={false}
				onNarrowPreviewToggle={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/SplitPane.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `SplitPane`**

```tsx
// apps/architect-vite/src/components/shared/SplitPane.tsx
import { type ReactNode } from "react";

type Props = {
	left: ReactNode;
	right: ReactNode;
	narrowPreviewOpen?: boolean;
	onNarrowPreviewToggle?: () => void;
};

export default function SplitPane({ left, right, narrowPreviewOpen = false, onNarrowPreviewToggle }: Props) {
	return (
		<div className="flex h-full w-full flex-col lg:flex-row">
			{/* Narrow-viewport preview toggle */}
			{onNarrowPreviewToggle && (
				<button
					type="button"
					onClick={onNarrowPreviewToggle}
					aria-expanded={narrowPreviewOpen}
					className="flex items-center justify-between px-4 py-2 text-left font-heading text-xs font-bold uppercase tracking-[0.15em] lg:hidden"
					style={{ background: "rgba(255,255,255,0.6)" }}
				>
					<span>Preview</span>
					<span aria-hidden>{narrowPreviewOpen ? "▾" : "▸"}</span>
				</button>
			)}

			<div
				className={`${narrowPreviewOpen ? "h-[50dvh]" : "h-0"} overflow-hidden lg:h-auto lg:basis-2/5 xl:basis-1/2`}
			>
				{left}
			</div>

			<div className="flex-1 overflow-auto lg:basis-3/5 xl:basis-1/2">{right}</div>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/SplitPane.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/SplitPane.tsx apps/architect-vite/src/components/shared/__tests__/SplitPane.test.tsx
git commit -m "feat(architect-vite): add SplitPane shared primitive"
```

---

### Task 6: `preview` Redux slice

State container for preview upload results, keyed by protocol hash to allow cache hits across navigations.

**Files:**
- Create: `apps/architect-vite/src/ducks/modules/preview.ts`
- Create: `apps/architect-vite/src/ducks/modules/__tests__/preview.test.ts`
- Modify: `apps/architect-vite/src/ducks/store.ts` — register reducer.

- [ ] **Step 1: Write the failing test**

```ts
// apps/architect-vite/src/ducks/modules/__tests__/preview.test.ts
import { describe, expect, it } from "vitest";
import previewReducer, {
	previewUploadStarted,
	previewUploadSucceeded,
	previewUploadFailed,
	type PreviewState,
} from "../preview";

const initial: PreviewState = { status: "idle", url: null, error: null, lastUploadedAt: null, lastUploadedHash: null };

describe("preview reducer", () => {
	it("transitions idle → uploading", () => {
		const next = previewReducer(initial, previewUploadStarted({ hash: "abc" }));
		expect(next.status).toBe("uploading");
	});

	it("records url and hash on success", () => {
		const next = previewReducer(initial, previewUploadSucceeded({ url: "https://x", hash: "abc", at: 10 }));
		expect(next.status).toBe("ready");
		expect(next.url).toBe("https://x");
		expect(next.lastUploadedHash).toBe("abc");
		expect(next.lastUploadedAt).toBe(10);
		expect(next.error).toBeNull();
	});

	it("records error on failure", () => {
		const next = previewReducer(initial, previewUploadFailed({ error: "boom" }));
		expect(next.status).toBe("error");
		expect(next.error).toBe("boom");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/ducks/modules/__tests__/preview.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the slice**

```ts
// apps/architect-vite/src/ducks/modules/preview.ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type PreviewStatus = "idle" | "uploading" | "ready" | "error";

export type PreviewState = {
	status: PreviewStatus;
	url: string | null;
	error: string | null;
	lastUploadedAt: number | null;
	lastUploadedHash: string | null;
};

const initialState: PreviewState = {
	status: "idle",
	url: null,
	error: null,
	lastUploadedAt: null,
	lastUploadedHash: null,
};

const previewSlice = createSlice({
	name: "preview",
	initialState,
	reducers: {
		previewUploadStarted(state, _action: PayloadAction<{ hash: string }>) {
			state.status = "uploading";
			state.error = null;
		},
		previewUploadSucceeded(
			state,
			action: PayloadAction<{ url: string; hash: string; at: number }>,
		) {
			state.status = "ready";
			state.url = action.payload.url;
			state.lastUploadedAt = action.payload.at;
			state.lastUploadedHash = action.payload.hash;
			state.error = null;
		},
		previewUploadFailed(state, action: PayloadAction<{ error: string }>) {
			state.status = "error";
			state.error = action.payload.error;
		},
		previewReset() {
			return initialState;
		},
	},
});

export const { previewUploadStarted, previewUploadSucceeded, previewUploadFailed, previewReset } = previewSlice.actions;

export default previewSlice.reducer;
```

- [ ] **Step 4: Register the reducer in the store**

Open `apps/architect-vite/src/ducks/store.ts`. Add an import for `previewReducer`:

```ts
import previewReducer from "./modules/preview";
```

Add it to the reducer map alongside existing entries:

```ts
reducer: {
	// ...existing entries
	preview: previewReducer,
},
```

(If you cannot find the exact location because the file has moved, run `rg "configureStore" apps/architect-vite/src/ducks/` to locate it.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter architect-vite test src/ducks/modules/__tests__/preview.test.ts
pnpm --filter architect-vite typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm lint:fix
git add apps/architect-vite/src/ducks/modules/preview.ts apps/architect-vite/src/ducks/modules/__tests__/preview.test.ts apps/architect-vite/src/ducks/store.ts
git commit -m "feat(architect-vite): add preview slice for iframe upload state"
```

---

### Task 7: `getIsProtocolDirty` selector

Derived from `canUndo`. The Download (Save) action is the sink; dirty means "there are undo entries since last mount" — which is good enough as a proxy.

**Files:**
- Modify: `apps/architect-vite/src/selectors/protocol.ts`
- Create: `apps/architect-vite/src/selectors/__tests__/protocolDirty.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/architect-vite/src/selectors/__tests__/protocolDirty.test.ts
import { describe, expect, it } from "vitest";
import { getIsProtocolDirty } from "../protocol";
import type { RootState } from "~/ducks/store";

type MinState = { activeProtocol: { past: unknown[]; present: unknown; future: unknown[] } };

function makeState(pastLength: number): RootState {
	return { activeProtocol: { past: new Array(pastLength).fill({}), present: {}, future: [] } } as unknown as RootState;
}

describe("getIsProtocolDirty", () => {
	it("is false when there are no undo entries", () => {
		expect(getIsProtocolDirty(makeState(0))).toBe(false);
	});

	it("is true when there are undo entries", () => {
		expect(getIsProtocolDirty(makeState(3))).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/selectors/__tests__/protocolDirty.test.ts
```

Expected: FAIL — `getIsProtocolDirty` is not exported.

- [ ] **Step 3: Add the selector**

Open `apps/architect-vite/src/selectors/protocol.ts`. Locate the existing `getCanUndo` selector. Add:

```ts
export const getIsProtocolDirty = (state: RootState): boolean => getCanUndo(state);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter architect-vite test src/selectors/__tests__/protocolDirty.test.ts
pnpm --filter architect-vite typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint:fix
git add apps/architect-vite/src/selectors/protocol.ts apps/architect-vite/src/selectors/__tests__/protocolDirty.test.ts
git commit -m "feat(architect-vite): add getIsProtocolDirty selector"
```

---

### Task 8: `PreviewIframe` component

Listens to protocol state, hashes it, debounces upload by ~2s, shows loading/error/idle states inside the pane, renders the iframe at the returned URL.

**Files:**
- Create: `apps/architect-vite/src/components/shared/PreviewIframe.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/PreviewIframe.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/PreviewIframe.test.tsx
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import PreviewIframe from "../PreviewIframe";
import previewReducer from "~/ducks/modules/preview";

vi.mock("~/utils/preview/uploadPreview", () => ({
	uploadProtocolForPreview: vi.fn(async () => ({
		status: "ready",
		previewUrl: "https://example.test/preview",
		protocolId: "p1",
	})),
}));

function renderWithStore(component: React.ReactNode, protocolPresent: unknown = { name: "P", stages: [] }) {
	const store = configureStore({
		reducer: {
			preview: previewReducer,
			activeProtocol: (state = { present: protocolPresent, past: [], future: [] }) => state,
		},
	});
	return render(<Provider store={store}>{component}</Provider>);
}

describe("<PreviewIframe />", () => {
	it("shows a skeleton on initial mount with no cached url", () => {
		renderWithStore(<PreviewIframe stageIndex={0} />);
		expect(screen.getByTestId("preview-skeleton")).toBeInTheDocument();
	});

	it("renders the iframe once a url is ready", async () => {
		const store = configureStore({
			reducer: {
				preview: previewReducer,
				activeProtocol: (state = { present: { name: "P" }, past: [], future: [] }) => state,
			},
			preloadedState: {
				preview: {
					status: "ready",
					url: "https://example.test/preview",
					error: null,
					lastUploadedAt: 1,
					lastUploadedHash: "h",
				},
				activeProtocol: { present: { name: "P" }, past: [], future: [] },
			},
		});
		render(
			<Provider store={store}>
				<PreviewIframe stageIndex={0} />
			</Provider>,
		);
		const iframe = screen.getByTitle("Protocol preview") as HTMLIFrameElement;
		expect(iframe.src).toBe("https://example.test/preview");
	});

	it("shows an error state with retry button when upload fails", () => {
		const store = configureStore({
			reducer: {
				preview: previewReducer,
				activeProtocol: (state = { present: { name: "P" }, past: [], future: [] }) => state,
			},
			preloadedState: {
				preview: { status: "error", url: null, error: "boom", lastUploadedAt: null, lastUploadedHash: null },
				activeProtocol: { present: { name: "P" }, past: [], future: [] },
			},
		});
		render(
			<Provider store={store}>
				<PreviewIframe stageIndex={0} />
			</Provider>,
		);
		expect(screen.getByText(/Preview unavailable/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/PreviewIframe.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PreviewIframe`**

```tsx
// apps/architect-vite/src/components/shared/PreviewIframe.tsx
import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import {
	previewUploadFailed,
	previewUploadStarted,
	previewUploadSucceeded,
} from "~/ducks/modules/preview";
import { getProtocol } from "~/selectors/protocol";
import { uploadProtocolForPreview } from "~/utils/preview/uploadPreview";

const DEBOUNCE_MS = 2000;

type Props = {
	stageIndex?: number;
};

function stableHash(value: unknown): string {
	return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

export default function PreviewIframe({ stageIndex = 0 }: Props) {
	const dispatch = useAppDispatch();
	const protocol = useAppSelector(getProtocol);
	const { status, url, error, lastUploadedHash } = useAppSelector((s) => s.preview);

	const latestHash = useRef<string>("");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inflight = useRef<AbortController | null>(null);

	const runUpload = useCallback(
		async (hash: string) => {
			if (!protocol) return;
			inflight.current?.abort();
			const controller = new AbortController();
			inflight.current = controller;
			dispatch(previewUploadStarted({ hash }));
			try {
				const result = await uploadProtocolForPreview(protocol, stageIndex);
				if (controller.signal.aborted) return;
				if (result.status === "ready") {
					dispatch(previewUploadSucceeded({ url: result.previewUrl, hash, at: Date.now() }));
				} else {
					dispatch(previewUploadFailed({ error: result.message ?? "Upload failed" }));
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				dispatch(previewUploadFailed({ error: err instanceof Error ? err.message : "Upload failed" }));
			}
		},
		[dispatch, protocol, stageIndex],
	);

	useEffect(() => {
		if (!protocol) return;
		const hash = stableHash(protocol) + `|stage=${stageIndex}`;
		if (hash === latestHash.current && hash === lastUploadedHash) return;
		latestHash.current = hash;
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			void runUpload(hash);
		}, DEBOUNCE_MS);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [protocol, stageIndex, lastUploadedHash, runUpload]);

	const onRetry = useCallback(() => {
		if (!protocol) return;
		void runUpload(latestHash.current);
	}, [protocol, runUpload]);

	return (
		<div className="relative h-full w-full" style={{ background: "#F3EFF6" }}>
			{status === "error" && (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<div className="font-heading text-sm font-bold" style={{ color: "hsl(240 35% 17%)" }}>
						Preview unavailable
					</div>
					<div className="text-xs" style={{ color: "hsl(220 4% 44%)" }}>
						{error}
					</div>
					<button
						type="button"
						onClick={onRetry}
						className="rounded-full bg-white px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.15em]"
						style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
					>
						Retry
					</button>
				</div>
			)}

			{status !== "error" && !url && (
				<div
					data-testid="preview-skeleton"
					className="flex h-full items-center justify-center text-xs"
					style={{ color: "hsl(220 4% 44%)" }}
				>
					{status === "uploading" ? "Preparing preview…" : "Loading preview…"}
				</div>
			)}

			{url && (
				<iframe
					title="Protocol preview"
					src={url}
					className="h-full w-full border-0"
				/>
			)}

			{status === "uploading" && url && (
				<div
					className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.15em]"
					style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)", color: "hsl(220 4% 44%)" }}
				>
					Updating…
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/PreviewIframe.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/PreviewIframe.tsx apps/architect-vite/src/components/shared/__tests__/PreviewIframe.test.tsx
git commit -m "feat(architect-vite): add PreviewIframe with debounced uploads"
```

---

### Task 9: `TimelineStation` component

A single station on the rail: colored circle, white-filtered stage-type icon, pill label below, index above.

**Files:**
- Create: `apps/architect-vite/src/components/shared/TimelineStation.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/TimelineStation.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/TimelineStation.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TimelineStation from "../TimelineStation";

describe("<TimelineStation />", () => {
	it("renders label and index", () => {
		render(
			<TimelineStation
				label="Introduction"
				index={0}
				color="hsl(168 100% 39%)"
				iconSrc="/icon.svg"
				labelPosition="below"
			/>,
		);
		expect(screen.getByText("Introduction")).toBeInTheDocument();
		expect(screen.getByText("01")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/TimelineStation.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `TimelineStation`**

```tsx
// apps/architect-vite/src/components/shared/TimelineStation.tsx
type Props = {
	label: string;
	index: number;
	color: string;
	iconSrc: string;
	labelPosition: "above" | "below";
};

export default function TimelineStation({ label, index, color, iconSrc, labelPosition }: Props) {
	return (
		<div className="flex flex-col items-center">
			<div
				className={`font-mono text-[11px] tracking-[0.1em] ${labelPosition === "below" ? "mb-1.5" : "order-3 mt-1.5"}`}
				style={{ color: "hsl(220 4% 44%)" }}
			>
				{String(index + 1).padStart(2, "0")}
			</div>

			<div className="relative flex size-[72px] items-center justify-center rounded-full bg-white">
				<div className="flex size-[56px] items-center justify-center rounded-full" style={{ background: color }}>
					<img src={iconSrc} alt="" className="size-[26px]" style={{ filter: "brightness(0) invert(1)" }} />
				</div>
			</div>

			<div
				className={`mt-2 max-w-[16ch] rounded-full bg-white px-4 py-1.5 ${labelPosition === "above" ? "order-1 mb-2 mt-0" : ""}`}
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.10)" }}
			>
				<div
					className="truncate text-center font-heading text-[13px] font-extrabold leading-tight"
					style={{ color: "hsl(240 35% 17%)" }}
				>
					{label}
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/TimelineStation.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/TimelineStation.tsx apps/architect-vite/src/components/shared/__tests__/TimelineStation.test.tsx
git commit -m "feat(architect-vite): add TimelineStation primitive"
```

---

### Task 10: `TimelineRail` component

The horizontal rail container. Renders a colored line behind a row of stations with insert "+" affordances between them, on top of which `Reorder.Group` from `motion/react` composes.

**Files:**
- Create: `apps/architect-vite/src/components/shared/TimelineRail.tsx`
- Create: `apps/architect-vite/src/components/shared/__tests__/TimelineRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/architect-vite/src/components/shared/__tests__/TimelineRail.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TimelineRail from "../TimelineRail";

describe("<TimelineRail />", () => {
	it("renders children", () => {
		render(
			<TimelineRail>
				<div data-testid="station-1" />
				<div data-testid="station-2" />
			</TimelineRail>,
		);
		expect(screen.getByTestId("station-1")).toBeInTheDocument();
		expect(screen.getByTestId("station-2")).toBeInTheDocument();
	});

	it("applies a rail background when railColor is provided", () => {
		const { container } = render(<TimelineRail railColor="hsl(168 100% 39%)">x</TimelineRail>);
		const rail = container.querySelector('[data-part="rail"]');
		expect(rail).not.toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/TimelineRail.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `TimelineRail`**

```tsx
// apps/architect-vite/src/components/shared/TimelineRail.tsx
import { type ReactNode } from "react";

type Props = {
	children: ReactNode;
	railColor?: string;
};

export default function TimelineRail({ children, railColor }: Props) {
	return (
		<div className="relative w-full overflow-x-auto py-8">
			{railColor && (
				<div
					data-part="rail"
					aria-hidden
					className="pointer-events-none absolute left-0 right-0 top-1/2 h-4 -translate-y-1/2 rounded-full"
					style={{ background: railColor, opacity: 0.9 }}
				/>
			)}
			<div className="relative flex items-center gap-6 px-6">{children}</div>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter architect-vite test src/components/shared/__tests__/TimelineRail.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --filter architect-vite typecheck && pnpm lint:fix
git add apps/architect-vite/src/components/shared/TimelineRail.tsx apps/architect-vite/src/components/shared/__tests__/TimelineRail.test.tsx
git commit -m "feat(architect-vite): add TimelineRail primitive"
```

---

## Route refactors

### Task 11: Refactor `/protocol`

Compose `ProtocolHeader` + `SplitPane` + `PreviewIframe` + restyled Overview + Timeline. Retires the local `ProtocolControlBar` usage from this route (the component file still exists until Task 17).

**Files:**
- Modify: `apps/architect-vite/src/components/Protocol.tsx`
- Modify: `apps/architect-vite/src/components/Overview.tsx`
- Modify: `apps/architect-vite/src/components/Timeline/Timeline.tsx`
- Modify: `apps/architect-vite/src/components/Timeline/InsertButton.tsx`

- [ ] **Step 1: Rewrite `Protocol.tsx`**

```tsx
// apps/architect-vite/src/components/Protocol.tsx
import { Check, Download, Redo, Undo } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import PillButton from "~/components/shared/PillButton";
import PreviewIframe from "~/components/shared/PreviewIframe";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import SplitPane from "~/components/shared/SplitPane";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { clearActiveProtocol, redo, undo } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { exportNetcanvas } from "~/ducks/modules/userActions/userActions";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getCanRedo, getCanUndo, getIsProtocolDirty, getProtocolName } from "~/selectors/protocol";
import Overview from "./Overview";
import Timeline from "./Timeline";

const Protocol = () => {
	useProtocolLoader();
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();

	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const canUndo = useAppSelector(getCanUndo);
	const canRedo = useAppSelector(getCanRedo);
	const isDirty = useAppSelector(getIsProtocolDirty);

	const [isDownloading, setIsDownloading] = useState(false);
	const [justDownloaded, setJustDownloaded] = useState(false);
	const [narrowPreviewOpen, setNarrowPreviewOpen] = useState(false);

	const handleDownload = useCallback(async () => {
		setIsDownloading(true);
		try {
			await dispatch(exportNetcanvas()).unwrap();
			setJustDownloaded(true);
			setTimeout(() => setJustDownloaded(false), 2000);
		} finally {
			setIsDownloading(false);
		}
	}, [dispatch]);

	const handleClose = useCallback(() => {
		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Clear Editor?",
				message:
					"Returning to the start screen will clear the current protocol from the editor. If you have made changes, please download the updated version first.",
				confirmLabel: "Return to start screen",
				onConfirm: () => {
					dispatch(clearActiveProtocol());
					navigate("/");
				},
			}),
		);
	}, [dispatch, navigate]);

	const actions = (
		<>
			<button
				type="button"
				onClick={() => dispatch(undo())}
				disabled={!canUndo}
				aria-label="Undo"
				className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white disabled:opacity-40"
				style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
			>
				<Undo className="size-4" />
			</button>
			<button
				type="button"
				onClick={() => dispatch(redo())}
				disabled={!canRedo}
				aria-label="Redo"
				className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white disabled:opacity-40"
				style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
			>
				<Redo className="size-4" />
			</button>
			<PillButton
				variant="primary"
				size="sm"
				onClick={handleDownload}
				disabled={isDownloading}
				icon={justDownloaded ? <Check className="size-4" /> : <Download className="size-4" />}
			>
				{justDownloaded ? "Saved" : isDownloading ? "Saving…" : isDirty ? "Save •" : "Save"}
			</PillButton>
		</>
	);

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader protocolName={protocolName} actions={actions} onLogoClick={handleClose} />
			<div className="flex-1 overflow-hidden">
				<SplitPane
					left={<PreviewIframe />}
					right={
						<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
							<Overview />
							<Timeline />
						</div>
					}
					narrowPreviewOpen={narrowPreviewOpen}
					onNarrowPreviewToggle={() => setNarrowPreviewOpen((v) => !v)}
				/>
			</div>
		</div>
	);
};

export default Protocol;
```

- [ ] **Step 2: Restyle `Overview.tsx`**

Replace the `<div className="overview">...<div className="overview__footer">` block with a `Card` and `PillButton` treatments. Keep the redux-form wiring (the inline-edit name input and description textarea) as-is; only the surrounding markup changes.

Replace the contents of the `Overview` function's `return` with:

```tsx
return (
	<Card padding="lg">
		<input
			type="text"
			value={localName}
			onChange={(e) => setLocalName(e.target.value)}
			onBlur={() => {
				const trimmed = localName.trim();
				trimmed ? updateName({ name: trimmed }) : setLocalName(name ?? "");
			}}
			placeholder="Enter protocol name…"
			className="w-full border-0 bg-transparent font-heading text-4xl font-extrabold leading-tight tracking-tight outline-none"
			style={{ color: "hsl(240 35% 17%)" }}
		/>
		<TextArea
			placeholder="Enter a description for your protocol…"
			input={{
				value: description,
				onChange: ({ target: { value } }) => updateDescription({ description: value }),
			}}
		/>
		<div className="mt-4 flex flex-wrap gap-2">
			<PillButton variant="secondary" size="sm" onClick={handleNavigateToCodebook} icon={<BookOpenText className="size-4" />}>
				Codebook
			</PillButton>
			<PillButton variant="secondary" size="sm" onClick={handleNavigateToAssets} icon={<FileImage className="size-4" />}>
				Assets
			</PillButton>
			<PillButton
				variant="secondary"
				size="sm"
				onClick={handlePrintSummary}
				disabled={!protocolIsValid}
				icon={<PrintIcon className="size-4" />}
			>
				Printable Summary
			</PillButton>
		</div>
	</Card>
);
```

Add the imports at the top:

```tsx
import Card from "~/components/shared/Card";
import PillButton from "~/components/shared/PillButton";
```

Remove the now-unused `Button` and `Icon` imports from `~/lib/legacy-ui/components`.

- [ ] **Step 3: Restyle `Timeline.tsx`**

Replace the `Reorder.Group` layout with a horizontal rail. Keep `Reorder` and the existing `handleReorder` / `handleInsertStage` handlers untouched; only the visual wrapping changes.

Key changes inside `Timeline.tsx`:

```tsx
import TimelineRail from "~/components/shared/TimelineRail";
import TimelineStation from "~/components/shared/TimelineStation";
import { STAGE_META } from "~/components/Home/timelineScript";

// In the return block, replace the existing Reorder.Group with:
<TimelineRail railColor="hsl(220 4% 88%)">
	<Reorder.Group
		axis="x"
		onReorder={handleReorder}
		values={stages}
		className="flex items-center gap-6"
	>
		{stages.flatMap((stage, index) => [
			<InsertButton key={`insert_${stage.id}`} onClick={() => handleInsertStage(index)} />,
			<Reorder.Item
				tabIndex={0}
				key={stage.id}
				value={stage}
				layoutId={`timeline-stage-${stage.id}`}
				className="cursor-pointer focus:outline-none"
				onPointerDown={(e) => {
					pointerStart.current = { x: e.clientX, y: e.clientY };
				}}
				onClick={(e) => {
					const dx = e.clientX - pointerStart.current.x;
					const dy = e.clientY - pointerStart.current.y;
					if (dx * dx + dy * dy < 25) handleEditStage(stage.id);
				}}
			>
				<TimelineStation
					label={stage.label ?? "Untitled stage"}
					index={index}
					color={STAGE_META[stage.type]?.color ?? "hsl(168 100% 39%)"}
					iconSrc={STAGE_META[stage.type]?.icon ?? ""}
					labelPosition={index % 2 === 0 ? "below" : "above"}
				/>
			</Reorder.Item>,
		])}
		<InsertButton key="insert_end" onClick={() => handleInsertStage(stages.length)} />
	</Reorder.Group>
</TimelineRail>
```

If `STAGE_META` typing rejects `stage.type` as a key, wire a local type guard — do NOT use `as` casts. Example:

```ts
const meta = stage.type in STAGE_META ? STAGE_META[stage.type as keyof typeof STAGE_META] : null;
```

(If the existing `stages` type already covers stage types that don't have meta, add a neutral fallback color + icon inline.)

- [ ] **Step 4: Restyle `InsertButton.tsx`**

```tsx
// apps/architect-vite/src/components/Timeline/InsertButton.tsx
import { motion } from "motion/react";

type InsertButtonProps = {
	onClick: () => void;
};

const InsertButton = ({ onClick }: InsertButtonProps) => (
	<motion.button
		type="button"
		onClick={onClick}
		aria-label="Insert stage here"
		className="group flex size-6 cursor-pointer items-center justify-center rounded-full bg-white opacity-40 transition-opacity hover:opacity-100"
		style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
	>
		<span className="text-base font-bold" style={{ color: "hsl(240 35% 17%)" }}>
			+
		</span>
	</motion.button>
);

export default InsertButton;
```

- [ ] **Step 5: Typecheck + run tests**

```bash
pnpm --filter architect-vite typecheck
pnpm --filter architect-vite test
```

Expected: PASS. If `ProtocolControlBar.test.tsx` snapshot now drifts, regenerate it only if the snapshot is still meaningful — we delete the file in Task 17 anyway, so it's acceptable to update the snapshot inline with `pnpm --filter architect-vite test -u`.

- [ ] **Step 6: Visual verification**

```bash
pnpm --filter architect-vite dev
```

Open `http://localhost:<port>/protocol` with a loaded protocol. Verify: header renders with protocol name; Save button works; undo/redo work; left pane shows either the preview iframe or the skeleton; right pane shows Overview card and horizontal Timeline with pill-labeled stations; dragging reorders stages; insert buttons add stages.

At viewport widths 1440, 1280, 1024, and 768, confirm the split-pane degrades per the spec (50/50 → 40/60 → toggled panel on top).

- [ ] **Step 7: Commit**

```bash
pnpm lint:fix
git add apps/architect-vite/src/components/Protocol.tsx apps/architect-vite/src/components/Overview.tsx apps/architect-vite/src/components/Timeline/Timeline.tsx apps/architect-vite/src/components/Timeline/InsertButton.tsx
git commit -m "refactor(architect-vite): redesign /protocol with split-pane preview"
```

---

### Task 12: Refactor `/protocol/stage/:stageId`

Replace `StageEditor`'s local `ControlBar` with header actions; wrap its form sections in `Card`s; compose with `ProtocolHeader` + `SplitPane` + `PreviewIframe` in `StageEditorPage`.

**Files:**
- Modify: `apps/architect-vite/src/components/pages/StageEditorPage.tsx`
- Modify: `apps/architect-vite/src/components/StageEditor/StageEditor.tsx`
- Modify: `apps/architect-vite/src/components/StageEditor/StageHeading.tsx`

- [ ] **Step 1: Move header concerns into `StageEditorPage.tsx`**

The page wrapper now composes the layout. `StageEditor` becomes a content-only component that exposes `onSubmit` + `onCancel` + `isDirty` + `isValid` up to the page so the page can render the header buttons.

Rewrite `StageEditorPage.tsx`:

```tsx
// apps/architect-vite/src/components/pages/StageEditorPage.tsx
import { Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation, useParams } from "wouter";
import PillButton from "~/components/shared/PillButton";
import PreviewIframe from "~/components/shared/PreviewIframe";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import SplitPane from "~/components/shared/SplitPane";
import StageEditor from "~/components/StageEditor/StageEditor";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName, getStageIndexById, getStageLabelById } from "~/selectors/protocol";

const StageEditorPage = () => {
	const { stageId: rawStageId } = useParams();
	useProtocolLoader();
	const [, navigate] = useLocation();

	const urlParams = new URLSearchParams(window.location.search);
	const insertAtIndex = urlParams.get("insertAtIndex") ? Number(urlParams.get("insertAtIndex")) : undefined;
	const type = urlParams.get("type") || undefined;
	const stageId = rawStageId === "new" ? undefined : rawStageId;

	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const stageLabel = useAppSelector((s) => (stageId ? getStageLabelById(s, stageId) : undefined)) ?? "New stage";
	const stageIndex = useAppSelector((s) => (stageId ? getStageIndexById(s, stageId) : 0));

	const [submitRequested, setSubmitRequested] = useState(0);
	const [cancelRequested, setCancelRequested] = useState(0);
	const [isDirty, setIsDirty] = useState(false);
	const [isValid, setIsValid] = useState(true);
	const [narrowPreviewOpen, setNarrowPreviewOpen] = useState(false);

	const triggerSubmit = useCallback(() => setSubmitRequested((v) => v + 1), []);
	const triggerCancel = useCallback(() => setCancelRequested((v) => v + 1), []);

	const actions = (
		<>
			<PillButton variant="tertiary" size="sm" onClick={triggerCancel} icon={<X className="size-4" />}>
				Cancel
			</PillButton>
			<PillButton
				variant="primary"
				size="sm"
				onClick={triggerSubmit}
				disabled={!isValid}
				icon={<Check className="size-4" />}
			>
				Done
			</PillButton>
		</>
	);

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection={stageLabel}
				actions={actions}
				onLogoClick={() => navigate("/protocol")}
			/>
			<div className="flex-1 overflow-hidden">
				<SplitPane
					left={<PreviewIframe stageIndex={stageIndex} />}
					right={
						<StageEditor
							id={stageId}
							insertAtIndex={insertAtIndex}
							type={type}
							submitRequestId={submitRequested}
							cancelRequestId={cancelRequested}
							onDirtyChange={setIsDirty}
							onValidityChange={setIsValid}
						/>
					}
					narrowPreviewOpen={narrowPreviewOpen}
					onNarrowPreviewToggle={() => setNarrowPreviewOpen((v) => !v)}
				/>
			</div>
		</div>
	);
};

export default StageEditorPage;
```

If `getStageLabelById` / `getStageIndexById` do not exist, add them in `src/selectors/protocol.ts` (simple projections over `state.activeProtocol.present.stages`):

```ts
export const getStageLabelById = (state: RootState, id: string): string | undefined =>
	getProtocol(state)?.stages?.find((s: { id: string; label?: string }) => s.id === id)?.label;

export const getStageIndexById = (state: RootState, id: string): number =>
	getProtocol(state)?.stages?.findIndex((s: { id: string }) => s.id === id) ?? 0;
```

- [ ] **Step 2: Update `StageEditor.tsx` to accept external submit/cancel triggers**

Add props for `submitRequestId`, `cancelRequestId`, `onDirtyChange`, `onValidityChange`. Remove the local `ControlBar` block entirely. The existing form, redux-form wiring, and section-rendering logic stays; only the control-plumbing changes.

Key edits (sketched — preserve the existing file's imports and body around these):

```tsx
type StageEditorProps = {
	id?: string | null;
	insertAtIndex?: number;
	type?: string;
	submitRequestId: number;
	cancelRequestId: number;
	onDirtyChange: (dirty: boolean) => void;
	onValidityChange: (valid: boolean) => void;
};

// Inside the component:
useEffect(() => {
	onDirtyChange(hasUnsavedChanges);
}, [hasUnsavedChanges, onDirtyChange]);

useEffect(() => {
	onValidityChange(isValid);
}, [isValid, onValidityChange]);

useEffect(() => {
	if (submitRequestId === 0) return;
	void formRef.current?.requestSubmit();
}, [submitRequestId]);

useEffect(() => {
	if (cancelRequestId === 0) return;
	handleCancel();
}, [cancelRequestId, handleCancel]);

// Remove the <ControlBar ... /> block from the returned JSX.
// Wrap each rendered section in a Card:
return (
	<form ref={formRef} onSubmit={handleSubmit(onSubmit)} className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
		<StageHeading />
		{sections.map((SectionComponent, sectionIndex) => (
			<Card key={`${interfaceType}-${sectionIndex}`}>
				<SectionComponent form={formName} stagePath={stagePath} interfaceType={interfaceType} />
			</Card>
		))}
	</form>
);
```

`formRef` is a new `useRef<HTMLFormElement>(null)`. Preview was previously handled inside `StageEditor`; it is now handled by the `PreviewIframe` in the page. Remove the `handlePreview`, `uploadProgress`, and `isUploadingPreview` state from `StageEditor.tsx`.

`isValid` is derived from the protocol-validation call the editor already runs; if that value is not readily available, gate it on `!formInvalid` from redux-form (`isFormInvalid` or `getFormSyncErrors`). Verify which hook you actually have and wire accordingly — do not `as`-cast.

- [ ] **Step 3: Restyle `StageHeading.tsx`**

Wrap the existing content in a `Card`. Add a stage-type `Badge`.

```tsx
// apps/architect-vite/src/components/StageEditor/StageHeading.tsx
import { get } from "es-toolkit/compat";
import { useFormContext } from "redux-form";
import Badge from "~/components/shared/Badge";
import Card from "~/components/shared/Card";
import { getInterface } from "~/components/StageEditor/Interfaces";
import type { StageType } from "~/components/StageEditor/Interfaces";
import { Text } from "~/components/Form/Fields";
import ValidatedField from "~/components/Form/ValidatedField";
import { getTimelineImage } from "~/utils/getTimelineImage";
import { STAGE_META } from "~/components/Home/timelineScript";

const StageHeading = ({ _id }: { _id?: string }) => {
	const { values } = useFormContext();
	const type = get(values, "type") as string;
	const meta = type in STAGE_META ? STAGE_META[type as keyof typeof STAGE_META] : null;
	const documentationLink = get(getInterface(type as StageType), "documentation", null);

	return (
		<Card padding="lg">
			<div className="flex items-center gap-3">
				{meta && <Badge color={meta.color}>{meta.sub}</Badge>}
				{documentationLink && (
					<a
						href={documentationLink}
						target="_blank"
						rel="noreferrer"
						className="text-xs underline"
						style={{ color: "hsl(220 4% 44%)" }}
					>
						Documentation
					</a>
				)}
			</div>
			<ValidatedField
				name="label"
				component={Text}
				placeholder="Enter your stage name here"
				maxLength={50}
				validation={{ required: true }}
				autoFocus
			/>
		</Card>
	);
};

export default StageHeading;
```

(Leave the existing Text field component as the editor; only the wrapping markup changes. The large stage-type image was decorative — dropping it for consistency with the Overview card is intentional; if you want to keep it, place it inline above the name field.)

- [ ] **Step 4: Typecheck + run tests**

```bash
pnpm --filter architect-vite typecheck
pnpm --filter architect-vite test
```

Expected: PASS. Any existing StageEditor tests that asserted on the ControlBar must be updated or removed.

- [ ] **Step 5: Visual verification**

```bash
pnpm --filter architect-vite dev
```

From `/protocol`, click a stage → the stage editor loads at `/protocol/stage/<id>`. Verify: header breadcrumb reads `ProtocolName ▸ StageName`; Cancel + Done live in the header; form sections render as cards; Done commits the form; Cancel with dirty state shows the confirmation dialog; preview iframe reloads within ~2s after edits.

- [ ] **Step 6: Commit**

```bash
pnpm lint:fix
git add apps/architect-vite/src/components/pages/StageEditorPage.tsx apps/architect-vite/src/components/StageEditor apps/architect-vite/src/selectors/protocol.ts
git commit -m "refactor(architect-vite): redesign /protocol/stage with header actions and card sections"
```

---

### Task 13: Refactor `/protocol/assets`

Single-column layout. Compose `ProtocolHeader` + centered max-w-5xl column with the existing `AssetBrowser` on top of a `Card` wrap.

**Files:**
- Modify: `apps/architect-vite/src/components/pages/AssetsPage.tsx`

- [ ] **Step 1: Rewrite `AssetsPage.tsx`**

```tsx
// apps/architect-vite/src/components/pages/AssetsPage.tsx
import { useLocation } from "wouter";
import AssetBrowser from "~/components/AssetBrowser/AssetBrowser";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const AssetsPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Assets"
				actions={<SubRouteNav active="assets" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto max-w-5xl px-6 py-8">
					<Card padding="lg">
						<AssetBrowser sectionLayout="vertical" />
					</Card>
				</div>
			</main>
		</div>
	);
};

export default AssetsPage;
```

- [ ] **Step 2: Create the `SubRouteNav` component**

```tsx
// apps/architect-vite/src/components/pages/SubRouteNav.tsx
import { useLocation } from "wouter";

type SubRoute = "assets" | "codebook" | "summary" | "experiments";

const ROUTES: Record<SubRoute, { label: string; path: string }> = {
	assets: { label: "Assets", path: "/protocol/assets" },
	codebook: { label: "Codebook", path: "/protocol/codebook" },
	summary: { label: "Summary", path: "/protocol/summary" },
	experiments: { label: "Experiments", path: "/protocol/experiments" },
};

type Props = {
	active: SubRoute;
};

export default function SubRouteNav({ active }: Props) {
	const [, navigate] = useLocation();
	return (
		<nav className="flex items-center gap-1" aria-label="Protocol sections">
			{(Object.entries(ROUTES) as [SubRoute, (typeof ROUTES)[SubRoute]][]).map(([key, { label, path }]) => (
				<button
					key={key}
					type="button"
					onClick={() => navigate(path)}
					className="cursor-pointer rounded-full px-3 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[0.15em]"
					style={{
						color: key === active ? "hsl(240 35% 17%)" : "hsl(220 4% 44%)",
						background: key === active ? "#ffffff" : "transparent",
						boxShadow: key === active ? "0 2px 8px rgba(22,21,43,0.08)" : "none",
					}}
				>
					{label}
				</button>
			))}
		</nav>
	);
}
```

- [ ] **Step 3: Typecheck, test, and visual verify**

```bash
pnpm --filter architect-vite typecheck
pnpm --filter architect-vite test
pnpm --filter architect-vite dev
```

Open `/protocol/assets`. Verify: header breadcrumb; subroute nav highlights "Assets"; asset browser renders inside a card; clicking other subroute links navigates between pages.

- [ ] **Step 4: Commit**

```bash
pnpm lint:fix
git add apps/architect-vite/src/components/pages/AssetsPage.tsx apps/architect-vite/src/components/pages/SubRouteNav.tsx
git commit -m "refactor(architect-vite): redesign /protocol/assets single-column layout"
```

---

### Task 14: Refactor `/protocol/codebook`

Same shell as Assets, with the existing `Codebook` component inside a `Card`.

**Files:**
- Modify: `apps/architect-vite/src/components/pages/CodebookPage.tsx`

- [ ] **Step 1: Rewrite `CodebookPage.tsx`**

```tsx
// apps/architect-vite/src/components/pages/CodebookPage.tsx
import { useLocation } from "wouter";
import Codebook from "~/components/Codebook/Codebook";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const CodebookPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Codebook"
				actions={<SubRouteNav active="codebook" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto max-w-5xl px-6 py-8">
					<Card padding="lg">
						<Codebook />
					</Card>
				</div>
			</main>
		</div>
	);
};

export default CodebookPage;
```

Preserve any `EntityTypeDialog` or dialog state that the original page owned — if the original `CodebookPage` managed dialog state inline, keep that state and dialog rendering here as well (copy from the original file).

- [ ] **Step 2: Typecheck, test, visual verify, commit**

```bash
pnpm --filter architect-vite typecheck && pnpm --filter architect-vite test && pnpm lint:fix
git add apps/architect-vite/src/components/pages/CodebookPage.tsx
git commit -m "refactor(architect-vite): redesign /protocol/codebook single-column layout"
```

---

### Task 15: Refactor `/protocol/summary`

**Files:**
- Modify: `apps/architect-vite/src/components/pages/SummaryPage.tsx`

- [ ] **Step 1: Rewrite `SummaryPage.tsx`**

Preserve the original file's `print` side effect on mount. Replace the surrounding layout only.

```tsx
// apps/architect-vite/src/components/pages/SummaryPage.tsx
import { useEffect } from "react";
import { useLocation } from "wouter";
import AssetManifest from "~/components/Screens/Summary/AssetManifest";
import Codebook from "~/components/Screens/Summary/Codebook";
import Contents from "~/components/Screens/Summary/Contents";
import Cover from "~/components/Screens/Summary/Cover";
import Stages from "~/components/Screens/Summary/Stages";
import SummaryContext from "~/components/Screens/Summary/SummaryContext";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const SummaryPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";

	useEffect(() => {
		document.documentElement.classList.add("print");
		return () => document.documentElement.classList.remove("print");
	}, []);

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Summary"
				actions={<SubRouteNav active="summary" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto print:h-auto print:overflow-visible">
				<SummaryContext>
					<div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 print:max-w-none print:gap-4 print:p-0">
						<Card padding="lg">
							<Cover />
						</Card>
						<Card padding="lg">
							<Contents />
						</Card>
						<Card padding="lg">
							<Stages />
						</Card>
						<Card padding="lg">
							<Codebook />
						</Card>
						<Card padding="lg">
							<AssetManifest />
						</Card>
					</div>
				</SummaryContext>
			</main>
		</div>
	);
};

export default SummaryPage;
```

If the original file imported the Summary sub-components from different paths, mirror those paths exactly. Run `rg "SummaryContext" apps/architect-vite/src` to verify the correct import locations.

- [ ] **Step 2: Typecheck, test, visual verify (including print preview), commit**

```bash
pnpm --filter architect-vite typecheck && pnpm --filter architect-vite test && pnpm lint:fix
git add apps/architect-vite/src/components/pages/SummaryPage.tsx
git commit -m "refactor(architect-vite): redesign /protocol/summary single-column layout"
```

---

### Task 16: Refactor `/protocol/experiments`

**Files:**
- Modify: `apps/architect-vite/src/components/pages/ExperimentsPage.tsx`

- [ ] **Step 1: Rewrite `ExperimentsPage.tsx`**

Keep the original toggle logic (whatever actions the file dispatches); reskin only.

```tsx
// apps/architect-vite/src/components/pages/ExperimentsPage.tsx
import { useLocation } from "wouter";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { updateProtocol } from "~/ducks/modules/activeProtocol";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocol, getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const ExperimentsPage = () => {
	useProtocolLoader();
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const protocol = useAppSelector(getProtocol);
	const experiments = protocol?.experiments ?? {};

	const setExperiment = (key: string, value: boolean) =>
		dispatch(updateProtocol({ experiments: { ...experiments, [key]: value } }));

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Experiments"
				actions={<SubRouteNav active="experiments" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
					<Card padding="lg">
						<label className="flex items-center justify-between gap-4">
							<span className="flex flex-col">
								<span className="font-heading text-base font-extrabold">Encrypted Variables</span>
								<span className="text-xs" style={{ color: "hsl(220 4% 44%)" }}>
									Enable client-side encryption of variable values during interviews.
								</span>
							</span>
							<input
								type="checkbox"
								checked={!!experiments.encryption}
								onChange={(e) => setExperiment("encryption", e.target.checked)}
								className="size-5 cursor-pointer"
							/>
						</label>
					</Card>
				</div>
			</main>
		</div>
	);
};

export default ExperimentsPage;
```

If the original file had additional experiments, mirror them — `rg "updateProtocol" apps/architect-vite/src/components/pages/ExperimentsPage.tsx` on the original commit to enumerate.

- [ ] **Step 2: Typecheck, test, visual verify, commit**

```bash
pnpm --filter architect-vite typecheck && pnpm --filter architect-vite test && pnpm lint:fix
git add apps/architect-vite/src/components/pages/ExperimentsPage.tsx
git commit -m "refactor(architect-vite): redesign /protocol/experiments single-column layout"
```

---

### Task 17: Retire `ProtocolControlBar`

**Files:**
- Delete: `apps/architect-vite/src/components/ProtocolControlBar.tsx`
- Delete: `apps/architect-vite/src/components/__tests__/ProtocolControlBar.test.tsx`

- [ ] **Step 1: Confirm no remaining references**

```bash
rg "ProtocolControlBar" apps/architect-vite/src
```

Expected: only the file itself and its test. If anything else references it, fix that first — do not delete yet.

- [ ] **Step 2: Delete the files**

```bash
rm apps/architect-vite/src/components/ProtocolControlBar.tsx
rm apps/architect-vite/src/components/__tests__/ProtocolControlBar.test.tsx
```

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter architect-vite typecheck
pnpm --filter architect-vite test
```

Expected: PASS.

- [ ] **Step 4: Remove the pre-flight notes file**

```bash
rm apps/architect-vite/PROTOCOL_REDESIGN_NOTES.md
```

- [ ] **Step 5: Commit**

```bash
pnpm lint:fix
git add -A
git commit -m "refactor(architect-vite): retire ProtocolControlBar"
```

---

### Task 18: Final visual verification pass

Not strictly a code task — a final walk through all six routes at four viewport sizes.

- [ ] **Step 1: Run dev server**

```bash
pnpm --filter architect-vite dev
```

- [ ] **Step 2: For each of 1440, 1280, 1024, 768 viewport widths, visit every route**

- `/` — Home still works.
- `/protocol` — header with Save, split pane, Overview card, horizontal Timeline with rails/stations, insert "+" buttons.
- `/protocol/stage/<id>` — header breadcrumb, Cancel + Done in the header, split pane with preview on the left and cards on the right.
- `/protocol/assets` — single column, subroute nav in header, assets inside a card.
- `/protocol/codebook` — single column, subroute nav, codebook inside a card.
- `/protocol/summary` — single column, stacked summary cards, prints cleanly with `Ctrl+P`.
- `/protocol/experiments` — single column, experiment toggles as cards.

- [ ] **Step 3: Verify preview iframe behavior**

On `/protocol`, edit the protocol name. Expect an "Updating…" indicator ~2s after the last keystroke, and the iframe src updates when upload completes.

- [ ] **Step 4: Verify save behavior**

On `/protocol`, make a change → Save button shows a dot. Click Save → button shows "Saving…" → "Saved" for ~2s → back to idle.

- [ ] **Step 5: Verify stage editor commit/cancel**

On `/protocol/stage/<id>`, edit the stage name, click Done → navigates back to `/protocol` with the change committed. Edit the stage name, click Cancel → confirmation dialog; confirm → navigates back without the change.

- [ ] **Step 6: Commit any final lint/formatting fixes**

```bash
pnpm lint:fix
git diff
# If anything changed:
git add -A
git commit -m "chore(architect-vite): final formatting pass"
```

---

## Appendix: known caveats

- **`as` casts:** This plan avoids `as Type` per project conventions. If the `stage.type` → `STAGE_META` mapping requires a narrowing that TypeScript can't infer, use a `type in object` guard or an explicit runtime check.
- **`STAGE_META` origin and key mismatch:** `STAGE_META` is currently defined in `~/components/Home/timelineScript` with keys curated for the Home demo (e.g. `namegen`, `sociogram`). Protocol stages use the canonical stage type names (`NameGenerator`, `Sociogram`, etc.) from `Interfaces.tsx`. During Task 11 Step 3, if the keys don't line up, introduce `src/components/shared/stageMeta.ts` with a mapping from canonical stage types to `{ color, iconSrc, label }`, seeded from `getTimelineImage()` (for icons) and a hand-authored color palette. Update both `Timeline.tsx` and `StageHeading.tsx` to consume this shared module. Do not extend `timelineScript.ts` — it's a Home-page-specific script.
- **`isValid` in Task 12 Step 2:** `StageEditor` does not maintain continuous form validity today; it only runs `validateProtocol()` inside `handlePreview`. For the Done button's disabled state, use redux-form's `isValid(formName)(state)` selector (synchronous, fast). If that's not sufficient signal in practice, run `validateProtocol` on a debounce and surface the result through `onValidityChange`.
- **Preview hashing:** `stableHash` in `PreviewIframe` uses `JSON.stringify` with sorted top-level keys. Nested-key ordering is not normalized; if nested stage objects have nondeterministic key ordering, the upload may fire on no-op changes. Measure during Task 18 visual verification and swap to a proper stable hash (`@codaco/shared-consts` may already expose one) if firing too often.
- **Debounce tuning:** 2s is the starting value. Tune during Task 18 if uploads feel slow or chatty.
