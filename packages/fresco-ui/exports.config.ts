// Public API allowlist for @codaco/fresco-ui.
//
// Each entry is { subpath, source }:
//   - `subpath` is what consumers import (`./Button` → `@codaco/fresco-ui/Button`)
//   - `source` is the file under `src/` that the entry resolves to
//
// Keep this list curated and minimal. Anything NOT listed here is treated as
// private and not added to package.json `exports` — even if it's compiled into
// dist by Vite. This is how subsystem internals stay package-private.

export type ExportEntry = { subpath: string; source: string };

export const exportEntries: ExportEntry[] = [
	// Primitives
	{ subpath: "./Alert", source: "Alert.tsx" },
	{ subpath: "./badge", source: "badge.tsx" },
	{ subpath: "./NativeLink", source: "NativeLink.tsx" },
	{ subpath: "./Pips", source: "Pips.tsx" },
	{ subpath: "./ProgressBar", source: "ProgressBar.tsx" },
	{ subpath: "./RenderMarkdown", source: "RenderMarkdown.tsx" },
	{ subpath: "./ResizableFlexPanel", source: "ResizableFlexPanel.tsx" },
	{ subpath: "./RichTextRenderer", source: "RichTextRenderer.tsx" },
	{ subpath: "./ScrollArea", source: "ScrollArea.tsx" },
	{ subpath: "./skeleton", source: "skeleton.tsx" },
	{ subpath: "./Spinner", source: "Spinner.tsx" },
	{ subpath: "./TimeAgo", source: "TimeAgo.tsx" },

	// Button
	{ subpath: "./Button", source: "Button.tsx" },
	{ subpath: "./CloseButton", source: "CloseButton.tsx" },

	// Icon (and friends)
	{ subpath: "./Icon", source: "Icon.tsx" },
	{ subpath: "./Node", source: "Node.tsx" },
	{ subpath: "./Toast", source: "Toast.tsx" },

	// Modal
	{ subpath: "./Modal", source: "Modal/Modal.tsx" },
	{ subpath: "./Modal/ModalPopup", source: "Modal/ModalPopup.tsx" },

	// Radix primitives
	{ subpath: "./dropdown-menu", source: "dropdown-menu.tsx" },
	{ subpath: "./popover", source: "popover.tsx" },
	{ subpath: "./tooltip", source: "tooltip.tsx" },
	{ subpath: "./table", source: "table.tsx" },
	{ subpath: "./Label", source: "Label.tsx" },

	// Layout
	{ subpath: "./layout/Surface",              source: "layout/Surface.tsx" },
	{ subpath: "./layout/ResponsiveContainer",  source: "layout/ResponsiveContainer.tsx" },

	// Typography
	{ subpath: "./typography/Heading",         source: "typography/Heading.tsx" },
	{ subpath: "./typography/Paragraph",       source: "typography/Paragraph.tsx" },
	{ subpath: "./typography/PageHeader",      source: "typography/PageHeader.tsx" },
	{ subpath: "./typography/UnorderedList",   source: "typography/UnorderedList.tsx" },

	{ subpath: "./utils/cva", source: "utils/cva.ts" },
	{ subpath: "./utils/composeEventHandlers", source: "utils/composeEventHandlers.ts" },
	{ subpath: "./utils/NoSSRWrapper", source: "utils/NoSSRWrapper.tsx" },

	{ subpath: "./hooks/useSafeAnimate", source: "hooks/useSafeAnimate.ts" },
	{ subpath: "./hooks/useNodeInteractions", source: "hooks/useNodeInteractions.ts" },
	{ subpath: "./hooks/usePrevious", source: "hooks/usePrevious.ts" },
	{ subpath: "./hooks/useResizablePanel", source: "hooks/useResizablePanel.ts" },
	{ subpath: "./hooks/useSafeLocalStorage", source: "hooks/useSafeLocalStorage.tsx" },

	// Styles
	{ subpath: "./styles/controlVariants", source: "styles/controlVariants.ts" },

	// Tailwind plugins (loaded by consumers via @plugin)
	{ subpath: "./styles/plugins/elevation", source: "styles/plugins/elevation/elevation.ts" },
	{ subpath: "./styles/plugins/inset-surface", source: "styles/plugins/inset-surface/inset-surface.ts" },
	{ subpath: "./styles/plugins/motion-spring", source: "styles/plugins/motion-spring.ts" },

	// Subsystem: dialogs
	{ subpath: "./dialogs/Dialog",         source: "dialogs/Dialog.tsx" },
	{ subpath: "./dialogs/DialogProvider", source: "dialogs/DialogProvider.tsx" },
	{ subpath: "./dialogs/useDialog",      source: "dialogs/useDialog.tsx" },
	{ subpath: "./dialogs/useWizard",      source: "dialogs/useWizard.tsx" },

	// Subsystem: dnd
	{ subpath: "./dnd/dnd",                           source: "dnd/dnd.ts" },
	{ subpath: "./dnd/types",                         source: "dnd/types.ts" },
	{ subpath: "./dnd/useAccessibilityAnnouncements", source: "dnd/useAccessibilityAnnouncements.ts" },
	{ subpath: "./dnd/useDragSource",                 source: "dnd/useDragSource.tsx" },
	{ subpath: "./dnd/useDropTarget",                 source: "dnd/useDropTarget.ts" },
	{ subpath: "./dnd/utils",                         source: "dnd/utils.ts" },

	// Subsystem: collection
	{ subpath: "./collection/components/Collection",            source: "collection/components/Collection.tsx" },
	{ subpath: "./collection/components/CollectionFilterInput", source: "collection/components/CollectionFilterInput.tsx" },
	{ subpath: "./collection/components/CollectionSortButton",  source: "collection/components/CollectionSortButton.tsx" },
	{ subpath: "./collection/dnd/useDragAndDrop",               source: "collection/dnd/useDragAndDrop.tsx" },
	{ subpath: "./collection/layout/InlineGridLayout",          source: "collection/layout/InlineGridLayout.ts" },
	{ subpath: "./collection/layout/ListLayout",                source: "collection/layout/ListLayout.ts" },
	{ subpath: "./collection/sorting/types",                    source: "collection/sorting/types.ts" },
	{ subpath: "./collection/types",                            source: "collection/types.ts" },

	// Subsystem: form
	{ subpath: "./form/components/Field/Field",                       source: "form/components/Field/Field.tsx" },
	{ subpath: "./form/components/Field/types",                       source: "form/components/Field/types.ts" },
	{ subpath: "./form/components/Field/UnconnectedField",            source: "form/components/Field/UnconnectedField.tsx" },
	{ subpath: "./form/components/FieldGroup",                        source: "form/components/FieldGroup.tsx" },
	{ subpath: "./form/components/FieldLabel",                        source: "form/components/FieldLabel.tsx" },
	{ subpath: "./form/components/FieldNamespace",                    source: "form/components/FieldNamespace.tsx" },
	{ subpath: "./form/components/fields/ArrayField/ArrayField",      source: "form/components/fields/ArrayField/ArrayField.tsx" },
	{ subpath: "./form/components/fields/Boolean",                    source: "form/components/fields/Boolean.tsx" },
	{ subpath: "./form/components/fields/Checkbox",                   source: "form/components/fields/Checkbox.tsx" },
	{ subpath: "./form/components/fields/CheckboxGroup",              source: "form/components/fields/CheckboxGroup.tsx" },
	{ subpath: "./form/components/fields/Combobox/Combobox",          source: "form/components/fields/Combobox/Combobox.tsx" },
	{ subpath: "./form/components/fields/Combobox/shared",            source: "form/components/fields/Combobox/shared.ts" },
	{ subpath: "./form/components/fields/DatePicker",                 source: "form/components/fields/DatePicker.tsx" },
	{ subpath: "./form/components/fields/getPasswordStrength",        source: "form/components/fields/getPasswordStrength.ts" },
	{ subpath: "./form/components/fields/InputField",                 source: "form/components/fields/InputField.tsx" },
	{ subpath: "./form/components/fields/LikertScale",                source: "form/components/fields/LikertScale.tsx" },
	{ subpath: "./form/components/fields/PasswordField",              source: "form/components/fields/PasswordField.tsx" },
	{ subpath: "./form/components/fields/RadioGroup",                 source: "form/components/fields/RadioGroup.tsx" },
	{ subpath: "./form/components/fields/RelativeDatePicker",         source: "form/components/fields/RelativeDatePicker.tsx" },
	{ subpath: "./form/components/fields/RichSelectGroup",            source: "form/components/fields/RichSelectGroup.tsx" },
	{ subpath: "./form/components/fields/RichTextEditor",             source: "form/components/fields/RichTextEditor.tsx" },
	{ subpath: "./form/components/fields/SegmentedCodeField",         source: "form/components/fields/SegmentedCodeField.tsx" },
	{ subpath: "./form/components/fields/Select/Native",              source: "form/components/fields/Select/Native.tsx" },
	{ subpath: "./form/components/fields/Select/Styled",              source: "form/components/fields/Select/Styled.tsx" },
	{ subpath: "./form/components/fields/TextArea",                   source: "form/components/fields/TextArea.tsx" },
	{ subpath: "./form/components/fields/ToggleButtonGroup",          source: "form/components/fields/ToggleButtonGroup.tsx" },
	{ subpath: "./form/components/fields/ToggleField",                source: "form/components/fields/ToggleField.tsx" },
	{ subpath: "./form/components/fields/ToggleFieldSkeleton",        source: "form/components/fields/ToggleFieldSkeleton.tsx" },
	{ subpath: "./form/components/fields/VisualAnalogScale",          source: "form/components/fields/VisualAnalogScale.tsx" },
	{ subpath: "./form/components/Form",                              source: "form/components/Form.tsx" },
	{ subpath: "./form/components/SubmitButton",                      source: "form/components/SubmitButton.tsx" },
	{ subpath: "./form/hooks/useField",                               source: "form/hooks/useField.ts" },
	{ subpath: "./form/hooks/useFormState",                           source: "form/hooks/useFormState.ts" },
	{ subpath: "./form/hooks/useFormStore",                           source: "form/hooks/useFormStore.tsx" },
	{ subpath: "./form/hooks/useFormValue",                           source: "form/hooks/useFormValue.ts" },
	{ subpath: "./form/store/formStoreProvider",                      source: "form/store/formStoreProvider.tsx" },
	{ subpath: "./form/store/types",                                  source: "form/store/types.ts" },
	{ subpath: "./form/utils/focusFirstError",                        source: "form/utils/focusFirstError.ts" },
	{ subpath: "./form/utils/getInputState",                          source: "form/utils/getInputState.ts" },
	{ subpath: "./form/utils/ymd",                                    source: "form/utils/ymd.ts" },
];

export const cssEntries: ExportEntry[] = [
	{ subpath: "./styles.css", source: "styles.css" },
	{ subpath: "./styles/colors.css", source: "styles/colors.css" },
];
