import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './parser.js';
import { checkFieldCounts, checkHeaderNames, checkLineEndings } from './rules.js';

test('checkFieldCounts flags rows with too many or too few fields', () => {
  const { rows } = parseCsv('id,name,price\n1,Widget,9.99\n2,Gadget,19.99,clearance\n3,Sprocket\n');
  const findings = checkFieldCounts(rows);

  assert.equal(findings.length, 2);

  const extra = findings.find((f) => f.message.includes('clearance'));
  assert.ok(extra);
  assert.equal(extra?.code, 'field-count-mismatch');
  assert.equal(extra?.severity, 'error');
  assert.match(extra!.message, /row has 4 fields but the header defines 3/);

  const missing = findings.find((f) => f.message.includes('missing'));
  assert.ok(missing);
  assert.match(missing!.message, /row has 2 fields but the header defines 3/);
  assert.match(missing!.message, /missing 1 column, starting with "price"/);
});

test('checkFieldCounts ignores blank lines', () => {
  const { rows } = parseCsv('a,b\n1,2\n\n3,4\n');
  assert.equal(checkFieldCounts(rows).length, 0);
});

test('checkFieldCounts returns nothing for a file with only a header', () => {
  const { rows } = parseCsv('a,b,c\n');
  assert.equal(checkFieldCounts(rows).length, 0);
});

test('checkFieldCounts returns nothing for an empty file', () => {
  const { rows } = parseCsv('');
  assert.deepEqual(checkFieldCounts(rows), []);
});

test('checkHeaderNames flags empty and duplicate column names', () => {
  const { rows } = parseCsv('id,,name,id\n1,2,3,4\n');
  const findings = checkHeaderNames(rows);

  assert.equal(findings.length, 2);

  const empty = findings.find((f) => f.code === 'empty-header-name');
  assert.ok(empty);
  assert.equal(empty?.severity, 'warning');
  assert.match(empty!.message, /column 2 has no name/);

  const duplicate = findings.find((f) => f.code === 'duplicate-header-name');
  assert.ok(duplicate);
  assert.equal(duplicate?.severity, 'warning');
  assert.match(duplicate!.message, /"id" was already used at column 1/);
});

test('checkHeaderNames finds nothing for unique, named columns', () => {
  const { rows } = parseCsv('id,name,price\n1,Widget,9.99\n');
  assert.equal(checkHeaderNames(rows).length, 0);
});

test('checkHeaderNames returns nothing for an empty file', () => {
  const { rows } = parseCsv('');
  assert.deepEqual(checkHeaderNames(rows), []);
});

test('checkLineEndings flags the minority line ending against the dominant one', () => {
  const { rows } = parseCsv('a,b\r\nc,d\r\ne,f\n');
  const findings = checkLineEndings(rows);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'inconsistent-line-ending');
  assert.equal(findings[0].severity, 'warning');
  assert.match(findings[0].message, /line ends with LF but most of the file uses CRLF/);
  assert.equal(findings[0].position.line, 3);
});

test('checkLineEndings says nothing when every line ending matches', () => {
  const { rows } = parseCsv('a,b\r\nc,d\r\n');
  assert.equal(checkLineEndings(rows).length, 0);
});

test('checkLineEndings ignores the final line when the file has no trailing newline', () => {
  const { rows } = parseCsv('a,b\r\nc,d\r\ne,f');
  assert.equal(checkLineEndings(rows).length, 0);
});

test('checkLineEndings returns nothing for an empty file', () => {
  const { rows } = parseCsv('');
  assert.deepEqual(checkLineEndings(rows), []);
});
