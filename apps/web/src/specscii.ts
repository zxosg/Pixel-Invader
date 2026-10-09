import { transformTile, type CharsetAssignment } from "@retro-converter/zx-charset";

export interface SpecsciiField {
  readonly ink: string;
  readonly paper: string;
  readonly symbol: number;
  readonly bright: boolean;
  readonly flash: boolean;
  readonly x: number;
  readonly y: number;
}

export interface SpecsciiDocument {
  readonly application: string;
  readonly version: string;
  readonly border: number;
  readonly fields: readonly SpecsciiField[];
  readonly author?: string;
  readonly imageName?: string;
}

export interface ImportedSpecscii {
  readonly document: SpecsciiDocument;
  readonly charset: Uint8Array;
  readonly assignments: readonly CharsetAssignment[];
  readonly attributes: Uint8Array;
}

const COLOR_CODES: Readonly<Record<string, number>> = {
  black: 0, blue: 1, red: 2, magenta: 3,
  green: 4, cyan: 5, yellow: 6, white: 7,
};
const COLOR_NAMES = ["black", "blue", "red", "magenta", "green", "cyan", "yellow", "white"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

export function parseSpecsciiDocument(source: string): SpecsciiDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(source); }
  catch { throw new RangeError("File is not valid JSON."); }
  if (!record(parsed) || typeof parsed.application !== "string" || parsed.application.trim() !== "SpecSCII Online" || typeof parsed.version !== "string" || !Array.isArray(parsed.fields)) {
    throw new RangeError("Expected a SpecSCII Online project with a fields array.");
  }
  if (parsed.fields.length !== 32 * 24) throw new RangeError("Specscii screens must contain exactly 768 cells.");
  const seen = new Set<number>();
  const fields = parsed.fields.map((raw, index): SpecsciiField => {
    if (!record(raw)) throw new RangeError(`Cell ${index + 1} is invalid.`);
    const { x, y, symbol, ink, paper, bright, flash } = raw;
    if (!integer(x, 0, 31) || !integer(y, 0, 23) || !integer(symbol, 0, 111) ||
      typeof ink !== "string" || COLOR_CODES[ink.toLowerCase()] === undefined ||
      typeof paper !== "string" || COLOR_CODES[paper.toLowerCase()] === undefined ||
      typeof bright !== "boolean" || typeof flash !== "boolean") {
      throw new RangeError(`Cell ${index + 1} has unsupported coordinates, symbol, colors, or attributes.`);
    }
    const position = y * 32 + x;
    if (seen.has(position)) throw new RangeError(`Cell coordinates (${x}, ${y}) are duplicated.`);
    seen.add(position);
    return { x, y, symbol, ink: ink.toLowerCase(), paper: paper.toLowerCase(), bright, flash };
  });
  if (seen.size !== 768) throw new RangeError("Specscii screen has missing cells.");
  return {
    application: parsed.application,
    version: parsed.version,
    border: integer(parsed.border, 0, 7) ? parsed.border : 0,
    fields,
    ...(typeof parsed.author === "string" ? { author: parsed.author } : {}),
    ...(typeof parsed.imageName === "string" ? { imageName: parsed.imageName } : {}),
  };
}

/** Specscii numbers 96 ROM symbols followed by 16 block symbols. */
export function buildSpecsciiCharset(romFont: Uint8Array, userDefinedGlyphs: Uint8Array): Uint8Array {
  if (romFont.length !== 96 * 8 || userDefinedGlyphs.length !== 96 * 8) {
    throw new RangeError("Specscii requires 768-byte ROM and UDG character sets.");
  }
  const charset = new Uint8Array(112 * 8);
  charset.set(romFont);
  charset.set(userDefinedGlyphs.subarray(0, 16 * 8), 96 * 8);
  return charset;
}

export function importSpecscii(source: string, romFont: Uint8Array, userDefinedGlyphs: Uint8Array): ImportedSpecscii {
  const document = parseSpecsciiDocument(source);
  const charset = buildSpecsciiCharset(romFont, userDefinedGlyphs);
  const assignments = new Array<CharsetAssignment>(768);
  const attributes = new Uint8Array(768);
  for (const field of document.fields) {
    const index = field.y * 32 + field.x;
    assignments[index] = { characterIndex: field.symbol, transform: 0, inverted: false, distance: 0, hamming: 0 };
    attributes[index] = COLOR_CODES[field.ink]! | (COLOR_CODES[field.paper]! << 3) |
      (field.bright ? 0x40 : 0) | (field.flash ? 0x80 : 0);
  }
  return { document, charset, assignments, attributes };
}

export interface ExportedSpecscii {
  readonly bytes: Uint8Array;
  readonly approximatedCells: number;
}

function glyphDistance(left: Uint8Array, right: Uint8Array): number {
  let distance = 0;
  for (let row = 0; row < 8; row += 1) {
    let differing = (left[row] ?? 0) ^ (right[row] ?? 0);
    while (differing !== 0) {
      distance += differing & 1;
      differing >>>= 1;
    }
  }
  return distance;
}

export function exportSpecscii(input: {
  readonly assignments: readonly CharsetAssignment[];
  readonly attributes: Uint8Array;
  readonly charset: Uint8Array;
  readonly specsciiCharset: Uint8Array;
  readonly border?: number;
  readonly author?: string;
  readonly imageName?: string;
}): ExportedSpecscii {
  if (input.assignments.length !== 768 || input.attributes.length !== 768) {
    throw new RangeError("Specscii export requires exactly 768 map cells and attributes.");
  }
  if (input.charset.length % 8 !== 0 || input.specsciiCharset.length !== 112 * 8) {
    throw new RangeError("Specscii export requires valid source glyphs and the 112-symbol Specscii font.");
  }
  let approximatedCells = 0;
  const fields = input.assignments.map((assignment, index): SpecsciiField => {
    if (assignment.characterIndex < 0 || assignment.characterIndex >= input.charset.length / 8) {
      throw new RangeError(`Cell ${index + 1} uses an invalid source glyph.`);
    }
    const source = input.charset.subarray(assignment.characterIndex * 8, assignment.characterIndex * 8 + 8);
    const rendered = transformTile(source, assignment.transform);
    if (assignment.inverted) for (let row = 0; row < rendered.length; row += 1) rendered[row] = ~rendered[row]! & 0xff;
    let symbol = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < 112; candidate += 1) {
      const candidateGlyph = input.specsciiCharset.subarray(candidate * 8, candidate * 8 + 8);
      const distance = glyphDistance(rendered, candidateGlyph);
      if (distance < bestDistance) {
        symbol = candidate;
        bestDistance = distance;
      }
    }
    if (bestDistance > 0) approximatedCells += 1;
    const attribute = input.attributes[index] ?? 0;
    return {
      x: index % 32,
      y: Math.floor(index / 32),
      symbol,
      ink: COLOR_NAMES[attribute & 7]!,
      paper: COLOR_NAMES[(attribute >> 3) & 7]!,
      bright: (attribute & 0x40) !== 0,
      flash: (attribute & 0x80) !== 0,
    };
  });
  const bytes = new TextEncoder().encode(`${JSON.stringify({
    application: "SpecSCII Online ", version: "1.1.0", src: "https://github.com/moroz1999/specscii-online ",
    url: "https://zxart.ee/specscii ", border: input.border ?? 0, fields,
    author: input.author ?? "", imageName: input.imageName ?? "",
  }, null, 2)}\n`);
  return { bytes, approximatedCells };
}
