import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNode, validateModel } from "../app/model/engine";
import { findProduct, PRODUCTS } from "../app/model/fixtures";
import type { Scenario } from "../app/model/types";

const baseline: Scenario = {
  electricityPrice: 0.2,
  robotEnergyMultiplier: 1,
  maxDepth: 5,
  retainScarcity: true,
  retainMargin: false,
  retainTax: false,
};

test("every fixture reconciles to its current price", () => {
  for (const product of PRODUCTS) {
    assert.deepEqual(validateModel(product), [], product.name);
  }
});

test("every modeled range is ordered, positive, and below today's demo price", () => {
  for (const product of PRODUCTS) {
    const value = evaluateNode(product.root, baseline).cost;
    assert.ok(value.low >= 0, product.name);
    assert.ok(value.low <= value.base, product.name);
    assert.ok(value.base <= value.high, product.name);
    assert.ok(value.base < product.currentPrice, product.name);
  }
});

test("scenario boundaries move the result in the expected direction", () => {
  const product = PRODUCTS[0];
  const base = evaluateNode(product.root, baseline).cost.base;
  const highEnergy = evaluateNode(product.root, { ...baseline, electricityPrice: 0.5 }).cost.base;
  const noScarcity = evaluateNode(product.root, { ...baseline, retainScarcity: false }).cost.base;
  const withMargin = evaluateNode(product.root, { ...baseline, retainMargin: true }).cost.base;

  assert.ok(highEnergy > base);
  assert.ok(noScarcity < base);
  assert.ok(withMargin > base);
});

test("shallower recursion creates visible cutoff residuals", () => {
  const deep = evaluateNode(PRODUCTS[0].root, baseline);
  const shallow = evaluateNode(PRODUCTS[0].root, { ...baseline, maxDepth: 3 });
  assert.ok(shallow.cutoffCount > 0);
  assert.notEqual(shallow.cost.base, deep.cost.base);
});

test("free-text lookup resolves only curated fixtures", () => {
  assert.equal(findProduct("one cotton t-shirt")?.id, "cotton-shirt");
  assert.equal(findProduct("premium green tea")?.id, "premium-tea");
  assert.equal(findProduct("ceramic violin"), undefined);
});
