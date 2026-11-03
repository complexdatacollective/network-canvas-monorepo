import { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";

/**
 * The Network Canvas mark, linking to the website. It leads the forum's bar
 * only where the shared site header, which carries the full logo, is hidden
 * (header.scss). The drawing is the brand mark the documentation site serves
 * (apps/documentation/public/images/mark.svg), in its own colours.
 */
const SiteMark = <template>
  <a
    class="nc-site-mark"
    href="https://networkcanvas.com/"
    aria-label={{i18n (themePrefix "site.home")}}
  >
    <svg viewBox="0 0 131.7 131.6" aria-hidden="true" focusable="false">
      <path
        fill="#CE1E55"
        d="M19.4,27.2C19.4,12.2,31.6,0,46.6,0c7.2,0,14.1,2.9,19.2,8L27.3,46.5C22.2,41.4,19.3,34.4,19.4,27.2"
      />
      <path
        fill="#E2215B"
        d="M46.5,27.2C57.1,37.9,57,55.2,46.3,65.7C35.7,76.2,18.6,76.2,8,65.7L46.5,27.2z"
      />
      <path
        fill="#079B7F"
        d="M27.2,112.2C12.2,112.2,0,100,0,85c0-7.2,2.9-14.2,8-19.3l38.5,38.5C41.4,109.3,34.4,112.2,27.2,112.2"
      />
      <path
        fill="#00C9A2"
        d="M27.5,85.2C38.1,74.5,55.3,74.4,66,84.9s10.8,27.8,0.2,38.5c-0.1,0.1-0.2,0.2-0.2,0.2L27.5,85.2z"
      />
      <path
        fill="#F2B700"
        d="M77.3,85.2c0-15,12.2-27.2,27.2-27.2c7.2,0,14.1,2.9,19.3,8l-38.5,38.5C80.2,99.3,77.3,92.4,77.3,85.2"
      />
      <path
        fill="#DAA727"
        d="M104.5,85.2c10.6,10.6,10.6,27.8,0,38.5s-27.8,10.6-38.5,0L104.5,85.2z"
      />
      <path
        fill="#0FA3CF"
        d="M104.5,19.5c15,0,27.2,12.2,27.2,27.2c0,7.2-2.9,14.1-8,19.3L85.3,27.5C90.3,22.4,97.3,19.5,104.5,19.5"
      />
      <path
        fill="#13B3E2"
        d="M104.3,46.5c-10.6,10.7-27.8,10.8-38.5,0.2S55,18.9,65.6,8.2c0.1-0.1,0.2-0.2,0.2-0.2L104.3,46.5z"
      />
    </svg>
  </a>
</template>;

export default SiteMark;
