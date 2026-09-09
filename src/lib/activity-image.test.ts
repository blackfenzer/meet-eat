import { describe, expect, it, vi } from "vitest";
import {
  classifyImageInput,
  extractOgImage,
  isSafeFetchUrl,
  resolveActivityImage,
} from "./activity-image";

describe("classifyImageInput", () => {
  it("treats an empty value as nothing supplied", () => {
    expect(classifyImageInput("")).toBe("empty");
    expect(classifyImageInput("   ")).toBe("empty");
  });

  it.each([
    "https://cdn.example.com/photo.jpg",
    "https://cdn.example.com/photo.jpeg",
    "https://cdn.example.com/photo.PNG",
    "https://cdn.example.com/photo.webp",
    "https://cdn.example.com/photo.avif",
    "https://cdn.example.com/photo.jpg?width=800",
  ])("recognises %s as a direct image", (url) => {
    expect(classifyImageInput(url)).toBe("direct-image");
  });

  it("treats an ordinary web page as a page to inspect", () => {
    expect(classifyImageInput("https://example.com/our-restaurant")).toBe("page");
  });

  it("rejects text that is not a URL", () => {
    expect(classifyImageInput("just some words")).toBe("unusable");
  });

  it("rejects a javascript: URL", () => {
    expect(classifyImageInput("javascript:alert(1)")).toBe("unusable");
  });

  it("rejects a data: URL", () => {
    expect(classifyImageInput("data:image/png;base64,AAAA")).toBe("unusable");
  });

  it("rejects a non-web scheme", () => {
    expect(classifyImageInput("ftp://example.com/photo.jpg")).toBe("unusable");
  });
});

describe("isSafeFetchUrl", () => {
  it("allows an ordinary public https page", () => {
    expect(isSafeFetchUrl("https://example.com/menu")).toBe(true);
  });

  it.each([
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.4.5/",
    "http://172.31.255.255/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
  ])("refuses to fetch %s", (url) => {
    expect(isSafeFetchUrl(url)).toBe(false);
  });

  it("allows a public address that merely looks similar", () => {
    expect(isSafeFetchUrl("http://172.32.0.1/")).toBe(true);
  });

  it("refuses a non-http scheme", () => {
    expect(isSafeFetchUrl("file:///etc/passwd")).toBe(false);
  });

  it("refuses malformed input", () => {
    expect(isSafeFetchUrl("nonsense")).toBe(false);
  });
});

describe("extractOgImage", () => {
  const base = "https://example.com/place";

  it("finds an og:image", () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/a.jpg">`;
    expect(extractOgImage(html, base)).toBe("https://cdn.example.com/a.jpg");
  });

  it("copes with single quotes", () => {
    const html = `<meta property='og:image' content='https://cdn.example.com/b.jpg'>`;
    expect(extractOgImage(html, base)).toBe("https://cdn.example.com/b.jpg");
  });

  it("copes with the attributes in the other order", () => {
    const html = `<meta content="https://cdn.example.com/c.jpg" property="og:image">`;
    expect(extractOgImage(html, base)).toBe("https://cdn.example.com/c.jpg");
  });

  it("accepts the name= spelling some sites use", () => {
    const html = `<meta name="og:image" content="https://cdn.example.com/d.jpg">`;
    expect(extractOgImage(html, base)).toBe("https://cdn.example.com/d.jpg");
  });

  it("resolves a relative image against the page", () => {
    const html = `<meta property="og:image" content="/img/e.jpg">`;
    expect(extractOgImage(html, base)).toBe("https://example.com/img/e.jpg");
  });

  it("returns null when the page has no og:image", () => {
    expect(extractOgImage("<html><head><title>x</title></head></html>", base)).toBeNull();
  });

  it("ignores an og:image that is not fetchable over http", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)">`;
    expect(extractOgImage(html, base)).toBeNull();
  });
});

describe("resolveActivityImage", () => {
  const stock = "https://images.pexels.com/stock.jpg";

  function deps(over: Partial<Parameters<typeof resolveActivityImage>[1]> = {}) {
    return {
      fetchPage: vi.fn(async () => ""),
      fetchStock: vi.fn(async () => stock),
      ...over,
    };
  }

  it("uses a direct image URL as given, without fetching anything", async () => {
    const d = deps();
    const r = await resolveActivityImage(
      { imageInput: "https://cdn.example.com/a.jpg", tag: "thai food" },
      d,
    );
    expect(r).toEqual({ url: "https://cdn.example.com/a.jpg", source: "direct" });
    expect(d.fetchPage).not.toHaveBeenCalled();
    expect(d.fetchStock).not.toHaveBeenCalled();
  });

  it("pulls og:image from a page the user supplied", async () => {
    const d = deps({
      fetchPage: vi.fn(async () => `<meta property="og:image" content="https://cdn.example.com/og.jpg">`),
    });
    const r = await resolveActivityImage(
      { imageInput: "https://example.com/place", tag: "thai food" },
      d,
    );
    expect(r).toEqual({ url: "https://cdn.example.com/og.jpg", source: "og" });
  });

  it("falls back to a stock photo when the page has no og:image", async () => {
    const d = deps({ fetchPage: vi.fn(async () => "<html></html>") });
    const r = await resolveActivityImage(
      { imageInput: "https://example.com/place", tag: "thai food" },
      d,
    );
    expect(r).toEqual({ url: stock, source: "stock" });
  });

  it("falls back to stock when nothing was supplied", async () => {
    const d = deps();
    const r = await resolveActivityImage({ imageInput: "", tag: "thai food" }, d);
    expect(r).toEqual({ url: stock, source: "stock" });
    expect(d.fetchPage).not.toHaveBeenCalled();
  });

  it("never fetches a private address, even if asked to", async () => {
    const d = deps();
    const r = await resolveActivityImage(
      { imageInput: "http://169.254.169.254/latest/meta-data/", tag: "thai food" },
      d,
    );
    expect(d.fetchPage).not.toHaveBeenCalled();
    expect(r.source).toBe("stock");
  });

  it("falls back to stock when the page cannot be fetched", async () => {
    const d = deps({ fetchPage: vi.fn(async () => null) });
    const r = await resolveActivityImage(
      { imageInput: "https://example.com/place", tag: "thai food" },
      d,
    );
    expect(r).toEqual({ url: stock, source: "stock" });
  });

  it("reports no image when even stock is unavailable", async () => {
    const d = deps({ fetchStock: vi.fn(async () => null) });
    const r = await resolveActivityImage({ imageInput: "", tag: "thai food" }, d);
    expect(r).toEqual({ url: null, source: "none" });
  });
});
