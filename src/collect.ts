import type { Shape } from './types';
import {
  isAnyShape, isArrayShape, isStringEnumShape, isNumberEnumShape, isBooleanEnumShape,
  isStringConstraint, isNumberConstraint, isRecordShape, isObjectWithIndexShape,
  isNullOnlyShape, isDateShape,
} from './types';
import { ENUM_VALUES, NUM_ENUM_VALUES, BOOL_ENUM_VALUES } from './constants';
import { validateIsoDate } from './iso';
import { datePartsToComparable } from './date';

// ----------------------------------------------------------------
// semanticType — human-readable type name for error messages.
//
// typeof null === 'object' and typeof [] === 'object' both produce the
// confusing message "expected object, got object". Use this helper everywhere
// a type name is needed in an error string.
// ----------------------------------------------------------------

export function semanticType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// ----------------------------------------------------------------
// makeCollector
//
// Returns a `collectErrors` function closed over `excludeKeys` so that the
// Set does not need to be threaded through every recursive call.
// ----------------------------------------------------------------

export function makeCollector(excludeKeys: Set<string>) {
  function collectErrors(
    target: Record<string, unknown>,
    shape: Shape,
    optionalPaths: Set<string>,
    nullablePaths: Set<string>,
    missingKeys: string[],
    unknownKeys: string[],
    wrongTypeKeys: string[],
    invalidEnumKeys: string[],
    parentPath = '',
    skipReverseCheck = false,
    shapeParentPath = parentPath,
    isIndexSlot = false
  ): void {
    // ---- Root-level sentinel dispatch ----
    // Must run before Object.keys(shape) which would iterate sentinel internals.
    const shapeAsUnknown: unknown = shape;

    if (isAnyShape(shapeAsUnknown)) return;

    if (isArrayShape(shapeAsUnknown)) {
      if (!Array.isArray(target)) wrongTypeKeys.push(`(root): expected array, got ${semanticType(target)}`);
      return;
    }

    if (isStringEnumShape(shapeAsUnknown)) {
      if (typeof target !== 'string') {
        wrongTypeKeys.push(`(root): expected string, got ${semanticType(target)}`);
      } else if (!shapeAsUnknown[ENUM_VALUES].includes(target as unknown as string)) {
        wrongTypeKeys.push(`(root): "${target}" is not a valid value, allowed: ${shapeAsUnknown[ENUM_VALUES].map((v) => `"${v}"`).join(', ')}`);
      }
      return;
    }

    if (isNumberEnumShape(shapeAsUnknown)) {
      if (typeof target !== 'number') {
        wrongTypeKeys.push(`(root): expected number, got ${semanticType(target)}`);
      } else if (Number.isNaN(target as unknown as number)) {
        wrongTypeKeys.push(`(root): value is NaN`);
      } else if (!Number.isFinite(target as unknown as number)) {
        wrongTypeKeys.push(`(root): value is Infinity (use a finite number)`);
      } else if (!shapeAsUnknown[NUM_ENUM_VALUES].includes(target as unknown as number)) {
        wrongTypeKeys.push(`(root): ${target} is not a valid value, allowed: ${shapeAsUnknown[NUM_ENUM_VALUES].join(', ')}`);
      }
      return;
    }

    if (isBooleanEnumShape(shapeAsUnknown)) {
      if (typeof target !== 'boolean') {
        wrongTypeKeys.push(`(root): expected boolean, got ${semanticType(target)}`);
      } else if (!shapeAsUnknown[BOOL_ENUM_VALUES].includes(target as unknown as boolean)) {
        wrongTypeKeys.push(`(root): ${target} is not a valid value, allowed: ${shapeAsUnknown[BOOL_ENUM_VALUES].join(', ')}`);
      }
      return;
    }

    if (isNullOnlyShape(shapeAsUnknown)) {
      if (target !== null) wrongTypeKeys.push(`(root): expected null, got ${semanticType(target)}`);
      return;
    }

    if (isDateShape(shapeAsUnknown)) {
      if (typeof target !== 'string') {
        wrongTypeKeys.push(`(root): expected ISO date string, got ${semanticType(target)}`);
      } else {
        validateIsoDate(target, '(root)', wrongTypeKeys);
      }
      return;
    }

    if (isRecordShape(shapeAsUnknown)) {
      if (typeof target !== 'object' || target === null || Array.isArray(target)) {
        wrongTypeKeys.push(`(root): expected object, got ${semanticType(target)}`);
        return;
      }
      for (const recKey of Object.keys(target)) {
        const recFullPath = recKey;
        if (excludeKeys.has(recFullPath)) {
          unknownKeys.push(`${recFullPath} (excluded — remove it from this file)`);
          continue;
        }
        const recVal = (target as Record<string, unknown>)[recKey];
        collectErrors(
          { [recKey]: recVal } as Record<string, unknown>,
          { [recKey]: shapeAsUnknown.valueShape } as Shape,
          optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
          '', true, '', true
        );
      }
      return;
    }

    if (isObjectWithIndexShape(shapeAsUnknown)) {
      if (typeof target !== 'object' || target === null || Array.isArray(target)) {
        wrongTypeKeys.push(`(root): expected object, got ${semanticType(target)}`);
        return;
      }
      collectErrors(
        target as Record<string, unknown>, shapeAsUnknown.properties,
        optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
        '', true, '', false
      );
      for (const dynKey of Object.keys(target)) {
        if (Object.hasOwn(shapeAsUnknown.properties, dynKey)) continue;
        const dynFullPath = dynKey;
        if (excludeKeys.has(dynFullPath)) {
          unknownKeys.push(`${dynFullPath} (excluded — remove it from this file)`);
          continue;
        }
        const dynVal = (target as Record<string, unknown>)[dynKey];
        collectErrors(
          { [dynKey]: dynVal } as Record<string, unknown>,
          { [dynKey]: shapeAsUnknown.valueShape } as Shape,
          optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
          '', true, '', true
        );
      }
      return;
    }

    // ---- Primitive root shapes ----
    if (typeof shapeAsUnknown === 'string') {
      if (typeof target !== 'string') wrongTypeKeys.push(`(root): expected string, got ${semanticType(target)}`);
      return;
    }
    if (typeof shapeAsUnknown === 'number') {
      if (typeof target !== 'number') wrongTypeKeys.push(`(root): expected number, got ${semanticType(target)}`);
      return;
    }
    if (typeof shapeAsUnknown === 'boolean') {
      if (typeof target !== 'boolean') wrongTypeKeys.push(`(root): expected boolean, got ${semanticType(target)}`);
      return;
    }

    // Constrained root shapes — delegate via synthetic single-key wrapper.
    if (isStringConstraint(shapeAsUnknown)) {
      if (typeof target !== 'string') { wrongTypeKeys.push(`(root): expected string, got ${semanticType(target)}`); return; }
      collectErrors(
        { '(root)': target } as unknown as Record<string, unknown>,
        { '(root)': shapeAsUnknown } as unknown as Shape,
        optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
        '', true, '', false
      );
      return;
    }
    if (isNumberConstraint(shapeAsUnknown)) {
      if (typeof target !== 'number') { wrongTypeKeys.push(`(root): expected number, got ${semanticType(target)}`); return; }
      collectErrors(
        { '(root)': target } as unknown as Record<string, unknown>,
        { '(root)': shapeAsUnknown } as unknown as Shape,
        optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
        '', true, '', false
      );
      return;
    }

    // ---- Main property loop ----
    for (const key of Object.keys(shape)) {
      const fullPath = parentPath ? `${parentPath}.${key}` : key;
      const shapeKey = isIndexSlot ? '[index]' : key;
      const shapeFullPath = shapeParentPath ? `${shapeParentPath}.${shapeKey}` : shapeKey;

      if (excludeKeys.has(fullPath)) continue;

      const shapeValue = shape[key];
      const yamlValue = target?.[key];

      if (yamlValue === undefined) {
        if (!optionalPaths.has(shapeFullPath)) missingKeys.push(fullPath);
        continue;
      }

      if (yamlValue === null) {
        if (!nullablePaths.has(shapeFullPath)) wrongTypeKeys.push(`${fullPath}: null is not allowed for this property`);
        continue;
      }

      if (isNullOnlyShape(shapeValue)) {
        wrongTypeKeys.push(`${fullPath} (expected null, got ${semanticType(yamlValue)})`);
      } else if (isDateShape(shapeValue)) {
        if (typeof yamlValue !== 'string') {
          wrongTypeKeys.push(`${fullPath} (expected ISO date string, got ${semanticType(yamlValue)})`);
        } else {
          validateIsoDate(yamlValue, fullPath, wrongTypeKeys);
        }
      } else if (isAnyShape(shapeValue)) {
        continue;
      } else if (isArrayShape(shapeValue)) {
        if (!Array.isArray(yamlValue)) wrongTypeKeys.push(`${fullPath} (expected array, got ${semanticType(yamlValue)})`);
      } else if (isRecordShape(shapeValue)) {
        if (typeof yamlValue !== 'object' || yamlValue === null || Array.isArray(yamlValue)) {
          wrongTypeKeys.push(`${fullPath} (expected object, got ${semanticType(yamlValue)})`);
        } else {
          for (const recKey of Object.keys(yamlValue as Record<string, unknown>)) {
            const recFullPath = fullPath ? `${fullPath}.${recKey}` : recKey;
            if (excludeKeys.has(recFullPath)) {
              unknownKeys.push(`${recFullPath} (excluded — remove it from this file)`);
              continue;
            }
            const recVal = (yamlValue as Record<string, unknown>)[recKey];
            collectErrors(
              { [recKey]: recVal } as Record<string, unknown>,
              { [recKey]: shapeValue.valueShape } as Shape,
              optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
              fullPath, true, shapeFullPath, true
            );
          }
        }
      } else if (isObjectWithIndexShape(shapeValue)) {
        if (typeof yamlValue !== 'object' || yamlValue === null || Array.isArray(yamlValue)) {
          wrongTypeKeys.push(`${fullPath} (expected object, got ${semanticType(yamlValue)})`);
        } else {
          collectErrors(
            yamlValue as Record<string, unknown>, shapeValue.properties,
            optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
            fullPath, true, shapeFullPath, false
          );
          for (const dynKey of Object.keys(yamlValue as Record<string, unknown>)) {
            if (Object.hasOwn(shapeValue.properties, dynKey)) continue;
            const dynFullPath = fullPath ? `${fullPath}.${dynKey}` : dynKey;
            if (excludeKeys.has(dynFullPath)) {
              unknownKeys.push(`${dynFullPath} (excluded — remove it from this file)`);
              continue;
            }
            const dynVal = (yamlValue as Record<string, unknown>)[dynKey];
            collectErrors(
              { [dynKey]: dynVal } as Record<string, unknown>,
              { [dynKey]: shapeValue.valueShape } as Shape,
              optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
              fullPath, true, shapeFullPath, true
            );
          }
        }
      } else if (isStringEnumShape(shapeValue)) {
        if (typeof yamlValue !== 'string') {
          wrongTypeKeys.push(`${fullPath} (expected string, got ${semanticType(yamlValue)})`);
        } else if (!shapeValue[ENUM_VALUES].includes(yamlValue)) {
          invalidEnumKeys.push(
            `${fullPath}: "${yamlValue}" is not valid, allowed: ${shapeValue[ENUM_VALUES].map((v) => `"${v}"`).join(', ')}`
          );
        }
      } else if (isNumberEnumShape(shapeValue)) {
        if (typeof yamlValue !== 'number') {
          wrongTypeKeys.push(`${fullPath} (expected number, got ${semanticType(yamlValue)})`);
        } else if (Number.isNaN(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is NaN`);
        } else if (!Number.isFinite(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is Infinity (use a finite number)`);
        } else if (!shapeValue[NUM_ENUM_VALUES].includes(yamlValue)) {
          invalidEnumKeys.push(
            `${fullPath}: ${yamlValue} is not valid, allowed: ${shapeValue[NUM_ENUM_VALUES].join(', ')}`
          );
        }
      } else if (isBooleanEnumShape(shapeValue)) {
        if (typeof yamlValue !== 'boolean') {
          wrongTypeKeys.push(`${fullPath} (expected boolean, got ${semanticType(yamlValue)})`);
        } else if (!shapeValue[BOOL_ENUM_VALUES].includes(yamlValue)) {
          invalidEnumKeys.push(
            `${fullPath}: ${yamlValue} is not valid, allowed: ${shapeValue[BOOL_ENUM_VALUES].join(', ')}`
          );
        }
      } else if (isStringConstraint(shapeValue)) {
        if (typeof yamlValue !== 'string') {
          wrongTypeKeys.push(`${fullPath} (expected string, got ${semanticType(yamlValue)})`);
          continue;
        }
        const str = yamlValue;

        // Native Date: run ISO 8601 check unless @dateFormat overrides it.
        if (shapeValue.isNativeDate && shapeValue.dateFormat === undefined) {
          const prevCount = wrongTypeKeys.length;
          validateIsoDate(str, fullPath, wrongTypeKeys);
          if (wrongTypeKeys.length > prevCount) continue;
        }

        if (shapeValue.dateFormat !== undefined) {
          const descriptor = shapeValue.compiledDateFormat!;
          if (!descriptor.regex.test(str)) {
            wrongTypeKeys.push(`${fullPath}: value ${str} does not match date format ${shapeValue.dateFormat}`);
          } else {
            const parsed = descriptor.parse(str);
            if (parsed !== null) {
              // Calendar overflow check (must stay per-value — depends on the actual date).
              if (
                parsed.year !== undefined || parsed.month !== undefined || parsed.day !== undefined ||
                parsed.hour !== undefined || parsed.minute !== undefined || parsed.second !== undefined
              ) {
                const y = parsed.year ?? 2001;
                const mo = parsed.month ?? 1;
                const dy = parsed.day ?? 1;
                const hr = parsed.hour ?? 0;
                const mn = parsed.minute ?? 0;
                const sc = parsed.second ?? 0;
                const d = new Date(0);
                d.setUTCFullYear(y, mo - 1, dy);
                d.setUTCHours(hr, mn, sc, 0);
                if (
                  d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dy ||
                  d.getUTCHours() !== hr || d.getUTCMinutes() !== mn || d.getUTCSeconds() !== sc
                ) {
                  wrongTypeKeys.push(
                    `${fullPath}: date/time ${str} is not a valid calendar date or time (e.g. month, day, or time field is out of range)`
                  );
                }
              }

              // Use pre-computed comparables from getJsDocConstraints.
              const cmp = datePartsToComparable(parsed);

              if (shapeValue.minDateComparable !== undefined && cmp < shapeValue.minDateComparable) {
                wrongTypeKeys.push(`${fullPath}: date ${str} is before minimum date ${shapeValue.min}`);
              }
              if (shapeValue.maxDateComparable !== undefined && cmp > shapeValue.maxDateComparable) {
                wrongTypeKeys.push(`${fullPath}: date ${str} is after maximum date ${shapeValue.max}`);
              }
            }
          }
        } else {
          // Length bounds (pre-parsed in getJsDocConstraints).
          const codePointLength = [...str].length;
          if (shapeValue.effectiveMin !== undefined && codePointLength < shapeValue.effectiveMin) {
            wrongTypeKeys.push(`${fullPath}: value ${str} is shorter than minimum length ${shapeValue.effectiveMin}`);
          }
          if (shapeValue.effectiveMax !== undefined && codePointLength > shapeValue.effectiveMax) {
            wrongTypeKeys.push(`${fullPath}: value ${str} exceeds maximum length ${shapeValue.effectiveMax}`);
          }
        }

        // Exact length check (independent of dateFormat).
        if (shapeValue.length !== undefined && [...str].length !== shapeValue.length) {
          wrongTypeKeys.push(
            `${fullPath}: value ${str} must be exactly ${shapeValue.length} character${shapeValue.length === 1 ? '' : 's'} long (got ${[...str].length})`
          );
        }

        // Pattern check (pre-compiled in getJsDocConstraints).
        if (shapeValue.compiledPattern != null && !shapeValue.compiledPattern.regex.test(str)) {
          wrongTypeKeys.push(`${fullPath}: value ${str} does not match pattern ${shapeValue.compiledPattern.display}`);
        }
        // compiledPattern === null → broken pattern, specError already emitted — skip.

      } else if (isNumberConstraint(shapeValue)) {
        if (typeof yamlValue !== 'number') {
          wrongTypeKeys.push(`${fullPath} (expected number, got ${semanticType(yamlValue)})`);
        } else if (Number.isNaN(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is NaN`);
        } else if (!Number.isFinite(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is Infinity (use a finite number)`);
        } else {
          if (shapeValue.integer && !Number.isInteger(yamlValue)) {
            wrongTypeKeys.push(`${fullPath}: value ${yamlValue} must be a whole number`);
          }
          if (shapeValue.min !== undefined && yamlValue < shapeValue.min) {
            wrongTypeKeys.push(`${fullPath}: value ${yamlValue} is less than minimum ${shapeValue.min}`);
          }
          if (shapeValue.max !== undefined && yamlValue > shapeValue.max) {
            wrongTypeKeys.push(`${fullPath}: value ${yamlValue} exceeds maximum ${shapeValue.max}`);
          }
        }
      } else if (typeof shapeValue === 'object') {
        if (typeof yamlValue !== 'object' || yamlValue === null || Array.isArray(yamlValue)) {
          wrongTypeKeys.push(`${fullPath} (expected object, got ${semanticType(yamlValue)})`);
        } else {
          collectErrors(
            yamlValue as Record<string, unknown>, shapeValue as Shape,
            optionalPaths, nullablePaths, missingKeys, unknownKeys, wrongTypeKeys, invalidEnumKeys,
            fullPath, false, shapeFullPath, false
          );
        }
      } else {
        // Primitive shape sentinels ('string', 0, true).
        if (typeof yamlValue === 'number' && Number.isNaN(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is NaN`);
        } else if (typeof yamlValue === 'number' && !Number.isFinite(yamlValue)) {
          wrongTypeKeys.push(`${fullPath}: value is Infinity (use a finite number)`);
        } else if (typeof yamlValue !== typeof shapeValue) {
          wrongTypeKeys.push(`${fullPath} (expected ${typeof shapeValue}, got ${semanticType(yamlValue)})`);
        }
      }
    }

    // ---- Reverse check: flag keys present in YAML but absent from the shape ----
    if (!skipReverseCheck && typeof target === 'object' && target !== null && !Array.isArray(target)) {
      for (const key of Object.keys(target)) {
        const fullPath = parentPath ? `${parentPath}.${key}` : key;
        if (excludeKeys.has(fullPath)) {
          unknownKeys.push(`${fullPath} (excluded — remove it from this file)`);
          continue;
        }
        if (!Object.hasOwn(shape, key)) unknownKeys.push(fullPath);
      }
    }
  }

  return collectErrors;
}
