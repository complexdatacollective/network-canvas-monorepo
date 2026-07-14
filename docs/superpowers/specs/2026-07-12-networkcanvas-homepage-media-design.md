# Network Canvas Homepage Media and Motion Design

**Date:** 2026-07-12

**Status:** Approved for implementation planning

## Purpose

Bring the `apps/networkcanvas.com` homepage closer to the original Network
Canvas website while ensuring its product imagery reflects the applications
that exist in 2026. The change replaces synthetic product drawings and static
hero decoration with real application media, then adds a single coordinated
page entrance without changing the page's structure or copy.

## Scope

The homepage will:

- use real 4:3 screenshots for Architect, Interviewer, and Fresco;
- use the original website's `hero-video.mp4` as the hero visual;
- use `@codaco/art`'s `BackgroundLights` behind the header and hero;
- animate the header and hero content as one ordered entrance sequence; and
- preserve the existing section order, text, links, and calls to action.

The download page and all homepage sections below the hero retain their current
content and behavior except that the product section will display screenshots
instead of synthetic drawings.

## Product Screenshots

### Sources

Create three PNG assets at 1600 by 1200 CSS pixels so each source image is a
high-resolution 4:3 desktop capture:

- Architect: capture the local `apps/architect` development app in a clean,
  representative editor state.
- Interviewer: capture the local `apps/interviewer` development app in a clean,
  representative home or interview state that uses repository-provided
  development content.
- Fresco: capture the authenticated dashboard at
  `https://fresco-sandbox.networkcanvas.dev` from the top of the page.

Captures must show application UI only. Browser chrome, developer tools,
transient dialogs, notifications, cursor artifacts, and loading states must not
appear. Each capture uses the same 1600 by 1200 viewport and begins at the
page's top-left stable state. The screenshots are stored under
`apps/networkcanvas.com/public/images/screenshots/` as `architect.png`,
`interviewer.png`, and `fresco.png`.

### Rendering

Replace the synthetic screen implementations in `DeviceMockup` with a typed
mapping from the existing `architect | interviewer | fresco` variants to the
three screenshot assets and meaningful alt text. Render each screenshot with
Next Image using `object-cover` inside the existing 4:3 frame.

All product screenshots use one restrained frame treatment: the current rounded
outer shell remains, but the inner synthetic screen, fabricated controls, and
`@codaco/fresco-ui/Node` dependency are removed. The frame must not recolor,
obscure, or distort the captured application UI. The crop and focal position
are consistent across all three variants.

## Hero Video

Download the original homepage asset from:

`https://assets.networkcanvas.com/public/assets/video/hero-video.mp4`

Store it at `apps/networkcanvas.com/public/videos/hero-video.mp4`. Extract a
representative still from the downloaded file with `ffmpeg` and store it at
`apps/networkcanvas.com/public/images/hero-video-poster.jpg`.

The hero visual replaces the current Interviewer `DeviceMockup`. It remains in
the existing left-hand hero media column on desktop and becomes visible on
smaller layouts instead of being hidden. The video is decorative and therefore
has no audio or controls. It uses `muted`, `loop`, `playsInline`, and
`preload="metadata"`.

Motion preference is resolved before playback begins. With normal motion, the
video autoplays and loops. With `prefers-reduced-motion: reduce`, the video does
not autoplay and the poster is rendered as the stable visual. The poster and
video share identical dimensions and framing so hydration cannot shift the
layout.

## Background

Remove the static `Blob` instances from the header/hero wrapper. Add
`@codaco/art` to the marketing application's workspace dependencies and render
`BackgroundLights` as a decorative, non-interactive layer behind the header and
hero.

Use existing theme CSS variables for its color list, not hardcoded color
values. Use only medium or large lights, a low parent opacity, and normal blend
behavior so the result reads as soft ambient color on the existing light
surface. The layer is clipped by the current hero wrapper and must not affect
layout, pointer input, or text contrast.

`BackgroundLights` already stops its animation loop for reduced-motion users;
its static light placement remains visible as nonessential decoration.

## Coordinated Entrance

The entrance is one ordered sequence, not independent animations scattered
through the page:

1. Header/navigation
2. Hero headline
3. Hero video and explanatory copy
4. News ticker
5. Download call to action and supporting line

Use `motion/react` variants with a parent-controlled stagger and the repository's
established spring character: moderate stiffness, controlled damping, and
short travel distances. Elements enter with opacity plus a small vertical or
horizontal offset; no element scales, spins, or bounces excessively. The full
sequence must settle quickly enough that navigation and the main call to action
are not delayed for practical use.

The header remains a client component. A client-side `HeroIntro` wrapper owns
the parent sequence, renders the header and hero as its ordered children, and
provides the decorative background layer. The hero becomes a client component
so its motion elements can inherit the sequence. Existing scroll-triggered
`Reveal` behavior below the hero is unchanged.

When reduced motion is requested:

- all entrance `initial` values are disabled;
- all offsets and stagger delays are removed;
- elements render immediately at full opacity; and
- the hero video remains on its poster frame.

The sequence must not hide semantic content from assistive technology while it
is visually entering.

## Component Boundaries

- `app/page.tsx` replaces its static-blob/header/hero composition with
  `HeroIntro`.
- `components/sections/HeroIntro.tsx` owns the parent entrance sequence,
  reduced-motion variants, and `BackgroundLights` layer.
- `components/layout/Header.tsx` participates in the page entrance without
  changing navigation semantics or mobile menu behavior.
- `components/sections/Hero.tsx` owns the ordered hero variants and layout.
- `components/ui/HeroVideo.tsx` owns video/poster rendering and reduced-motion
  playback behavior.
- `components/ui/DeviceMockup.tsx` owns the common screenshot frame and typed
  asset mapping.

No new barrel files or convenience re-exports are introduced. Components are
imported from their original modules.

## Accessibility and Resilience

- Screenshot alt text identifies the application and the screen shown.
- The decorative hero video is hidden from assistive technology; the adjacent
  text communicates the product purpose.
- Existing focus order, visible focus styling, navigation labels, and mobile
  menu behavior remain unchanged.
- Media dimensions are reserved to prevent cumulative layout shift.
- The poster provides a stable hero fallback if video playback is unavailable.
- All animation and autoplay behavior respects reduced-motion preferences.

## Testing and Verification

Implementation follows test-first development. Add focused tests that initially
fail for the absent behavior, then verify:

- every `DeviceMockup` variant selects the correct screenshot and alt text;
- the hero media has the required muted, looping, and inline playback behavior;
- reduced motion selects the poster and disables entrance offsets and delays;
- the homepage renders `BackgroundLights` instead of static `Blob` images; and
- the header/hero sequence preserves the specified ordering.

Run the marketing app's focused tests, build, and typecheck. Then run repository
formatting, auto-fixing lint, `knip`, and the relevant root typecheck. Complete
browser verification at desktop and mobile widths, including a reduced-motion
pass, and inspect final screenshots for cropping, text contrast, loading states,
and layout shift.

## Non-goals

- No live iframe previews.
- No changes to homepage copy, section order, or link destinations.
- No redesign of sections below the product screenshot replacements.
- No changes to Architect, Interviewer, or Fresco themselves beyond running
  their existing development or sandbox builds for capture.
- No replacement of the project-video section further down the homepage.
