---
"@codaco/protocol-validation": patch
---

Fix TypeScript declaration merging errors by disabling rollupTypes in vite-plugin-dts. This resolves "Individual declarations in merged declaration must be all exported or all local" errors and "const initializer in ambient context" issues when importing the package.