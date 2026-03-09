#!/usr/bin/env node

import { Command } from 'commander';
import * as glob from 'fast-glob';
import * as path from 'path';
import { validate } from './index';
import type { TagMap } from './types';

const program = new Command();

program
  .name('ts-config-validator')
  .description('Validate YAML/JSON config files against a TypeScript interface')
  .version('0.1.0')
  .requiredOption('-i, --interface <path>', 'Path to the TypeScript file containing the interface/type')
  .requiredOption('-f, --files <globs...>', 'Glob pattern(s) for the files to validate')
  .option('-t, --type <name>', 'Name of the interface or type alias', 'Configuration')
  .option('-p, --parser <parser>', 'Parser: yaml | json | auto (default: auto-detect from extension)', 'auto')
  .option('-e, --exclude <paths...>', 'Dot-notation key paths to exclude from validation')
  .option('--tag-string-min <tag>',  'JSDoc tag for string min length    (default: minLength)')
  .option('--tag-string-max <tag>',  'JSDoc tag for string max length    (default: maxLength)')
  .option('--tag-length <tag>',      'JSDoc tag for exact string length  (default: length)')
  .option('--tag-pattern <tag>',     'JSDoc tag for regex pattern        (default: pattern)')
  .option('--tag-date-format <tag>', 'JSDoc tag for date format          (default: dateFormat)')
  .option('--tag-number-min <tag>',  'JSDoc tag for number min value     (default: min)')
  .option('--tag-number-max <tag>',  'JSDoc tag for number max value     (default: max)')
  .option('--tag-integer <tag>',     'JSDoc tag for integer constraint   (default: integer)')
  .parse(process.argv);

const opts = program.opts();

// ---- Expand glob patterns ----
const files = (opts.files as string[]).flatMap((pattern) =>
  glob.sync(pattern, { absolute: true })
);

if (files.length === 0) {
  console.error('No files matched the provided glob pattern(s).');
  process.exit(1);
}

// ---- Build optional tag overrides ----
const tagOverrides: Partial<TagMap> = {};
if (opts.tagStringMin)  tagOverrides.stringMin  = opts.tagStringMin as string;
if (opts.tagStringMax)  tagOverrides.stringMax  = opts.tagStringMax as string;
if (opts.tagLength)     tagOverrides.length     = opts.tagLength as string;
if (opts.tagPattern)    tagOverrides.pattern    = opts.tagPattern as string;
if (opts.tagDateFormat) tagOverrides.dateFormat = opts.tagDateFormat as string;
if (opts.tagNumberMin)  tagOverrides.numberMin  = opts.tagNumberMin as string;
if (opts.tagNumberMax)  tagOverrides.numberMax  = opts.tagNumberMax as string;
if (opts.tagInteger)    tagOverrides.integer    = opts.tagInteger as string;

// ---- Run validation ----
const result = validate({
  interfaceFile: path.resolve(opts.interface as string),
  typeName: opts.type as string,
  files,
  parser: (opts.parser as string) === 'auto' ? undefined : (opts.parser as 'yaml' | 'json'),
  excludeKeys: opts.exclude as string[] | undefined,
  tags: Object.keys(tagOverrides).length > 0 ? tagOverrides : undefined,
});

// ---- Print results ----
let hasErrors = false;

if (result.specErrors.length > 0) {
  console.error(`
❌  Interface specification errors:`);
  result.specErrors.forEach((e) => console.error(`   ${e}`));
  hasErrors = true;
}

for (const r of result.files) {
  const errors: string[] = [
    ...r.missingKeys.map((k) => `Missing key:   ${k}`),
    ...r.unknownKeys.map((k) => `Unknown key:   ${k}`),
    ...r.wrongTypeKeys.map((k) => `Wrong type:    ${k}`),
    ...r.invalidEnumKeys.map((k) => `Invalid enum:  ${k}`),
  ];

  if (!r.exists) {
    console.error(`
❌  ${r.file}: file not found`);
    hasErrors = true;
  } else if (r.parseError) {
    console.error(`
❌  ${r.file}: parse error — ${r.parseError}`);
    hasErrors = true;
  } else if (errors.length > 0) {
    console.error(`
❌  ${r.file}:`);
    errors.forEach((e) => console.error(`   ${e}`));
    hasErrors = true;
  } else {
    console.log(`
✅  ${r.file}`);
  }
}

console.log('');
process.exit(hasErrors ? 1 : 0);
