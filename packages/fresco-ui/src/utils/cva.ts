import { clsx } from 'clsx';
import type { ClassValue, CVAComponentShape } from 'cva';
import { defineConfig } from 'cva/config';
import { twMerge } from 'tailwind-merge';

export const { cva, cx } = defineConfig({
  cx: (...inputs) => twMerge(clsx(inputs)),
});

export type { VariantProps } from 'cva';

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type ComposedVariantProps<Components extends readonly CVAComponentShape[]> =
  UnionToIntersection<
    {
      [K in keyof Components]: Omit<
        NonNullable<Parameters<Components[K]>[0]>,
        'class' | 'className'
      >;
    }[number]
  >;

type ClassProps = { class?: ClassValue; className?: ClassValue };

/**
 * @deprecated Use `cva({ composes: [a, b] })` instead.
 *
 * cva 1.0.0-beta.11 removed `compose`. This keeps the export that published
 * consumers of `@codaco/fresco-ui/utils/cva` (including released
 * `@codaco/interview` versions) still import, with its beta.10 behaviour:
 * each component is called with the caller's defined variant props, so each
 * falls back to its own `defaultVariants`, then `class`/`className` are
 * appended and the result passes through `cx`.
 */
export const compose =
  <const Components extends readonly CVAComponentShape[]>(
    ...components: Components
  ) =>
  (props?: ComposedVariantProps<Components> & ClassProps): string => {
    const input: Record<string, unknown> = { ...props };
    const forwarded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'class' && key !== 'className' && value !== undefined) {
        forwarded[key] = value;
      }
    }
    return cx(
      ...components.map((component: CVAComponentShape) =>
        component({ ...forwarded }),
      ),
      props?.class,
      props?.className,
    );
  };
