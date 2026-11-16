# Simplified Chinese (zh-Hans) terminology glossary

How Network Canvas names its concepts and interfaces in Simplified Chinese. It
applies to every surface with Simplified Chinese text: the apps' and packages'
catalogs, networkcanvas.com, the documentation and protocol text. Translate
with it, and review translations against it. The terms come from the Simplified
Chinese the apps already ship, so a page names a screen, button or setting the
way the reader sees it in the app.

This glossary is new and holds only the terms decided so far. When a
translation needs a term that is not here, look for it in the catalogs first
(`apps/*/src/locales/zh-Hans.json`, `packages/*/src/locales/zh-Hans.json`),
then add it here in the same change. A new or changed entry is verified like
any translation (see the `verifying-translations` skill), and catalog strings
that use an old term change with it. Traditional Chinese has its own glossary,
`zh-Hant.md`; keep the two in step.

## Register and typography

- Address the reader as 您, as the apps do.
- Full-width punctuation in Chinese text, including brackets: "协议架构（schema）".
  No space next to full-width punctuation.
- Quote interface text with “ ” (U+201C, U+201D; nested ‘ ’), as the catalogs do.
- One half-width space between Chinese characters and Latin letters, digits,
  inline code or a link: "架构版本 8", "Network Canvas 协议",
  "`.netcanvas` 文件".

## Never translated

Network Canvas, Architect, Interviewer, Fresco, Studio, file formats
(`.netcanvas`, CSV, GraphML), the name JSON Schema, and anything inside code
blocks or inline code. "Architect" is never written 架构师 and never shortened to
架构.

## Concepts

| English  | Simplified Chinese | Notes                                                                                                                                                              |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| protocol | 协议               | Only the interview design file (`.netcanvas`). A network protocol is named ("HTTPS"), or 网络协议 when generic. A licence is 许可证 and terms of use are 使用条款. |
| schema   | 架构               | The protocol file format specification; schema 8 and schema 9 are its versions. Never bare (see below). Never 模式, 结构描述 or 结构定义.                          |

## Writing about the schema

架构 is the term the apps ship ("架构版本 {version}", "升级到架构版本 {version}"), and the one Microsoft (XML 架构, Active Directory 架构) and Google BigQuery (表架构) use for "schema". Database textbooks use 模式; we deliberately do not, because the apps already use 模式 for "mode" (只读模式) and "pattern" (遗传模式).

Without context a reader takes 架构 as "architecture", even in 协议架构 or
架构版本; the forms below are clearer once the English has been given. App
catalogs carry no gloss, so prefer the version forms there.

These rules apply wherever 架构 renders "schema", app catalogs included:

- **Never bare.** 架构 is directly preceded by 协议 (协议架构) or
  directly followed by 版本 or by a space and a version number (架构版本,
  "架构 9"). Prefer the version forms. Not "新架构", "该架构", "升级架构", "架构验证", "架构迁移", "此协议的架构".
- **Common phrases:** "升级到架构版本 9", "迁移到架构版本 9", "较新的架构版本", "较旧的架构版本", "不支持的架构版本", "根据协议架构验证协议". The protocol is what is upgraded, migrated or validated: "将协议升级到架构版本 9", never "升级协议架构" or "协议架构验证". Follow the English verb, "upgrade" as 升级 and "migrate" as 迁移, except when naming the action of an app's button, which takes the button's verb (升级).
- **In sentences, write 架构版本 N**: "采用架构版本 8 的协议", "将协议升级到架构版本 9". "架构 N" is for
  headings, tables and short labels ("架构 8 功能"), and only where
  that heading, table row or label names no app version.

Do not use 架构 for anything but the schema. Architecture is named by the platform ("x64", "ARM64") or written 处理器体系结构, 系统体系结构. Do not write 协议结构, one character away from 协议架构; name the parts of a protocol instead.

On documentation and website pages, Updates posts and release notes, also:

- **Gloss once per page**, on the first mention in the page's own words (not a heading, not quoted
  interface text), with the English source term: "协议架构（schema）", "架构版本（schema version）",
  "架构版本 9（schema 9）". One gloss covers every form on the page. Never
  "架构（schema）". If every mention is a heading or quoted interface text, add a sentence
  that carries the gloss.
