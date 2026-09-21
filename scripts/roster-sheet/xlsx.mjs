/**
 * A minimal XLSX writer. Zero dependencies — an .xlsx is a ZIP of XML, and the
 * subset we need (sheets, text cells, widths, a frozen row, merges, fills and
 * list dropdowns) is small enough to write directly. Adding a ~1MB spreadsheet
 * library to ship one workbook was not worth it.
 *
 * Scope, deliberately: everything here survives Google Drive's XLSX -> Google
 * Sheets conversion. Things that do NOT survive it reliably (protected ranges,
 * custom-formula validation, conditional formatting) are not attempted — the
 * Apps Script in build-roster-workbook.gs is where those live.
 *
 * Strings are written as inline strings, so there is no shared-string table to
 * keep consistent.
 */

import { deflateRawSync, crc32 } from 'node:zlib'

const enc = (s) => Buffer.from(s, 'utf8')

/** XLSX caps a sheet name at 31 characters and forbids : \ / ? * [ ] */
export const XLSX_SHEET_NAME_MAX = 31

export function sheetName(raw, taken) {
  let name = String(raw).replace(/[:\\/?*[\]]/g, '-').trim().slice(0, XLSX_SHEET_NAME_MAX)
  if (!name) name = 'Sheet'
  if (!taken) return name
  if (!taken.has(name)) {
    taken.add(name)
    return name
  }
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`
    const candidate = name.slice(0, XLSX_SHEET_NAME_MAX - suffix.length) + suffix
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
  throw new Error(`cannot make a unique sheet name from "${raw}"`)
}

/** XML 1.0 forbids most control characters outright, so they are dropped. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')

const xmlEscape = (v) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(CONTROL_CHARS, '')

export function colLetter(n) {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = (n - m - 1) / 26
  }
  return s
}

// ── ZIP ──────────────────────────────────────────────────────────────────────

function zip(files) {
  const chunks = []
  const central = []
  let offset = 0

  for (const file of files) {
    const nameBuf = enc(file.name)
    const body = enc(file.data)
    const deflated = deflateRawSync(body, { level: 9 })
    const sum = crc32(body)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // mod time — fixed, so output is reproducible
    local.writeUInt16LE(0x2821, 12) // mod date: 2020-01-01
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(deflated.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, deflated)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4) // version made by
    dir.writeUInt16LE(20, 6) // version needed
    dir.writeUInt16LE(0, 8)
    dir.writeUInt16LE(8, 10)
    dir.writeUInt16LE(0, 12)
    dir.writeUInt16LE(0x2821, 14)
    dir.writeUInt32LE(sum, 16)
    dir.writeUInt32LE(deflated.length, 20)
    dir.writeUInt32LE(body.length, 24)
    dir.writeUInt16LE(nameBuf.length, 28)
    dir.writeUInt16LE(0, 30) // extra
    dir.writeUInt16LE(0, 32) // comment
    dir.writeUInt16LE(0, 34) // disk
    dir.writeUInt16LE(0, 36) // internal attrs
    dir.writeUInt32LE(0, 38) // external attrs
    dir.writeUInt32LE(offset, 42)
    central.push(dir, nameBuf)

    offset += local.length + nameBuf.length + deflated.length
  }

  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, cd, end])
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Index order here IS the `s=` attribute used on cells. Keep them in step.
export const STYLE = {
  DEFAULT: 0,
  TITLE: 1, // bold, paper on ink
  COUNTER: 2, // bold, accent on muted
  NOTE: 3, // small, red, wrapped
  HEADER: 4, // bold, paper on accent
  TEXT: 5, // plain text format (@) — stops phone numbers becoming 9.87E9
  OVERFLOW: 6, // grey fill, text format
  RULE_H: 7, // bold accent
  RULE_WARN: 8, // red
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="@"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FFF6F4EC"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF05603F"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF9E1F14"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFF6F4EC"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF8A8A8A"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF9E1F14"/><name val="Calibri"/></font>
</fonts>
<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF14141A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE6E3D8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF05603F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDDAD0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="5" fillId="5" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// ── Worksheet ────────────────────────────────────────────────────────────────

/**
 * sheet = {
 *   name, cols: [{width}], freezeRow, merges: ['A1:E1'],
 *   rows: [{ r, height, s, cells: [{ c, v, s, formula }] }],
 *     - row.s applies a style to the whole row (customFormat), so empty rows
 *       need no cells at all.
 *   validations: [{ ref, values: [], help }],
 * }
 */
function worksheetXml(sheet) {
  const cols = (sheet.cols ?? [])
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join('')

  const rows = (sheet.rows ?? [])
    .map((row) => {
      const cells = row.cells
        .map((cell) => {
          const ref = `${colLetter(cell.c)}${row.r}`
          const s = cell.s ? ` s="${cell.s}"` : ''
          if (cell.formula) return `<c r="${ref}"${s}><f>${xmlEscape(cell.formula)}</f></c>`
          if (cell.v === undefined || cell.v === null || cell.v === '') return `<c r="${ref}"${s}/>`
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.v)}</t></is></c>`
        })
        .join('')
      const ht = row.height ? ` ht="${row.height}" customHeight="1"` : ''
      // A row-level style formats every cell in the row without emitting one
      // <c> per column. For 700+ mostly-empty roster rows that is the
      // difference between a 60KB file and a 20KB one.
      const rs = row.s === undefined ? '' : ` s="${row.s}" customFormat="1"`
      return cells
        ? `<row r="${row.r}"${ht}${rs}>${cells}</row>`
        : `<row r="${row.r}"${ht}${rs}/>`
    })
    .join('')

  const pane = sheet.freezeRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'

  const merges = (sheet.merges ?? []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''

  const validations = (sheet.validations ?? []).length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations
        .map(
          (v) =>
            `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"` +
            ` errorTitle="Pick from the list" error="${xmlEscape(v.help ?? '')}"` +
            ` prompt="${xmlEscape(v.help ?? '')}" sqref="${v.ref}">` +
            `<formula1>"${v.values.map((x) => String(x).replace(/"/g, '')).join(',')}"</formula1>` +
            `</dataValidation>`,
        )
        .join('')}</dataValidations>`
    : ''

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>${merges}${validations}</worksheet>`
  )
}

export function buildXlsx(sheets) {
  if (!sheets.length) throw new Error('a workbook needs at least one sheet')

  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: worksheetXml(s) })),
  ]

  return zip(files)
}
