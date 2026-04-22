import { describe, it, expect } from "vitest";
import { generateHtmlFromMarkdown } from "../../src/services/markdown.service";

describe("markdown.service", () => {
  it("wraps markdown conversion in full HTML document", () => {
    const html = generateHtmlFromMarkdown("# Title\n\nParagraph");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<body>");
    expect(html).toContain("<h1");
  });

  it("applies styling and preserves inline markdown", () => {
    const html = generateHtmlFromMarkdown("This is **bold** and *italic*");

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<style>");
  });
});

