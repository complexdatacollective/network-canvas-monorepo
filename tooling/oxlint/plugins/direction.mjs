/**
 * Right-to-left rules that the shape of the code can show.
 *
 * Network Canvas lays every interface out in the reading direction, and Arabic
 * reads right to left. `tailwindcss/enforce-logical` keeps class names off the
 * physical sides; these rules cover the faults that walking each app in Arabic
 * found and that a class-name rule cannot see:
 *
 * - `inline-arrow-turns`: an arrow or chevron that points along the line of
 *   text points the other way in right-to-left.
 * - `typed-text-matches-parent`: text someone typed takes its own direction
 *   (`dir="auto"`) and still sits on the interface's side
 *   (`text-match-parent`).
 * - `logical-popup-side`: a popup placed beside its trigger names the start or
 *   end of the line, so a menu opens on the same side as the text.
 * - `base-ui-number-locale`: a Base UI component that formats numbers is told
 *   the app's language, or it formats in the browser's (and the server's).
 *
 * None of them can see: whether a value is typed text in the first place,
 * class strings kept in a constant or object, inline style objects, Motion
 * `x` values, CSS transforms, or geometry worked out in JavaScript. The
 * browser checks in `@codaco/e2e-helpers/direction-audit` cover those.
 */

// Icons whose whole meaning is a direction along the line: left or right and
// nothing else. Diagonals (`ArrowUpRight`), two-headed arrows
// (`ArrowLeftRight`) and vertical arrows mean the same in either direction.
const INLINE_ARROW =
  /^(?:Lucide)?(?:Arrow|ArrowBig|Chevron|Chevrons|Move|CircleArrow|CircleChevron|SquareArrow|SquareChevron)(?:Left|Right)(?:FromLine|ToLine|Dash)?(?:Icon)?$/;

// A class that turns the icon round in right-to-left, or fresco-ui's constant
// that carries one.
const TURNS_IN_RIGHT_TO_LEFT =
  /rtl:(?:-scale-x-100|rotate-180|-rotate-180)|inlineIconClass/;

const FORM_CONTROLS = new Set(['input', 'textarea', 'select']);

// Base UI parts that format a number with `Intl.NumberFormat`. Each takes a
// `locale`; without one it uses the runtime's, which is the browser's in a
// client and the server's in a server render.
const NUMBER_FORMATTING_PARTS = {
  'progress': { part: 'Root', always: true },
  'meter': { part: 'Root', always: true },
  'number-field': { part: 'Root', always: true },
  'slider': { part: 'Root', always: false },
};

const attribute = (node, name) =>
  node.attributes.find(
    (entry) => entry.type === 'JSXAttribute' && entry.name.name === name,
  );

/**
 * The text of an element's `className`, with every same-file string constant
 * it names spelled out: `cx(labelClasses, 'p-0')` reads as the classes in
 * `labelClasses` too. A constant imported from another file stays unread.
 */
const classText = (context, node) => {
  const className = attribute(node, 'className');
  if (!className?.value) return '';
  const text = context.sourceCode.getText(className.value);
  const constants = fileConstants(context);
  return text.replace(/[A-Za-z_$][\w$]*/g, (word) =>
    constants.has(word) ? `${word} ${constants.get(word)}` : word,
  );
};

const constantsByFile = new WeakMap();

/** Top-level `const NAME = '…'` (or a template with no expressions). */
const fileConstants = (context) => {
  const program = context.sourceCode.ast;
  const cached = constantsByFile.get(program);
  if (cached) return cached;
  const constants = new Map();
  for (const statement of program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (
      declaration?.type !== 'VariableDeclaration' ||
      declaration.kind !== 'const'
    ) {
      continue;
    }
    for (const declarator of declaration.declarations) {
      if (declarator.id.type !== 'Identifier' || !declarator.init) continue;
      const init = declarator.init;
      if (init.type === 'Literal' && typeof init.value === 'string') {
        constants.set(declarator.id.name, init.value);
      } else if (
        init.type === 'TemplateLiteral' &&
        init.expressions.length === 0
      ) {
        constants.set(declarator.id.name, init.quasis[0].value.cooked);
      }
    }
  }
  constantsByFile.set(program, constants);
  return constants;
};

const hasSpread = (node) =>
  node.attributes.some((entry) => entry.type === 'JSXSpreadAttribute');

const literalValue = (attr) => {
  if (!attr?.value) return undefined;
  if (attr.value.type === 'Literal') return attr.value.value;
  if (
    attr.value.type === 'JSXExpressionContainer' &&
    attr.value.expression.type === 'Literal'
  ) {
    return attr.value.expression.value;
  }
  return undefined;
};

const inlineArrowTurns = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'An arrow or chevron that points along the line of text turns round in right-to-left.',
    },
    messages: {
      drawn:
        '{{name}} points along the line of text, so it must point the other way right to left: add `rtl:-scale-x-100` (or fresco-ui’s `inlineIconClass`). If it means a physical side, disable this rule on the line and say so.',
      passed:
        '{{name}} is passed on as a component, where nothing here can turn it round right to left. Turn it where it is drawn, or disable this rule on the line and say what turns it (or that it means a physical side).',
    },
    schema: [],
  },
  create(context) {
    const arrows = new Set();
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'lucide-react') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            INLINE_ARROW.test(specifier.imported.name)
          ) {
            arrows.add(specifier.local.name);
          }
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || !arrows.has(node.name.name)) {
          return;
        }
        if (!TURNS_IN_RIGHT_TO_LEFT.test(classText(context, node))) {
          context.report({
            node,
            messageId: 'drawn',
            data: { name: node.name.name },
          });
        }
      },
      // JSX names are JSXIdentifier nodes, so an Identifier is a use as a
      // value: a map entry, a prop, `motion.create(ChevronRight)`.
      Identifier(node) {
        if (!arrows.has(node.name)) return;
        const parent = node.parent;
        if (
          parent?.type === 'ImportSpecifier' ||
          parent?.type === 'ImportDefaultSpecifier'
        ) {
          return;
        }
        // `inlineIconClass(ChevronRight)` asks for the class that turns it.
        if (
          parent?.type === 'CallExpression' &&
          parent.callee.type === 'Identifier' &&
          parent.callee.name === 'inlineIconClass'
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'passed',
          data: { name: node.name },
        });
      },
    };
  },
};

const typedTextMatchesParent = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Text that takes its own direction still sits on the interface’s side.',
    },
    messages: {
      missing:
        '`dir="auto"` lets this text read in its own direction, which also moves it to its own side: a Latin name goes to the far left of a right-to-left row. Add `text-match-parent` so it starts where the interface’s text starts.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (literalValue(attribute(node, 'dir')) !== 'auto') return;
        if (
          node.name.type === 'JSXIdentifier' &&
          FORM_CONTROLS.has(node.name.name)
        ) {
          return;
        }
        const className = attribute(node, 'className');
        if (!className && hasSpread(node)) return;
        if (!/\btext-match-parent\b/.test(classText(context, node))) {
          context.report({ node, messageId: 'missing' });
        }
      },
    };
  },
};

const logicalPopupSide = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A popup beside its trigger is placed at the start or end of the line.',
    },
    messages: {
      physical:
        '`side="{{side}}"` stays on the {{side}} when the interface mirrors, so in right-to-left the popup opens away from the text. Use `side="{{logical}}"`.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'side') return;
        const side = literalValue(node);
        if (side !== 'left' && side !== 'right') return;
        context.report({
          node,
          messageId: 'physical',
          data: {
            side,
            logical: side === 'left' ? 'inline-start' : 'inline-end',
          },
        });
      },
    };
  },
};

const baseUiNumberLocale = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Base UI components that format numbers are given the app’s language.',
    },
    messages: {
      missing:
        '{{name}} formats numbers in the runtime’s language unless it is given `locale`: the server and the browser then disagree (a hydration mismatch) and the digits ignore the app’s language. Pass the app’s locale, such as `locale={intl.locale}`.',
    },
    schema: [],
  },
  create(context) {
    // local namespace name -> rule for its Root
    const namespaces = new Map();
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string' || !source.startsWith('@base-ui/react'))
          return;
        const subpath = source.split('/')[2];
        for (const specifier of node.specifiers) {
          const key =
            subpath ??
            (specifier.type === 'ImportSpecifier'
              ? specifier.imported.name
                  .replace(/([a-z])([A-Z])/g, '$1-$2')
                  .toLowerCase()
              : undefined);
          const entry = key ? NUMBER_FORMATTING_PARTS[key] : undefined;
          if (entry) namespaces.set(specifier.local.name, entry);
        }
      },
      JSXOpeningElement(node) {
        if (
          node.name.type !== 'JSXMemberExpression' ||
          node.name.object.type !== 'JSXIdentifier'
        ) {
          return;
        }
        const entry = namespaces.get(node.name.object.name);
        if (!entry || node.name.property.name !== entry.part) return;
        if (!entry.always && !attribute(node, 'format')) return;
        if (attribute(node, 'locale') || hasSpread(node)) return;
        context.report({
          node,
          messageId: 'missing',
          data: {
            name: `${node.name.object.name}.${node.name.property.name}`,
          },
        });
      },
    };
  },
};

export default {
  meta: { name: 'direction' },
  rules: {
    'inline-arrow-turns': inlineArrowTurns,
    'typed-text-matches-parent': typedTextMatchesParent,
    'logical-popup-side': logicalPopupSide,
    'base-ui-number-locale': baseUiNumberLocale,
  },
};
