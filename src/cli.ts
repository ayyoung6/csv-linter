#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseCsv, type Finding } from './parser.js';
import { checkFieldCounts, checkHeaderNames } from './rules.js';

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

function lintFile(path: string): number {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    process.stderr.write(`${path}: cannot read file (${(error as Error).message})\n`);
    return 2;
  }

  const { rows, findings } = parseCsv(text);
  findings.push(...checkFieldCounts(rows));
  findings.push(...checkHeaderNames(rows));
  findings.sort((a, b) => a.position.line - b.position.line || a.position.column - b.position.column);

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

function main(argv: string[]): number {
  const paths = argv.slice(2);
  if (paths.length === 0) {
    process.stderr.write('usage: csv-linter <file.csv> [file2.csv ...]\n');
    return 1;
  }

  let exitCode = 0;
  for (const path of paths) {
    exitCode = Math.max(exitCode, lintFile(path));
  }
  return exitCode;
}

process.exitCode = main(process.argv);
