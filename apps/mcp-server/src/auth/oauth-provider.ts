import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidScopeError, InvalidTargetError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface PublicWalletAddresses {
  evm: string;
  solana: string;
  near: string;
  aptos: string;
}

type SignedPayload = Record<string, unknown> & { iat: number; exp: number };

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 180 * 24 * 60 * 60;
const CLIENT_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const AUTHORIZATION_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 2 * 60;
const SUPPORTED_SCOPES = new Set(["wallet:read", "wallet:write"]);

function canonicalAddresses(addresses: PublicWalletAddresses): PublicWalletAddresses {
  return { ...addresses, evm: addresses.evm.toLowerCase() };
}

function sameResource(left: string | undefined, right: URL | undefined): boolean {
  return Boolean(left && right && new URL(left).href === right.href);
}

export class StatelessClientsStore implements OAuthRegisteredClientsStore {
  constructor(private readonly sign: (purpose: string, payload: SignedPayload) => string, private readonly verify: <T extends SignedPayload>(purpose: string, token: string) => T) {}

  async registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">): Promise<OAuthClientInformationFull> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const metadata = { ...client, token_endpoint_auth_method: "none", client_secret: undefined, client_secret_expires_at: undefined };
    const clientId = this.sign("client", { ...metadata, iat: issuedAt, exp: issuedAt + CLIENT_TTL_SECONDS });
    return { ...metadata, client_id: clientId, client_id_issued_at: issuedAt };
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    try {
      const payload = this.verify<OAuthClientInformationFull & SignedPayload>("client", clientId);
      const { iat, exp: _exp, ...metadata } = payload;
      void _exp;
      return { ...metadata, client_id: clientId, client_id_issued_at: iat, token_endpoint_auth_method: "none" };
    } catch {
      return undefined;
    }
  }
}

interface AuthorizationRequest extends SignedPayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state?: string;
  resource: string;
}

interface AuthorizationCode extends AuthorizationRequest {
  addresses: PublicWalletAddresses;
  userId: string;
}

interface WalletToken extends SignedPayload {
  clientId: string;
  scopes: string[];
  resource: string;
  addresses: PublicWalletAddresses;
  userId: string;
}

export class AiFinPayOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: StatelessClientsStore;
  private readonly usedCodes = new Set<string>();

  constructor(private readonly secret: string, private readonly issuer: URL, private readonly resource: URL) {
    this.clientsStore = new StatelessClientsStore(this.sign.bind(this), this.verify.bind(this));
  }

  private sign(purpose: string, payload: SignedPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(`${purpose}.${body}`).digest("base64url");
    return `afp1.${purpose}.${body}.${signature}`;
  }

  private verify<T extends SignedPayload>(purpose: string, token: string): T {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "afp1" || parts[1] !== purpose) throw new Error("Invalid token");
    const expected = createHmac("sha256", this.secret).update(`${purpose}.${parts[2]}`).digest();
    const provided = Buffer.from(parts[3] ?? "", "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Invalid token signature");
    const payload = JSON.parse(Buffer.from(parts[2] ?? "", "base64url").toString("utf8")) as T;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= now || payload.iat > now + 30) throw new Error("Expired token");
    return payload;
  }

  private validateScopes(scopes: string[]): void {
    if (!scopes.length || scopes.some((scope) => !SUPPORTED_SCOPES.has(scope))) throw new InvalidScopeError("An unsupported wallet scope was requested.");
  }

  private validateResource(resource: URL | undefined): URL {
    if (!resource || resource.href !== this.resource.href) throw new InvalidTargetError("The requested OAuth resource does not match this MCP server.");
    return resource;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.validateScopes(params.scopes ?? []);
    const resource = this.validateResource(params.resource);
    const now = Math.floor(Date.now() / 1000);
    const request = this.sign("authorize", {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      state: params.state,
      resource: resource.href,
      iat: now,
      exp: now + AUTHORIZATION_TTL_SECONDS
    });
    const target = new URL("/vault", this.issuer);
    target.searchParams.set("oauth", request);
    res.redirect(302, target.href);
  }

  approveAuthorization(requestToken: string, addresses: PublicWalletAddresses): string {
    const request = this.verify<AuthorizationRequest>("authorize", requestToken);
    const normalized = canonicalAddresses(addresses);
    const userId = `wallet_${createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32)}`;
    const now = Math.floor(Date.now() / 1000);
    const code = this.sign("code", { ...request, addresses: normalized, userId, iat: now, exp: now + AUTH_CODE_TTL_SECONDS });
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("code", code);
    if (request.state) redirect.searchParams.set("state", request.state);
    return redirect.href;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const code = this.verify<AuthorizationCode>("code", authorizationCode);
    if (code.clientId !== client.client_id) throw new InvalidGrantError("Authorization code was issued to another client.");
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    const code = this.verify<AuthorizationCode>("code", authorizationCode);
    const codeHash = createHash("sha256").update(authorizationCode).digest("hex");
    if (this.usedCodes.has(codeHash)) throw new InvalidGrantError("Authorization code was already used.");
    if (code.clientId !== client.client_id || code.redirectUri !== redirectUri || !sameResource(code.resource, resource)) throw new InvalidGrantError("Authorization code context does not match the token request.");
    this.usedCodes.add(codeHash);
    return this.issueTokens(code);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    const token = this.verify<WalletToken>("refresh", refreshToken);
    const requestedScopes = scopes ?? token.scopes;
    this.validateScopes(requestedScopes);
    if (requestedScopes.some((scope) => !token.scopes.includes(scope)) || token.clientId !== client.client_id || !sameResource(token.resource, resource)) throw new InvalidGrantError("Refresh token context does not match the token request.");
    return this.issueTokens({ ...token, scopes: requestedScopes });
  }

  private issueTokens(subject: Pick<WalletToken, "clientId" | "scopes" | "resource" | "addresses" | "userId">): OAuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const base = { clientId: subject.clientId, scopes: subject.scopes, resource: subject.resource, addresses: subject.addresses, userId: subject.userId, iat: now };
    return {
      access_token: this.sign("access", { ...base, exp: now + ACCESS_TTL_SECONDS }),
      refresh_token: this.sign("refresh", { ...base, exp: now + REFRESH_TTL_SECONDS }),
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      scope: subject.scopes.join(" ")
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = this.verify<WalletToken>("access", token);
    if (payload.resource !== this.resource.href) throw new Error("Invalid token audience");
    this.validateScopes(payload.scopes);
    return {
      token,
      clientId: payload.clientId,
      scopes: payload.scopes,
      expiresAt: payload.exp,
      resource: new URL(payload.resource),
      extra: { userId: payload.userId, addresses: payload.addresses }
    };
  }
}
