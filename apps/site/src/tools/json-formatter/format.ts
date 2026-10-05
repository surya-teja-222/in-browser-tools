export type Indent = "2" | "4" | "tab";

export interface FormatOptions {
  mode: "format" | "minify";
  indent: Indent;
  sortKeys: boolean;
}

export interface JsonError {
  message: string;
  /** 0-based character offset into the input. */
  offset: number;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
}

export type FormatResult = { ok: true; output: string } | { ok: false; error: JsonError };

// JSON.parse source text access (ES2026). Lets us keep numbers exactly as written, so formatting
// never changes a value (12345678901234567890 would otherwise be rounded, 1.0 would become 1).
type RawJSON = { readonly rawJSON: string };
const JSONx = JSON as typeof JSON & {
  rawJSON?: (text: string) => RawJSON;
  isRawJSON?: (value: unknown) => value is RawJSON;
};
const preserveNumbers = typeof JSONx.rawJSON === "function";

export function formatJson(input: string, options: FormatOptions): FormatResult {
  let value: unknown;
  try {
    value = JSON.parse(input, function (this: unknown, _key, val, context?: { source?: string }) {
      if (preserveNumbers && typeof val === "number" && context?.source) {
        return JSONx.rawJSON?.(context.source);
      }
      return val;
    } as Parameters<typeof JSON.parse>[1]);
  } catch (err) {
    return { ok: false, error: describeError(input, err) };
  }
  if (options.sortKeys) value = sortKeysDeep(value);
  const space =
    options.mode === "minify"
      ? undefined
      : options.indent === "tab"
        ? "\t"
        : Number(options.indent);
  return { ok: true, output: JSON.stringify(value, null, space) };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object" || JSONx.isRawJSON?.(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function describeError(input: string, err: unknown): JsonError {
  if (input.trim() === "") return { message: "Input is empty", ...position(input, 0) };
  // JSON.parse messages differ between browsers and often have no position, so find it ourselves.
  const located = locateError(input);
  if (located) return { message: located.message, ...position(input, located.offset) };
  return { message: err instanceof Error ? err.message : String(err), ...position(input, 0) };
}

export function position(text: string, offset: number) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { offset, line, column: offset - lineStart + 1 };
}

class Located extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

/** Finds the first syntax error in a JSON document. Returns null if the document is valid. */
export function locateError(text: string): { message: string; offset: number } | null {
  let i = 0;
  const fail = (message: string, at = i): never => {
    throw new Located(message, at);
  };
  const describe = (c: string | undefined) =>
    c === undefined ? "the end of the input" : JSON.stringify(c);
  const skipWhitespace = () => {
    while (i < text.length && " \t\n\r".includes(text[i] as string)) i++;
  };

  function value(): void {
    skipWhitespace();
    const c = text[i];
    if (c === "{") object();
    else if (c === "[") array();
    else if (c === '"') string();
    else if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) number();
    else literal(c);
  }

  function literal(c: string | undefined) {
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return;
      }
    }
    fail(`Expected a value but found ${describe(c)}`);
  }

  function object() {
    i++;
    skipWhitespace();
    if (text[i] === "}") {
      i++;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[i] !== '"')
        fail(`Expected a property name in double quotes but found ${describe(text[i])}`);
      string();
      skipWhitespace();
      if (text[i] !== ":")
        fail(`Expected ":" after the property name but found ${describe(text[i])}`);
      i++;
      value();
      skipWhitespace();
      if (text[i] === "}") {
        i++;
        return;
      }
      if (text[i] !== ",")
        fail(`Expected "," or "}" after the property value but found ${describe(text[i])}`);
      const comma = i++;
      skipWhitespace();
      if (text[i] === "}") fail("Trailing comma before }", comma);
    }
  }

  function array() {
    i++;
    skipWhitespace();
    if (text[i] === "]") {
      i++;
      return;
    }
    for (;;) {
      value();
      skipWhitespace();
      if (text[i] === "]") {
        i++;
        return;
      }
      if (text[i] !== ",")
        fail(`Expected "," or "]" after the array item but found ${describe(text[i])}`);
      const comma = i++;
      skipWhitespace();
      if (text[i] === "]") fail("Trailing comma before ]", comma);
    }
  }

  function string() {
    const start = i++;
    for (;;) {
      const c = text[i];
      if (c === undefined) fail("String is never closed", start);
      if (c === '"') {
        i++;
        return;
      }
      if (c === "\\") {
        const next = text[i + 1];
        if (next === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6)))
            fail("Invalid \\u escape, expected 4 hex digits");
          i += 6;
          continue;
        }
        if (next === undefined || !'"\\/bfnrt'.includes(next))
          fail(`Invalid escape \\${next ?? ""}`);
        i += 2;
        continue;
      }
      if ((c as string).charCodeAt(0) < 0x20)
        fail("Line breaks and tabs inside strings must be escaped (\\n, \\t)");
      i++;
    }
  }

  function number() {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = i;
    const m = match.exec(text);
    if (!m) fail("Invalid number");
    i += (m as RegExpExecArray)[0].length;
  }

  try {
    value();
    skipWhitespace();
    if (i < text.length) fail(`Unexpected ${describe(text[i])} after the end of the JSON value`);
    return null;
  } catch (err) {
    if (err instanceof Located) return { message: err.message, offset: err.offset };
    return null; // e.g. nesting too deep for the call stack; fall back to the browser's message
  }
}
