import { describe, expect, it } from "vitest";
import { formatJson, locateError } from "./format";

const pretty = { mode: "format", indent: "2", sortKeys: false } as const;

describe("formatJson", () => {
  it("pretty prints with the chosen indent", () => {
    expect(formatJson('{"a":[1,2]}', pretty)).toEqual({
      ok: true,
      output: '{\n  "a": [\n    1,\n    2\n  ]\n}',
    });
    expect(formatJson('{"a":1}', { ...pretty, indent: "tab" })).toEqual({
      ok: true,
      output: '{\n\t"a": 1\n}',
    });
  });

  it("minifies", () => {
    expect(formatJson('{ "a" : [ 1, 2 ] }', { ...pretty, mode: "minify" })).toEqual({
      ok: true,
      output: '{"a":[1,2]}',
    });
  });

  it("sorts keys at every depth without reordering arrays", () => {
    const result = formatJson('{"b":{"d":1,"c":2},"a":[3,1]}', {
      ...pretty,
      mode: "minify",
      sortKeys: true,
    });
    expect(result).toEqual({ ok: true, output: '{"a":[3,1],"b":{"c":2,"d":1}}' });
  });

  it("keeps numbers exactly as written", () => {
    const result = formatJson('{"id":12345678901234567890,"price":1.50}', {
      ...pretty,
      mode: "minify",
    });
    expect(result).toEqual({ ok: true, output: '{"id":12345678901234567890,"price":1.50}' });
  });

  it("reports line and column for errors", () => {
    const result = formatJson('{\n  "a": 1,\n  "b": 2,\n}', pretty);
    expect(result).toMatchObject({
      ok: false,
      error: { line: 3, column: 9, message: "Trailing comma before }" },
    });
  });

  it("explains empty input", () => {
    expect(formatJson("  ", pretty)).toMatchObject({
      ok: false,
      error: { message: "Input is empty" },
    });
  });
});

describe("locateError", () => {
  it.each([
    ['{"a" 1}', 5, 'Expected ":" after the property name but found "1"'],
    ["{a:1}", 1, 'Expected a property name in double quotes but found "a"'],
    ['["a" "b"]', 5, 'Expected "," or "]" after the array item but found "\\""'],
    ['"abc', 0, "String is never closed"],
    ['{"a":1} x', 8, 'Unexpected "x" after the end of the JSON value'],
    ["[1,]", 2, "Trailing comma before ]"],
    ["{\"a\":'b'}", 5, 'Expected a value but found "\'"'],
    ['"a\\qb"', 2, "Invalid escape \\q"],
  ])("%s -> offset %i", (input, offset, message) => {
    expect(locateError(input)).toEqual({ offset, message });
  });

  it("returns null for valid JSON", () => {
    expect(locateError('{"a":[1,-2.5e3,true,null,"x\\u00e9"]}')).toBeNull();
  });
});
