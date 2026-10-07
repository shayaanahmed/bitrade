"use client";

export function AppHeader({ active }: { active: "dashboard" | "markets" | "wallet" | "analysis" | "signals" }) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="TradePilot home"><span className="brand-mark"><i /><i /><i /></span><span>TradePilot</span><b>AI</b></a>
      <nav>
        <a className={active === "dashboard" ? "active" : ""} href="/">Trade</a>
        <a className={active === "analysis" ? "active" : ""} href="/analysis">Strategies</a>
        <a className={active === "signals" ? "active" : ""} href="/signals">Signals</a>
        <a className={active === "markets" ? "active" : ""} href="/markets">Coin universe</a>
        <a className={active === "wallet" ? "active" : ""} href="/wallet">Wallet</a>
        <a href="/#orders">Activity</a>
      </nav>
      <div className="top-actions"><span className="market-live"><i />Market live</span><a className="icon-button notification-link" href="/signals" aria-label="Signal notifications">♢</a><button className="avatar">SS</button></div>
    </header>
  );
}
