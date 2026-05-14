import sanitizeHtml from 'sanitize-html';

const BASE_ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  'img',
  'h1',
  'h2',
  'sup',
  'sub',
  'del',
]);

const HTML_EXTRA_TAGS = [
  'figure',
  'figcaption',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'aside',
  'main',
];

const SHARED_ALLOWED_SCHEMES = ['https', 'data', 'mailto'];
const SHARED_IMG_SCHEMES = ['https', 'data'];

export const BASE_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: BASE_ALLOWED_TAGS,
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['id'],
  },
  allowedSchemes: SHARED_ALLOWED_SCHEMES,
  allowedSchemesByTag: { img: SHARED_IMG_SCHEMES },
  allowProtocolRelative: false,
};

export const HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  ...BASE_SANITIZE_OPTIONS,
  allowedTags: BASE_ALLOWED_TAGS.concat(HTML_EXTRA_TAGS),
  allowedAttributes: {
    ...BASE_SANITIZE_OPTIONS.allowedAttributes,
    '*': ['id', 'class', 'style'],
  },
};
