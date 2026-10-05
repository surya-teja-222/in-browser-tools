import {
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/ui/Button";
import { FileDrop } from "@/ui/FileDrop";
import { type FormatOptions, formatJson, type Indent } from "./format";

const PREFS_KEY = "json-formatter:prefs";
const MAX_BYTES = 100 * 1024 * 1024;

const SAMPLE = `{"tool":"json-formatter","runsIn":"your browser","features":["format","minify","sort keys","exact error positions"],"largeNumbersKept":12345678901234567890,"nested":{"works":true,"depth":2}}`;

function loadPrefs(): FormatOptions {
  const fallback: FormatOptions = { mode: "format", indent: "2", sortKeys: false };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return fallback;
  }
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<FormatOptions>(loadPrefs);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep typing responsive on large documents: formatting runs against a deferred copy.
  const deferredInput = useDeferredValue(input);
  const result = useMemo(
    () => (deferredInput.trim() ? formatJson(deferredInput, options) : null),
    [deferredInput, options],
  );
  const output = result?.ok ? result.output : "";
  const sizes = useMemo(() => {
    const encoder = new TextEncoder();
    return { input: encoder.encode(deferredInput).length, output: encoder.encode(output).length };
  }, [deferredInput, output]);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(options));
  }, [options]);

  async function openFile(file: File) {
    setFileError(null);
    if (file.size > MAX_BYTES) {
      setFileError(
        `${file.name} is ${formatBytes(file.size)}. Files up to ${formatBytes(MAX_BYTES)} are supported.`,
      );
      return;
    }
    setInput(await file.text());
    setFileName(file.name);
  }

  function goToError() {
    if (result?.ok !== false || !inputRef.current) return;
    const el = inputRef.current;
    el.focus();
    el.setSelectionRange(result.error.offset, result.error.offset + 1);
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const url = URL.createObjectURL(new Blob([output], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download =
      fileName?.replace(/(\.json)?$/i, options.mode === "minify" ? ".min.json" : ".json") ??
      "formatted.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const set = <K extends keyof FormatOptions>(key: K, value: FormatOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  return (
    <FileDrop
      accept=".json,application/json,text/plain"
      onFiles={([file]) => file && openFile(file)}
    >
      {({ open, dragging }) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <fieldset className="flex rounded-control border border-rule bg-surface p-0.5">
              <legend className="sr-only">Output style</legend>
              {(["format", "minify"] as const).map((mode) => (
                <label
                  key={mode}
                  className={cn(
                    "cursor-pointer rounded-[0.375rem] px-3 py-1.5 text-sm font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-sun",
                    options.mode === mode ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={mode}
                    checked={options.mode === mode}
                    onChange={() => set("mode", mode)}
                    className="sr-only"
                  />
                  {mode === "format" ? "Format" : "Minify"}
                </label>
              ))}
            </fieldset>

            <label
              className={cn(
                "flex items-center gap-2 text-sm",
                options.mode === "minify" && "opacity-50",
              )}
            >
              Indent
              <select
                value={options.indent}
                disabled={options.mode === "minify"}
                onChange={(e) => set("indent", e.target.value as Indent)}
                className="h-9 rounded-control border border-rule bg-surface px-2 text-sm"
              >
                <option value="2">2 spaces</option>
                <option value="4">4 spaces</option>
                <option value="tab">Tabs</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={options.sortKeys}
                onChange={(e) => set("sortKeys", e.target.checked)}
                className="size-4 accent-[var(--color-sun)]"
              />
              Sort keys
            </label>

            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button onClick={open}>
                <FolderOpenIcon /> Open file
              </Button>
              <Button onClick={copy} disabled={!output}>
                {copied ? <CheckCircleIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="primary" onClick={download} disabled={!output}>
                <DownloadSimpleIcon /> Download
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "grid gap-4 rounded-panel transition-shadow lg:grid-cols-2",
              dragging && "ring-2 ring-sun ring-offset-4 ring-offset-paper",
            )}
          >
            <Panel
              label="Input"
              htmlFor="json-input"
              meta={
                fileName
                  ? `${fileName}, ${formatBytes(sizes.input)}`
                  : input
                    ? formatBytes(sizes.input)
                    : ""
              }
            >
              <textarea
                id="json-input"
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setFileName(null);
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                placeholder="Paste JSON here, or drop a .json file"
                aria-invalid={result?.ok === false}
                aria-describedby="json-status"
                className="h-[min(60dvh,36rem)] w-full resize-none bg-transparent p-4 font-mono text-[0.8125rem] leading-relaxed placeholder:font-sans placeholder:text-[0.9375rem] placeholder:text-ink-muted focus:outline-none"
              />
            </Panel>

            <Panel
              label="Output"
              metaId="json-status"
              meta={
                result?.ok ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircleIcon className="size-4 text-ink" /> Valid JSON,{" "}
                    {formatBytes(sizes.output)}
                  </span>
                ) : result?.ok === false ? (
                  <span className="text-danger">Error on line {result.error.line}</span>
                ) : (
                  ""
                )
              }
            >
              {output ? (
                <section
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard reachable
                  tabIndex={0}
                  aria-label="Formatted output"
                  className="h-[min(60dvh,36rem)] overflow-auto"
                >
                  <pre className="p-4 font-mono text-[0.8125rem] leading-relaxed">{output}</pre>
                </section>
              ) : (
                <div className="flex h-[min(60dvh,36rem)] flex-col items-start justify-center gap-4 p-8 text-ink-muted">
                  {fileError ? (
                    <p className="flex max-w-[44ch] gap-2 text-danger">
                      <WarningCircleIcon className="mt-0.5 size-5 shrink-0" /> {fileError}
                    </p>
                  ) : result?.ok === false ? (
                    <>
                      <div className="flex gap-2.5 text-danger">
                        <WarningCircleIcon className="mt-0.5 size-5 shrink-0" />
                        <div>
                          <p className="font-medium">
                            Line {result.error.line}, column {result.error.column}
                          </p>
                          <p className="mt-1 max-w-[44ch] text-ink">{result.error.message}</p>
                        </div>
                      </div>
                      <Button onClick={goToError} className="ml-7.5">
                        Show in input
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="max-w-[34ch]">
                        The formatted result shows up here as you type.
                      </p>
                      {!input && <Button onClick={() => setInput(SAMPLE)}>Try a sample</Button>}
                    </>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </FileDrop>
  );
}

function Panel({
  label,
  htmlFor,
  meta,
  metaId,
  children,
}: {
  label: string;
  htmlFor?: string;
  meta: ReactNode;
  /** Gives the meta slot an id and makes it a live region, for status that should be announced. */
  metaId?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      <div className="flex h-10 items-center justify-between border-b border-rule px-4 text-sm">
        <Label htmlFor={htmlFor} className="font-medium">
          {label}
        </Label>
        <span
          id={metaId}
          aria-live={metaId ? "polite" : undefined}
          className="truncate pl-4 text-ink-muted"
        >
          {meta}
        </span>
      </div>
      {children}
    </div>
  );
}
