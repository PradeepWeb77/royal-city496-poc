const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Investment", function () {
  const MIN = ethers.parseEther("0.01");

  async function deployFixture() {
    const [owner, alice, bob, treasury] = await ethers.getSigners();
    const Investment = await ethers.getContractFactory("Investment");
    const investment = await Investment.deploy(MIN);
    await investment.waitForDeployment();
    return { investment, owner, alice, bob, treasury };
  }

  describe("Deployment", function () {
    it("sets the owner and minimum investment", async function () {
      const { investment, owner } = await loadFixture(deployFixture);
      expect(await investment.owner()).to.equal(owner.address);
      expect(await investment.minInvestment()).to.equal(MIN);
      expect(await investment.totalInvested()).to.equal(0n);
    });
  });

  describe("invest()", function () {
    it("accepts an investment and records the investor", async function () {
      const { investment, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");

      await expect(investment.connect(alice).invest({ value: amount }))
        .to.emit(investment, "Invested")
        .withArgs(alice.address, amount, amount);

      const [invested, pending, exists] = await investment.getInvestor(alice.address);
      expect(invested).to.equal(amount);
      expect(pending).to.equal(0n);
      expect(exists).to.equal(true);
      expect(await investment.totalInvested()).to.equal(amount);
      expect(await investment.getInvestorCount()).to.equal(1n);
    });

    it("reverts below the minimum investment", async function () {
      const { investment, alice } = await loadFixture(deployFixture);
      await expect(
        investment.connect(alice).invest({ value: ethers.parseEther("0.001") })
      ).to.be.revertedWithCustomError(investment, "BelowMinimumInvestment");
    });

    it("accumulates repeat investments without duplicating the investor", async function () {
      const { investment, alice } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await investment.connect(alice).invest({ value: ethers.parseEther("2") });

      const [invested] = await investment.getInvestor(alice.address);
      expect(invested).to.equal(ethers.parseEther("3"));
      expect(await investment.getInvestorCount()).to.equal(1n);
    });

    it("tracks multiple distinct investors", async function () {
      const { investment, alice, bob } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await investment.connect(bob).invest({ value: ethers.parseEther("3") });

      expect(await investment.getInvestorCount()).to.equal(2n);
      expect(await investment.totalInvested()).to.equal(ethers.parseEther("4"));
      const all = await investment.getAllInvestors();
      // getAllInvestors() returns a read-only ethers Result; spread to a plain array.
      expect([...all]).to.have.members([alice.address, bob.address]);
    });
  });

  describe("distributeReturns()", function () {
    it("credits returns pro-rata to investor principal", async function () {
      const { investment, owner, alice, bob } = await loadFixture(deployFixture);
      // Alice 1 ETH (25%), Bob 3 ETH (75%)
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await investment.connect(bob).invest({ value: ethers.parseEther("3") });

      const payout = ethers.parseEther("4"); // 4 ETH of "yield"
      await expect(
        investment.connect(owner).distributeReturns({ value: payout })
      ).to.emit(investment, "ReturnsDistributed");

      const [, alicePending] = await investment.getInvestor(alice.address);
      const [, bobPending] = await investment.getInvestor(bob.address);
      expect(alicePending).to.equal(ethers.parseEther("1")); // 25% of 4
      expect(bobPending).to.equal(ethers.parseEther("3")); // 75% of 4
      expect(await investment.totalPendingReturns()).to.equal(payout);
    });

    it("only the owner can distribute", async function () {
      const { investment, alice } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await expect(
        investment.connect(alice).distributeReturns({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(investment, "OwnableUnauthorizedAccount");
    });

    it("reverts when there are no investors", async function () {
      const { investment, owner } = await loadFixture(deployFixture);
      await expect(
        investment.connect(owner).distributeReturns({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(investment, "NoInvestments");
    });

    it("reverts on a zero-value distribution", async function () {
      const { investment, owner, alice } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await expect(
        investment.connect(owner).distributeReturns({ value: 0 })
      ).to.be.revertedWithCustomError(investment, "ZeroAmount");
    });
  });

  describe("claimReturns()", function () {
    it("pays out credited returns and zeroes the balance", async function () {
      const { investment, owner, alice } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await investment.connect(owner).distributeReturns({ value: ethers.parseEther("0.5") });

      // changeEtherBalance cannot be chained after emit — assert each off the
      // same tx promise instead.
      const tx = investment.connect(alice).claimReturns();
      await expect(tx).to.changeEtherBalance(alice, ethers.parseEther("0.5"));
      await expect(tx)
        .to.emit(investment, "ReturnsClaimed")
        .withArgs(alice.address, ethers.parseEther("0.5"));

      const [, pending] = await investment.getInvestor(alice.address);
      expect(pending).to.equal(0n);
      expect(await investment.totalPendingReturns()).to.equal(0n);
    });

    it("reverts when there is nothing to claim", async function () {
      const { investment, alice } = await loadFixture(deployFixture);
      await expect(
        investment.connect(alice).claimReturns()
      ).to.be.revertedWithCustomError(investment, "NothingToClaim");
    });
  });

  describe("withdrawCapital()", function () {
    it("lets the owner withdraw raised capital but never investor returns", async function () {
      const { investment, owner, alice, treasury } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("10") });
      await investment.connect(owner).distributeReturns({ value: ethers.parseEther("2") });

      // Balance = 12 ETH, of which 2 ETH is owed to investors -> 10 withdrawable.
      expect(await investment.availableCapital()).to.equal(ethers.parseEther("10"));

      await expect(
        investment.connect(owner).withdrawCapital(treasury.address, ethers.parseEther("11"))
      ).to.be.revertedWithCustomError(investment, "InsufficientAvailableCapital");

      await expect(
        investment.connect(owner).withdrawCapital(treasury.address, ethers.parseEther("10"))
      ).to.changeEtherBalance(treasury, ethers.parseEther("10"));

      // The 2 ETH owed to Alice is still claimable.
      await expect(investment.connect(alice).claimReturns()).to.changeEtherBalance(
        alice,
        ethers.parseEther("2")
      );
    });

    it("rejects non-owner withdrawals and zero address", async function () {
      const { investment, owner, alice } = await loadFixture(deployFixture);
      await investment.connect(alice).invest({ value: ethers.parseEther("1") });
      await expect(
        investment.connect(alice).withdrawCapital(alice.address, 1)
      ).to.be.revertedWithCustomError(investment, "OwnableUnauthorizedAccount");
      await expect(
        investment.connect(owner).withdrawCapital(ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(investment, "ZeroAddress");
    });
  });

  describe("setMinInvestment()", function () {
    it("updates the minimum and emits an event", async function () {
      const { investment, owner } = await loadFixture(deployFixture);
      const next = ethers.parseEther("0.05");
      await expect(investment.connect(owner).setMinInvestment(next))
        .to.emit(investment, "MinInvestmentUpdated")
        .withArgs(MIN, next);
      expect(await investment.minInvestment()).to.equal(next);
    });
  });
});
