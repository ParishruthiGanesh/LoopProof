#!/usr/bin/env tsx
/**
 * Seeds demonstration data. EVERY row created here has is_demo = 1, and the
 * application filters on that column so seeded examples are never mixed into
 * real activity totals.
 *
 * The three organizations are fictional. They are not, and are not meant to
 * suggest, real institutions or partnerships.
 */
import { openDatabase } from "../src/lib/db";
import { serverEnv } from "../src/lib/env";
import { hashPassword } from "../src/lib/password";
import { uuid } from "../src/lib/ids";
import { MANIFEST_VERSION, canonicalize, sha256Hex } from "../src/lib/evidence-manifest";

const DEMO_PASSWORD = "loopproof-demo";

type SeedSpec = { label: string; value: string; source: string; basis: string };

const now = () => new Date().toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export async function seed(dbPath = serverEnv.databaseUrl) {
  const { sqlite } = openDatabase(dbPath);
  sqlite.pragma("foreign_keys = ON");

  const existing = sqlite.prepare("SELECT COUNT(*) AS n FROM organizations").get() as { n: number };
  if (existing.n > 0) {
    console.log("database already seeded; run `npm run db:reset` to start over");
    sqlite.close();
    return;
  }

  /* ------------------------------------------------------- organizations */

  const orgs = [
    {
      id: "org-northfield-surplus",
      name: "Northfield Polytechnic — Surplus Office",
      kind: "donor" as const,
      description:
        "Fictional demonstration organization. The surplus office of a mid-sized polytechnic that clears equipment from refurbished teaching spaces.",
      locationRegion: "Northfield, North Harbor district",
      latitude: 53.4809,
      longitude: -2.2374,
      contactEmail: "surplus@northfield-poly.example",
      contactPhone: "+44 20 7000 0101",
      streetAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      walletIndex: 1,
    },
    {
      id: "org-harbourside-learning",
      name: "Harbourside Community Learning Centre",
      kind: "recipient" as const,
      description:
        "Fictional demonstration organization. A community centre running evening digital-skills classes for adults and after-school sessions.",
      locationRegion: "Eastside, Harbourside",
      latitude: 53.4668,
      longitude: -2.1932,
      contactEmail: "equipment@harbourside-learning.example",
      contactPhone: "+44 20 7000 0202",
      streetAddress: "Side entrance, 8 Quay Street, Harbourside",
      walletIndex: 2,
    },
    {
      id: "org-reloop-collective",
      name: "ReLoop Collective",
      kind: "both" as const,
      description:
        "Fictional demonstration organization. An independent reuse organization that tests, repairs and redistributes office electronics.",
      locationRegion: "Westgate industrial estate",
      latitude: 53.4722,
      longitude: -2.3012,
      contactEmail: "intake@reloop-collective.example",
      contactPhone: "+44 20 7000 0303",
      streetAddress: "Unit 11, Westgate Trade Park, Westgate",
      walletIndex: 3,
    },
  ];

  const insertOrg = sqlite.prepare(
    `INSERT INTO organizations (id, name, kind, description, location_region, latitude, longitude,
       contact_email, contact_phone, street_address, wallet_address, is_demo, created_at)
     VALUES (@id, @name, @kind, @description, @locationRegion, @latitude, @longitude,
       @contactEmail, @contactPhone, @streetAddress, @walletAddress, 1, @createdAt)`,
  );

  // Hardhat's standard development accounts. These are publicly known test
  // keys; the matching private keys live only in .env.local (gitignored) and
  // are written there by scripts/deploy-contract.ts.
  const DEV_ADDRESSES = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  ];

  for (const org of orgs) {
    insertOrg.run({
      id: org.id,
      name: org.name,
      kind: org.kind,
      description: org.description,
      locationRegion: org.locationRegion,
      latitude: org.latitude,
      longitude: org.longitude,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      streetAddress: org.streetAddress,
      walletAddress: DEV_ADDRESSES[org.walletIndex],
      createdAt: now(),
    });
  }

  /* --------------------------------------------------------------- users */

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const users = [
    { id: "user-northfield", orgId: "org-northfield-surplus", name: "Rowan Avery", email: "rowan@northfield-poly.example", role: "admin" },
    { id: "user-harbourside", orgId: "org-harbourside-learning", name: "Imani Okafor", email: "imani@harbourside-learning.example", role: "admin" },
    { id: "user-reloop", orgId: "org-reloop-collective", name: "Sam Tulloch", email: "sam@reloop-collective.example", role: "admin" },
  ];
  const insertUser = sqlite.prepare(
    `INSERT INTO users (id, org_id, name, email, password_hash, role, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  for (const u of users) insertUser.run(u.id, u.orgId, u.name, u.email, passwordHash, u.role, now());

  /* --------------------------------------------------------------- items */

  type SeedItem = {
    id: string;
    orgId: string;
    title: string;
    category: string;
    description: string;
    brand: string;
    model: string;
    conditionGrade: string;
    quantity: number;
    massKg: number | null;
    massBasis: string;
    replacementValue: number | null;
    replacementValueBasis: string;
    locationRegion: string;
    collectionAddress: string;
    windowStart: string | null;
    windowEnd: string | null;
    knownDefects: string;
    status: string;
    illustration: string;
    specs: SeedSpec[];
    checklist: {
      powersOn: string;
      displayWorks: string;
      portsTested: string;
      cablesIncluded: string;
      notes: string;
      testedByOrgId: string;
    } | null;
    evidence: Array<{ kind: string; source: string; statement: string; orgId: string }>;
  };

  const owner = (id: string) => orgs.find((o) => o.id === id)!;

  const items: SeedItem[] = [
    {
      id: "LP-MON-K4T2PQ",
      orgId: "org-northfield-surplus",
      title: '24-inch LED monitor, 1920x1080, with stand',
      category: "monitor",
      description:
        "Cleared from a refurbished seminar room. Tested on the bench before listing: powers on and displays a full image across the panel. Height-adjustable stand included.",
      brand: "Dell",
      model: "P2419H",
      conditionGrade: "working_good",
      quantity: 4,
      massKg: 5.4,
      massBasis: "measured",
      replacementValue: 120,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(2),
      windowEnd: daysFromNow(30),
      knownDefects: "Light scuff on the lower bezel of two of the four units. No panel defects found.",
      status: "available",
      illustration: "/items/monitor-24.svg",
      specs: [
        { label: "Screen size", value: "24 in", source: "owner_reported", basis: "Measured diagonally" },
        { label: "Native resolution", value: "1920x1080", source: "documented_test", basis: "Confirmed on the bench at native resolution" },
        { label: "Video inputs", value: "HDMI, DisplayPort, VGA", source: "documented_test", basis: "All three inputs tested" },
        { label: "Stand", value: "Height-adjustable, tilt and swivel", source: "owner_reported", basis: "Visual inspection" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "pass",
        cablesIncluded: "yes",
        notes: "Power cable and one DisplayPort cable included per unit. Bench test on 4 of 4 units.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Bench test on all four units: each powered on and displayed a full image at 1920x1080 on HDMI, DisplayPort and VGA.",
          orgId: "org-northfield-surplus",
        },
        {
          kind: "owner_statement",
          source: "owner_reported",
          statement: "Units came from a single seminar room and were in daily use until the room was refurbished.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-MON-R7WH3M",
      orgId: "org-northfield-surplus",
      title: "27-inch monitor, 2560x1440, no stand",
      category: "monitor",
      description:
        "Larger monitor from a decommissioned design lab. Panel is clean. The VESA stand was retained for another unit, so this ships as a panel only and needs a VESA mount or stand.",
      brand: "unknown",
      model: "unknown",
      conditionGrade: "working_marks",
      quantity: 1,
      massKg: 4.1,
      massBasis: "measured",
      replacementValue: 170,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(1),
      windowEnd: daysFromNow(21),
      knownDefects: "No stand supplied. Scratches across the rear casing. Two small marks on the front bezel.",
      status: "available",
      illustration: "/items/monitor-27.svg",
      specs: [
        { label: "Screen size", value: "27 in", source: "owner_reported", basis: "Measured diagonally" },
        { label: "Native resolution", value: "2560x1440", source: "documented_test", basis: "Confirmed on the bench" },
        { label: "Video inputs", value: "HDMI, DisplayPort", source: "documented_test", basis: "Both inputs tested" },
        { label: "Mounting", value: "VESA 100x100, no stand included", source: "owner_reported", basis: "Rear plate inspected" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "pass",
        cablesIncluded: "partial",
        notes: "Power cable included. No video cable. No stand or VESA arm.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Bench test: powered on, full image at 2560x1440 over both HDMI and DisplayPort.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-MON-B9XC4D",
      orgId: "org-reloop-collective",
      title: "Pair of matched 22-inch monitors, refurbished",
      category: "monitor",
      description:
        "Two matched 22-inch monitors cleaned and bench-tested by our workshop. Both stands present. Suitable for a two-station setup.",
      brand: "HP",
      model: "E223",
      conditionGrade: "working_good",
      quantity: 2,
      massKg: 4.8,
      massBasis: "measured",
      replacementValue: 95,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Westgate industrial estate",
      collectionAddress: "Unit 11, Westgate Trade Park, Westgate",
      windowStart: daysFromNow(3),
      windowEnd: daysFromNow(45),
      knownDefects: "Minor cosmetic marks on both stands. No panel defects.",
      status: "available",
      illustration: "/items/monitor-pair.svg",
      specs: [
        { label: "Screen size", value: "22 in", source: "owner_reported", basis: "Manufacturer marking" },
        { label: "Native resolution", value: "1920x1080", source: "documented_test", basis: "Workshop bench test" },
        { label: "Video inputs", value: "HDMI, VGA, DisplayPort", source: "documented_test", basis: "All inputs tested" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "pass",
        cablesIncluded: "yes",
        notes: "Power and HDMI cable supplied with each unit.",
        testedByOrgId: "org-reloop-collective",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Workshop test on both units: 4-hour burn-in, no dead pixels found, no backlight bleed noted.",
          orgId: "org-reloop-collective",
        },
      ],
    },
    {
      id: "LP-MON-T6LN8V",
      orgId: "org-northfield-surplus",
      title: "34-inch ultrawide monitor, 3440x1440",
      category: "monitor",
      description:
        "Ultrawide display from a research office. Large and heavy; a second person is needed to load it. Stand included.",
      brand: "LG",
      model: "34WN750",
      conditionGrade: "working_good",
      quantity: 1,
      massKg: 7.6,
      massBasis: "measured",
      replacementValue: 420,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(5),
      windowEnd: daysFromNow(40),
      knownDefects: "None found during testing.",
      status: "available",
      illustration: "/items/monitor-ultrawide.svg",
      specs: [
        { label: "Screen size", value: "34 in ultrawide", source: "owner_reported", basis: "Manufacturer marking" },
        { label: "Native resolution", value: "3440x1440", source: "documented_test", basis: "Confirmed on the bench" },
        { label: "Video inputs", value: "HDMI x2, DisplayPort", source: "documented_test", basis: "All inputs tested" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "pass",
        cablesIncluded: "yes",
        notes: "Power brick and DisplayPort cable included.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Bench test: powered on, full image at 3440x1440, all three inputs working.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-MON-W2QJ5F",
      orgId: "org-reloop-collective",
      title: "24-inch monitor with cracked panel — for parts only",
      category: "monitor",
      description:
        "Listed for parts recovery only. The panel is cracked and the display is unusable. The stand, power board and casing are intact. Not suitable for classroom use.",
      brand: "Acer",
      model: "unknown",
      conditionGrade: "parts_only",
      quantity: 1,
      massKg: 5.1,
      massBasis: "estimated",
      replacementValue: null,
      replacementValueBasis: "unknown",
      locationRegion: "Westgate industrial estate",
      collectionAddress: "Unit 11, Westgate Trade Park, Westgate",
      windowStart: daysFromNow(2),
      windowEnd: daysFromNow(60),
      knownDefects: "Panel cracked across the upper left quarter. Display unusable. Offered for parts recovery only.",
      status: "available",
      illustration: "/items/monitor-cracked.svg",
      specs: [
        { label: "Screen size", value: "24 in", source: "owner_reported", basis: "Casing marking" },
        { label: "Usable parts", value: "Stand, power board, casing, buttons", source: "documented_test", basis: "Workshop teardown assessment" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "fail",
        portsTested: "not_tested",
        cablesIncluded: "no",
        notes: "Backlight illuminates; panel is cracked so no usable image. Listed for parts only.",
        testedByOrgId: "org-reloop-collective",
      },
      evidence: [
        {
          kind: "defect_report",
          source: "documented_test",
          statement: "Workshop assessment: panel cracked, no usable image. Power board and stand serviceable.",
          orgId: "org-reloop-collective",
        },
      ],
    },
    {
      id: "LP-PER-H3MD7K",
      orgId: "org-northfield-surplus",
      title: "Wired USB keyboard and mouse sets",
      category: "peripheral",
      description:
        "Twelve matched wired USB keyboard and mouse sets from a cleared computer room. All tested key by key. Some key legends are worn.",
      brand: "Dell",
      model: "KB216 / MS116",
      conditionGrade: "working_marks",
      quantity: 12,
      massKg: 1.2,
      massBasis: "measured",
      replacementValue: 18,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(1),
      windowEnd: daysFromNow(30),
      knownDefects: "Worn key legends on several units, particularly W, A, S and D. All keys register.",
      status: "available",
      illustration: "/items/keyboard-mouse.svg",
      specs: [
        { label: "Connection", value: "Wired USB-A", source: "documented_test", basis: "Tested on a workstation" },
        { label: "Layout", value: "UK QWERTY", source: "owner_reported", basis: "Visual inspection of key legends" },
        { label: "Mouse", value: "Optical, three-button with scroll wheel", source: "documented_test", basis: "Tested" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "not_applicable",
        portsTested: "pass",
        cablesIncluded: "yes",
        notes: "Each set tested key by key and button by button on a workstation. Cables are captive.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "All 12 sets tested: every key registered and all mouse buttons and scroll wheels worked.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-ELE-N8KF2S",
      orgId: "org-northfield-surplus",
      title: "Small-form-factor desktop computers, storage erased",
      category: "small_electronics",
      description:
        "Six small desktop computers from a cleared teaching lab. Storage has been erased with a three-pass overwrite and a certificate is held by the surplus office. Operating system is not installed.",
      brand: "HP",
      model: "ProDesk 600 G4 SFF",
      conditionGrade: "working_good",
      quantity: 6,
      massKg: 5.9,
      massBasis: "measured",
      replacementValue: 180,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(4),
      windowEnd: daysFromNow(35),
      knownDefects: "No operating system installed. Two units have scuffed front bezels.",
      status: "available",
      illustration: "/items/mini-pc.svg",
      specs: [
        { label: "Processor", value: "Intel Core i5-8500", source: "documented_test", basis: "Read from firmware on each unit" },
        { label: "Memory", value: "8 GB DDR4", source: "documented_test", basis: "Read from firmware on each unit" },
        { label: "Storage", value: "256 GB SATA SSD, erased", source: "documented_test", basis: "Three-pass overwrite, certificate on file" },
        { label: "Rear ports", value: "4x USB-A, DisplayPort, VGA, RJ45", source: "owner_reported", basis: "Visual inspection" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "not_applicable",
        portsTested: "partial",
        cablesIncluded: "partial",
        notes: "All six reach firmware setup. USB and video ports tested; audio not tested. Power cable included, no keyboard or mouse.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "All six units powered on and reached firmware setup. Storage erased with a three-pass overwrite; certificate held by the surplus office.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-ELE-Y5PR9T",
      orgId: "org-reloop-collective",
      title: "Portable projector, 1280x800, with carry case",
      category: "small_electronics",
      description:
        "Compact projector tested in our workshop. Lamp hours are high but the image is usable in a darkened room. Carry case and power lead included.",
      brand: "Epson",
      model: "EB-W05",
      conditionGrade: "working_defects",
      quantity: 1,
      massKg: 2.5,
      massBasis: "measured",
      replacementValue: 210,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Westgate industrial estate",
      collectionAddress: "Unit 11, Westgate Trade Park, Westgate",
      windowStart: daysFromNow(2),
      windowEnd: daysFromNow(50),
      knownDefects: "High lamp hours; brightness is noticeably reduced. A replacement lamp is not included. Remote control is missing.",
      status: "available",
      illustration: "/items/projector.svg",
      specs: [
        { label: "Native resolution", value: "1280x800", source: "documented_test", basis: "Workshop test" },
        { label: "Inputs", value: "HDMI, VGA, composite", source: "documented_test", basis: "HDMI and VGA tested" },
        { label: "Lamp hours", value: "3,180 hours reported by the unit", source: "documented_test", basis: "Read from the on-screen service menu" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "partial",
        cablesIncluded: "partial",
        notes: "Projects a usable image in a darkened room. Composite input not tested. Power lead and case included; no remote.",
        testedByOrgId: "org-reloop-collective",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Workshop test: powered on, projected a stable image over HDMI and VGA. Service menu reports 3,180 lamp hours.",
          orgId: "org-reloop-collective",
        },
        {
          kind: "defect_report",
          source: "documented_test",
          statement: "Brightness measurably reduced against a new lamp. Suitable for a darkened room only.",
          orgId: "org-reloop-collective",
        },
      ],
    },
    {
      id: "LP-NET-C4VB6G",
      orgId: "org-northfield-surplus",
      title: "24-port gigabit network switch, unmanaged",
      category: "networking",
      description:
        "Rack-mount unmanaged switch removed during a network upgrade. Powers on and passes traffic on every tested port. Rack ears included.",
      brand: "Netgear",
      model: "JGS524",
      conditionGrade: "working_good",
      quantity: 2,
      massKg: 3.0,
      massBasis: "measured",
      replacementValue: 110,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(6),
      windowEnd: daysFromNow(40),
      knownDefects: "Rack ears are scratched. One unit has a bent but functional port shield.",
      status: "available",
      illustration: "/items/switch.svg",
      specs: [
        { label: "Ports", value: "24x gigabit Ethernet", source: "documented_test", basis: "All 24 ports traffic-tested on both units" },
        { label: "Management", value: "Unmanaged", source: "owner_reported", basis: "Model specification" },
        { label: "Form factor", value: "1U rack mount", source: "owner_reported", basis: "Visual inspection" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "not_applicable",
        portsTested: "pass",
        cablesIncluded: "no",
        notes: "Every port passed a link and throughput test. Power lead included; no patch cables.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Both units: all 24 ports established a gigabit link and passed traffic.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-PER-Q7ZT3N",
      orgId: "org-reloop-collective",
      title: "USB webcams, 1080p, untested",
      category: "peripheral",
      description:
        "Eight USB webcams received in a bulk donation. We have not yet tested them individually, so they are listed as untested.",
      brand: "Logitech",
      model: "C270",
      conditionGrade: "untested",
      quantity: 8,
      massKg: null,
      massBasis: "unknown",
      replacementValue: 25,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Westgate industrial estate",
      collectionAddress: "Unit 11, Westgate Trade Park, Westgate",
      windowStart: daysFromNow(7),
      windowEnd: daysFromNow(60),
      knownDefects: "Not individually tested. Condition of each unit is unknown. Clips are intact on all eight.",
      status: "available",
      illustration: "/items/webcam.svg",
      specs: [
        { label: "Connection", value: "Wired USB-A", source: "owner_reported", basis: "Connector inspected" },
        { label: "Stated resolution", value: "1280x720 per the model marking", source: "owner_reported", basis: "Model marking on the body; not verified by test" },
      ],
      checklist: {
        powersOn: "not_tested",
        displayWorks: "not_tested",
        portsTested: "not_tested",
        cablesIncluded: "yes",
        notes: "No testing carried out yet. Cables are captive. A recipient should expect to test these themselves.",
        testedByOrgId: "org-reloop-collective",
      },
      evidence: [
        {
          kind: "owner_statement",
          source: "owner_reported",
          statement: "Received as a bulk donation and not yet tested. Listed honestly as untested rather than assumed working.",
          orgId: "org-reloop-collective",
        },
      ],
    },
    {
      id: "LP-PER-D9GL4X",
      orgId: "org-northfield-surplus",
      title: "USB-C laptop docking stations",
      category: "peripheral",
      description:
        "Three USB-C docking stations from a hot-desking refresh. Each tested with a laptop for video, network and USB passthrough.",
      brand: "Dell",
      model: "WD19",
      conditionGrade: "working_good",
      quantity: 3,
      massKg: 0.9,
      massBasis: "measured",
      replacementValue: 130,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(3),
      windowEnd: daysFromNow(28),
      knownDefects: "Cosmetic marks on the top surfaces. One unit's captive cable has a scuffed strain relief.",
      status: "available",
      illustration: "/items/dock.svg",
      specs: [
        { label: "Host connection", value: "USB-C", source: "documented_test", basis: "Tested with a USB-C laptop" },
        { label: "Outputs", value: "2x DisplayPort, HDMI, RJ45, 4x USB-A", source: "documented_test", basis: "Video, network and USB passthrough tested" },
        { label: "Power delivery", value: "130 W power supply included", source: "owner_reported", basis: "Rating label on the supply" },
      ],
      checklist: {
        powersOn: "pass",
        displayWorks: "pass",
        portsTested: "pass",
        cablesIncluded: "yes",
        notes: "All three tested with a laptop: dual external displays, gigabit network and USB passthrough all worked. Power supplies included.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "All three docks drove two external displays and a gigabit network connection from a USB-C laptop.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
    {
      id: "LP-FUR-M2SK8H",
      orgId: "org-northfield-surplus",
      title: "Office task chairs, adjustable",
      category: "furniture",
      description:
        "Ten adjustable task chairs from a cleared open-plan office. Gas lifts tested. Upholstery is worn but clean and intact.",
      brand: "unknown",
      model: "unknown",
      conditionGrade: "working_marks",
      quantity: 10,
      massKg: 12.0,
      massBasis: "estimated",
      replacementValue: 70,
      replacementValueBasis: "owner_estimate",
      locationRegion: "Northfield, North Harbor district",
      collectionAddress: "Loading bay 3, Marsden Building, 14 Marsden Row, Northfield",
      windowStart: daysFromNow(10),
      windowEnd: daysFromNow(45),
      knownDefects: "Upholstery worn on all seats. Two chairs have a stiff height adjustment. Armrests are scuffed.",
      status: "available",
      illustration: "/items/desk-chair.svg",
      specs: [
        { label: "Adjustments", value: "Seat height, backrest tilt", source: "documented_test", basis: "Each chair cycled through its adjustments" },
        { label: "Base", value: "Five-star base on castors", source: "owner_reported", basis: "Visual inspection" },
      ],
      checklist: {
        powersOn: "not_applicable",
        displayWorks: "not_applicable",
        portsTested: "not_tested",
        cablesIncluded: "no",
        notes: "Not an electrical item. Each chair's gas lift and castors were checked by hand. Weight is an estimate, not measured.",
        testedByOrgId: "org-northfield-surplus",
      },
      evidence: [
        {
          kind: "test_checklist",
          source: "documented_test",
          statement: "Each of the ten chairs was checked by hand: gas lifts held height and all castors rolled freely.",
          orgId: "org-northfield-surplus",
        },
      ],
    },
  ];

  const insertItem = sqlite.prepare(
    `INSERT INTO items (id, org_id, title, category, description, brand, model, condition_grade, quantity,
       mass_kg, mass_basis, replacement_value, replacement_value_basis, location_region, collection_address,
       collection_window_start, collection_window_end, known_defects, private_notes, status,
       evidence_version, is_demo, created_at, updated_at)
     VALUES (@id, @orgId, @title, @category, @description, @brand, @model, @conditionGrade, @quantity,
       @massKg, @massBasis, @replacementValue, @replacementValueBasis, @locationRegion, @collectionAddress,
       @windowStart, @windowEnd, @knownDefects, @privateNotes, @status, 0, 1, @createdAt, @createdAt)`,
  );
  const insertPhoto = sqlite.prepare(
    `INSERT INTO item_photos (id, item_id, stored_path, sha256, caption, mime_type, byte_size, is_public, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 'image/svg+xml', 0, 1, 0, ?)`,
  );
  const insertSpec = sqlite.prepare(
    `INSERT INTO item_specs (id, item_id, label, value, source, confirmed_by_owner, basis, sort_order)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const insertChecklist = sqlite.prepare(
    `INSERT INTO test_checklists (item_id, powers_on, display_works, ports_tested, cables_included, notes, tested_by_org_id, tested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEvidence = sqlite.prepare(
    `INSERT INTO condition_evidence (id, item_id, kind, source, statement, recorded_by_org_id, is_public, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  for (const [index, item] of items.entries()) {
    insertItem.run({
      ...item,
      privateNotes: `Demonstration record. Internal note for ${owner(item.orgId).name}; never shown publicly.`,
      createdAt: daysAgo(items.length - index + 3),
    });
    insertPhoto.run(
      uuid(),
      item.id,
      item.illustration,
      sha256Hex(`illustration:${item.illustration}`),
      "Example illustration, not a photograph of the actual item",
      daysAgo(items.length - index + 3),
    );
    item.specs.forEach((s, i) =>
      insertSpec.run(uuid(), item.id, s.label, s.value, s.source, s.basis, i),
    );
    if (item.checklist) {
      insertChecklist.run(
        item.id,
        item.checklist.powersOn,
        item.checklist.displayWorks,
        item.checklist.portsTested,
        item.checklist.cablesIncluded,
        item.checklist.notes,
        item.checklist.testedByOrgId,
        daysAgo(items.length - index + 2),
      );
    }
    for (const e of item.evidence) {
      insertEvidence.run(uuid(), item.id, e.kind, e.source, e.statement, e.orgId, daysAgo(items.length - index + 2));
    }
  }

  /* ------------------------------------------------------------ requests */

  const requests = [
    {
      id: "REQ-H4TK2M",
      orgId: "org-harbourside-learning",
      title: "Four monitors for an adult digital-skills classroom",
      freeText:
        "We are setting up four workstations for an evening adult digital-skills class. We need monitors that are definitely working, at least 1920x1080 so that two windows fit side by side, with a power cable included. We can collect with a van within the next three weeks. Matched units would be easier for teaching but are not essential.",
      category: "monitor",
      quantity: 4,
      minConditionGrade: "working_marks",
      requiredSpecs: JSON.stringify([
        { label: "Native resolution", value: ">=1920", required: true },
        { label: "Video inputs", value: "HDMI", required: false },
      ]),
      locationRegion: "Eastside, Harbourside",
      latitude: 53.4668,
      longitude: -2.1932,
      maxDistanceKm: 25,
      collectionDeadline: daysFromNow(21),
      needsCables: 1,
    },
    {
      id: "REQ-P8WD5R",
      orgId: "org-harbourside-learning",
      title: "Keyboards and mice for the same classroom",
      freeText:
        "Alongside the monitors we need wired keyboards and mice for four workstations. Wired is better than wireless for us because batteries go missing. Worn keys are fine as long as every key works.",
      category: "peripheral",
      quantity: 4,
      minConditionGrade: "working_marks",
      requiredSpecs: JSON.stringify([{ label: "Connection", value: "Wired USB", required: true }]),
      locationRegion: "Eastside, Harbourside",
      latitude: 53.4668,
      longitude: -2.1932,
      maxDistanceKm: 25,
      collectionDeadline: daysFromNow(21),
      needsCables: 0,
    },
    {
      id: "REQ-V3NB7C",
      orgId: "org-reloop-collective",
      title: "Projector for a repair-cafe teaching corner",
      freeText:
        "We run monthly repair sessions and would like a projector to show teardown steps to a group of about fifteen people. The room can be darkened, so reduced brightness from an older lamp is acceptable. We can collect ourselves at any time.",
      category: "small_electronics",
      quantity: 1,
      minConditionGrade: "working_defects",
      requiredSpecs: JSON.stringify([{ label: "Inputs", value: "HDMI", required: true }]),
      locationRegion: "Westgate industrial estate",
      latitude: 53.4722,
      longitude: -2.3012,
      maxDistanceKm: 40,
      collectionDeadline: daysFromNow(60),
      needsCables: 0,
    },
  ];

  const insertRequest = sqlite.prepare(
    `INSERT INTO requests (id, org_id, title, free_text, category, quantity, min_condition_grade,
       required_specs, location_region, latitude, longitude, max_distance_km, collection_deadline,
       needs_cables_included, status, is_demo, created_at)
     VALUES (@id, @orgId, @title, @freeText, @category, @quantity, @minConditionGrade,
       @requiredSpecs, @locationRegion, @latitude, @longitude, @maxDistanceKm, @collectionDeadline,
       @needsCables, 'open', 1, @createdAt)`,
  );
  for (const [i, r] of requests.entries()) insertRequest.run({ ...r, createdAt: daysAgo(6 - i) });

  /* ----------------------------------------------------------- transfers */

  const insertTransfer = sqlite.prepare(
    `INSERT INTO transfers (id, item_id, request_id, donor_org_id, recipient_org_id, state, request_message,
       quantity, donor_release_ack, recipient_receipt_ack, evidence_version_at_reservation,
       cancel_reason, dispute_reason, dispute_raised_by_org_id,
       created_at, updated_at, reserved_at, released_at, received_at, completed_at, closed_at, is_demo)
     VALUES (@id, @itemId, @requestId, @donorOrgId, @recipientOrgId, @state, @requestMessage,
       @quantity, @donorAck, @recipientAck, @evidenceVersion,
       @cancelReason, @disputeReason, @disputeBy,
       @createdAt, @updatedAt, @reservedAt, @releasedAt, @receivedAt, @completedAt, @closedAt, 1)`,
  );
  const insertEvent = sqlite.prepare(
    `INSERT INTO transfer_events (id, transfer_id, kind, from_state, to_state, actor_org_id, note, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );

  // 1. A pending transfer awaiting the donor's decision.
  insertTransfer.run({
    id: "TRN-G5HQ2W",
    itemId: "LP-NET-C4VB6G",
    requestId: null,
    donorOrgId: "org-northfield-surplus",
    recipientOrgId: "org-reloop-collective",
    state: "requested",
    requestMessage:
      "We would take one of the two switches for our workshop bench network. We can collect any weekday morning.",
    quantity: 1,
    donorAck: 0,
    recipientAck: 0,
    evidenceVersion: null,
    cancelReason: "",
    disputeReason: "",
    disputeBy: null,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    reservedAt: null,
    releasedAt: null,
    receivedAt: null,
    completedAt: null,
    closedAt: null,
  });
  insertEvent.run(
    uuid(),
    "TRN-G5HQ2W",
    "request_submitted",
    null,
    "requested",
    "org-reloop-collective",
    "Recipient submitted a request for this item.",
    daysAgo(2),
  );

  // 2. A completed transfer: both acknowledgments recorded.
  const completedItemId = "LP-PER-D9GL4X";
  insertTransfer.run({
    id: "TRN-J7RL9X",
    itemId: completedItemId,
    requestId: null,
    donorOrgId: "org-northfield-surplus",
    recipientOrgId: "org-harbourside-learning",
    state: "completed",
    requestMessage: "One dock would let our tutor use a laptop with the room's two displays.",
    quantity: 1,
    donorAck: 1,
    recipientAck: 1,
    evidenceVersion: 1,
    cancelReason: "",
    disputeReason: "",
    disputeBy: null,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(9),
    reservedAt: daysAgo(13),
    releasedAt: daysAgo(10),
    receivedAt: daysAgo(9),
    completedAt: daysAgo(9),
    closedAt: null,
  });
  const completedTimeline: Array<[string, string | null, string | null, string, string, number]> = [
    ["request_submitted", null, "requested", "org-harbourside-learning", "Recipient submitted a request for this item.", 14],
    ["accept", "requested", "reserved", "org-northfield-surplus", "Donor accepted the request and reserved one dock.", 13],
    ["record_release", "reserved", "released", "org-northfield-surplus", "Collected from the loading bay by the recipient's staff member.", 10],
    ["record_receipt", "released", "completed", "org-harbourside-learning", "Dock received and tested on arrival; drove both room displays as described.", 9],
  ];
  for (const [kind, from, to, actor, note, ago] of completedTimeline) {
    insertEvent.run(uuid(), "TRN-J7RL9X", kind, from, to, actor, note, daysAgo(ago));
  }
  insertEvidence.run(
    uuid(),
    completedItemId,
    "recipient_confirmation",
    "recipient_confirmed",
    "Recipient confirmed on receipt that the dock matched the published condition and drove two external displays.",
    "org-harbourside-learning",
    daysAgo(9),
  );
  // One of the three docks went; two remain available.
  sqlite.prepare("UPDATE items SET quantity = 2 WHERE id = ?").run(completedItemId);

  // 3. A disputed transfer. Excluded from confirmed impact totals.
  insertTransfer.run({
    id: "TRN-Z4MC6B",
    itemId: "LP-ELE-Y5PR9T",
    requestId: null,
    donorOrgId: "org-reloop-collective",
    recipientOrgId: "org-harbourside-learning",
    state: "disputed",
    requestMessage: "We would like the projector for our evening class.",
    quantity: 1,
    donorAck: 1,
    recipientAck: 0,
    evidenceVersion: 1,
    cancelReason: "",
    disputeReason:
      "On arrival the projector would not hold a stable image for more than a few minutes. The recipient reported the problem instead of confirming receipt.",
    disputeBy: "org-harbourside-learning",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(16),
    reservedAt: daysAgo(19),
    releasedAt: daysAgo(17),
    receivedAt: null,
    completedAt: null,
    closedAt: daysAgo(16),
  });
  const disputedTimeline: Array<[string, string | null, string | null, string, string, number]> = [
    ["request_submitted", null, "requested", "org-harbourside-learning", "Recipient submitted a request for this item.", 20],
    ["accept", "requested", "reserved", "org-reloop-collective", "Donor accepted the request and reserved the projector.", 19],
    ["record_release", "reserved", "released", "org-reloop-collective", "Handed over at the workshop.", 17],
    [
      "report_problem",
      "released",
      "disputed",
      "org-harbourside-learning",
      "Projector would not hold a stable image for more than a few minutes. Receipt not confirmed; return being arranged.",
      16,
    ],
  ];
  for (const [kind, from, to, actor, note, ago] of disputedTimeline) {
    insertEvent.run(uuid(), "TRN-Z4MC6B", kind, from, to, actor, note, daysAgo(ago));
  }
  insertEvidence.run(
    uuid(),
    "LP-ELE-Y5PR9T",
    "defect_report",
    "recipient_confirmed",
    "Problem reported during transfer: the projector would not hold a stable image for more than a few minutes after warm-up.",
    "org-harbourside-learning",
    daysAgo(16),
  );

  // 4. A cancelled transfer.
  insertTransfer.run({
    id: "TRN-L8DF3K",
    itemId: "LP-MON-R7WH3M",
    requestId: null,
    donorOrgId: "org-northfield-surplus",
    recipientOrgId: "org-reloop-collective",
    state: "cancelled",
    requestMessage: "We could take the 27-inch panel and fit a spare VESA arm.",
    quantity: 1,
    donorAck: 0,
    recipientAck: 0,
    evidenceVersion: 1,
    cancelReason: "Recipient's van was unavailable inside the collection window.",
    disputeReason: "",
    disputeBy: null,
    createdAt: daysAgo(11),
    updatedAt: daysAgo(8),
    reservedAt: daysAgo(10),
    releasedAt: null,
    receivedAt: null,
    completedAt: null,
    closedAt: daysAgo(8),
  });
  const cancelledTimeline: Array<[string, string | null, string | null, string, string, number]> = [
    ["request_submitted", null, "requested", "org-reloop-collective", "Recipient submitted a request for this item.", 11],
    ["accept", "requested", "reserved", "org-northfield-surplus", "Donor accepted the request and reserved the panel.", 10],
    ["cancel", "reserved", "cancelled", "org-reloop-collective", "Recipient's van was unavailable inside the collection window.", 8],
  ];
  for (const [kind, from, to, actor, note, ago] of cancelledTimeline) {
    insertEvent.run(uuid(), "TRN-L8DF3K", kind, from, to, actor, note, daysAgo(ago));
  }

  /* ------------------------------------------------- evidence manifests */

  // Snapshot version 1 of every seeded item's public manifest, so the
  // passport and the tamper check work immediately after seeding. These are
  // not anchored on chain yet: nothing is labelled confirmed until a real
  // transaction receipt says so.
  const insertManifest = sqlite.prepare(
    `INSERT INTO evidence_manifests (id, item_id, version_number, manifest_version, canonical_json, sha256, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
  );
  for (const item of items) {
    const specs = sqlite
      .prepare(
        "SELECT label, value, source FROM item_specs WHERE item_id = ? AND confirmed_by_owner = 1 ORDER BY sort_order, label",
      )
      .all(item.id) as Array<{ label: string; value: string; source: string }>;
    const evidence = sqlite
      .prepare(
        "SELECT kind, source, statement, recorded_at FROM condition_evidence WHERE item_id = ? AND is_public = 1 ORDER BY recorded_at, id",
      )
      .all(item.id) as Array<{ kind: string; source: string; statement: string; recorded_at: string }>;
    const photos = sqlite
      .prepare("SELECT sha256, caption FROM item_photos WHERE item_id = ? AND is_public = 1 ORDER BY sort_order, id")
      .all(item.id) as Array<{ sha256: string; caption: string }>;
    const checklist = sqlite
      .prepare("SELECT * FROM test_checklists WHERE item_id = ?")
      .get(item.id) as Record<string, string> | undefined;
    const row = sqlite.prepare("SELECT * FROM items WHERE id = ?").get(item.id) as Record<string, unknown>;

    const manifest = {
      manifestVersion: MANIFEST_VERSION,
      itemId: item.id,
      title: row.title as string,
      category: row.category as string,
      description: row.description as string,
      brand: row.brand as string,
      model: row.model as string,
      conditionGrade: row.condition_grade as string,
      quantity: row.quantity as number,
      massKg: (row.mass_kg as number | null) ?? null,
      massBasis: row.mass_basis as string,
      locationRegion: row.location_region as string,
      knownDefects: row.known_defects as string,
      specifications: specs,
      testChecklist: checklist
        ? {
            powersOn: checklist.powers_on,
            displayWorks: checklist.display_works,
            portsTested: checklist.ports_tested,
            cablesIncluded: checklist.cables_included,
            notes: checklist.notes,
          }
        : null,
      conditionEvidence: evidence.map((e) => ({
        kind: e.kind,
        source: e.source,
        statement: e.statement,
        recordedAt: e.recorded_at,
      })),
      photos,
    };
    const canonical = canonicalize(manifest);
    insertManifest.run(uuid(), item.id, MANIFEST_VERSION, canonical, sha256Hex(canonical), now());
    sqlite.prepare("UPDATE items SET evidence_version = 1 WHERE id = ?").run(item.id);
  }

  /* -------------------------------------------------- impact assumptions */

  const insertAssumption = sqlite.prepare(
    `INSERT INTO impact_assumptions (key, label, value, unit, source, source_version, notes, is_available, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Deliberately NOT available. Supplying a number here without a named,
  // checkable source is exactly the thing this project refuses to do. The
  // impact page therefore withholds the CO2e figure and names what is missing.
  insertAssumption.run(
    "displaced_production_kgco2e_per_kg",
    "Cradle-to-gate emissions of the new equipment that reuse displaces, per kg",
    null,
    "kg CO2e per kg",
    "",
    "",
    "Needs a product-category-specific figure from a published LCA or a recognised database, cited with its version. A single per-kg number across monitors, peripherals and furniture would not be defensible.",
    0,
    now(),
  );
  insertAssumption.run(
    "displacement_rate",
    "Share of transferred items that actually displace a new purchase",
    null,
    "fraction 0-1",
    "",
    "",
    "Requires a recipient survey: would this organization have bought new equipment if the transfer had not happened? LoopProof does not yet collect this.",
    0,
    now(),
  );
  insertAssumption.run(
    "transport_kgco2e_per_item",
    "Additional transport emissions per transferred item",
    null,
    "kg CO2e per item",
    "",
    "",
    "Needs collection distance and vehicle type per transfer. LoopProof records only coarse regions today, so this cannot be derived.",
    0,
    now(),
  );
  insertAssumption.run(
    "refurbishment_kgco2e_per_item",
    "Additional refurbishment and testing emissions per item",
    null,
    "kg CO2e per item",
    "",
    "",
    "Needs the energy used during testing and any replacement parts fitted.",
    0,
    now(),
  );
  insertAssumption.run(
    "scenario_uncertainty_fraction",
    "Scenario range applied either side of the central estimate",
    0.4,
    "fraction",
    "LoopProof scenario convention",
    "v1",
    "A plus or minus 40 percent band, used only to present a range rather than a single figure. This is a presentation convention, not a measured uncertainty.",
    1,
    now(),
  );
  // Reference figures that ARE defensible as recorded facts, not estimates.
  insertAssumption.run(
    "mass_reporting_basis",
    "How transferred mass is reported",
    null,
    "",
    "LoopProof data model",
    "v1",
    "Mass is only counted when a donor entered it. Measured and estimated masses are reported in separate buckets and never summed into one headline figure.",
    1,
    now(),
  );

  sqlite.close();

  console.log("seeded:");
  console.log(`  3 fictional organizations, 3 demo users (password: ${DEMO_PASSWORD})`);
  console.log(`  ${items.length} equipment listings (all marked demonstration data)`);
  console.log(`  ${requests.length} recipient requests`);
  console.log("  4 transfers: 1 pending, 1 completed, 1 disputed, 1 cancelled");
  console.log("  6 impact assumptions (4 deliberately unavailable, so no CO2e figure is shown)");
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
