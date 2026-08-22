import type {
  CostNode,
  Evidence,
  ProductModel,
  Range,
  ReplacementNode,
} from "./types";

const r = (low: number, base: number, high: number): Range => ({ low, base, high });

const commonEvidence: Evidence[] = [
  {
    id: "ca-electricity",
    kind: "observed",
    title: "California industrial electricity price, May 2026",
    publisher: "U.S. Energy Information Administration",
    url: "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a",
    note:
      "The default $0.20/kWh is a rounded May 2026 California industrial anchor. Actual tariffs vary by customer class and time.",
  },
  {
    id: "food-dollar",
    kind: "observed",
    title: "Food Dollar Series",
    publisher: "USDA Economic Research Service",
    url: "https://www.ers.usda.gov/data-products/food-dollar-series",
    note:
      "Used to structure farm, processing, transport, and retail stages—not to claim a product-specific allocation.",
  },
  {
    id: "robot-envelope",
    kind: "derived",
    title: "Robot task-energy envelope",
    publisher: "CostFloor synthesis from published robot specifications",
    url: "https://www.universal-robots.com/manuals/EN/HTML/SW10_9/Content/prod-usr-man/complianceUR5e/H_g5_sections/appendix_g5/tech_spec_sheet.htm",
    note:
      "Published robot power anchors the envelope; task speed and embodied-capital allocations remain editable scenario assumptions.",
  },
  {
    id: "bounded-recursion",
    kind: "derived",
    title: "Bounded recursive replacement",
    publisher: "CostFloor method v0.1",
    note:
      "Labor becomes operating energy plus embodied machine inputs; capital is expanded again until the selected depth.",
  },
  {
    id: "resource-rent",
    kind: "derived",
    title: "SEEA resource-rent boundary",
    publisher: "United Nations System of Environmental-Economic Accounting",
    url: "https://seea.un.org/sites/seea.un.org/files/seea_cf_final_en.pdf",
    note:
      "Grounds the separation between physical processing energy and land or natural-resource scarcity rent.",
  },
  {
    id: "useeio-frontier",
    kind: "observed",
    title: "USEEIO technical content",
    publisher: "U.S. Environmental Protection Agency",
    url: "https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-technical-content",
    note:
      "A future production implementation can use sector energy intensity for unresolved frontier nodes; this MVP shows bounded residuals instead.",
  },
  {
    id: "price-input",
    kind: "assumption",
    title: "Editable California shelf-price input",
    publisher: "Hackathon demo fixture",
    note:
      "The displayed price is a demo starting point, not a market average. Users can overwrite it before running the model.",
  },
];

const laborReplacement = (
  id: string,
  operatingKWh: Range,
  materialUsd: Range,
  fabricationKWh: Range,
  maintenanceKWh: Range,
): ReplacementNode => ({
  id: `${id}-replacement`,
  label: "Equivalent automated task",
  factor: "capital",
  note: "The human task is replaced by operating electricity and a per-unit share of machine capital.",
  evidenceIds: ["robot-envelope", "bounded-recursion"],
  fallbackUsd: r(0.04, 0.14, 0.4),
  rule: {
    kind: "recurse",
    children: [
      {
        id: `${id}-operating-energy`,
        label: "Robot operating electricity",
        factor: "energy",
        note: "Task energy after converting human task time into equivalent machine runtime.",
        evidenceIds: ["robot-envelope", "ca-electricity"],
        fallbackUsd: r(0.01, 0.04, 0.12),
        rule: { kind: "energy", kWh: operatingKWh },
      },
      {
        id: `${id}-capital`,
        label: "Robot capital allocation",
        factor: "capital",
        note: "A per-product share of the machine's embodied inputs, lifetime, and utilization.",
        evidenceIds: ["robot-envelope", "bounded-recursion"],
        fallbackUsd: r(0.04, 0.12, 0.32),
        rule: {
          kind: "recurse",
          children: [
            {
              id: `${id}-capital-materials`,
              label: "Embodied materials & scarce inputs",
              factor: "material",
              note: "Metals, electronics, and other terminal material residuals allocated to one product unit.",
              evidenceIds: ["robot-envelope"],
              fallbackUsd: materialUsd,
              rule: { kind: "scarcity", usd: materialUsd },
            },
            {
              id: `${id}-capital-energy`,
              label: "Fabrication energy",
              factor: "energy",
              note: "Allocated energy required to fabricate the automation equipment.",
              evidenceIds: ["robot-envelope", "ca-electricity"],
              fallbackUsd: r(0.01, 0.04, 0.12),
              rule: { kind: "energy", kWh: fabricationKWh },
            },
            {
              id: `${id}-maintenance`,
              label: "Automated maintenance",
              factor: "capital",
              note: "A fourth-level expansion for service energy and tooling wear.",
              evidenceIds: ["robot-envelope", "bounded-recursion"],
              fallbackUsd: r(0.01, 0.05, 0.14),
              rule: {
                kind: "recurse",
                children: [
                  {
                    id: `${id}-maintenance-energy`,
                    label: "Maintenance electricity",
                    factor: "energy",
                    note: "Diagnostics, movement, cleaning, and servicing energy allocated per unit.",
                    evidenceIds: ["robot-envelope", "ca-electricity"],
                    fallbackUsd: r(0.005, 0.02, 0.07),
                    rule: { kind: "energy", kWh: maintenanceKWh },
                  },
                  {
                    id: `${id}-tooling`,
                    label: "Tooling wear",
                    factor: "material",
                    note: "Consumable physical wear that does not vanish with labor automation.",
                    evidenceIds: ["robot-envelope"],
                    fallbackUsd: r(0.005, 0.02, 0.06),
                    rule: { kind: "fixed", usd: r(0.005, 0.02, 0.06) },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  },
});

const capitalReplacement = (
  id: string,
  materialUsd: Range,
  fabricationKWh: Range,
  serviceKWh: Range,
): ReplacementNode => ({
  id: `${id}-replacement`,
  label: "Expanded productive asset",
  factor: "capital",
  note: "The asset's sticker cost is replaced with allocated materials, fabrication energy, and automated upkeep.",
  evidenceIds: ["bounded-recursion", "robot-envelope"],
  fallbackUsd: r(0.08, 0.28, 0.8),
  rule: {
    kind: "recurse",
    children: [
      {
        id: `${id}-materials`,
        label: "Asset materials",
        factor: "material",
        note: "Allocated physical materials and scarce inputs per product unit.",
        evidenceIds: ["robot-envelope"],
        fallbackUsd: materialUsd,
        rule: { kind: "scarcity", usd: materialUsd },
      },
      {
        id: `${id}-fabrication`,
        label: "Asset fabrication energy",
        factor: "energy",
        note: "Embodied manufacturing energy allocated across useful output.",
        evidenceIds: ["robot-envelope", "ca-electricity"],
        fallbackUsd: r(0.02, 0.08, 0.25),
        rule: { kind: "energy", kWh: fabricationKWh },
      },
      laborReplacement(`${id}-service`, serviceKWh, r(0.01, 0.04, 0.11), r(0.03, 0.1, 0.3), r(0.01, 0.04, 0.12)),
    ],
  },
});

const root = (id: string, name: string, price: number, children: CostNode[]): CostNode => ({
  id,
  label: name,
  factor: "unknown",
  currentCost: price,
  note: "One functional unit, normalized to the editable current retail price.",
  evidenceIds: ["price-input"],
  rule: { kind: "recurse" },
  children,
});

const teaEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "tea-fao",
    kind: "observed",
    title: "Tea market and production context",
    publisher: "Food and Agriculture Organization of the United Nations",
    url: "https://www.fao.org/markets-and-trade/commodities/tea/en",
    note: "Used for supply-chain context. The prototype's per-unit cost split remains an editable engineering assumption.",
  },
  {
    id: "tea-split",
    kind: "assumption",
    title: "Premium tea cost decomposition",
    publisher: "CostFloor demo model",
    note: "Stage shares reconcile to $18.00 and are intentionally exposed for challenge; they are not a vendor's audited bill of materials.",
  },
];

const shirtEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "textile-lca",
    kind: "observed",
    title: "Apparel and textile life-cycle inventory guidance",
    publisher: "European Commission Joint Research Centre",
    url: "https://eplca.jrc.ec.europa.eu/",
    note: "Used to define physical processing stages. Prototype kWh and dollar allocations are scenario values.",
  },
  {
    id: "shirt-split",
    kind: "assumption",
    title: "Mid-market cotton T-shirt decomposition",
    publisher: "CostFloor demo model",
    note: "The branch totals reconcile to $24.00 and are editable rather than presented as an industry average.",
  },
];

const flourEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "wheat-ers",
    kind: "observed",
    title: "Wheat sector at a glance",
    publisher: "USDA Economic Research Service",
    url: "https://www.ers.usda.gov/topics/crops/wheat/wheat-sector-at-a-glance",
    note: "Used for sector structure and mechanization context, not a product-specific retail allocation.",
  },
  {
    id: "flour-split",
    kind: "assumption",
    title: "Two-pound flour bag decomposition",
    publisher: "CostFloor demo model",
    note: "The branch totals reconcile to $4.49 and make the already-mechanized baseline inspectable.",
  },
];

export const PRODUCTS: ProductModel[] = [
  {
    id: "premium-tea",
    name: "Premium loose-leaf tea",
    shortName: "Premium tea",
    unit: "100 g pouch",
    region: "California",
    currentPrice: 18,
    aliases: ["tea", "premium tea", "loose leaf tea", "green tea", "black tea"],
    description: "A labor-sensitive product with scarce land, careful picking, processing, packaging, and retail layers.",
    evidence: teaEvidence,
    root: root("premium-tea-root", "Premium loose-leaf tea", 18, [
      {
        id: "tea-margin",
        label: "Retail, brand & channel margin",
        factor: "margin",
        currentCost: 6.2,
        note: "Institutional and commercial value in today's shelf price; not a physical production input.",
        evidenceIds: ["tea-split", "food-dollar"],
        rule: { kind: "exclude" },
      },
      {
        id: "tea-service-labor",
        label: "Retail handling & fulfillment labor",
        factor: "labor",
        currentCost: 2.6,
        note: "Receiving, stocking, order handling, and customer fulfillment.",
        evidenceIds: ["tea-split", "food-dollar"],
        rule: {
          kind: "replace",
          replacement: laborReplacement("tea-service", r(0.05, 0.12, 0.3), r(0.02, 0.06, 0.15), r(0.08, 0.2, 0.5), r(0.02, 0.06, 0.16)),
        },
      },
      {
        id: "tea-field-labor",
        label: "Cultivation & selective picking labor",
        factor: "labor",
        currentCost: 3.2,
        note: "The dexterous, quality-sensitive field work at the center of the thesis.",
        evidenceIds: ["tea-split", "tea-fao"],
        rule: {
          kind: "replace",
          replacement: laborReplacement("tea-field", r(0.25, 0.55, 1.4), r(0.05, 0.16, 0.42), r(0.18, 0.5, 1.3), r(0.05, 0.16, 0.45)),
        },
      },
      {
        id: "tea-processing-energy",
        label: "Withering, rolling, drying & sorting energy",
        factor: "energy",
        currentCost: 1.1,
        note: "Direct thermal and electrical process energy remains after labor automation.",
        evidenceIds: ["tea-split", "tea-fao", "ca-electricity"],
        rule: { kind: "energy", kWh: r(1.1, 1.8, 3.2) },
      },
      {
        id: "tea-packaging-capital",
        label: "Packaging line & pouch conversion",
        factor: "capital",
        currentCost: 1.7,
        note: "Packaging capital is expanded into embodied materials, fabrication energy, and automated service.",
        evidenceIds: ["tea-split", "bounded-recursion"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("tea-packaging", r(0.12, 0.3, 0.65), r(0.35, 0.85, 1.8), r(0.03, 0.1, 0.28)),
        },
      },
      {
        id: "tea-logistics",
        label: "Freight, warehousing & delivery",
        factor: "capital",
        currentCost: 1.4,
        note: "A mixed capital-and-labor branch treated as an automated logistics asset.",
        evidenceIds: ["tea-split", "food-dollar"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("tea-logistics", r(0.04, 0.12, 0.35), r(0.25, 0.65, 1.6), r(0.06, 0.18, 0.5)),
        },
      },
      {
        id: "tea-leaf-resource",
        label: "Leaf biomass, water, and land scarcity",
        factor: "land",
        currentCost: 1.5,
        note: "Matter and land are not converted into joules; the model separates process energy from optional scarcity rent.",
        evidenceIds: ["tea-split", "tea-fao"],
        rule: { kind: "resource", processKWh: r(0.25, 0.55, 1.2), scarcityUsd: r(0.28, 0.62, 1.15) },
      },
      {
        id: "tea-tax",
        label: "Taxes & compliance allocation",
        factor: "tax",
        currentCost: 0.3,
        note: "A policy and institutional cost shown explicitly rather than silently removed.",
        evidenceIds: ["tea-split"],
        rule: { kind: "exclude" },
      },
    ]),
  },
  {
    id: "cotton-shirt",
    name: "Mid-market cotton T-shirt",
    shortName: "Cotton T-shirt",
    unit: "one garment",
    region: "California",
    currentPrice: 24,
    aliases: ["shirt", "tshirt", "t-shirt", "cotton shirt", "cotton t-shirt"],
    description: "A mixed case: cut-and-sew labor can compress, but fiber, wet processing, energy, and logistics remain.",
    evidence: shirtEvidence,
    root: root("cotton-shirt-root", "Mid-market cotton T-shirt", 24, [
      {
        id: "shirt-margin",
        label: "Retail, brand & channel margin",
        factor: "margin",
        currentCost: 8.4,
        note: "Commercial value excluded from the physical floor unless retained.",
        evidenceIds: ["shirt-split"],
        rule: { kind: "exclude" },
      },
      {
        id: "shirt-tax",
        label: "Tax, duty & compliance",
        factor: "tax",
        currentCost: 1.8,
        note: "Institutional costs are kept visible as a separate scenario choice.",
        evidenceIds: ["shirt-split"],
        rule: { kind: "exclude" },
      },
      {
        id: "shirt-labor",
        label: "Cut, sew, finish & inspect labor",
        factor: "labor",
        currentCost: 4.6,
        note: "Dexterous handling and inspection are converted to robot runtime plus machine inputs.",
        evidenceIds: ["shirt-split", "textile-lca"],
        rule: {
          kind: "replace",
          replacement: laborReplacement("shirt-sew", r(0.35, 0.85, 2.1), r(0.08, 0.25, 0.7), r(0.3, 0.9, 2.4), r(0.08, 0.22, 0.65)),
        },
      },
      {
        id: "shirt-process-energy",
        label: "Spinning, knitting, dyeing & finishing energy",
        factor: "energy",
        currentCost: 2.4,
        note: "Direct process heat and electricity remain physical inputs.",
        evidenceIds: ["shirt-split", "textile-lca", "ca-electricity"],
        rule: { kind: "energy", kWh: r(4.2, 6.5, 10.5) },
      },
      {
        id: "shirt-resource",
        label: "Cotton fiber, water & land residual",
        factor: "land",
        currentCost: 3.1,
        note: "Fiber processing energy is separated from optional agricultural scarcity.",
        evidenceIds: ["shirt-split", "textile-lca"],
        rule: { kind: "resource", processKWh: r(1.1, 2.3, 4.2), scarcityUsd: r(0.45, 1.0, 2.2) },
      },
      {
        id: "shirt-capital",
        label: "Textile & sewing equipment",
        factor: "capital",
        currentCost: 1.8,
        note: "Productive equipment is unpacked into per-garment embodied inputs.",
        evidenceIds: ["shirt-split", "bounded-recursion"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("shirt-capital", r(0.18, 0.48, 1.05), r(0.8, 1.8, 4.1), r(0.12, 0.35, 0.9)),
        },
      },
      {
        id: "shirt-logistics",
        label: "Packaging, freight & fulfillment",
        factor: "capital",
        currentCost: 1.9,
        note: "A consolidated branch for packaging materials and automated movement.",
        evidenceIds: ["shirt-split"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("shirt-logistics", r(0.16, 0.42, 0.95), r(0.45, 1.1, 2.7), r(0.06, 0.2, 0.6)),
        },
      },
    ]),
  },
  {
    id: "flour-bag",
    name: "All-purpose flour",
    shortName: "Bag of flour",
    unit: "2 lb bag",
    region: "California",
    currentPrice: 4.49,
    aliases: ["flour", "bag of flour", "wheat flour", "all purpose flour"],
    description: "A mechanized baseline where grain, land, milling energy, and packaging already dominate more of the floor.",
    evidence: flourEvidence,
    root: root("flour-root", "All-purpose flour", 4.49, [
      {
        id: "flour-margin",
        label: "Retail & channel margin",
        factor: "margin",
        currentCost: 0.95,
        note: "Current distribution value excluded from the physical floor unless retained.",
        evidenceIds: ["flour-split", "food-dollar"],
        rule: { kind: "exclude" },
      },
      {
        id: "flour-tax",
        label: "Compliance & tax allocation",
        factor: "tax",
        currentCost: 0.36,
        note: "Institutional cost kept visible as a scenario boundary.",
        evidenceIds: ["flour-split"],
        rule: { kind: "exclude" },
      },
      {
        id: "flour-grain",
        label: "Wheat, land & water residual",
        factor: "land",
        currentCost: 1.25,
        note: "The agricultural resource branch is not assumed to disappear with automation.",
        evidenceIds: ["flour-split", "wheat-ers"],
        rule: { kind: "resource", processKWh: r(0.35, 0.75, 1.5), scarcityUsd: r(0.42, 0.78, 1.2) },
      },
      {
        id: "flour-energy",
        label: "Cleaning, milling & blending energy",
        factor: "energy",
        currentCost: 0.65,
        note: "A mature industrial process with a persistent energy floor.",
        evidenceIds: ["flour-split", "wheat-ers", "ca-electricity"],
        rule: { kind: "energy", kWh: r(0.55, 0.95, 1.6) },
      },
      {
        id: "flour-capital",
        label: "Mill capital allocation",
        factor: "capital",
        currentCost: 0.52,
        note: "The mill is recursively expanded into embodied inputs and upkeep.",
        evidenceIds: ["flour-split", "bounded-recursion"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("flour-mill", r(0.06, 0.16, 0.4), r(0.18, 0.45, 1.1), r(0.02, 0.07, 0.2)),
        },
      },
      {
        id: "flour-package",
        label: "Paper bag & filling line",
        factor: "material",
        currentCost: 0.48,
        note: "Physical packaging remains even if forming and filling are automated.",
        evidenceIds: ["flour-split"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("flour-package", r(0.1, 0.24, 0.45), r(0.1, 0.28, 0.75), r(0.01, 0.04, 0.12)),
        },
      },
      {
        id: "flour-logistics",
        label: "Bulk transport & warehousing",
        factor: "capital",
        currentCost: 0.18,
        note: "Highly utilized logistics assets with a relatively small current cost share.",
        evidenceIds: ["flour-split", "food-dollar"],
        rule: {
          kind: "replace",
          replacement: capitalReplacement("flour-logistics", r(0.02, 0.06, 0.15), r(0.08, 0.2, 0.55), r(0.01, 0.03, 0.1)),
        },
      },
      {
        id: "flour-labor",
        label: "Residual operations labor",
        factor: "labor",
        currentCost: 0.1,
        note: "Small because flour is already produced through a highly mechanized chain.",
        evidenceIds: ["flour-split", "wheat-ers"],
        rule: {
          kind: "replace",
          replacement: laborReplacement("flour-operations", r(0.01, 0.03, 0.09), r(0.005, 0.02, 0.06), r(0.02, 0.06, 0.18), r(0.005, 0.02, 0.06)),
        },
      },
    ]),
  },
];

export const DEFAULT_PRODUCT = PRODUCTS[0];

export const findProduct = (query: string): ProductModel | undefined => {
  const normalized = query.trim().toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return PRODUCTS.find((product) =>
    [product.name, product.shortName, ...product.aliases]
      .map((value) => value.toLowerCase().replace(/[’']/g, ""))
      .some((value) => normalized.includes(value) || value.includes(normalized)),
  );
};
