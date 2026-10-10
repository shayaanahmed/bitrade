"use client";
import Link from "next/link";

export function AppHeader({ active }: { active: "dashboard" | "markets" | "wallet" | "analysis" | "signals" | "research" }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="TradePilot home"><span className="brand-mark"><i /><i /><i /></span><span>TradePilot</span><b>AI</b></Link>
      <nav>
        <Link className={active === "dashboard" ? "active" : ""} href="/">Trade</Link>
        <Link className={active === "analysis" ? "active" : ""} href="/analysis">Strategies</Link>
        <Link className={active === "signals" ? "active" : ""} href="/signals">Signals</Link>
        <Link className={active === "markets" ? "active" : ""} href="/markets">Coin universe</Link>
        <Link className={active === "wallet" ? "active" : ""} href="/wallet">Wallet</Link>
        <Link className={active === "research" ? "active" : ""} href="/experiments">Research</Link>
        <Link href="/#orders">Activity</Link>
      </nav>
      <div className="top-actions"><span className="market-live"><i />Market live</span><Link className="icon-button notification-link" href="/signals" aria-label="Signal notifications">♢</Link><button className="avatar">SS</button></div>
    </header>
  );
}
