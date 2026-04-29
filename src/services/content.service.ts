import { generateHtmlFromMarkdown } from "./markdown.service";

type ContentType = "html" | "markdown";

interface ContentResult {
  html: string;
  detectedType: ContentType;
}

export const generateHtmlFromAnyContent = (content: string): ContentResult => {
  if (!content || typeof content !== "string") {
    throw new Error("Content must be a non-empty string");
  }

  const detectedType = detectContentType(content);

  if (detectedType === "html") {
    return { html: content, detectedType: "html" };
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
