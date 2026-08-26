import type { Row, Finding } from './parser.js';

const MAX_SNIPPET_LENGTH = 30;

function truncate(value: string): string {
  if (value.length <= MAX_SNIPPET_LENGTH) return value;
  return `${value.slice(0, MAX_SNIPPET_LENGTH)}...`;
}

// A blank line parses as a single empty, unquoted field. That is normal
// (spreadsheet exports do it constantly) and not worth flagging on its own.
function isBlankLine(row: Row): boolean {
  return row.fields.length === 1 && row.fields[0].value === '' && !row.fields[0].quoted;
}

// The most common way a CSV file breaks: an unescaped comma or a value
// dropped during a manual edit leaves a row with the wrong field count.
export function checkFieldCounts(rows: Row[]): Finding[] {
  const findings: Finding[] = [];
  if (rows.length === 0) return findings;

  const header = rows[0];
  const expected = header.fields.length;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankLine(row)) continue;

    const actual = row.fields.length;
    if (actual === expected) continue;

    if (actual < expected) {
      const last = row.fields[row.fields.length - 1];
      const missing = expected - actual;
      const firstMissingColumn = header.fields[actual]?.value || `column ${actual + 1}`;
      findings.push({
        severity: 'error',
        code: 'field-count-mismatch',
        message: `row has ${actual} field${actual === 1 ? '' : 's'} but the header defines ${expected} (missing ${missing} column${missing === 1 ? '' : 's'}, starting with "${firstMissingColumn}")`,
        position: last.end,
      });
    } else {
      const extra = row.fields[expected];
      findings.push({
        severity: 'error',
        code: 'field-count-mismatch',
        message: `row has ${actual} fields but the header defines ${expected} (unexpected extra value "${truncate(extra.value)}")`,
        position: extra.start,
      });
    }
  }

  return findings;
}

// Duplicate or empty column names don't stop the file from parsing, but
// they make it ambiguous for anything downstream that looks up a column
// by name instead of by index.
export function checkHeaderNames(rows: Row[]): Finding[] {
  const findings: Finding[] = [];
  if (rows.length === 0) return findings;

  const header = rows[0];
  const firstSeenAt = new Map<string, number>();

  header.fields.forEach((field, index) => {
    if (field.value === '') {
      findings.push({
        severity: 'warning',
        code: 'empty-header-name',
        message: `column ${index + 1} has no name`,
        position: field.start,
      });
      return;
    }

    const firstIndex = firstSeenAt.get(field.value);
    if (firstIndex === undefined) {
      firstSeenAt.set(field.value, index);
      return;
    }

    findings.push({
      severity: 'warning',
      code: 'duplicate-header-name',
      message: `column name "${field.value}" was already used at column ${firstIndex + 1}`,
      position: field.start,
    });
  });

  return findings;
}
