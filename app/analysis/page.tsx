"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/AppHeader";
import {
  ACTIVE_STRATEGY_STORAGE_KEY,
  DEFAULT_INDICATORS,
  DEFAULT_STRATEGIES,
  INDICATOR_CATALOG,
  INDICATOR_STORAGE_KEY,
  STRATEGY_CATALOG,
  STRATEGY_STORAGE_KEY,
  type IndicatorKey,
  type StrategyKey,
} from "@/lib/analysisCatalog";

type LibraryTab = "All" | "Indicators" | "Strategies";

function loadSelection<T extends string>(key: string, defaults: T[], allowed: readonly T[]) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaults;
    const saved = JSON.parse(stored) as T[];
    return saved.filter((item) => allowed.includes(item));
  } catch {
    return defaults;
  }
}

export default function AnalysisLibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("All");
  const [search, setSearch] = useState("");
  const [indicatorCategory, setIndicatorCategory] = useState("All");
  const [assignedIndicators, setAssignedIndicators] = useState<IndicatorKey[]>(DEFAULT_INDICATORS);
  const [assignedStrategies, setAssignedStrategies] = useState<StrategyKey[]>(DEFAULT_STRATEGIES);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>("ema-cross");

  useEffect(() => {
    setAssignedIndicators(loadSelection(INDICATOR_STORAGE_KEY, DEFAULT_INDICATORS, INDICATOR_CATALOG.map((item) => item.key)));
    const savedStrategies = loadSelection(STRATEGY_STORAGE_KEY, DEFAULT_STRATEGIES, STRATEGY_CATALOG.map((item) => item.key));
    const strategies = savedStrategies.includes("profit-guard") ? savedStrategies : [...savedStrategies, "profit-guard" as const];
    setAssignedStrategies(strategies);
    localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(strategies));
    const savedActive = localStorage.getItem(ACTIVE_STRATEGY_STORAGE_KEY) as StrategyKey | null;
    if (savedActive && STRATEGY_CATALOG.some((item) => item.key === savedActive)) setActiveStrategy(savedActive);
  }, []);

  function toggleIndicator(key: IndicatorKey) {
    const next = assignedIndicators.includes(key) ? assignedIndicators.filter((item) => item !== key) : [...assignedIndicators, key];
    setAssignedIndicators(next);
    localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify(next));
  }

  function toggleStrategy(key: StrategyKey) {
    const removing = assignedStrategies.includes(key);
    let next = removing ? assignedStrategies.filter((item) => item !== key) : [...assignedStrategies, key];
    if (!next.length) next = ["ema-cross"];
    setAssignedStrategies(next);
    localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(next));
    if (!removing || activeStrategy === key) {
      const nextActive = removing ? next[0] : key;
      setActiveStrategy(nextActive);
      localStorage.setItem(ACTIVE_STRATEGY_STORAGE_KEY, nextActive);
    }
  }

  function makeActive(key: StrategyKey) {
    setActiveStrategy(key);
    localStorage.setItem(ACTIVE_STRATEGY_STORAGE_KEY, key);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const visibleIndicators = useMemo(() => INDICATOR_CATALOG.filter((item) =>
    (indicatorCategory === "All" || item.category === indicatorCategory) &&
    `${item.name} ${item.shortName} ${item.description} ${item.bestFor}`.toLowerCase().includes(normalizedSearch)
  ), [indicatorCategory, normalizedSearch]);
  const visibleStrategies = useMemo(() => STRATEGY_CATALOG.filter((item) =>
    `${item.name} ${item.description} ${item.category} ${item.indicators.join(" ")}`.toLowerCase().includes(normalizedSearch)
  ), [normalizedSearch]);

  return (
    <main className="app-shell subpage-shell analysis-shell">
      <AppHeader active="analysis" />
      <section className="subpage-hero analysis-hero">
        <div><p className="eyebrow">Chart intelligence</p><h1>Strategies & indicators</h1><p>Explore common technical studies, understand what each one measures, and assign the ones you want directly to your trading chart.</p></div>
        <div className="library-summary panel"><span><b>{assignedIndicators.length}</b> indicators assigned</span><span><b>{assignedStrategies.length}</b> strategies assigned</span><a href="/">Open chart →</a></div>
      </section>

      <section className="library-controls panel">
        <div className="library-tabs">{(["All", "Indicators", "Strategies"] as LibraryTab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
        <label className="library-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search EMA, volatility, momentum…" aria-label="Search strategies and indicators" /></label>
        {(tab === "All" || tab === "Indicators") && <div className="library-categories">{["All", "Trend", "Momentum", "Volatility", "Volume"].map((category) => <button key={category} className={indicatorCategory === category ? "active" : ""} onClick={() => setIndicatorCategory(category)}>{category}</button>)}</div>}
      </section>

      {(tab === "All" || tab === "Indicators") && <section className="library-section">
        <div className="library-section-head"><div><p className="eyebrow">Technical studies</p><h2>Indicator library</h2></div><span>{visibleIndicators.length} available</span></div>
        <div className="library-grid indicator-library-grid">
          {visibleIndicators.map((indicator) => {
            const assigned = assignedIndicators.includes(indicator.key);
            return <article className={`library-card panel ${assigned ? "assigned" : ""}`} key={indicator.key}>
              <div className="library-card-head"><span className={`study-icon ${indicator.category.toLowerCase()}`}>{indicator.shortName.slice(0, 2)}</span><div><small>{indicator.category} · {indicator.placement}</small><h3>{indicator.name}</h3></div><span className="assigned-mark">{assigned ? "ON CHART" : "AVAILABLE"}</span></div>
              <p>{indicator.description}</p>
              <dl><div><dt>Default settings</dt><dd>{indicator.settings}</dd></div><div><dt>Useful for</dt><dd>{indicator.bestFor}</dd></div></dl>
              <button className={assigned ? "remove-study" : "assign-study"} onClick={() => toggleIndicator(indicator.key)}>{assigned ? "Remove from chart" : "Assign to chart"}</button>
            </article>;
          })}
        </div>
      </section>}

      {(tab === "All" || tab === "Strategies") && <section className="library-section strategy-library-section">
        <div className="library-section-head"><div><p className="eyebrow">Signal systems</p><h2>Strategy library</h2></div><span>{visibleStrategies.length} available</span></div>
        <div className="library-grid strategy-library-grid">
          {visibleStrategies.map((strategy) => {
            const assigned = assignedStrategies.includes(strategy.key);
            const active = activeStrategy === strategy.key;
            return <article className={`library-card strategy-library-card panel ${assigned ? "assigned" : ""} ${active ? "active-strategy" : ""}`} key={strategy.key}>
              <div className="library-card-head"><span className="study-icon strategy">✦</span><div><small>{strategy.category} · Risk {strategy.risk}</small><h3>{strategy.name} <em>{strategy.version}</em></h3></div><span className="assigned-mark">{active ? "ACTIVE" : assigned ? "ASSIGNED" : "AVAILABLE"}</span></div>
              <p>{strategy.description}</p>
              <div className="strategy-tags">{strategy.indicators.map((indicator) => <span key={indicator}>{indicator}</span>)}</div>
              <dl><div><dt>Best suited for</dt><dd>{strategy.bestFor}</dd></div></dl>
              <div className="strategy-card-actions"><button className={assigned ? "remove-study" : "assign-study"} onClick={() => toggleStrategy(strategy.key)}>{assigned ? "Unassign" : "Assign to chart"}</button>{assigned && !active && <button className="make-active" onClick={() => makeActive(strategy.key)}>Make active</button>}</div>
            </article>;
          })}
        </div>
      </section>}

      <section className="library-note panel"><span>i</span><p><b>How assignment works</b>Assigned indicators become available and visible on the main chart. Assigned strategies appear in the chart’s strategy selector; one strategy is active at a time to keep signals readable.</p><a href="/">Review on chart →</a></section>
      <footer><p>Technical studies are decision-support tools, not guarantees of future performance.</p><span>Analysis library <i /> Ready</span></footer>
    </main>
  );
}
