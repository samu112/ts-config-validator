import * as ts from 'typescript';
import type { Shape, BuildShapeResult, TagMap } from './types';
import { KIND, ENUM_VALUES, NUM_ENUM_VALUES, BOOL_ENUM_VALUES } from './constants';
import { getJsDocConstraints } from './jsdoc';

// ----------------------------------------------------------------
// buildShape — recursively maps a TS Type to a Shape value
// ----------------------------------------------------------------

export function buildShape(
  type: ts.Type,
  checker: ts.TypeChecker,
  optionalPaths: Set<string>,
  nullablePaths: Set<string>,
  specErrors: string[],
  tagMap: TagMap,
  depth = 0,
  declNode?: ts.Node,
  parentPath = ''
):
  | string
  | number
  | boolean
  | import('./types').StringEnumShape
  | import('./types').NumberEnumShape
  | import('./types').BooleanEnumShape
  | import('./types').StringConstraints
  | import('./types').NumberConstraints
  | import('./types').ArrayShape
  | import('./types').ObjectWithIndexShape
  | import('./types').RecordShape
  | import('./types').AnyShape
  | import('./types').NullOnlyShape
  | import('./types').DateShape
  | Shape {

  // Guard against deeply recursive types.
  if (depth > 10) return { [KIND]: 'any' } as import('./types').AnyShape;

  const flags = type.getFlags();

  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    if (parentPath) nullablePaths.add(parentPath);
    return { [KIND]: 'any' } as import('./types').AnyShape;
  }

  // Native Date type — validated as ISO 8601 in collectErrors.
  // yaml.parse({ schema: 'core' }) never auto-converts date strings to Date objects
  // so the YAML value always arrives as a plain string.
  if (checker.typeToString(type) === 'Date') {
    if (declNode) {
      const constraints = getJsDocConstraints(declNode, 'string', specErrors, parentPath, tagMap);
      if (constraints) {
        (constraints as import('./types').StringConstraints).isNativeDate = true;
        return constraints;
      }
    }
    return { [KIND]: 'date' } as import('./types').DateShape;
  }

  if (checker.isTupleType(type)) {
    return { [KIND]: 'array' } as import('./types').ArrayShape;
  }

  if (
    checker.isArrayType(type) ||
    (type as ts.Type & { symbol?: ts.Symbol }).symbol?.name === 'ReadonlyArray'
  ) {
    return { [KIND]: 'array' } as import('./types').ArrayShape;
  }

  // Template literal types (e.g. `env_${string}`) — treat as plain string.
  if (flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral)) {
    if (declNode) {
      const constraints = getJsDocConstraints(declNode, 'string', specErrors, parentPath, tagMap);
      if (constraints) return constraints;
    }
    return 'string';
  }

  if (flags & ts.TypeFlags.Number) {
    if (declNode) {
      const constraints = getJsDocConstraints(declNode, 'number', specErrors, parentPath, tagMap);
      if (constraints) return constraints;
    }
    return 0;
  }

  if (flags & ts.TypeFlags.Boolean) return true;

  // Intersection types (branded primitives like `string & { __brand: 'UUID' }`).
  if (type.isIntersection()) {
    const primitiveMember = type.types.find((t) => {
      const f = t.getFlags();
      return !!(f & (
        ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean |
        ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral
      ));
    });

    if (primitiveMember) {
      specErrors.push(
        `${parentPath ? `${parentPath}: ` : ''}branded/intersection type detected — ` +
          `the brand is not enforceable in YAML and will be ignored. ` +
          `Only the base type (${checker.typeToString(primitiveMember)}) is validated. ` +
          `Consider using a plain primitive type with a @${tagMap.pattern} constraint instead.`
      );
      return buildShape(primitiveMember, checker, optionalPaths, nullablePaths, specErrors, tagMap, depth + 1, declNode, parentPath);
    }

    specErrors.push(
      `${parentPath ? `${parentPath}: ` : ''}unsupported object intersection type — ` +
        `deep validation is not possible. Consider using a flat interface instead.`
    );
    return { [KIND]: 'any' } as import('./types').AnyShape;
  }

  if (flags & ts.TypeFlags.Null) {
    if (parentPath) nullablePaths.add(parentPath);
    return { [KIND]: 'nullOnly' } as import('./types').NullOnlyShape;
  }

  // Single string/number/boolean literal types.
  if (flags & ts.TypeFlags.StringLiteral) {
    return { [KIND]: 'stringEnum', [ENUM_VALUES]: [(type as ts.StringLiteralType).value] } as import('./types').StringEnumShape;
  }
  if (flags & ts.TypeFlags.NumberLiteral) {
    return { [KIND]: 'numberEnum', [NUM_ENUM_VALUES]: [(type as ts.NumberLiteralType).value] } as import('./types').NumberEnumShape;
  }
  if (flags & ts.TypeFlags.BooleanLiteral) {
    return { [KIND]: 'booleanEnum', [BOOL_ENUM_VALUES]: [checker.typeToString(type) === 'true'] } as import('./types').BooleanEnumShape;
  }

  // Standard TypeScript enums.
  if (flags & (ts.TypeFlags.Enum | ts.TypeFlags.EnumLiteral)) {
    if (type.isUnion()) {
      const stringMembers = type.types.filter((t) => t.isStringLiteral());
      const numberMembers = type.types.filter((t) => !!(t.getFlags() & ts.TypeFlags.NumberLiteral));

      if (stringMembers.length > 0 && numberMembers.length > 0) {
        specErrors.push(
          `${parentPath ? `${parentPath}: ` : ''}mixed enum (both string and numeric members) is not supported — ` +
            `deep validation is skipped. Consider splitting into separate string and numeric enums.`
        );
        return { [KIND]: 'any' } as import('./types').AnyShape;
      }
      if (stringMembers.length > 0) {
        return { [KIND]: 'stringEnum', [ENUM_VALUES]: stringMembers.map((t) => (t as ts.StringLiteralType).value) } as import('./types').StringEnumShape;
      }
      if (numberMembers.length > 0) {
        return { [KIND]: 'numberEnum', [NUM_ENUM_VALUES]: numberMembers.map((t) => (t as ts.NumberLiteralType).value) } as import('./types').NumberEnumShape;
      }
    }

    if ((type as ts.LiteralType).value !== undefined) {
      const val = (type as ts.LiteralType).value;
      if (typeof val === 'string') return { [KIND]: 'stringEnum', [ENUM_VALUES]: [val] } as import('./types').StringEnumShape;
      if (typeof val === 'number') return { [KIND]: 'numberEnum', [NUM_ENUM_VALUES]: [val] } as import('./types').NumberEnumShape;
    }

    return { [KIND]: 'any' } as import('./types').AnyShape;
  }

  // Union types.
  if (type.isUnion()) {
    const hasNull = type.types.some((t) => !!(t.getFlags() & ts.TypeFlags.Null));
    const hasUndefined = type.types.some((t) => !!(t.getFlags() & ts.TypeFlags.Undefined));
    const nonNullable = type.types.filter(
      (t) => !(t.getFlags() & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))
    );

    if (hasNull && parentPath) nullablePaths.add(parentPath);
    if (hasUndefined && parentPath) optionalPaths.add(parentPath);

    const allStringLiterals = nonNullable.length > 0 && nonNullable.every((t) => t.isStringLiteral());
    const allNumberLiterals = nonNullable.length > 0 && nonNullable.every((t) => !!(t.getFlags() & ts.TypeFlags.NumberLiteral));
    const allBooleanLiterals = nonNullable.length > 0 && nonNullable.every((t) => !!(t.getFlags() & ts.TypeFlags.BooleanLiteral));

    if (allStringLiterals) {
      return { [KIND]: 'stringEnum', [ENUM_VALUES]: nonNullable.map((t) => (t as ts.StringLiteralType).value) } as import('./types').StringEnumShape;
    }
    if (allNumberLiterals) {
      return { [KIND]: 'numberEnum', [NUM_ENUM_VALUES]: nonNullable.map((t) => (t as ts.NumberLiteralType).value) } as import('./types').NumberEnumShape;
    }
    if (allBooleanLiterals) {
      return true;
    }

    if (nonNullable.length > 1) {
      const allObjects = nonNullable.every((t) => {
        const f = t.getFlags();
        return !(f & (
          ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean |
          ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BooleanLiteral
        ));
      });
      const kind = allObjects ? 'discriminated/object union' : 'mixed primitive union';
      specErrors.push(
        `${parentPath ? `${parentPath}: ` : ''}unsupported ${kind} type — deep validation is not possible. ` +
          `Consider using a flat structure or a string/numeric literal union instead.`
      );
      return { [KIND]: 'any' } as import('./types').AnyShape;
    }

    const real = nonNullable[0];
    if (!real) return { [KIND]: 'any' } as import('./types').AnyShape;

    return buildShape(real, checker, optionalPaths, nullablePaths, specErrors, tagMap, depth + 1, declNode, parentPath);
  }

  // Object / interface types.
  const props = checker.getPropertiesOfType(type);
  const indexInfos = checker.getIndexInfosOfType(type);
  const hasIndexSignature = indexInfos.length > 0;

  if (indexInfos.length > 1) {
    specErrors.push(
      `${parentPath ? `${parentPath}: ` : ''}interface has multiple index signatures — ` +
        `only the first is validated. Consider consolidating to a single [key: string] index signature.`
    );
  }

  if (props.length > 0) {
    const shape: Shape = {};

    for (const prop of props) {
      const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;

      const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
      if (propType.getCallSignatures().length > 0) {
        specErrors.push(
          `${parentPath ? `${parentPath}: ` : ''}property '${prop.getName()}' has a function type and ` +
            `cannot be represented in YAML — remove it from the interface`
        );
        continue;
      }

      // Native Date guard.
      if (checker.typeToString(type) === 'Date') {
        specErrors.push(
          `${parentPath ? `${parentPath}: ` : ''}property '${prop.getName()}' is typed as Date — ` +
            `use string with @${tagMap.dateFormat} instead, or rely on the built-in ISO 8601 validation`
        );
        shape[prop.getName()] = { [KIND]: 'any' } as import('./types').AnyShape;
        continue;
      }

      const fullPath = parentPath ? `${parentPath}.${prop.getName()}` : prop.getName();
      if (isOptional) optionalPaths.add(fullPath);

      shape[prop.getName()] = buildShape(
        propType, checker, optionalPaths, nullablePaths, specErrors, tagMap,
        depth + 1, decl, fullPath
      );
    }

    if (hasIndexSignature) {
      if (checker.typeToString(indexInfos[0].keyType) === 'number') {
        specErrors.push(
          `${parentPath ? `${parentPath}: ` : ''}numeric index signature [key: number] cannot be enforced from YAML — ` +
            `YAML keys are always strings. Consider using [key: string] instead.`
        );
      }

      const indexDecl = indexInfos[0].declaration;
      const indexValueShape = buildShape(
        indexInfos[0].type, checker, optionalPaths, nullablePaths, specErrors, tagMap,
        depth + 1, indexDecl,
        parentPath ? `${parentPath}.[index]` : '[index]'
      );
      return { [KIND]: 'objectWithIndex', properties: shape, valueShape: indexValueShape } as import('./types').ObjectWithIndexShape;
    }

    return shape;
  }

  if (hasIndexSignature) {
    if (checker.typeToString(indexInfos[0].keyType) === 'number') {
      specErrors.push(
        `${parentPath ? `${parentPath}: ` : ''}numeric index signature [key: number] cannot be enforced from YAML — ` +
          `YAML keys are always strings. Consider using [key: string] instead.`
      );
    }

    const indexDecl = indexInfos[0].declaration;
    const indexValueShape = buildShape(
      indexInfos[0].type, checker, optionalPaths, nullablePaths, specErrors, tagMap,
      depth + 1, indexDecl,
      parentPath ? `${parentPath}.[index]` : '[index]'
    );
    return { [KIND]: 'record', valueShape: indexValueShape } as import('./types').RecordShape;
  }

  // Empty object `{}` — accept any object, let reverse check flag unknown keys.
  return {};
}

// ----------------------------------------------------------------
// loadShape — entry point: compile the TS file and return the shape
// ----------------------------------------------------------------

export function loadShape(options: {
  interfaceFile: string;
  typeName: string;
  tagMap: TagMap;
}): BuildShapeResult {
  const { interfaceFile, typeName, tagMap } = options;

  const program = ts.createProgram([interfaceFile], { strict: true, noEmit: true });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(interfaceFile);

  if (!sourceFile) throw new Error(`Could not load ${interfaceFile}`);

  let shape: Shape | null = null;
  const optionalPaths = new Set<string>();
  const nullablePaths = new Set<string>();
  const specErrors: string[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
      shape = buildShape(
        checker.getTypeAtLocation(node),
        checker, optionalPaths, nullablePaths, specErrors, tagMap
      ) as Shape;
    } else if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      shape = buildShape(
        checker.getTypeAtLocation(node.type),
        checker, optionalPaths, nullablePaths, specErrors, tagMap
      ) as Shape;
    }
  });

  if (!shape) throw new Error(`Type "${typeName}" not found in ${interfaceFile}`);

  return { shape, optionalPaths, nullablePaths, specErrors };
}
