/**
 * BANGALORE OPEN AIR 2026 — roster workbook builder
 * ================================================
 *
 * Paste this whole file into a NEW, EMPTY Google Sheet:
 *   Extensions ▸ Apps Script ▸ paste over everything ▸ Save ▸ Run ▸ buildWorkbook
 * Google will ask you to authorise it the first time. It only touches this one
 * spreadsheet (and, for the export, one Drive folder it creates itself).
 *
 * It builds: a Rules tab, then one tab per organisation, each carrying that
 * org's name and quota, validated columns, and exactly `quota` usable rows.
 *
 * ── READ THIS BEFORE SHARING ──────────────────────────────────────────────
 * Google Sheets CANNOT hide one tab from another editor. Protected ranges stop
 * EDITING, not READING, and a hidden tab is two clicks from visible. Everyone
 * you give edit access to can read every organisation's names and phone
 * numbers. This is a known, accepted trade-off (ADR-018) — share edit access
 * only with people you are content to have see the whole list.
 *
 * ── PHONE NUMBERS ─────────────────────────────────────────────────────────
 * The phone column asks for TEN DIGITS ONLY (9876543210), not +91.
 * A cell that starts with "+" is parsed by Sheets as a formula, which quietly
 * mangles the number. The loader adds +91 on import.
 *
 * Do not add columns. The importer refuses any column that is not one of the
 * five below — that is how "name, phone, role and vehicle registration only"
 * is enforced mechanically rather than remembered.
 */

// ─────────────────────────────────────────────────────────────────────────────
// EDIT ME — one line per organisation: [name, quota]
// Regenerate this block from the authoritative CSV with:
//   corepack pnpm make:roster-sheet -- path/to/organisations.csv
// ─────────────────────────────────────────────────────────────────────────────
var ORGS = [
  ['EXAMPLE — replace this whole list', 10],
];
// ───────────────────────────────────────────────────────── END EDIT ME ──────

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS MATRIX — transcribed from the printed pack. Do not hand-edit: it is
// regenerated from design/source/accreditation/access-matrix.json by
// scripts/make-roster-sheet.mjs. If this disagrees with the printed sheets,
// the sheets win and the transcription is what gets corrected.
// ─────────────────────────────────────────────────────────────────────────────
var MATRIX = null;
// ────────────────────────────────────────────────────────── END MATRIX ──────

var COLUMNS = [
  { key: 'full_name',      head: 'Full name',            width: 220, required: true  },
  { key: 'phone',          head: 'Phone (10 digits)',    width: 160, required: true  },
  { key: 'role',           head: 'Role / job',           width: 200, required: true  },
  { key: 'vehicle_reg',    head: 'Vehicle reg (if any)', width: 160, required: false },
  { key: 'requested_tier', head: 'Band needed',          width: 170, required: false },
  { key: 'days_needed',    head: 'Days needed',          width: 140, required: true  },
];

/** Bands an organisation may ask for. AAA, Artist and General Admission are
 *  deliberately absent: they are not requestable on this form. */
/** Mirrors the boa_acc_day_validity enum. A person cannot be approved without
 *  one, so unlike the band this column is required. */
var DAY_CHOICES = ['Build', 'Show', 'Both'];

var REQUESTABLE_TIERS = [
  'Crew',
  'Stage',
  'Photo',
  "Eddie's Lounge",
  'Promoters Lounge',
];

/** Guard against re-running buildWorkbook over tabs organisations have filled.
 *  Leave this false. See resetSheet(). */
var ALLOW_OVERWRITE = false;

var HEADER_ROW = 4;      // row holding the column headings
var FIRST_DATA_ROW = 5;  // first row an org types into
var OVERFLOW_ROWS = 10;  // greyed rows past quota, so the ceiling is visible

var INK = '#14141A';
var PAPER = '#F6F4EC';
var ACCENT = '#05603F';
var WARN = '#9E1F14';
var MUTED = '#E6E3D8';

function buildWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (ORGS.length === 1 && String(ORGS[0][0]).indexOf('EXAMPLE') === 0) {
    throw new Error(
      'The ORGS list is still the example. Edit the ORGS block at the top of ' +
      'this script with the real organisations and quotas, then run again.'
    );
  }

  var seen = {};
  for (var i = 0; i < ORGS.length; i++) {
    var nm = String(ORGS[i][0]).trim();
    var q = Number(ORGS[i][1]);
    if (!nm) throw new Error('Row ' + (i + 1) + ' of ORGS has no name.');
    if (!(q > 0)) throw new Error('"' + nm + '" has quota ' + ORGS[i][1] + '. Quota must be a positive whole number.');
    var tab = tabNameFor(nm);
    if (seen[tab]) throw new Error('Two organisations collapse to the same tab name "' + tab + '". Make the names more distinct.');
    seen[tab] = true;
  }

  // Rules and the reference tab carry no roster data, so they always refresh.
  buildRulesTab(ss);
  if (MATRIX) buildBandsTab(ss);

  var built = 0, kept = 0;
  for (var j = 0; j < ORGS.length; j++) {
    var existing = ss.getSheetByName(tabNameFor(ORGS[j][0]));
    if (existing && sheetHasData(existing) && !ALLOW_OVERWRITE) {
      kept++;
      continue;  // somebody is using it — leave it exactly as it is
    }
    buildOrgTab(ss, ORGS[j][0], Number(ORGS[j][1]));
    built++;
  }

  // Drop any leftover tab that is not ours and holds nobody — Google's default
  // "Sheet1", or the single tab left behind when the spreadsheet was created by
  // importing a seed file. Never touches a tab with people on it.
  var wanted = { 'Rules': true, 'Bands & zones': true };
  for (var w = 0; w < ORGS.length; w++) wanted[tabNameFor(ORGS[w][0])] = true;
  var all = ss.getSheets();
  for (var d = 0; d < all.length; d++) {
    var sh = all[d];
    if (wanted[sh.getName()]) continue;
    if (sheetHasData(sh)) continue;
    if (ss.getSheets().length <= 1) break;  // a spreadsheet must keep one tab
    ss.deleteSheet(sh);
  }

  ss.setActiveSheet(ss.getSheetByName('Rules'));
  SpreadsheetApp.getUi().alert(
    'Built ' + built + ' organisation tab(s).' +
    (kept ? '\nLeft ' + kept + ' tab(s) alone because they already have people on them.' : '') +
    '\n\nBefore you share: everyone with edit access can read every tab.'
  );
}

/** Sheets forbids : \ / ? * [ ] in tab names, and caps them at 100 chars. */
function tabNameFor(name) {
  return String(name).replace(/[:\\\/\?\*\[\]]/g, '-').trim().substring(0, 90);
}

/**
 * Re-creating a tab destroys whatever is on it. Once organisations have started
 * typing, that is somebody's afternoon. So a tab holding data is never silently
 * replaced: buildWorkbook stops and names it, and you decide.
 */
function sheetHasData(sh) {
  if (!sh) return false;
  var last = sh.getLastRow();
  if (last < FIRST_DATA_ROW) return false;
  var names = sh.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, 1).getDisplayValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() !== '') return true;
  }
  return false;
}

function resetSheet(ss, name) {
  var existing = ss.getSheetByName(name);
  if (existing) {
    if (sheetHasData(existing) && !ALLOW_OVERWRITE) {
      throw new Error(
        'The tab "' + name + '" already has people on it. Nothing has been changed.\n\n' +
        'Re-running buildWorkbook would delete them. If you are certain you want to ' +
        'start this workbook over, set ALLOW_OVERWRITE = true at the top of the ' +
        'script, run once, then set it back to false.\n\n' +
        'If you only need to ADD an organisation, delete the ORGS lines for the ' +
        'tabs that already exist and run again — only the missing tabs get built.'
      );
    }
    ss.deleteSheet(existing);
  }
  return ss.insertSheet(name);
}

function buildOrgTab(ss, orgName, quota) {
  var sh = resetSheet(ss, tabNameFor(orgName));
  var lastCol = COLUMNS.length;
  var lastDataRow = FIRST_DATA_ROW + quota - 1;

  sh.getRange(1, 1, 1, lastCol).merge()
    .setValue(orgName)
    .setFontSize(14).setFontWeight('bold')
    .setFontColor(PAPER).setBackground(INK)
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  // Live counter. COUNTA over the name column only — a row is "filled" when it
  // has a name, whatever else is missing.
  var nameCol = columnLetter(1);
  sh.getRange(2, 1, 1, lastCol).merge()
    .setFormula(
      '=CONCATENATE("Quota: ", ' + quota + ', "   ·   Filled: ", ' +
      'COUNTA(' + nameCol + FIRST_DATA_ROW + ':' + nameCol + lastDataRow + '), ' +
      '"   ·   Left: ", ' + quota + ' - COUNTA(' + nameCol + FIRST_DATA_ROW + ':' + nameCol + lastDataRow + '))'
    )
    .setFontWeight('bold').setFontColor(ACCENT).setBackground(MUTED);

  sh.getRange(3, 1, 1, lastCol).merge()
    .setValue(
      'Phone = 10 digits only, no +91, no spaces.   ·   One person per row.   ·   ' +
      'Do not add, rename or reorder columns.   ·   Name, phone, role and vehicle registration ONLY — ' +
      'no ID number, no Aadhaar, no photo, no address, no date of birth.'
    )
    .setFontSize(9).setFontColor(WARN).setWrap(true);
  sh.setRowHeight(3, 30);

  var heads = [];
  for (var c = 0; c < COLUMNS.length; c++) {
    heads.push(COLUMNS[c].head + (COLUMNS[c].required ? ' *' : ''));
  }
  sh.getRange(HEADER_ROW, 1, 1, lastCol).setValues([heads])
    .setFontWeight('bold').setFontColor(PAPER).setBackground(ACCENT);

  for (var w = 0; w < COLUMNS.length; w++) sh.setColumnWidth(w + 1, COLUMNS[w].width);
  sh.setFrozenRows(HEADER_ROW);

  var totalRows = quota + OVERFLOW_ROWS;
  if (sh.getMaxRows() < FIRST_DATA_ROW + totalRows) {
    sh.insertRowsAfter(sh.getMaxRows(), FIRST_DATA_ROW + totalRows - sh.getMaxRows());
  }

  // Everything is plain text. This is what stops a 10-digit phone turning into
  // 9.87654321E9 and a reg like "KA01AB1234" being re-read as something else.
  sh.getRange(FIRST_DATA_ROW, 1, totalRows, lastCol).setNumberFormat('@');

  applyValidation(sh, quota);

  // Rows past quota: greyed, and labelled the first time.
  var overflowStart = lastDataRow + 1;
  sh.getRange(overflowStart, 1, OVERFLOW_ROWS, lastCol)
    .setBackground('#DDDAD0').setFontColor('#8A8A8A');
  sh.getRange(overflowStart, 1).setNote(
    'Past this organisation\'s quota of ' + quota + '. Anything typed below the ' +
    'grey line will be refused on import. Ask the desk for a quota change first.'
  );

  sh.getRange(1, 1, 3, lastCol).protect()
    .setDescription('Header — do not edit')
    .setWarningOnly(true);
  sh.getRange(HEADER_ROW, 1, 1, lastCol).protect()
    .setDescription('Column headings — do not edit')
    .setWarningOnly(true);

  var overQuota = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A' + overflowStart + '<>"", ROW()>=' + overflowStart + ')')
    .setBackground('#F4C7C3')
    .setRanges([sh.getRange(overflowStart, 1, OVERFLOW_ROWS, lastCol)])
    .build();
  sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([overQuota]));
}

function applyValidation(sh, quota) {
  var rows = quota + OVERFLOW_ROWS;

  var name = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(ISBLANK(A' + FIRST_DATA_ROW + '), AND(LEN(TRIM(A' + FIRST_DATA_ROW + '))>=2, LEN(TRIM(A' + FIRST_DATA_ROW + '))<=80))')
    .setAllowInvalid(false)
    .setHelpText('Full name, 2 to 80 characters.')
    .build();
  sh.getRange(FIRST_DATA_ROW, 1, rows, 1).setDataValidation(name);

  var phone = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(ISBLANK(B' + FIRST_DATA_ROW + '), REGEXMATCH(TO_TEXT(B' + FIRST_DATA_ROW + '), "^[6-9][0-9]{9}$"))')
    .setAllowInvalid(false)
    .setHelpText('Ten digits, starting 6, 7, 8 or 9. No +91, no spaces, no dashes. Example: 9876543210')
    .build();
  sh.getRange(FIRST_DATA_ROW, 2, rows, 1).setDataValidation(phone);

  var role = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(ISBLANK(C' + FIRST_DATA_ROW + '), AND(LEN(TRIM(C' + FIRST_DATA_ROW + '))>=2, LEN(TRIM(C' + FIRST_DATA_ROW + '))<=60))')
    .setAllowInvalid(false)
    .setHelpText('What they do. 2 to 60 characters. Example: Rigger, Sound engineer, Bar staff.')
    .build();
  sh.getRange(FIRST_DATA_ROW, 3, rows, 1).setDataValidation(role);

  var reg = SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(ISBLANK(D' + FIRST_DATA_ROW + '), REGEXMATCH(UPPER(TO_TEXT(SUBSTITUTE(D' + FIRST_DATA_ROW + '," ",""))), "^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$"))')
    .setAllowInvalid(false)
    .setHelpText('Only if they drive in. Example: KA01AB1234. Leave blank otherwise.')
    .build();
  sh.getRange(FIRST_DATA_ROW, 4, rows, 1).setDataValidation(reg);

  var tier = SpreadsheetApp.newDataValidation()
    .requireValueInList(REQUESTABLE_TIERS, true)
    .setAllowInvalid(false)
    .setHelpText('Which band this person needs. Leave blank if you are not sure — the desk decides.')
    .build();
  sh.getRange(FIRST_DATA_ROW, 5, rows, 1).setDataValidation(tier);

  var days = SpreadsheetApp.newDataValidation()
    .requireValueInList(DAY_CHOICES, true)
    .setAllowInvalid(false)
    .setHelpText('Build = 5–9 Oct load-in only. Show = 10 Oct only. Both = all of it. Required.')
    .build();
  sh.getRange(FIRST_DATA_ROW, 6, rows, 1).setDataValidation(days);
}

var BAND_COLOUR = {
  general_admission: '#3A3A3A', eddies_lounge: '#D22B2B', promoters_lounge: '#1F4ED8',
  aaa: '#16A34A', crew: '#7C3AED', artist: '#DB2777', stage: '#EA580C', photo: '#CA8A04'
};
var ZONE_COLOUR = {
  festival_area: '#16A34A', eddies_lounge: '#D22B2B', promoters_lounge: '#1F4ED8',
  photo_pit: '#CA8A04', backstage: '#7C3AED', main_stage: '#EA580C'
};

/** The pack's access matrix as a tab: which band gets into which zone. */
function buildBandsTab(ss) {
  var sh = resetSheet(ss, 'Bands & zones');
  var zones = MATRIX.zones;
  var tiers = MATRIX.tiers.slice().sort(function (a, b) { return a.sort_order - b.sort_order; });
  var lastCol = zones.length + 2;

  var at = {};
  for (var a = 0; a < MATRIX.access.length; a++) {
    at[MATRIX.access[a].zone + '|' + MATRIX.access[a].tier] = MATRIX.access[a];
  }

  sh.getRange(1, 1, 1, lastCol).merge()
    .setValue('BANDS & ZONES — who gets in where')
    .setFontSize(15).setFontWeight('bold').setFontColor(PAPER).setBackground(INK)
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  sh.getRange(2, 1, 1, lastCol).merge()
    .setValue('BANGALORE OPEN AIR · 10 OCTOBER 2026 · transcribed from the printed accreditation pack')
    .setFontSize(9).setFontColor('#6B6B6B');

  var head = ['BAND', 'QTY'];
  for (var z = 0; z < zones.length; z++) head.push(zones[z].label.toUpperCase());
  sh.getRange(4, 1, 1, lastCol).setValues([head])
    .setFontWeight('bold').setFontColor('#FFFFFF').setWrap(true).setVerticalAlignment('middle');
  sh.getRange(4, 1, 1, 2).setBackground(ACCENT);
  for (var zc = 0; zc < zones.length; zc++) {
    sh.getRange(4, zc + 3).setBackground(ZONE_COLOUR[zones[zc].code] || ACCENT);
  }
  sh.setRowHeight(4, 34);

  for (var t = 0; t < tiers.length; t++) {
    var tier = tiers[t];
    var r = 5 + t;
    sh.getRange(r, 1).setValue(tier.label)
      .setFontWeight('bold').setFontColor('#FFFFFF')
      .setBackground(BAND_COLOUR[tier.code] || '#3A3A3A').setVerticalAlignment('middle');
    sh.getRange(r, 2).setValue(tier.print_qty === null ? 'TBC' : tier.print_qty).setFontSize(10);

    for (var zz = 0; zz < zones.length; zz++) {
      var rule = at[zones[zz].code + '|' + tier.code];
      var cell = sh.getRange(r, zz + 3);
      if (!rule) {
        cell.setValue('—').setBackground('#F0EFEA').setFontColor('#A0A0A0');
      } else if (rule.from_local_time) {
        cell.setValue('+ PHOTO ID\nafter ' + rule.from_local_time)
          .setBackground('#FDF0CE').setFontColor(WARN).setWrap(true);
      } else if (rule.requires_photo_id) {
        cell.setValue('+ PHOTO ID').setBackground('#FDF0CE').setFontColor(WARN);
      } else {
        cell.setValue('YES').setBackground('#D7F0DF').setFontColor(ACCENT).setFontWeight('bold');
      }
      cell.setHorizontalAlignment('center').setVerticalAlignment('middle');
    }
    sh.setRowHeight(r, 30);
  }

  var foot = 5 + tiers.length + 1;
  var notes = [
    ['“+ PHOTO ID” means the band alone is not entry — the matching photo ID and lanyard must be shown.'],
    ['A blank cell is a turn-away. Cut, taped or transferred bands are void: refuse entry and call the zone supervisor.'],
    ['AAA and Artist are named lists approved separately. They cannot be requested on a roster tab.']
  ];
  for (var n = 0; n < notes.length; n++) {
    sh.getRange(foot + n, 1, 1, lastCol).merge().setValue(notes[n][0]).setFontSize(10);
  }

  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 60);
  for (var w = 0; w < zones.length; w++) sh.setColumnWidth(w + 3, 130);
  sh.setFrozenRows(4);
  sh.protect().setDescription('Reference — do not edit').setWarningOnly(true);
}

function buildRulesTab(ss) {
  var sh = resetSheet(ss, 'Rules');
  sh.setColumnWidth(1, 900);

  // Each line carries its own style. Deriving the formatting from the content
  // is the point: an earlier version hardcoded the heading row numbers, so
  // inserting a line silently moved every heading onto the wrong row.
  var H = 'heading', W = 'warn', T = 'title';
  var lines = [
    ['BANGALORE OPEN AIR 2026 — crew accreditation', T],
    [''],
    ['Find your organisation\'s tab along the bottom. Fill in one row per person. That is all.'],
    [''],
    ['THE COLUMNS   (* = required)', H],
    ['Full name *          As it appears on the photo ID they will carry. 2–80 characters.'],
    ['Phone (10 digits) *  Ten digits only — 9876543210. No +91, no spaces, no dashes.'],
    ['                     A cell starting with "+" is read as a formula by Sheets and gets mangled.'],
    ['Role / job *         What they actually do. Rigger, Sound engineer, Bar staff, Driver.'],
    ['Vehicle reg          Only if they drive in. KA01AB1234. Leave blank otherwise.'],
    ['Band needed          Optional. If you leave it blank the desk decides.'],
    ['Days needed *        Build, Show or Both. Build = 5–9 Oct load-in, Show = 10 Oct.'],
    ['                     Get this right: a Show band does not open the gate during'],
    ['                     build, and we cannot guess it for you.'],
    [''],
    ['WHAT WE DO NOT COLLECT', H],
    ['No ID number. No Aadhaar. No photograph. No address. No date of birth.', W],
    ['Do not add a column for any of them. The importer refuses unknown columns outright.', W],
    [''],
    ['YOUR QUOTA', H],
    ['The grey line on your tab is your quota. Rows below it will be refused on import.'],
    ['If you genuinely need more people, ask the desk before typing them in.'],
    [''],
    ['BANDS YOU CAN ASK FOR', H],
    ['Crew · Stage · Photo · Eddie\'s Lounge · Promoters Lounge'],
    ['AAA and Artist are named lists approved separately — they are not on this form.'],
    [''],
    ['WHO CAN SEE THIS', H],
    ['Everyone with edit access to this workbook can read every tab, including other', W],
    ['organisations\' names and phone numbers. Google Sheets cannot hide a tab from an editor.', W],
    [''],
    ['DEADLINE', H],
    ['Bands are handed over at the gate from 4 October. A person not on this sheet has no band.'],
  ];

  var values = [];
  for (var i = 0; i < lines.length; i++) values.push([lines[i][0]]);
  sh.getRange(1, 1, values.length, 1).setValues(values).setWrap(false);

  for (var j = 0; j < lines.length; j++) {
    var kind = lines[j][1];
    if (!kind) continue;
    var cell = sh.getRange(j + 1, 1);
    if (kind === T) {
      cell.setFontSize(15).setFontWeight('bold').setFontColor(PAPER).setBackground(INK);
      sh.setRowHeight(j + 1, 34);
    } else if (kind === H) {
      cell.setFontWeight('bold').setFontColor(ACCENT);
    } else if (kind === W) {
      cell.setFontColor(WARN);
    }
  }

  sh.protect().setDescription('Rules — reference only').setWarningOnly(true);
}

/**
 * Menu ▸ run this when every organisation has filled their tab. Writes one CSV
 * per tab into a dated Drive folder, which is what the importer reads.
 */
function exportAllTabsToCsv() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd-HHmm');
  var folder = DriveApp.createFolder('boa-rosters-' + stamp);
  var sheets = ss.getSheets();
  var written = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    if (sh.getName() === 'Rules') continue;

    var last = sh.getLastRow();
    if (last < FIRST_DATA_ROW) continue;

    var rows = sh.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, COLUMNS.length).getDisplayValues();
    var out = [];
    var keys = [];
    for (var k = 0; k < COLUMNS.length; k++) keys.push(COLUMNS[k].key);
    out.push(keys.join(','));

    for (var r = 0; r < rows.length; r++) {
      if (String(rows[r][0]).trim() === '') continue;  // no name, no row
      var cells = [];
      for (var c = 0; c < COLUMNS.length; c++) cells.push(csvCell(rows[r][c]));
      out.push(cells.join(','));
    }

    if (out.length === 1) continue;  // header only — nobody filled it in
    folder.createFile(safeFileName(sh.getName()) + '.csv', out.join('\n'), MimeType.CSV);
    written++;
  }

  SpreadsheetApp.getUi().alert(
    'Wrote ' + written + ' CSV file(s) to Drive folder:\n\n' + folder.getName() +
    '\n\nDownload that folder and hand it over for import.'
  );
}

function csvCell(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function safeFileName(name) {
  return String(name).replace(/[^A-Za-z0-9 _.\-]/g, '_').trim();
}

function columnLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('BOA')
    .addItem('Build organisation tabs', 'buildWorkbook')
    .addItem('Export all tabs to CSV', 'exportAllTabsToCsv')
    .addToUi();
}
