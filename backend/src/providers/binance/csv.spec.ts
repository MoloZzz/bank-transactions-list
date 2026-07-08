import { parseCsv, parseCsvRecords } from './csv';

describe('parseCsv', () => {
  it('parses plain comma-separated rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles a missing trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields containing commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Doe, John","said ""hi"""\n')).toEqual([
      ['name', 'note'],
      ['Doe, John', 'said "hi"'],
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseCsvRecords', () => {
  it('maps rows to header-keyed records, trimming whitespace', () => {
    const out = parseCsvRecords(' a , b \n 1 , 2 \n3,4\n');
    expect(out).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('returns an empty array when only a header is present', () => {
    expect(parseCsvRecords('a,b\n')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsvRecords('')).toEqual([]);
  });
});
