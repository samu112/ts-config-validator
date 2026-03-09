// Symbol discriminants for shape sentinels.
//
// Symbols are used instead of plain string keys like `__type` so that a real
// config property named `__type` can never collide with a sentinel discriminant.
// Symbols are globally unique and cannot appear in user-defined TS interfaces.

export const KIND = Symbol('kind');
export const ENUM_VALUES = Symbol('enumValues');
export const NUM_ENUM_VALUES = Symbol('numEnumValues');
export const BOOL_ENUM_VALUES = Symbol('boolEnumValues');
