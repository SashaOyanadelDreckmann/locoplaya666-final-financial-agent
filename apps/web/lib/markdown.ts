import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitiza contenido Markdown para prevenir XSS attacks
 * Whitelist de etiquetas HTML permitidas
 */
export const sanitizeMarkdown = (dirty: string): string => {
  const config = {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'a',
      'br',
      'p',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  };

  return DOMPurify.sanitize(dirty, config);
};

/**
 * Valida que el markdown no contenga patrones peligrosos
 */
export const validateMarkdownContent = (content: string): boolean => {
  // Patrones de ataque comunes
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onload=, etc
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(content));
};

export default {
  sanitizeMarkdown,
  validateMarkdownContent,
};
