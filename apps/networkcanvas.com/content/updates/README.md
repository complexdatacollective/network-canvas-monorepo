# Updates

Entries on the Updates page (`/updates`). Each update is a row in
`../updates.csv` plus one Markdown file per site language in this folder.

## The row

`../updates.csv` holds what is the same in every language:

| column       | value                                                             |
| ------------ | ----------------------------------------------------------------- |
| `id`         | URL slug, also the page anchor (`/updates#<id>`)                  |
| `date`       | ISO date, `YYYY-MM-DD`                                            |
| `prominence` | `launch`, `featured`, `normal` or `mini` (see below)              |
| `apps`       | `architect`, `interviewer` and/or `fresco`, separated by `\|`     |
| `link`       | announcement page on this site; required for `launch`, else empty |

## The text

`<id>.<locale>.md`, one for every site locale: `en-US`, `es`, `zh-Hans`,
`zh-Hant`, `de`, `nl`, `pt-BR`, `it` and `fr`. `en-GB` is optional and falls
back to `en-US`; add it only where British spelling differs.

```md
# Title

Summary, in Markdown.

<!-- more -->

Details that expand below the summary, in Markdown.
```

## Prominence

Prominence sets how much of the page an update takes. Readers never see it.

| prominence | illustration | summary  | details (`<!-- more -->`) | link     |
| ---------- | ------------ | -------- | ------------------------- | -------- |
| `launch`   | required     | required | not allowed               | required |
| `featured` | required     | required | optional                  | —        |
| `normal`   | —            | required | not allowed               | —        |
| `mini`     | —            | —        | not allowed               | —        |

A link a `featured` or `normal` update needs goes in its text. Illustrations
are React components mapped by `id` in
`components/updates/illustrations/updateIllustrations.ts`.

The site will not build if any locale is missing a file, or if a row or file
breaks these rules.
