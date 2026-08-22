import type {
  Breakdown,
  CostNode,
  Evaluation,
  Factor,
  LedgerRow,
  ProductModel,
  Range,
  ReplacementNode,
  Scenario,
} from "./types";

export const FACTORS: Factor[] = [
  "labor",
  "capital",
  "energy",
  "material",
  "land",
  "margin",
  "tax",
  "unknown",
];

export const zeroRange = (): Range => ({ low: 0, base: 0, high: 0 });

const range = (value: number): Range => ({ low: value, base: value, high: value });

export const addRange = (a: Range, b: Range): Range => ({
  low: a.low + b.low,
  base: a.base + b.base,
  high: a.high + b.high,
});

export const scaleRange = (value: Range, scalar: number): Range => ({
  low: value.low * scalar,
  base: value.base * scalar,
  high: value.high * scalar,
});

export const multiplyRange = (a: Range, b: Range): Range => ({
  low: a.low * b.low,
  base: a.base * b.base,
  high: a.high * b.high,
});

export const emptyBreakdown = (): Breakdown =>
  Object.fromEntries(FACTORS.map((factor) => [factor, zeroRange()])) as Breakdown;

const addBreakdown = (a: Breakdown, b: Breakdown): Breakdown => {
  const next = emptyBreakdown();
  for (const factor of FACTORS) next[factor] = addRange(a[factor], b[factor]);
  return next;
};

const result = (
  cost: Range,
  factor: Factor,
  formula: string,
  cutoffCount = 0,
): Evaluation => {
  const breakdown = emptyBreakdown();
  breakdown[factor] = cost;
  return { cost, breakdown, cutoffCount, formulas: [formula] };
};

const combine = (items: Evaluation[]): Evaluation =>
  items.reduce<Evaluation>(
    (total, item) => ({
      cost: addRange(total.cost, item.cost),
      breakdown: addBreakdown(total.breakdown, item.breakdown),
      cutoffCount: total.cutoffCount + item.cutoffCount,
      formulas: [...total.formulas, ...item.formulas],
    }),
    { cost: zeroRange(), breakdown: emptyBreakdown(), cutoffCount: 0, formulas: [] },
  );

const depthFallback = (node: ReplacementNode): Evaluation =>
  result(
    node.fallbackUsd,
    "unknown",
    `${node.label}: retained as a bounded residual at the selected depth`,
    1,
  );

export const evaluateReplacement = (
  node: ReplacementNode,
  scenario: Scenario,
  depth: number,
  path: string[] = [],
): Evaluation => {
  if (path.includes(node.id)) {
    return result(node.fallbackUsd, "unknown", `${node.label}: cycle blocked`, 1);
  }
  if (depth >= scenario.maxDepth) return depthFallback(node);

  const nextPath = [...path, node.id];
  switch (node.rule.kind) {
    case "recurse":
      return combine(
        node.rule.children.map((child) =>
          evaluateReplacement(child, scenario, depth + 1, nextPath),
        ),
      );
    case "energy": {
      const kWh = scaleRange(node.rule.kWh, scenario.robotEnergyMultiplier);
      const cost = scaleRange(kWh, scenario.electricityPrice);
      return result(
        cost,
        "energy",
        `${node.label}: kWh × robot-energy factor × $${scenario.electricityPrice.toFixed(2)}/kWh`,
      );
    }
    case "scarcity": {
      const cost = scenario.retainScarcity ? node.rule.usd : zeroRange();
      return result(
        cost,
        node.factor,
        scenario.retainScarcity
          ? `${node.label}: explicit scarcity residual retained`
          : `${node.label}: scarcity residual excluded in energy-floor mode`,
      );
    }
    case "fixed":
      return result(node.rule.usd, node.factor, `${node.label}: fixed physical residual`);
  }
};

export const evaluateNode = (
  node: CostNode,
  scenario: Scenario,
  depth = 0,
  path: string[] = [],
): Evaluation => {
  if (path.includes(node.id)) {
    return result(
      { low: 0, base: node.currentCost * 0.5, high: node.currentCost },
      "unknown",
      `${node.label}: cycle blocked`,
      1,
    );
  }

  const nextPath = [...path, node.id];
  switch (node.rule.kind) {
    case "recurse": {
      if (!node.children?.length) {
        return result(
          { low: 0, base: node.currentCost * 0.5, high: node.currentCost },
          "unknown",
          `${node.label}: unresolved branch`,
          1,
        );
      }
      return combine(
        node.children.map((child) => evaluateNode(child, scenario, depth + 1, nextPath)),
      );
    }
    case "replace":
      return evaluateReplacement(node.rule.replacement, scenario, depth + 1, nextPath);
    case "energy":
      return result(
        scaleRange(node.rule.kWh, scenario.electricityPrice),
        "energy",
        `${node.label}: physical kWh × $${scenario.electricityPrice.toFixed(2)}/kWh`,
      );
    case "resource": {
      const energy = result(
        scaleRange(node.rule.processKWh, scenario.electricityPrice),
        "energy",
        `${node.label}: extraction and processing kWh × electricity price`,
      );
      const scarcity = result(
        scenario.retainScarcity ? node.rule.scarcityUsd : zeroRange(),
        node.factor,
        scenario.retainScarcity
          ? `${node.label}: scarcity residual retained`
          : `${node.label}: scarcity residual excluded`,
      );
      return combine([energy, scarcity]);
    }
    case "exclude": {
      const shouldRetain =
        (node.factor === "margin" && scenario.retainMargin) ||
        (node.factor === "tax" && scenario.retainTax);
      return result(
        shouldRetain ? range(node.currentCost) : zeroRange(),
        node.factor,
        shouldRetain
          ? `${node.label}: retained by scenario`
          : `${node.label}: excluded from the physical production floor`,
      );
    }
    case "retain":
      return result(
        scaleRange(node.rule.fraction, node.currentCost),
        node.factor,
        `${node.label}: current cost × retained fraction`,
      );
    case "unmodeled":
      return result(
        { low: node.currentCost * 0.2, base: node.currentCost * 0.6, high: node.currentCost },
        "unknown",
        `${node.label}: conservative unresolved range`,
        1,
      );
  }
};

export const treatmentLabel = (node: CostNode): string => {
  switch (node.rule.kind) {
    case "recurse":
      return "Sum traced inputs";
    case "replace":
      return node.factor === "labor" ? "Robot energy + embodied capital" : "Expand embodied inputs";
    case "energy":
      return "Physical energy retained";
    case "resource":
      return "Process energy + optional scarcity";
    case "exclude":
      return "Excluded unless toggled";
    case "retain":
      return "Retained fraction";
    case "unmodeled":
      return "Bounded unresolved range";
  }
};

export const ledgerRows = (
  node: CostNode,
  scenario: Scenario,
  depth = 0,
): LedgerRow[] => {
  if (node.children?.length && node.rule.kind === "recurse") {
    return node.children.flatMap((child) => ledgerRows(child, scenario, depth + 1));
  }
  return [
    {
      id: node.id,
      depth,
      label: node.label,
      factor: node.factor,
      currentCost: node.currentCost,
      automated: evaluateNode(node, scenario, depth),
      treatment: treatmentLabel(node),
      evidenceIds: node.evidenceIds,
    },
  ];
};

export const currentBreakdown = (model: ProductModel, priceOverride?: number) => {
  const totals = Object.fromEntries(FACTORS.map((factor) => [factor, 0])) as Record<Factor, number>;
  const factor = priceOverride && model.currentPrice > 0 ? priceOverride / model.currentPrice : 1;
  for (const child of model.root.children ?? []) {
    totals[child.factor] += child.currentCost * factor;
  }
  return totals;
};

export const validateModel = (model: ProductModel): string[] => {
  const errors: string[] = [];
  const visit = (node: CostNode) => {
    if (node.rule.kind === "recurse" && node.children?.length) {
      const childrenTotal = node.children.reduce((sum, child) => sum + child.currentCost, 0);
      if (Math.abs(childrenTotal - node.currentCost) > 0.011) {
        errors.push(
          `${node.label}: children total $${childrenTotal.toFixed(2)} vs parent $${node.currentCost.toFixed(2)}`,
        );
      }
      node.children.forEach(visit);
    }
  };
  visit(model.root);
  return errors;
};

export const scenarioRange = (value: Range) =>
  `$${value.low.toFixed(2)}–$${value.high.toFixed(2)}`;

export const sensitivity = (model: ProductModel, scenario: Scenario) => {
  const base = evaluateNode(model.root, scenario).cost.base;
  const variants = [
    {
      label: "Electricity price",
      scenario: { ...scenario, electricityPrice: scenario.electricityPrice * 1.1 },
    },
    {
      label: "Robot task energy",
      scenario: { ...scenario, robotEnergyMultiplier: scenario.robotEnergyMultiplier * 1.1 },
    },
    {
      label: "Scarcity boundary",
      scenario: { ...scenario, retainScarcity: !scenario.retainScarcity },
    },
    {
      label: "Recursion depth",
      scenario: { ...scenario, maxDepth: Math.max(2, scenario.maxDepth - 1) },
    },
  ];
  return variants
    .map((variant) => ({
      label: variant.label,
      delta: Math.abs(evaluateNode(model.root, variant.scenario).cost.base - base),
    }))
    .sort((a, b) => b.delta - a.delta);
};
