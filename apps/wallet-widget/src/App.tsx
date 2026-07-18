import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAINNET_NETWORKS, type AgentPolicy, type PaymentIntent, type TransactionRecord } from "@aifinpay/shared";
import { bridge } from "./bridge/mcp-bridge.js";
import { browserDemoData } from "./demo-data.js";
import type { WidgetData } from "./types.js";
import logoUrl from "../../mcp-server/assets/aifinpay-logo.png";
import "./styles.css";

const short = (value = "") => value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
type MainnetId = keyof typeof MAINNET_NETWORKS;
const MAINNET_OPTIONS = Object.entries(MAINNET_NETWORKS) as [MainnetId, (typeof MAINNET_NETWORKS)[MainnetId]][];

function Logo() {
  return <div className="brand"><img className="logo" src={logoUrl} alt="" aria-hidden="true" /><span>AiFinPay</span></div>;
}

function Header({ label = "Wallet", badge = "BETA" }: { label?: string; badge?: string }) {
  return <header><Logo /><div className="header-right"><button className="vault-link" onClick={() => void bridge.callTool("create_wallet_pairing", {})}>Vault</button><span className={`demo-badge ${badge === "MAINNET" ? "mainnet-badge" : ""}`}>{badge}</span><span className="header-label">{label}</span></div></header>;
}

function StatusPill({ value }: { value: string }) {
  const tone = value.includes("BLOCK") || value === "FAILED" ? "danger" : value.includes("APPROVAL") || value === "PENDING" ? "warning" : "success";
  return <span className={`status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function Transactions({ items }: { items: TransactionRecord[] }) {
  if (!items.length) return <div className="empty compact"><strong>No indexed activity yet</strong><span>Live transaction history requires an indexed Polygon data provider.</span></div>;
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
  const isMainnet = summary.mode === "MAINNET";
  const [networkOpen, setNetworkOpen] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<MainnetId>(() => {
    const saved = window.openai?.widgetState?.selectedNetwork;
    return typeof saved === "string" && saved in MAINNET_NETWORKS ? saved as MainnetId : "polygon";
  });
  const network = MAINNET_NETWORKS[selectedNetwork];
  const isLiveBalance = isMainnet && selectedNetwork === "polygon";
  const connectedAddress = network.family === "EVM"
    ? data.connection?.addresses.evm
    : data.connection?.addresses[selectedNetwork];
  const networkLabel = isMainnet ? selectedNetwork === "polygon" ? "Polygon Mainnet" : network.label : "Polygon Amoy";
  const selectNetwork = (id: MainnetId) => {
    setSelectedNetwork(id);
    setNetworkOpen(false);
    void window.openai?.setWidgetState?.({ ...(window.openai?.widgetState ?? {}), selectedNetwork: id });
  };
  useEffect(() => {
    if (!networkOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNetworkOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [networkOpen]);
  return <main className="card"><Header badge={isMainnet ? "MAINNET" : "BETA"} />
    {data.connection && <div className="connected-strip"><span>✓ Wallet connected</span><strong>{short(connectedAddress)}</strong></div>}
    <section className="wallet-top">
      <div><span className="eyebrow">Available balance</span>{isLiveBalance || !isMainnet
        ? <><h1><small>$</small>{Number(usdc?.formatted ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1><span className="subtle">{usdc?.formatted} USDC</span></>
        : <><h1 className="balance-pending">—</h1><span className="subtle">{network.nativeToken} balance adapter coming next</span></>}
      </div>
      <button className="network" type="button" aria-haspopup="dialog" aria-expanded={networkOpen} aria-label={`Choose network. Current: ${networkLabel}`} onClick={() => setNetworkOpen(true)}><span className={`network-dot ${network.family.toLowerCase()}`} />{networkLabel}<span className="chevron">⌄</span></button>
    </section>
    <div className="address"><span>{connectedAddress ? short(connectedAddress) : summary.maskedAddress}</span><span>{isLiveBalance ? `${native?.formatted} POL gas` : `${network.nativeToken} balance pending`}</span></div>
    <nav className="actions">
      <button onClick={() => onNavigate(isMainnet ? "mainnet-signing-locked" : "transfer-form")}><b>↗</b>Send</button>
      <button onClick={() => onNavigate("receive")}><b>↙</b>Receive</button>
      <button onClick={() => void bridge.callTool("list_agent_policies", {})}><b>⌁</b>Agent limits</button>
      <button onClick={() => void bridge.callTool("get_audit_log", { limit: 30 })}><b>≡</b>Audit log</button>
    </nav>
    <section className="section-head"><h2>Recent activity</h2><button className="link" onClick={() => void bridge.callTool("list_transactions", { limit: 20 })}>View all</button></section>
    <Transactions items={summary.latestTransactions} />
    <footer><span><i className={`secure-dot ${isLiveBalance ? "" : "staged-dot"}`} /> {isLiveBalance ? "Live RPC balance" : isMainnet ? "Address ready" : "Policy engine active"}</span><span>{isMainnet ? `${network.label}${network.chainId ? ` · Chain ${network.chainId}` : ""}` : "Demo/Testnet"}</span></footer>
    {networkOpen && <div className="network-sheet-backdrop" role="presentation" onClick={() => setNetworkOpen(false)}>
      <section className="network-sheet" role="dialog" aria-modal="true" aria-labelledby="network-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="network-sheet-handle" />
        <div className="network-sheet-head"><div><span className="eyebrow">12 MAINNETS</span><h2 id="network-sheet-title">Choose network</h2></div><button type="button" aria-label="Close network selector" onClick={() => setNetworkOpen(false)}>×</button></div>
        <div className="network-options" role="listbox" aria-label="AiFinPay wallet networks">{MAINNET_OPTIONS.map(([id, item]) => <button type="button" role="option" aria-selected={selectedNetwork === id} className={selectedNetwork === id ? "selected" : ""} key={id} onClick={() => selectNetwork(id)}>
          <span className={`network-dot ${item.family.toLowerCase()}`} /><span className="network-option-copy"><strong>{item.label}</strong><small>{item.family} · {item.nativeToken}{item.chainId ? ` · Chain ${item.chainId}` : ""}</small></span><span className={`network-availability ${id === "polygon" ? "live" : "ready"}`}>{id === "polygon" ? "LIVE BALANCE" : "ADDRESS READY"}</span>{selectedNetwork === id && <b aria-hidden="true">✓</b>}
        </button>)}</div>
        <p>One Vault controls all 12 addresses. Polygon has live balances now; other balance adapters are being connected without exposing your keys.</p>
      </section>
    </div>}
  </main>;
}

function Receive({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const [copied, setCopied] = useState("");
  const addresses = data.connection?.addresses;
  const copy = async (label: string, value?: string) => {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  };
  return <main className="card"><Header label="Receive" badge={data.summary?.mode === "MAINNET" ? "MAINNET" : "BETA"} /><button className="back" onClick={onBack}>← Wallet</button><section className="hero-icon">↙</section><div className="center"><h2>Receive assets</h2><p>Choose the address for the network you are receiving on. Always verify the network before sending funds.</p></div>
    <div className="receive-list"><button onClick={() => void copy("EVM", addresses?.evm)}><span>Polygon & EVM networks</span><strong>{short(addresses?.evm)}</strong><small>{copied === "EVM" ? "COPIED" : "COPY"}</small></button><button onClick={() => void copy("SOL", addresses?.solana)}><span>Solana</span><strong>{short(addresses?.solana)}</strong><small>{copied === "SOL" ? "COPIED" : "COPY"}</small></button><button onClick={() => void copy("NEAR", addresses?.near)}><span>NEAR</span><strong>{short(addresses?.near)}</strong><small>{copied === "NEAR" ? "COPIED" : "COPY"}</small></button><button onClick={() => void copy("APT", addresses?.aptos)}><span>Aptos</span><strong>{short(addresses?.aptos)}</strong><small>{copied === "APT" ? "COPIED" : "COPY"}</small></button></div>
    <p className="mainnet-warning">Mainnet addresses can hold assets with real financial value. Send a small test amount first.</p>
  </main>;
}

function MainnetSigningLocked({ onBack }: { onBack: () => void }) {
  return <main className="card"><Header label="Mainnet security" badge="MAINNET" /><button className="back" onClick={onBack}>← Wallet</button><section className="blocked-icon">!</section><div className="center"><h2>Mainnet sending is locked</h2><p>Live balances and receiving are enabled. Sending will be activated only with per-user authentication, an explicit transaction preview, and local signing inside your encrypted Vault.</p></div><div className="policy-result"><div className="shield">✓</div><div><strong>YOUR KEYS STAY LOCAL</strong><span>AiFinPay and ChatGPT must never receive your recovery phrase or private key.</span></div></div><button className="primary" onClick={onBack}>Return to wallet</button></main>;
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

function WalletConnect({ data, onConnected }: { data: WidgetData; onConnected: (next: WidgetData) => void }) {
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const checkConnection = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const status = await bridge.callTool("get_wallet_connection", {}, { emit: false });
      if (status.view === "wallet-connected" && status.connection) {
        const wallet = await bridge.callTool("render_wallet", {}, { emit: false });
        onConnected(wallet.view === "wallet" ? wallet : status);
      }
    } catch {
      // A transient host/tool error must not replace the still-valid pairing screen.
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [onConnected]);
  useEffect(() => {
    if (!data.pairingUrl) return;
    const onFocus = () => { void checkConnection(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void checkConnection(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void checkConnection(); }, 1_500);
    void checkConnection();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [checkConnection, data.pairingUrl]);
  const open = () => { if (!data.pairingUrl) return; if (window.openai?.openExternal) void window.openai.openExternal({ href: data.pairingUrl }); else window.open(data.pairingUrl, "_blank", "noopener,noreferrer"); };
  return <main className="card"><Header label="Secure setup" /><section className="hero-icon">◇</section><div className="center"><span className="eyebrow">NON-CUSTODIAL VAULT</span><h2>Create or connect your wallet</h2><p>Recovery words and private keys stay on your device. ChatGPT receives public addresses only.</p></div><button className="primary" disabled={!data.pairingUrl} onClick={open}>Open AiFinPay Vault</button><button className="secondary connection-check" disabled={checking} onClick={() => void checkConnection()}>{checking ? "Checking connection…" : "I connected my wallet — check now"}</button><p className="disclaimer">The secure connection link expires in 10 minutes. This widget updates automatically when you return.</p></main>;
}

function WalletConnected({ onOpened }: { onOpened: (next: WidgetData) => void }) {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const open = async () => {
      setError("");
      try {
        const wallet = await bridge.callTool("render_wallet", {}, { emit: false });
        if (!active) return;
        if (wallet.view !== "wallet") throw new Error("WALLET_NOT_READY");
        onOpened(wallet);
      } catch {
        if (active) setError("The wallet is connected, but the live dashboard did not load. Try again.");
      }
    };
    void open();
    return () => { active = false; };
  }, [attempt, onOpened]);
  return <main className="card"><Header label="Connected" badge="MAINNET" /><div className="opening-wallet"><div className="spinner" /><strong>Opening your wallet…</strong>{error && <><p className="vault-error">{error}</p><button className="primary" onClick={() => setAttempt((value) => value + 1)}>Open wallet now</button></>}</div></main>;
}

function Networks({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  return <main className="card"><Header label="12 mainnets" /><button className="back" onClick={onBack}>← Wallet</button><div className="network-list">{Object.entries(data.networks ?? {}).map(([id, network]) => <article key={id}><div><strong>{network.label}</strong><span>{network.family} · {network.nativeToken}{network.chainId ? ` · ${network.chainId}` : ""}</span><code title={network.deployment.address}>{network.deployment.name}{network.deployment.moduleName ? `::${network.deployment.moduleName}` : ""} · {short(network.deployment.address)}</code></div><span className={`network-mode ${network.enabledForSigning ? "live" : "staged"}`}>{network.enabledForSigning ? "SIGNING" : "DEPLOYED · VERIFYING"}</span></article>)}</div><p className="disclaimer">Deployment addresses are public metadata. Mainnet signing remains disabled until bytecode, ABI, proxy/admin roles, supported tokens and treasury configuration pass independent verification.</p></main>;
}

function WalletApp({ initialData }: { initialData?: WidgetData }) {
  const first = useMemo(() => initialData ?? window.openai?.toolOutput ?? browserDemoData, [initialData]);
  const [data, setData] = useState<WidgetData>(first); const [wallet, setWallet] = useState<WidgetData>(first.view === "wallet" ? first : browserDemoData);
  useEffect(() => bridge.subscribe((next) => { setData(next); if (next.view === "wallet") setWallet(next); }), []);
  useEffect(() => { document.documentElement.dataset.theme = window.openai?.theme ?? "light"; void bridge.initialize().catch(() => undefined); }, []);
  const back = () => setData(wallet);
  if (data.view === "loading") return <main className="card loading"><div className="spinner" /><span>Loading secure wallet…</span></main>;
  if (data.view === "wallet-connect" || data.view === "not-connected") return <WalletConnect data={data} onConnected={setData} />;
  if (data.view === "wallet-connected") return <WalletConnected onOpened={setData} />;
  if (data.view === "networks") return <Networks data={data} onBack={back} />;
  if (data.view === "wallet") return <Wallet data={data} onNavigate={(view) => setData({ view })} />;
  if (data.view === "receive") return <Receive data={wallet} onBack={back} />;
  if (data.view === "mainnet-signing-locked") return <MainnetSigningLocked onBack={back} />;
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

export function App({ initialData }: { initialData?: WidgetData }) {
  return <WalletApp {...(initialData ? { initialData } : {})} />;
}
