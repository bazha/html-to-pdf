import { describe, it, expect } from "vitest";
import { generateHtmlFromAnyContent } from "../../src/services/content.service";

describe("content.service", () => {
  it("detects HTML content, sanitizes and wraps in document", () => {
    const html = "<h1>Hello</h1><p>World</p>";
    const result = generateHtmlFromAnyContent(html);

    expect(result.detectedType).toBe("html");
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<h1>Hello</h1>");
    expect(result.html).toContain("<p>World</p>");
  });

  it("strips <script> and external resource refs from HTML input", () => {
    const html =
      '<h1>Hi</h1><script>fetch("//evil")</script><iframe src="http://evil"></iframe>';
    const result = generateHtmlFromAnyContent(html);

    expect(result.detectedType).toBe("html");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("<iframe");
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

  it("treats markdown with an inline HTML tag as markdown (not HTML)", () => {
    const markdown = "# Heading\n\nA line with a <br> inline tag and **bold**.";
    const result = generateHtmlFromAnyContent(markdown);

    expect(result.detectedType).toBe("markdown");
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<h1");
  });
});

