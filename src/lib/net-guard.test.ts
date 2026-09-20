import { describe, expect, it, vi } from "vitest";
import { isUnsafeAddress, resolveSafeTarget } from "./net-guard";

describe("isUnsafeAddress", () => {
  it.each([
    ["0.0.0.0", "unspecified"],
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback range"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "carrier NAT"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
  ])("refuses %s (%s)", (ip) => {
    expect(isUnsafeAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "1.1.1.1"])(
    "allows the public address %s",
    (ip) => {
      expect(isUnsafeAddress(ip)).toBe(false);
    },
  );

  it.each([
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["ff02::1", "multicast"],
  ])("refuses IPv6 %s (%s)", (ip) => {
    expect(isUnsafeAddress(ip)).toBe(true);
  });

  it.each(["2606:4700:4700::1111", "2001:4860:4860::8888"])(
    "allows the public IPv6 address %s",
    (ip) => {
      expect(isUnsafeAddress(ip)).toBe(false);
    },
  );

  it("sees through an IPv4-mapped loopback address", () => {
    expect(isUnsafeAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("sees through an IPv4-mapped metadata address", () => {
    expect(isUnsafeAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("sees through the hex spelling of a mapped private address", () => {
    // ::ffff:0a00:0001 is 10.0.0.1
    expect(isUnsafeAddress("::ffff:0a00:0001")).toBe(true);
  });

  it("allows an IPv4-mapped public address", () => {
    expect(isUnsafeAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("treats an unparseable address as unsafe", () => {
    expect(isUnsafeAddress("not-an-ip")).toBe(true);
  });
});

describe("resolveSafeTarget", () => {
  const lookupTo = (...addresses: string[]) =>
    vi.fn(async () =>
      addresses.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      })),
    );

  it("allows a public hostname that resolves to a public address", async () => {
    const lookup = lookupTo("93.184.216.34");
    const target = await resolveSafeTarget("https://example.com/menu", lookup);

    expect(target).not.toBeNull();
    expect(target!.address).toBe("93.184.216.34");
    expect(target!.url.hostname).toBe("example.com");
  });

  it("refuses a public hostname that resolves to loopback", async () => {
    // The bypass a string-only check misses entirely.
    const lookup = lookupTo("127.0.0.1");
    expect(await resolveSafeTarget("https://evil.example/", lookup)).toBeNull();
  });

  it("refuses a public hostname that resolves to the metadata address", async () => {
    const lookup = lookupTo("169.254.169.254");
    expect(await resolveSafeTarget("https://evil.example/", lookup)).toBeNull();
  });

  it("refuses when only one of several answers is private", async () => {
    const lookup = lookupTo("93.184.216.34", "10.0.0.1");
    expect(await resolveSafeTarget("https://evil.example/", lookup)).toBeNull();
  });

  it("refuses a hostname resolving to an IPv4-mapped private address", async () => {
    const lookup = lookupTo("::ffff:10.0.0.1");
    expect(await resolveSafeTarget("https://evil.example/", lookup)).toBeNull();
  });

  it("refuses a literal private address without consulting DNS", async () => {
    const lookup = lookupTo("93.184.216.34");
    expect(await resolveSafeTarget("http://169.254.169.254/", lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a non-http scheme without consulting DNS", async () => {
    const lookup = lookupTo("93.184.216.34");
    expect(await resolveSafeTarget("file:///etc/passwd", lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses a name that does not resolve", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    expect(await resolveSafeTarget("https://nope.example/", lookup)).toBeNull();
  });

  it("refuses a name with no answers", async () => {
    const lookup = vi.fn(async () => []);
    expect(await resolveSafeTarget("https://nope.example/", lookup)).toBeNull();
  });

  it("refuses malformed input", async () => {
    const lookup = lookupTo("93.184.216.34");
    expect(await resolveSafeTarget("nonsense", lookup)).toBeNull();
  });

  it("refuses localhost by name even if DNS claims it is public", async () => {
    const lookup = lookupTo("93.184.216.34");
    expect(await resolveSafeTarget("http://localhost/admin", lookup)).toBeNull();
  });

  it("reports the address family so the socket can be pinned", async () => {
    const lookup = lookupTo("2606:4700:4700::1111");
    const target = await resolveSafeTarget("https://example.com/", lookup);
    expect(target!.family).toBe(6);
  });
});
