// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Investment
 * @notice A simple, secure investment pool for the RoyalCity real-estate POC.
 *
 *  Lifecycle:
 *    1. Users call {invest} with ETH (>= minInvestment). Their principal is
 *       recorded and accumulated into {totalInvested}.
 *    2. The owner can call {withdrawCapital} to deploy raised capital into the
 *       underlying property (simulated here as a transfer to a treasury). The
 *       contract never lets the owner touch ETH that has already been allocated
 *       to investors as returns.
 *    3. The owner periodically calls {distributeReturns} (sending ETH) to
 *       simulate yield. Each investor is credited a pro-rata share of that
 *       payout, proportional to their principal vs. {totalInvested}.
 *    4. Investors withdraw their credited yield with {claimReturns}
 *       (pull-payment pattern).
 *
 *  Security practices demonstrated:
 *    - Checks-Effects-Interactions ordering on every state-changing function.
 *    - {ReentrancyGuard} on all functions that move ETH.
 *    - Pull-over-push withdrawals so a single failing recipient cannot block
 *       others and the attack surface for re-entrancy is minimized.
 *    - {Ownable} access control on administrative functions.
 *    - Custom errors for gas-efficient, descriptive reverts.
 *    - Strict accounting that always keeps investor-owed ETH solvent
 *       ({totalPendingReturns} is never withdrawable by the owner).
 */
contract Investment is Ownable, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Investor {
        uint256 totalInvested;   // cumulative principal contributed by this address
        uint256 pendingReturns;  // yield credited but not yet claimed
        bool exists;             // true once the address has invested at least once
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Per-address investment record.
    mapping(address => Investor) public investors;

    /// @notice Enumerable list of unique investor addresses.
    address[] public investorList;

    /// @notice Cumulative principal invested across all investors (never decreases).
    uint256 public totalInvested;

    /// @notice Sum of all credited-but-unclaimed returns. Always kept solvent.
    uint256 public totalPendingReturns;

    /// @notice Minimum ETH required per {invest} call.
    uint256 public minInvestment;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Invested(address indexed investor, uint256 amount, uint256 newTotalInvested);
    event ReturnsDistributed(uint256 amount, uint256 investorCount);
    event ReturnsClaimed(address indexed investor, uint256 amount);
    event CapitalWithdrawn(address indexed to, uint256 amount);
    event MinInvestmentUpdated(uint256 oldValue, uint256 newValue);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error BelowMinimumInvestment(uint256 sent, uint256 minimum);
    error NoInvestments();
    error NothingToClaim();
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error InsufficientAvailableCapital(uint256 requested, uint256 available);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @param _minInvestment Minimum wei accepted per investment (e.g. 0.01 ETH).
     */
    constructor(uint256 _minInvestment) Ownable(msg.sender) {
        minInvestment = _minInvestment;
    }

    // ---------------------------------------------------------------------
    // Investor actions
    // ---------------------------------------------------------------------

    /**
     * @notice Invest ETH into the pool. Records the sender and tracks totals.
     * @dev CEI: all state updated before any external interaction (there is
     *      none here, but the ordering is kept consistent across the contract).
     */
    function invest() external payable nonReentrant {
        if (msg.value < minInvestment) {
            revert BelowMinimumInvestment(msg.value, minInvestment);
        }

        Investor storage inv = investors[msg.sender];
        if (!inv.exists) {
            inv.exists = true;
            investorList.push(msg.sender);
        }

        inv.totalInvested += msg.value;
        totalInvested += msg.value;

        emit Invested(msg.sender, msg.value, totalInvested);
    }

    /**
     * @notice Withdraw credited yield (pull-payment).
     * @dev Effects (zeroing pendingReturns) happen before the ETH transfer.
     */
    function claimReturns() external nonReentrant {
        uint256 amount = investors[msg.sender].pendingReturns;
        if (amount == 0) revert NothingToClaim();

        // Effects
        investors[msg.sender].pendingReturns = 0;
        totalPendingReturns -= amount;

        // Interaction
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit ReturnsClaimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Owner / administrative actions
    // ---------------------------------------------------------------------

    /**
     * @notice Simulate distribution of investment returns. The owner sends ETH
     *         and it is credited pro-rata to every investor's principal share.
     * @dev Uses a bounded loop over {investorList}. Suitable for a POC; a
     *      production system with unbounded investors would use a
     *      checkpoint/accumulator (e.g. "magnified dividend per share") pattern
     *      to make distribution O(1). Documented here intentionally.
     */
    function distributeReturns() external payable onlyOwner nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        if (totalInvested == 0) revert NoInvestments();

        uint256 distributed;
        uint256 count = investorList.length;

        for (uint256 i = 0; i < count; i++) {
            address account = investorList[i];
            uint256 principal = investors[account].totalInvested;
            if (principal == 0) continue;

            uint256 share = (msg.value * principal) / totalInvested;
            if (share == 0) continue;

            investors[account].pendingReturns += share;
            distributed += share;
        }

        // Any wei lost to integer division remains in the contract balance and
        // is simply rolled into the next distribution / withdrawable capital.
        totalPendingReturns += distributed;

        emit ReturnsDistributed(msg.value, count);
    }

    /**
     * @notice Withdraw raised capital to deploy into the underlying asset.
     * @dev The owner can never withdraw ETH owed to investors as returns:
     *      withdrawals are capped at {availableCapital}.
     */
    function withdrawCapital(address payable to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = availableCapital();
        if (amount > available) {
            revert InsufficientAvailableCapital(amount, available);
        }

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit CapitalWithdrawn(to, amount);
    }

    /**
     * @notice Update the minimum investment amount.
     */
    function setMinInvestment(uint256 _minInvestment) external onlyOwner {
        uint256 old = minInvestment;
        minInvestment = _minInvestment;
        emit MinInvestmentUpdated(old, _minInvestment);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice ETH the owner may withdraw (balance minus investor-owed returns).
    function availableCapital() public view returns (uint256) {
        uint256 balance = address(this).balance;
        if (balance <= totalPendingReturns) return 0;
        return balance - totalPendingReturns;
    }

    /// @notice Number of unique investors.
    function getInvestorCount() external view returns (uint256) {
        return investorList.length;
    }

    /// @notice Full record for a single investor.
    function getInvestor(address account)
        external
        view
        returns (uint256 invested, uint256 pendingReturns, bool exists)
    {
        Investor storage inv = investors[account];
        return (inv.totalInvested, inv.pendingReturns, inv.exists);
    }

    /// @notice The full list of investor addresses.
    function getAllInvestors() external view returns (address[] memory) {
        return investorList;
    }

    /// @notice Current ETH balance held by the contract.
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ---------------------------------------------------------------------
    // Fallback: treat plain ETH transfers as investments for convenience.
    // ---------------------------------------------------------------------

    receive() external payable {
        if (msg.value < minInvestment) {
            revert BelowMinimumInvestment(msg.value, minInvestment);
        }

        Investor storage inv = investors[msg.sender];
        if (!inv.exists) {
            inv.exists = true;
            investorList.push(msg.sender);
        }
        inv.totalInvested += msg.value;
        totalInvested += msg.value;

        emit Invested(msg.sender, msg.value, totalInvested);
    }
}
