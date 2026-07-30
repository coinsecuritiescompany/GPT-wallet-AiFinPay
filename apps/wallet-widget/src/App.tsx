import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAINNET_NETWORKS, type AgentPolicy, type PaymentIntent, type SwapAsset, type TransactionRecord } from "@aifinpay/shared";
import { QRCodeSVG } from "qrcode.react";
import { bridge } from "./bridge/mcp-bridge.js";
import { browserDemoData } from "./demo-data.js";
import { NetworkLogo, type NetworkLogoId } from "./NetworkLogo.js";
import type { WidgetData } from "./types.js";
import logoUrl from "../../mcp-server/assets/aifinpay-logo.png";
import "./styles.css";

const short = (value = "") => value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
const date = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
type MainnetId = keyof typeof MAINNET_NETWORKS;

function Logo() {
  return <div className="brand"><img className="logo" src={logoUrl} alt="" aria-hidden="true" /><span>AiFinPay</span></div>;
}

function Header({ label = "Wallet", badge = "BETA" }: { label?: string; badge?: string }) {
  return <header><Logo /><div className="header-right"><button className="vault-link" onClick={() => void bridge.callTool("open_wallet", {})}>Wallet</button><span className={`demo-badge ${badge === "MAINNET" ? "mainnet-badge" : ""}`}>{badge}</span><span className="header-label">{label}</span></div></header>;
}

function StatusPill({ value }: { value: string }) {
  const tone = value.includes("BLOCK") || value === "FAILED" ? "danger" : value.includes("APPROVAL") || value === "PENDING" ? "warning" : "success";
  return <span className={`status ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function intentTokenLabel(intent: PaymentIntent): string {
  if (intent.token !== "POL") return intent.token;
  if (intent.network === "POLYGON_AMOY") return "POL";
  return MAINNET_NETWORKS[intent.network.toLowerCase() as MainnetId]?.nativeToken ?? "Native";
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
  const isMainnet = summary.mode === "MAINNET";
  const networkRegistry = useMemo(() => ({ ...MAINNET_NETWORKS, ...(data.networks ?? {}) }), [data.networks]);
  const networkOptions = Object.entries(networkRegistry) as [MainnetId, (typeof MAINNET_NETWORKS)[MainnetId]][];
  const [networkOpen, setNetworkOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  // The loaded summary is for one network at a time; keep the selector in sync with it.
  const summaryNetwork = (summary.selectedNetwork ?? "").toLowerCase();
  const [selectedNetwork, setSelectedNetwork] = useState<MainnetId>(() => {
    if (isMainnet && summaryNetwork in MAINNET_NETWORKS) return summaryNetwork as MainnetId;
    const saved = window.openai?.widgetState?.selectedNetwork;
    return typeof saved === "string" && saved in MAINNET_NETWORKS ? saved as MainnetId : "polygon";
  });
  const network = networkRegistry[selectedNetwork] ?? MAINNET_NETWORKS[selectedNetwork];
  // USDC is the headline where a verified Circle contract exists; otherwise the
  // network's native token is the headline. `native` is any non-USDC balance.
  const usdc = summary.balances.find((b) => b.token === "USDC");
  const native = summary.balances.find((b) => b.token !== "USDC");
  // A network's balances are live once the loaded summary is for that same
  // network — true across all 13 mainnets, not just Polygon.
  const summaryMatches = isMainnet && summaryNetwork === selectedNetwork;
  const isLiveBalance = summaryMatches && !switching && Boolean(native) && !summary.balanceError;
  const connectedAddress = network.family === "EVM"
    ? data.connection?.addresses.evm
    : data.connection?.addresses[selectedNetwork];
  const canFetch = isMainnet && Boolean(data.connection);
  const canSend = !isMainnet || (network.family === "EVM" && network.enabledForSigning);
  const networkLabel = isMainnet ? selectedNetwork === "polygon" ? "Polygon Mainnet" : network.label : "Polygon Amoy";
  const selectNetwork = async (id: MainnetId) => {
    setNetworkOpen(false);
    if (id === selectedNetwork) return;
    setSelectedNetwork(id);
    void window.openai?.setWidgetState?.({ ...(window.openai?.widgetState ?? {}), selectedNetwork: id });
    if (!canFetch) return;
    // Fetch this network's live read-only balances; the emitted summary updates the view.
    setSwitching(true);
    try { await bridge.callTool("get_wallet_summary", { network: id.toUpperCase() }); }
    catch { /* keep the prior view; the footer will fall back to "Address ready". */ }
    finally { setSwitching(false); }
  };
  useEffect(() => {
    if (!networkOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNetworkOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [networkOpen]);
  return <main className="card"><Header badge={isMainnet ? "MAINNET" : "BETA"} />
    {data.connection && <div className="connected-strip"><span>✓ Wallet connected</span><strong>{short(connectedAddress)}</strong></div>}
    <section className="wallet-top">
      <div><span className="eyebrow">Available balance</span>{switching
        ? <><h1 className="balance-pending">—</h1><span className="subtle">Loading live {network.nativeToken} balance…</span></>
        : !isMainnet
          ? <><h1><small>$</small>{Number(usdc?.formatted ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1><span className="subtle">{usdc?.formatted} USDC</span></>
          : isLiveBalance
            ? (usdc && Number(usdc.formatted) > 0
                ? <><h1><small>$</small>{Number(usdc.formatted).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h1><span className="subtle">{usdc.formatted} USDC · {native?.formatted} {native?.token}</span></>
                : native
                  ? <><h1>{Number(native.formatted).toLocaleString(undefined, { maximumFractionDigits: 6 })} <small>{native.token}</small></h1><span className="subtle">{usdc ? `${usdc.formatted} USDC · ` : ""}Live {network.label} balance</span></>
                  : <><h1 className="balance-pending">—</h1><span className="subtle">{network.nativeToken} balance unavailable — retry shortly</span></>)
            : <><h1 className="balance-pending">—</h1><span className="subtle">{summary.balanceError?.message ?? `${network.nativeToken} balance unavailable — retry shortly`}</span></>}
      </div>
      <button className="network" type="button" aria-haspopup="dialog" aria-expanded={networkOpen} aria-label={`Choose network. Current: ${networkLabel}`} onClick={() => setNetworkOpen(true)}><NetworkLogo id={selectedNetwork as NetworkLogoId} />{networkLabel}<span className="chevron">⌄</span></button>
    </section>
    <div className="address"><span>{connectedAddress ? short(connectedAddress) : summary.maskedAddress}</span><span>{isLiveBalance ? (usdc && native ? `${native.formatted} ${native.token} gas` : "Live balance") : switching ? "Loading…" : isMainnet ? `${network.nativeToken} balance pending` : "Demo/Testnet"}</span></div>
    <nav className="actions">
      <button onClick={() => onNavigate(canSend ? "transfer-form" : "mainnet-signing-locked")}><b>↗</b>Send</button>
      <button onClick={() => onNavigate("receive")}><b>↙</b>Receive</button>
      <button onClick={() => onNavigate("swap-form")}><b>⇄</b>Swap</button>
      <button onClick={() => void bridge.callTool("list_agent_policies", {})}><b>⌁</b>Agent limits</button>
      <button onClick={() => void bridge.callTool("get_audit_log", { limit: 30 })}><b>≡</b>Audit log</button>
    </nav>
    <section className="section-head"><h2>Recent activity</h2><button className="link" onClick={() => void bridge.callTool("list_transactions", { limit: 20 })}>View all</button></section>
    <Transactions items={summary.latestTransactions} />
    <footer><span><i className={`secure-dot ${isLiveBalance ? "" : "staged-dot"}`} /> {isLiveBalance ? "Live RPC balance" : switching ? "Loading balance…" : isMainnet ? "Address ready" : "Policy engine active"}</span><span>{isMainnet ? `${network.label}${network.chainId ? ` · Chain ${network.chainId}` : ""}` : "Demo/Testnet"}</span></footer>
    {networkOpen && <div className="network-sheet-backdrop" role="presentation" onClick={() => setNetworkOpen(false)}>
      <section className="network-sheet" role="dialog" aria-modal="true" aria-labelledby="network-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="network-sheet-handle" />
        <div className="network-sheet-head"><div><span className="eyebrow">13 MAINNETS</span><h2 id="network-sheet-title">Choose network</h2></div><button type="button" aria-label="Close network selector" onClick={() => setNetworkOpen(false)}>×</button></div>
        <div className="network-options" role="listbox" aria-label="AiFinPay wallet networks">{networkOptions.map(([id, item]) => <button type="button" role="option" aria-selected={selectedNetwork === id} className={selectedNetwork === id ? "selected" : ""} key={id} onClick={() => void selectNetwork(id)}>
          <NetworkLogo id={id as NetworkLogoId} /><span className="network-option-copy"><strong>{item.label}</strong><small>{item.family} · {item.nativeToken}{item.chainId ? ` · Chain ${item.chainId}` : ""}</small></span><span className={`network-availability ${item.enabledForSigning ? "live" : "ready"}`}>{item.enabledForSigning ? "SEND + BALANCE" : "LIVE BALANCE"}</span>{selectedNetwork === id && <b aria-hidden="true">✓</b>}
        </button>)}</div>
        <p>One Vault controls all 13 addresses. Every network returns live read-only balances from public RPC; your keys never leave your device.</p>
      </section>
    </div>}
  </main>;
}

function Receive({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const [copied, setCopied] = useState("");
  const addresses = data.connection?.addresses;
  const currentNetwork = (data.summary?.selectedNetwork ?? "CASPER").toLowerCase();
  const [selectedNetwork, setSelectedNetwork] = useState<MainnetId>(
    currentNetwork in MAINNET_NETWORKS ? currentNetwork as MainnetId : "casper"
  );
  const network = MAINNET_NETWORKS[selectedNetwork];
  const addressField = network.family === "EVM" ? "evm" : selectedNetwork;
  const address = addresses?.[addressField];
  const copy = async (label: string, value?: string) => {
    if (!value) return;
    let ok = false;
    // The async Clipboard API is blocked inside ChatGPT's sandboxed iframe, so a
    // rejection here must not stop the fallback (or the "COPIED" feedback) below.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      /* fall through to the execCommand path */
    }
    if (!ok) {
      // Legacy fallback: a hidden textarea + execCommand, which works in more
      // sandboxed contexts as long as it runs during the click gesture.
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, value.length);
        ok = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        ok = false;
      }
    }
    // Always show feedback so the button never looks dead; on the rare chance both
    // paths fail, the address text is still shown for manual selection.
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1_500);
  };
  return <main className="card"><Header label="Receive" badge={data.summary?.mode === "MAINNET" ? "MAINNET" : "BETA"} /><button className="back" onClick={onBack}>← Wallet</button><section className="hero-icon">↙</section><div className="center"><h2>Receive assets</h2><p>Select the exact receiving network. The QR code contains only your public wallet address.</p></div>
    <label className="receive-network">Network<select aria-label="Receive network" value={selectedNetwork} onChange={(event) => setSelectedNetwork(event.target.value as MainnetId)}>{Object.entries(MAINNET_NETWORKS).map(([id, item]) => <option value={id} key={id}>{item.label} · {item.nativeToken}</option>)}</select></label>
    <section className="receive-card" aria-live="polite">
      <div className="receive-chain"><NetworkLogo id={selectedNetwork as NetworkLogoId} /><div><strong>{network.label}</strong><span>{network.family === "EVM" ? "EVM address" : `${network.nativeToken} address`}</span></div></div>
      {address ? <><div className="qr-shell"><QRCodeSVG value={address} size={196} level="M" marginSize={2} title={`${network.label} wallet address QR code`} /></div><code className="receive-address">{address}</code><button className="primary copy-address" onClick={() => void copy(selectedNetwork, address)}>{copied === selectedNetwork ? "Copied ✓" : "Copy wallet address"}</button></> : <div className="empty compact"><strong>Connect your Vault first</strong><span>Your public address will appear here after the wallet is connected.</span></div>}
    </section>
    <p className="mainnet-warning">Mainnet addresses can hold assets with real financial value. Send a small test amount first.</p>
  </main>;
}

function MainnetSigningLocked({ onBack }: { onBack: () => void }) {
  return <main className="card"><Header label="Network capability" badge="MAINNET" /><button className="back" onClick={onBack}>← Wallet</button><section className="blocked-icon">!</section><div className="center"><h2>Sending is not enabled on this network yet</h2><p>You can view live balances and receive assets. Choose a network marked “Send + balance” to prepare a locally signed transfer.</p></div><div className="policy-result"><div className="shield">✓</div><div><strong>YOUR KEYS STAY LOCAL</strong><span>Every enabled transfer still requires review and signing inside your encrypted Vault.</span></div></div><button className="primary" onClick={onBack}>Return to wallet</button></main>;
}

const swapKey = (asset: SwapAsset) => `${asset.ticker}:${asset.network}`;

// The current local signing path can fund Polygon native POL and Polygon USDC
// deposits. Never substitute POL for an arbitrary Polygon token: sending the
// wrong asset to an exchange deposit address can permanently lose funds.
function polygonFundingToken(asset: SwapAsset): "NATIVE" | "USDC" | null {
  if (asset.network !== "matic") return null;
  if (asset.ticker === "usdc") return "USDC";
  if (asset.ticker === "pol" || asset.ticker === "matic") return "NATIVE";
  return null;
}

function SwapForm({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const loadingRequested = useRef(false);
  const assets = useMemo(() => [...(data.assets ?? [])].sort((a, b) => {
    const rank = (item: SwapAsset) => item.ticker === "cspr" && item.network === "cspr" ? 0 : item.network === "matic" ? 1 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  }), [data.assets]);
  const defaultFrom = assets.find((item) => item.ticker === "cspr" && item.network === "cspr") ?? assets[0];
  const defaultTo = assets.find((item) => item.network === "matic" && item.ticker !== defaultFrom?.ticker) ?? assets.find((item) => swapKey(item) !== (defaultFrom ? swapKey(defaultFrom) : ""));
  const [fromKey, setFromKey] = useState("");
  const [toKey, setToKey] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!assets.length && !loadingRequested.current) {
      loadingRequested.current = true;
      void bridge.callTool("list_swap_assets", {}).catch(() => setError("Live swap is not configured yet."));
    }
  }, [assets.length]);
  const from = assets.find((item) => swapKey(item) === fromKey) ?? defaultFrom;
  const to = assets.find((item) => swapKey(item) === toKey) ?? defaultTo;
  const reverse = () => {
    if (!from || !to) return;
    setFromKey(swapKey(to));
    setToKey(swapKey(from));
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!from || !to || !amount.trim()) { setError("Choose two assets and enter an amount."); return; }
    setBusy(true); setError("");
    try { await bridge.callTool("get_swap_quote", { fromAsset: from, toAsset: to, fromAmount: amount.trim() }); }
    catch { setError("Could not load a live quote. Check the amount or try again."); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="Swap" badge="MAINNET" /><button className="back" onClick={onBack}>← Wallet</button><section className="hero-icon">⇄</section><div className="center"><h2>Cross-chain swap</h2><p>Live non-custodial quotes. Output is sent only to an address controlled by your connected Vault.</p></div>
    {!assets.length ? <div className="empty compact"><strong>{error || "Loading swap assets…"}</strong><span>Live swap requires a server-side ChangeNOW partner key. No key is ever exposed to this widget.</span></div> :
      <form className="form swap-form" onSubmit={submit}>
        <label>You send<select aria-label="Swap from asset" value={from ? swapKey(from) : ""} onChange={(event) => setFromKey(event.target.value)}>{assets.map((item) => <option key={swapKey(item)} value={swapKey(item)}>{item.ticker.toUpperCase()} · {item.network}</option>)}</select></label>
        <label>Amount<div className="amount-input"><input aria-label="Swap amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" inputMode="decimal" /><span>{from?.ticker.toUpperCase()}</span></div></label>
        <button className="swap-reverse" type="button" aria-label="Reverse swap direction" onClick={reverse}>⇅</button>
        <label>You receive<select aria-label="Swap to asset" value={to ? swapKey(to) : ""} onChange={(event) => setToKey(event.target.value)}>{assets.filter((item) => !from || swapKey(item) !== swapKey(from)).map((item) => <option key={swapKey(item)} value={swapKey(item)}>{item.ticker.toUpperCase()} · {item.network}</option>)}</select></label>
        {error && <p className="vault-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Loading live quote…" : "Review swap"}</button>
      </form>}
    <p className="disclaimer">Rates can change until the provider receives your deposit. Network and provider fees are reflected in the estimated output.</p>
  </main>;
}

function SwapQuoteView({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const quote = data.quote!; const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const confirm = async () => {
    setBusy(true); setError("");
    try { await bridge.callTool("create_swap_order", { quoteToken: data.quoteToken!, confirmed: true }); }
    catch { setError("The quote expired or the order could not be created. Request a fresh quote."); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="Review swap" badge="MAINNET" /><button className="back" onClick={onBack}>← Swap</button><section className="hero-icon">⇄</section><div className="center"><span className="eyebrow">Estimated exchange</span><h1>{quote.estimatedAmount} <small>{quote.toAsset.ticker.toUpperCase()}</small></h1></div>
    <div className="details"><div><span>You send</span><strong>{quote.fromAmount} {quote.fromAsset.ticker.toUpperCase()}</strong></div><div><span>From network</span><strong>{quote.fromAsset.network}</strong></div><div><span>You receive</span><strong>≈ {quote.estimatedAmount} {quote.toAsset.ticker.toUpperCase()}</strong></div><div><span>To network</span><strong>{quote.toAsset.network}</strong></div></div>
    <div className="policy-result"><div className="shield">✓</div><div><strong>VAULT ADDRESS LOCKED</strong><span>The provider payout and refund addresses are derived from your connected wallet, not supplied by the model.</span></div></div>
    {error && <p className="vault-error">{error}</p>}<button className="primary" disabled={busy} onClick={() => void confirm()}>{busy ? "Creating order…" : `Confirm swap of ${quote.fromAmount} ${quote.fromAsset.ticker.toUpperCase()}`}</button><p className="disclaimer">This creates a deposit order. Funds move only after you separately sign and send the exact deposit.</p>
  </main>;
}

function SwapOrderView({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const order = data.order!; const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const fundingToken = polygonFundingToken(order.fromAsset);
  const copy = async () => { try { await navigator.clipboard.writeText(order.payinAddress); } catch { /* address remains selectable */ } setCopied(true); };
  const fundFromVault = async () => {
    if (!fundingToken) return;
    setBusy(true); setError("");
    try { await bridge.callTool("prepare_transfer", { recipient: order.payinAddress, amount: order.fromAmount, token: fundingToken, network: "POLYGON", idempotencyKey: `swap-${order.id}` }); }
    catch { setError("The deposit could not be prepared. Check the balance and request a fresh swap order if needed."); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="Swap deposit" badge="MAINNET" /><button className="back" onClick={onBack}>← Wallet</button><div className="center"><span className="eyebrow">Order {short(order.id)}</span><h2>Deposit exactly {order.fromAmount} {order.fromAsset.ticker.toUpperCase()}</h2><p>Use only the {order.fromAsset.network} network. A different asset or network can be permanently lost.</p></div>
    <section className="receive-card swap-deposit"><div className="qr-shell"><QRCodeSVG value={order.payinAddress} size={196} level="M" marginSize={2} title="Swap deposit address QR code" /></div><code className="receive-address">{order.payinAddress}</code><button className="secondary copy-address" onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy deposit address"}</button></section>
    {error && <p className="vault-error">{error}</p>}
    {fundingToken
      ? <button className="primary" disabled={busy} onClick={() => void fundFromVault()}>{busy ? "Preparing transfer…" : "Review deposit in AiFinPay Vault"}</button>
      : <p className="mainnet-warning">Send only {order.fromAsset.ticker.toUpperCase()} on {order.fromAsset.network} from a compatible wallet. AiFinPay will never substitute another asset.</p>}
    <button className="secondary" onClick={() => void bridge.callTool("get_swap_status", { orderReference: data.orderReference! })}>Refresh swap status</button>
    <p className="disclaimer">Expected output: ≈ {order.expectedAmount} {order.toAsset.ticker.toUpperCase()} to {short(order.payoutAddress)}. Keep this screen until the swap completes.</p>
  </main>;
}

function SwapStatusView({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const status = data.swapStatus!;
  return <main className="card"><Header label="Swap status" badge="MAINNET" /><button className="back" onClick={onBack}>← Wallet</button><section className="hero-icon">⇄</section><div className="center"><span className="eyebrow">ORDER {short(status.id)}</span><h2>{status.status.replaceAll("_", " ").toUpperCase()}</h2><p>Provider status updated {date(status.updatedAt)}.</p></div><div className="details">{status.payinHash && <div><span>Deposit transaction</span><strong>{short(status.payinHash)}</strong></div>}{status.payoutHash && <div><span>Payout transaction</span><strong>{short(status.payoutHash)}</strong></div>}</div><button className="primary" onClick={() => void bridge.callTool("get_swap_status", { orderReference: data.orderReference! })}>Refresh status</button><button className="secondary" onClick={onBack}>Return to wallet</button></main>;
}

function TransferForm({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const summary = data.summary;
  const isMainnet = summary?.mode === "MAINNET";
  // Inherit the network the wallet is currently showing; native token for it.
  const networkId = (summary?.selectedNetwork ?? "POLYGON").toUpperCase();
  const networkParam = isMainnet ? networkId : "POLYGON_AMOY";
  const nativeToken = summary?.balances?.find((b) => b.token !== "USDC")?.token ?? "POL";
  const hasUsdc = Boolean(summary?.balances?.some((balance) => balance.token === "USDC"));
  const networkLabel = isMainnet
    ? (data.networks?.[networkId.toLowerCase()]?.label ?? (networkId === "POLYGON" ? "Polygon Mainnet" : networkId))
    : "Polygon Amoy";
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"NATIVE" | "USDC">("NATIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recipient.trim() || !amount.trim()) { setError("Enter a recipient address and an amount."); return; }
    setBusy(true); setError("");
    try { await bridge.callTool("prepare_transfer", { recipient: recipient.trim(), amount: amount.trim(), token, network: networkParam, idempotencyKey: `widget-${Date.now()}` }); }
    catch { setError("Could not prepare the transfer. Check the address and amount."); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="New transfer" badge={isMainnet ? "MAINNET" : "BETA"} /><button className="back" onClick={onBack}>← Wallet</button>
    <form className="form" onSubmit={submit}><label>Recipient<input aria-label="Recipient" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
      <label>Amount<div className="amount-input"><input aria-label="Amount" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /><span>{token === "NATIVE" ? nativeToken : "USDC"}</span></div></label>
      <label>Token<select aria-label="Token" value={token} onChange={(e) => setToken(e.target.value as "NATIVE" | "USDC")}><option value="NATIVE">{nativeToken}</option>{hasUsdc && <option value="USDC">USDC</option>}</select></label>
      <div className="info-row"><span>Network</span><strong>{networkLabel}</strong></div>
      {error && <p className="vault-error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Checking policy…" : "Review transfer"}</button></form>
  </main>;
}

function IntentDetails({ intent }: { intent: PaymentIntent }) {
  const tokenLabel = intentTokenLabel(intent);
  return <div className="details">
    <div><span>Recipient</span><strong>{short(intent.recipient)}</strong></div><div><span>Amount</span><strong>{intent.amount} {tokenLabel}</strong></div>
    <div><span>Network</span><strong>{intent.network === "POLYGON_AMOY" ? "Polygon Amoy" : intent.network === "POLYGON" ? "Polygon Mainnet" : intent.network}</strong></div><div><span>Estimated fee</span><strong>{intent.estimatedFee}</strong></div>
    <div><span>Initiated by</span><strong>{intent.initiatedByType === "AGENT" ? intent.initiatedById : "You"}</strong></div><div><span>Risk</span><StatusPill value={intent.riskLevel} /></div>
  </div>;
}

function TransferPreview({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const intent = data.intent!; const [busy, setBusy] = useState(false);
  const tokenLabel = intentTokenLabel(intent);
  const signUrl = data.signUrl;
  const cancel = () => void bridge.callTool("cancel_transfer", { transferIntentId: intent.id });
  // Mainnet with signing enabled: the server returns a signUrl. Sending is
  // non-custodial, so open the Vault where the key lives to review and sign.
  const openVault = () => {
    if (!signUrl) return;
    if (window.openai?.openExternal) void window.openai.openExternal({ href: signUrl });
    else window.open(signUrl, "_blank", "noopener,noreferrer");
  };
  const confirm = async () => { setBusy(true); try { await bridge.callTool("confirm_transfer", { transferIntentId: intent.id, confirmationToken: data.confirmationToken!, idempotencyKey: `confirm-${intent.id}` }); } finally { setBusy(false); } };
  return <main className="card"><Header label="Review transfer" /><button className="back" onClick={onBack}>← Wallet</button>
    <section className="hero-icon">↗</section><div className="center"><span className="eyebrow">You are sending</span><h1>{intent.amount} <small>{tokenLabel}</small></h1></div>
    <IntentDetails intent={intent} />
    <div className="policy-result"><div className="shield">✓</div><div><strong>{intent.policyDecision.replaceAll("_", " ")}</strong><span>{data.policyExplanation ?? "Validated by deterministic AiFinPay policy rules."}</span></div></div>
    {signUrl
      ? <><div className="button-row"><button className="secondary" onClick={cancel}>Cancel</button><button className="primary" onClick={openVault}>Open Vault to sign &amp; send</button></div>
          <p className="disclaimer">You review and sign this transaction inside your encrypted Vault. Your private key never leaves your device.</p></>
      : <><div className="button-row"><button className="secondary" onClick={cancel}>Cancel</button><button className="primary" onClick={confirm} disabled={busy}>{busy ? "Processing…" : "Confirm transfer"}</button></div>
          <p className="disclaimer">No private key is exposed or transmitted.</p></>}
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
  const tokenLabel = intentTokenLabel(intent);
  const isDemo = intent.network === "POLYGON_AMOY";
  const openExplorer = () => { if (!data.explorerUrl) return; if (window.openai?.openExternal) void window.openai.openExternal({ href: data.explorerUrl }); else window.open(data.explorerUrl, "_blank", "noopener,noreferrer"); };
  return <main className="card"><Header label="Receipt" badge={isDemo ? "BETA" : "MAINNET"} /><section className="success-icon">✓</section><div className="center"><span className="eyebrow">{isDemo ? "Demo payment complete" : "Mainnet transaction submitted"}</span><h1>{intent.amount} <small>{tokenLabel}</small></h1><StatusPill value={intent.status} /></div>
    <IntentDetails intent={intent} /><div className="receipt-box"><div><span>Transaction hash</span><strong>{short(intent.transactionHash)}</strong></div><div><span>Audit receipt</span><strong>{intent.auditReceiptId}</strong></div><div><span>Timestamp</span><strong>{intent.submittedAt ? date(intent.submittedAt) : "—"}</strong></div></div>
    <div className="button-row"><button className="secondary" onClick={onBack}>Wallet</button><button className="primary" onClick={openExplorer} disabled={!data.explorerUrl}>View explorer</button></div>
  </main>;
}

function Policies({ policies, onBack, onNew }: { policies: AgentPolicy[]; onBack: () => void; onNew: () => void }) {
  return <main className="card"><Header label="Agent limits" /><button className="back" onClick={onBack}>← Wallet</button><div className="section-head"><h2>Spending policies</h2><button className="link" onClick={onNew}>+ New policy</button></div>
    <div className="policies">{policies.map((policy) => {
      const networkId = policy.networkAllowlist[0] ?? "POLYGON";
      const asset = policy.tokenAllowlist[0] === "POL"
        ? MAINNET_NETWORKS[networkId.toLowerCase() as MainnetId]?.nativeToken ?? "Native"
        : policy.tokenAllowlist[0] ?? "Asset";
      return <article key={policy.policyId}><div className="agent-avatar">AI</div><div><strong>{policy.name}</strong><span>{policy.agentId}</span></div><StatusPill value={policy.enabled ? "ACTIVE" : "REVOKED"} /><dl><div><dt>Daily</dt><dd>{policy.dailyLimit} {asset}</dd></div><div><dt>Per transaction</dt><dd>{policy.perTransactionLimit} {asset}</dd></div><div><dt>Auto-approve</dt><dd>≤ {policy.approvalThreshold} {asset}</dd></div></dl></article>;
    })}</div>
  </main>;
}

function PolicyEditor({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const [agentId, setAgentId] = useState("research-agent"); const [daily, setDaily] = useState("5");
  const [perTx, setPerTx] = useState("0.50"); const [threshold, setThreshold] = useState("0.10"); const [busy, setBusy] = useState(false);
  const network = data.summary?.selectedNetwork ?? "POLYGON";
  const nativeToken = data.summary?.balances.find((balance) => balance.token !== "USDC")?.token ?? "POL";
  const hasUsdc = Boolean(data.summary?.balances.some((balance) => balance.token === "USDC"));
  const [token, setToken] = useState<"USDC" | "NATIVE">(hasUsdc ? "USDC" : "NATIVE");
  const tokenLabel = token === "USDC" ? "USDC" : nativeToken;
  const networkLabel = data.networks?.[network.toLowerCase()]?.label ?? network;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await bridge.callTool("create_agent_policy", { agentId, name: "Research API budget", dailyLimit: daily, perTransactionLimit: perTx,
      tokenAllowlist: [token], networkAllowlist: [network], allowedRecipients: [],
      allowedMerchantCategories: [], merchantAllowlist: [], approvalThreshold: threshold,
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(), idempotencyKey: `policy-preview-${Date.now()}` }); }
    finally { setBusy(false); }
  };
  return <main className="card"><Header label="New agent policy" /><button className="back" onClick={onBack}>← Agent limits</button><form className="form" onSubmit={submit}>
    <label>Agent ID<input value={agentId} onChange={(event) => setAgentId(event.target.value)} /></label>
    <div className="form-grid"><label>Daily limit<input value={daily} onChange={(event) => setDaily(event.target.value)} inputMode="decimal" /></label><label>Per transaction<input value={perTx} onChange={(event) => setPerTx(event.target.value)} inputMode="decimal" /></label></div>
    <label>Auto-approval threshold<input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" /></label>
    <label>Asset<select value={token} onChange={(event) => setToken(event.target.value as "USDC" | "NATIVE")}><option value="NATIVE">{nativeToken}</option>{hasUsdc && <option value="USDC">USDC</option>}</select></label>
    <div className="info-row"><span>Allowed</span><strong>{tokenLabel} · {networkLabel}</strong></div>
    <button className="primary" disabled={busy}>{busy ? "Preparing…" : "Review policy"}</button></form></main>;
}

function PolicyPreview({ data, onBack }: { data: WidgetData; onBack: () => void }) {
  const draft = data.draft as any; const [busy, setBusy] = useState(false);
  const networkId = String(draft.networkAllowlist?.[0] ?? "POLYGON");
  const network = MAINNET_NETWORKS[networkId.toLowerCase() as MainnetId];
  const asset = draft.tokenAllowlist?.[0] === "POL" ? network?.nativeToken ?? "Native" : draft.tokenAllowlist?.[0] ?? "Asset";
  const confirm = async () => { setBusy(true); try { await bridge.callTool("create_agent_policy", { ...draft, confirmationToken: data.confirmationToken, confirmationExpiresAt: data.expiresAt, idempotencyKey: `policy-confirm-${draft.agentId}` }); } finally { setBusy(false); } };
  return <main className="card"><Header label="Review agent policy" /><button className="back" onClick={onBack}>← Agent limits</button><section className="hero-icon">⌁</section><div className="center"><h2>{draft.name}</h2><p>Agent: {draft.agentId}</p></div>
    <div className="details"><div><span>Daily limit</span><strong>{draft.dailyLimit} {asset}</strong></div><div><span>Per transaction</span><strong>{draft.perTransactionLimit} {asset}</strong></div><div><span>Auto-approve</span><strong>≤ {draft.approvalThreshold} {asset}</strong></div><div><span>Network</span><strong>{network?.label ?? networkId}</strong></div></div>
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
  return <main className="card"><Header label="13 mainnets" /><button className="back" onClick={onBack}>← Wallet</button><div className="network-list">{Object.entries(data.networks ?? {}).map(([id, network]) => <article key={id}><div><strong>{network.label}</strong><span>{network.family} · {network.nativeToken}{network.chainId ? ` · ${network.chainId}` : ""}</span><code title={network.deployment.address}>{network.deployment.name}{network.deployment.moduleName ? `::${network.deployment.moduleName}` : ""} · {short(network.deployment.address)}</code></div><span className={`network-mode ${network.enabledForSigning ? "live" : "staged"}`}>{network.enabledForSigning ? "SEND + BALANCE" : "BALANCE ONLY"}</span></article>)}</div><p className="disclaimer">Every network supports live balances and receiving. Sending appears only where the deployment operator has enabled and release-tested local signing.</p></main>;
}

function WalletApp({ initialData }: { initialData?: WidgetData }) {
  // Demo data is only for the standalone /preview page. Inside a host iframe,
  // never flash fabricated balances while waiting for the real tool result.
  const first = useMemo<WidgetData>(() => initialData ?? window.openai?.toolOutput ?? (window.parent === window ? browserDemoData : { view: "loading" }), [initialData]);
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
  if (data.view === "swap-form") return <SwapForm data={data} onBack={back} />;
  if (data.view === "swap-quote") return <SwapQuoteView data={data} onBack={() => setData({ view: "swap-form" })} />;
  if (data.view === "swap-order") return <SwapOrderView data={data} onBack={back} />;
  if (data.view === "swap-status") return <SwapStatusView data={data} onBack={back} />;
  if (data.view === "mainnet-signing-locked") return <MainnetSigningLocked onBack={back} />;
  if (data.view === "transfer-form") return <TransferForm data={wallet} onBack={back} />;
  if (data.view === "transfer-preview") return <TransferPreview data={data} onBack={back} />;
  if (data.view === "blocked") return <Blocked data={data} onBack={back} />;
  if (data.view === "receipt") return <Receipt data={data} onBack={back} />;
  if (data.view === "history") return <main className="card"><Header label="Transactions" /><button className="back" onClick={back}>← Wallet</button><Transactions items={data.transactions ?? []} /></main>;
  if (data.view === "policies") return <Policies policies={data.policies ?? []} onBack={back} onNew={() => setData({ view: "policy-editor" })} />;
  if (data.view === "policy-editor") return <PolicyEditor data={wallet} onBack={() => setData({ view: "policies", policies: wallet.summary?.activeAgentPolicies ?? [] })} />;
  if (data.view === "policy-preview") return <PolicyPreview data={data} onBack={() => setData({ view: "policies", policies: wallet.summary?.activeAgentPolicies ?? [] })} />;
  if (data.view === "audit") return <Audit data={data} onBack={back} />;
  if (data.view === "error") return <ErrorView data={data} onBack={back} />;
  return <main className="card"><Header label="AiFinPay" /><div className="empty"><h2>{data.view.replaceAll("-", " ")}</h2><p>This state is ready for host-provided data.</p></div><button className="primary" onClick={back}>Return to wallet</button></main>;
}

export function App({ initialData }: { initialData?: WidgetData }) {
  return <WalletApp {...(initialData ? { initialData } : {})} />;
}
