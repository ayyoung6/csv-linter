import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './parser.js';

function values(rowFields: { value: string }[]): string[] {
  return rowFields.map((f) => f.value);
}

test('parses a simple file with no problems', () => {
  const { rows, findings } = parseCsv('a,b,c\n1,2,3\n');
  assert.equal(findings.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(values(rows[0].fields), ['a', 'b', 'c']);
  assert.deepEqual(values(rows[1].fields), ['1', '2', '3']);
});

test('captures the last row when the file has no trailing newline', () => {
  const { rows, findings } = parseCsv('a,b,c');
  assert.equal(findings.length, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(values(rows[0].fields), ['a', 'b', 'c']);
});

test('a trailing newline does not produce a phantom empty row', () => {
  const { rows } = parseCsv('a,b\n');
  assert.equal(rows.length, 1);
  assert.deepEqual(values(rows[0].fields), ['a', 'b']);
});

test('an empty file has no rows', () => {
  const { rows, findings } = parseCsv('');
  assert.equal(rows.length, 0);
  assert.equal(findings.length, 0);
});

test('a blank line parses as a single empty unquoted field', () => {
  const { rows } = parseCsv('a,b\n\nc,d\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].fields.length, 1);
  assert.equal(rows[1].fields[0].value, '');
  assert.equal(rows[1].fields[0].quoted, false);
});

test('handles quoted fields containing commas and newlines', () => {
  const { rows, findings } = parseCsv('id,note\n1,"hello, world"\n2,"multi\nline"\n');
  assert.equal(findings.length, 0);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].fields[1].value, 'hello, world');
  assert.equal(rows[1].fields[1].quoted, true);
  assert.equal(rows[2].fields[1].value, 'multi\nline');
});

test('unescapes doubled quotes inside a quoted field', () => {
  const { rows, findings } = parseCsv('"a""b",c\n');
  assert.equal(findings.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fields[0].value, 'a"b');
  assert.equal(rows[0].fields[0].quoted, true);
  assert.equal(rows[0].fields[1].value, 'c');
});

test('treats CRLF line endings the same as LF', () => {
  const { rows, findings } = parseCsv('a,b\r\nc,d\r\n');
  assert.equal(findings.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(values(rows[0].fields), ['a', 'b']);
  assert.deepEqual(values(rows[1].fields), ['c', 'd']);
  assert.equal(rows[0].startLine, 1);
  assert.equal(rows[0].endLine, 2);
  assert.equal(rows[1].startLine, 2);
  assert.equal(rows[1].endLine, 3);
});

test('reports an unterminated quote at the position it was opened', () => {
  const { rows, findings } = parseCsv('id,name\n1,"abc\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'unterminated-quote');
  assert.equal(findings[0].severity, 'error');
  assert.deepEqual(findings[0].position, { line: 2, column: 3, offset: 10 });

  // the unterminated field is still returned with whatever text it collected
  assert.equal(rows.length, 2);
  assert.equal(rows[1].fields[1].value, 'abc\n');
  assert.equal(rows[1].fields[1].quoted, true);
});

test('reports text glued onto a field after its closing quote', () => {
  const { rows, findings } = parseCsv('a,b\n"x"y,z\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'text-after-quote');
  assert.equal(findings[0].severity, 'error');
  assert.deepEqual(findings[0].position, { line: 2, column: 4, offset: 7 });

  // parsing keeps going and folds the stray text into the field value
  assert.equal(rows[1].fields[0].value, 'xy');
  assert.equal(rows[1].fields[1].value, 'z');
});

test('only reports text-after-quote once per field even with several stray characters', () => {
  const { findings } = parseCsv('"x"yyy,z\n');
  const textAfterQuote = findings.filter((f) => f.code === 'text-after-quote');
  assert.equal(textAfterQuote.length, 1);
});
