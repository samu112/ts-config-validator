import * as fs from 'fs';
import * as path from 'path';
import type { ValidateOptions, ValidateResult, FileResult } from './types';
import { semanticType } from './collect';
import { loadShape } from './shape';
import { makeCollector } from './collect';
import { resolveTagMap } from './tag-map';
import { resolveParser } from './parsers/index';

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export { DEFAULT_TAG_MAP, LEGACY_TAG_MAP } from './tag-map';
export type {
  ValidateOptions,
  ValidateResult,
  FileResult,
  TagMap,
  ParserFn,
  BuildShapeResult,
  Shape,
} from './types';

/**
 * Validates one or more data files against a TypeScript interface or type alias.
 *
 * @example
 * ```typescript
 * import { validate } from 'ts-config-validator';
 * import path from 'path';
 *
 * const result = validate({
 *   interfaceFile: path.resolve(__dirname, '../src/config.ts'),
 *   typeName: 'Config',
 *   files: ['config/production.yaml', 'config/staging.yaml'],
 * });
 *
 * // In a Jest test:
 * expect(result.specErrors).toEqual([]);
 * result.files.forEach(r => {
 *   expect(r.missingKeys).toEqual([]);
 *   expect(r.unknownKeys).toEqual([]);
 *   expect(r.wrongTypeKeys).toEqual([]);
 * });
 * ```
 */
export function validate(options: ValidateOptions): ValidateResult {
  const {
    interfaceFile,
    typeName = 'Configuration',
    files,
    parser,
    excludeKeys = [],
    tags,
  } = options;

  const tagMap = resolveTagMap(tags);
  const excludeSet = new Set(excludeKeys);

  const { shape, optionalPaths, nullablePaths, specErrors } = loadShape({
    interfaceFile,
    typeName,
    tagMap,
  });

  const collectErrors = makeCollector(excludeSet);

  const fileResults: FileResult[] = files.map((file): FileResult => {
    const result: FileResult = {
      file,
      exists: false,
      missingKeys: [],
      unknownKeys: [],
      wrongTypeKeys: [],
      invalidEnumKeys: [],
    };

    if (!fs.existsSync(file)) return result;
    result.exists = true;

    let parsed: Record<string, unknown>;
    let parserFn;
    try {
      parserFn = resolveParser(parser, file);
    } catch (err) {
      result.parseError = (err as Error).message;
      return result;
    }

    try {
      parsed = parserFn(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      result.parseError = (err as Error).message;
      return result;
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      result.wrongTypeKeys.push(
        `(root): file parsed to ${parsed === null ? 'null' : semanticType(parsed)} ` +
          `instead of an object — the file may be empty or contain only a scalar value`
      );
      return result;
    }

    collectErrors(
      parsed,
      shape,
      optionalPaths,
      nullablePaths,
      result.missingKeys,
      result.unknownKeys,
      result.wrongTypeKeys,
      result.invalidEnumKeys
    );

    // Prefix every error message with the relative file path so that when
    // multiple config files are validated in one call it is immediately clear
    // which file the problem comes from — even if two files share the same
    // name but live in different directories (e.g. config/production/app.yaml
    // vs config/staging/app.yaml).
    // Falls back to the absolute path when the file lives outside cwd (e.g.
    // a temp fixture in tests).
    const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
    const label = rel.startsWith('..') ? file.replace(/\\/g, '/') : rel;
    const prefix = (msg: string) => `[${label}] ${msg}`;
    result.missingKeys    = result.missingKeys.map(prefix);
    result.unknownKeys    = result.unknownKeys.map(prefix);
    result.wrongTypeKeys  = result.wrongTypeKeys.map(prefix);
    result.invalidEnumKeys = result.invalidEnumKeys.map(prefix);

    return result;
  });

  return { specErrors, files: fileResults };
}