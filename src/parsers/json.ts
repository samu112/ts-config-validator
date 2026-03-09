import type { ParserFn } from '../types';

/** Standard JSON parser. Throws SyntaxError on malformed input. */
export const jsonParser: ParserFn = (content: string): Record<string, unknown> => {
  return JSON.parse(content) as Record<string, unknown>;
};
