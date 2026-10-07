"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { ACTIVE_STRATEGY_STORAGE_KEY, STRATEGY_CATALOG, type StrategyKey } from "@/lib/analysisCatalog";
import {
  DEFAULT_SIGNAL_CONFIG,
  SIGNAL_CONFIG_STORAGE_KEY,
  SIGNAL_DELIVERY_LOG_KEY,
  SIGNAL_TIMEFRAMES,
  readSignalConfig,
  type SignalConfig,
  type SignalDelivery,
  type SignalSide,
  type SignalTimeframe,
} from "@/lib/signalConfig";

const AVAILABLE_MARKETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK"];

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function SignalsPage() {
  const [config, setConfig] = useState<SignalConfig>(DEFAULT_SIGNAL_CONFIG);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [deliveries, setDeliveries] = useState<SignalDelivery[]>([]);

  useEffect(() => {
    const storedStateTimer = window.setTimeout(() => {
      setConfig(readSignalConfig());
      try { setDeliveries(JSON.parse(localStorage.getItem(SIGNAL_DELIVERY_LOG_KEY) || "[]")); } catch { setDeliveries([]); }
    }, 0);
    fetch("/api/signals/telegram", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => setConfigured(Boolean(payload.configured)))
      .catch(() => setConfigured(false));
    return () => window.clearTimeout(storedStateTimer);
  }, []);

  function save() {
    const strategies = config.strategies.length ? config.strategies : DEFAULT_SIGNAL_CONFIG.strategies;
    const onlyProfitGuard = strategies.every((strategy) => strategy === "profit-guard");
    const normalized = {
      ...config,
      strategy: strategies[0],
      strategies,
      sides: onlyProfitGuard ? ["SELL" as const] : config.sides,
      consensusMinimum: Math.max(1, Math.min(strategies.length, Number(config.consensusMinimum) || Math.min(2, strategies.length))),
      minProfitPercent: Math.max(0.1, Math.min(100, Number(config.minProfitPercent) || DEFAULT_SIGNAL_CONFIG.minProfitPercent)),
      trailingPullbackPercent: Math.max(0.1, Math.min(50, Number(config.trailingPullbackPercent) || DEFAULT_SIGNAL_CONFIG.trailingPullbackPercent)),
    };
    setConfig(normalized);
    localStorage.setItem(SIGNAL_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    localStorage.setItem(ACTIVE_STRATEGY_STORAGE_KEY, normalized.strategy);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  function toggleStrategy(strategy: StrategyKey) {
    const next = toggleValue(config.strategies, strategy);
    if (!next.length) return;
    const onlyProfitGuard = next.every((item) => item === "profit-guard");
    setConfig({
      ...config,
      strategy: next[0],
      strategies: next,
      sides: onlyProfitGuard ? ["SELL"] : config.sides,
      consensusMinimum: Math.max(1, Math.min(next.length, config.consensusMinimum)),
    });
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage("");
    try {
      const response = await fetch("/api/signals/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: config.chatId, test: true }),
      });
      const payload = await response.json() as { delivered?: boolean; error?: string };
      if (!response.ok || !payload.delivered) throw new Error(payload.error || "Test delivery failed");
      setTestMessage("Test alert delivered to Telegram.");
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "Test delivery failed");
    } finally { setTesting(false); }
  }

  const onlyProfitGuard = config.strategies.every((strategy) => strategy === "profit-guard");
  const ready = configured && Boolean(config.chatId) && config.strategies.length > 0 && config.timeframes.length > 0 && config.markets.length > 0 && config.sides.length > 0;
  const previewSide = onlyProfitGuard ? "SELL" : "BUY";
  const previewStrategy = config.strategyMode === "consensus"
    ? `Consensus (${config.consensusMinimum}/${config.strategies.length})`
    : config.strategies.map((key) => STRATEGY_CATALOG.find((item) => item.key === key)?.name ?? key).join(", ");

  return (
    <main className="app-shell subpage-shell signals-shell">
      <AppHeader active="signals" />
      <section className="subpage-hero signals-hero">
        <div><p className="eyebrow">External automation</p><h1>Signal delivery</h1><p>Run several strategies together and send either each confirmed event or only a consensus BUY or SELL alert.</p></div>
        <div className={`signal-status-card panel ${ready && config.enabled ? "ready" : ""}`}><i /><div><b>{ready && config.enabled ? "Alerts armed" : "Setup required"}</b><span>{configured ? config.enabled ? "Watching for the next confirmed candle." : "Configuration saved with delivery paused." : "Telegram bot token is not configured on the server."}</span></div><span className="signal-status-label">{config.enabled ? "ON" : "OFF"}</span></div>
      </section>

      <div className="signals-layout">
        <section className="signal-config-panel panel">
          <div className="signal-section-head"><div><p className="eyebrow">Destination</p><h2>Telegram</h2></div><span className={`integration-state ${configured ? "connected" : ""}`}><i />{configured ? "Bot token ready" : "Token missing"}</span></div>
          <div className="signal-form-grid">
            <label className="signal-field"><span>Delivery channel</span><select value="telegram" disabled><option>Telegram bot</option></select><small>The bot token stays in the server environment.</small></label>
            <label className="signal-field"><span>Chat ID or channel</span><input value={config.chatId} onChange={(event) => setConfig({ ...config, chatId: event.target.value })} placeholder="-1001234567890 or @channel" /><small>Add the bot to the chat or channel before testing.</small></label>
          </div>
          <div className="signal-test-row"><button onClick={() => void sendTest()} disabled={testing || !config.chatId}>{testing ? "Sending…" : "Send test alert"}</button><span className={testMessage.startsWith("Test") ? "success" : ""}>{testMessage || "Confirm the destination before enabling live alerts."}</span></div>

          <div className="signal-divider" />
          <div className="signal-section-head"><div><p className="eyebrow">Trigger</p><h2>Strategies & direction</h2></div></div>
          <div className="signal-choice-group"><span>Delivery logic</span><div>{(["individual", "consensus"] as const).map((mode) => <button key={mode} className={config.strategyMode === mode ? "selected" : ""} onClick={() => setConfig({ ...config, strategyMode: mode })}>{mode === "individual" ? "Each strategy" : "Consensus only"}</button>)}</div></div>
          <div className="signal-choice-group strategy-choices"><span>Strategies</span><div>{STRATEGY_CATALOG.map((strategy) => <button key={strategy.key} className={config.strategies.includes(strategy.key) ? "selected" : ""} onClick={() => toggleStrategy(strategy.key)}><i style={{ background: config.strategies.includes(strategy.key) ? "currentColor" : undefined }} />{strategy.name}<small>{strategy.version}</small></button>)}</div></div>
          {config.strategyMode === "consensus" && <div className="signal-form-grid consensus-settings"><label className="signal-field"><span>Minimum agreement</span><input type="number" min="1" max={config.strategies.length} step="1" value={config.consensusMinimum} onChange={(event) => setConfig({ ...config, consensusMinimum: Math.max(1, Math.min(config.strategies.length, Number(event.target.value) || 1)) })} /><small>At least this many selected strategies must agree on the same direction.</small></label></div>}
          {config.strategies.includes("profit-guard") && <div className="signal-form-grid profit-guard-settings">
            <label className="signal-field"><span>Minimum profit to arm (%)</span><input type="number" min="0.1" max="100" step="0.1" value={config.minProfitPercent} onChange={(event) => setConfig({ ...config, minProfitPercent: Number(event.target.value) })} /><small>The position must first rise this far above its average buy price.</small></label>
            <label className="signal-field"><span>Pullback from peak (%)</span><input type="number" min="0.1" max="50" step="0.1" value={config.trailingPullbackPercent} onChange={(event) => setConfig({ ...config, trailingPullbackPercent: Number(event.target.value) })} /><small>After arming, a confirmed close this far below the highest price signals SELL.</small></label>
          </div>}
          <div className="signal-choice-group"><span>Directions</span><div>{(["BUY", "SELL"] as SignalSide[]).map((side) => <button key={side} disabled={onlyProfitGuard && side === "BUY"} className={`${config.sides.includes(side) ? "selected" : ""} ${side.toLowerCase()}`} onClick={() => setConfig({ ...config, sides: toggleValue(config.sides, side) })}><i />{side}</button>)}</div></div>

          <div className="signal-divider" />
          <div className="signal-section-head"><div><p className="eyebrow">Scope</p><h2>Timeframes & markets</h2></div></div>
          <div className="signal-choice-group"><span>Timeframes</span><div>{SIGNAL_TIMEFRAMES.map((frame) => <button key={frame} className={config.timeframes.includes(frame) ? "selected" : ""} onClick={() => setConfig({ ...config, timeframes: toggleValue(config.timeframes, frame as SignalTimeframe) })}>{frame}</button>)}</div></div>
          <div className="signal-choice-group market-choices"><span>Markets</span><div>{AVAILABLE_MARKETS.map((market) => <button key={market} className={config.markets.includes(market) ? "selected" : ""} onClick={() => setConfig({ ...config, markets: toggleValue(config.markets, market) })}>{market}<small>/USDT</small></button>)}</div></div>

          <div className="signal-save-bar"><label><input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} /><span><b>Enable signal delivery</b><small>The dashboard scans all selected market/timeframe combinations every 30 seconds while it is open.</small></span></label><button className="save-signal" onClick={save}>{saved ? "✓ Saved" : "Save configuration"}</button></div>
        </section>

        <aside className="signal-side-column">
          <section className="panel signal-preview">
            <p className="eyebrow">Message preview</p><div className="telegram-bubble"><span>TradePilot bot</span><b>{previewSide === "SELL" ? "🔴" : "🟢"} {previewSide} BTC/USDT</b><p>Price: <code>$83,022.29</code><br />Timeframe: <strong>{config.timeframes[0] || "—"}</strong><br />Mode: {config.strategyMode === "consensus" ? "Consensus only" : "Individual events"}<br />Strategy: {previewStrategy}{config.strategies.includes("profit-guard") && <><br />Profit Guard: +{config.minProfitPercent}% arm · {config.trailingPullbackPercent}% trail</>}</p><small>Decision support only — not financial advice.</small></div>
          </section>
          <section className="panel delivery-log">
            <div className="signal-section-head"><div><p className="eyebrow">Recent</p><h2>Delivery log</h2></div><span>{deliveries.length}</span></div>
            {deliveries.length ? deliveries.slice(0, 6).map((item) => <div className="delivery-row" key={item.id}><i className={item.status} /><div><b>{item.side} {item.symbol}/USDT</b><span>{item.timeframe} · {item.strategy}</span></div><time>{new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>) : <div className="empty-deliveries"><span>↗</span><b>No alerts sent yet</b><p>The first new confirmed signal will appear here after delivery.</p></div>}
          </section>
          <section className="panel signal-server-note"><span>i</span><p><b>Server setup</b>Add <code>TELEGRAM_BOT_TOKEN</code> to <code>.env</code> and restart the app. The token is never returned to the browser.</p></section>
        </aside>
      </div>
      <footer><p>Signal alerts are decision-support notifications, not trade instructions.</p><span>External signals <i /> {ready && config.enabled ? "Armed" : "Paused"}</span></footer>
    </main>
  );
}
