export type Range = {
  low: number;
  base: number;
  high: number;
};

export type Factor =
  | "labor"
  | "capital"
  | "energy"
  | "material"
  | "land"
  | "margin"
  | "tax"
  | "unknown";

export type EvidenceKind = "observed" | "derived" | "assumption";

export type Evidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  publisher: string;
  url?: string;
  note: string;
};

export type ReplacementNode = {
  id: string;
  label: string;
  factor: Factor;
  note: string;
  evidenceIds: string[];
  fallbackUsd: Range;
  rule:
    | { kind: "recurse"; children: ReplacementNode[] }
    | { kind: "energy"; kWh: Range }
    | { kind: "scarcity"; usd: Range }
    | { kind: "fixed"; usd: Range };
};

export type CostNode = {
  id: string;
  label: string;
  factor: Factor;
  currentCost: number;
  note: string;
  evidenceIds: string[];
  rule:
    | { kind: "recurse" }
    | { kind: "replace"; replacement: ReplacementNode }
    | { kind: "energy"; kWh: Range }
    | { kind: "resource"; processKWh: Range; scarcityUsd: Range }
    | { kind: "exclude" }
    | { kind: "retain"; fraction: Range }
    | { kind: "unmodeled" };
  children?: CostNode[];
};

export type ProductModel = {
  id: string;
  name: string;
  shortName: string;
  unit: string;
  region: string;
  currentPrice: number;
  aliases: string[];
  description: string;
  root: CostNode;
  evidence: Evidence[];
};

export type Scenario = {
  electricityPrice: number;
  robotEnergyMultiplier: number;
  maxDepth: number;
  retainScarcity: boolean;
  retainMargin: boolean;
  retainTax: boolean;
};

export type Breakdown = Record<Factor, Range>;

export type Evaluation = {
  cost: Range;
  breakdown: Breakdown;
  cutoffCount: number;
  formulas: string[];
};

export type LedgerRow = {
  id: string;
  depth: number;
  label: string;
  factor: Factor;
  currentCost: number;
  automated: Evaluation;
  treatment: string;
  evidenceIds: string[];
};
