# Installer image build inputs

CI run `34759587674` failed while bundling `src/configure.ts`: Turbo's pruned
workspace omitted `deployment/installer/configuration-files.json`, which lives
outside the server package but is imported by the configure implementation.
The builder now copies that exact file from the same pruner stage before Vite
runs, alongside the already explicit shared build plugins.

The real local Docker build completed, including both Vite builds and the
production dependency deployment. The resulting local arm64 manifest is
`sha256:b2e21cff7216db8fc4918693bba04c4b73f15cd0c06876738e056e0b770ad684`.
The five installer archive/configuration tests also passed. This locally built
image has not been published and is not release qualification evidence; the
signed release lane still requires the final reviewed commit and Linux checks.
