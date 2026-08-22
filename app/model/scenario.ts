import type { Scenario } from "./types";

export type NumericBounds = {
  min: number;
  max: number;
  default: number;
};

export const ELECTRICITY_PRICE_PER_MWH: NumericBounds = {
  min: 1,
  max: 1_000,
  default: 200,
};

export const ROBOT_ENERGY_MULTIPLIER: NumericBounds = {
  min: 0.01,
  max: 10,
  default: 1,
};

export const RECURSION_DEPTH: NumericBounds = {
  min: 3,
  max: 20,
  default: 5,
};

export const LOG_SLIDER = {
  min: 0,
  max: 60,
  step: 1,
} as const;

export const DEFAULT_SCENARIO: Scenario = {
  electricityPricePerMWh: ELECTRICITY_PRICE_PER_MWH.default,
  robotEnergyMultiplier: ROBOT_ENERGY_MULTIPLIER.default,
  maxDepth: RECURSION_DEPTH.default,
  retainScarcity: true,
  retainMargin: false,
  retainTax: false,
};

export const electricityPricePerKWh = (electricityPricePerMWh: number) =>
  electricityPricePerMWh / 1_000;

const requireLogBounds = (bounds: Pick<NumericBounds, "min" | "max">) => {
  if (
    !Number.isFinite(bounds.min) ||
    !Number.isFinite(bounds.max) ||
    bounds.min <= 0 ||
    bounds.max <= bounds.min
  ) {
    throw new RangeError("Logarithmic controls require finite bounds where 0 < min < max.");
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const logSliderToValue = (
  position: number,
  bounds: Pick<NumericBounds, "min" | "max">,
) => {
  requireLogBounds(bounds);
  const normalized = clamp(position, LOG_SLIDER.min, LOG_SLIDER.max) / LOG_SLIDER.max;
  return bounds.min * (bounds.max / bounds.min) ** normalized;
};

export const valueToLogSlider = (
  value: number,
  bounds: Pick<NumericBounds, "min" | "max">,
) => {
  requireLogBounds(bounds);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("A logarithmic control value must be finite and positive.");
  }
  const clamped = clamp(value, bounds.min, bounds.max);
  const normalized = Math.log(clamped / bounds.min) / Math.log(bounds.max / bounds.min);
  return normalized * LOG_SLIDER.max;
};

export const quantizeLogValue = (
  value: number,
  bounds: Pick<NumericBounds, "min" | "max">,
  steps = LOG_SLIDER.max,
) => {
  if (!Number.isInteger(steps) || steps <= 0) {
    throw new RangeError("Logarithmic quantization requires a positive integer step count.");
  }
  const position = valueToLogSlider(value, bounds);
  const quantizedPosition = Math.round((position / LOG_SLIDER.max) * steps) / steps;
  const quantized = bounds.min * (bounds.max / bounds.min) ** quantizedPosition;
  return Number(quantized.toPrecision(12));
};
