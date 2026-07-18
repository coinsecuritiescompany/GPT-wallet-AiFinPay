import { useEffect, useMemo, useState } from "react";
import type { AgentPolicy, PaymentIntent, TransactionRecord } from "@aifinpay/shared";
import { bridge } from "./bridge/mcp-bridge.js";
import { browserDemoData } from "./demo-data.js";
import type { WidgetData } from "./types.js";
import logoUrl from "../../mcp-server/assets/aifinpay-logo.png";
import "./styles.css";

const short = (value = "") => value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function Logo() {
  return <div className="brand"><img className="logo" src={logoUrl} alt="" aria-hidden="true" /><span>AiFinPay</span></div>;
}

function Header({ label = "Wallet" }: { label?: string }) {
  return <header><Logo /><div className="header-right"><span className="demo-badge">DEMO ONLY</span><span className="header-label">{label}</span></div></header>;
}

function StatusPill({ value }: { value: string }) {
  const tone = value.includes("BLOCK") || value === "FAILED" ? "danger" : value.includes("APPROVAL") || value === "PENDING" ? "warning" : "success";
  return <span className={`status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function Transactions({ items }: { items: TransactionRecord[] }) {
  if (!items.length) return <div className="empty">No transactions yet.</div>;
  return <div className="transactions">{items.map((item) => <div className="tx" key={item.id}>
    <div className={`tx-icon ${item.direction.toLowerCase()}`}>{item.direction === "IN" ? "↓" : "↑"}</div>
    <div className="tx-main"><strong>{item.direction === "IN" ? "Received" : item.initiatedByType === "AGENT" ? "Agent payment" : "Sent"}</strong><span>{date(item.timestamp)} · {item.network === "POLYGON_AMOY" ? "Polygon Amoy" : item.network}</span></div>
    <div className="tx-amount"><strong>{item.direction === "IN" ? "+" : "−"}{item.amount} {item.token}</strong><span>{item.status}</span></div>
  </div>)}</div>;
}

function Wallet({ data, onNavigate }: { data: WidgetData; onNavigate: (view: WidgetData["view"]) => void }) {
  const summary = data.summary!;
  const usdc = summary.balances.find((b) => b.token === "USDC");
  const native = summary.balances.find((b) => b.token === "POL");
  return <main className="card"><Header />
    <section className="wallet-top">
      <div><span className="eyebrow">Available balance</span><h1><small>$</small>{Number(usdc?.formatted ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1><span className="subtle">{usdc?.formatted} USDC</span></div>
      <div className="network"><span className="network-dot" />Polygon Amoy<span className="chevron">⌄</span></div>
    </section>
    <div className="address"><span>{summary.maskedAddress}</span><span>{native?.formatted} POL gas</span></div>
    <nav className="actions">
      <button onClick={() => onNavigate("transfer-form")}><b>↗</b>Send</button>
      <button onClick={() => onNavigate("not-connected")}><b>↙</b>Receive</button>
      <button onClick={() => void bridge.callTool("list_agent_policies", {})}><b>⌁</b>Agent limits</button>
      <button onClick={() => void bridge.callTool("get_audit_log", { limit: 30 })}><b>≡</b>Audit log</button>
    </nav>
    <section className="section-head"><h2>Recent activity</h2><button className="link" onClick={() => void bridge.callTool("list_transactions", { limit: 20 })}>View all</button></section>
    <Transactions items={summary.latestTransactions} />
    <footer><span><i className="secure-dot" /> Policy engine active</span><span>No real funds</span></footer>
  </main>;
}

function TransferForm({ onBack }: { onBack: () => void }) {
  const [recipient, setRecipient] = useState("0x2222222222222222222222222222222222222222");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await bridge.callTool("prepare_transfer", { recipient, amount, token: "USDC", network: "POLYGON_AMOY", idempotencyKey: `widget-${Date.now()}` }); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="New transfer" /><button className="back" onClick={onBack}>← Wallet</button>
    <form className="form" onSubmit={submit}><label>Recipient<input aria-label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
      <label>Amount<div className="amount-input"><input aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /><span>USDC</span></div></label>
      <div className="info-row"><span>Network</span><strong>Polygon Amoy</strong></div>
      <button className="primary" disabled={busy}>{busy ? "Checking policy…" : "Review transfer"}</button></form>
  </main>;
}

function IntentDetails({ intent }: { intent: PaymentIntent }) {
  return <div className="details">
    <div><span>Recipient</span><strong>{short(intent.recipient)}</strong></div><div><span>Amount</span><strong>{intent.amount} {intent.token}</strong></div>
    <div><span>Network</span><strong>Polygon Amoy</strong></div><div><span>Estimated fee</span><strong>{intent.estimatedFee}</strong></div>
    <div><span>Initiated by</span><strong>{intent.initiatedByType === "AGENT" ? intent.initiatedById : "You"}</strong></div><div><span>Risk</span><StatusPill value={intent.riskLevel} /></div>
  </div>;
}

function TransferPreview({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const intent = data.intent!; const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); try { await bridge.callTool("confirm_transfer", { transferIntentId: intent.id, confirmationToken: data.confirmationToken!, idempotencyKey: `confirm-${intent.id}` }); } finally { setBusy(false); } };
  return <main className="card"><Header label="Review transfer" /><button className="back" onClick={onBack}>← Wallet</button>
    <section className="hero-icon">↗</section><div className="center"><span className="eyebrow">You are sending</span><h1>{intent.amount} <small>{intent.token}</small></h1></div>
    <IntentDetails intent={intent} />
    <div className="policy-result"><div className="shield">✓</div><div><strong>{intent.policyDecision.replaceAll("_", " ")}</strong><span>{data.policyExplanation ?? "Validated by deterministic AiFinPay policy rules."}</span></div></div>
    <div className="button-row"><button className="secondary" onClick={() => void bridge.callTool("cancel_transfer", { transferIntentId: intent.id })}>Cancel</button><button className="primary" onClick={confirm} disabled={busy}>{busy ? "Signing demo transaction…" : "Confirm transfer"}</button></div>
    <p className="disclaimer">Demo ledger only. No private key is exposed or transmitted.</p>
  </main>;
}

function Blocked({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const intent = data.intent;
  const reasons = intent?.policyReasonCodes ?? data.decision?.reasonCodes ?? [];
  return <main className="card"><Header label="Payment blocked" /><section className="blocked-icon">!</section><div className="center"><h2>Blocked by AiFinPay Policy Engine</h2><p>{data.policyExplanation ?? data.decision?.explanation ?? "This request violates the active spending policy."}</p></div>
    {intent && <IntentDetails intent={intent} />}<div className="reason-list">{reasons.map((reason) => <span key={reason}>{reason.replaceAll("_", " ")}</span>)}</div>
    <button className="primary" onClick={onBack}>Return to wallet</button></main>;
}

function Receipt({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const intent = data.intent!;
  const openExplorer = () => { if (!data.explorerUrl) return; if (window.openai?.openExternal) void window.openai.openExternal({ href: data.explorerUrl }); else window.open(data.explorerUrl, "_blank", "noopener,noreferrer"); };
  return <main className="card"><Header label="Receipt" /><section className="success-icon">✓</section><div className="center"><span className="eyebrow">Demo payment complete</span><h1>{intent.amount} <small>{intent.token}</small></h1><StatusPill value={intent.status} /></div>
    <IntentDetails intent={intent} /><div className="receipt-box"><div><span>Transaction hash</span><strong>{short(intent.transactionHash)}</strong></div><div><span>Audit receipt</span><strong>{intent.auditReceiptId}</strong></div><div><span>Timestamp</span><strong>{intent.submittedAt ? date(intent.submittedAt) : "—"}</strong></div></div>
    <div className="button-row"><button className="secondary" onClick={onBack}>Wallet</button><button className="primary" onClick={openExplorer} disabled={!data.explorerUrl}>View explorer</button></div>
  </main>;
}

function Policies({ policies, onBack, onNew }: { policies: AgentPolicy[]; onBack: () => void; onNew: () => void }) {
  return <main className="card"><Header label="Agent limits" /><button className="back" onClick={onBack}>← Wallet</button><div className="section-head"><h2>Spending policies</h2><button className="link" onClick={onNew}>+ New policy</button></div>
    <div className="policies">{policies.map((policy) => <article key={policy.policyId}><div className="agent-avatar">AI</div><div><strong>{policy.name}</strong><span>{policy.agentId}</span></div><StatusPill value={policy.enabled ? "ACTIVE" : "REVOKED"} /><dl><div><dt>Daily</dt><dd>{policy.dailyLimit} USDC</dd></div><div><dt>Per transaction</dt><dd>{policy.perTransactionLimit} USDC</dd></div><div><dt>Auto-approve</dt><dd>≤ {policy.approvalThreshold} USDC</dd></div></dl></article>)}</div>
  </main>;
}

function PolicyEditor({ onBack }: { onBack: () => void }) {
  const [agentId, setAgentId] = useState("research-agent"); const [daily, setDaily] = useState("5");
  const [perTx, setPerTx] = useState("0.50"); const [threshold, setThreshold] = useState("0.10"); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await bridge.callTool("create_agent_policy", { agentId, name: "Research API budget", dailyLimit: daily, perTransactionLimit: perTx,
      tokenAllowlist: ["USDC"], networkAllowlist: ["POLYGON_AMOY"], allowedRecipients: ["0x2222222222222222222222222222222222222222"],
      allowedMerchantCategories: ["API_PROVIDER"], merchantAllowlist: ["demo-data-api"], approvalThreshold: threshold,
      validUntil: "2027-01-01T00:00:00.000Z", idempotencyKey: `policy-preview-${Date.now()}` }); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="New agent policy" /><button className="back" onClick={onBack}>← Agent limits</button><form className="form" onSubmit={submit}>
    <label>Agent ID<input value={agentId} onChange={(event) => setAgentId(event.target.value)} /></label>
    <div className="form-grid"><label>Daily limit<input value={daily} onChange={(event) => setDaily(event.target.value)} inputMode="decimal" /></label><label>Per transaction<input value={perTx} onChange={(event) => setPerTx(event.target.value)} inputMode="decimal" /></label></div>
    <label>Auto-approval threshold<input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" /></label>
    <div className="info-row"><span>Allowed</span><strong>USDC · Polygon Amoy · approved API providers</strong></div>
    <button className="primary" disabled={busy}>{busy ? "Preparing…" : "Review policy"}</button></form></main>;
}

function PolicyPreview({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const draft = data.draft as any; const [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); try { await bridge.callTool("create_agent_policy", { ...draft, confirmationToken: data.confirmationToken, confirmationExpiresAt: data.expiresAt, idempotencyKey: `policy-confirm-${draft.agentId}` }); } finally { setBusy(false); } };
  return <main className="card"><Header label="Review agent policy" /><button className="back" onClick={onBack}>← Agent limits</button><section className="hero-icon">⌁</section><div className="center"><h2>{draft.name}</h2><p>Agent: {draft.agentId}</p></div>
    <div className="details"><div><span>Daily limit</span><strong>{draft.dailyLimit} USDC</strong></div><div><span>Per transaction</span><strong>{draft.perTransactionLimit} USDC</strong></div><div><span>Auto-approve</span><strong>≤ {draft.approvalThreshold} USDC</strong></div><div><span>Network</span><strong>Polygon Amoy</strong></div></div>
    <div className="policy-result"><div className="shield">✓</div><div><strong>EXPLICIT CONFIRMATION REQUIRED</strong><span>This policy controls what the named agent can spend.</span></div></div>
    <div className="button-row"><button className="secondary" onClick={onBack}>Cancel</button><button className="primary" onClick={confirm} disabled={busy}>{busy ? "Saving…" : "Confirm policy"}</button></div></main>;
}

function Audit({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  return <main className="card"><Header label="Audit log" /><button className="back" onClick={onBack}>← Wallet</button><div className="chain-state"><span className={data.chainValid ? "valid" : "invalid"}>{data.chainValid ? "✓ Hash chain verified" : "! Chain verification failed"}</span><small>tamper-evident, not legally immutable</small></div>
    <div className="audit-list">{(data.events ?? []).map((event) => <article key={event.id}><span className="audit-line" /><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{date(event.timestamp)} · {event.decision}</span><code>{event.currentHash.slice(0, 20)}…</code></div></article>)}</div>
  </main>;
}

function ErrorView({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  return <main className="card"><Header label="Something went wrong" /><section className="blocked-icon">!</section><div className="center"><h2>{data.error?.code?.replaceAll("_", " ") ?? "Error"}</h2><p>{data.error?.message ?? "AiFinPay could not complete this request."}</p></div><button className="primary" onClick={onBack}>Return to wallet</button></main>;
}

export function App({ initialData }: { initialData?: WidgetData }) {
  const first = useMemo(() => initialData ?? window.openai?.toolOutput ?? browserDemoData, [initialData]);
  const [data, setData] = useState<WidgetData>(first); const [wallet, setWallet] = useState<WidgetData>(first.view === "wallet" ? first : browserDemoData);
  useEffect(() => bridge.subscribe((next) => { setData(next); if (next.view === "wallet") setWallet(next); }), []);
  useEffect(() => { document.documentElement.dataset.theme = window.openai?.theme ?? "light"; void bridge.initialize().catch(() => undefined); }, []);
  const back = () => setData(wallet);
  if (data.view === "loading") return <main className="card loading"><div className="spinner" /><span>Loading secure wallet…</span></main>;
  if (data.view === "wallet") return <Wallet data={data} onNavigate={(view) => setData({ view })} />;
  if (data.view === "transfer-form") return <TransferForm onBack={back} />;
  if (data.view === "transfer-preview") return <TransferPreview data={data} onBack={back} />;
  if (data.view === "blocked") return <Blocked data={data} onBack={back} />;
  if (data.view === "receipt") return <Receipt data={data} onBack={back} />;
  if (data.view === "history") return <main className="card"><Header label="Transactions" /><button className="back" onClick={back}>← Wallet</button><Transactions items={data.transactions ?? []} /></main>;
  if (data.view === "policies") return <Policies policies={data.policies ?? []} onBack={back} onNew={() => setData({ view: "policy-editor" })} />;
  if (data.view === "policy-editor") return <PolicyEditor onBack={() => setData({ view: "policies", policies: wallet.summary?.activeAgentPolicies ?? [] })} />;
  if (data.view === "policy-preview") return <PolicyPreview data={data} onBack={() => setData({ view: "policies", policies: wallet.summary?.activeAgentPolicies ?? [] })} />;
  if (data.view === "audit") return <Audit data={data} onBack={back} />;
  if (data.view === "error") return <ErrorView data={data} onBack={back} />;
  return <main className="card"><Header label="AiFinPay" /><div className="empty"><h2>{data.view.replaceAll("-", " ")}</h2><p>This state is ready for host-provided data.</p></div><button className="primary" onClick={back}>Return to wallet</button></main>;
}
