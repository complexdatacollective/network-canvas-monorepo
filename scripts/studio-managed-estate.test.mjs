// Include the managed-estate estimator's real controls in the required CI script suite.
import '../apps/studio/deployment/managed/cost-model.test.mjs';
import '../apps/studio/deployment/managed/fly-machine-preparation.test.mjs';
import '../apps/studio/deployment/managed/observability-egress-budget.test.mjs';
import '../apps/studio/deployment/managed/observability-dynamodb-anchor-store.test.mjs';
import '../apps/studio/deployment/managed/observability-monotonic-anchor.test.mjs';
import '../apps/studio/deployment/managed/subprocessor-inventory.test.mjs';
import '../workers/studio-ingress/src/index.test.mjs';
