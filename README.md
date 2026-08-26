# csv-linter

CSV looks trivial until you've been burned by it: a value with an unescaped
comma shifts every column after it, a quote that never closes swallows the
rest of the file into one field, someone edits a spreadsheet by hand and the
export gains a trailing column. Most tools either accept the mess silently
or reject the whole file with something like "invalid CSV on line 12" and
leave you to find the actual character yourself.

This is a linter, not a parser wrapper. It parses the file itself, tracking
line, column and byte offset at every field boundary, so every finding can
point at the exact character that's wrong.

## Usage

```
npm install
npm run build
node dist/cli.js sample.csv
```

Given `sample.csv`:

```
id,name,price
1,Widget,9.99
2,Gadget,19.99,clearance
```

```
$ node dist/cli.js sample.csv
sample.csv:3:16 - error: row has 4 fields but the header defines 3 (unexpected extra value "clearance")
  |
3 | 2,Gadget,19.99,clearance
  |                ^

sample.csv: 1 error, 0 warnings
```

The exit code is `1` if any errors were found, `0` otherwise, so it can be
used as a CI check.

## Rules

| code                   | severity | what it catches                                            |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `unterminated-quote`   | error    | a quoted field that is opened but never closed               |
| `text-after-quote`     | error    | characters glued onto a field after its closing quote        |
| `field-count-mismatch` | error    | a row with more or fewer fields than the header row          |
| `empty-header-name`    | warning  | a header column with no name                                 |
| `duplicate-header-name`| warning  | the same column name used twice in the header                |

## How it's built

`src/parser.ts` is a hand-written state machine over the raw text (no
regex-splitting on commas, which breaks the moment a value is quoted). It
walks character by character, handling quoted fields, doubled-quote escapes
(`""` inside a quoted field means a literal `"`), and both `\n` and `\r\n`
line endings, while keeping a running line/column/offset position. It
returns rows of fields plus any parse-level findings (unterminated or
malformed quotes).

`src/rules.ts` takes the parsed rows and checks properties across the whole
file, like every row having the same number of fields as the header.

`src/cli.ts` ties them together and formats findings the way a compiler
would: file:line:column, the message, the offending source line, and a
caret under the exact character.

## Status

Early. No dependencies, no test suite yet, one rule file. See below for
what's next.
