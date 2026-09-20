import { isIP } from "node:net";

/**
 * Decides whether the server may open a connection to a user-supplied URL.
 *
 * Checking the URL string alone is not enough: `http://evil.example/` whose DNS
 * record points at `169.254.169.254` looks perfectly public as text. So the
 * hostname is resolved first and every answer is checked, and the caller is
 * handed the validated address to connect to — connecting by name again would
 * let DNS return something different the second time (rebinding).
 */

export type ResolvedAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

export type SafeTarget = {
  url: URL;
  /** The validated address to open the socket to. */
  address: string;
  family: number;
};

/** Hostnames that must never be fetched, whatever DNS says about them. */
const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local"];
const BLOCKED_HOSTS = new Set(["localhost"]);

function unsafeIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true;                          // 0.0.0.0/8 unspecified
  if (a === 127) return true;                        // loopback
  if (a === 10) return true;                         // private
  if (a === 192 && b === 168) return true;           // private
  if (a === 172 && b >= 16 && b <= 31) return true;  // private
  if (a === 169 && b === 254) return true;           // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true;             // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                         // multicast, reserved, broadcast

  return false;
}

function unsafeIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // An IPv4-mapped address is really an IPv4 address wearing a hat, in either
  // dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1) spelling.
  const mapped = /^::ffff:(.+)$/.exec(lower);
  if (mapped) {
    const rest = mapped[1];
    if (isIP(rest) === 4) return unsafeIpv4(rest);

    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
      return unsafeIpv4(dotted);
    }
    return true;
  }

  if (lower === "::" || lower === "::0") return true;  // unspecified
  if (lower === "::1") return true;                    // loopback

  const head = lower.split(":")[0];
  const group = parseInt(head || "0", 16);
  if (Number.isNaN(group)) return true;

  if ((group & 0xfe00) === 0xfc00) return true;  // fc00::/7 unique local
  if ((group & 0xffc0) === 0xfe80) return true;  // fe80::/10 link-local
  if ((group & 0xff00) === 0xff00) return true;  // ff00::/8 multicast

  return false;
}

/** Whether this literal IP address is one the server must not connect to. */
export function isUnsafeAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return unsafeIpv4(ip);
  if (kind === 6) return unsafeIpv6(ip);
  // Not an address at all — treat as unsafe rather than guessing.
  return true;
}

function blockedByName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

const defaultLookup: LookupFn = async (hostname) => {
  const { lookup } = await import("node:dns/promises");
  // verbatim keeps the resolver's own ordering; every answer is checked anyway.
  return lookup(hostname, { all: true, verbatim: true });
};

/**
 * Validates a URL the server intends to fetch and returns the address to
 * connect to, or null if it must not be fetched.
 */
export async function resolveSafeTarget(
  raw: string,
  lookup: LookupFn = defaultLookup,
): Promise<SafeTarget | null> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (blockedByName(url.hostname)) return null;

  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) !== 0) {
    // Already an address: no DNS involved, so nothing can change under us.
    if (isUnsafeAddress(literal)) return null;
    return { url, address: literal, family: isIP(literal) };
  }

  let answers: ResolvedAddress[];
  try {
    answers = await lookup(url.hostname);
  } catch {
    return null;
  }
  if (answers.length === 0) return null;

  // Every answer must be acceptable. A name that resolves to one public and one
  // private address is a bypass attempt, not a configuration to work around.
  for (const answer of answers) {
    if (isUnsafeAddress(answer.address)) return null;
  }

  const chosen = answers[0];
  return { url, address: chosen.address, family: chosen.family };
}
