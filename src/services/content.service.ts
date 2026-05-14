import sanitizeHtml from "sanitize-html";
import { generateHtmlFromMarkdown } from "./markdown.service";
import { wrapInDocument } from "./document.template";
import { HTML_SANITIZE_OPTIONS } from "./sanitize-config";

type ContentType = "html" | "markdown";

interface ContentResult {
  html: string;
  detectedType: ContentType;
}

export const generateHtmlFromAnyContent = (content: string): ContentResult => {
  const detectedType = detectContentType(content);

  if (detectedType === "html") {
    const sanitized = sanitizeHtml(content, HTML_SANITIZE_OPTIONS);
    return { html: wrapInDocument(sanitized), detectedType: "html" };
  }

  return { html: generateHtmlFromMarkdown(content), detectedType: "markdown" };
};

const markdownIndicators = [
  /^#{1,6}\s/m,
  /^\s*[*\-+]\s/m,
  /^\s*\d+\.\s/m,
  /\*\*[^*]+\*\*/,
  /(^|\s)_[^_]+_(\s|$)/,
  /^\s*>\s/m,
  /^```/m,
  /^\s*\|.*\|\s*$/m,
  /\[[^\]]+\]\([^)]+\)/,
];

const detectContentType = (content: string): ContentType => {
  const trimmed = content.trim();

  if (trimmed.startsWith("<")) return "html";
  if (markdownIndicators.some((pattern) => pattern.test(trimmed))) return "markdown";
  return "html";
};
