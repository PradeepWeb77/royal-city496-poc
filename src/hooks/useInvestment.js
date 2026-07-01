import { useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  isContractDeployed,
} from "../config/contract";

/**
 * Read + write access to the Investment contract.
 * Reads go through the provider; writes are signed by the connected account.
 */
export function useInvestment() {
  const { provider, account } = useWeb3();

  const readContract = useMemo(() => {
    if (!provider || !isContractDeployed()) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }, [provider]);

  const writeContract = useCallback(() => {
    if (!provider) throw new Error("Wallet not connected.");
    if (!isContractDeployed())
      throw new Error("Contract is not deployed yet. Run the deploy script.");
    const signer = provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }, [provider]);

  /** Pool-wide stats for the property card. */
  const getStats = useCallback(async () => {
    if (!readContract) return null;
    const [total, count, balance, minInv, pendingPool] = await Promise.all([
      readContract.totalInvested(),
      readContract.getInvestorCount(),
      readContract.getContractBalance(),
      readContract.minInvestment(),
      readContract.totalPendingReturns(),
    ]);
    return {
      totalInvested: ethers.utils.formatEther(total),
      investorCount: count.toNumber(),
      contractBalance: ethers.utils.formatEther(balance),
      minInvestment: ethers.utils.formatEther(minInv),
      pendingPool: ethers.utils.formatEther(pendingPool),
    };
  }, [readContract]);

  /** The connected user's position. */
  const getMyInvestment = useCallback(async () => {
    if (!readContract || !account) return null;
    const [invested, pending] = await readContract.getInvestor(account);
    return {
      invested: ethers.utils.formatEther(invested),
      pendingReturns: ethers.utils.formatEther(pending),
    };
  }, [readContract, account]);

  /** Send an invest() transaction. Returns the tx object (caller awaits .wait()). */
  const invest = useCallback(
    async (amountEth) => {
      const c = writeContract();
      return c.invest({ value: ethers.utils.parseEther(String(amountEth)) });
    },
    [writeContract]
  );

  /** Claim credited returns (pull-payment). */
  const claimReturns = useCallback(async () => {
    const c = writeContract();
    return c.claimReturns();
  }, [writeContract]);

  return {
    getStats,
    getMyInvestment,
    invest,
    claimReturns,
    isDeployed: isContractDeployed(),
  };
}
