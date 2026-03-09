import type { TagMap } from './types';

/**
 * Default tag map — aligned with ts-to-zod conventions.
 *
 * Strings:  @minLength, @maxLength, @length, @pattern, @dateFormat
 * Numbers:  @min, @max, @integer
 */
export const DEFAULT_TAG_MAP: TagMap = {
  stringMin: 'minLength',
  stringMax: 'maxLength',
  length: 'length',
  pattern: 'pattern',
  dateFormat: 'dateFormat',
  numberMin: 'min',
  numberMax: 'max',
  integer: 'integer',
};

/**
 * Legacy tag map — matches the original configuration-yaml.spec.ts conventions.
 * Both strings and numbers share @min / @max (distinguished by context).
 *
 * Strings:  @min, @max, @length, @pattern, @dateFormat
 * Numbers:  @min, @max, @integer
 */
export const LEGACY_TAG_MAP: TagMap = {
  stringMin: 'min',
  stringMax: 'max',
  length: 'length',
  pattern: 'pattern',
  dateFormat: 'dateFormat',
  numberMin: 'min',
  numberMax: 'max',
  integer: 'integer',
};

/** Merge caller-supplied overrides on top of the defaults. */
export function resolveTagMap(overrides?: Partial<TagMap>): TagMap {
  if (!overrides) return DEFAULT_TAG_MAP;
  return { ...DEFAULT_TAG_MAP, ...overrides };
}
