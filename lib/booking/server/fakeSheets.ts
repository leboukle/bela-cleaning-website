// Test-only helper: a faithful, stateful stand-in for the Google Sheets
// API surface that sheetsClient.ts exposes, so the REAL repository classes
// (GoogleSheetsBookingRepository, GoogleRecurringScheduleRepository) can be
// exercised end to end — including their A1 range arithmetic, column
// lookups and row-order semantics — instead of an interface double.
//
// Modelled Sheets semantics (the only ones the code depends on):
//   * a worksheet is a grid; appendRow inserts a NEW row after the last row
//     (INSERT_ROWS) and reports which row it got;
//   * appends are serialized — each lands in exactly one position;
//   * a values.get returns the requested rectangle, dropping trailing empty
//     cells/rows, with [] for interior empty rows;
//   * batchGet is one consistent snapshot; every call yields to the event
//     loop first, so concurrent flows interleave at every storage access.
// What it can NOT prove is that Google itself honours those semantics under
// real load — that is what the owner-run live claim self-test is for.

const tick = () => Promise.resolve();

function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

type Rect = { tab: string; c1: number; c2: number | null; r1: number; r2: number | null };

function parseRange(range: string): Rect {
  const m = /^(.+)!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(range);
  if (!m) throw new Error(`FakeSheets cannot parse range: ${range}`);
  const [, tab, a, ar, b, br] = m;
  const c1 = colToIndex(a);
  const c2 = b ? colToIndex(b) : c1;
  const r1 = ar ? Number(ar) : 1;
  const r2 = br ? Number(br) : b ? null : ar ? Number(ar) : null;
  return { tab, c1, c2, r1, r2 };
}

export class FakeSheets {
  private tabs = new Map<string, string[][]>();
  /** Operation log, for assertions about what the code actually did. */
  log: Array<{ op: string; range: string }> = [];
  /** Return true to make the matching write throw once (crash / transient failure injection). */
  failWhen: ((op: string, range: string) => boolean) | null = null;

  constructor(headers: Record<string, readonly string[]>) {
    for (const [tab, cols] of Object.entries(headers)) this.tabs.set(tab, [[...cols]]);
  }

  rows(tab: string): string[][] {
    const rows = this.tabs.get(tab);
    if (!rows) throw new Error(`No worksheet "${tab}"`);
    return rows;
  }

  private snapshot(range: string): string[][] {
    const rect = parseRange(range);
    const grid = this.rows(rect.tab);
    const lastRow = rect.r2 ?? grid.length;
    const out: string[][] = [];
    for (let r = rect.r1; r <= Math.min(lastRow, grid.length); r++) {
      const source = grid[r - 1] ?? [];
      const last = rect.c2 === null ? source.length - 1 : rect.c2;
      const cells: string[] = [];
      for (let c = rect.c1; c <= last; c++) cells.push(source[c] ?? "");
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      out.push(cells);
    }
    while (out.length > 0 && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  private maybeFail(op: string, range: string): void {
    if (this.failWhen?.(op, range)) {
      this.failWhen = null;
      throw new Error(`simulated Sheets failure during ${op} ${range}`);
    }
  }

  // ---- the sheetsClient.ts surface ----
  getRange = async (range: string): Promise<string[][]> => {
    await tick();
    this.log.push({ op: "get", range });
    return this.snapshot(range);
  };

  batchGetRanges = async (ranges: string[]): Promise<string[][][]> => {
    await tick();
    this.log.push({ op: "batchGet", range: ranges.join(",") });
    return ranges.map((r) => this.snapshot(r));
  };

  appendRow = async (range: string, row: Array<string | number | boolean>): Promise<{ rowNumber: number | null }> => {
    await tick();
    this.maybeFail("append", range);
    const { tab } = parseRange(range);
    const grid = this.rows(tab);
    grid.push(row.map((v) => String(v)));
    this.log.push({ op: "append", range });
    return { rowNumber: grid.length };
  };

  updateRange = async (range: string, row: Array<string | number | boolean>): Promise<void> => {
    await tick();
    this.maybeFail("update", range);
    this.write(range, row);
  };

  batchUpdateRanges = async (updates: Array<{ range: string; row: Array<string | number | boolean> }>): Promise<void> => {
    await tick();
    this.maybeFail("batchUpdate", updates.map((u) => u.range).join(","));
    for (const u of updates) this.write(u.range, u.row);
  };

  private write(range: string, row: Array<string | number | boolean>): void {
    const rect = parseRange(range);
    const grid = this.rows(rect.tab);
    while (grid.length < rect.r1) grid.push([]);
    const target = grid[rect.r1 - 1];
    row.forEach((v, i) => {
      target[rect.c1 + i] = String(v);
    });
    for (let i = 0; i < target.length; i++) if (target[i] === undefined) target[i] = "";
    this.log.push({ op: "write", range });
  }
}
