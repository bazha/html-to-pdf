import { generateHtmlFromMarkdown } from "./markdown.service";

type ContentType = "html" | "markdown";

interface ContentResult {
  html: string;
  detectedType: ContentType;
}

/** Detects HTML vs Markdown and returns normalized HTML. */
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

const htmlIndicators = [
  /^<!DOCTYPE/i,
  /^<html/i,
  /^<head/i,
  /^<body/i,
  /<[^>]+>/,
  /&[a-zA-Z]+;/,
];

const markdownIndicators = [
  /^#\s/,
  /^\*\s/,
  /^\d+\.\s/,
  /^\*\*.*\*\*/,
  /^\*.*\*/,
  /^>/,
  /^```/,
  /^\|.*\|/,
];

const detectContentType = (content: string): ContentType => {
  const trimmed = content.trim();

  if (htmlIndicators.some((pattern) => pattern.test(trimmed))) return "html";
  if (markdownIndicators.some((pattern) => pattern.test(trimmed))) return "markdown";
  return "html";
};
