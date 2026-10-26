export interface FileColors {
  directory: string;
  file: string;
  suffixes: { suffix: string; exact: boolean; style: string }[];
}

const basic = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
               "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"];

function indexed(index: number): string {
  if (index < 16) return basic[index]!;
  if (index >= 232) return `rgb(${Array(3).fill(8 + (index - 232) * 10).join(",")})`;
  const value = index - 16;
  const level = (part: number) => part ? 55 + part * 40 : 0;
  return `rgb(${[Math.floor(value / 36), Math.floor(value / 6) % 6, value % 6].map(level).join(",")})`;
}

function sgr(value: string): string {
  if (!/^(?:\d+(?:;\d+)*)?$/.test(value)) return "";
  const codes = value ? value.split(";").map(Number) : [0];
  let foreground: string | undefined, background: string | undefined;
  let bold = false, italic = false, reverse = false;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) { foreground = background = undefined; bold = italic = reverse = false; }
    else if (code === 1 || code === 22) bold = code === 1;
    else if (code === 3 || code === 23) italic = code === 3;
    else if (code === 7 || code === 27) reverse = code === 7;
    else if (code >= 30 && code <= 37) foreground = indexed(code - 30);
    else if (code >= 90 && code <= 97) foreground = indexed(code - 90 + 8);
    else if (code >= 40 && code <= 47) background = indexed(code - 40);
    else if (code >= 100 && code <= 107) background = indexed(code - 100 + 8);
    else if (code === 39) foreground = undefined;
    else if (code === 49) background = undefined;
    else if (code === 38 || code === 48) {
      const mode = codes[++i];
      const count = mode === 5 ? 1 : mode === 2 ? 3 : 0;
      const channels = codes.slice(i + 1, i + 1 + count);
      if (!count || channels.length !== count || channels.some(value => value < 0 || value > 255)) return "";
      const color = mode === 5 ? indexed(channels[0]!) : `rgb(${channels.join(",")})`;
      i += count;
      if (code === 38) foreground = color;
      else background = color;
    }
    // Underline/blink/conceal are intentionally omitted: links stay plain and readable.
  }
  if (reverse) [foreground, background] = [background || "var(--browser-background)",
                                         foreground || "var(--browser-foreground)"];
  return [foreground && `color:${foreground}`, background && `background-color:${background}`,
          bold && "font-weight:bold", italic && "font-style:italic"].filter(Boolean).join(";");
}

function split(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (char === "\\" && i + 1 < value.length) current += char + value[++i];
    else if (char === delimiter) { parts.push(current); current = ""; }
    else current += char;
  }
  parts.push(current);
  return parts;
}

function fold(value: string): string {
  return value.replace(/[A-Z]/g, letter => letter.toLowerCase());
}

export function compileLSColors(value: string): FileColors {
  const types = new Map<string, string>();
  const suffixes = new Map<string, { style: string; sequence: string }>();
  for (const item of split(value, ":")) {
    const fields = split(item, "=");
    if (fields.length !== 2) continue;
    const key = fields[0]!.replace(/\\([\\:=])/g, "$1");
    const style = sgr(fields[1]!);
    if (key.startsWith("*")) {
      const suffix = key.slice(1);
      suffixes.delete(suffix);
      suffixes.set(suffix, { style, sequence: fields[1]! });
    } else types.set(key, style);
  }
  // GNU ls folds suffix case unless differently cased rules specify different styles.
  const groups = new Map<string, Set<string>>();
  for (const [suffix, { sequence }] of suffixes) {
    const folded = fold(suffix);
    if (!groups.has(folded)) groups.set(folded, new Set());
    groups.get(folded)!.add(sequence);
  }
  return { directory: types.get("di") ?? types.get("no") ?? "", file: types.get("fi") ?? types.get("no") ?? "",
           suffixes: [...suffixes].reverse().map(([suffix, { style }]) => ({
             suffix: groups.get(fold(suffix))!.size > 1 ? suffix : fold(suffix),
             style, exact: groups.get(fold(suffix))!.size > 1,
           })) };
}

export function entryColor(colors: FileColors, name: string, directory: boolean): string {
  if (directory) return colors.directory;
  const folded = fold(name);
  return colors.suffixes.find(rule => rule.exact ? name.endsWith(rule.suffix)
    : folded.endsWith(rule.suffix))?.style ?? colors.file;
}
