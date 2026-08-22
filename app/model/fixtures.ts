import type {
  CostNode,
  Evidence,
  Factor,
  PhysicalDepthFallback,
  ProductModel,
  Range,
  ReplacementNode,
} from "./types";

const r = (low: number, base: number, high: number): Range => ({ low, base, high });
const zero = (): Range => r(0, 0, 0);
const add = (a: Range, b: Range): Range =>
  r(a.low + b.low, a.base + b.base, a.high + b.high);

const energyFallback = (kWh: Range, scaleWithRobot: boolean): PhysicalDepthFallback => ({
  energy: [{ kWh, scaleWithRobot }],
  scarcityUsd: zero(),
  fixedUsd: zero(),
});

const scarcityFallback = (usd: Range): PhysicalDepthFallback => ({
  energy: [],
  scarcityUsd: usd,
  fixedUsd: zero(),
});

const fixedFallback = (usd: Range): PhysicalDepthFallback => ({
  energy: [],
  scarcityUsd: zero(),
  fixedUsd: usd,
});

const mergeFallbacks = (...fallbacks: PhysicalDepthFallback[]): PhysicalDepthFallback =>
  fallbacks.reduce<PhysicalDepthFallback>(
    (total, fallback) => ({
      energy: [...total.energy, ...fallback.energy],
      scarcityUsd: add(total.scarcityUsd, fallback.scarcityUsd),
      fixedUsd: add(total.fixedUsd, fallback.fixedUsd),
    }),
    { energy: [], scarcityUsd: zero(), fixedUsd: zero() },
  );

const replacementEnergy = (
  id: string,
  label: string,
  note: string,
  evidenceIds: string[],
  kWh: Range,
  scaleWithRobot: boolean,
): ReplacementNode => ({
  id,
  label,
  factor: "energy",
  note,
  evidenceIds,
  depthFallback: energyFallback(kWh, scaleWithRobot),
  rule: { kind: "energy", kWh, scaleWithRobot },
});

const replacementScarcity = (
  id: string,
  label: string,
  factor: Factor,
  note: string,
  evidenceIds: string[],
  usd: Range,
): ReplacementNode => ({
  id,
  label,
  factor,
  note,
  evidenceIds,
  depthFallback: scarcityFallback(usd),
  rule: { kind: "scarcity", usd },
});

const replacementFixed = (
  id: string,
  label: string,
  factor: Factor,
  note: string,
  evidenceIds: string[],
  usd: Range,
): ReplacementNode => ({
  id,
  label,
  factor,
  note,
  evidenceIds,
  depthFallback: fixedFallback(usd),
  rule: { kind: "fixed", usd },
});

const replacementGroup = (
  id: string,
  label: string,
  factor: Factor,
  note: string,
  evidenceIds: string[],
  children: ReplacementNode[],
): ReplacementNode => ({
  id,
  label,
  factor,
  note,
  evidenceIds,
  depthFallback: mergeFallbacks(...children.map((child) => child.depthFallback)),
  rule: { kind: "recurse", children },
});

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
): ReplacementNode => {
  const operatingEnergy = replacementEnergy(
    `${id}-operating-energy`,
    "Robot operating electricity",
    "Task energy after converting human task time into equivalent machine runtime.",
    ["robot-envelope", "ca-electricity"],
    operatingKWh,
    true,
  );
  const materials = replacementScarcity(
    `${id}-capital-materials`,
    "Embodied materials & scarce inputs",
    "material",
    "Metals, electronics, and other terminal material residuals allocated to one product unit.",
    ["robot-envelope"],
    materialUsd,
  );
  const fabrication = replacementEnergy(
    `${id}-capital-energy`,
    "Fabrication energy",
    "Allocated energy required to fabricate the automation equipment.",
    ["robot-envelope", "ca-electricity"],
    fabricationKWh,
    false,
  );
  const maintenanceEnergy = replacementEnergy(
    `${id}-maintenance-energy`,
    "Maintenance electricity",
    "Diagnostics, movement, cleaning, and servicing energy allocated per unit.",
    ["robot-envelope", "ca-electricity"],
    maintenanceKWh,
    false,
  );
  const tooling = replacementFixed(
    `${id}-tooling`,
    "Tooling wear",
    "material",
    "Consumable physical wear that does not vanish with labor automation.",
    ["robot-envelope"],
    r(0.005, 0.02, 0.06),
  );
  const maintenance = replacementGroup(
    `${id}-maintenance`,
    "Automated maintenance",
    "capital",
    "A fourth-level expansion for service energy and tooling wear.",
    ["robot-envelope", "bounded-recursion"],
    [maintenanceEnergy, tooling],
  );
  const capital = replacementGroup(
    `${id}-capital`,
    "Robot capital allocation",
    "capital",
    "A per-product share of the machine's embodied inputs, lifetime, and utilization.",
    ["robot-envelope", "bounded-recursion"],
    [materials, fabrication, maintenance],
  );
  return replacementGroup(
    `${id}-replacement`,
    "Equivalent automated task",
    "capital",
    "The human task is replaced by operating electricity and a per-unit share of machine capital.",
    ["robot-envelope", "bounded-recursion"],
    [operatingEnergy, capital],
  );
};

const capitalReplacement = (
  id: string,
  materialUsd: Range,
  fabricationKWh: Range,
  serviceKWh: Range,
): ReplacementNode => {
  const materials = replacementScarcity(
    `${id}-materials`,
    "Asset materials",
    "material",
    "Allocated physical materials and scarce inputs per product unit.",
    ["robot-envelope"],
    materialUsd,
  );
  const fabrication = replacementEnergy(
    `${id}-fabrication`,
    "Asset fabrication energy",
    "Embodied manufacturing energy allocated across useful output.",
    ["robot-envelope", "ca-electricity"],
    fabricationKWh,
    false,
  );
  const service = laborReplacement(
    `${id}-service`,
    serviceKWh,
    r(0.01, 0.04, 0.11),
    r(0.03, 0.1, 0.3),
    r(0.01, 0.04, 0.12),
  );
  return replacementGroup(
    `${id}-replacement`,
    "Expanded productive asset",
    "capital",
    "The asset's sticker cost is replaced with allocated materials, fabrication energy, and automated upkeep.",
    ["bounded-recursion", "robot-envelope"],
    [materials, fabrication, service],
  );
};

const terminalReplacement = (
  id: string,
  label: string,
  robotKWh: Range,
  embodiedKWh: Range,
  scarcityUsd: Range,
  fixedUsd: Range,
  evidenceIds: string[],
): ReplacementNode => {
  const robotEnergy = replacementEnergy(
    `${id}-task-energy`,
    `${label} task energy`,
    "Operating energy that responds to the robot task-energy scenario control.",
    evidenceIds,
    robotKWh,
    true,
  );
  const embodiedEnergy = replacementEnergy(
    `${id}-embodied-energy`,
    `${label} embodied energy`,
    "Allocated fabrication and upkeep energy; it does not scale with robot task runtime.",
    evidenceIds,
    embodiedKWh,
    false,
  );
  const scarcity = replacementScarcity(
    `${id}-scarcity`,
    `${label} scarce inputs`,
    "material",
    "Natural-resource and material scarcity only; supplier purchase prices are not inserted here.",
    evidenceIds,
    scarcityUsd,
  );
  const fixed = replacementFixed(
    `${id}-fixed`,
    `${label} physical wear`,
    "capital",
    "Non-energy consumables and tooling wear allocated to one functional unit.",
    evidenceIds,
    fixedUsd,
  );
  return replacementGroup(
    `${id}-replacement`,
    label,
    "capital",
    "A shallow terminal expansion keeps the physical accounting visible without arbitrary dollar fallbacks.",
    evidenceIds,
    [robotEnergy, embodiedEnergy, scarcity, fixed],
  );
};

const root = (
  id: string,
  name: string,
  price: number,
  children: CostNode[],
  evidenceIds: string[] = ["price-input"],
): CostNode => ({
  id,
  label: name,
  factor: "unknown",
  currentCost: price,
  note: "One functional unit, normalized to the editable current retail price.",
  evidenceIds,
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

const waterEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "water-thermodynamics",
    kind: "observed",
    title: "Thermodynamic Properties of Water (NISTIR 5078)",
    publisher: "National Institute of Standards and Technology",
    url: "https://www.nist.gov/srd/nistir-5078",
    note:
      "The useful heat is derived as 1 kg × 4.186 kJ/kg-K × 79 K = 330.7 kJ, or 0.09186 kWh, before kettle losses.",
  },
  {
    id: "water-system-energy",
    kind: "observed",
    title: "Strategies for Saving Energy at Public Water Systems",
    publisher: "U.S. Environmental Protection Agency",
    url: "https://www.epa.gov/sites/default/files/2015-04/documents/epa816f13004.pdf",
    note:
      "EPA's typical surface-water system uses 1,500 kWh per million gallons, equivalent to about 0.000396 kWh/L.",
  },
  {
    id: "california-water-energy",
    kind: "observed",
    title: "California embedded electricity in water methodology",
    publisher: "California Energy Commission / California Public Utilities Commission",
    url: "https://efiling.energy.ca.gov/GetDocument.aspx?DocumentContentId=27774&tn=222230",
    note:
      "California estimates vary by hydrologic region; the statewide indoor estimate is 4,848 kWh per million gallons and the South Coast estimate is 7,227.",
  },
  {
    id: "kettle-life",
    kind: "assumption",
    title: "10,000-use electric-kettle life",
    publisher: "User-supplied scenario assumption",
    note:
      "The fixture allocates a $30 kettle and its embodied inputs across 10,000 one-liter heating cycles. This is not an observed reliability claim.",
  },
  {
    id: "water-split",
    kind: "assumption",
    title: "One-liter boiled-water engineering envelope",
    publisher: "CostFloor demo model",
    note:
      "Kettle efficiency is modeled at roughly 90/85/75 percent. Tap-water scarcity and kettle embodied inputs are deliberately broad scenario envelopes.",
  },
];

const laptopEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "laptop-price",
    kind: "observed",
    title: "Apple introduces MacBook Air with M5",
    publisher: "Apple",
    url: "https://www.apple.com/newsroom/2026/03/apple-introduces-the-new-macbook-air-with-m5/",
    note: "The 13-inch MacBook Air with M5 starts at $1,099 in the United States before sales tax.",
  },
  {
    id: "laptop-mass",
    kind: "observed",
    title: "MacBook Air (13-inch, M5) technical specifications",
    publisher: "Apple",
    url: "https://support.apple.com/en-us/126320",
    note: "Apple reports a product mass of 1.23 kg for the reference 13-inch configuration.",
  },
  {
    id: "laptop-production-energy",
    kind: "observed",
    title: "Life Cycle Assessment Data for Computer Products and Mobile Phones",
    publisher: "U.S. Environmental Protection Agency",
    url: "https://www.epa.gov/sites/production/files/2018-02/documents/lca_computer_-_phones.pdf",
    note:
      "EPA reports 232.58 kWh/kg for notebook production using a 2015 SimaPro model. At 1.23 kg, about 286 kWh is a cross-check envelope, not an additional branch.",
  },
  {
    id: "laptop-environment",
    kind: "observed",
    title: "MacBook Air (M5) Product Environmental Report",
    publisher: "Apple",
    url: "https://www.apple.com/environment/pdf/products/notebooks/MacBook_Air_M5_PER_Mar2026.pdf",
    note:
      "Apple reports a 119 kg CO2e footprint for the base 13-inch configuration. Carbon is used only as a boundary cross-check and is never converted to kWh.",
  },
  {
    id: "laptop-split",
    kind: "assumption",
    title: "Consumer-laptop cost and energy allocation",
    publisher: "CostFloor demo model",
    note:
      "Current-price branches reconcile to $1,099 but are not an audited Apple bill of materials. The EPA whole-product energy anchor is allocated rather than added twice.",
  },
];

const carEvidence: Evidence[] = [
  ...commonEvidence,
  {
    id: "car-price",
    kind: "observed",
    title: "2026 Toyota Corolla",
    publisher: "Toyota",
    url: "https://www.toyota.com/corolla/2026/",
    note: "Toyota lists a $23,125 starting MSRP for the 2026 Corolla before sales tax.",
  },
  {
    id: "car-mass",
    kind: "observed",
    title: "2026 Corolla LE specifications",
    publisher: "Toyota",
    url: "https://www.toyota.com/corolla/corolla-vs-civic/",
    note: "Toyota reports a 2,955 lb curb weight for the 2026 Corolla LE.",
  },
  {
    id: "car-material-composition",
    kind: "observed",
    title: "Quadrennial Technology Review: Concepts in Integrated Analysis",
    publisher: "U.S. Department of Energy",
    url: "https://www.energy.gov/sites/prod/files/2015/09/f26/QTR2015-10-Integrated-Analysis.pdf",
    note:
      "DOE's representative 2,900 lb conventional passenger car includes 1,900 lb steel, 310 lb cast iron, 193 lb aluminum, 320 lb plastic, and 300 lb rubber.",
  },
  {
    id: "car-material-energy",
    kind: "observed",
    title: "Sustainable Materials Selection in Manufactured Products",
    publisher: "U.S. Department of Energy",
    url: "https://www.energy.gov/sites/default/files/2023-09/Materials%20Substitution%20Working%20Report_August%202023_final_compliant_v2_0.pdf",
    note:
      "DOE reports 41.7/7.9 MJ/kg for primary/secondary steel and 136.5/13.6 MJ/kg for primary/secondary aluminum, illustrating the recycled-content sensitivity.",
  },
  {
    id: "greet-vehicle-cycle",
    kind: "observed",
    title: "Vehicle Production Pathways in GREET",
    publisher: "Argonne National Laboratory",
    url: "https://publications.anl.gov/anlpubs/2022/07/176270.pdf",
    note:
      "GREET defines the vehicle cycle from raw-material extraction through material processing, component manufacture, assembly, and end of life.",
  },
  {
    id: "car-split",
    kind: "assumption",
    title: "Representative passenger-car cost and energy allocation",
    publisher: "CostFloor demo model",
    note:
      "The 13.17–53.50 MWh-eq production envelope is a CostFloor synthesis, not a published Corolla-specific GREET result. Current-price branches are not an audited Toyota cost statement.",
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
  {
    id: "boiled-water",
    name: "Tap water heated to boiling",
    shortName: "Boiled water",
    unit: "1 L, heated once from 21°C to 100°C",
    region: "California household",
    currentPrice: 0.0266,
    aliases: ["boiled water", "hot water", "kettle water", "one liter boiled water"],
    description:
      "A physics-anchored validation case: nearly all of the functional-unit cost is the heat required to raise one liter of water by 79°C.",
    evidence: waterEvidence,
    root: root(
      "boiled-water-root",
      "Tap water heated to boiling",
      0.0266,
      [
        {
          id: "water-heat",
          label: "Kettle heating electricity",
          factor: "energy",
          currentCost: 0.0216,
          note:
            "Useful heat is 0.09186 kWh; the input envelope represents roughly 90, 85, and 75 percent kettle efficiency.",
          evidenceIds: ["water-thermodynamics", "water-split", "ca-electricity"],
          rule: { kind: "energy", kWh: r(0.102, 0.108, 0.123) },
        },
        {
          id: "water-supply",
          label: "Tap-water supply and scarcity",
          factor: "land",
          currentCost: 0.002,
          note:
            "Utility-system energy is separated from a small optional water-scarcity residual.",
          evidenceIds: ["water-system-energy", "california-water-energy", "water-split"],
          rule: {
            kind: "resource",
            processKWh: r(0.0004, 0.0015, 0.005),
            scarcityUsd: r(0.0005, 0.002, 0.006),
          },
        },
        {
          id: "water-kettle-capital",
          label: "Electric-kettle capital allocation",
          factor: "capital",
          currentCost: 0.003,
          note:
            "The current allocation is a $30 kettle divided by the user-supplied 10,000-use life; replacement removes that sticker allocation before adding physical inputs.",
          evidenceIds: ["kettle-life", "water-split", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "water-kettle",
              "Kettle embodied allocation",
              zero(),
              r(0.00152, 0.0031, 0.0085),
              r(0.00005, 0.0002, 0.0008),
              r(0.00002, 0.0001, 0.0005),
              ["kettle-life", "water-split", "ca-electricity"],
            ),
          },
        },
      ],
      ["water-split", "kettle-life"],
    ),
  },
  {
    id: "consumer-laptop",
    name: "13-inch MacBook Air (M5 class)",
    shortName: "Consumer laptop",
    unit: "one 13-inch laptop, purchase boundary",
    region: "United States retail / California scenario",
    currentPrice: 1_099,
    aliases: [
      "laptop",
      "consumer laptop",
      "macbook air",
      "13 inch laptop",
      "m5 macbook air",
    ],
    description:
      "A semiconductor-intensive purchase good whose manufacturing energy and scarce materials persist while labor, software, and tooling allocations compress.",
    evidence: laptopEvidence,
    root: root(
      "consumer-laptop-root",
      "13-inch MacBook Air (M5 class)",
      1_099,
      [
        {
          id: "laptop-margin",
          label: "Brand, retail and channel margin",
          factor: "margin",
          currentCost: 300,
          note: "A transparent demo allocation excluded from the physical production floor by default.",
          evidenceIds: ["laptop-price", "laptop-split"],
          rule: { kind: "exclude" },
        },
        {
          id: "laptop-components",
          label: "Components and material processing",
          factor: "material",
          currentCost: 360,
          note:
            "Semiconductors, display, battery, enclosure, boards, and upstream processing. The EPA whole-product energy anchor is allocated across this and other physical branches, not added again.",
          evidenceIds: ["laptop-production-energy", "laptop-environment", "laptop-split"],
          rule: {
            kind: "resource",
            processKWh: r(150, 235, 450),
            scarcityUsd: r(6, 20, 70),
          },
        },
        {
          id: "laptop-assembly",
          label: "Final assembly and test labor",
          factor: "labor",
          currentCost: 70,
          note: "Current labor is replaced with task electricity and an allocated share of automation equipment.",
          evidenceIds: ["laptop-split", "robot-envelope", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "laptop-assembly",
              "Automated assembly and test",
              r(0.5, 2, 8),
              r(1.5, 6, 25),
              r(0.2, 1, 5),
              r(0.02, 0.1, 0.5),
              ["laptop-split", "robot-envelope", "bounded-recursion"],
            ),
          },
        },
        {
          id: "laptop-engineering",
          label: "Engineering, software and support labor",
          factor: "labor",
          currentCost: 230,
          note:
            "Per-device allocation of pre-sale design, software, administration, and support work; lifetime device charging remains outside this purchase boundary.",
          evidenceIds: ["laptop-split", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "laptop-engineering",
              "Automated engineering and support",
              r(3, 12, 60),
              r(2, 8, 35),
              r(0.1, 0.5, 4),
              r(0.1, 0.5, 3),
              ["laptop-split", "bounded-recursion", "ca-electricity"],
            ),
          },
        },
        {
          id: "laptop-factory",
          label: "Factory and tooling capital",
          factor: "capital",
          currentCost: 80,
          note: "The productive asset is replaced by allocated fabrication, upkeep, scarce inputs, and tooling wear.",
          evidenceIds: ["laptop-split", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "laptop-factory",
              "Factory and tooling allocation",
              zero(),
              r(6, 25, 80),
              r(1, 5, 18),
              r(0.2, 1, 5),
              ["laptop-split", "bounded-recursion", "ca-electricity"],
            ),
          },
        },
        {
          id: "laptop-logistics",
          label: "Packaging, freight and distribution",
          factor: "capital",
          currentCost: 59,
          note:
            "A purchase-boundary allocation of packaging and inbound distribution; customer travel and use-phase charging are excluded.",
          evidenceIds: ["laptop-environment", "laptop-split"],
          rule: {
            kind: "resource",
            processKWh: r(10, 25, 75),
            scarcityUsd: r(1, 4, 15),
          },
        },
      ],
      ["laptop-price", "laptop-split"],
    ),
  },
  {
    id: "passenger-car",
    name: "2026 Toyota Corolla LE-class passenger car",
    shortName: "Passenger car",
    unit: "one new gasoline passenger car, purchase boundary",
    region: "United States retail / California scenario",
    currentPrice: 23_125,
    aliases: [
      "car",
      "passenger car",
      "consumer car",
      "toyota corolla",
      "corolla le",
      "gasoline car",
    ],
    description:
      "A material- and capital-intensive purchase good based on a compact gasoline passenger car; lifetime gasoline, repairs, and road use are outside the fixture boundary.",
    evidence: carEvidence,
    root: root(
      "passenger-car-root",
      "2026 Toyota Corolla LE-class passenger car",
      23_125,
      [
        {
          id: "car-margin",
          label: "Sales, brand, channel and profit allocation",
          factor: "margin",
          currentCost: 5_500,
          note: "A transparent reconciling assumption excluded from the physical production floor by default.",
          evidenceIds: ["car-price", "car-split"],
          rule: { kind: "exclude" },
        },
        {
          id: "car-components",
          label: "Vehicle materials and components",
          factor: "material",
          currentCost: 9_000,
          note:
            "Raw-material extraction, processing, and component manufacture. Any future whole-vehicle GREET result must replace this envelope rather than be added to it.",
          evidenceIds: [
            "car-mass",
            "car-material-composition",
            "car-material-energy",
            "greet-vehicle-cycle",
            "car-split",
          ],
          rule: {
            kind: "resource",
            processKWh: r(12_000, 22_000, 40_000),
            scarcityUsd: r(250, 800, 2_500),
          },
        },
        {
          id: "car-assembly",
          label: "Final assembly and test labor",
          factor: "labor",
          currentCost: 2_000,
          note: "Dexterous and supervisory assembly work is replaced with task energy plus automation inputs.",
          evidenceIds: ["car-split", "robot-envelope", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "car-assembly",
              "Automated vehicle assembly",
              r(50, 150, 500),
              r(100, 300, 1_000),
              r(20, 80, 300),
              r(5, 20, 100),
              ["car-split", "robot-envelope", "bounded-recursion"],
            ),
          },
        },
        {
          id: "car-engineering",
          label: "Engineering and administration labor",
          factor: "labor",
          currentCost: 2_500,
          note: "Per-vehicle allocation of design, software, planning, quality, and administrative work.",
          evidenceIds: ["car-split", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "car-engineering",
              "Automated engineering and administration",
              r(100, 500, 2_500),
              r(20, 100, 500),
              r(2, 10, 50),
              zero(),
              ["car-split", "bounded-recursion", "ca-electricity"],
            ),
          },
        },
        {
          id: "car-factory",
          label: "Plant and tooling capital",
          factor: "capital",
          currentCost: 2_500,
          note: "Factory structures and tooling are expanded into allocated energy, scarce inputs, upkeep, and wear.",
          evidenceIds: ["car-split", "bounded-recursion"],
          rule: {
            kind: "replace",
            replacement: terminalReplacement(
              "car-factory",
              "Vehicle plant and tooling allocation",
              zero(),
              r(600, 1_900, 6_500),
              r(100, 400, 1_500),
              r(20, 100, 500),
              ["car-split", "bounded-recursion", "greet-vehicle-cycle"],
            ),
          },
        },
        {
          id: "car-logistics",
          label: "Freight and distribution",
          factor: "capital",
          currentCost: 1_625,
          note: "Inbound and finished-vehicle distribution inside the purchase boundary; lifetime fuel is excluded.",
          evidenceIds: ["car-split", "greet-vehicle-cycle"],
          rule: {
            kind: "resource",
            processKWh: r(300, 800, 2_500),
            scarcityUsd: r(30, 100, 400),
          },
        },
      ],
      ["car-price", "car-split"],
    ),
  },
];

export const DEFAULT_PRODUCT = PRODUCTS[0];

const normalizeLookup = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const findProduct = (query: string): ProductModel | undefined => {
  const normalized = normalizeLookup(query);
  if (normalized.length < 2) return undefined;

  const names = (product: ProductModel) =>
    [product.name, product.shortName, ...product.aliases].map(normalizeLookup);

  const exact = PRODUCTS.filter((product) => names(product).includes(normalized));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;

  const paddedQuery = ` ${normalized} `;
  const phraseMatches = PRODUCTS.filter((product) =>
    names(product).some((name) => {
      if (!name.includes(" ")) return false;
      return paddedQuery.includes(` ${name} `);
    }),
  );
  return phraseMatches.length === 1 ? phraseMatches[0] : undefined;
};
