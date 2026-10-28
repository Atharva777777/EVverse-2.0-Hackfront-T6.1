// Monad payment stub for standalone EV2.0 journey planning
export const MONAD_CONFIG = {
  chainIdHex: "0x279f",
  chainName: "Monad Testnet",
  currencySymbol: "MON",
  explorerUrl: "https://testnet.monadexplorer.com",
};

export async function getExistingAccounts(): Promise<string[]> {
  return [];
}

export async function getCurrentChainId(): Promise<string | null> {
  return null;
}

export async function requestWalletAccounts(): Promise<string[]> {
  return [];
}

export function truncateAddress(address: string): string {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
}
