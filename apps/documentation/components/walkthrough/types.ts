// Mirrors the storyboard format in
// .agents/skills/creating-a-guided-walkthrough/references/storyboard.md: each
// storyboard column is a field here.

// A region of a still, in percentages of the image.
export type Region = { x: number; y: number; w: number; h: number };

// Highlights are shown in order, each with the cursor moving to it. `marked`
// means the screenshot already circles the region, so no ring is drawn.
export type Highlight = Region & { marked?: true };

// Illustrated scenes in the style of networkcanvas.com/updates, drawn in
// `scenes/` and listed in `scenes/sceneRegistry.ts`.
export type SceneId =
  | 'services'
  | 'hour'
  | 'account'
  | 'sign-up'
  | 'github-sign-in'
  | 'fork'
  | 'forked'
  | 'database'
  | 'neon-sign-in'
  | 'env-edit'
  | 'env-check'
  | 'deploy'
  | 'netlify-sign-in'
  | 'pick-repo'
  | 'env-copy'
  | 'deadline'
  | 'safe'
  | 'storage'
  | 'bucket'
  | 'live';

// The pastel band a chapter's visuals sit on, as on the /updates page.
export type Tint =
  | 'serpent'
  | 'purple'
  | 'green'
  | 'blue'
  | 'coral'
  | 'mustard';

// Every beat shows the real screen (a still or a capture) or an illustrated
// scene.
export type Visual =
  | { kind: 'scene'; scene: SceneId }
  | {
      kind: 'still';
      src: string;
      // The address shown in the illustrated browser window around it.
      url: string;
      alt: string;
      width: number;
      height: number;
      highlights?: Highlight[];
      // Where to zoom once the still has appeared. Defaults to the area
      // around the highlights; `false` keeps the whole still in view.
      zoom?: Region | false;
    }
  // A recording of the product, from the walkthrough's capture script: `src`
  // is the clip's path without an extension, with .webm, .mp4 and a
  // final-frame .jpg beside it.
  | {
      kind: 'capture';
      src: string;
      url: string;
      alt: string;
      width: number;
      height: number;
    };

// The choices that must have been made, and how, for a beat to appear.
export type Condition = Record<string, string>;

// Text that differs by the option picked for an earlier choice.
type VariantText = { choice: string; byOption: Record<string, string> };

export type BeatText = string | VariantText;

export type Link = { label: string; href: string };

type BeatBase = {
  id: string;
  text: BeatText;
  visual: Visual;
  when?: Condition;
  // A guide anchor (`#heading-id`) or a docs path that covers this beat more
  // specifically than its chapter's section does.
  guide?: string;
};

export type Beat = BeatBase &
  (
    | { type: 'explain'; confirm?: string }
    | { type: 'do'; confirm: string; skip?: string }
    | {
        type: 'choose';
        choice: string;
        options: { id: string; label: string }[];
      }
    | { type: 'checkpoint'; confirm: string; help?: Link }
    | { type: 'finish'; links?: Link[] }
  );

export type Chapter = {
  id: string;
  title: string;
  tint: Tint;
  guide: string;
  beats: Beat[];
};

export type Walkthrough = {
  id: string;
  title: string;
  description: string;
  chapters: Chapter[];
};

export type Progress = {
  beat: string | null;
  choices: Record<string, string>;
};
