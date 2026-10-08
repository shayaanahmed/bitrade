import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSignalConfig } from "../lib/signalConfig";
import { strategySignals, type SignalCandle } from "../lib/signalEngine";

function candles(closes: number[]): SignalCandle[] {
  return closes.map((close, index) => ({
    openTime: index * 60_000,
    open: index ? closes[index - 1] : close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 10,
  }));
}

test("normalizes server-side signal configuration", () => {
  const config = normalizeSignalConfig({
    enabled: true,
    chatId: " 123456 ",
    strategies: ["ema-cross", "not-a-strategy", "ema-cross"],
    strategyMode: "consensus",
    consensusMinimum: 99,
    timeframes: ["5m", "2m"],
    markets: ["BTC", "UNKNOWN", "BTC"],
    sides: ["BUY", "INVALID"],
    minProfitPercent: -2,
    trailingPullbackPercent: 500,
  });

  assert.equal(config.enabled, true);
  assert.equal(config.chatId, "123456");
  assert.deepEqual(config.strategies, ["ema-cross"]);
  assert.equal(config.consensusMinimum, 1);
  assert.deepEqual(config.timeframes, ["5m"]);
  assert.deepEqual(config.markets, ["BTC"]);
  assert.deepEqual(config.sides, ["BUY"]);
  assert.equal(config.minProfitPercent, 0.1);
  assert.equal(config.trailingPullbackPercent, 50);
});

test("detects an EMA buy crossover on confirmed candle data", () => {
  const closes = [...Array(30).fill(100), ...Array(10).fill(90), 91, 93, 96, 100, 105, 110];
  const result = strategySignals("ema-cross", candles(closes));

  assert.equal(result.signal, "BUY");
  assert.ok(result.buy >= 40);
  assert.equal(result.sell < result.buy, true);
});

test("profit guard never creates a buy event", () => {
  const result = strategySignals("profit-guard", candles([100, 103, 104, 101]), {
    entryPrice: 100,
    minProfitPercent: 2,
    trailingPullbackPercent: 1.5,
  });

  assert.equal(result.buy, -1);
  assert.equal(result.signal, "SELL");
});
