import { describe, expect, it } from "vitest";
import type { CharsetAssignment } from "@retro-converter/zx-charset";
import { exportSpecscii } from "./specscii.js";

function assignment(inverted = false): CharsetAssignment {
  return { characterIndex: 0, transform: 0, inverted, distance: 0, hamming: 0 };
}

describe("SpecSCII JSON export", () => {
  it("preserves final INK/PAPER attributes when the tile bitmap polarity is inverted", () => {
    const assignments = Array.from({ length: 768 }, () => assignment());
    assignments[0] = assignment(true);
    const attributes = new Uint8Array(768);
    // INK red, PAPER cyan, BRIGHT on. These are already the final cell
    // attributes after the tilemap converter compensates for inverted pixels.
    attributes[0] = 2 | (5 << 3) | 0x40;

    const exported = exportSpecscii({
      assignments,
      attributes,
      charset: new Uint8Array(8),
      specsciiCharset: new Uint8Array(112 * 8),
    });
    const document = JSON.parse(new TextDecoder().decode(exported.bytes)) as {
      fields: Array<{ ink: string; paper: string; bright: boolean }>;
    };

    expect(document.fields[0]).toMatchObject({ ink: "red", paper: "cyan", bright: true });
  });
});
