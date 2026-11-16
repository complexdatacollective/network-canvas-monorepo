# Traditional Chinese (zh-Hant) terminology glossary

How Network Canvas names its concepts and interfaces in Traditional Chinese.
It applies to every surface with Traditional Chinese text: the apps' and
packages' catalogs, networkcanvas.com, the documentation and protocol text.
Translate with it, and review translations against it. The terms come from the
Traditional Chinese the apps already ship, so a page names a screen, button or
setting the way the reader sees it in the app.

This glossary is new and holds only the terms decided so far. When a
translation needs a term that is not here, look for it in the catalogs first
(`apps/*/src/locales/zh-Hant.json`, `packages/*/src/locales/zh-Hant.json`),
then add it here in the same change. A new or changed entry is verified like
any translation (see the `verifying-translations` skill), and catalog strings
that use an old term change with it. Simplified Chinese has its own glossary,
`zh-Hans.md`; keep the two in step.

## Register and typography

- Address the reader as 您, as the apps do.
- Full-width punctuation in Chinese text, including brackets: "協定架構（schema）".
  No space next to full-width punctuation.
- Quote interface text with 「」 (nested 『』), as the catalogs do.
- One half-width space between Chinese characters and Latin letters, digits,
  inline code or a link: "架構版本 8", "Network Canvas 協定",
  "`.netcanvas` 檔案".

## Never translated

Network Canvas, Architect, Interviewer, Fresco, Studio, file formats
(`.netcanvas`, CSV, GraphML), the name JSON Schema, and anything inside code
blocks or inline code. "Architect" is never written 架構師 and never shortened to
架構.

## Concepts

| English  | Traditional Chinese | Notes                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| protocol | 協定                | On its own, only the interview design file (`.netcanvas`); 協定 is Taiwan's technical term, as in 通訊協定. Not 協議, the mainland technical term. Never use 協定 for an agreement; write 協議 there. A network protocol is named ("HTTPS"), or 通訊協定 when generic. A licence is 授權, terms of use 使用條款. |
| schema   | 架構                | The protocol file format specification; schema 8 and schema 9 are its versions. Never bare (see below). Never 模式, 結構描述, 結構定義 or 綱要.                                                                                                                                                                  |

## Writing about the schema

架構 is the term the apps ship ("架構版本 {version}", "升級至架構版本 {version}"), and it matches Simplified Chinese 架构. That consistency is the reason for it: Taiwan technical writing more often uses 結構描述 (Microsoft's SQL Server documentation) or 結構定義 (Google), with 架構 in some of Microsoft's .NET documentation ("XML 架構"). Not 模式, which the apps already use for "mode" (唯讀模式) and "pattern" (遺傳模式).

Without context a reader takes 架構 as "architecture", even in 協定架構 or
架構版本; the forms below are clearer once the English has been given. App
catalogs carry no gloss, so prefer the version forms there.

These rules apply wherever 架構 renders "schema", app catalogs included:

- **Never bare.** 架構 is directly preceded by 協定 (協定架構) or
  directly followed by 版本 or by a space and a version number (架構版本,
  "架構 9"). Prefer the version forms. Not "新架構", "該架構", "升級架構", "架構驗證", "架構移轉", "此協定的架構".
- **Common phrases:** "升級至架構版本 9", "移轉至架構版本 9", "較新的架構版本", "較舊的架構版本", "不支援的架構版本", "檢查協定是否符合協定架構" (never 驗證 directly before 協定, which reads as 驗證協定, "authentication protocol"). The protocol is what is upgraded, migrated or validated: "將協定升級至架構版本 9", never "升級協定架構" or "協定架構驗證". Follow the English verb, "upgrade" as 升級 and "migrate" as 移轉, except when naming the action of an app's button, which takes the button's verb (升級).
- **In sentences, write 架構版本 N**: "採用架構版本 8 的協定", "將協定升級至架構版本 9". "架構 N" is for
  headings, tables and short labels ("架構 8 功能"), and only where
  that heading, table row or label names no app version.

Outside the schema, 架構 appears only in 處理器架構 and 系統架構 ("architecture"), and naming the platform ("x64", "ARM64") is better still. Never write 架構 alone for "architecture" or "framework". Do not write 協定結構, one character away from 協定架構; name the parts of a protocol instead.

On documentation and website pages, Updates posts and release notes, also:

- **Gloss once per page**, on the first mention in the page's own words (not a heading, not quoted
  interface text), with the English source term: "協定架構（schema）", "架構版本（schema version）",
  "架構版本 9（schema 9）". One gloss covers every form on the page. Never
  "架構（schema）". If every mention is a heading or quoted interface text, add a sentence
  that carries the gloss.
