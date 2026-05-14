import { Lexer, Parser } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { wrapInDocument } from './document.template';
import { BASE_SANITIZE_OPTIONS } from './sanitize-config';

const MARKED_OPTIONS = { gfm: true, breaks: true } as const;

// Use the lexer/parser pair to get a guaranteed-sync return type.
// `marked.parse` is typed `string | Promise<string>` so it would force a cast.
export const generateHtmlFromMarkdown = (markdownContent: string): string => {
  const tokens = new Lexer(MARKED_OPTIONS).lex(markdownContent);
  const rawHtml = new Parser(MARKED_OPTIONS).parse(tokens);
  const sanitized = sanitizeHtml(rawHtml, BASE_SANITIZE_OPTIONS);
  return wrapInDocument(sanitized);
};
