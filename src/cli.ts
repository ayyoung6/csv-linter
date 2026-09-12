#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseCsv, type Finding } from './parser.js';
import { checkFieldCounts, checkHeaderNames, checkLineEndings } from './rules.js';

// Formatted like a compiler diagnostic on purpose: a bare "line 12: bad
// row" makes you go count columns by hand. Pointing at the exact character
// with a caret under a printed source line does not.
function formatFinding(filePath: string, sourceLines: string[], finding: Finding): string {
  const { line, column } = finding.position;
  const gutter = String(line);
  const pad = ' '.repeat(gutter.length);
  const sourceLine = sourceLines[line - 1] ?? '';
  const caret = `${' '.repeat(Math.max(0, column - 1))}^`;

  return [
    `${filePath}:${line}:${column} - ${finding.severity}: ${finding.message}`,
    `${pad} |`,
    `${gutter} | ${sourceLine}`,
    `${pad} | ${caret}`,
    '',
  ].join('\n');
}

type FileResult =
  | { path: string; readError: string }
  | { path: string; findings: Finding[]; text: string };

function lintFile(path: string): FileResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    return { path, readError: (error as Error).message };
  }

  const { rows, findings } = parseCsv(text);
  findings.push(...checkFieldCounts(rows));
  findings.push(...checkHeaderNames(rows));
  findings.push(...checkLineEndings(rows));
  findings.sort((a, b) => a.position.line - b.position.line || a.position.column - b.position.column);

  return { path, findings, text };
}

function printText(result: FileResult): number {
  if ('readError' in result) {
    process.stderr.write(`${result.path}: cannot read file (${result.readError})\n`);
    return 2;
  }

  const { path, findings, text } = result;

  if (findings.length === 0) {
    process.stdout.write(`${path}: no problems found\n`);
    return 0;
  }

  const sourceLines = text.split(/\r\n|\r|\n/);
  for (const finding of findings) {
    process.stdout.write(formatFinding(path, sourceLines, finding));
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.length - errorCount;
  process.stdout.write(
    `${path}: ${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}\n\n`,
  );

  return errorCount > 0 ? 1 : 0;
}

// One JSON object for the whole run, not one per file, so a CI step can
// pipe stdout straight into `JSON.parse` without splitting on newlines.
function printJson(results: FileResult[]): number {
  let exitCode = 0;
  const files = results.map((result) => {
    if ('readError' in result) {
      exitCode = Math.max(exitCode, 2);
      return { path: result.path, readError: result.readError, findings: [] as Finding[] };
    }

    const errorCount = result.findings.filter((f) => f.severity === 'error').length;
    exitCode = Math.max(exitCode, errorCount > 0 ? 1 : 0);
    return { path: result.path, findings: result.findings };
  });

  process.stdout.write(`${JSON.stringify({ files }, null, 2)}\n`);
  return exitCode;
}

function parseArgs(argv: string[]): { format: 'text' | 'json'; paths: string[] } {
  let format: 'text' | 'json' = 'text';
  const paths: string[] = [];

  for (const arg of argv.slice(2)) {
    if (arg === '--format=json') {
      format = 'json';
    } else if (arg === '--format=text') {
      format = 'text';
    } else if (arg.startsWith('--format=')) {
      throw new Error(`unknown format "${arg.slice('--format='.length)}" (expected "text" or "json")`);
    } else {
      paths.push(arg);
    }
  }

  return { format, paths };
}

function main(argv: string[]): number {
  let format: 'text' | 'json';
  let paths: string[];
  try {
    ({ format, paths } = parseArgs(argv));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  if (paths.length === 0) {
    process.stderr.write('usage: csv-linter [--format=text|json] <file.csv> [file2.csv ...]\n');
    return 1;
  }

  const results = paths.map(lintFile);

  if (format === 'json') {
    return printJson(results);
  }

  let exitCode = 0;
  for (const result of results) {
    exitCode = Math.max(exitCode, printText(result));
  }
  return exitCode;
}

process.exitCode = main(process.argv);
