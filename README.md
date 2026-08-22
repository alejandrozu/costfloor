# CostFloor

CostFloor is an auditable scenario engine for estimating an **automation-adjusted resource floor at today's energy price**. It traces a product's current price through labor, capital, direct energy, materials, land/scarcity, tax, and margin; labor and capital are then replaced recursively with explicit physical inputs.

The output is a technological boundary scenario, not a forecast of what a seller will charge. Demand, scarcity, taxes, regulation, financing, and market power can keep prices above production cost.

## Hackathon MVP

The site ships three reconciled, editable fixtures:

- Premium loose-leaf tea, 100 g
- Mid-market cotton T-shirt
- All-purpose flour, 2 lb

Users can change electricity price, robot task energy, recursion depth, scarcity treatment, margin treatment, and tax treatment. Each result includes a low/base/high scenario range, current-versus-automated composition, recursive replacement tree, transformation ledger, evidence labels, sensitivity ranking, and JSON export.

Free-text product entry maps only to curated fixtures. Unsupported goods are rejected explicitly; the MVP never invents an authoritative-looking cost tree on the fly.

## Model architecture

All costs are normalized to one functional unit. A current-cost node has one automation treatment:

- `recurse`: sum reconciled children.
- `replace`: evaluate a replacement tree for labor or capital.
- `energy`: multiply physical kWh by the scenario electricity price.
- `resource`: add processing energy and, optionally, an explicit scarcity residual.
- `exclude`: remove a market wedge unless the scenario retains it.
- `retain`: preserve a bounded fraction.
- `unmodeled`: expose a conservative residual range.

Replacement trees recurse through operating energy, embodied materials, fabrication energy, and automated maintenance. When the selected depth is reached, a branch becomes a visible bounded residual rather than zero.

Positive interval arithmetic propagates low/base/high assumptions. These are scenario bounds, not confidence intervals. The evaluator blocks cycles, validates current-cost reconciliation, preserves scarcity outside the energy ledger, and avoids counting both an asset's price and its expanded bill of inputs.

## Project map

- `app/CostFloorApp.tsx` — interactive product experience.
- `app/model/types.ts` — typed node, evidence, scenario, and result contracts.
- `app/model/engine.ts` — recursive evaluator, reconciliation, ledger, and sensitivity logic.
- `app/model/fixtures.ts` — three auditable demo models and provenance.
- `tests/model.engine.test.ts` — model invariants and scenario-direction tests.
- `tests/rendered-html.test.mjs` — production render and metadata tests.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm test
```

The test command builds the deployable worker, verifies the rendered experience and social metadata, then checks fixture reconciliation, range ordering, scenario monotonicity, recursion cutoffs, and curated product lookup.

## Baseline scenario

- California industrial electricity: $0.20/kWh, rounded from the May 2026 EIA table.
- Robot task-energy multiplier: 1.0×.
- Recursion depth: 5.
- Land and material scarcity retained.
- Current margin and tax excluded from the physical floor.

Every cost split and engineering input in the hackathon fixture is labeled as observed, derived, or assumed. Product stage shares are editable demo assumptions, not audited industry averages.
