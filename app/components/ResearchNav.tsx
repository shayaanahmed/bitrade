import Link from "next/link";

const links = [["/data","Data"],["/plugins","Plugins"],["/experiments","Experiments"],["/jobs","Jobs"],["/backtests","Results"],["/training","Training"],["/models","Models"],["/paper","Paper"],["/settings","Settings"]];
export function ResearchNav({ active }: { active: string }) { return <div className="research-nav" aria-label="Research navigation">{links.map(([href,label]) => <Link key={href} href={href} className={active === href ? "active" : ""}>{label}</Link>)}</div>; }
