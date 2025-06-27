### Migration Rules (Complete Instructions)

**Identify target files**: Look for files containing defaultProps, propTypes, or prop-types imports

**Convert file to TypeScript if required**: Rename .js to .ts and .jsx to .tsx

**Remove PropTypes import**: Delete the import for the `prop-types` library from the file, and remove the propTypes object if it exists.

**Extract prop types from PropTypes definitions**:

- Convert PropTypes.string → string
- Convert PropTypes.number → number
- Convert PropTypes.bool → boolean
- Convert PropTypes.func → () => void or appropriate function signature
- Convert PropTypes.array → unknown[] or more specific array type
- Convert PropTypes.object → Record<string, unknown> or more specific type
- Convert PropTypes.node → React.ReactNode
- Convert PropTypes.element → React.ReactElement
- Convert PropTypes.oneOf(['a', 'b']) → 'a' | 'b'
- Convert PropTypes.oneOfType([type1, type2]) → type1 | type2
- Convert PropTypes.arrayOf(PropTypes.string) → string[]
- Convert PropTypes.shape({...}) → extract as separate type
- Required props: Remove .isRequired and make non-optional in type
- Optional props: Add ? to the type definition

**Create TypeScript type definitions**:

- Use type keyword, NOT interface
- Name the type as ComponentNameProps
- Place type definition immediately before the component

**Handle defaultProps**:

- For function components, convert to destructuring defaults in the function signature
- For class components, keep static defaultProps as-is
- Remove all defaultProps assignments for function components

**Handle function components**:

- Add type annotation to function parameters: function Component({ prop1, prop2 }: ComponentProps)
- Move all defaultProps values to destructuring defaults in function signature
- Delete the Component.defaultProps = {...} assignment completely

**Handle class components**:

- Add type annotation: class Component extends React.Component<ComponentProps>
- Keep static defaultProps = {...} as-is (do not change for class components)
- Remove static propTypes = {...}

**Handle nested object defaults**:

- For simple defaults: Use destructuring with defaults: { config = { theme: 'light' } }
- For complex nested defaults:
  - Create helper function getDefaultConfig() that returns the full default object
  - In component, merge defaults: const finalConfig = { ...getDefaultConfig(), ...config }
  - For deeply nested objects, merge each level

**Handle array defaults**: Use destructuring default: { items = [] }

**Handle function prop defaults**: Use destructuring default: { onClick = () => {} }

**Handle conditional/computed defaults**: Use nullish coalescing: const value = providedValue ?? computeDefault()

**Special type conversions**:

- PropTypes.any → any (but add TODO comment to improve later)
- PropTypes.instanceOf(Class) → InstanceType<typeof Class>
- Custom validators → create custom type or use unknown with runtime validation

**Type naming conventions**:

- Main props type: ComponentNameProps
- Nested object types: ComponentNameConfigProps, ComponentNameItemProps
- Always use PascalCase for type names

**DO NOT**:

- Use interface - always use type
- Leave any PropTypes or defaultProps code for function components
- Change defaultProps for class components
- Use React.FC or React.FunctionComponent
- Import PropTypes anywhere in the migrated file

## Migration Notes

- Following strict type definitions (no interfaces)
- Preserving all default values
- Using ES6 default parameters for function components
- Maintaining runtime validation where critical
