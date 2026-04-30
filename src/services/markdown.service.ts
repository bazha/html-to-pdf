import { marked, lexer, parser } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { wrapInDocument } from './document.template';

marked.setOptions({ gfm: true, breaks: true });

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img',
    'h1',
    'h2',
    'sup',
    'sub',
    'del',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['id'],
  },
  allowedSchemes: ['http', 'https', 'data', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
};

// Use the lexer/parser pair to get a guaranteed-sync return type.
// `marked.parse` is typed `string | Promise<string>` so it would force a cast.
export const generateHtmlFromMarkdown = (markdownContent: string): string => {
  const rawHtml = parser(lexer(markdownContent));
  const sanitized = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
  return wrapInDocument(sanitized);
};
