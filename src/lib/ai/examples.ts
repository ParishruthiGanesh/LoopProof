import type { ImageAnalysis } from "./schema";

/**
 * Prerecorded example analyses, used only when no ANTHROPIC_API_KEY is set.
 *
 * These are fixed samples written by hand. They are never presented as the
 * result of analysing an arbitrary upload: the UI shows which example was
 * chosen and states plainly that no model call was made.
 */
export type ExampleAnalysis = {
  key: string;
  label: string;
  /** What the example is a sample of, shown next to it in the UI. */
  describes: string;
  analysis: ImageAnalysis;
};

export const EXAMPLE_ANALYSES: ExampleAnalysis[] = [
  {
    key: "monitor-24in-dell-like",
    label: "Example A — 24-inch desktop monitor on a stand",
    describes: "A rear-and-front pair of photographs of a black 24-inch monitor with a legible rear label.",
    analysis: {
      suggestedCategory: "monitor",
      suggestedTitle: "24-inch LED desktop monitor with stand",
      visibleBrand: "Dell",
      visibleModel: "P2419H",
      visibleSpecifications: [
        { label: "Screen size", value: "24 in (from model marking)", evidence: "Model number P2419H printed on rear label" },
        { label: "Panel inputs visible", value: "HDMI, DisplayPort, VGA", evidence: "Three labelled ports on rear panel" },
        { label: "Stand", value: "Height-adjustable stand attached", evidence: "Stand visible in both photographs" },
      ],
      visibleDamage: [
        { observation: "Light scuff on the lower bezel, roughly 2 cm", location: "lower bezel, right of centre", severityWording: "cosmetic" },
      ],
      uncertainFields: ["native resolution", "refresh rate", "panel type", "hours of use", "serial number"],
      questionsForOwner: [
        { question: "Does it power on and display an image across the whole panel?", field: "condition", whyItMatters: "Recipients will not collect an untested display." },
        { question: "Which cables are included — power, HDMI, DisplayPort?", field: "cables", whyItMatters: "A monitor without a power cable is often unusable on arrival." },
        { question: "What is the measured weight with the stand attached?", field: "mass", whyItMatters: "Needed for transport planning and for mass reporting." },
        { question: "Is the native resolution 1920x1080? The label is not legible in these photographs.", field: "specifications", whyItMatters: "Classrooms often need a minimum resolution." },
      ],
      draftDescription:
        "A black 24-inch desktop monitor on a height-adjustable stand. The rear label reads Dell P2419H. Three video inputs are visible on the rear panel (HDMI, DisplayPort, VGA). There is a small cosmetic scuff on the lower bezel; the owner still needs to confirm that it powers on, which cables are included, and the native resolution.",
      notAssessableFromPhoto: [
        "whether the monitor powers on",
        "whether the panel has dead pixels or backlight bleed",
        "electrical safety of the unit or its power supply",
        "internal condition of the panel or board",
        "who legally owns the item",
      ],
    },
  },
  {
    key: "keyboard-mouse-set",
    label: "Example B — wired keyboard and mouse set",
    describes: "A single photograph of a wired USB keyboard with a matching mouse on a desk.",
    analysis: {
      suggestedCategory: "peripheral",
      suggestedTitle: "Wired USB keyboard and mouse set",
      visibleBrand: "unknown",
      visibleModel: "unknown",
      visibleSpecifications: [
        { label: "Connection", value: "Wired USB-A (cable and connector visible)", evidence: "USB-A connector visible at the end of the keyboard cable" },
        { label: "Layout", value: "Full-size with numeric keypad", evidence: "Numeric keypad visible on the right of the keyboard" },
      ],
      visibleDamage: [
        { observation: "Key legends on W, A, S and D appear worn", location: "left of keyboard", severityWording: "cosmetic" },
      ],
      uncertainFields: ["brand", "model", "keyboard layout language", "mouse DPI", "cable length"],
      questionsForOwner: [
        { question: "Do all keys register, and does the mouse track and click correctly?", field: "condition", whyItMatters: "Worn legends are cosmetic; non-registering keys are not." },
        { question: "What keyboard layout is it (for example US, UK, or another)?", field: "specifications", whyItMatters: "Layout determines whether a recipient can use it at all." },
        { question: "How many sets are you passing on?", field: "quantity", whyItMatters: "Classrooms usually need matched sets." },
      ],
      draftDescription:
        "A full-size wired USB keyboard with a numeric keypad, photographed with a matching wired mouse. No brand or model marking is legible in the photograph. Some key legends show wear. The owner still needs to confirm that all keys and the mouse buttons work, and which keyboard layout this is.",
      notAssessableFromPhoto: [
        "whether every key registers",
        "whether the mouse sensor works",
        "cable continuity or electrical safety",
        "who legally owns the item",
      ],
    },
  },
  {
    key: "desktop-mini-pc",
    label: "Example C — small-form-factor desktop computer",
    describes: "Two photographs of a small desktop computer, front and rear.",
    analysis: {
      suggestedCategory: "small_electronics",
      suggestedTitle: "Small-form-factor desktop computer",
      visibleBrand: "HP",
      visibleModel: "unknown",
      visibleSpecifications: [
        { label: "Form factor", value: "Small form factor desktop, roughly 18 cm wide", evidence: "Relative size against the desk edge in the front photograph" },
        { label: "Rear ports visible", value: "4x USB-A, 1x DisplayPort, 1x VGA, 1x RJ45", evidence: "Rear panel photograph" },
        { label: "Optical drive", value: "Slot-loading drive present", evidence: "Slot visible on the front face" },
      ],
      visibleDamage: [],
      uncertainFields: [
        "model number (rear label not legible)",
        "processor",
        "installed memory",
        "storage type and capacity",
        "whether storage has been erased",
        "serial number",
      ],
      questionsForOwner: [
        { question: "Has the storage been securely erased, and can you say how?", field: "other", whyItMatters: "A recipient cannot accept a machine that may still hold personal data." },
        { question: "What are the processor, memory and storage?", field: "specifications", whyItMatters: "Determines whether it is usable for the recipient's purpose." },
        { question: "Does it power on and reach a firmware screen or an operating system?", field: "condition", whyItMatters: "Nothing in the photographs shows this." },
        { question: "Is a power supply or power cable included?", field: "cables", whyItMatters: "These units often use an external power brick." },
      ],
      draftDescription:
        "A small-form-factor desktop computer with an HP marking on the front face. The rear panel shows four USB-A ports, DisplayPort, VGA and an RJ45 network socket, and there is a slot-loading optical drive at the front. No model label is legible in these photographs, and the internal specification and data-erasure status still need to be confirmed by the owner.",
      notAssessableFromPhoto: [
        "whether the computer powers on",
        "installed processor, memory or storage",
        "whether storage has been erased",
        "electrical safety",
        "internal condition or missing components",
        "who legally owns the item",
      ],
    },
  },
];

export const findExample = (key: string) => EXAMPLE_ANALYSES.find((e) => e.key === key) ?? null;
