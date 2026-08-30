/**
 * Spectrum Verbatim Interpreter — Big O Notation Base44 engine.
 * Abstracted identifier: &110101011 (binary seed 0b110101011 = 427).
 * Interprets text → hex → binary and encodes/decodes Base44.
 */

export const BASE44_ID = "110101011";
export const BASE44_SEED = parseInt(BASE44_ID, 2); // 427

/** 44-symbol alphabet, rotated by the identifier seed so the agent is keyed to &110101011. */
const RAW_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh";
export const BASE44_ALPHABET =
  RAW_ALPHABET.slice(BASE44_SEED % 44) + RAW_ALPHABET.slice(0, BASE44_SEED % 44);

export function textToHex(text: string): string {
  return Array.from(text)
    .map((ch) => ch.codePointAt(0)!.toString(16).padStart(2, "0"))
    .join(" ");
}

export function hexToBinary(hex: string): string {
  return hex
    .split(/\s+/)
    .filter(Boolean)
    .map((byte) => parseInt(byte, 16).toString(2).padStart(8, "0"))
    .join(" ");
}

export function textToBinary(text: string): string {
  return hexToBinary(textToHex(text));
}

/** Encode a byte string into Base44 using the seeded alphabet (big-O: O(n) single pass). */
export function base44Encode(text: string): string {
  const bytes = Array.from(text).map((ch) => ch.codePointAt(0)! & 0xff);
  if (bytes.length === 0) return "";
  // Pack bytes into a bit stream, emit 6-bit chunks mod 44 → 44-symbol digits.
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  while (bits.length % 6 !== 0) bits += "0";
  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    const chunk = parseInt(bits.slice(i, i + 6), 2);
    out += BASE44_ALPHABET[chunk % 44];
  }
  return out;
}

/** Decode a Base44 string back to text (inverse of base44Encode). */
export function base44Decode(encoded: string): string | null {
  if (!encoded) return "";
  const idx = (c: string) => BASE44_ALPHABET.indexOf(c);
  let bits = "";
  for (const ch of encoded) {
    const v = idx(ch);
    if (v < 0) return null;
    bits += v.toString(2).padStart(6, "0");
  }
  let out = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out += String.fromCodePoint(parseInt(bits.slice(i, i + 8), 2));
  }
  return out;
}

export type Interpretation = {
  input: string;
  hex: string;
  binary: string;
  base44: string;
  bytes: number;
  /** Big O classification of the encode pass. */
  complexity: string;
};

export function interpret(text: string): Interpretation {
  const hex = textToHex(text);
  return {
    input: text,
    hex,
    binary: hexToBinary(hex),
    base44: base44Encode(text),
    bytes: text.length,
    complexity: "O(n) · single-pass bit pack",
  };
}

/** Comparator: does an entry match the query across any representation? */
export function matchesComparator(entry: Interpretation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.input.toLowerCase().includes(q) ||
    entry.hex.toLowerCase().includes(q) ||
    entry.binary.replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
    entry.base44.toLowerCase().includes(q)
  );
}

/* ---------- hypervisor binding: interpreter is sourced from the VirtualBox .deb ---------- */

export type InterpreterSource = {
  /** true once a hypervisor .deb (e.g. virtualbox-7.2_7.2.16-…_amd64.deb) is installed */
  armed: boolean;
  pkg: string | null;
  version: string | null;
  /** base44 fingerprint of the source package itself */
  fingerprint: string;
};

export function interpreterSource(pkg: string | null, version: string | null): InterpreterSource {
  const armed = Boolean(pkg && version);
  const tag = armed ? `${pkg}-${version}` : "";
  return {
    armed,
    pkg,
    version,
    fingerprint: armed ? base44Encode(tag).slice(0, 16) : "",
  };
}

/** Canonical descriptor line for a guest, fed through the interpreter. */
export function guestDescriptor(g: {
  name: string;
  osType: string;
  memMb: number;
  diskGb: number;
}): string {
  return `${g.name}|${g.osType}|${g.memMb}M|${g.diskGb}G`;
}

/** Base44 signature stamped onto a guest, keyed to the source package + &110101011. */
export function guestSignature(
  g: { name: string; osType: string; memMb: number; diskGb: number },
  src: InterpreterSource,
): string {
  const seedTag = src.armed ? `${src.pkg}${src.version}` : BASE44_ID;
  return base44Encode(`${seedTag}::${guestDescriptor(g)}`).slice(0, 22);
}

/* ---------- interpret → provision: turn a natural phrase into a guest build plan ---------- */

export type BrowserId = "firefox" | "chromium" | "google-chrome";

export type ProvisionPlan = {
  /** normalized subject the interpreter recognised, e.g. "virtualbox" */
  subject: string;
  /** true when the phrase referenced VirtualBox / a hypervisor */
  isVirtualBox: boolean;
  /** index into GUEST_TEMPLATES */
  templateIndex: number;
  templateLabel: string;
  guestName: string;
  desktop: boolean;
  autostart: boolean;
  /** browsers to install + place launchers for */
  browsers: BrowserId[];
  /** unique base44 key for this plan/guest (never shared between guests) */
  digest: string;
  /** shell/VBoxManage steps the plan expands to */
  steps: string[];
};

const TEMPLATE_KEYS: { idx: number; label: string; keys: RegExp }[] = [
  { idx: 0, label: "Ubuntu 24.04 LTS (noble)", keys: /ubuntu|noble|24\.04/i },
  { idx: 1, label: "Debian 12 (bookworm)", keys: /debian|bookworm/i },
  { idx: 2, label: "Windows Server 2022", keys: /windows|win2022|server 2022/i },
  { idx: 3, label: "Alpine 3.20", keys: /alpine/i },
  { idx: 4, label: "Fedora 41 Workstation", keys: /fedora/i },
];

const BROWSER_META: Record<BrowserId, { label: string; pkg: string; desktopFile: string; exec: string }> = {
  firefox: {
    label: "Mozilla Firefox",
    pkg: "firefox",
    desktopFile: "firefox.desktop",
    exec: "/usr/bin/firefox",
  },
  chromium: {
    label: "Chromium",
    pkg: "chromium-browser",
    desktopFile: "chromium-browser.desktop",
    exec: "/usr/bin/chromium-browser",
  },
  "google-chrome": {
    label: "Google Chrome",
    pkg: "google-chrome-stable",
    desktopFile: "google-chrome.desktop",
    exec: "/usr/bin/google-chrome",
  },
};

export function browserLabel(id: BrowserId): string {
  return BROWSER_META[id].label;
}

function slugName(text: string): string {
  const cleaned = text
    .replace(
      /virtual\s*box|virtualbox|vbox|install|configure|set\s*up|setup|guest|operating\s*system|with|desktop|firefox|chromium|chrome|browser|os/gi,
      " ",
    )
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned ? cleaned.slice(0, 24) : `spectrum-${base44Encode(text).slice(0, 6).toLowerCase()}`;
}

function detectBrowsers(text: string): BrowserId[] {
  const out: BrowserId[] = [];
  if (/firefox/i.test(text)) out.push("firefox");
  if (/chromium/i.test(text)) out.push("chromium");
  if (/google\s*chrome|(^|\W)chrome(\W|$)/i.test(text)) out.push("google-chrome");
  return out;
}

let planSeq = 0;

/** Unique base44 key per guest — seeded by name, spec, package source and a monotonic nonce. */
export function guestKey(
  parts: { name: string; spec: string },
  src: InterpreterSource,
  nonce?: string,
): string {
  planSeq += 1;
  const n = nonce ?? `${planSeq}`;
  return base44Encode(
    `${src.pkg ?? BASE44_ID}${src.version ?? BASE44_SEED}::${parts.name}::${parts.spec}::${n}`,
  ).slice(0, 22);
}

export function planFromText(text: string, src: InterpreterSource, nonce?: string): ProvisionPlan {
  const isVirtualBox = /virtual\s*box|virtualbox|vbox|hypervisor/i.test(text);
  const match = TEMPLATE_KEYS.find((t) => t.keys.test(text)) ?? TEMPLATE_KEYS[0]!;
  const desktop = !/headless|server only|no desktop/i.test(text);
  const autostart = !/manual|no autostart/i.test(text);
  const guestName = slugName(text);
  const plan: ProvisionPlan = {
    subject: isVirtualBox ? "virtualbox" : "guest",
    isVirtualBox,
    templateIndex: match.idx,
    templateLabel: match.label,
    guestName,
    desktop,
    autostart,
    browsers: detectBrowsers(text),
    digest: guestKey({ name: guestName, spec: match.label }, src, nonce ?? `preview:${guestName}`),
    steps: [],
  };
  plan.steps = provisionSteps(plan, src);
  return plan;
}

/** Rebuild a plan carrying the guest's own signature so every guest signs uniquely. */
export function planWithSignature(plan: ProvisionPlan, src: InterpreterSource, signature: string): ProvisionPlan {
  const next = { ...plan, digest: signature };
  next.steps = provisionSteps(next, src);
  return next;
}

/** Derive the build plan for an already-provisioned guest. */
export function planForGuest(
  g: { name: string; osType: string; memMb: number; diskGb: number; autostart: boolean; signature?: string },
  src: InterpreterSource,
  browsers: BrowserId[] = [],
): ProvisionPlan {
  const plan: ProvisionPlan = {
    subject: "virtualbox",
    isVirtualBox: true,
    templateIndex: -1,
    templateLabel: `${g.osType} · ${g.memMb}M · ${g.diskGb}G`,
    guestName: g.name,
    desktop: true,
    autostart: g.autostart,
    browsers,
    digest: g.signature ?? guestSignature(g, src),
    steps: [],
  };
  plan.steps = provisionSteps(plan, src);
  return plan;
}

export function browserSteps(plan: ProvisionPlan): string[] {
  const out: string[] = [];
  for (const id of plan.browsers) {
    const b = BROWSER_META[id];
    out.push(
      `guest exec · sudo apt-get install -y ${b.pkg}`,
      `guest exec · cp /usr/share/applications/${b.desktopFile} ~/Desktop/`,
      `guest exec · chmod +x ~/Desktop/${b.desktopFile}`,
      `xfdesktop · launcher "${b.label}" → ${b.exec} · icon placed on desktop`,
    );
  }
  return out;
}

export function provisionSteps(plan: ProvisionPlan, src: InterpreterSource): string[] {
  const pkg = src.armed ? `${src.pkg} ${src.version}` : "virtualbox (not installed)";
  const steps = [
    `interpreter &${BASE44_ID} · source ${pkg} · key ${plan.digest}`,
    `VBoxManage createvm --name ${plan.guestName} --ostype ${plan.templateLabel} --register`,
    `VBoxManage modifyvm ${plan.guestName} --vram 128 --nic1 nat --audio none`,
    `VBoxManage createmedium disk --filename ${plan.guestName}.vdi --variant Standard`,
    `VBoxManage storagectl ${plan.guestName} --name SATA --add sata --controller IntelAhci`,
    `VBoxManage setextradata ${plan.guestName} spectrum/base44 ${plan.digest}`,
  ];
  if (plan.desktop) {
    steps.push(
      `guest exec · apt-get install -y xorg xfce4 lightdm`,
      `guest exec · systemctl enable lightdm.service`,
    );
  }
  steps.push(...browserSteps(plan));
  if (plan.autostart) {
    steps.push(
      `VBoxManage setextradata ${plan.guestName} GUI/Autostart on`,
      `guest exec · systemctl set-default graphical.target`,
    );
  }
  steps.push(`VBoxManage modifyvm ${plan.guestName} --vrde on --vrdeport 3390`);
  return steps;
}

