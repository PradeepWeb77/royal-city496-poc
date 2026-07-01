import { useCallback, useEffect, useState } from "react";
import { FaWallet, FaEthereum } from "react-icons/fa";
import { FiUsers, FiTrendingUp } from "react-icons/fi";
import { useWeb3 } from "../../context/Web3Context";
import { useInvestment } from "../../hooks/useInvestment";
import {
  CONTRACT_ADDRESS,
  TARGET_CHAIN_ID,
  NETWORKS,
  explorerTxUrl,
  shortAddress,
  isContractDeployed,
} from "../../config/contract";
import WalletButton from "./WalletButton";

/**
 * Live, on-chain investment widget that replaces the static
 * "Connect Wallet to Invest" button on the property detail page.
 */
export default function InvestPanel() {
  const { account, chainId, wrongNetwork, switchNetwork } = useWeb3();
  const { getStats, getMyInvestment, invest, claimReturns, isDeployed } =
    useInvestment();

  const [stats, setStats] = useState(null);
  const [me, setMe] = useState(null);
  const [amount, setAmount] = useState("0.01");
  const [tx, setTx] = useState({ status: "idle", hash: null, message: "" });

  const refresh = useCallback(async () => {
    try {
      const s = await getStats();
      setStats(s);
      const m = await getMyInvestment();
      setMe(m);
    } catch {
      /* read failure (e.g. wrong network) — leave previous values */
    }
  }, [getStats, getMyInvestment]);

  useEffect(() => {
    refresh();
  }, [refresh, account, chainId]);

  const runTx = useCallback(
    async (sendTx, pendingMsg) => {
      setTx({ status: "pending", hash: null, message: pendingMsg });
      try {
        const sent = await sendTx();
        setTx({ status: "pending", hash: sent.hash, message: "Confirming…" });
        await sent.wait();
        setTx({ status: "success", hash: sent.hash, message: "Success!" });
        await refresh();
      } catch (e) {
        setTx({
          status: "error",
          hash: null,
          message: e?.reason || e?.message || "Transaction failed.",
        });
      }
    },
    [refresh]
  );

  const handleInvest = () => runTx(() => invest(amount), "Sending investment…");
  const handleClaim = () => runTx(() => claimReturns(), "Claiming returns…");

  // --- Not deployed yet -------------------------------------------------
  if (!isDeployed && !isContractDeployed()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">Smart contract not deployed yet</p>
        <p>
          Run <code>npx hardhat run scripts/deploy.js --network localhost</code>{" "}
          in the <code>/blockchain</code> folder to deploy and auto-wire the
          contract address.
        </p>
      </div>
    );
  }

  const explorer = tx.hash ? explorerTxUrl(Number(chainId), tx.hash) : null;
  const networkName = NETWORKS[TARGET_CHAIN_ID]?.chainName || `chain ${TARGET_CHAIN_ID}`;

  return (
    <div className="space-y-4">
      {/* Live pool stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary-50 rounded-lg p-3">
            <p className="text-xs text-secondary-500 flex items-center">
              <FaEthereum className="mr-1" /> Total Invested
            </p>
            <p className="font-semibold">{Number(stats.totalInvested).toFixed(4)} ETH</p>
          </div>
          <div className="bg-secondary-50 rounded-lg p-3">
            <p className="text-xs text-secondary-500 flex items-center">
              <FiUsers className="mr-1" /> Investors
            </p>
            <p className="font-semibold">{stats.investorCount}</p>
          </div>
        </div>
      )}

      {/* Connect / wrong network / invest */}
      {!account ? (
        <WalletButton className="btn w-full flex items-center justify-center" showIcon />
      ) : wrongNetwork ? (
        <button
          className="btn w-full flex items-center justify-center"
          onClick={switchNetwork}
        >
          Switch to {networkName} to invest
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm text-secondary-600">
            Investment amount (ETH)
            <div className="mt-1 flex">
              <input
                type="number"
                min={stats?.minInvestment || "0.01"}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-grow rounded-l-lg border border-secondary-200 px-3 py-2 outline-none focus:border-primary-500"
              />
              <span className="inline-flex items-center rounded-r-lg border border-l-0 border-secondary-200 bg-secondary-50 px-3 text-secondary-600">
                ETH
              </span>
            </div>
          </label>
          {stats && (
            <p className="text-xs text-secondary-500">
              Minimum: {stats.minInvestment} ETH · Connected as{" "}
              {shortAddress(account)}
            </p>
          )}

          <button
            className="btn w-full flex items-center justify-center disabled:opacity-60"
            onClick={handleInvest}
            disabled={tx.status === "pending"}
          >
            <FaWallet className="mr-2" />
            {tx.status === "pending" ? "Processing…" : "Invest Now"}
          </button>

          {/* My position + claim */}
          {me && Number(me.invested) > 0 && (
            <div className="rounded-lg border border-secondary-200 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-600">My investment</span>
                <span className="font-medium">{Number(me.invested).toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-600 flex items-center">
                  <FiTrendingUp className="mr-1" /> Claimable returns
                </span>
                <span className="font-medium text-green-600">
                  {Number(me.pendingReturns).toFixed(4)} ETH
                </span>
              </div>
              {Number(me.pendingReturns) > 0 && (
                <button
                  className="btn-secondary w-full mt-2"
                  onClick={handleClaim}
                  disabled={tx.status === "pending"}
                >
                  Claim Returns
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transaction status */}
      {tx.status !== "idle" && (
        <div
          className={`rounded-lg p-3 text-sm ${
            tx.status === "success"
              ? "bg-green-50 text-green-700"
              : tx.status === "error"
              ? "bg-red-50 text-red-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          <p>{tx.message}</p>
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="underline break-all"
            >
              View transaction
            </a>
          )}
          {!explorer && tx.hash && (
            <p className="font-mono text-xs break-all">{tx.hash}</p>
          )}
        </div>
      )}

      {/* Verified on-chain contract address */}
      <p className="text-xs text-secondary-500 break-all">
        Contract: <span className="font-mono">{shortAddress(CONTRACT_ADDRESS)}</span>
      </p>
    </div>
  );
}
