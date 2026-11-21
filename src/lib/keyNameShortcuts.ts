const COUNTRY_CODES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA " +
  "RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ " +
  "VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" "));

const COUNTRY_ALIASES: Record<string, string> = { UK: "GB" };

function countryFlag(code: string): string {
  return String.fromCodePoint(...code.split("").map((letter) => 0x1F1E6 + letter.charCodeAt(0) - 65));
}

function replaceWithCaret(
  value: string,
  caret: number,
  expression: RegExp,
  replacement: (match: string, offset: number) => string
): { value: string; caret: number } {
  let nextCaret = caret;
  const nextValue = value.replace(expression, (...args: unknown[]) => {
    const match = args[0] as string;
    const offset = args[args.length - 2] as number;
    const next = replacement(match, offset);
    if (offset + match.length <= caret) nextCaret += next.length - match.length;
    return next;
  });
  return { value: nextValue, caret: nextCaret };
}

/** Converts only complete country shortcuts and double hyphens typed in key-name inputs. */
export function normalizeKeyNameInput(value: string, caret: number): { value: string; caret: number } {
  const countries = replaceWithCaret(value, caret, /:([A-Za-z]{2})(?![A-Za-z])/g, (match) => {
    const entered = match.slice(1).toUpperCase();
    const code = COUNTRY_ALIASES[entered] || entered;
    return COUNTRY_CODES.has(code) ? countryFlag(code) : match;
  });
  const symbols = replaceWithCaret(countries.value, countries.caret, /--/g, () => "➜");
  const bullets = replaceWithCaret(symbols.value, symbols.caret, /\.\./g, () => "•");
  const leftBrackets = replaceWithCaret(bullets.value, bullets.caret, /\(\(/g, () => "❰");
  return replaceWithCaret(leftBrackets.value, leftBrackets.caret, /\)\)/g, () => "❱");
}

function setKeyNameCaret(input: HTMLInputElement, caret: number): void {
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(caret, caret);
    });
  }
}

function isRegionalIndicator(value: string): boolean {
  const point = value.codePointAt(0) || 0;
  return point >= 0x1F1E6 && point <= 0x1F1FF;
}

function flagRanges(value: string): Array<{ start: number; end: number }> {
  const chars = Array.from(value);
  const ranges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (let i = 0; i < chars.length;) {
    if (!isRegionalIndicator(chars[i])) {
      offset += chars[i].length;
      i++;
      continue;
    }
    const runStart = offset;
    let end = i;
    let runLength = 0;
    while (end < chars.length && isRegionalIndicator(chars[end])) {
      runLength += chars[end].length;
      end++;
    }
    let pairOffset = runStart;
    for (let pair = 0; pair + 1 < end - i; pair += 2) {
      const pairLength = chars[i + pair].length + chars[i + pair + 1].length;
      ranges.push({ start: pairOffset, end: pairOffset + pairLength });
      pairOffset += pairLength;
    }
    offset = runStart + runLength;
    i = end;
  }
  return ranges;
}

/** Returns a full-flag deletion for Backspace/Delete, or null for ordinary text. */
export function deleteKeyNameFlag(input: HTMLInputElement, key: string): { value: string; caret: number } | null {
  if (key !== "Backspace" && key !== "Delete") return null;
  let start = input.selectionStart ?? 0;
  let end = input.selectionEnd ?? start;
  const ranges = flagRanges(input.value);

  if (start !== end) {
    for (const range of ranges) {
      if (start < range.end && end > range.start) {
        start = Math.min(start, range.start);
        end = Math.max(end, range.end);
      }
    }
    return { value: input.value.slice(0, start) + input.value.slice(end), caret: start };
  }

  const range = key === "Backspace"
    ? ranges.find((item) => start > item.start && start <= item.end)
    : ranges.find((item) => start >= item.start && start < item.end);
  if (!range) return null;
  return {
    value: input.value.slice(0, range.start) + input.value.slice(range.end),
    caret: range.start,
  };
}

/** Restores a valid cursor position after programmatic input replacement. */
export function restoreKeyNameCaret(input: HTMLInputElement, caret: number): void {
  setKeyNameCaret(input, caret);
}

/** Keeps the insertion point valid after replacing ASCII shortcuts with Unicode emoji. */
export function applyKeyNameShortcuts(input: HTMLInputElement): string {
  const original = input.value;
  const { value, caret } = normalizeKeyNameInput(original, input.selectionStart ?? original.length);
  if (value !== original) setKeyNameCaret(input, caret);
  return value;
}
