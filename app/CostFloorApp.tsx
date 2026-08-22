"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  FACTORS,
  currentBreakdown,
  evaluateNode,
  evaluateReplacement,
  ledgerRows,
  sensitivity,
} from "./model/engine";
import { DEFAULT_PRODUCT, findProduct, PRODUCTS } from "./model/fixtures";
import {
  DEFAULT_SCENARIO,
  ELECTRICITY_PRICE_PER_MWH,
  LOG_SLIDER,
  RECURSION_DEPTH,
  ROBOT_ENERGY_MULTIPLIER,
  logSliderToValue,
  quantizeLogValue,
  valueToLogSlider,
} from "./model/scenario";
import type {
  CostNode,
  Evidence,
  Factor,
  ProductModel,
  Range,
  ReplacementNode,
  Scenario,
} from "./model/types";

const FACTOR_LABELS: Record<Factor, string> = {
  labor: "Labor",
  capital: "Capital",
  energy: "Energy",
  material: "Materials",
  land: "Land / scarcity",
  margin: "Margin",
  tax: "Tax / policy",
  unknown: "Depth residual",
};

const money = (value: number) => {
  if (Math.abs(value) > 0 && Math.abs(value) < 0.1) {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(value * 100)}¢`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
};

const moneyRange = (value: Range) => `${money(value.low)}–${money(value.high)}`;

const percent = (value: number) => `${Math.round(value * 100)}%`;

const readableNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 3,
  }).format(value);

const electricityLabel = (value: number) => `$${readableNumber(value)} / MWh`;

const robotMultiplierLabel = (value: number) => `${readableNumber(value)}×`;

function FactorKey({ factor }: { factor: Factor }) {
  return (
    <span className={`factor-key factor-${factor}`}>
      <i aria-hidden="true" />
      {FACTOR_LABELS[factor]}
    </span>
  );
}

function EvidenceBadges({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  return (
    <span className="evidence-badges">
      {ids.slice(0, 2).map((id) => {
        const item = evidence.find((entry) => entry.id === id);
        if (!item) return null;
        return (
          <a key={id} href={`#source-${id}`} className={`evidence-chip evidence-${item.kind}`}>
            {item.kind}
          </a>
        );
      })}
    </span>
  );
}

function ReplacementBranch({
  node,
  scenario,
  evidence,
  depth,
}: {
  node: ReplacementNode;
  scenario: Scenario;
  evidence: Evidence[];
  depth: number;
}) {
  const value = evaluateReplacement(node, scenario, depth);
  const isCutoff = depth >= scenario.maxDepth;
  const children = !isCutoff && node.rule.kind === "recurse" ? node.rule.children : [];
  return (
    <li className={`replacement-branch${isCutoff ? " replacement-cutoff" : ""}`}>
      <div className="replacement-row">
        <span className="replacement-line" aria-hidden="true" />
        <div>
          <span className="replacement-label">{node.label}</span>
          <span className="replacement-note">{node.note}</span>
          {isCutoff && (
            <span className="replacement-cutoff-note">
              Depth {scenario.maxDepth} cutoff · bounded residual retained
            </span>
          )}
        </div>
        <FactorKey factor={value.cutoffCount ? "unknown" : node.factor} />
        <span className="replacement-value">{moneyRange(value.cost)}</span>
      </div>
      {children.length > 0 && (
        <ol className="replacement-tree">
          {children.map((child) => (
            <ReplacementBranch
              key={child.id}
              node={child}
              scenario={scenario}
              evidence={evidence}
              depth={depth + 1}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

function CostBranch({
  node,
  model,
  scenario,
  priceScale,
  initiallyOpen,
}: {
  node: CostNode;
  model: ProductModel;
  scenario: Scenario;
  priceScale: number;
  initiallyOpen: boolean;
}) {
  const automated = evaluateNode(node, scenario, 1);
  const replacement = node.rule.kind === "replace" ? node.rule.replacement : undefined;
  return (
    <details className={`cost-branch border-${node.factor}`} open={initiallyOpen}>
      <summary>
        <span className="branch-toggle" aria-hidden="true">+</span>
        <span className="branch-name">
          {node.label}
          <small>{node.note}</small>
        </span>
        <FactorKey factor={node.factor} />
        <span className="branch-current">{money(node.currentCost * priceScale)}</span>
        <span className="branch-arrow" aria-hidden="true">→</span>
        <span className="branch-floor">{moneyRange(automated.cost)}</span>
      </summary>
      <div className="branch-inspector">
        <div className="inspector-copy">
          <span>TREATMENT</span>
          <p>{automated.formulas[0]}</p>
        </div>
        <div className="inspector-copy">
          <span>EVIDENCE</span>
          <EvidenceBadges ids={node.evidenceIds} evidence={model.evidence} />
        </div>
        {automated.cutoffCount > 0 && (
          <p className="cutoff-note">
            {automated.cutoffCount} branch{automated.cutoffCount === 1 ? "" : "es"} reached the
            selected depth and became a visible residual range.
          </p>
        )}
        {replacement && (
          <div className="replacement-wrap">
            <p className="replacement-heading">BECOMES</p>
            <ol className="replacement-tree root-replacement">
              <ReplacementBranch
                node={replacement}
                scenario={scenario}
                evidence={model.evidence}
                depth={2}
              />
            </ol>
          </div>
        )}
      </div>
    </details>
  );
}

function CompositionBar({
  label,
  values,
  denominator,
  total,
}: {
  label: string;
  values: Partial<Record<Factor, number>>;
  denominator: number;
  total: number;
}) {
  return (
    <div className="composition-row">
      <div className="composition-meta">
        <span>{label}</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="composition-track" aria-label={`${label}: ${money(total)}`}>
        {FACTORS.map((factor) => {
          const value = values[factor] ?? 0;
          if (value <= 0) return null;
          return (
            <span
              key={factor}
              className={`composition-segment factor-${factor}`}
              style={{ width: `${Math.max(0.8, (value / denominator) * 100)}%` }}
              title={`${FACTOR_LABELS[factor]}: ${money(value)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function CostFloorApp() {
  const [model, setModel] = useState(DEFAULT_PRODUCT);
  const [query, setQuery] = useState(DEFAULT_PRODUCT.shortName);
  const [currentPrice, setCurrentPrice] = useState(DEFAULT_PRODUCT.currentPrice);
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [unsupported, setUnsupported] = useState("");
  const [copied, setCopied] = useState(false);

  const evaluation = useMemo(() => evaluateNode(model.root, scenario), [model, scenario]);
  const rows = useMemo(() => ledgerRows(model.root, scenario), [model, scenario]);
  const priceScale = currentPrice / model.currentPrice;
  const currentMix = currentBreakdown(model, currentPrice);
  const automatedMix = Object.fromEntries(
    FACTORS.map((factor) => [factor, evaluation.breakdown[factor].base]),
  ) as Record<Factor, number>;
  const reduction = 1 - evaluation.cost.base / currentPrice;
  const baseChangeLabel =
    reduction > 0
      ? `${percent(reduction)} LOWER`
      : reduction < 0
        ? `${percent(-reduction)} ABOVE`
        : "NO CHANGE";
  const observedCost = rows
    .filter((row) =>
      row.evidenceIds.some((id) => model.evidence.find((entry) => entry.id === id)?.kind !== "assumption"),
    )
    .reduce((total, row) => total + row.currentCost, 0);
  const coverage = Math.min(1, observedCost / model.currentPrice);
  const drivers = sensitivity(model, scenario);
  const comparisons = useMemo(
    () =>
      PRODUCTS.map((product) => {
        const value = evaluateNode(product.root, scenario);
        return {
          product,
          value,
          retainedShare: {
            low: value.cost.low / product.currentPrice,
            base: value.cost.base / product.currentPrice,
            high: value.cost.high / product.currentPrice,
          },
        };
      }),
    [scenario],
  );
  const comparisonCeiling = Math.max(
    1,
    Math.ceil(Math.max(...comparisons.map((item) => item.retainedShare.high)) * 4) / 4,
  );

  const chooseProduct = (next: ProductModel) => {
    setModel(next);
    setQuery(next.shortName);
    setCurrentPrice(next.currentPrice);
    setUnsupported("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = findProduct(query);
    if (!next) {
      setUnsupported(query.trim() || "that product");
      return;
    }
    chooseProduct(next);
    requestAnimationFrame(() =>
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const setScenarioValue = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    setScenario((current) => ({ ...current, [key]: value }));

  const copySummary = async () => {
    const changeSummary =
      reduction >= 0
        ? `${percent(reduction)} base reduction`
        : `${percent(-reduction)} above the current input`;
    const summary = `${model.shortName}: ${money(currentPrice)} today → ${moneyRange(
      evaluation.cost,
    )} modeled automated resource floor (${changeSummary}). CostFloor v0.1; scenario, not a price forecast.`;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const exportModel = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      disclaimer: "Automation-adjusted resource floor at today's energy prices; not a market-price forecast.",
      product: { ...model, currentPrice },
      scenario,
      result: evaluation,
      ledger: rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `costfloor-${model.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="CostFloor home">
          <span className="brand-mark" aria-hidden="true" />
          COSTFLOOR
        </a>
        <div className="nav-note">
          <span className="status-dot" aria-hidden="true" />
          MODEL v0.1 · CALIFORNIA
        </div>
        <div className="nav-actions">
          <a href="#trace">Trace</a>
          <a href="#method">Method</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">AUTOMATED ECONOMY LAB / 01</p>
          <h1>
            What remains<br />
            <span>when work disappears?</span>
          </h1>
          <p className="dek">
            Trace today&apos;s price through labor, capital, matter, land, and energy—then
            recursively replace automatable work to expose a physical and economic cost floor.
          </p>
          <div className="hero-principle">
            <span>THE RULE</span>
            <p>Replace human work. Expand machine capital. Never replace physics.</p>
          </div>
        </div>

        <aside className="model-card" aria-label="Product analysis controls">
          <div className="card-kicker">
            <span>TRACE A PRODUCT</span>
            <span>CURATED MVP</span>
          </div>
          <form onSubmit={submit}>
            <label className="search-label" htmlFor="product-search">PRODUCT OR GOOD</label>
            <div className="search-shell">
              <input
                id="product-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try: tea, laptop, car, boiled water"
                autoComplete="off"
              />
              <span aria-hidden="true">⌕</span>
            </div>
            <div className="form-grid">
              <label>
                <span>REGION</span>
                <input value="California" readOnly aria-label="Region" />
              </label>
              <label>
                <span>CURRENT PRICE</span>
                <span className="price-input">
                  <i>$</i>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={currentPrice}
                    onChange={(event) => setCurrentPrice(Math.max(0.0001, Number(event.target.value)))}
                    aria-label="Current input price in dollars"
                  />
                </span>
              </label>
            </div>
            <div className="example-list" aria-label="Available demo models">
              {PRODUCTS.map((product, index) => (
                <button
                  key={product.id}
                  className={product.id === model.id ? "active" : ""}
                  type="button"
                  onClick={() => chooseProduct(product)}
                >
                  <span>0{index + 1}</span>
                  {product.shortName}
                </button>
              ))}
            </div>
            <button className="analyze-button" type="submit">
              RUN RECURSIVE TRACE <span aria-hidden="true">→</span>
            </button>
          </form>
          {unsupported ? (
            <div className="unsupported" role="status">
              We don&apos;t have a traced model for “{unsupported}” yet. Choose the closest
              audited fixture above; the prototype never invents a decomposition silently.
            </div>
          ) : (
            <p className="model-disclaimer">
              {PRODUCTS.length} auditable fixtures · ranges, not forecasts
            </p>
          )}
        </aside>
      </section>

      <section className="result-strip" id="results" aria-label={`${model.shortName} result`}>
        <div className="result-heading">
          <span className="result-number">01</span>
          <div>
            <p>{model.shortName.toUpperCase()} / {model.unit.toUpperCase()}</p>
            <h2>Automation-adjusted resource floor</h2>
          </div>
        </div>
        <div className="result-metric">
          <strong>{moneyRange(evaluation.cost)}</strong>
          <span>
            {money(currentPrice)} input · {money(evaluation.cost.base)} base · {electricityLabel(scenario.electricityPricePerMWh)} · robot {robotMultiplierLabel(scenario.robotEnergyMultiplier)} · depth {scenario.maxDepth}
          </span>
        </div>
        <div className="compression">
          <div className="compression-label">
            <span>BASE FLOOR VS CURRENT</span>
            <strong>{baseChangeLabel}</strong>
          </div>
          <div className="compression-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, reduction * 100))}%` }} />
          </div>
          <p>Base compares the evaluated floor with the editable input; low and high endpoints propagate independently.</p>
        </div>
      </section>

      <section className="composition-section" aria-labelledby="composition-title">
        <div className="section-intro">
          <p className="section-index">02 / COMPOSITION</p>
          <div>
            <h2 id="composition-title">See what shrinks. See what survives.</h2>
            <p>{model.description}</p>
          </div>
        </div>
        <div className="composition-visual">
          <CompositionBar
            label="TODAY'S PRICE"
            values={currentMix}
            denominator={currentPrice}
            total={currentPrice}
          />
          <CompositionBar
            label="MODELED FLOOR"
            values={automatedMix}
            denominator={currentPrice}
            total={evaluation.cost.base}
          />
          <div className="composition-legend">
            {FACTORS.filter((factor) => (currentMix[factor] ?? 0) > 0 || automatedMix[factor] > 0).map(
              (factor) => <FactorKey factor={factor} key={factor} />,
            )}
          </div>
        </div>
        <div className="result-facts">
          <div>
            <span>SCENARIO RANGE</span>
            <strong>{moneyRange(evaluation.cost)}</strong>
            <p>Interval arithmetic across low/base/high inputs</p>
          </div>
          <div>
            <span>EVIDENCE COVERAGE</span>
            <strong>{percent(coverage)}</strong>
            <p>Share touching at least one observed or derived source</p>
          </div>
          <div>
            <span>DEPTH RESIDUALS</span>
            <strong>{evaluation.cutoffCount}</strong>
            <p>Branches bounded instead of silently becoming zero</p>
          </div>
        </div>
      </section>

      <section className="scenario-section" aria-labelledby="scenario-title">
        <div className="scenario-copy">
          <p className="section-index">03 / ASSUMPTIONS LAB</p>
          <h2 id="scenario-title">Perturb the scenario.<br />Re-evaluate every branch.</h2>
          <p>
            Logarithmic energy controls span three orders of magnitude. Depth and boundary
            switches are evaluated by the same typed graph used in the ledger and comparison.
          </p>
          <button className="text-button" type="button" onClick={() => setScenario(DEFAULT_SCENARIO)}>
            Reset baseline ↺
          </button>
        </div>
        <div className="scenario-controls">
          <label className="range-control">
            <span>
              <b>Electricity price</b>
              <strong>{electricityLabel(scenario.electricityPricePerMWh)}</strong>
            </span>
            <input
              type="range"
              min={LOG_SLIDER.min}
              max={LOG_SLIDER.max}
              step={LOG_SLIDER.step}
              value={valueToLogSlider(scenario.electricityPricePerMWh, ELECTRICITY_PRICE_PER_MWH)}
              aria-label="Electricity price"
              aria-valuetext={`${electricityLabel(scenario.electricityPricePerMWh)} on a logarithmic scale`}
              onChange={(event) =>
                setScenarioValue(
                  "electricityPricePerMWh",
                  quantizeLogValue(
                    logSliderToValue(Number(event.target.value), ELECTRICITY_PRICE_PER_MWH),
                    ELECTRICITY_PRICE_PER_MWH,
                  ),
                )
              }
            />
            <div className="range-scale" aria-hidden="true">
              <span>$1</span><span>LOG · 0.05 DECADE / STEP</span><span>$1,000</span>
            </div>
            <small>
              Multiplies every direct and derived kWh after converting $/MWh to $/kWh.
              Each step changes the value by about 12.2%.
            </small>
          </label>
          <label className="range-control">
            <span>
              <b>Robot task energy</b>
              <strong>{robotMultiplierLabel(scenario.robotEnergyMultiplier)}</strong>
            </span>
            <input
              type="range"
              min={LOG_SLIDER.min}
              max={LOG_SLIDER.max}
              step={LOG_SLIDER.step}
              value={valueToLogSlider(scenario.robotEnergyMultiplier, ROBOT_ENERGY_MULTIPLIER)}
              aria-label="Robot task energy multiplier"
              aria-valuetext={`${robotMultiplierLabel(scenario.robotEnergyMultiplier)} on a logarithmic scale`}
              onChange={(event) =>
                setScenarioValue(
                  "robotEnergyMultiplier",
                  quantizeLogValue(
                    logSliderToValue(Number(event.target.value), ROBOT_ENERGY_MULTIPLIER),
                    ROBOT_ENERGY_MULTIPLIER,
                  ),
                )
              }
            />
            <div className="range-scale" aria-hidden="true">
              <span>0.01×</span><span>LOG · 0.05 DECADE / STEP</span><span>10×</span>
            </div>
            <small>
              Scales task-runtime and AI energy inside labor replacements—not direct process,
              fabrication, or maintenance energy.
            </small>
          </label>
          <label className="range-control">
            <span><b>Recursion depth</b><strong>{scenario.maxDepth} levels</strong></span>
            <input
              type="range"
              min={RECURSION_DEPTH.min}
              max={RECURSION_DEPTH.max}
              step="1"
              value={scenario.maxDepth}
              aria-label="Maximum recursion depth"
              aria-valuetext={`${scenario.maxDepth} levels`}
              onChange={(event) => setScenarioValue("maxDepth", Number(event.target.value))}
            />
            <div className="range-scale" aria-hidden="true">
              <span>{RECURSION_DEPTH.min}</span><span>INTEGER CUTOFF</span><span>{RECURSION_DEPTH.max}</span>
            </div>
            <small>
              A replacement node at or beyond the cutoff becomes a bounded residual. A finite
              trace can terminate before the selected limit.
            </small>
          </label>
          <div className="toggle-stack">
            <label className="switch-row" htmlFor="retain-scarcity">
              <span><b>Retain land & material scarcity</b><small>Keep ownership and scarcity residuals separate from energy.</small></span>
              <input
                id="retain-scarcity"
                type="checkbox"
                aria-label="Retain land and material scarcity"
                checked={scenario.retainScarcity}
                onChange={(event) => setScenarioValue("retainScarcity", event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            <label className="switch-row" htmlFor="retain-margin">
              <span><b>Retain current margin</b><small>Treat today&apos;s channel and brand margin as persistent.</small></span>
              <input
                id="retain-margin"
                type="checkbox"
                aria-label="Retain current margin"
                checked={scenario.retainMargin}
                onChange={(event) => setScenarioValue("retainMargin", event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            <label className="switch-row" htmlFor="retain-tax">
              <span><b>Retain tax & policy costs</b><small>Keep current institutional charges in the scenario.</small></span>
              <input
                id="retain-tax"
                type="checkbox"
                aria-label="Retain tax and policy costs"
                checked={scenario.retainTax}
                onChange={(event) => setScenarioValue("retainTax", event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
          </div>
        </div>
        <aside className="sensitivity-panel">
          <p>TOP SENSITIVITY DRIVERS</p>
          {drivers.slice(0, 3).map((driver, index) => (
            <div key={driver.label}>
              <span>0{index + 1}</span>
              <b>{driver.label}</b>
              <strong>Δ {money(driver.delta)}</strong>
            </div>
          ))}
          <small>
            Absolute base-case change for the stated one-sided perturbation; not an error bar or
            confidence interval.
          </small>
        </aside>
      </section>

      <section className="trace-section" id="trace" aria-labelledby="trace-title">
        <div className="section-intro trace-intro">
          <p className="section-index">04 / RECURSIVE TRACE</p>
          <div>
            <h2 id="trace-title">Every change is inspectable.</h2>
            <p>Open a branch to see the formula, evidence class, and recursive replacement tree.</p>
          </div>
          <div className="trace-headings" aria-hidden="true">
            <span>FACTOR</span><span>TODAY</span><span>FLOOR RANGE</span>
          </div>
        </div>
        <div className="cost-tree">
          {model.root.children?.map((node, index) => (
            <CostBranch
              key={node.id}
              node={node}
              model={model}
              scenario={scenario}
              priceScale={priceScale}
              initiallyOpen={index === 1 || index === 2}
            />
          ))}
        </div>
      </section>

      <section className="ledger-section" aria-labelledby="ledger-title">
        <div className="section-intro">
          <p className="section-index">05 / TRANSFORMATION LEDGER</p>
          <div>
            <h2 id="ledger-title">The audit surface.</h2>
            <p>Today&apos;s dollars reconcile; automated inputs stay ranged and attributable.</p>
          </div>
          <div className="ledger-actions">
            <button type="button" onClick={copySummary}>{copied ? "Copied ✓" : "Copy result"}</button>
            <button type="button" onClick={exportModel}>Export JSON ↓</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Input</th>
                <th>Factor</th>
                <th>Today</th>
                <th>Treatment</th>
                <th>Automated range</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td><FactorKey factor={row.factor} /></td>
                  <td>{money(row.currentCost * priceScale)}</td>
                  <td>{row.treatment}</td>
                  <td>{moneyRange(row.automated.cost)}</td>
                  <td><EvidenceBadges ids={row.evidenceIds} evidence={model.evidence} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>RECONCILED TOTAL</td>
                <td>{money(currentPrice)}</td>
                <td>→</td>
                <td>{moneyRange(evaluation.cost)}</td>
                <td>{evaluation.cutoffCount} residuals</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="comparison-section" aria-labelledby="comparison-title">
        <div className="section-intro">
          <p className="section-index">06 / COMPARISON</p>
          <div>
            <h2 id="comparison-title">Compare what remains.</h2>
            <p>
              Each fixture&apos;s current price is normalized to 100%. The band spans low to high and
              the tick marks base; either can cross today&apos;s-price line.
            </p>
          </div>
        </div>
        <div className="comparison-list">
          <div className="comparison-axis" aria-hidden="true">
            <span>GOOD</span><span>CURRENT / BASE FLOOR</span><span>LOW—BASE—HIGH SHARE · TODAY = 100%</span><span>SHARE</span>
          </div>
          {comparisons.map(({ product, value, retainedShare }, index) => (
            <button
              key={product.id}
              type="button"
              className={product.id === model.id ? "active" : ""}
              aria-pressed={product.id === model.id}
              onClick={() => chooseProduct(product)}
            >
              <span className="comparison-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="comparison-name">
                <b>{product.shortName}</b><small>{product.unit}</small>
              </span>
              <span className="comparison-prices">
                <span>{money(product.currentPrice)} current</span>
                <b>{money(value.cost.base)} floor</b>
              </span>
              <span
                className="comparison-bar"
                role="img"
                aria-label={`${percent(retainedShare.low)} to ${percent(retainedShare.high)} retained; ${percent(retainedShare.base)} base case; current price is 100%`}
              >
                <i
                  style={{
                    left: `${(retainedShare.low / comparisonCeiling) * 100}%`,
                    width: `${((retainedShare.high - retainedShare.low) / comparisonCeiling) * 100}%`,
                  }}
                />
                <b style={{ left: `${(retainedShare.base / comparisonCeiling) * 100}%` }} />
                <em style={{ left: `${(1 / comparisonCeiling) * 100}%` }} />
              </span>
              <strong>
                {percent(retainedShare.base)} <i>{percent(retainedShare.low)}–{percent(retainedShare.high)}</i>
              </strong>
            </button>
          ))}
        </div>
      </section>

      <section className="method-section" id="method" aria-labelledby="method-title">
        <div className="method-statement">
          <p className="section-index">07 / METHOD</p>
          <h2 id="method-title">A typed accounting graph.<br />Not a price forecast.</h2>
        </div>
        <div className="method-steps">
          <article>
            <span>01</span>
            <div><h3>Reconcile one functional unit</h3><p>The current-cost children must sum to the fixture&apos;s retail price before any transformation is evaluated.</p></div>
          </article>
          <article>
            <span>02</span>
            <div><h3>Replace task labor</h3><p><code>task kWh × robot multiplier × ($/MWh ÷ 1,000)</code> prices task-runtime and AI energy; embodied machine inputs are added separately.</p></div>
          </article>
          <article>
            <span>03</span>
            <div><h3>Expand productive capital</h3><p>Machine price is replaced—not double-counted—with allocated materials, fabrication energy, tooling wear, and automated service branches.</p></div>
          </article>
          <article>
            <span>04</span>
            <div><h3>Keep physical and institutional boundaries explicit</h3><p>Electricity prices every kWh. The robot multiplier touches only tagged task-runtime energy. Scarcity, margin, and tax remain independent switches.</p></div>
          </article>
          <article>
            <span>05</span>
            <div><h3>Terminate with a bound</h3><p>A replacement node at <code>depth ≥ maximum depth</code>, or a detected cycle, becomes a low/base/high residual. Terminal physics may end a trace earlier.</p></div>
          </article>
          <article>
            <span>06</span>
            <div><h3>Propagate intervals, not probabilities</h3><p>Low, base, and high endpoints add through the graph. The range is a contestable scenario envelope—not a confidence interval or seller-price prediction.</p></div>
          </article>
        </div>
      </section>

      <section className="sources-section" aria-labelledby="sources-title">
        <div className="sources-heading">
          <p className="section-index">SOURCES / PROVENANCE</p>
          <h2 id="sources-title">Observed. Derived. Assumed.</h2>
          <p>Prototype inputs are labeled by what they actually are. Click any source-backed item to inspect it.</p>
        </div>
        <div className="source-list">
          {model.evidence.map((item, index) => (
            <article key={item.id} id={`source-${item.id}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className={`source-kind evidence-${item.kind}`}>{item.kind}</p>
                <h3>
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a> : item.title}
                </h3>
                <p>{item.publisher}</p>
                <small>{item.note}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-brand">COSTFLOOR<span>•</span></div>
        <p>See what remains when work is automated.</p>
        <p>Hackathon prototype · Model v0.1 · California · 2026</p>
      </footer>
    </main>
  );
}
