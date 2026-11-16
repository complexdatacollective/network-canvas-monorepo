// The landing page's drawings, in the style of the website's illustrations:
// rounded outlines in the text colour over flat fills from the Network Canvas
// palette. Colours come from classes (scss/landing.scss) that read the theme
// tokens, so the drawings follow the light and dark palettes. All of them are
// decorative; the text beside each one says what it means.

// Three researchers around a shared network: one asks, one has an idea, one
// is talking. The forum in a picture, and the three things it is for.
export const HeroIllustration = <template>
  <svg
    class="nc-illustration nc-illustration--hero"
    viewBox="0 0 420 320"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="f-wash"
      d="M58 160C34 98 86 38 164 44S296 14 360 66s66 132 0 188-170 78-246 34S80 214 58 160Z"
    />

    {{! Who is talking to whom: each speech bubble joins the shared network.
      The lines start inside the shapes they join, which are drawn over them. }}
    <path class="ln-case" d="M70 120C70 88 104 76 152 76" />
    <path class="s-coral ln-core" d="M70 120C70 88 104 76 152 76" />
    <path class="ln-case" d="M350 120C350 88 316 76 268 76" />
    <path class="s-mint ln-core" d="M350 120C350 88 316 76 268 76" />
    <path class="ln-case" d="M210 156V126" />
    <path class="s-sky ln-core" d="M210 156V126" />

    {{! The shared network, drawn as a card like an interview screen: two
      lines of text over three linked nodes, with even space all round. }}
    <rect class="f-surface ln ln-bold" x="148" y="22" width="124" height="108" rx="22" />
    <path class="s-mustard ln-thick" d="M172 43H206" />
    <path class="s-mint ln-mid" d="M172 56H192" />
    <path class="ln-case" d="M182 101L210 81" />
    <path class="s-sky ln-core" d="M182 101L210 81" />
    <path class="ln-case" d="M210 81L238 101" />
    <path class="s-coral ln-core" d="M210 81L238 101" />
    <path class="ln-case" d="M182 101C196 111 224 111 238 101" />
    <path class="s-mint ln-core" d="M182 101C196 111 224 111 238 101" />
    <circle class="f-coral ln" cx="182" cy="101" r="9" />
    <rect class="f-sky ln" x="229" y="92" width="18" height="18" rx="5" />
    <path class="f-mustard ln" d="M210 70l10 17h-20Z" />

    {{! Each speech bubble is one outline with its tail, centred over the
      person it belongs to, its tail pointing at their head. }}

    {{! Left: a question. }}
    <path
      class="f-surface ln ln-bold"
      d="M48 116H92A22 22 0 0 1 114 138V160A22 22 0 0 1 92 182H80L68 198L60 182H48A22 22 0 0 1 26 160V138A22 22 0 0 1 48 116Z"
    />
    <path
      class="s-coral ln-heavy"
      d="M61 142c0-6 4-10 9-10s9 4 9 9c0 6-9 7-9 13"
    />
    <circle class="f-coral" cx="70" cy="164" r="4" />
    <path
      class="f-coral ln ln-bold"
      d="M37 300c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-coral ln ln-bold" cx="70" cy="231" r="19" />
    <circle class="f-shine" cx="64" cy="225" r="5" />

    {{! Right: an idea. }}
    <path
      class="f-surface ln ln-bold"
      d="M328 116H372A22 22 0 0 1 394 138V160A22 22 0 0 1 372 182H360L352 198L340 182H328A22 22 0 0 1 306 160V138A22 22 0 0 1 328 116Z"
    />
    <path class="ln" d="M350 133v-3M339 138l-3-2.5M361 138l3-2.5" />
    <circle class="f-mustard ln" cx="350" cy="150" r="10" />
    <rect class="f-surface ln" x="344" y="159" width="12" height="9" rx="3" />
    <path
      class="f-mint ln ln-bold"
      d="M317 300c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-mint ln ln-bold" cx="350" cy="231" r="19" />
    <circle class="f-shine" cx="344" cy="225" r="5" />

    {{! Centre: a conversation. }}
    <path
      class="f-surface ln ln-bold"
      d="M190 152H230A20 20 0 0 1 250 172V182A20 20 0 0 1 230 202H220L210 217L200 202H190A20 20 0 0 1 170 182V172A20 20 0 0 1 190 152Z"
    />
    <circle class="f-coral" cx="192" cy="177" r="5" />
    <circle class="f-mustard" cx="210" cy="177" r="5" />
    <circle class="f-mint" cx="228" cy="177" r="5" />
    <path
      class="f-sky ln ln-bold"
      d="M177 320c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-sky ln ln-bold" cx="210" cy="252" r="19" />
    <circle class="f-shine" cx="204" cy="246" r="5" />

    {{! Loose nodes, as on the website's illustrations. }}
    <circle class="f-purple ln" cx="138" cy="226" r="7" />
    <path class="f-mustard ln" d="M282 217l9 9-9 9-9-9Z" />
    <rect class="f-mint ln" x="98" y="22" width="14" height="14" rx="4" />
  </svg>
</template>;

// A question in a speech bubble: asking for help.
export const HelpIcon = <template>
  <svg
    class="nc-illustration nc-illustration--icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="f-sky ln"
      d="M20 6H44A14 14 0 0 1 58 20V32A14 14 0 0 1 44 46H30L16 57L20 46A14 14 0 0 1 6 32V20A14 14 0 0 1 20 6Z"
    />
    <path
      class="s-line ln-heavy"
      d="M25 20c0-4 3-7 7-7s7 3 7 7c0 5-7 5-7 10"
    />
    <circle class="f-line" cx="32" cy="37" r="3" />
  </svg>
</template>;

// A light bulb whose filament is a small network: an idea.
export const IdeasIcon = <template>
  <svg
    class="nc-illustration nc-illustration--icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path class="ln" d="M32 5v-1M13 14l-2-2M51 14l2-2M8 30H6M56 30h2" />
    <circle class="f-mustard ln" cx="32" cy="28" r="16" />
    <path class="ln-thin" d="M26 30l6-7 6 7" />
    <circle class="f-surface ln-thin" cx="26" cy="30" r="3" />
    <circle class="f-surface ln-thin" cx="32" cy="23" r="3" />
    <circle class="f-surface ln-thin" cx="38" cy="30" r="3" />
    <rect class="f-surface ln" x="24" y="43" width="16" height="10" rx="3" />
    <path class="ln" d="M28 58h8" />
  </svg>
</template>;

// Two overlapping speech bubbles: a conversation.
export const ConversationIcon = <template>
  <svg
    class="nc-illustration nc-illustration--icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="f-coral ln"
      d="M14 6H32A10 10 0 0 1 42 16V24A10 10 0 0 1 32 34H22L11 42L14 34A10 10 0 0 1 4 24V16A10 10 0 0 1 14 6Z"
    />
    <path
      class="f-mint ln"
      d="M32 22H50A10 10 0 0 1 60 32V40A10 10 0 0 1 50 50L55 58L42 50H32A10 10 0 0 1 22 40V32A10 10 0 0 1 32 22Z"
    />
    <circle class="f-line" cx="33" cy="36" r="2.5" />
    <circle class="f-line" cx="41" cy="36" r="2.5" />
    <circle class="f-line" cx="49" cy="36" r="2.5" />
  </svg>
</template>;

// A megaphone: news from the team.
export const NewsIcon = <template>
  <svg
    class="nc-illustration nc-illustration--icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path class="ln" d="M48 24c3 2 5 5 5 8s-2 6-5 8M53 16c5 4 8 10 8 16s-3 12-8 16" />
    <path class="f-surface ln" d="M16 38l5 16h7l-4-16" />
    <path
      class="f-purple ln"
      d="M10 24h10l20-12v40L20 40H10a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4Z"
    />
  </svg>
</template>;

// An open book: the documentation.
export const DocsIcon = <template>
  <svg
    class="nc-illustration nc-illustration--icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="f-surface ln"
      d="M32 16c-6-5-15-6-24-4v38c9-2 18-1 24 4 6-5 15-6 24-4V12c-9-2-18-1-24 4Z"
    />
    <path class="ln" d="M32 16v38" />
    <path class="s-coral ln-mid" d="M15 22h10M15 30h8" />
    <path class="s-sky ln-mid" d="M39 22h10M39 30h6" />
  </svg>
</template>;
