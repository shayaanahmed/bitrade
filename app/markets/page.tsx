"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";

const MARKETS = [
  { symbol: "BTC", name: "Bitcoin", price: 83022.29, change: 2.42, volume: "$32.8B", icon: "₿", color: "#f7931a", category: "Layer 1" },
  { symbol: "ETH", name: "Ethereum", price: 4268.24, change: 1.18, volume: "$14.2B", icon: "◆", color: "#627eea", category: "Layer 1" },
  { symbol: "SOL", name: "Solana", price: 278.42, change: 5.76, volume: "$4.9B", icon: "S", color: "#936cf7", category: "Layer 1" },
  { symbol: "BNB", name: "BNB", price: 894.83, change: -0.62, volume: "$1.8B", icon: "B", color: "#f3ba2f", category: "Exchange" },
  { symbol: "XRP", name: "XRP", price: 2.5264, change: 0.84, volume: "$1.1B", icon: "X", color: "#d7e0e6", category: "Payments" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.2428, change: -1.34, volume: "$892M", icon: "Ð", color: "#c2a633", category: "Meme" },
  { symbol: "AVAX", name: "Avalanche", price: 47.16, change: 3.09, volume: "$473M", icon: "A", color: "#e84142", category: "Layer 1" },
  { symbol: "LINK", name: "Chainlink", price: 24.92, change: 2.01, volume: "$428M", icon: "L", color: "#2a5ada", category: "Oracle" },
  { symbol: "ADA", name: "Cardano", price: 0.84, change: -0.41, volume: "$386M", icon: "A", color: "#3b75c4", category: "Layer 1" },
  { symbol: "DOT", name: "Polkadot", price: 8.72, change: 1.77, volume: "$241M", icon: "●", color: "#e6007a", category: "Layer 0" },
  { symbol: "NEAR", name: "NEAR Protocol", price: 6.38, change: 4.12, volume: "$318M", icon: "N", color: "#a8f3d4", category: "Layer 1" },
  { symbol: "LTC", name: "Litecoin", price: 112.38, change: 0.38, volume: "$527M", icon: "Ł", color: "#b8b8b8", category: "Payments" },
];

function formatPrice(price: number) {
  return price < 1 ? price.toFixed(4) : price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MarketsPage() {
  const [selected, setSelected] = useState<string[]>(["BTC", "ETH", "SOL", "BNB"]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    const saved = localStorage.getItem("tradepilot-universe");
    if (saved) try { setSelected(JSON.parse(saved)); } catch { /* keep defaults */ }
  }, []);

  const visible = useMemo(() => MARKETS.filter((market) => {
    const matchesText = `${market.symbol} ${market.name}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All" || filter === "Selected" && selected.includes(market.symbol) || market.category === filter;
    return matchesText && matchesFilter;
  }), [search, filter, selected]);

  function toggle(symbol: string) {
    const next = selected.includes(symbol) ? selected.length === 1 ? selected : selected.filter((item) => item !== symbol) : [...selected, symbol];
    setSelected(next);
    localStorage.setItem("tradepilot-universe", JSON.stringify(next));
  }

  function openMarket(symbol: string) {
    if (!selected.includes(symbol)) toggle(symbol);
    localStorage.setItem("tradepilot-active-symbol", symbol);
    window.location.href = "/";
  }

  return (
    <main className="app-shell subpage-shell">
      <AppHeader active="markets" />
      <section className="subpage-hero">
        <div><p className="eyebrow">Strategy scope</p><h1>Coin universe</h1><p>Choose which markets TradePilot should monitor. Your dashboard stays focused on one chart while the strategy scans this list.</p></div>
        <div className="selection-summary"><strong>{selected.length}</strong><span>markets selected</span><a href="/">Return to dashboard →</a></div>
      </section>

      <section className="market-manager panel">
        <div className="market-controls">
          <label className="market-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or symbol" /></label>
          <div className="market-filters">{["All", "Selected", "Layer 1", "Payments"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
        </div>
        <div className="market-grid">
          {visible.map((market) => {
            const isSelected = selected.includes(market.symbol);
            return <article className={`market-card ${isSelected ? "selected" : ""}`} key={market.symbol}>
              <div className="market-card-head"><span className="coin-icon large" style={{ background: `${market.color}1c`, color: market.color }}>{market.icon}</span><button onClick={() => toggle(market.symbol)} aria-label={`${isSelected ? "Remove" : "Add"} ${market.name}`}>{isSelected ? "✓ Selected" : "+ Add"}</button></div>
              <div className="market-name"><h2>{market.symbol}<small>/USDT</small></h2><p>{market.name} · {market.category}</p></div>
              <div className="market-quote"><strong>${formatPrice(market.price)}</strong><span className={market.change >= 0 ? "up" : "down"}>{market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%</span></div>
              <div className="market-volume"><span>24h volume</span><b>{market.volume}</b></div>
              <button className="open-chart" onClick={() => openMarket(market.symbol)}>Open on dashboard <span>→</span></button>
            </article>;
          })}
        </div>
      </section>
      <footer><p>Your universe is saved on this device.</p><span>Scanner <i /> {selected.length} markets active</span></footer>
    </main>
  );
}
