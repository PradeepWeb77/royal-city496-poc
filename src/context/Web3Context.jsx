import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { ethers } from "ethers";
import { TARGET_CHAIN_ID, NETWORKS } from "../config/contract";

// ethers v5 is the version pinned in package.json — use the v5 provider API.
const Web3Context = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useWeb3 = () => {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used within <Web3Provider>");
  return ctx;
};

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const hasMetaMask =
    typeof window !== "undefined" && typeof window.ethereum !== "undefined";

  const buildProvider = useCallback(() => {
    if (!window.ethereum) return null;
    // "any" allows the provider to follow network changes gracefully.
    return new ethers.providers.Web3Provider(window.ethereum, "any");
  }, []);

  // Sync state from an already-authorized wallet (no popup).
  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const p = buildProvider();
      const accounts = await p.listAccounts();
      const net = await p.getNetwork();
      setProvider(p);
      setChainId(net.chainId);
      setAccount(accounts.length ? accounts[0] : null);
    } catch {
      /* ignore — wallet locked or unavailable */
    }
  }, [buildProvider]);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setError("MetaMask not detected. Please install MetaMask to continue.");
      return;
    }
    try {
      setIsConnecting(true);
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const p = buildProvider();
      const net = await p.getNetwork();
      setProvider(p);
      setChainId(net.chainId);
      setAccount(accounts[0]);
    } catch (e) {
      setError(e?.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  }, [buildProvider]);

  const disconnect = useCallback(() => {
    // dApps cannot force MetaMask to disconnect; we just clear local state.
    setAccount(null);
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    const target = NETWORKS[TARGET_CHAIN_ID];
    if (!target) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.chainId }],
      });
    } catch (e) {
      // 4902 = chain not added to the wallet yet.
      if (e?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [target],
          });
        } catch (addErr) {
          setError(addErr?.message || "Could not add network.");
        }
      } else {
        setError(e?.message || "Could not switch network.");
      }
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    refresh();

    const onAccountsChanged = (accs) =>
      setAccount(accs && accs.length ? accs[0] : null);
    const onChainChanged = () => {
      // Simplest correct behavior: reload so all providers/contracts rebind.
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [refresh]);

  const wrongNetwork =
    !!account &&
    chainId !== null &&
    Number(chainId) !== Number(TARGET_CHAIN_ID);

  const value = {
    account,
    chainId,
    provider,
    isConnecting,
    error,
    hasMetaMask,
    wrongNetwork,
    connect,
    disconnect,
    switchNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}
