import { useMemo, useState } from "react";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { decryptVault, encryptVault, type EncryptedVault } from "./vault-crypto.js";

const STORAGE_KEY = "aifinpay.vault.v1";
const EVM_NETWORKS = ["Polygon", "Avalanche", "Arbitrum", "BNB Chain", "Base", "Unichain", "Optimism", "BOT Chain", "XRPL EVM"];

type Step = "welcome" | "phrase" | "verify" | "password" | "restore" | "ready";

const shuffled = <T,>(items: T[]) => items.map((item) => ({ item, sort: crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 })).sort((a, b) => a.sort - b.sort).map(({ item }) => item);
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

export function VaultApp() {
  const stored = useMemo(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as EncryptedVault | null; } catch { return null; } }, []);
  const [step, setStep] = useState<Step>(stored ? "ready" : "welcome");
  const [mnemonic, setMnemonic] = useState("");
  const [wordCount, setWordCount] = useState<12 | 15>(12);
  const [quiz, setQuiz] = useState<Array<{ id: number; word: string }>>([]);
  const [answer, setAnswer] = useState<Array<{ id: number; word: string }>>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restoreText, setRestoreText] = useState("");
  const [vault, setVault] = useState<EncryptedVault | null>(stored);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairStatus, setPairStatus] = useState<"idle" | "connected">("idle");
  const pairToken = useMemo(() => new URLSearchParams(window.location.search).get("pair"), []);
  const oauthRequest = useMemo(() => new URLSearchParams(window.location.search).get("oauth"), []);

  const create = () => {
    const next = generateMnemonic(wordlist, wordCount === 12 ? 128 : 160);
    setMnemonic(next); setAnswer([]); setError(""); setStep("phrase");
  };
  const beginVerify = () => { const words = mnemonic.split(" ").map((word, id) => ({ id, word })); setQuiz(shuffled(words)); setAnswer([]); setError(""); setStep("verify"); };
  const verify = () => {
    if (answer.map(({ word }) => word).join(" ") !== mnemonic) { setError("The order is not correct. Try again."); setAnswer([]); setQuiz(shuffled(mnemonic.split(" ").map((word, id) => ({ id, word })))); return; }
    setError(""); setStep("password");
  };
  const save = async (source = mnemonic) => {
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try { const next = await encryptVault(source, password); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setVault(next); setMnemonic(""); setRestoreText(""); setPassword(""); setConfirmPassword(""); setStep("ready"); }
    catch { setError("The vault could not be created on this device."); }
    finally { setBusy(false); }
  };
  const restore = () => {
    const normalized = restoreText.trim().toLowerCase().replace(/\s+/g, " ");
    const count = normalized ? normalized.split(" ").length : 0;
    if (![12, 15].includes(count) || !validateMnemonic(normalized, wordlist)) { setError("Enter a valid 12- or 15-word BIP-39 recovery phrase."); return; }
    setMnemonic(normalized); setError(""); setStep("password");
  };
  const unlock = async () => {
    if (!vault) return;
    setBusy(true); setError("");
    try { await decryptVault(vault, password); setPassword(""); setStep("ready"); }
    catch { setError("Incorrect password or damaged vault."); }
    finally { setBusy(false); }
  };
  const remove = () => { localStorage.removeItem(STORAGE_KEY); setVault(null); setPassword(""); setStep("welcome"); };
  const pair = async () => {
    if (!vault || !pairToken) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/vault/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pairToken, addresses: vault.addresses }) });
      if (!response.ok) throw new Error("PAIR_FAILED");
      setPairStatus("connected");
    } catch { setError("This connection link expired or is no longer known by the server. Return to ChatGPT and request a fresh secure link."); }
    finally { setBusy(false); }
  };
  const authorizeChatGPT = async () => {
    if (!vault || !oauthRequest) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/oauth/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: oauthRequest, addresses: vault.addresses }) });
      const result = await response.json() as { redirectUrl?: string };
      if (!response.ok || !result.redirectUrl) throw new Error("AUTHORIZATION_FAILED");
      window.location.assign(result.redirectUrl);
    } catch { setError("This authorization request expired. Return to ChatGPT and choose Connect again."); setBusy(false); }
  };

  return <main className="vault-shell">
    <header className="vault-header"><div className="brand"><img className="logo" src="/icon.png" alt="" /><span>AiFinPay</span></div><span className="vault-label">Secure Vault</span></header>
    {step === "welcome" && <section className="vault-panel"><span className="vault-kicker">NON-CUSTODIAL · 12 MAINNETS</span><h1>Your wallet for ChatGPT</h1><p>Create one recovery phrase for EVM, Solana, NEAR and Aptos addresses. Keys are generated and encrypted on this device only.</p><div className="network-cloud">{[...EVM_NETWORKS, "Solana", "NEAR", "Aptos"].map((name) => <span key={name}>{name}</span>)}</div><div className="choice"><button className={wordCount === 12 ? "selected" : ""} onClick={() => setWordCount(12)}>12 words</button><button className={wordCount === 15 ? "selected" : ""} onClick={() => setWordCount(15)}>15 words</button></div><button className="primary" onClick={create}>Create wallet</button><button className="text-button" onClick={() => { setError(""); setStep("restore"); }}>Restore existing wallet</button></section>}
    {step === "phrase" && <section className="vault-panel"><span className="vault-kicker warning-text">PRIVATE · WRITE THIS DOWN</span><h2>Your recovery phrase</h2><p>Anyone with these words can control your funds. AiFinPay cannot recover them for you.</p><ol className="phrase-grid">{mnemonic.split(" ").map((word, index) => <li key={`${word}-${index}`}><small>{index + 1}</small>{word}</li>)}</ol><label className="ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.currentTarget.checked)} />I have written the words down in order.</label><button className="primary" disabled={!acknowledged} onClick={beginVerify}>Verify phrase</button></section>}
    {step === "verify" && <section className="vault-panel"><span className="vault-kicker">RECOVERY CHECK</span><h2>Put the words in order</h2><div className="answer-box">{answer.length ? answer.map((entry, index) => <button key={entry.id} onClick={() => setAnswer(answer.filter((_, i) => i !== index))}>{index + 1}. {entry.word}</button>) : <span>Select the first word below</span>}</div><div className="word-picker">{quiz.map((entry) => <button key={entry.id} disabled={answer.some(({ id }) => id === entry.id)} onClick={() => setAnswer([...answer, entry])}>{entry.word}</button>)}</div>{error && <p className="vault-error">{error}</p>}<button className="primary" disabled={answer.length !== quiz.length} onClick={verify}>Confirm order</button></section>}
    {step === "restore" && <section className="vault-panel"><span className="vault-kicker">RESTORE</span><h2>Enter recovery phrase</h2><p>Words are processed locally and are never sent to AiFinPay or ChatGPT.</p><textarea className="restore-input" value={restoreText} onChange={(event) => setRestoreText(event.target.value)} placeholder="Enter 12 or 15 words separated by spaces" spellCheck={false} autoComplete="off" />{error && <p className="vault-error">{error}</p>}<button className="primary" onClick={restore}>Continue</button><button className="text-button" onClick={() => setStep("welcome")}>Back</button></section>}
    {step === "password" && <section className="vault-panel"><span className="vault-kicker">LOCAL ENCRYPTION</span><h2>Protect this device</h2><p>This password encrypts the recovery phrase with AES-256-GCM. It is never uploaded.</p><label className="vault-field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label className="vault-field">Repeat password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>{error && <p className="vault-error">{error}</p>}<button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Encrypting…" : "Create encrypted vault"}</button></section>}
    {step === "ready" && vault && <section className="vault-panel"><span className="vault-kicker success-text">✓ WALLET READY</span><h2>AiFinPay Wallet</h2><p>One protected vault controls addresses across 12 mainnet networks.</p><div className="address-list"><div><span>EVM · 9 networks</span><strong>{short(vault.addresses.evm)}</strong></div><div><span>Solana</span><strong>{short(vault.addresses.solana)}</strong></div><div><span>NEAR</span><strong>{short(vault.addresses.near)}</strong></div><div><span>Aptos</span><strong>{short(vault.addresses.aptos)}</strong></div></div><div className="secure-note">Encrypted locally · PBKDF2-SHA256 · AES-256-GCM · keys never uploaded</div>{oauthRequest && <><div className="oauth-consent"><strong>Connect this wallet to ChatGPT?</strong><span>ChatGPT receives these public addresses only. Your password, recovery phrase and private keys never leave this device.</span></div><button className="primary" disabled={busy} onClick={() => void authorizeChatGPT()}>{busy ? "Authorizing…" : "Continue to ChatGPT"}</button></>}{!oauthRequest && pairToken && pairStatus === "idle" && <button className="primary" disabled={busy} onClick={() => void pair()}>{busy ? "Connecting…" : "Connect public addresses to ChatGPT"}</button>}{pairStatus === "connected" && <div className="pair-success">✓ Connected. You can return to ChatGPT.</div>}{error && <p className="vault-error">{error}</p>}<button className="secondary" onClick={() => { const blob = new Blob([JSON.stringify(vault, null, 2)], { type: "application/json" }); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "aifinpay-encrypted-vault.json"; anchor.click(); URL.revokeObjectURL(href); }}>Download encrypted backup</button><button className="danger-link" onClick={remove}>Remove vault from this device</button></section>}
    {step === "ready" && !vault && <section className="vault-panel"><h2>Unlock vault</h2><label className="vault-field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="vault-error">{error}</p>}<button className="primary" disabled={busy} onClick={() => void unlock()}>Unlock</button></section>}
    <footer className="vault-footer">AiFinPay never stores recovery phrases or private keys.</footer>
  </main>;
}
