"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  FACTORS,
  currentBreakdown,
  evaluateNode,
  evaluateReplacement,
  ledgerRows,
  scenarioRange,
  sensitivity,
} from "./model/engine";
import { DEFAULT_PRODUCT, findProduct, PRODUCTS } from "./model/fixtures";
import type {
  CostNode,
  Evidence,
  Factor,
  ProductModel,
  ReplacementNode,
  Scenario,
} from "./model/types";

const DEFAULT_SCENARIO: Scenario = {
  electricityPrice: 0.2,
  robotEnergyMultiplier: 1,
  maxDepth: 5,
  retainScarcity: true,
  retainMargin: false,
  retainTax: false,
};

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

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);

const percent = (value: number) => `${Math.round(value * 100)}%`;

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
  const children = node.rule.kind === "recurse" ? node.rule.children : [];
  return (
    <li className="replacement-branch">
      <div className="replacement-row">
        <span className="replacement-line" aria-hidden="true" />
        <div>
          <span className="replacement-label">{node.label}</span>
          <span className="replacement-note">{node.note}</span>
        </div>
        <FactorKey factor={value.cutoffCount ? "unknown" : node.factor} />
        <span className="replacement-value">{scenarioRange(value.cost)}</span>
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
        <span className="branch-floor">{scenarioRange(automated.cost)}</span>
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
  const observedCost = rows
    .filter((row) =>
      row.evidenceIds.some((id) => model.evidence.find((entry) => entry.id === id)?.kind !== "assumption"),
    )
    .reduce((total, row) => total + row.currentCost, 0);
  const coverage = Math.min(1, observedCost / model.currentPrice);
  const drivers = sensitivity(model, scenario);

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
    const summary = `${model.shortName}: ${money(currentPrice)} today → ${scenarioRange(
      evaluation.cost,
    )} modeled automated resource floor (${percent(Math.max(0, reduction))} base reduction). CostFloor v0.1; scenario, not a price forecast.`;
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
                placeholder="Try: tea, T-shirt, flour"
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
                    min="0.01"
                    step="0.01"
                    value={currentPrice}
                    onChange={(event) => setCurrentPrice(Math.max(0.01, Number(event.target.value)))}
                    aria-label="Current retail price in dollars"
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
            <p className="model-disclaimer">Three auditable fixtures · ranges, not forecasts</p>
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
          <strong>{scenarioRange(evaluation.cost)}</strong>
          <span>{money(currentPrice)} current input · {money(evaluation.cost.base)} base case</span>
        </div>
        <div className="compression">
          <div className="compression-label">
            <span>BASE COST COMPRESSION</span>
            <strong>{reduction > 0 ? percent(reduction) : "NO DROP"}</strong>
          </div>
          <div className="compression-track" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, reduction * 100))}%` }} />
          </div>
          <p>Technological boundary scenario—not a prediction of what sellers will charge.</p>
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
            <strong>{scenarioRange(evaluation.cost)}</strong>
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
          <h2 id="scenario-title">Change the boundary.<br />Watch the floor move.</h2>
          <p>
            These controls are part of the answer. The prototype exposes uncertainty instead of
            hiding it behind a single authoritative-looking number.
          </p>
          <button className="text-button" type="button" onClick={() => setScenario(DEFAULT_SCENARIO)}>
            Reset baseline ↺
          </button>
        </div>
        <div className="scenario-controls">
          <label className="range-control">
            <span><b>Electricity price</b><strong>${scenario.electricityPrice.toFixed(2)} / kWh</strong></span>
            <input
              type="range"
              min="0.08"
              max="0.6"
              step="0.01"
              value={scenario.electricityPrice}
              onChange={(event) => setScenarioValue("electricityPrice", Number(event.target.value))}
            />
            <small>Applies to direct process energy and all recursively derived machine energy.</small>
          </label>
          <label className="range-control">
            <span><b>Robot task energy</b><strong>{scenario.robotEnergyMultiplier.toFixed(2)}×</strong></span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={scenario.robotEnergyMultiplier}
              onChange={(event) => setScenarioValue("robotEnergyMultiplier", Number(event.target.value))}
            />
            <small>Scales only the energy created by automation replacements.</small>
          </label>
          <label className="range-control">
            <span><b>Recursion depth</b><strong>{scenario.maxDepth} levels</strong></span>
            <input
              type="range"
              min="3"
              max="6"
              step="1"
              value={scenario.maxDepth}
              onChange={(event) => setScenarioValue("maxDepth", Number(event.target.value))}
            />
            <small>Deeper traces expose more embodied inputs; cutoffs become visible residuals.</small>
          </label>
          <div className="toggle-stack">
            <label className="switch-row">
              <span><b>Retain land & material scarcity</b><small>Keep ownership and scarcity residuals separate from energy.</small></span>
              <input
                type="checkbox"
                checked={scenario.retainScarcity}
                onChange={(event) => setScenarioValue("retainScarcity", event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            <label className="switch-row">
              <span><b>Retain current margin</b><small>Treat today's channel and brand margin as persistent.</small></span>
              <input
                type="checkbox"
                checked={scenario.retainMargin}
                onChange={(event) => setScenarioValue("retainMargin", event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
            <label className="switch-row">
              <span><b>Retain tax & policy costs</b><small>Keep current institutional charges in the scenario.</small></span>
              <input
                type="checkbox"
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
              <strong>±{money(driver.delta)}</strong>
            </div>
          ))}
          <small>Absolute change in base result under the documented perturbation.</small>
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
                  <td>{scenarioRange(row.automated.cost)}</td>
                  <td><EvidenceBadges ids={row.evidenceIds} evidence={model.evidence} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>RECONCILED TOTAL</td>
                <td>{money(currentPrice)}</td>
                <td>→</td>
                <td>{scenarioRange(evaluation.cost)}</td>
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
            <h2 id="comparison-title">Abundance arrives unevenly.</h2>
            <p>Labor-sensitive goods compress differently from already mechanized staples.</p>
          </div>
        </div>
        <div className="comparison-list">
          {PRODUCTS.map((product, index) => {
            const value = evaluateNode(product.root, scenario);
            const drop = Math.max(0, 1 - value.cost.base / product.currentPrice);
            return (
              <button key={product.id} type="button" onClick={() => chooseProduct(product)}>
                <span className="comparison-index">0{index + 1}</span>
                <span className="comparison-name"><b>{product.shortName}</b><small>{product.unit}</small></span>
                <span className="comparison-prices"><s>{money(product.currentPrice)}</s><b>{money(value.cost.base)}</b></span>
                <span className="comparison-bar"><i style={{ width: `${drop * 100}%` }} /></span>
                <strong>{percent(drop)} <i>↓</i></strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="method-section" id="method" aria-labelledby="method-title">
        <div className="method-statement">
          <p className="section-index">07 / METHOD</p>
          <h2 id="method-title">Not a prophecy.<br />A contestable accounting system.</h2>
        </div>
        <div className="method-steps">
          <article><span>01</span><div><h3>Reconcile today</h3><p>Normalize one functional unit and make every current dollar land in a visible branch.</p></div></article>
          <article><span>02</span><div><h3>Replace labor</h3><p>Convert a task into robot operating energy plus its allocated embodied capital.</p></div></article>
          <article><span>03</span><div><h3>Expand capital</h3><p>Open machinery into materials, fabrication energy, maintenance, and deeper automation.</p></div></article>
          <article><span>04</span><div><h3>Stop honestly</h3><p>At the selected depth, retain a bounded residual. Never turn uncertainty into zero.</p></div></article>
          <article><span>05</span><div><h3>Keep scarcity separate</h3><p>Land, matter, market power, tax, and ownership are scenario boundaries—not joules.</p></div></article>
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
