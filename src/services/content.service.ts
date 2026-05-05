import sanitizeHtml from "sanitize-html";
import { generateHtmlFromMarkdown } from "./markdown.service";
import { wrapInDocument } from "./document.template";

type ContentType = "html" | "markdown";

interface ContentResult {
  html: string;
  detectedType: ContentType;
}

const HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "img",
    "h1",
    "h2",
    "sup",
    "sub",
    "del",
    "figure",
    "figcaption",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "aside",
    "main",
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["id", "class", "style"],
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https", "data", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
};

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
