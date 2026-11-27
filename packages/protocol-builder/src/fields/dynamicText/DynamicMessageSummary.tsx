import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
} from 'react';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import { useInterfaceLanguage } from '@codaco/fresco-ui/interfaceLanguage';
import {
  markdownElementsFor,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  type ContentNodes,
  type LocaleTag,
  type MessageNode,
  type MessageSwitch,
  messageStructure,
  readContentDocument,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import {
  asConditionDraft,
  conditionAboutChoices,
  conditionCodebook,
  conditionSentence,
} from '../../localization/conditionText.ts';
import {
  resolveStoredTranslation,
  resolveTranslation,
} from '../../localization/localizedText.ts';
import {
  branchesOfLogic,
  metaOfLogic,
} from '../../localization/messageDocument.ts';
import { useEditingLanguage } from '../../localization/ProtocolLocalization.tsx';
import { VariablePill, type VariablePillProps } from '../VariablePill.tsx';
import { logicOptionLabel } from './logicOptions.ts';
import type { DynamicMessageSite } from './messageSite.ts';
import { namingFor } from './valueNaming.ts';
import { logicVersionLabel } from './versionLabels.ts';

/** The first of the private-use characters that hold a value's place. */
const VALUE_MARK = 0xf0000;

/** The property a value's place is recorded under once markdown is read. */
const VALUE_PROPERTY = 'dataDynamicValue';

/**
 * Splits the text the markdown was read into at each character holding a
 * value's place, leaving an empty `span` that records which value it is. Runs
 * on the finished structure, where an author's words are text only, so
 * nothing an author wrote can claim to be a value.
 */
const splitValueMarks = (node: unknown): void => {
  if (!isRecord(node) || !Array.isArray(node.children)) return;
  node.children = node.children.flatMap((child: unknown): unknown[] => {
    if (
      !isRecord(child) ||
      child.type !== 'text' ||
      typeof child.value !== 'string'
    ) {
      splitValueMarks(child);
      return [child];
    }
    const parts: unknown[] = [];
    let text = '';
    for (const character of child.value) {
      const index = (character.codePointAt(0) ?? 0) - VALUE_MARK;
      if (index < 0) {
        text += character;
        continue;
      }
      if (text !== '') parts.push({ type: 'text', value: text });
      text = '';
      parts.push({
        type: 'element',
        tagName: 'span',
        properties: { [VALUE_PROPERTY]: String(index) },
        children: [],
      });
    }
    if (text !== '') parts.push({ type: 'text', value: text });
    return parts;
  });
};

const valueMarkPlugin = () => splitValueMarks;
const SUMMARY_REHYPE_PLUGINS = [valueMarkPlugin];

/**
 * How markdown spread over several lines is drawn: which elements it keeps
 * and how it draws them. A host with rules of its own, such as a table cell
 * that draws headings as bold lines, passes its own.
 */
export type BlockMarkdown = Readonly<{
  allowedElements: readonly string[];
  components?: ComponentProps<typeof RenderMarkdown>['components'];
  /** How a file the text holds as a block is drawn; without it, it is not. */
  blockImages?: ComponentProps<typeof RenderMarkdown>['blockImages'];
}>;

const SECTION_MARKDOWN: BlockMarkdown = {
  allowedElements: markdownElementsFor(false),
};
const LABEL_MARKDOWN: BlockMarkdown = {
  allowedElements: markdownElementsFor(true),
};

/**
 * How a summary draws the value its markdown marked with a character of its
 * own, by that character's position among the message's values. Read through
 * a context so the span component below is defined once, at module level.
 */
const SummaryValueContext = createContext<(index: number) => ReactNode>(
  () => undefined,
);

/** The span markdown wraps a marked value in, drawn as its pill. */
function SummaryValueSpan({
  node,
  children,
}: Readonly<{
  node?: { properties?: Record<string, unknown> } | undefined;
  children?: ReactNode;
}>) {
  const shownValue = useContext(SummaryValueContext);
  const index = node?.properties?.[VALUE_PROPERTY];
  if (typeof index !== 'string') return <span>{children}</span>;
  // A character past the values is the author's own, kept as is.
  return (
    shownValue(Number(index)) ??
    String.fromCodePoint(VALUE_MARK + Number(index))
  );
}

/**
 * The one set of versions a message is made of, with nothing but whitespace
 * around it, or undefined when it is anything else.
 */
const wholeSwitch = (
  nodes: readonly MessageNode[],
): MessageSwitch | undefined => {
  const only = nodes.filter(
    (node) => !(node.kind === 'text' && node.text.trim() === ''),
  );
  const [one] = only;
  return only.length === 1 && one?.kind === 'switch' ? one : undefined;
};

/** A value's pill, inside a line of text. */
const pill = (props: VariablePillProps, key: number) => (
  <VariablePill key={key} {...props} size="inline" />
);

/**
 * A message's words, read-only, each value as the pill an editor shows, and
 * each set of versions of wording that Network Canvas supplies folded to the
 * pill of the value it is on.
 */
export function MessageNodesSummary({
  nodes,
  markdown,
  multiline,
  blockMarkdown = SECTION_MARKDOWN,
  valuePill,
  switchPill,
  versionLabel,
}: Readonly<{
  nodes: readonly MessageNode[];
  /** Whether the words are markdown, drawn here with their formatting. */
  markdown: boolean;
  /** Whether the text's field holds several lines. */
  multiline: boolean;
  /** How markdown in a field of several lines draws its blocks. */
  blockMarkdown?: BlockMarkdown;
  /** The pill of a value, by the name the message gives it. */
  valuePill: (argument: string) => VariablePillProps;
  /** The pill of a set of versions. */
  switchPill?: (node: MessageSwitch) => VariablePillProps;
  /**
   * What a version of a set is called, for a set that is the whole of the
   * message, or of one version of it: that set is written out, one labelled
   * line for each version. Without this, every set is a pill.
   */
  versionLabel?: (node: MessageSwitch, key: string) => string;
}>) {
  const elements = multiline ? blockMarkdown : LABEL_MARKDOWN;
  const allowedElements = [...elements.allowedElements, 'span'];
  const labelLanguage = useInterfaceLanguage();

  function render(
    levelNodes: readonly MessageNode[],
    plural: string | undefined,
  ): ReactNode {
    const whole =
      versionLabel === undefined ? undefined : wholeSwitch(levelNodes);
    if (whole !== undefined && versionLabel !== undefined) {
      return (
        <span data-versions-summary="" className="flex flex-col gap-1.5">
          {whole.versions.map((version) => (
            <span
              key={version.key}
              data-version-summary={version.key}
              className="flex flex-col"
            >
              {/* The interface's words, inside the protocol's text. */}
              <span
                {...labelLanguage}
                className="text-xs font-semibold text-current/70"
              >
                {versionLabel(whole, version.key)}
              </span>
              <span
                className={
                  wholeSwitch(version.nodes)
                    ? 'border-s border-current/20 ps-3'
                    : undefined
                }
              >
                {render(
                  version.nodes,
                  whole.type === 'plural' ? whole.argument : undefined,
                )}
              </span>
            </span>
          ))}
        </span>
      );
    }
    const held: (string | MessageSwitch)[] = [];
    let source = '';
    for (const node of levelNodes) {
      if (node.kind === 'text') {
        source += node.text;
      } else if (node.kind === 'count' && plural === undefined) {
        source += '#';
      } else {
        source += String.fromCodePoint(VALUE_MARK + held.length);
        held.push(
          node.kind === 'switch'
            ? node
            : node.kind === 'argument'
              ? node.name
              : (plural ?? ''),
        );
      }
    }
    const shown = (index: number, at: number): ReactNode => {
      const piece = held[index];
      if (piece === undefined) return undefined;
      if (typeof piece === 'string') return pill(valuePill(piece), at);
      return pill(switchPill?.(piece) ?? valuePill(piece.argument), at);
    };
    if (markdown) {
      return (
        <SummaryValueContext value={(index) => shown(index, 0)}>
          <RenderMarkdown
            allowedElements={allowedElements}
            rehypePlugins={SUMMARY_REHYPE_PLUGINS}
            components={{ ...elements.components, span: SummaryValueSpan }}
            blockImages={elements.blockImages}
          >
            {source}
          </RenderMarkdown>
        </SummaryValueContext>
      );
    }
    return Array.from(source).map(
      (character, index) =>
        shown((character.codePointAt(0) ?? 0) - VALUE_MARK, index) ?? character,
    );
  }

  return <>{render(nodes, undefined)}</>;
}

/**
 * One translation of text with values, read-only, for a place that shows
 * text rather than editing it (a cell of the translation table): its words,
 * with each value as a pill, and each logic block as its branches, each
 * labelled with the case in which it is shown.
 */
export function DynamicMessageSummary({
  message,
  markdown,
  multiline,
  locale,
  site,
  blockMarkdown,
  fieldSummary,
}: Readonly<{
  message: string;
  /** Whether the words are markdown, drawn here with their formatting. */
  markdown: boolean;
  /**
   * Whether the text's field holds several lines, so that its markdown is
   * drawn with its blocks, as its editor draws them.
   */
  multiline: boolean;
  /** How markdown with blocks is drawn (see `MessageNodesSummary`). */
  blockMarkdown?: BlockMarkdown;
  locale: LocaleTag;
  site: Pick<
    DynamicMessageSite,
    'context' | 'conditions' | 'dynamicAttributes'
  >;
  /** How a field of a form is drawn, for the text of a form. */
  fieldSummary?: (fieldId: string) => ReactNode;
}>) {
  const intl = useAppIntl();
  const { localization } = useEditingLanguage();
  const labelLanguage = useInterfaceLanguage();
  const appDirection = useAppDirection();
  const { context } = site;
  const conditionValues = site.conditions?.values ?? {};
  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;
  const naming = namingFor(intl, {
    context,
    codebook: site.conditions?.codebook,
    conditions: conditionValues,
    dynamicAttributes: site.dynamicAttributes?.values ?? {},
    labelText,
    wordingOf: (wording) =>
      resolveStoredTranslation(wording, localization, locale),
    interfaceLanguage: { lang: intl.locale, dir: appDirection },
  });
  const valuePill = (argument: string) => naming.pillFor(argument);

  const lines = (nodes: readonly MessageNode[]) => (
    <MessageNodesSummary
      nodes={nodes}
      markdown={markdown}
      multiline={multiline}
      {...(blockMarkdown !== undefined && { blockMarkdown })}
      valuePill={valuePill}
    />
  );

  if (!(markdown && multiline)) {
    const structure = messageStructure(message);
    if (!('nodes' in structure)) return <>{message}</>;
    return lines(structure.nodes);
  }

  const document = readContentDocument(message);
  if (document.problems.length > 0) {
    const structure = messageStructure(message);
    return 'nodes' in structure ? lines(structure.nodes) : <>{message}</>;
  }

  const subject = site.conditions?.subject;
  const aboutChoices = conditionAboutChoices(context, subject);
  const sentence = (conditionId: string) => {
    const condition = asConditionDraft(
      Object.hasOwn(conditionValues, conditionId)
        ? conditionValues[conditionId]
        : undefined,
    );
    return conditionSentence(condition, {
      codebook: conditionCodebook(
        site.conditions?.codebook,
        subject,
        condition.about ?? aboutChoices[0],
        true,
      ),
      intl,
      localization,
      locale,
    });
  };

  const renderNodes = (nodes: ContentNodes): ReactNode =>
    nodes.map((node, index) => {
      switch (node.kind) {
        case 'markdown':
          return <div key={index}>{lines(node.nodes)}</div>;
        case 'field':
          return (
            <div key={index} data-field-summary={node.fieldId}>
              {fieldSummary?.(node.fieldId)}
            </div>
          );
        case 'logic': {
          const meta = metaOfLogic(node.logic);
          const option =
            meta.kind === 'conditions'
              ? node.logic.kind === 'conditions' &&
                node.logic.versions[0]?.when === 'notMet'
                ? 'ifNot'
                : 'if'
              : meta.kind;
          let rowIndex = -1;
          return (
            <div
              key={index}
              data-logic-summary={meta.kind}
              className="border-info/40 my-2 flex flex-col gap-2 border-s-2 ps-3"
            >
              <span
                {...labelLanguage}
                className="text-xs font-semibold text-current/70"
              >
                {logicOptionLabel(intl, option, 'content')}
                {(meta.kind === 'answers' || meta.kind === 'number') && (
                  <>
                    {': '}
                    <VariablePill {...valuePill(meta.value)} size="inline" />
                  </>
                )}
              </span>
              {branchesOfLogic(node.logic).map((branch) => {
                if (branch.meta !== null) rowIndex += 1;
                return (
                  <div
                    key={branch.key}
                    data-branch-summary={branch.key}
                    className="flex flex-col"
                  >
                    <span
                      {...labelLanguage}
                      className="text-info text-xs font-semibold"
                    >
                      {logicVersionLabel(
                        {
                          intl,
                          naming,
                          locale,
                          conditionSentence: sentence,
                          hasCondition: (conditionId) =>
                            Object.hasOwn(conditionValues, conditionId),
                        },
                        meta,
                        branch.key,
                        branch.meta ?? undefined,
                        Math.max(rowIndex, 0),
                      )}
                    </span>
                    <div>{renderNodes(branch.content)}</div>
                  </div>
                );
              })}
            </div>
          );
        }
        default: {
          const unhandled: never = node;
          throw new Error('Unhandled content node', { cause: unhandled });
        }
      }
    });

  return <>{renderNodes(document.nodes)}</>;
}
