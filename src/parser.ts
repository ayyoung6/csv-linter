export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Field {
  value: string;
  quoted: boolean;
  start: Position;
  end: Position;
}

export type LineEnding = 'lf' | 'cr' | 'crlf' | 'none';

export interface Row {
  fields: Field[];
  startLine: number;
  endLine: number;
  // 'none' means the row ended at end-of-file with no trailing newline, which
  // is not a mismatch worth flagging on its own.
  lineEnding: LineEnding;
  lineEndingPosition: Position;
}

export interface Finding {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  position: Position;
}

export interface ParseResult {
  rows: Row[];
  findings: Finding[];
}

// A validator that just says "invalid CSV" is not very useful. This parser
// walks the text one character at a time and records the exact line, column
// and offset of every field boundary, so a caller can always point at the
// character that caused a problem instead of the row it happened in.
export function parseCsv(text: string): ParseResult {
  const rows: Row[] = [];
  const findings: Finding[] = [];

  let offset = 0;
  let line = 1;
  let column = 1;
  let pendingEmptyRow = true;

  let fields: Field[] = [];
  let rowStartLine = line;

  let fieldValue = '';
  let fieldStart: Position = { line, column, offset };
  let quoted = false;
  let inQuotes = false;
  let quoteClosed = false;
  let reportedTrailingGarbage = false;

  function currentPosition(): Position {
    return { line, column, offset };
  }

  function advance(): string {
    const ch = text[offset];
    offset += 1;
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    pendingEmptyRow = false;
    return ch;
  }

  function startField(): void {
    fieldValue = '';
    fieldStart = currentPosition();
    quoted = false;
    inQuotes = false;
    quoteClosed = false;
    reportedTrailingGarbage = false;
  }

  function endField(): void {
    fields.push({ value: fieldValue, quoted, start: fieldStart, end: currentPosition() });
  }

  function endRow(lineEnding: LineEnding, lineEndingPosition: Position): void {
    endField();
    rows.push({ fields, startLine: rowStartLine, endLine: line, lineEnding, lineEndingPosition });
    fields = [];
    rowStartLine = line;
    pendingEmptyRow = true;
  }

  startField();

  while (offset < text.length) {
    const ch = text[offset];

    if (inQuotes) {
      if (ch === '"') {
        if (text[offset + 1] === '"') {
          advance();
          advance();
          fieldValue += '"';
        } else {
          advance();
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        fieldValue += advance();
      }
      continue;
    }

    // Once a quoted field has been closed, only a delimiter or a line break
    // is allowed before the next field starts. Anything else means the file
    // has a stray quote or unescaped text glued onto the field.
    if (quoteClosed && ch !== ',' && ch !== '\r' && ch !== '\n') {
      if (!reportedTrailingGarbage) {
        findings.push({
          severity: 'error',
          code: 'text-after-quote',
          message: 'unexpected text after the closing quote (use "" to include a literal quote inside a quoted field)',
          position: currentPosition(),
        });
        reportedTrailingGarbage = true;
      }
      fieldValue += advance();
      continue;
    }

    if (ch === '"' && fieldValue === '' && !quoteClosed) {
      quoted = true;
      inQuotes = true;
      advance();
      continue;
    }

    if (ch === ',') {
      advance();
      endField();
      startField();
      continue;
    }

    if (ch === '\r') {
      const lineEndingPosition = currentPosition();
      advance();
      let ending: LineEnding = 'cr';
      if (text[offset] === '\n') {
        advance();
        ending = 'crlf';
      }
      endRow(ending, lineEndingPosition);
      startField();
      continue;
    }

    if (ch === '\n') {
      const lineEndingPosition = currentPosition();
      advance();
      endRow('lf', lineEndingPosition);
      startField();
      continue;
    }

    fieldValue += advance();
  }

  if (inQuotes) {
    findings.push({
      severity: 'error',
      code: 'unterminated-quote',
      message: 'quoted field is opened here but never closed before the end of the file',
      position: fieldStart,
    });
  }

  // A trailing newline should not produce a phantom empty row, but a file
  // that ends mid-field (no trailing newline) still needs its last row.
  if (!pendingEmptyRow) {
    endRow('none', currentPosition());
  }

  return { rows, findings };
}
