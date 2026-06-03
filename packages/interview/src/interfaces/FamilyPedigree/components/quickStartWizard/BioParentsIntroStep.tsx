'use client';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

/**
 * Small "roughen" filter giving otherwise crisp vector strokes a gentle
 * hand-drawn wobble. Each instance needs a unique id to coexist on one page.
 */
function RoughenFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.018"
        numOctaves="2"
        seed="6"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="1.4"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  );
}

/** Small ovum glyph: a cell with a nucleus, ringed by a corona of ticks. */
function EggGlyph() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true" className="size-6">
      <defs>
        <RoughenFilter id="egg-rough" />
      </defs>
      <g filter="url(#egg-rough)">
        <g
          className="stroke-current/45"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            return (
              <line
                key={i}
                x1={18 + cos * 10.5}
                y1={18 + sin * 10.5}
                x2={18 + cos * 13}
                y2={18 + sin * 13}
              />
            );
          })}
        </g>
        <circle
          cx="18"
          cy="18"
          r="8"
          className="fill-current/10 stroke-current"
          strokeWidth="1.6"
        />
        <circle cx="18" cy="18" r="2.6" className="fill-current/60" />
      </g>
    </svg>
  );
}

/** Small spermatozoon glyph: an oval head with a wavy flagellum. */
function SpermGlyph() {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true" className="size-6">
      <defs>
        <RoughenFilter id="sperm-rough" />
      </defs>
      <g filter="url(#sperm-rough)">
        <path
          d="M17 18 q3.5 -5 7 0 t7 0"
          className="stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse
          cx="12"
          cy="18"
          rx="5.5"
          ry="4.5"
          className="fill-current/15 stroke-current"
          strokeWidth="1.8"
        />
      </g>
    </svg>
  );
}

export default function BioParentsIntroStep() {
  return (
    <>
      <Paragraph>
        When building a pedigree, we need to ask you about your biological
        parents, and not just the parents who raised you, or the people you
        think of as your parents. This is because the pedigree is designed to
        capture genetic relationships, which are based on biology.
      </Paragraph>
      <Paragraph>
        Don't worry - we'll also give you the opportunity to include information
        about non-biological parents later on in the process.
      </Paragraph>
      <Paragraph>
        There are two important concepts to understand when we talk about
        biological parents: the egg parent and the sperm parent.
      </Paragraph>
      <div className="tablet-portrait:grid-cols-2 my-6 grid gap-4">
        <Surface level={1} spacing="sm" shadow="sm">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-primary bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-full">
              <EggGlyph />
            </span>
            <Heading level="h4" margin="none">
              Egg Parent
            </Heading>
          </div>
          <Paragraph margin="none" emphasis="muted" intent="smallText">
            The egg parent is the person who contributed the egg that you were
            conceived with. If you were conceived via an egg donor, the egg
            donor is the egg parent, even if they did not carry you during
            pregnancy.
          </Paragraph>
        </Surface>
        <Surface level={1} spacing="sm" shadow="sm">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-accent bg-accent/15 flex size-10 shrink-0 items-center justify-center rounded-full">
              <SpermGlyph />
            </span>
            <Heading level="h4" margin="none">
              Sperm Parent
            </Heading>
          </div>
          <Paragraph margin="none" emphasis="muted" intent="smallText">
            The sperm parent is the person who contributed the sperm that you
            were conceived with. If you were conceived via a sperm donor, the
            sperm donor is the sperm parent, even if they did not raise you.
          </Paragraph>
        </Surface>
      </div>
    </>
  );
}
