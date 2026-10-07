"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";

type Asset = {
  symbol: string;
  amount: number;
  free: number;
  locked: number;
  price: number;
  value: number;
  averageBuyPrice: number | null;
  returnPercent: number | null;
  unrealizedPnl: number | null;
  costBasisCoverage: number;
  costBasisSource: "trade-history" | "partial-history" | "stablecoin" | "unavailable";
};

const DEMO_ASSETS: Asset[] = [
  { symbol: "USDT", amount: 12480, free: 11280, locked: 1200, price: 1, value: 12480, averageBuyPrice: 1, returnPercent: 0, unrealizedPnl: 0, costBasisCoverage: 1, costBasisSource: "stablecoin" },
  { symbol: "BTC", amount: 0.248, free: 0.23, locked: 0.018, price: 83022.3, value: 20589.53, averageBuyPrice: 71850, returnPercent: 15.55, unrealizedPnl: 2770.73, costBasisCoverage: 1, costBasisSource: "trade-history" },
  { symbol: "ETH", amount: 2.64, free: 2.64, locked: 0, price: 4267.92, value: 11267.31, averageBuyPrice: 3980, returnPercent: 7.23, unrealizedPnl: 760.11, costBasisCoverage: 1, costBasisSource: "trade-history" },
  { symbol: "SOL", amount: 18.5, free: 16, locked: 2.5, price: 278.42, value: 5150.77, averageBuyPrice: 291.4, returnPercent: -4.45, unrealizedPnl: -240.13, costBasisCoverage: 1, costBasisSource: "trade-history" },
  { symbol: "BNB", amount: 0.013, free: 0.013, locked: 0, price: 894.62, value: 11.63, averageBuyPrice: null, returnPercent: null, unrealizedPnl: null, costBasisCoverage: 0, costBasisSource: "unavailable" },
];

const META: Record<string, { name: string; icon: string; color: string }> = {
  USDT: { name: "Tether", icon: "₮", color: "#26a17b" }, USDC: { name: "USD Coin", icon: "$", color: "#2775ca" },
  BTC: { name: "Bitcoin", icon: "₿", color: "#f7931a" }, ETH: { name: "Ethereum", icon: "◆", color: "#627eea" },
  SOL: { name: "Solana", icon: "S", color: "#936cf7" }, BNB: { name: "BNB", icon: "B", color: "#f3ba2f" },
};

function formatRate(value: number) {
  if (value < 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function positionInsight(asset: Asset) {
  if (asset.costBasisSource === "stablecoin") return { tone: "neutral", label: "Available to trade", detail: "Stable balance; no price-return signal." };
  if (asset.averageBuyPrice === null || asset.returnPercent === null) return { tone: "neutral", label: "Review manually", detail: "No reliable USDT purchase history found." };
  if (asset.returnPercent >= 15) return { tone: "positive", label: "Protect gains", detail: "Consider partial profit or a tighter stop." };
  if (asset.returnPercent >= 5) return { tone: "positive", label: "Hold · trail stop", detail: "Position is above its estimated cost." };
  if (asset.returnPercent > -5) return { tone: "neutral", label: "Hold · monitor", detail: "Price remains close to estimated cost." };
  return { tone: "negative", label: "Review risk", detail: "Below estimated cost; reassess the exit plan." };
}

export default function WalletPage() {
  const [assets, setAssets] = useState<Asset[]>(DEMO_ASSETS);
  const [connected, setConnected] = useState(false);
  const [tradingEnabled, setTradingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Checking Binance connection…");
  const [hideSmall, setHideSmall] = useState(false);
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState("Not synced");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/binance/account?includeInsights=true", { cache: "no-store" });
      const payload = await response.json() as { assets?: Asset[]; tradingEnabled?: boolean; error?: string };
      if (!response.ok || !payload.assets) throw new Error(payload.error || "Unable to load Binance wallet");
      setAssets(payload.assets);
      setConnected(true);
      setTradingEnabled(Boolean(payload.tradingEnabled));
      setMessage("Balances are loaded through the secure server connection.");
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      setConnected(false);
      setTradingEnabled(false);
      setMessage(error instanceof Error ? error.message : "Unable to load Binance wallet");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const totals = useMemo(() => ({
    value: assets.reduce((sum, asset) => sum + asset.value, 0),
    available: assets.reduce((sum, asset) => sum + asset.value * (asset.amount ? asset.free / asset.amount : 0), 0),
    locked: assets.reduce((sum, asset) => sum + asset.value * (asset.amount ? asset.locked / asset.amount : 0), 0),
  }), [assets]);
  const visible = assets.filter((asset) => (!hideSmall || asset.value >= 10) && asset.symbol.toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="app-shell subpage-shell">
      <AppHeader active="wallet" />
      <section className="subpage-hero wallet-hero">
        <div><p className="eyebrow">Binance spot account</p><h1>Wallet & assets</h1><p>Review available funds and balances currently locked in open orders, away from the trading workspace.</p></div>
        <div className={`connection-card ${connected ? "connected" : ""}`}><i /><div><b>{connected ? "Binance connected" : "Demo account shown"}</b><span>{message}</span></div><button onClick={refresh} disabled={loading}>{loading ? "Syncing…" : "Refresh"}</button></div>
      </section>

      <section className="wallet-stats">
        <article className="panel"><span>Estimated balance</span><strong>${totals.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>{connected ? "Live USDT valuation" : "Demo valuation"}</small></article>
        <article className="panel"><span>Available to trade</span><strong>${totals.available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Free balance across assets</small></article>
        <article className="panel"><span>In open orders</span><strong>${totals.locked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Currently unavailable</small></article>
        <article className="panel"><span>Trading access</span><strong className={tradingEnabled ? "up" : "wallet-safe"}>{tradingEnabled ? "Enabled" : "Read only"}</strong><small>Last sync · {lastSync}</small></article>
      </section>

      <section className="wallet-panel panel">
        <div className="wallet-toolbar"><div><h2>Spot wallet</h2><span>{visible.length} assets</span></div><label className="wallet-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter assets" /></label><label className="hide-balance"><input type="checkbox" checked={hideSmall} onChange={(event) => setHideSmall(event.target.checked)} /> Hide balances below $10</label></div>
        <div className="wallet-row wallet-labels"><span>Asset</span><span>Position insight</span><span>Total balance</span><span>Available</span><span>In orders</span><span>USDT value</span><span>Allocation</span></div>
        {visible.map((asset) => {
          const meta = META[asset.symbol] ?? { name: asset.symbol, icon: asset.symbol[0], color: "#82909a" };
          const allocation = totals.value ? asset.value / totals.value * 100 : 0;
          const insight = positionInsight(asset);
          return <div className="wallet-row" key={asset.symbol}>
            <span className="wallet-asset"><i className="coin-icon" style={{ color: meta.color, background: `${meta.color}18` }}>{meta.icon}</i><b>{asset.symbol}<small>{meta.name}</small></b></span>
            <span className={`position-insight ${insight.tone}`}><b>{insight.label}</b><small>Bought {asset.averageBuyPrice === null ? "—" : formatRate(asset.averageBuyPrice)} · Now {formatRate(asset.price)}</small><em>{asset.returnPercent === null ? "Cost basis unavailable" : `${asset.returnPercent >= 0 ? "+" : ""}${asset.returnPercent.toFixed(2)}% · ${insight.detail}`}{asset.costBasisSource === "partial-history" ? " · Partial history" : ""}</em></span>
            <span><b>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</b></span><span>{asset.free.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span><span>{asset.locked.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span><span><b>${asset.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
            <span className="asset-allocation"><i><b style={{ width: `${allocation}%`, background: meta.color }} /></i>{allocation.toFixed(1)}%</span>
          </div>;
        })}
      </section>

      {!connected && <section className="wallet-setup panel"><span>◆</span><div><p className="eyebrow">Connection setup</p><h2>Load your real Binance assets</h2><p>Add <code>BINANCE_API_KEY</code> and <code>BINANCE_API_SECRET</code> to your server-side <code>.env</code>, then restart Docker. Use a read-only key and never enable withdrawals.</p></div><a href="/">Back to trading →</a></section>}
      <footer><p>Position insights are rule-based estimates from available Binance trade history, not financial advice.</p><span>Wallet monitor <i /> {connected ? "Connected" : "Demo mode"}</span></footer>
    </main>
  );
}
