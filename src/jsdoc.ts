import * as ts from 'typescript';
import type { StringConstraints, NumberConstraints, TagMap } from './types';
import { KIND } from './constants';
import { buildDateFormatDescriptor, datePartsToComparable, looksLikeDateWithoutFormat } from './date';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Extracts the first whitespace-hyphen-delimited token from a JSDoc comment.
 * " - " acts as a prose description delimiter so authors can write:
 *   @minLength 3 - must be at least 3 chars
 * and the constraint value is just "3".
 *
 * NOTE: @pattern and @dateFormat bypass this function entirely because their
 * values can legitimately contain spaces and hyphens.
 */
export function firstToken(comment: string): string {
  const match = comment.match(/\s+-\s*/);
  const delimIdx = match?.index ?? -1;
  return (delimIdx === -1 ? comment : comment.slice(0, delimIdx)).trim();
}

/**
 * Resolves a JSDoc tag's comment to a plain string, handling both the simple
 * `string` form and the NodeArray<JSDocText | JSDocLink> form that the TS
 * compiler uses for multi-fragment comments.
 *
 * Slices at the first newline so continuation lines (e.g. a description on
 * the next JSDoc line after @pattern) are not included in the constraint value.
 */
export function resolveTagComment(tag: ts.JSDocTag): string | undefined {
  if (typeof tag.comment === 'string') return tag.comment.trim();

  if (Array.isArray(tag.comment)) {
    const joined = (tag.comment as ts.NodeArray<ts.JSDocText | ts.JSDocLink>)
      .map((c) => ('text' in c ? c.text : ''))
      .join('')
      .trim();
    const newlineIdx = joined.indexOf('\n');
    return (newlineIdx === -1 ? joined : joined.slice(0, newlineIdx)).trim();
  }

  return undefined;
}

// ----------------------------------------------------------------
// getJsDocConstraints
// ----------------------------------------------------------------

/**
 * Reads JSDoc tags from a TypeScript AST node and returns a constraint object.
 * All annotation-level validation (regex compilation, date format building,
 * @min/@max date parsing) is done here at AST-parse time so that specErrors
 * are emitted even when the annotated property is absent from the data payload.
 */
export function getJsDocConstraints(
  decl: ts.Node,
  baseType: 'string' | 'number',
  specErrors: string[],
  path: string,
  tagMap: TagMap
): StringConstraints | NumberConstraints | null {
  const tags = ts.getJSDocTags(decl);
  if (tags.length === 0) return null;

  // ---- Number constraints ----
  if (baseType === 'number') {
    const constraints: NumberConstraints = { [KIND]: 'numberConstraints' };
    const seenTags = new Set<string>();

    for (const tag of tags) {
      const name = tag.tagName.text;
      const comment = resolveTagComment(tag);

      if (name === tagMap.numberMin) {
        if (seenTags.has('min')) {
          const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.numberMin} tag — only the first occurrence is used.`;
          if (!specErrors.includes(msg)) specErrors.push(msg);
          continue;
        }
        seenTags.add('min');
        if (comment === undefined) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMin} tag has no value — provide a number (e.g. @${tagMap.numberMin} 0)`);
        } else {
          const token = firstToken(comment);
          if (!token) {
            specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMin} tag has no value — provide a number (e.g. @${tagMap.numberMin} 0)`);
          } else {
            const val = Number(token);
            if (Number.isNaN(val)) {
              specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMin} "${comment}" does not parse as a valid number`);
            } else {
              constraints.min = val;
            }
          }
        }
      } else if (name === tagMap.numberMax) {
        if (seenTags.has('max')) {
          const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.numberMax} tag — only the first occurrence is used.`;
          if (!specErrors.includes(msg)) specErrors.push(msg);
          continue;
        }
        seenTags.add('max');
        if (comment === undefined) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMax} tag has no value — provide a number (e.g. @${tagMap.numberMax} 100)`);
        } else {
          const token = firstToken(comment);
          if (!token) {
            specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMax} tag has no value — provide a number (e.g. @${tagMap.numberMax} 100)`);
          } else {
            const val = Number(token);
            if (Number.isNaN(val)) {
              specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.numberMax} "${comment}" does not parse as a valid number`);
            } else {
              constraints.max = val;
            }
          }
        }
      } else if (name === tagMap.integer) {
        constraints.integer = true;
      }
    }

    if (constraints.min !== undefined && constraints.max !== undefined && constraints.min > constraints.max) {
      specErrors.push(
        `${path ? `${path}: ` : ''}@${tagMap.numberMin} ${constraints.min} is greater than @${tagMap.numberMax} ${constraints.max}`
      );
    }

    const keys = Object.keys(constraints);
    return keys.length > 0 ? constraints : null;
  }

  // ---- String constraints ----
  const constraints: StringConstraints = { [KIND]: 'stringConstraints' };
  const seenTags = new Set<string>();

  for (const tag of tags) {
    const name = tag.tagName.text;
    const comment = resolveTagComment(tag);

    if (name === tagMap.stringMin) {
      if (seenTags.has('min')) {
        const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.stringMin} tag — only the first occurrence is used.`;
        if (!specErrors.includes(msg)) specErrors.push(msg);
        continue;
      }
      seenTags.add('min');
      if (comment === undefined) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMin} tag has no value — provide a number or date string`);
      } else {
        const token = firstToken(comment);
        if (!token) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMin} tag has no value — provide a number or date string`);
        } else {
          constraints.min = token;
        }
      }
    } else if (name === tagMap.stringMax) {
      if (seenTags.has('max')) {
        const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.stringMax} tag — only the first occurrence is used.`;
        if (!specErrors.includes(msg)) specErrors.push(msg);
        continue;
      }
      seenTags.add('max');
      if (comment === undefined) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMax} tag has no value — provide a number or date string`);
      } else {
        const token = firstToken(comment);
        if (!token) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMax} tag has no value — provide a number or date string`);
        } else {
          constraints.max = token;
        }
      }
    } else if (name === tagMap.length) {
      if (seenTags.has('length')) {
        const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.length} tag — only the first occurrence is used.`;
        if (!specErrors.includes(msg)) specErrors.push(msg);
        continue;
      }
      seenTags.add('length');
      if (comment === undefined) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.length} tag has no value — provide a non-negative integer`);
      } else {
        const token = firstToken(comment);
        const val = token ? Number(token) : Number.NaN;
        if (Number.isNaN(val)) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.length} "${comment}" does not parse as a valid number`);
        } else if (!Number.isInteger(val)) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.length} ${val} is not a whole number — string lengths must be integers`);
        } else if (val < 0) {
          specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.length} ${val} is negative — string lengths must be non-negative`);
        } else {
          constraints.length = val;
        }
      }
    } else if (name === tagMap.pattern) {
      if (seenTags.has('pattern')) {
        const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.pattern} tag — only the first occurrence is used.`;
        if (!specErrors.includes(msg)) specErrors.push(msg);
        continue;
      }
      seenTags.add('pattern');
      // @pattern must NOT go through firstToken — a regex can contain ' - '.
      const patternVal = comment !== undefined ? comment.trim() : '';
      if (!patternVal) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.pattern} tag is empty — provide a regular expression`);
        constraints.compiledPattern = null;
      } else {
        constraints.pattern = patternVal;
        let patternBody = patternVal;
        let patternFlags = '';
        // Detect /regex/flags literal syntax.
        const outerSlash = patternVal.match(/^\/(.*)\/([a-z]*)$/s);
        if (outerSlash) {
          const candidateBody = outerSlash[1];
          if (candidateBody === '') {
            specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.pattern} "${patternVal}" is an empty regex literal`);
            constraints.compiledPattern = null;
          } else {
            // Allow '/' inside character classes [...] but not bare in the body
            // (file paths like /usr/bin/ have bare slashes and should NOT be unwrapped).
            let inClass = false, escaped = false, hasBareFwdSlash = false;
            for (const ch of candidateBody) {
              if (escaped)       { escaped = false; continue; }
              if (ch === '\\')   { escaped = true; continue; }
              if (ch === '[')    { inClass = true; continue; }
              if (ch === ']')    { inClass = false; continue; }
              if (ch === '/' && !inClass) { hasBareFwdSlash = true; break; }
            }
            if (!hasBareFwdSlash) {
              patternBody = candidateBody;
              patternFlags = outerSlash[2];
            } else {
              specErrors.push(
                `${path ? `${path}: ` : ''}@${tagMap.pattern} "${patternVal}" looks like a regex literal but ` +
                  `contains an unescaped '/' outside a character class — escape it as '\\/' or use [/]`
              );
              constraints.compiledPattern = null;
            }
          }
        }
        if (constraints.compiledPattern === undefined) {
          try {
            const regex = new RegExp(patternBody, patternFlags);
            const display = patternFlags ? `/${patternBody}/${patternFlags}` : `/${patternBody}/`;
            constraints.compiledPattern = { regex, display };
          } catch {
            specErrors.push(
              `${path ? `${path}: ` : ''}@${tagMap.pattern} "${patternVal}" is not a valid regular expression`
            );
            constraints.compiledPattern = null;
          }
        }
      }
    } else if (name === tagMap.dateFormat) {
      if (seenTags.has('dateFormat')) {
        const msg = `${path ? `${path}: ` : ''}duplicate @${tagMap.dateFormat} tag — only the first occurrence is used.`;
        if (!specErrors.includes(msg)) specErrors.push(msg);
        continue;
      }
      seenTags.add('dateFormat');
      // @dateFormat must NOT go through firstToken — date formats can contain ' - '.
      const dateFormatVal = comment !== undefined ? comment.trim() : '';
      if (!dateFormatVal) {
        specErrors.push(
          `${path ? `${path}: ` : ''}@${tagMap.dateFormat} tag is empty — provide a format string (e.g. @${tagMap.dateFormat} YYYY-MM-DD)`
        );
      } else {
        constraints.dateFormat = dateFormatVal;
      }
    }
  }

  // ---- Post-process: compile dateFormat, parse bounds ----
  if (constraints.dateFormat !== undefined) {
    constraints.compiledDateFormat = buildDateFormatDescriptor(constraints.dateFormat, specErrors, path);

    if (constraints.min !== undefined) {
      const minParsed = constraints.compiledDateFormat.parse(constraints.min);
      if (minParsed === null) {
        specErrors.push(
          `${path ? `${path}: ` : ''}@${tagMap.stringMin} value "${constraints.min}" does not match ` +
            `@${tagMap.dateFormat} "${constraints.dateFormat}"`
        );
      } else {
        constraints.minDateComparable = datePartsToComparable(minParsed);
      }
    }

    if (constraints.max !== undefined) {
      const maxParsed = constraints.compiledDateFormat.parse(constraints.max);
      if (maxParsed === null) {
        specErrors.push(
          `${path ? `${path}: ` : ''}@${tagMap.stringMax} value "${constraints.max}" does not match ` +
            `@${tagMap.dateFormat} "${constraints.dateFormat}"`
        );
      } else {
        constraints.maxDateComparable = datePartsToComparable(maxParsed);
      }
    }

    if (
      constraints.minDateComparable !== undefined &&
      constraints.maxDateComparable !== undefined &&
      constraints.minDateComparable > constraints.maxDateComparable
    ) {
      specErrors.push(
        `${path ? `${path}: ` : ''}@${tagMap.stringMin} "${constraints.min}" is later than @${tagMap.stringMax} "${constraints.max}"`
      );
    }
  } else {
    // No @dateFormat — parse as integer string length bounds.
    if (constraints.min !== undefined && looksLikeDateWithoutFormat(constraints.min)) {
      specErrors.push(
        `${path ? `${path}: ` : ''}@${tagMap.stringMin} value "${constraints.min}" looks like a date but ` +
          `@${tagMap.dateFormat} is missing — add @${tagMap.dateFormat} to enable date comparison, ` +
          `or use a plain integer for length constraints.`
      );
    } else if (constraints.min !== undefined) {
      const v = Number(constraints.min);
      if (Number.isNaN(v)) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMin} "${constraints.min}" does not parse as a valid number`);
      } else if (!Number.isInteger(v)) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMin} "${constraints.min}" is not a whole number — string length bounds must be integers`);
      } else if (v < 0) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMin} ${v} is negative — string length bounds must be non-negative`);
      } else {
        constraints.effectiveMin = v;
      }
    }

    if (constraints.max !== undefined && looksLikeDateWithoutFormat(constraints.max)) {
      specErrors.push(
        `${path ? `${path}: ` : ''}@${tagMap.stringMax} value "${constraints.max}" looks like a date but ` +
          `@${tagMap.dateFormat} is missing — add @${tagMap.dateFormat} to enable date comparison, ` +
          `or use a plain integer for length constraints.`
      );
    } else if (constraints.max !== undefined) {
      const v = Number(constraints.max);
      if (Number.isNaN(v)) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMax} "${constraints.max}" does not parse as a valid number`);
      } else if (!Number.isInteger(v)) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMax} "${constraints.max}" is not a whole number — string length bounds must be integers`);
      } else if (v < 0) {
        specErrors.push(`${path ? `${path}: ` : ''}@${tagMap.stringMax} ${v} is negative — string length bounds must be non-negative`);
      } else {
        constraints.effectiveMax = v;
      }
    }

    if (
      constraints.effectiveMin !== undefined &&
      constraints.effectiveMax !== undefined &&
      constraints.effectiveMin > constraints.effectiveMax
    ) {
      specErrors.push(
        `${path ? `${path}: ` : ''}@${tagMap.stringMin} ${constraints.effectiveMin} is greater than @${tagMap.stringMax} ${constraints.effectiveMax}`
      );
    }
  }

  const keys = Object.keys(constraints);
  return keys.length > 0 ? constraints : null;
}