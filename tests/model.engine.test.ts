import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNode, validateModel } from "../app/model/engine";
import { findProduct, PRODUCTS } from "../app/model/fixtures";
import {
  DEFAULT_SCENARIO,
  ELECTRICITY_PRICE_PER_MWH,
  LOG_SLIDER,
  ROBOT_ENERGY_MULTIPLIER,
  electricityPricePerKWh,
  logSliderToValue,
  quantizeLogValue,
  valueToLogSlider,
} from "../app/model/scenario";
import type { CostNode, ProductModel, Range, Scenario } from "../app/model/types";

const baseline: Scenario = DEFAULT_SCENARIO;

const product = (id: string): ProductModel => {
  const match = PRODUCTS.find((item) => item.id === id);
  assert.ok(match, `Missing fixture ${id}`);
  return match;
};

const child = (model: ProductModel, id: string): CostNode => {
  const match = model.root.children?.find((item) => item.id === id);
  assert.ok(match, `Missing node ${id}`);
  return match;
};

const assertClose = (actual: number, expected: number, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${expected}, received ${actual}`,
  );
};

const assertRangeClose = (actual: Range, expected: Range, epsilon = 1e-9) => {
  assertClose(actual.low, expected.low, epsilon);
  assertClose(actual.base, expected.base, epsilon);
  assertClose(actual.high, expected.high, epsilon);
};

test("every fixture reconciles to its current price", () => {
  assert.equal(PRODUCTS.length, 6);
  for (const item of PRODUCTS) {
    assert.deepEqual(validateModel(item), [], item.name);
  }
});

test("every modeled scenario envelope is nonnegative and ordered", () => {
  for (const item of PRODUCTS) {
    const value = evaluateNode(item.root, baseline).cost;
    assert.ok(value.low >= 0, item.name);
    assert.ok(value.low <= value.base, item.name);
    assert.ok(value.base <= value.high, item.name);
    assert.ok(value.base < item.currentPrice, item.name);
  }
});

test("new fixtures retain their agreed default floors", () => {
  assertRangeClose(evaluateNode(product("boiled-water").root, baseline).cost, {
    low: 0.021354,
    base: 0.02482,
    high: 0.0346,
  });
  assertRangeClose(evaluateNode(product("consumer-laptop").root, baseline).cost, {
    low: 43.22,
    base: 94.7,
    high: 267.1,
  });
  assertRangeClose(evaluateNode(product("passenger-car").root, baseline).cost, {
    low: 3_061,
    base: 6_660,
    high: 16_050,
  });
});

test("scenario boundaries move the result in the expected direction", () => {
  const item = product("premium-tea");
  const base = evaluateNode(item.root, baseline).cost.base;
  const highEnergy = evaluateNode(item.root, {
    ...baseline,
    electricityPricePerMWh: 500,
  }).cost.base;
  const noScarcity = evaluateNode(item.root, { ...baseline, retainScarcity: false }).cost.base;
  const withMargin = evaluateNode(item.root, { ...baseline, retainMargin: true }).cost.base;

  assert.ok(highEnergy > base);
  assert.ok(noScarcity < base);
  assert.ok(withMargin > base);
});

test("robot multiplier scales task energy but not direct or embodied energy", () => {
  const water = product("boiled-water");
  const laptop = product("consumer-laptop");
  const scaled = { ...baseline, robotEnergyMultiplier: 10 };

  const directBase = evaluateNode(child(water, "water-heat"), baseline).cost;
  const directScaled = evaluateNode(child(water, "water-heat"), scaled).cost;
  assert.deepEqual(directScaled, directBase);

  const embodiedBase = evaluateNode(child(laptop, "laptop-factory"), baseline).cost;
  const embodiedScaled = evaluateNode(child(laptop, "laptop-factory"), scaled).cost;
  assert.deepEqual(embodiedScaled, embodiedBase);

  const taskBase = evaluateNode(child(laptop, "laptop-assembly"), baseline).cost.base;
  const taskScaled = evaluateNode(child(laptop, "laptop-assembly"), scaled).cost.base;
  assert.ok(taskScaled > taskBase);

  const laptopBase = evaluateNode(laptop.root, baseline).cost.base;
  const laptopDoubleTask = evaluateNode(laptop.root, {
    ...baseline,
    robotEnergyMultiplier: 2,
  }).cost.base;
  assertClose(laptopDoubleTask - laptopBase, 2.8);
});

test("physical depth fallbacks keep controls live at shallow depth", () => {
  const item = product("premium-tea");
  const shallow = { ...baseline, maxDepth: 3 };
  const result = evaluateNode(item.root, shallow);
  const expensiveEnergy = evaluateNode(item.root, {
    ...shallow,
    electricityPricePerMWh: 400,
  });
  const noScarcity = evaluateNode(item.root, { ...shallow, retainScarcity: false });

  assert.ok(result.cutoffCount > 0);
  assert.ok(expensiveEnergy.cost.base > result.cost.base);
  assert.ok(noScarcity.cost.base < result.cost.base);
});

test("depth 20 terminates safely and converges after the finite trace is exhausted", () => {
  for (const item of PRODUCTS) {
    const depthSeven = evaluateNode(item.root, { ...baseline, maxDepth: 7 });
    const depthTwenty = evaluateNode(item.root, { ...baseline, maxDepth: 20 });
    assert.equal(depthTwenty.cutoffCount, 0, item.name);
    assertRangeClose(depthTwenty.cost, depthSeven.cost, 1e-8);
  }
});

test("logarithmic scenario helpers preserve endpoints and round-trip", () => {
  assert.equal(electricityPricePerKWh(200), 0.2);
  assert.equal(logSliderToValue(LOG_SLIDER.min, ELECTRICITY_PRICE_PER_MWH), 1);
  assert.equal(logSliderToValue(LOG_SLIDER.max, ELECTRICITY_PRICE_PER_MWH), 1_000);
  assert.equal(logSliderToValue(LOG_SLIDER.min, ROBOT_ENERGY_MULTIPLIER), 0.01);
  assert.equal(logSliderToValue(LOG_SLIDER.max, ROBOT_ENERGY_MULTIPLIER), 10);

  for (const value of [1, 10, 200, 1_000]) {
    const position = valueToLogSlider(value, ELECTRICITY_PRICE_PER_MWH);
    assertClose(logSliderToValue(position, ELECTRICITY_PRICE_PER_MWH), value, 1e-8);
  }
  assertClose(quantizeLogValue(203, ELECTRICITY_PRICE_PER_MWH), 199.526231497, 1e-9);
  assert.throws(
    () => valueToLogSlider(0, ELECTRICITY_PRICE_PER_MWH),
    /finite and positive/,
  );
});

test("free-text lookup uses exact aliases and unambiguous multiword phrases", () => {
  assert.equal(findProduct("one cotton t-shirt")?.id, "cotton-shirt");
  assert.equal(findProduct("premium green tea")?.id, "premium-tea");
  assert.equal(findProduct("MacBook Air")?.id, "consumer-laptop");
  assert.equal(findProduct("a new Toyota Corolla")?.id, "passenger-car");
  assert.equal(findProduct("one liter boiled water")?.id, "boiled-water");
  assert.equal(findProduct("tea")?.id, "premium-tea");
  assert.equal(findProduct("t"), undefined);
  assert.equal(findProduct("tea kettle"), undefined);
  assert.equal(findProduct("ceramic violin"), undefined);
});
