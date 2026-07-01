import { FaWallet } from "react-icons/fa";
import { useWeb3 } from "../../context/Web3Context";
import { shortAddress } from "../../config/contract";

/**
 * Connect / connected / wrong-network wallet button.
 * Reused in the Navbar and on the property investment card.
 */
export default function WalletButton({ className = "btn", showIcon = false }) {
  const { account, connect, isConnecting, wrongNetwork, switchNetwork, hasMetaMask } =
    useWeb3();

  if (!hasMetaMask) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        Install MetaMask
      </a>
    );
  }

  if (account && wrongNetwork) {
    return (
      <button className={className} onClick={switchNetwork}>
        Wrong network — Switch
      </button>
    );
  }

  if (account) {
    return (
      <button className={className} title={account}>
        {showIcon && <FaWallet className="mr-2 inline" />}
        {shortAddress(account)}
      </button>
    );
  }

  return (
    <button className={className} onClick={connect} disabled={isConnecting}>
      {showIcon && <FaWallet className="mr-2 inline" />}
      {isConnecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
