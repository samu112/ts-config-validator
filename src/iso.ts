// Validates that a string is a well-formed ISO 8601 date (date-only or datetime).
// Used by collectErrors for properties typed as the native `Date` type.
//
// yaml.parse is called with { schema: 'core' } which prevents the yaml package
// from auto-converting unquoted ISO date strings into native Date objects —
// so values always arrive as plain strings.

const ISO_DATE_ONLY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

// Accepts fractional seconds (?:\.\d+)? and both extended (+02:00) and
// basic (+0200) UTC-offset formats (:? makes the colon optional).
const ISO_DATETIME_RE =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3])(?::[0-5]\d){2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/;

export function validateIsoDate(
  value: string,
  path: string,
  wrongTypeKeys: string[]
): void {
  if (!ISO_DATE_ONLY_RE.test(value) && !ISO_DATETIME_RE.test(value)) {
    wrongTypeKeys.push(
      `${path}: "${value}" is not a valid ISO 8601 date string ` +
        `(expected YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss[Z|±HH:mm])`
    );
    return;
  }

  // Calendar overflow check — catches impossible dates like 2023-02-29 that pass
  // the regex. Uses setUTCFullYear to avoid the Date constructor's 0–99 year
  // remapping quirk (Date(24,0,1) maps to 1924, not year 24 AD).
  const datePart = value.slice(0, 10);
  const [y, mo, dy] = datePart.split('-').map((n) => Number.parseInt(n, 10));
  const d = new Date(0);
  d.setUTCFullYear(y, mo - 1, dy);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dy) {
    wrongTypeKeys.push(
      `${path}: "${value}" is not a valid calendar date ` +
        `(month, day, or year combination is out of range)`
    );
    return;
  }

  if (value.length > 10) {
    const timePart = value.slice(11, 19); // HH:mm:ss
    const [hr, mn, sc] = timePart.split(':').map((n) => Number.parseInt(n, 10));
    d.setUTCHours(hr, mn, sc, 0);
    if (d.getUTCHours() !== hr || d.getUTCMinutes() !== mn || d.getUTCSeconds() !== sc) {
      wrongTypeKeys.push(`${path}: "${value}" has an invalid time component`);
    }
  }
}
