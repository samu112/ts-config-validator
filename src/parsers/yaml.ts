import type { ParserFn } from '../types';

/**
 * YAML parser backed by the `yaml` package (optional peer dependency).
 * Throws a helpful error if `yaml` is not installed.
 *
 * Options used:
 *   schema: 'core'     — prevents auto-conversion of unquoted ISO date strings
 *                        to native Date objects (values arrive as plain strings)
 *   uniqueKeys: true   — surfaces duplicate keys as a YAMLParseError instead of
 *                        silently applying last-write-wins
 */
export const yamlParser: ParserFn = (content: string): Record<string, unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let yaml: any;
  try {
    yaml = require('yaml');
  } catch {
    throw new Error(
      'The "yaml" package is required for YAML parsing.\nInstall it with: npm install yaml'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return yaml.parse(content, { schema: 'core', uniqueKeys: true }) as Record<string, unknown>;
};