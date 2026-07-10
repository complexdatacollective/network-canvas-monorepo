import {
  createContext,
  createElement,
  type ComponentType,
  type ReactNode,
  useContext,
} from 'react';
import type { WrappedFieldProps } from 'redux-form';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField, {
  type ArrayFieldEditorProps,
  type ArrayFieldItemProps,
  type ArrayFieldProps,
} from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';

import { getReduxFieldErrorState } from './reduxFieldMeta';

type ArrayItem = Record<string, unknown>;
type Renderer = ComponentType<Record<string, unknown>>;

export type FrescoReduxArrayFieldItemProps<T extends ArrayItem> =
  ArrayFieldItemProps<T> & {
    arrayName: string;
    fieldName: string;
    form: string;
    showErrors: boolean;
  };

export type FrescoReduxArrayFieldEditorProps<T extends ArrayItem> =
  ArrayFieldEditorProps<T> & {
    arrayName: string;
    fieldName: string | null;
    form: string;
    showErrors: boolean;
  };

type RendererContextValue = {
  arrayName: string;
  editorComponent?: Renderer;
  editorComponentProps?: Record<string, unknown>;
  form: string;
  itemComponent: Renderer;
  itemComponentProps?: Record<string, unknown>;
  showErrors: boolean;
};

const RendererContext = createContext<RendererContextValue | null>(null);

const useRendererContext = () => {
  const context = useContext(RendererContext);
  if (!context) {
    throw new Error(
      'FrescoReduxArrayField renderers must be used inside the adapter.',
    );
  }
  return context;
};

const ItemRenderer = (props: ArrayFieldItemProps<ArrayItem>) => {
  const context = useRendererContext();
  return createElement(context.itemComponent, {
    ...context.itemComponentProps,
    ...props,
    arrayName: context.arrayName,
    fieldName: `${context.arrayName}[${props.index}]`,
    form: context.form,
    showErrors: context.showErrors,
  });
};

const EditorRenderer = (props: ArrayFieldEditorProps<ArrayItem>) => {
  const context = useRendererContext();
  if (!context.editorComponent) return null;

  return createElement(context.editorComponent, {
    ...context.editorComponentProps,
    ...props,
    arrayName: context.arrayName,
    fieldName:
      props.index === null ? null : `${context.arrayName}[${props.index}]`,
    form: context.form,
    showErrors: context.showErrors,
  });
};

type FrescoReduxArrayFieldOwnProps<T extends ArrayItem> = Omit<
  ArrayFieldProps<T>,
  'value' | 'onChange' | 'itemComponent' | 'editorComponent'
> & {
  editorComponent?: ComponentType<FrescoReduxArrayFieldEditorProps<T>>;
  editorComponentProps?: Record<string, unknown>;
  hint?: ReactNode;
  itemComponent: ComponentType<FrescoReduxArrayFieldItemProps<T>>;
  itemComponentProps?: Record<string, unknown>;
  label?: string;
};

export type FrescoReduxArrayFieldProps<T extends ArrayItem> =
  WrappedFieldProps & FrescoReduxArrayFieldOwnProps<T>;

export function FrescoReduxArrayFieldBase<T extends ArrayItem>({
  input,
  meta,
  itemComponent,
  itemComponentProps,
  editorComponent,
  editorComponentProps,
  label,
  hint,
  disabled,
  readOnly,
  ...arrayFieldProps
}: FrescoReduxArrayFieldProps<T>) {
  const { errors, showErrors } = getReduxFieldErrorState(meta);
  const value = Array.isArray(input.value) ? (input.value as T[]) : [];
  const rendererContext: RendererContextValue = {
    arrayName: input.name,
    editorComponent: editorComponent as unknown as Renderer | undefined,
    editorComponentProps,
    form: meta.form,
    itemComponent: itemComponent as unknown as Renderer,
    itemComponentProps,
    showErrors,
  };

  // Indexed child fields own focus state. Forwarding their bubbling focus and
  // blur events makes Redux Form store conflicting metadata shapes at one path.
  return (
    <RendererContext.Provider value={rendererContext}>
      <UnconnectedField
        {...arrayFieldProps}
        component={ArrayField<T>}
        name={input.name}
        label={label ?? input.name}
        hint={hint}
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        onChange={(nextValue) => input.onChange(nextValue ?? [])}
        errors={errors}
        showErrors={showErrors}
        aria-invalid={showErrors}
        itemComponent={ItemRenderer as ComponentType<ArrayFieldItemProps<T>>}
        editorComponent={
          editorComponent
            ? (EditorRenderer as ComponentType<ArrayFieldEditorProps<T>>)
            : undefined
        }
      />
    </RendererContext.Provider>
  );
}

const FrescoReduxArrayField =
  FrescoReduxArrayFieldBase as ComponentType<WrappedFieldProps> &
    ComponentType<Record<string, unknown>>;

export default FrescoReduxArrayField;
