import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MemoraRegistry", function () {
  let registry: ethers.Contract;
  let owner: SignerWithAddress;
  let delegate: SignerWithAddress;
  let other: SignerWithAddress;
  const agentId = ethers.zeroPadBytes(ethers.toUtf8Bytes("agent1"), 32);
  const memoryId = ethers.keccak256(ethers.toUtf8Bytes("memory-1"));
  const taskId = ethers.zeroPadBytes(ethers.toUtf8Bytes("task1"), 32);
  const cid = "QmTest123";
  const payloadHash = ethers.keccak256(ethers.toUtf8Bytes("payload-hash"));

  beforeEach(async function () {
    [owner, delegate, other] = await ethers.getSigners();
    const MemoraRegistry = await ethers.getContractFactory("MemoraRegistry");
    registry = await MemoraRegistry.deploy();
  });

  it("registers agent and sets owner", async function () {
    await registry.connect(owner).registerAgent(agentId);
    expect(await registry.ownerOfAgent(agentId)).to.equal(owner.address);
  });

  it("reverts when registering same agent twice", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await expect(registry.connect(other).registerAgent(agentId)).to.be.revertedWith(
      "Memora: agent already registered"
    );
  });

  it("allows owner to set delegate", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await registry.connect(owner).setDelegate(agentId, delegate.address, true);
    expect(await registry.isDelegate(agentId, delegate.address)).to.be.true;
  });

  it("only owner can set delegate", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await expect(
      registry.connect(other).setDelegate(agentId, delegate.address, true)
    ).to.be.revertedWith("Memora: not owner");
  });

  it("owner can commit memory", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await registry.connect(owner).commitMemory(memoryId, agentId, taskId, cid, payloadHash);
    const m = await registry.getMemory(memoryId);
    expect(m.cid).to.equal(cid);
    expect(m.writer).to.equal(owner.address);
  });

  it("delegate can commit memory", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await registry.connect(owner).setDelegate(agentId, delegate.address, true);
    await registry.connect(delegate).commitMemory(memoryId, agentId, taskId, cid, payloadHash);
    const m = await registry.getMemory(memoryId);
    expect(m.writer).to.equal(delegate.address);
  });

  it("non-owner non-delegate cannot commit", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await expect(
      registry.connect(other).commitMemory(memoryId, agentId, taskId, cid, payloadHash)
    ).to.be.revertedWith("Memora: not owner or delegate");
  });

  it("revoked delegate cannot commit", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await registry.connect(owner).setDelegate(agentId, delegate.address, true);
    await registry.connect(owner).setDelegate(agentId, delegate.address, false);
    const memoryId2 = ethers.keccak256(ethers.toUtf8Bytes("memory-2"));
    await expect(
      registry.connect(delegate).commitMemory(memoryId2, agentId, taskId, cid, payloadHash)
    ).to.be.revertedWith("Memora: not owner or delegate");
  });

  it("reverts duplicate memory id", async function () {
    await registry.connect(owner).registerAgent(agentId);
    await registry.connect(owner).commitMemory(memoryId, agentId, taskId, cid, payloadHash);
    await expect(
      registry.connect(owner).commitMemory(memoryId, agentId, taskId, cid, payloadHash)
    ).to.be.revertedWith("Memora: memory id already used");
  });
});
