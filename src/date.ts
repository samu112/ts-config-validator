import type { DateParts, DateFormatDescriptor } from './types';

// ----------------------------------------------------------------
// Supported @dateFormat tokens
// ----------------------------------------------------------------

const DATE_TOKENS: { token: string; regex: string; part: keyof DateParts }[] = [
  { token: 'YYYY', regex: '(\\d{4})',   part: 'year' },
  { token: 'MM',   regex: '(\\d{2})',   part: 'month' },
  { token: 'DD',   regex: '(\\d{2})',   part: 'day' },
  { token: 'HH',   regex: '(\\d{2})',   part: 'hour' },
  { token: 'mm',   regex: '(\\d{2})',   part: 'minute' },
  { token: 'ss',   regex: '(\\d{2})',   part: 'second' },
  // SSS captures 1–3 fractional-second digits. Ordered last so the two-character
  // 'ss' token is always matched first and the 'ss'/'SS' overlap never occurs.
  { token: 'SSS',  regex: '(\\d{1,3})', part: 'millisecond' },
];

// ----------------------------------------------------------------
// buildDateFormatDescriptor
// ----------------------------------------------------------------

/**
 * Converts a format string like "YYYY-MM-DD" into a compiled regex and a parse
 * function. Returns a /(?!)/ sentinel (never matches) for broken formats so that
 * collectErrors cleanly reports a format-mismatch error rather than crashing.
 */
export function buildDateFormatDescriptor(
  format: string,
  specErrors?: string[],
  path?: string
): DateFormatDescriptor {
  let regexStr = '';
  let remaining = format;
  const partOrder: (keyof DateParts)[] = [];
  const seenParts = new Set<keyof DateParts>();

  while (remaining.length > 0) {
    const matched = DATE_TOKENS.find((t) => remaining.startsWith(t.token));
    if (matched) {
      if (seenParts.has(matched.part)) {
        if (specErrors) {
          const msg =
            `${path ? `${path}: ` : ''}@dateFormat "${format}" contains duplicate token ` +
            `"${matched.token}" — each part (YYYY, MM, DD, HH, mm, ss) may appear at most once`;
          if (!specErrors.includes(msg)) specErrors.push(msg);
        }
        return { regex: /(?!)/, parse: () => null };
      }
      seenParts.add(matched.part);
      regexStr += matched.regex;
      partOrder.push(matched.part);
      remaining = remaining.slice(matched.token.length);
    } else {
      // Escape any regex metacharacter in a literal separator character.
      regexStr += remaining[0].replace(/[$()*+.?[\\]^{|}]/g, '\\$&');
      remaining = remaining.slice(1);
    }
  }

  const regex = new RegExp(`^${regexStr}$`);

  const parse = (value: string): DateParts | null => {
    const m = value.match(regex);
    if (!m) return null;
    const parts: DateParts = {};
    partOrder.forEach((part, i) => {
      if (part === 'millisecond') {
        // "1" in a fractional-second position means 100 ms, "02" means 20 ms.
        // Right-pad to 3 digits before parseInt so ordering is correct.
        parts[part] = Number.parseInt(m[i + 1].padEnd(3, '0'), 10);
      } else {
        parts[part] = Number.parseInt(m[i + 1], 10);
      }
    });
    return parts;
  };

  return { regex, parse };
}

// ----------------------------------------------------------------
// datePartsToComparable
// ----------------------------------------------------------------

/**
 * Converts parsed date parts to a 17-character zero-padded string
 * (YYYYMMDDHHMMSSMMM) for lexicographic comparison.
 *
 * Using a string avoids Number.MAX_SAFE_INTEGER precision loss: multiplying
 * a year like 2024 by 10^13 exceeds MAX_SAFE_INTEGER (~9 quadrillion),
 * causing milliseconds and sometimes seconds to be silently rounded.
 */
export function datePartsToComparable(parts: DateParts): string {
  const y  = String(parts.year        ?? 0).padStart(4, '0');
  const mo = String(parts.month       ?? 0).padStart(2, '0');
  const dy = String(parts.day         ?? 0).padStart(2, '0');
  const hr = String(parts.hour        ?? 0).padStart(2, '0');
  const mn = String(parts.minute      ?? 0).padStart(2, '0');
  const sc = String(parts.second      ?? 0).padStart(2, '0');
  const ms = String(parts.millisecond ?? 0).padStart(3, '0');
  return `${y}${mo}${dy}${hr}${mn}${sc}${ms}`;
}

// ----------------------------------------------------------------
// looksLikeDateWithoutFormat
// ----------------------------------------------------------------

/**
 * Returns true when a raw @min/@max string looks like a date so that we can
 * warn the author to add @dateFormat before their value is silently parsed
 * as an integer length constraint.
 *
 * Detects four common patterns:
 *   ISO-style prefix   2024-01-01   /^\d{4}-/
 *   Slash-separated    12/31/2024   /^(\d{1,2}\/){2}\d{4}$/
 *   Dot-separated      31.12.2024   /^(\d{1,2}\.){2}\d{4}$/
 *   Compact 8-digit    20241231     (valid YYYYMMDD range)
 */
export function looksLikeDateWithoutFormat(raw: string): boolean {
  if (/^\d{4}-/.test(raw)) return true;
  if (/^(?:\d{1,2}\/){2}\d{4}$/.test(raw)) return true;
  if (/^(?:\d{1,2}\.){2}\d{4}$/.test(raw)) return true;
  if (/^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(raw)) return true;
  return false;
}