import { expect } from "chai";
import hre from "hardhat";
import { keccak256, toHex, type Address } from "viem";

const MANIFEST_VERSION = "lp-manifest-1";
const itemId = (s: string) => keccak256(toHex(s));
const hash = (s: string) => keccak256(toHex(s));

/** State enum mirror of contracts/LoopProofRegistry.sol */
const State = {
  None: 0,
  Registered: 1,
  Reserved: 2,
  Released: 3,
  Completed: 4,
  Disputed: 5,
} as const;

async function deploy() {
  const registry = await hre.viem.deployContract("LoopProofRegistry");
  const [donor, recipientA, recipientB] = await hre.viem.getWalletClients();
  return { registry, donor, recipientA, recipientB };
}

describe("LoopProofRegistry", () => {
  it("registers an item with its owner and evidence hash", async () => {
    const { registry, donor } = await deploy();
    const id = itemId("item-1");
    await registry.write.registerItem([id, hash("evidence-1"), MANIFEST_VERSION]);

    const item = await registry.read.getItem([id]);
    expect(item.owner.toLowerCase()).to.equal(donor.account.address.toLowerCase());
    expect(item.evidenceHash).to.equal(hash("evidence-1"));
    expect(item.manifestVersion).to.equal(MANIFEST_VERSION);
    expect(item.state).to.equal(State.Registered);
    expect(await registry.read.itemCount()).to.equal(1n);
  });

  it("rejects duplicate registration of the same item id", async () => {
    const { registry } = await deploy();
    const id = itemId("item-dup");
    await registry.write.registerItem([id, hash("a"), MANIFEST_VERSION]);
    await expect(
      registry.write.registerItem([id, hash("b"), MANIFEST_VERSION]),
    ).to.be.rejectedWith("ItemAlreadyRegistered");
  });

  it("rejects an empty evidence hash", async () => {
    const { registry } = await deploy();
    await expect(
      registry.write.registerItem([itemId("item-empty"), `0x${"0".repeat(64)}`, MANIFEST_VERSION]),
    ).to.be.rejectedWith("EmptyEvidenceHash");
  });

  // ---- unauthorized actions -------------------------------------------------

  it("refuses reservation by anyone other than the owner", async () => {
    const { registry, recipientA, recipientB } = await deploy();
    const id = itemId("item-auth");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);

    const asStranger = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await expect(
      asStranger.write.reserveItem([id, recipientB.account.address]),
    ).to.be.rejectedWith("NotItemOwner");
  });

  it("refuses release acknowledgment from a non-owner and receipt from a non-recipient", async () => {
    const { registry, recipientA, recipientB } = await deploy();
    const id = itemId("item-acks");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);

    const asRecipient = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await expect(asRecipient.write.acknowledgeRelease([id])).to.be.rejectedWith("NotItemOwner");

    await registry.write.acknowledgeRelease([id]);

    const asOther = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientB },
    });
    await expect(asOther.write.acknowledgeReceipt([id])).to.be.rejectedWith("NotItemRecipient");
  });

  it("refuses to act on an unregistered item", async () => {
    const { registry, recipientA } = await deploy();
    await expect(
      registry.write.reserveItem([itemId("ghost"), recipientA.account.address]),
    ).to.be.rejectedWith("ItemNotRegistered");
  });

  it("refuses a reservation naming the owner or the zero address as recipient", async () => {
    const { registry, donor } = await deploy();
    const id = itemId("item-self");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await expect(
      registry.write.reserveItem([id, donor.account.address]),
    ).to.be.rejectedWith("InvalidRecipient");
    await expect(
      registry.write.reserveItem([id, "0x0000000000000000000000000000000000000000" as Address]),
    ).to.be.rejectedWith("InvalidRecipient");
  });

  // ---- conflicting reservations --------------------------------------------

  it("prevents a second recipient from reserving an already reserved item", async () => {
    const { registry, recipientA, recipientB } = await deploy();
    const id = itemId("item-conflict");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);

    await expect(
      registry.write.reserveItem([id, recipientB.account.address]),
    ).to.be.rejectedWith("WrongState");

    const item = await registry.read.getItem([id]);
    expect(item.recipient.toLowerCase()).to.equal(recipientA.account.address.toLowerCase());
  });

  it("allows re-reservation only after an explicit cancellation", async () => {
    const { registry, recipientA, recipientB } = await deploy();
    const id = itemId("item-recycle");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);
    await registry.write.cancelReservation([id, "recipient withdrew"]);

    expect(await registry.read.getState([id])).to.equal(State.Registered);
    await registry.write.reserveItem([id, recipientB.account.address]);

    const item = await registry.read.getItem([id]);
    expect(item.state).to.equal(State.Reserved);
    expect(item.reservationNonce).to.equal(2);
    expect(item.recipient.toLowerCase()).to.equal(recipientB.account.address.toLowerCase());
  });

  it("refuses cancellation by a third party", async () => {
    const { registry, recipientA, recipientB } = await deploy();
    const id = itemId("item-cancel-auth");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);

    const asOther = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientB },
    });
    await expect(asOther.write.cancelReservation([id, "nope"])).to.be.rejectedWith("NotAParty");
  });

  // ---- completion requirements ---------------------------------------------

  it("refuses receipt acknowledgment before the donor records release", async () => {
    const { registry, recipientA } = await deploy();
    const id = itemId("item-order");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);

    const asRecipient = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await expect(asRecipient.write.acknowledgeReceipt([id])).to.be.rejectedWith("WrongState");
    expect(await registry.read.isCompleted([id])).to.equal(false);
  });

  it("completes only when both acknowledgments are present", async () => {
    const { registry, donor, recipientA } = await deploy();
    const id = itemId("item-complete");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);
    await registry.write.acknowledgeRelease([id]);
    expect(await registry.read.isCompleted([id])).to.equal(false);

    const asRecipient = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await asRecipient.write.acknowledgeReceipt([id]);

    const item = await registry.read.getItem([id]);
    expect(item.state).to.equal(State.Completed);
    expect(item.donorReleaseAck).to.equal(true);
    expect(item.recipientReceiptAck).to.equal(true);
    expect(await registry.read.isCompleted([id])).to.equal(true);

    const publicClient = await hre.viem.getPublicClient();
    const completed = await publicClient.getContractEvents({
      address: registry.address,
      abi: registry.abi,
      eventName: "TransferCompleted",
      fromBlock: 0n,
    });
    expect(completed).to.have.length(1);
    expect(completed[0].args.recipient?.toLowerCase()).to.equal(recipientA.account.address.toLowerCase());
    expect(completed[0].args.owner?.toLowerCase()).to.equal(donor.account.address.toLowerCase());
  });

  it("refuses repeated completion of the same item", async () => {
    const { registry, recipientA } = await deploy();
    const id = itemId("item-twice");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);
    await registry.write.acknowledgeRelease([id]);

    const asRecipient = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await asRecipient.write.acknowledgeReceipt([id]);
    await expect(asRecipient.write.acknowledgeReceipt([id])).to.be.rejectedWith("WrongState");
    await expect(registry.write.acknowledgeRelease([id])).to.be.rejectedWith("WrongState");
  });

  // ---- disputes ------------------------------------------------------------

  it("records a dispute from Released without erasing earlier acknowledgments", async () => {
    const { registry, recipientA } = await deploy();
    const id = itemId("item-dispute");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await registry.write.reserveItem([id, recipientA.account.address]);
    await registry.write.acknowledgeRelease([id]);

    const asRecipient = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: recipientA },
    });
    await asRecipient.write.raiseDispute([id, hash("panel cracked in transit")]);

    const item = await registry.read.getItem([id]);
    expect(item.state).to.equal(State.Disputed);
    expect(item.donorReleaseAck).to.equal(true); // earlier ack preserved
    expect(await registry.read.isCompleted([id])).to.equal(false);

    const publicClient = await hre.viem.getPublicClient();
    const released = await publicClient.getContractEvents({
      address: registry.address,
      abi: registry.abi,
      eventName: "ReleaseAcknowledged",
      fromBlock: 0n,
    });
    expect(released).to.have.length(1); // history intact
  });

  it("refuses a dispute from a stranger or on a merely registered item", async () => {
    const { registry, recipientB } = await deploy();
    const id = itemId("item-dispute-auth");
    await registry.write.registerItem([id, hash("e"), MANIFEST_VERSION]);
    await expect(registry.write.raiseDispute([id, hash("x")])).to.be.rejectedWith("WrongState");

    await registry.write.reserveItem([id, recipientB.account.address]);
    const [, , , stranger] = await hre.viem.getWalletClients();
    const asStranger = await hre.viem.getContractAt("LoopProofRegistry", registry.address, {
      client: { wallet: stranger },
    });
    await expect(asStranger.write.raiseDispute([id, hash("x")])).to.be.rejectedWith("NotAParty");
  });

  // ---- evidence ------------------------------------------------------------

  it("detects a mismatch between a candidate manifest digest and the anchor", async () => {
    const { registry } = await deploy();
    const id = itemId("item-evidence");
    await registry.write.registerItem([id, hash("manifest-v1"), MANIFEST_VERSION]);

    expect(await registry.read.evidenceMatches([id, hash("manifest-v1")])).to.equal(true);
    expect(await registry.read.evidenceMatches([id, hash("manifest-tampered")])).to.equal(false);
  });

  it("re-anchors evidence only while no transfer is in progress", async () => {
    const { registry, recipientA } = await deploy();
    const id = itemId("item-reanchor");
    await registry.write.registerItem([id, hash("v1"), MANIFEST_VERSION]);
    await registry.write.updateEvidenceHash([id, hash("v2"), MANIFEST_VERSION]);
    expect((await registry.read.getItem([id])).evidenceHash).to.equal(hash("v2"));

    await registry.write.reserveItem([id, recipientA.account.address]);
    await expect(
      registry.write.updateEvidenceHash([id, hash("v3"), MANIFEST_VERSION]),
    ).to.be.rejectedWith("WrongState");
  });
});
