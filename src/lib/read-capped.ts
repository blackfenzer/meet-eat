import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";

/**
 * Reads at most `maxBytes` from a stream and stops.
 *
 * The cap has to be applied while reading, not after: buffering a whole
 * response and then slicing it means a hostile or merely enormous page has
 * already been pulled into memory by the time the limit is checked.
 */
export async function readCapped(
  stream: Readable,
  maxBytes: number,
): Promise<string | null> {
  // Decodes incrementally so a multi-byte character straddling a chunk
  // boundary — or the cap itself — does not turn into replacement characters.
  const decoder = new StringDecoder("utf8");
  let out = "";
  let seen = 0;

  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      const remaining = maxBytes - seen;

      if (buf.length >= remaining) {
        out += decoder.write(buf.subarray(0, remaining));
        out += decoder.end();
        stream.destroy();
        return out;
      }

      out += decoder.write(buf);
      seen += buf.length;
    }
    return out + decoder.end();
  } catch {
    return null;
  }
}
