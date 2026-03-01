// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MemoraRegistry
 * @notice Minimal registry: agent ownership, delegates, and memory refs (pointers + hashes only).
 * HCS is the canonical ordering layer; this contract is for discoverability and permissions.
 */
contract MemoraRegistry {
    struct MemoryRefStruct {
        bytes32 agentId;
        string cid;
        bytes32 payloadHash;
        bytes32 taskId;
        address writer;
        uint256 createdAt;
    }

    mapping(bytes32 memoryId => MemoryRefStruct) public memories;
    mapping(bytes32 agentId => address) public ownerOfAgent;
    mapping(bytes32 agentId => mapping(address => bool)) public delegate;

    event AgentRegistered(bytes32 indexed agentId, address owner);
    event DelegateUpdated(bytes32 indexed agentId, address delegate, bool enabled);
    event MemoryCommitted(
        bytes32 indexed memoryId,
        bytes32 indexed agentId,
        bytes32 taskId,
        string cid,
        bytes32 payloadHash,
        address writer,
        uint256 createdAt
    );

    modifier onlyOwnerOrDelegate(bytes32 agentId) {
        address owner = ownerOfAgent[agentId];
        require(owner != address(0), "Memora: agent not registered");
        require(
            msg.sender == owner || delegate[agentId][msg.sender],
            "Memora: not owner or delegate"
        );
        _;
    }

    /// @notice Register an agent; caller becomes owner.
    function registerAgent(bytes32 agentId) external {
        require(ownerOfAgent[agentId] == address(0), "Memora: agent already registered");
        ownerOfAgent[agentId] = msg.sender;
        emit AgentRegistered(agentId, msg.sender);
    }

    /// @notice Set or remove a delegate. Only owner.
    function setDelegate(bytes32 agentId, address delegateAddr, bool enabled) external {
        require(ownerOfAgent[agentId] == msg.sender, "Memora: not owner");
        delegate[agentId][delegateAddr] = enabled;
        emit DelegateUpdated(agentId, delegateAddr, enabled);
    }

    /// @notice Commit a memory ref (pointer + hash). Only owner or delegate.
    function commitMemory(
        bytes32 memoryId,
        bytes32 agentId,
        bytes32 taskId,
        string calldata cid,
        bytes32 payloadHash
    ) external onlyOwnerOrDelegate(agentId) {
        require(memories[memoryId].createdAt == 0, "Memora: memory id already used");
        memories[memoryId] = MemoryRefStruct({
            agentId: agentId,
            cid: cid,
            payloadHash: payloadHash,
            taskId: taskId,
            writer: msg.sender,
            createdAt: block.timestamp
        });
        emit MemoryCommitted(memoryId, agentId, taskId, cid, payloadHash, msg.sender, block.timestamp);
    }

    function getMemory(bytes32 memoryId) external view returns (
        bytes32 agentId,
        string memory cid,
        bytes32 payloadHash,
        bytes32 taskId,
        address writer,
        uint256 createdAt
    ) {
        MemoryRefStruct storage m = memories[memoryId];
        return (m.agentId, m.cid, m.payloadHash, m.taskId, m.writer, m.createdAt);
    }

    function isDelegate(bytes32 agentId, address addr) external view returns (bool) {
        return delegate[agentId][addr];
    }
}
