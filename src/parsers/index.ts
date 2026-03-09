import path from 'path';
import type { ParserFn } from '../types';
import { jsonParser } from './json';
import { yamlParser } from './yaml';

/**
 * Resolves the parser function to use for a given file.
 *
 * Resolution order:
 *   1. Custom ParserFn passed directly.
 *   2. Explicit 'yaml' or 'json' string.
 *   3. Auto-detection from the file extension (.yaml / .yml → yaml, .json → json).
 *
 * Throws when the extension is unrecognised and no explicit parser was provided.
 */
export function resolveParser(
  parser: 'yaml' | 'json' | ParserFn | undefined,
  filePath: string
): ParserFn {
  if (typeof parser === 'function') return parser;
  if (parser === 'json') return jsonParser;
  if (parser === 'yaml') return yamlParser;

  // Auto-detect from extension.
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return jsonParser;
  if (ext === '.yaml' || ext === '.yml') return yamlParser;

  throw new Error(
    `Cannot determine parser for "${filePath}": unrecognised extension "${ext}". ` +
      `Pass parser: 'yaml', 'json', or a custom ParserFn in ValidateOptions.`
  );
}