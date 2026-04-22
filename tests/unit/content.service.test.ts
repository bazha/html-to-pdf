import { describe, it, expect } from "vitest";
import { generateHtmlFromAnyContent } from "../../src/services/content.service";

describe("content.service", () => {
  it("detects HTML content and returns as-is", () => {
    const html = "<h1>Hello</h1><p>World</p>";
    const result = generateHtmlFromAnyContent(html);

    expect(result.detectedType).toBe("html");
    expect(result.html).toBe(html);
  });

  it("detects markdown content and converts to HTML", () => {
    const markdown = "# Hello\n\nThis is **bold**";
    const result = generateHtmlFromAnyContent(markdown);

    expect(result.detectedType).toBe("markdown");
    expect(result.html).toContain("<h1");
    expect(result.html).toContain("<strong>bold</strong>");
  });

  it("treats plain text with markdown patterns as markdown", () => {
    const markdown = "* item 1\n* item 2";
    const result = generateHtmlFromAnyContent(markdown);

    expect(result.detectedType).toBe("markdown");
    expect(result.html).toContain("<ul");
  });
});

