# CostFloor

CostFloor is an auditable scenario engine for estimating an **automation-adjusted resource floor at today's energy price**. It traces a product's current price through labor, capital, direct energy, materials, land/scarcity, tax, and margin; labor and capital are then replaced recursively with explicit physical inputs.

[Open the deployed demo](https://costfloor-agi-house.alezarzu.chatgpt.site)

[Download the 14-slide technical presentation](presentation/CostFloor_Hackathon_Pitch_Technical.pptx)

The output is a technological boundary scenario, not a forecast of what a seller will charge. Demand, scarcity, taxes, regulation, financing, and market power can keep prices above production cost.

## Hackathon MVP

The site ships six reconciled, editable fixtures:

- Premium loose-leaf tea, 100 g
- Mid-market cotton T-shirt
- All-purpose flour, 2 lb
- Boiled water, 1 L heated once from 21°C to 100°C
- Consumer laptop, one 13-inch device at the purchase boundary
- New gasoline passenger car at the purchase boundary

Users can change electricity price, robot task energy, recursion depth, scarcity treatment, margin treatment, and tax treatment. Electricity spans $1–$1,000/MWh and robot task energy spans 0.01×–10× on logarithmic controls; each slider step is 0.05 decade (`10^0.05`, about 1.122×). Recursion depth spans 3–20 with a baseline of 5. Each result includes a low/base/high scenario range, current-versus-automated composition, recursive replacement tree, transformation ledger, evidence labels, sensitivity ranking, and JSON export.

Free-text product entry maps only to curated fixtures. Unsupported goods are rejected explicitly; the MVP never invents an authoritative-looking cost tree on the fly.

## Model architecture

All costs are normalized to one functional unit. A current-cost node has one automation treatment:

- `recurse`: sum reconciled children.
- `replace`: evaluate a replacement tree for labor or capital.
- `energy`: multiply physical kWh by the scenario electricity price in $/MWh divided by 1,000.
- `resource`: add processing energy and, optionally, an explicit scarcity residual.
- `exclude`: remove a market wedge unless the scenario retains it.
- `retain`: preserve a bounded fraction.
- `unmodeled`: expose a conservative residual range.

Replacement trees recurse through operating energy, embodied materials, fabrication energy, and automated maintenance. Only task-runtime and AI-energy rules tagged for robot scaling receive the robot multiplier; direct process, fabrication, and maintenance energy do not. A replacement node at or beyond the selected maximum depth becomes a visible bounded residual rather than zero. Finite branches may reach terminal physical inputs before that limit.

Positive interval arithmetic propagates low/base/high assumptions. These are scenario bounds, not confidence intervals. The evaluator blocks cycles, validates current-cost reconciliation, preserves scarcity outside the energy ledger, and avoids counting both an asset's price and its expanded bill of inputs.

The six-good comparison reports **retained share** as `100 × base automated floor / current fixture price`. Current price is normalized to 100% for every good. Results above 100% remain visible; they mean the selected physical and institutional inputs exceed the current fixture price, not that the result should be clamped to “no reduction.”

## Project map

- `app/CostFloorApp.tsx` — interactive product experience.
- `app/model/types.ts` — typed node, evidence, scenario, and result contracts.
- `app/model/engine.ts` — recursive evaluator, reconciliation, ledger, and sensitivity logic.
- `app/model/fixtures.ts` — six auditable demo models and provenance.
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

- California industrial electricity: $200/MWh ($0.20/kWh), rounded from the May 2026 EIA table.
- Robot task-energy multiplier: 1.0×.
- Maximum recursion depth: 5 (control range 3–20).
- Land and material scarcity retained.
- Current margin and tax excluded from the physical floor.

Every cost split and engineering input in the hackathon fixture is labeled as observed, derived, or assumed. Product stage shares are editable demo assumptions, not audited industry averages.
