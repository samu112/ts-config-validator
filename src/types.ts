import { KIND, ENUM_VALUES, NUM_ENUM_VALUES, BOOL_ENUM_VALUES } from './constants';

// ----------------------------------------------------------------
// Date types
// ----------------------------------------------------------------

export type DateParts = {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

export type DateFormatDescriptor = {
  regex: RegExp;
  parse: (value: string) => DateParts | null;
};

// ----------------------------------------------------------------
// Constraint types
// ----------------------------------------------------------------

/** Pre-compiled @pattern result stored on StringConstraints at AST-parse time. */
export type CompiledPattern = { regex: RegExp; display: string };

/**
 * Carries all JSDoc string constraints extracted at AST-parse time.
 * `compiledPattern` and `compiledDateFormat` are pre-built so that specErrors
 * from broken annotations are emitted even when the property is absent from YAML.
 *
 * compiledPattern: undefined = no @pattern tag
 *                  null      = broken pattern (specError already emitted)
 *                  object    = ready to test
 */
export type StringConstraints = {
  [KIND]: 'stringConstraints';
  min?: string;
  max?: string;
  length?: number;
  pattern?: string;
  dateFormat?: string;
  /** Set when this constraint came from a native `Date`-typed property. */
  isNativeDate?: true;
  compiledPattern?: CompiledPattern | null;
  compiledDateFormat?: DateFormatDescriptor;
  /** Zero-padded string comparables (avoids MAX_SAFE_INTEGER precision loss). */
  minDateComparable?: string;
  maxDateComparable?: string;
  /** Pre-parsed integer length bounds (only set when @dateFormat is absent). */
  effectiveMin?: number;
  effectiveMax?: number;
};

export type NumberConstraints = {
  [KIND]: 'numberConstraints';
  min?: number;
  max?: number;
  integer?: boolean;
};

// ----------------------------------------------------------------
// Shape sentinels
// ----------------------------------------------------------------

/** Array and tuple types. Element validation is not implemented. */
export type ArrayShape = { [KIND]: 'array' };

/**
 * Interface mixing named properties with an index signature.
 * Named properties are validated normally; the reverse check is skipped at this
 * level so extra keys permitted by the index signature are not flagged.
 */
export type ObjectWithIndexShape = {
  [KIND]: 'objectWithIndex';
  properties: Shape;
  valueShape: unknown;
};

/** Pure `Record<string, T>` with no named properties. */
export type RecordShape = { [KIND]: 'record'; valueShape: unknown };

/** Unsupported unions, any/unknown typed properties — skips all enforcement. */
export type AnyShape = { [KIND]: 'any' };

/** Property typed as the literal `null`. Only an explicit YAML null is valid. */
export type NullOnlyShape = { [KIND]: 'nullOnly' };

/**
 * Native `Date` type. YAML values always arrive as strings (yaml.parse uses
 * `{ schema: 'core' }`). Validated as ISO 8601 unless @dateFormat overrides.
 */
export type DateShape = { [KIND]: 'date' };

/** String literal union or single string literal. */
export type StringEnumShape = { [KIND]: 'stringEnum'; [ENUM_VALUES]: string[] };

/** Numeric literal union or TypeScript numeric enum. */
export type NumberEnumShape = {
  [KIND]: 'numberEnum';
  [NUM_ENUM_VALUES]: number[];
};

/** Boolean literal shape. */
export type BooleanEnumShape = {
  [KIND]: 'booleanEnum';
  [BOOL_ENUM_VALUES]: boolean[];
};

// ----------------------------------------------------------------
// Shape — recursive object type
// ----------------------------------------------------------------

export interface Shape {
  [key: string]:
    | string
    | number
    | boolean
    | StringEnumShape
    | NumberEnumShape
    | BooleanEnumShape
    | StringConstraints
    | NumberConstraints
    | ArrayShape
    | ObjectWithIndexShape
    | RecordShape
    | AnyShape
    | NullOnlyShape
    | DateShape
    | Shape;
}

// ----------------------------------------------------------------
// Type guards
// ----------------------------------------------------------------

export function isStringEnumShape(v: unknown): v is StringEnumShape {
  return typeof v === 'object' && v !== null && (v as StringEnumShape)[KIND] === 'stringEnum';
}

export function isNumberEnumShape(v: unknown): v is NumberEnumShape {
  return typeof v === 'object' && v !== null && (v as NumberEnumShape)[KIND] === 'numberEnum';
}

export function isBooleanEnumShape(v: unknown): v is BooleanEnumShape {
  return typeof v === 'object' && v !== null && (v as BooleanEnumShape)[KIND] === 'booleanEnum';
}

export function isStringConstraint(v: unknown): v is StringConstraints {
  return typeof v === 'object' && v !== null && (v as StringConstraints)[KIND] === 'stringConstraints';
}

export function isNumberConstraint(v: unknown): v is NumberConstraints {
  return typeof v === 'object' && v !== null && (v as NumberConstraints)[KIND] === 'numberConstraints';
}

export function isArrayShape(v: unknown): v is ArrayShape {
  return typeof v === 'object' && v !== null && (v as ArrayShape)[KIND] === 'array';
}

export function isObjectWithIndexShape(v: unknown): v is ObjectWithIndexShape {
  return typeof v === 'object' && v !== null && (v as ObjectWithIndexShape)[KIND] === 'objectWithIndex';
}

export function isRecordShape(v: unknown): v is RecordShape {
  return typeof v === 'object' && v !== null && (v as RecordShape)[KIND] === 'record';
}

export function isAnyShape(v: unknown): v is AnyShape {
  return typeof v === 'object' && v !== null && (v as AnyShape)[KIND] === 'any';
}

export function isNullOnlyShape(v: unknown): v is NullOnlyShape {
  return typeof v === 'object' && v !== null && (v as NullOnlyShape)[KIND] === 'nullOnly';
}

export function isDateShape(v: unknown): v is DateShape {
  return typeof v === 'object' && v !== null && (v as DateShape)[KIND] === 'date';
}

// ----------------------------------------------------------------
// Public API types
// ----------------------------------------------------------------

export type ParserFn = (content: string) => Record<string, unknown>;

/**
 * Maps logical constraint names to the JSDoc tag strings that activate them.
 * Defaults align with ts-to-zod conventions. Override any subset via `tags`
 * in `ValidateOptions`, or pass `LEGACY_TAG_MAP` for the original @min/@max style.
 */
export type TagMap = {
  /** Default: 'minLength' */
  stringMin: string;
  /** Default: 'maxLength' */
  stringMax: string;
  /** Default: 'length' */
  length: string;
  /** Default: 'pattern' */
  pattern: string;
  /** Default: 'dateFormat' */
  dateFormat: string;
  /** Default: 'min' */
  numberMin: string;
  /** Default: 'max' */
  numberMax: string;
  /** Default: 'integer' */
  integer: string;
};

export type ValidateOptions = {
  /** Absolute or relative path to the TypeScript file containing the interface/type. */
  interfaceFile: string;
  /** Name of the interface or type alias to validate against. Default: 'Configuration'. */
  typeName?: string;
  /**
   * List of file paths to validate.
   * Use `fast-glob` or `glob.sync` to expand patterns before passing here,
   * or use the CLI which handles glob expansion automatically.
   */
  files: string[];
  /**
   * Parser to use: 'yaml', 'json', or a custom synchronous function.
   * Defaults to auto-detection from the file extension (.yaml/.yml → yaml, .json → json).
   */
  parser?: 'yaml' | 'json' | ParserFn;
  /** Dot-notation key paths to skip during validation (e.g. 'application.renderer'). */
  excludeKeys?: string[];
  /**
   * Override individual JSDoc tag names.
   * Unspecified tags use the defaults (ts-to-zod conventions).
   */
  tags?: Partial<TagMap>;
};

export type FileResult = {
  file: string;
  exists: boolean;
  /** Set when the file could not be parsed (YAML/JSON syntax error, etc.). */
  parseError?: string;
  missingKeys: string[];
  unknownKeys: string[];
  wrongTypeKeys: string[];
  invalidEnumKeys: string[];
};

export type ValidateResult = {
  /** Interface-level errors: bad JSDoc annotations, unsupported TS types, etc. */
  specErrors: string[];
  /** Per-file validation results. */
  files: FileResult[];
};

export type BuildShapeResult = {
  shape: Shape;
  optionalPaths: Set<string>;
  nullablePaths: Set<string>;
  specErrors: string[];
};
