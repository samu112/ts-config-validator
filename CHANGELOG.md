# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

[0.1.0] - 2026-03-08

### Added
- Initial release
- `validate()` programmatic API
- CLI entrypoint (`npx ts-config-validator`)
- YAML and JSON built-in parsers with pluggable custom parser support
- Configurable JSDoc tag names (default: ts-to-zod conventions; `LEGACY_TAG_MAP` for original `@min`/`@max` style)
- Full JSDoc constraint support: `@minLength`, `@maxLength`, `@length`, `@pattern`, `@dateFormat`, `@min`, `@max`, `@integer`
- String literal, numeric literal, and boolean literal union enums
- Optional (`?`) and nullable (`T | null`) property handling
- `Record<string, T>` and mixed named+index-signature interfaces
- Native `Date` type support (ISO 8601 validation with `setUTCFullYear` round-trip)
- Calendar overflow detection for custom date formats
- Pre-compiled regex and date format descriptors (specErrors emitted even for absent optional properties)
- `specErrors` for interface-level problems: bad JSDoc, unsupported unions, branded types, function properties, native `Date` type misuse
