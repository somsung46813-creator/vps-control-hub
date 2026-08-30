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
