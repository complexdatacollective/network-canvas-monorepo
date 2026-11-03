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

    {{! Who is talking to whom: each speech bubble joins the shared network. }}
    <path class="ln-case" d="M90 122C106 86 124 72 150 70" />
    <path class="s-coral ln-core" d="M90 122C106 86 124 72 150 70" />
    <path class="ln-case" d="M330 122C314 86 296 72 270 70" />
    <path class="s-mint ln-core" d="M330 122C314 86 296 72 270 70" />
    <path class="ln-case" d="M210 152V128" />
    <path class="s-sky ln-core" d="M210 152V128" />

    {{! The shared network, drawn as a card like an interview screen. }}
    <rect class="f-surface ln ln-bold" x="150" y="24" width="120" height="104" rx="22" />
    <path class="s-mustard ln-thick" d="M172 48H206" />
    <path class="s-mint ln-mid" d="M172 61H192" />
    <path class="ln-case" d="M178 100C196 80 214 78 236 84" />
    <path class="s-sky ln-core" d="M178 100C196 80 214 78 236 84" />
    <path class="ln-case" d="M178 100C190 114 210 118 234 114" />
    <path class="s-coral ln-core" d="M178 100C190 114 210 118 234 114" />
    <path class="ln-case" d="M236 84V108" />
    <path class="s-mustard ln-core" d="M236 84V108" />
    <circle class="f-coral ln" cx="178" cy="100" r="10" />
    <rect class="f-sky ln" x="226" y="74" width="20" height="20" rx="6" />
    <path class="f-mustard ln" d="M236 103l11 18h-22Z" />

    {{! Left: a question. }}
    <rect class="f-surface ln ln-bold" x="14" y="118" width="88" height="66" rx="22" />
    <path class="f-surface ln ln-bold" d="M44 182l8 18 10-18" />
    <path
      class="s-coral ln-heavy"
      d="M49 144c0-6 4-10 9-10s9 4 9 9c0 6-9 7-9 13"
    />
    <circle class="f-coral" cx="58" cy="168" r="4" />
    <path
      class="f-coral ln ln-bold"
      d="M34 300c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-coral ln ln-bold" cx="67" cy="231" r="19" />
    <circle class="f-shine" cx="61" cy="225" r="5" />

    {{! Right: an idea. }}
    <rect class="f-surface ln ln-bold" x="318" y="118" width="88" height="66" rx="22" />
    <path class="f-surface ln ln-bold" d="M346 182l8 18 10-18" />
    <path class="ln" d="M362 124v-3M344 134l-3-2M380 134l3-2" />
    <circle class="f-mustard ln" cx="362" cy="144" r="13" />
    <rect class="f-surface ln" x="355" y="157" width="14" height="10" rx="3" />
    <path
      class="f-mint ln ln-bold"
      d="M320 300c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-mint ln ln-bold" cx="353" cy="231" r="19" />
    <circle class="f-shine" cx="347" cy="225" r="5" />

    {{! Centre: a conversation. }}
    <rect class="f-surface ln ln-bold" x="170" y="152" width="80" height="50" rx="20" />
    <path class="f-surface ln ln-bold" d="M198 200l8 16 10-16" />
    <circle class="f-coral" cx="192" cy="177" r="5" />
    <circle class="f-mustard" cx="210" cy="177" r="5" />
    <circle class="f-mint" cx="228" cy="177" r="5" />
    <path
      class="f-sky ln ln-bold"
      d="M177 320c3-29 15-45 33-45s30 16 33 45Z"
    />
    <circle class="f-sky ln ln-bold" cx="210" cy="251" r="19" />
    <circle class="f-shine" cx="204" cy="245" r="5" />

    {{! Loose nodes, as on the website's illustrations. }}
    <circle class="f-purple ln" cx="128" cy="214" r="7" />
    <path class="f-mustard ln" d="M292 214l9 9-9 9-9-9Z" />
    <rect class="f-mint ln" x="116" y="20" width="14" height="14" rx="4" />
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
    <rect class="f-sky ln" x="6" y="6" width="52" height="40" rx="14" />
    <path class="f-sky ln" d="M16 44l-2 14 14-12" />
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
    <rect class="f-coral ln" x="4" y="6" width="38" height="28" rx="10" />
    <path class="f-coral ln" d="M12 32l-2 10 12-8" />
    <rect class="f-mint ln" x="22" y="22" width="38" height="28" rx="10" />
    <path class="f-mint ln" d="M50 48l4 10-12-8" />
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
