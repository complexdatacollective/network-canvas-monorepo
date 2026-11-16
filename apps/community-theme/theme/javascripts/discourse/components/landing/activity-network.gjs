import Component from "@glimmer/component";
import { htmlSafe } from "@ember/template";
import { avatarUrl } from "discourse/lib/avatar-utils";
import { i18n } from "discourse-i18n";
import { themePrefix } from "virtual:theme";
import { layoutActivityNetwork } from "../../lib/activity-network";

const WIDTH = 400;
const HEIGHT = 300;
const CLIP_ID = "nc-activity-network-avatar";

// Category colours are stored as bare hex.
const HEX_COLOR = /^(?:[0-9a-f]{3}){1,2}$/i;

/**
 * Recent discussions and the people who posted in them, drawn as the kind of
 * network Network Canvas collects: each discussion a dot in its category's
 * colour, each person their avatar, linked to the discussions they joined.
 * The latest discussions list beside it carries the same information as
 * text, so the drawing is one image with a text alternative.
 *
 * @param {Array<{ id: number, title: string, color: string, posterIds: number[] }>} topics
 * @param {Map<number, { username: string, avatar_template: string }>} users
 */
export default class ActivityNetwork extends Component {
  get layout() {
    const layout = layoutActivityNetwork(this.args.topics, {
      width: WIDTH,
      height: HEIGHT,
    });
    const topics = new Map(this.args.topics.map((topic) => [topic.id, topic]));
    return {
      links: layout.links,
      topics: layout.topics.map((placed) => {
        const topic = topics.get(placed.id);
        return {
          ...placed,
          title: topic.title,
          style: HEX_COLOR.test(topic.color)
            ? htmlSafe(`fill: #${topic.color}`)
            : undefined,
        };
      }),
      people: layout.people.flatMap((placed) => {
        const user = this.args.users.get(placed.id);
        if (!user) {
          return [];
        }
        const radius = placed.hub ? 18 : 14;
        return {
          ...placed,
          radius,
          ringRadius: radius + 2.5,
          username: user.username,
          avatar: avatarUrl(user.avatar_template, "medium"),
          left: placed.x - radius,
          top: placed.y - radius,
          size: radius * 2,
        };
      }),
    };
  }

  <template>
    <svg
      class="nc-activity-network"
      viewBox="0 0 {{WIDTH}} {{HEIGHT}}"
      role="img"
      aria-label={{i18n (themePrefix "landing.activity.network.label")}}
    >
      <defs>
        <clipPath id={{CLIP_ID}} clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
      <g class="nc-activity-network__links">
        {{#each this.layout.links as |link|}}
          <line x1={{link.x1}} y1={{link.y1}} x2={{link.x2}} y2={{link.y2}} />
        {{/each}}
      </g>
      <g class="nc-activity-network__topics">
        {{#each this.layout.topics as |topic|}}
          <circle cx={{topic.x}} cy={{topic.y}} r="11" style={{topic.style}}>
            <title>{{topic.title}}</title>
          </circle>
        {{/each}}
      </g>
      <g class="nc-activity-network__people">
        {{#each this.layout.people as |person|}}
          <g class={{if person.hub "is-hub"}}>
            <title>{{person.username}}</title>
            <circle
              class="nc-activity-network__ring"
              cx={{person.x}}
              cy={{person.y}}
              r={{person.ringRadius}}
            />
            <image
              href={{person.avatar}}
              x={{person.left}}
              y={{person.top}}
              width={{person.size}}
              height={{person.size}}
              clip-path="url(#{{CLIP_ID}})"
            />
          </g>
        {{/each}}
      </g>
    </svg>
  </template>
}
