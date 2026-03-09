# ts-config-validator [![npm version](https://img.shields.io/npm/v/ts-config-validator.svg)](https://www.npmjs.com/package/ts-config-validator)

> Validate YAML/JSON config files against a TypeScript interface — with JSDoc constraints, no code generation, no separate schema file.

## How it works

`ts-config-validator` uses the **TypeScript compiler API** at test/CI time to read your interface directly from source. It walks every property, extracts JSDoc constraint annotations, and then checks your config files against the resulting shape. Broken annotations, unsupported types, and validation failures are all reported as structured arrays so you can assert on them in Jest or fail a CI step via the CLI.

## Installation

```sh
npm install --save-dev ts-config-validator typescript

# If you are validating YAML files (optional peer dependency):
npm install yaml
```

## Quick start

### 1. Annotate your interface

```typescript
// src/config.ts
export interface Config {
  /**
   * @minLength 3
   * @maxLength 50
   */
  appName: string;

  /**
   * @min 1024
   * @max 65535
   * @integer
   */
  port: number;

  environment: 'development' | 'production' | 'test';
}
```

### 2a. Validate in Jest

```typescript
// tests/config.test.ts
import { validate } from 'ts-config-validator';
import path from 'path';

describe('config files', () => {
  const result = validate({
    interfaceFile: path.resolve(__dirname, '../src/config.ts'),
    typeName: 'Config',
    files: ['config/production.yaml', 'config/staging.yaml'],
  });

  it('should have no invalid JSDoc annotations or unsupported types', () => {
    expect(result.specErrors).toEqual([]);
  });

  result.files.forEach(({ file, ...r }) => {
    it(`${file} should exist`, () => expect(r.exists).toBe(true));
    if (!r.exists) return;

    it(`${file} should have all required keys`, () => expect(r.missingKeys).toEqual([]));
    it(`${file} should have no unknown keys`,   () => expect(r.unknownKeys).toEqual([]));
    it(`${file} should have correct types`,     () => expect(r.wrongTypeKeys).toEqual([]));
    it(`${file} should have valid enum values`, () => expect(r.invalidEnumKeys).toEqual([]));
  });
});
```

### 2b. Use the CLI

```sh
npx ts-config-validator \
  --interface src/config.ts \
  --type Config \
  --files "config/*.yaml"

# Exit code 0 = all files valid, 1 = errors found.
```

---

## When to run validation

Config validation is most useful at three points in a typical workflow. You can use any combination of them.

### In your test suite (recommended)

The Jest integration shown above is the most common approach. Validation runs as part of your normal `npm test` and you get structured failure output if a config file is broken.

### On every commit — pre-commit hook with Husky

Catch broken configs before they ever reach the repo. Install [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged):

```sh
npm install --save-dev husky lint-staged
npx husky init
```

Then add to your `package.json`:

```json
{
  "lint-staged": {
    "config/**/*.{yaml,json}": [
      "npx ts-config-validator --interface src/config.ts --type Config --files"
    ]
  }
}
```

And register the hook in `.husky/pre-commit`:

```sh
npx lint-staged
```

This way only the files you actually changed are re-validated on each commit.

### On every push or pull request — CI pipeline

Add a validation step to your CI workflow so bad configs are caught even if someone bypasses the pre-commit hook. Example for GitHub Actions:

```yaml
# .github/workflows/validate.yml
name: Validate config files

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx ts-config-validator --interface src/config.ts --type Config --files "config/*.yaml"
```

Exit code `1` will fail the pipeline automatically if any config file is invalid.

### Which should you use?

| Scenario | Recommendation |
|----------|---------------|
| Library or app with unit tests | Jest integration — validation lives next to your other tests |
| Team repo, multiple contributors | Add CI step — enforces validation regardless of local setup |
| Config files change often | Pre-commit hook — fastest feedback loop |
| All of the above | All three — they are complementary and low overhead |

---

## JSDoc tags

By default, `ts-config-validator` uses **ts-to-zod compatible tag names**.

### String properties

| Tag | Description |
|-----|-------------|
| `@minLength <n>` | Minimum character count (Unicode code points, not UTF-16 units) |
| `@maxLength <n>` | Maximum character count |
| `@length <n>` | Exact character count |
| `@pattern <regex>` | Value must match the regex. Write as-is (`^\d+$`) or as a literal (`/^\d+$/i`). Do **not** double-escape backslashes. |
| `@dateFormat <fmt>` | Value must match the date format (e.g. `YYYY-MM-DD`). When present, `@minLength`/`@maxLength` are treated as date bounds. |

### Number properties

| Tag | Description |
|-----|-------------|
| `@min <n>` | Minimum value (inclusive). Supports hex (`0x1A`), binary (`0b101`), octal (`0o17`). |
| `@max <n>` | Maximum value (inclusive) |
| `@integer` | Value must be a whole number |

### Supported `@dateFormat` tokens

`YYYY` `MM` `DD` `HH` `mm` `ss` `SSS`

Examples: `YYYY-MM-DD`, `DD/MM/YYYY`, `YYYY-MM-DDTHH:mm:ss`, `YYYY-MM-DDTHH:mm:ss.SSS`

---

## Native `Date` type

Properties typed as TypeScript's built-in `Date` are fully supported. Because `yaml.parse` is called with `{ schema: 'core' }`, YAML never auto-converts date strings to `Date` objects — they always arrive as plain strings, which the validator then checks.

**Without any JSDoc annotations** the validator enforces ISO 8601 format and performs a calendar overflow check (so `"2023-02-29"` is rejected even though the regex would pass):

```typescript
interface Config {
  createdAt: Date;   // accepts "2024-06-01" or "2024-06-01T14:30:00Z"
}
```

Accepted ISO 8601 forms:
- Date only: `YYYY-MM-DD` (e.g. `"2024-06-01"`)
- Datetime: `YYYY-MM-DDTHH:mm:ss` with optional fractional seconds and timezone (e.g. `"2024-06-01T14:30:00.000Z"`, `"2024-06-01T14:30:00+02:00"`)

**With JSDoc annotations** the same string constraint tags available on `string` properties apply. ISO 8601 validation still runs first (unless `@dateFormat` is present, in which case your custom format takes over entirely):

```typescript
interface Config {
  /**
   * @dateFormat YYYY-MM-DD
   * @minLength 2024-01-01
   * @maxLength 2025-12-31
   */
  startDate: Date;   // must be YYYY-MM-DD and within the year range

  /**
   * @dateFormat YYYY-MM-DDTHH:mm:ss
   */
  timestamp: Date;   // must include a time component

  /**
   * @pattern ^202[4-5]
   */
  recentDate: Date;  // ISO 8601, and must start with 2024 or 2025
}
```

Available tags on `Date` properties:

| Tag | Effect |
|-----|--------|
| `@dateFormat <fmt>` | Replaces the built-in ISO 8601 check with a custom format |
| `@minLength <date>` | Earliest allowed date — requires `@dateFormat` to be present |
| `@maxLength <date>` | Latest allowed date — requires `@dateFormat` to be present |
| `@pattern <regex>` | Additional regex check run after format validation passes |
| `@length <n>` | Exact character length (rarely needed for dates) |

> **Important:** if you add `@minLength`/`@maxLength` with date strings you must also add `@dateFormat` on the same property. Without it the validator emits a `specError` warning that the value looks like a date but no format was provided, and falls back to treating it as an integer length bound.

---

## Legacy tag names

If you are migrating from the original `configuration-yaml.spec.ts` that used `@min`/`@max` for strings, pass `LEGACY_TAG_MAP`:

```typescript
import { validate, LEGACY_TAG_MAP } from 'ts-config-validator';

validate({ ..., tags: LEGACY_TAG_MAP });
```

Or override individual tags:

```typescript
validate({
  ...,
  tags: { stringMin: 'min', stringMax: 'max' },
});
```

---

## API reference

### `validate(options): ValidateResult`

```typescript
type ValidateOptions = {
  interfaceFile: string;         // path to the .ts file
  typeName?: string;             // default: 'Configuration'
  files: string[];               // paths to data files
  parser?: 'yaml' | 'json' | ((content: string) => Record<string, unknown>);
  excludeKeys?: string[];        // dot-notation paths to skip (e.g. 'app.renderer')
  tags?: Partial<TagMap>;        // override any JSDoc tag name
};

type ValidateResult = {
  specErrors: string[];          // interface-level problems
  files: FileResult[];
};

type FileResult = {
  file: string;
  exists: boolean;
  parseError?: string;
  missingKeys: string[];
  unknownKeys: string[];
  wrongTypeKeys: string[];
  invalidEnumKeys: string[];
};
```

### `DEFAULT_TAG_MAP` / `LEGACY_TAG_MAP`

Pre-built `TagMap` objects. Import and pass to `tags` to switch conventions.

---

## CLI reference

```
ts-config-validator [options]

Required:
  -i, --interface <path>    Path to the TypeScript interface file
  -f, --files <globs...>    Glob pattern(s) for files to validate

Optional:
  -t, --type <name>         Interface/type name (default: Configuration)
  -p, --parser <parser>     yaml | json | auto (default: auto)
  -e, --exclude <paths...>  Dot-notation keys to exclude

Tag overrides:
  --tag-string-min <tag>    default: minLength
  --tag-string-max <tag>    default: maxLength
  --tag-length <tag>        default: length
  --tag-pattern <tag>       default: pattern
  --tag-date-format <tag>   default: dateFormat
  --tag-number-min <tag>    default: min
  --tag-number-max <tag>    default: max
  --tag-integer <tag>       default: integer
```

---

## Known limitations

- Mixed unions (`string | number`) are not supported — emits a `specError`.
- Discriminated/object unions (`{ type: 'A' } | { type: 'B' }`) are not supported — emits a `specError`.
- Array element types are not validated (only presence and `Array.isArray` are checked).
- Branded/intersection types (`string & { __brand: 'UUID' }`) — the base primitive is validated, the brand is not enforceable in YAML.
- Declaration merging across multiple modules is not fully supported.
- Numeric index signatures (`[key: number]`) cannot be enforced from YAML (keys are always strings).
