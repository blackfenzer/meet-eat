/**
 * Works out which picture to show for an activity.
 *
 * SPEC.md's order: a pasted image URL is used as-is; a pasted web page is
 * fetched server-side and its og:image taken; failing both, a stock photo keyed
 * to a cuisine tag. Nothing is ever scraped from a search engine — only a URL
 * the user typed themselves.
 */

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif|bmp|svg)$/i;

export type ImageInputKind = "empty" | "direct-image" | "page" | "unusable";

function parse(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

export function classifyImageInput(raw: string): ImageInputKind {
  if (!raw.trim()) return "empty";

  const url = parse(raw);
  if (!url) return "unusable";
  if (url.protocol !== "http:" && url.protocol !== "https:") return "unusable";

  return IMAGE_EXTENSIONS.test(url.pathname) ? "direct-image" : "page";
}

/**
 * Whether the server may fetch this URL.
 *
 * The user supplies the address and the server makes the request, which is a
 * server-side request forgery risk: without this check, pasting
 * `http://169.254.169.254/...` would have the server read its own cloud
 * metadata — credentials included — and hand it back as a picture.
 */
export function isSafeFetchUrl(raw: string): boolean {
  const url = parse(raw);
  if (!url) return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;
  // Cloud metadata endpoints are commonly reached by name, not just by address.
  if (host.endsWith(".internal") || host.endsWith(".local")) return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 127) return false;               // this host
    if (a === 10) return false;                            // private
    if (a === 192 && b === 168) return false;              // private
    if (a === 172 && b >= 16 && b <= 31) return false;     // private
    if (a === 169 && b === 254) return false;              // link-local / metadata
  }

  return true;
}

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+(?:property|name)\s*=\s*["']og:image["'][^>]*?content\s*=\s*["']([^"']+)["']/i,
  /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*?(?:property|name)\s*=\s*["']og:image["']/i,
];

export function extractOgImage(html: string, baseUrl: string): string | null {
  for (const pattern of OG_IMAGE_PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;

    try {
      const resolved = new URL(match[1], baseUrl);
      // The page controls this value, so it gets the same scheme check as input.
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
      return resolved.toString();
    } catch {
      return null;
    }
  }
  return null;
}

export type ImageResolution = {
  url: string | null;
  source: "direct" | "og" | "stock" | "none";
};

export type ImageDeps = {
  /** Returns the page's HTML, or null if it could not be read. */
  fetchPage: (url: string) => Promise<string | null>;
  /** Returns a stock photo URL for a tag, or null. */
  fetchStock: (tag: string) => Promise<string | null>;
};

export async function resolveActivityImage(
  input: { imageInput: string; tag: string },
  deps: ImageDeps,
): Promise<ImageResolution> {
  const kind = classifyImageInput(input.imageInput);

  if (kind === "direct-image" && isSafeFetchUrl(input.imageInput)) {
    // Served straight to the browser rather than fetched here, so it only needs
    // to be a public address.
    return { url: input.imageInput.trim(), source: "direct" };
  }

  if (kind === "page" && isSafeFetchUrl(input.imageInput)) {
    const html = await deps.fetchPage(input.imageInput.trim());
    if (html) {
      const og = extractOgImage(html, input.imageInput.trim());
      if (og) return { url: og, source: "og" };
    }
  }

  const stock = await deps.fetchStock(input.tag);
  return stock ? { url: stock, source: "stock" } : { url: null, source: "none" };
}
