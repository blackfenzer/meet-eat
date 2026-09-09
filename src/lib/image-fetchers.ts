import { isSafeFetchUrl } from "./activity-image";

/**
 * The network side of image resolution. Deliberately thin: the decisions live
 * in activity-image.ts, which is unit-tested, so these only have to fetch
 * carefully.
 */

const TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512 * 1024;
const USER_AGENT = "meet-and-eat/1.0 (+link preview)";

async function fetchOnce(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      // Redirects are followed by hand below: letting fetch follow them would
      // undo the safe-URL check, since a public page can redirect straight to
      // a cloud metadata address.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
    });
  } catch {
    return null;
  }
}

/** Returns a page's HTML, or null if it cannot be read safely. */
export async function fetchPage(url: string): Promise<string | null> {
  if (!isSafeFetchUrl(url)) return null;

  let current = url;
  // One redirect hop is common (http to https, or a trailing slash); each hop
  // is re-checked before it is followed.
  for (let hop = 0; hop < 2; hop++) {
    const res = await fetchOnce(current);
    if (!res) return null;

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;

      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return null;
      }
      if (!isSafeFetchUrl(next)) return null;
      current = next;
      continue;
    }

    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return null;

    const buffer = await res.arrayBuffer();
    // Capped so an enormous page cannot exhaust memory.
    return Buffer.from(buffer.slice(0, MAX_HTML_BYTES)).toString("utf8");
  }

  return null;
}

/** Returns a stock photo URL for a tag, or null when Pexels is unavailable. */
export async function fetchStock(tag: string): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const query = encodeURIComponent(tag.trim() || "restaurant food");
  try {
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
