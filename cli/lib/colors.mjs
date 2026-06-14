// Tiny ANSI helper. Colors are disabled when stdout is not a TTY, when NO_COLOR
// is set, or when --no-color was passed (set HX_NO_COLOR before importing usage).

const enabled =
  !process.env.NO_COLOR &&
  !process.env.HX_NO_COLOR &&
  process.stdout.isTTY;

function wrap(open, close) {
  return (s) => (enabled ? `[${open}m${s}[${close}m` : String(s));
}

export const c = {
  enabled,
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

// Severity -> colorizer, mirroring the Hub's high/medium/low ranking.
export function severityColor(sev) {
  if (sev === "high") return c.red;
  if (sev === "medium") return c.yellow;
  return c.cyan;
}

export const sym = {
  ok: c.green("✓"),
  warn: c.yellow("!"),
  err: c.red("✗"),
  bullet: c.gray("•"),
  arrow: c.gray("→"),
};
