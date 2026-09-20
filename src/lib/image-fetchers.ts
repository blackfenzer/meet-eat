import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { readCapped } from "./read-capped";
import { resolveSafeTarget, type SafeTarget } from "./net-guard";

/**
 * The network side of image resolution. Deliberately thin: the decisions live
 * in activity-image.ts and net-guard.ts, which are unit-tested, so these only
 * have to fetch carefully.
 */

const TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;
const USER_AGENT = "meet-and-eat/1.0 (+link preview)";

/**
 * Issues one request to an already-validated target.
 *
 * The socket is pinned to the address that was validated, via `lookup`. Handing
 * the hostname to the stack again would let DNS answer differently the second
 * time — the rebinding trick that turns a public-looking name into a request to
 * a private address. The Host header and TLS SNI still use the real hostname,
 * so certificate validation is unaffected.
 */
function requestOnce(target: SafeTarget): Promise<IncomingMessage | null> {
  return new Promise((resolve) => {
    const send = target.url.protocol === "https:" ? httpsRequest : httpRequest;

    const req = send(
      target.url,
      {
        // Node calls this with `all: true` when autoSelectFamily is on (the
        // default since Node 20), and then expects an array rather than a
        // single address — answering the wrong shape fails with
        // "Invalid IP address: undefined".
        lookup: ((
          _hostname: string,
          options: { all?: boolean },
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string | Array<{ address: string; family: number }>,
            family?: number,
          ) => void,
        ) => {
          if (options?.all) {
            callback(null, [{ address: target.address, family: target.family }]);
          } else {
            callback(null, target.address, target.family);
          }
        }) as never,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": USER_AGENT,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => resolve(res),
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

/** Returns a page's HTML, or null if it cannot be read safely. */
export async function fetchPage(url: string): Promise<string | null> {
  let next: string | null = url;

  for (let hop = 0; hop <= MAX_REDIRECTS && next; hop++) {
    // Re-resolved and re-validated on every hop: the first URL being safe says
    // nothing about where it redirects to.
    const target = await resolveSafeTarget(next);
    if (!target) return null;

    const res = await requestOnce(target);
    if (!res) return null;

    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400) {
      const location = res.headers.location;
      res.destroy();
      if (!location) return null;
      try {
        next = new URL(location, target.url).toString();
      } catch {
        return null;
      }
      continue;
    }

    if (status < 200 || status >= 300) {
      res.destroy();
      return null;
    }

    const contentType = String(res.headers["content-type"] ?? "");
    if (!contentType.includes("text/html")) {
      res.destroy();
      return null;
    }

    return readCapped(res, MAX_HTML_BYTES);
  }

  return null;
}

/** Returns a stock photo URL for a tag, or null when Pexels is unavailable. */
export async function fetchStock(tag: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const query = encodeURIComponent(tag.trim() || "restaurant food");
  try {
    // A fixed, first-party endpoint, so none of the guard above applies.
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const data: unknown = await res.json();
    const photos = (data as { photos?: Array<{ src?: { landscape?: string } }> })?.photos;
    return photos?.[0]?.src?.landscape ?? null;
  } catch {
    return null;
  }
}
