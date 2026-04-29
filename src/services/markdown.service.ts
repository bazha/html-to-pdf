import { marked, lexer, parser } from 'marked';
import { wrapInDocument } from './document.template';

marked.setOptions({ gfm: true, breaks: true });

// Use the lexer/parser pair to get a guaranteed-sync return type.
// `marked.parse` is typed `string | Promise<string>` so it would force a cast.
export const generateHtmlFromMarkdown = (markdownContent: string): string =>
  wrapInDocument(parser(lexer(markdownContent)));
