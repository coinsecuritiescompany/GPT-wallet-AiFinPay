import polygon from "@web3icons/core/svgs/networks/background/polygon.svg.js";
import avalanche from "@web3icons/core/svgs/networks/background/avalanche.svg.js";
import arbitrum from "@web3icons/core/svgs/networks/background/arbitrum-one.svg.js";
import bnb from "@web3icons/core/svgs/networks/background/binance-smart-chain.svg.js";
import base from "@web3icons/core/svgs/networks/background/base.svg.js";
import unichain from "@web3icons/core/svgs/networks/background/unichain.svg.js";
import optimism from "@web3icons/core/svgs/networks/background/optimism.svg.js";
import xrpl from "@web3icons/core/svgs/networks/background/xrp.svg.js";
import solana from "@web3icons/core/svgs/networks/background/solana.svg.js";
import near from "@web3icons/core/svgs/networks/background/near-protocol.svg.js";
import aptos from "@web3icons/core/svgs/networks/background/aptos.svg.js";

export type NetworkLogoId = "polygon" | "avalanche" | "arbitrum" | "bnb" | "base" | "unichain" | "optimism" | "botchain" | "xrplevm" | "solana" | "near" | "aptos";

const svgToDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const NETWORK_LOGOS: Record<Exclude<NetworkLogoId, "botchain">, string> = {
  polygon,
  avalanche,
  arbitrum,
  bnb,
  base,
  unichain,
  optimism,
  xrplevm: xrpl,
  solana,
  near,
  aptos
};

export function NetworkLogo({ id }: { id: NetworkLogoId }) {
  if (id === "botchain") {
    return <span className="network-logo botchain-logo" data-testid="network-logo-botchain" aria-hidden="true">
      <svg viewBox="0 0 128 205" focusable="false">
        <path d="M32.155.011 126.824 54.632v39.896c-9.401 4.345-18.431 9.724-27.343 15.027-1.625.971-3.739-.194-3.038 3.062l30.285 16.676 1.36 37.816L63.513 205 0 169.34v-38.839l94.913 55.925v-36.511l-62.769-36.511V74.564l62.769 35.735V76.903c0-.453 2.188-1.757.117-3.072L32.144 36.511V0z" />
      </svg>
    </span>;
  }

  return <span className="network-logo" data-testid={`network-logo-${id}`} aria-hidden="true">
    <img src={svgToDataUri(NETWORK_LOGOS[id])} alt="" />
  </span>;
}
