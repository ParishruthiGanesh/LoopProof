// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title LoopProofRegistry
 * @notice Shared, append-only record of equipment reuse transfers between
 *         independent organizations.
 *
 * What this contract does:
 *   - anchors a hash of a documented, canonical PUBLIC evidence manifest;
 *   - records which address reserved an item for which recipient;
 *   - records the donor's release acknowledgment and the recipient's receipt
 *     acknowledgment, and only marks a transfer complete when both exist;
 *   - records explicit cancellation and dispute states;
 *   - emits an event for every state change, so history is never rewritten.
 *
 * What this contract does NOT do, and cannot do:
 *   - it does not prove an item works, that a physical handoff happened, or
 *     that the same physical object was not registered under another id;
 *   - it does not verify the identity of the organizations behind addresses.
 *
 * No personal data and no raw images are stored on-chain: only a bytes32
 * digest of the public evidence manifest and its version string.
 */
contract LoopProofRegistry {
    /// @dev Item lifecycle. Transitions are enforced in each function.
    ///
    ///   None       --register-->      Registered
    ///   Registered --reserve-->       Reserved
    ///   Registered --updateEvidence-> Registered (new hash, re-ack required off-chain)
    ///   Reserved   --cancel-->        Registered (item becomes available again)
    ///   Reserved   --release-->       Released
    ///   Released   --receipt-->       Completed
    ///   Reserved | Released | Completed --dispute--> Disputed
    ///   Completed, Disputed are terminal.
    enum State {
        None, // 0
        Registered, // 1
        Reserved, // 2
        Released, // 3
        Completed, // 4
        Disputed // 5
    }

    struct Item {
        address owner;
        address recipient;
        bytes32 evidenceHash;
        string manifestVersion;
        State state;
        uint32 reservationNonce; // increments on every reservation
        uint64 registeredAt;
        uint64 releasedAt;
        uint64 receivedAt;
        bool donorReleaseAck;
        bool recipientReceiptAck;
    }

    mapping(bytes32 => Item) private _items;
    bytes32[] private _itemIds;

    event ItemRegistered(
        bytes32 indexed itemId,
        address indexed owner,
        bytes32 evidenceHash,
        string manifestVersion,
        uint64 at
    );
    event EvidenceUpdated(bytes32 indexed itemId, bytes32 previousHash, bytes32 newHash, string manifestVersion, uint64 at);
    event ItemReserved(bytes32 indexed itemId, address indexed owner, address indexed recipient, uint32 reservationNonce, uint64 at);
    event ReservationCancelled(bytes32 indexed itemId, address indexed by, address recipient, uint32 reservationNonce, string reason, uint64 at);
    event ReleaseAcknowledged(bytes32 indexed itemId, address indexed owner, address indexed recipient, uint64 at);
    event ReceiptAcknowledged(bytes32 indexed itemId, address indexed recipient, uint64 at);
    event TransferCompleted(bytes32 indexed itemId, address indexed owner, address indexed recipient, uint64 at);
    event DisputeRaised(bytes32 indexed itemId, address indexed by, State fromState, bytes32 reasonHash, uint64 at);

    error ItemAlreadyRegistered();
    error ItemNotRegistered();
    error NotItemOwner();
    error NotItemRecipient();
    error NotAParty();
    error WrongState(State actual, State expected);
    error InvalidRecipient();
    error EmptyEvidenceHash();

    modifier onlyOwnerOf(bytes32 itemId) {
        if (_items[itemId].state == State.None) revert ItemNotRegistered();
        if (_items[itemId].owner != msg.sender) revert NotItemOwner();
        _;
    }

    /// @notice Register an item with its owner address and public evidence hash.
    function registerItem(bytes32 itemId, bytes32 evidenceHash, string calldata manifestVersion) external {
        if (_items[itemId].state != State.None) revert ItemAlreadyRegistered();
        if (evidenceHash == bytes32(0)) revert EmptyEvidenceHash();

        Item storage item = _items[itemId];
        item.owner = msg.sender;
        item.evidenceHash = evidenceHash;
        item.manifestVersion = manifestVersion;
        item.state = State.Registered;
        item.registeredAt = uint64(block.timestamp);
        _itemIds.push(itemId);

        emit ItemRegistered(itemId, msg.sender, evidenceHash, manifestVersion, uint64(block.timestamp));
    }

    /// @notice Re-anchor evidence after a listing changes. Only while the item
    ///         is not under an active transfer, so acknowledgments can never be
    ///         attached to evidence that silently changed underneath them.
    function updateEvidenceHash(bytes32 itemId, bytes32 newHash, string calldata manifestVersion)
        external
        onlyOwnerOf(itemId)
    {
        Item storage item = _items[itemId];
        if (item.state != State.Registered) revert WrongState(item.state, State.Registered);
        if (newHash == bytes32(0)) revert EmptyEvidenceHash();

        bytes32 previous = item.evidenceHash;
        item.evidenceHash = newHash;
        item.manifestVersion = manifestVersion;

        emit EvidenceUpdated(itemId, previous, newHash, manifestVersion, uint64(block.timestamp));
    }

    /// @notice Reserve a registered item for exactly one recipient.
    /// @dev Reverts if the item is already reserved, which is what prevents two
    ///      recipients from holding the same item at the same time.
    function reserveItem(bytes32 itemId, address recipient) external onlyOwnerOf(itemId) {
        Item storage item = _items[itemId];
        if (item.state != State.Registered) revert WrongState(item.state, State.Registered);
        if (recipient == address(0) || recipient == msg.sender) revert InvalidRecipient();

        item.recipient = recipient;
        item.state = State.Reserved;
        item.reservationNonce += 1;
        item.donorReleaseAck = false;
        item.recipientReceiptAck = false;
        item.releasedAt = 0;
        item.receivedAt = 0;

        emit ItemReserved(itemId, msg.sender, recipient, item.reservationNonce, uint64(block.timestamp));
    }

    /// @notice Either party may cancel before the donor records release.
    ///         The item returns to Registered and may be reserved again.
    function cancelReservation(bytes32 itemId, string calldata reason) external {
        Item storage item = _items[itemId];
        if (item.state == State.None) revert ItemNotRegistered();
        if (item.state != State.Reserved) revert WrongState(item.state, State.Reserved);
        if (msg.sender != item.owner && msg.sender != item.recipient) revert NotAParty();

        address previousRecipient = item.recipient;
        uint32 nonce = item.reservationNonce;
        item.recipient = address(0);
        item.state = State.Registered;
        item.donorReleaseAck = false;
        item.recipientReceiptAck = false;

        emit ReservationCancelled(itemId, msg.sender, previousRecipient, nonce, reason, uint64(block.timestamp));
    }

    /// @notice Donor records that the item physically left their possession.
    function acknowledgeRelease(bytes32 itemId) external onlyOwnerOf(itemId) {
        Item storage item = _items[itemId];
        if (item.state != State.Reserved) revert WrongState(item.state, State.Reserved);

        item.donorReleaseAck = true;
        item.releasedAt = uint64(block.timestamp);
        item.state = State.Released;

        emit ReleaseAcknowledged(itemId, item.owner, item.recipient, uint64(block.timestamp));
    }

    /// @notice Recipient records receipt. Completion requires BOTH acknowledgments.
    function acknowledgeReceipt(bytes32 itemId) external {
        Item storage item = _items[itemId];
        if (item.state == State.None) revert ItemNotRegistered();
        if (msg.sender != item.recipient) revert NotItemRecipient();
        if (item.state != State.Released) revert WrongState(item.state, State.Released);
        // Defensive: Released is only reachable via acknowledgeRelease.
        if (!item.donorReleaseAck) revert WrongState(item.state, State.Released);

        item.recipientReceiptAck = true;
        item.receivedAt = uint64(block.timestamp);
        item.state = State.Completed;

        emit ReceiptAcknowledged(itemId, msg.sender, uint64(block.timestamp));
        emit TransferCompleted(itemId, item.owner, item.recipient, uint64(block.timestamp));
    }

    /// @notice Either party raises a dispute. Prior events remain the record;
    ///         the dispute is an additional state change, not a rewrite.
    function raiseDispute(bytes32 itemId, bytes32 reasonHash) external {
        Item storage item = _items[itemId];
        if (item.state == State.None) revert ItemNotRegistered();
        if (msg.sender != item.owner && msg.sender != item.recipient) revert NotAParty();
        if (item.state != State.Reserved && item.state != State.Released && item.state != State.Completed) {
            revert WrongState(item.state, State.Released);
        }

        State from = item.state;
        item.state = State.Disputed;

        emit DisputeRaised(itemId, msg.sender, from, reasonHash, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------- views

    function getItem(bytes32 itemId) external view returns (Item memory) {
        return _items[itemId];
    }

    function getState(bytes32 itemId) external view returns (State) {
        return _items[itemId].state;
    }

    /// @notice True only when both acknowledgments are recorded and the transfer
    ///         was not subsequently disputed.
    function isCompleted(bytes32 itemId) external view returns (bool) {
        Item storage item = _items[itemId];
        return item.state == State.Completed && item.donorReleaseAck && item.recipientReceiptAck;
    }

    /// @notice Check whether a locally computed manifest digest matches the anchor.
    function evidenceMatches(bytes32 itemId, bytes32 candidateHash) external view returns (bool) {
        if (_items[itemId].state == State.None) revert ItemNotRegistered();
        return _items[itemId].evidenceHash == candidateHash;
    }

    function itemCount() external view returns (uint256) {
        return _itemIds.length;
    }

    function itemIdAt(uint256 index) external view returns (bytes32) {
        return _itemIds[index];
    }
}
