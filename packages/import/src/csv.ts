// IMP-02: reading a CSV file as a table of text cells. Banks and apps disagree on the
// separator (Buddy uses ";", Excel in Spanish too), so it is guessed from the first lines.

export interface Table {
  delimiter: string
  header: string[]
  rows: string[][]
}

const candidates = [',', ';', '\t', '|']

/** The separator that splits the first lines into the same, largest number of cells. */
export function guessDelimiter(text: string): string {
  const lines = splitRecords(text.slice(0, 20_000), '\n')
    .slice(0, 10)
    .filter((line) => line.trim() !== '')
  let best = ','
  let bestScore = 0
  for (const delimiter of candidates) {
    const counts = lines.map((line) => splitRecords(line, delimiter).length)
    const first = counts[0] ?? 1
    if (first < 2) continue
    const consistent = counts.filter((count) => count === first).length
    const score = consistent * 100 + first
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

/**
 * Splits text on `separator` outside double quotes, keeping the quotes, so it can split
 * a file into lines and a line into cells the same way.
 */
function splitRecords(text: string, separator: string): string[] {
  const parts: string[] = []
  let quoted = false
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (char === '"') quoted = !quoted
    else if (!quoted && char === separator) {
      parts.push(text.slice(start, index))
      start = index + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** RFC 4180: quoted cells may hold the separator, line breaks and doubled quotes. */
export function parseCsv(input: string, delimiter = guessDelimiter(input)): Table {
  const text = input.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index)
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      records.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    records.push(row)
  }
  const filled = records.filter((record) => record.some((value) => value.trim() !== ''))
  const [header = [], ...rows] = filled
  return { delimiter, header: header.map((name) => name.trim()), rows }
}

/** Writes cells as one CSV line, quoting only where needed. */
export function csvLine(cells: readonly string[], delimiter = ','): string {
  return cells
    .map((cell) =>
      /[",\n\r;]/.test(cell) || cell.includes(delimiter) ? `"${cell.replace(/"/g, '""')}"` : cell,
    )
    .join(delimiter)
}
