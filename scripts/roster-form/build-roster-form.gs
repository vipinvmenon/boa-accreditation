/**
 * BANGALORE OPEN AIR 2026 — crew roster form builder
 * ==================================================
 *
 * Builds the Google Form organisations use to submit their people, links it to
 * a response spreadsheet, and — on every later run — UPDATES THAT SAME FORM in
 * place. The link you send out never changes.
 *
 * HOW TO RUN:
 *   1. https://script.google.com ▸ your project (or New project)
 *   2. Paste this whole file over everything ▸ Save
 *   3. Already have a form you want to keep? Paste its EDIT link into KEEP_FORM
 *      below (the one ending in /edit — not the link you send to people).
 *   4. Choose buildRosterForm in the function dropdown ▸ Run ▸ authorise
 *   5. View the Execution log: it prints the form link to send out, the edit
 *      link, and the response spreadsheet. Same links on every run.
 *
 * After the first run the script remembers its form (in Project Settings ▸
 * Script properties), so KEEP_FORM no longer matters. To deliberately start
 * over with a brand-new form, run forgetForm once, then buildRosterForm.
 *
 * WHAT IT COLLECTS — and nothing more (CLAUDE.md non-negotiable #9):
 *   organisation, full name, phone, crew type, job title, days, and a loading
 *   vehicle's registration where there is one.
 * No ID number, no Aadhaar, no photo, no address, no date of birth, and the
 * form does not collect respondents' email addresses.
 *
 * THE QUESTION TITLES ARE A CONTRACT. Google names each response-sheet column
 * after its question title, and the importer reads those columns by name.
 * Change titles here (and in docs/ROSTER-FORM.md), not in the form editor.
 *
 * THIS SCRIPT DOES NOT OWN COLUMN A. The question titles below become columns
 * B–H. Column A is `Timestamp`, written by Google when it links the response
 * sheet, and nothing here touches it; column I (`Accreditation Type`) is the
 * desk's, typed by hand. On 25 Sep 2026 column A had been renamed to
 * `Column 1` and the first real import refused the whole file — re-running
 * this script would NOT have fixed it. Correct that one cell in the sheet.
 * See docs/ROSTER-FORM.md, "Three columns, three owners".
 */

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME: the form to keep. Paste its edit link, e.g.
//   https://docs.google.com/forms/d/1AbC.../edit
// Leave '' and the first run creates a new form instead.
// ─────────────────────────────────────────────────────────────────────────────
var KEEP_FORM = '';

// ─────────────────────────────────────────────────────────────────────────────
// ORGANISATIONS — the real list is still owed (ROADMAP ACC-030a).
//
// Leave this EMPTY and the form asks for the organisation as free text.
// Fill it in and the question becomes a dropdown, which gives far cleaner data.
//   var ORGS = ['F5 Events', 'Reynolds', ...];
//
// Decide BEFORE sending the link. Switching free text to a dropdown changes the
// question's type, which Google cannot do in place: once responses exist the
// script refuses rather than split the column in two.
// ─────────────────────────────────────────────────────────────────────────────
var ORGS = [];

var FORM_TITLE = 'Bangalore Open Air 2026 — Crew accreditation';
var SHEET_TITLE = 'BOA 2026 — Crew roster (form responses)';

/** Question titles. These become the response-sheet column headers. */
var Q = {
  ORG: 'Organisation',
  NAME: 'Full name',
  PHONE: 'WhatsApp number',
  CREW_TYPE: 'Crew type',
  JOB: 'Job title',
  DAYS: 'Days on site',
  VEHICLE: 'Loading vehicle registration',
};

/** As given by Salman, 21 Sep 2026, plus an "Other" write-in, Special Tickets
 *  Crew and BOA Internal Crew (all Vipin, same day), then Family & Friends and Media / Photo (Vipin, 29 Sep). Add a type here, not in the
 *  form editor, so it stays recorded. */
var CREW_TYPES = [
  'Security',
  'Bouncer',
  'Bar Crew',
  'Merch Crew',
  'Artist Hospitality',
  'Food Stalls',
  'Cashless',
  'Sound & Lights',
  'Generator',
  'Ground Production',
  'Sponsor',
  'Special Tickets Crew',
  'BOA Internal Crew',
  'Family & Friends',
  'Media / Photo',
];

/** Mirrors the boa_acc_day_validity enum: build / show / build_show. */
var DAYS = [
  'Build days only (5–9 Oct)',
  'Show day only (10 Oct)',
  'Both build and show',
];

var PROP_FORM_ID = 'BOA_FORM_ID';
var PROP_ITEM_PREFIX = 'BOA_ITEM_';

/**
 * Every question, in order. `key` is stable forever; `title` may change, and
 * `legacyTitles` lets the script find a question under a name it used to have,
 * so a rename updates the question instead of adding a second one.
 */
function questionSpecs_() {
  return [
    ORGS.length > 0
      ? {
          key: 'ORG', type: 'LIST', title: Q.ORG, required: true,
          help: 'The company you are working with or for.',
          choices: ORGS,
        }
      : {
          key: 'ORG', type: 'TEXT', title: Q.ORG, required: true,
          help: 'The company you are working with or for — spelled the same way every time.',
        },
    {
      key: 'NAME', type: 'TEXT', title: Q.NAME, required: true,
      help: 'As printed on the photo ID they will carry.',
      pattern: '^.{2,80}$', patternHelp: 'Between 2 and 80 characters.',
    },
    {
      // Ten digits for an Indian number (the importer adds +91), or + and the
      // country code for any other country (ACC-195). Renamed from "Mobile
      // number" by Vipin, 21 Sep; the former titles are adopted so the rename
      // is in place.
      key: 'PHONE', type: 'TEXT', title: Q.PHONE, required: true,
      legacyTitles: ['Mobile number', 'WhatsApp Number'],
      help: 'India: 10 digits, no +91. Any other country: the country code then the number, e.g. +971501234567 or 971501234567. No spaces.',
      pattern: '^([6-9][0-9]{9}|\\+?[1-9][0-9]{10,14})$',
      patternHelp: 'India: 10 digits starting 6, 7, 8 or 9. Other countries: the country code then the number (a leading + is fine), no spaces.',
    },
    {
      // Multiple choice, not a dropdown: Google Forms only offers a write-in
      // "Other" on multiple-choice questions. Whatever is typed there lands in
      // the response sheet as the crew type itself.
      key: 'CREW_TYPE', type: 'MULTIPLE_CHOICE', title: Q.CREW_TYPE, required: true,
      help: 'What they will be doing. The accreditation desk decides the band from this. ' +
        'If none fits, choose Other and type it in.',
      choices: CREW_TYPES, other: true,
    },
    {
      key: 'JOB', type: 'TEXT', title: Q.JOB, required: false,
      help: 'Optional. e.g. Head rigger, Shift supervisor, Driver.',
      pattern: '^.{2,60}$', patternHelp: 'Between 2 and 60 characters.',
    },
    {
      // Required: nobody can be approved without a day validity.
      key: 'DAYS', type: 'MULTIPLE_CHOICE', title: Q.DAYS, required: true,
      help: 'A show-day band does not open the gate during build days.',
      choices: DAYS, other: false,
    },
    {
      // Only for vehicles that load or unload equipment (Vipin, 21 Sep).
      key: 'VEHICLE', type: 'TEXT', title: Q.VEHICLE, required: false,
      legacyTitles: ['Vehicle registration'],
      help: 'Only for a vehicle loading or unloading equipment. Example: KA01AB1234. ' +
        'Leave blank for everyone else.',
      pattern: '^[A-Za-z]{2} ?[0-9]{1,2} ?[A-Za-z]{0,3} ?[0-9]{1,4}$',
      patternHelp: 'Indian registration format, e.g. KA01AB1234.',
    },
  ];
}

function buildRosterForm() {
  var props = PropertiesService.getScriptProperties();
  var form = openOrCreateForm_(props);
  var specs = questionSpecs_();
  var hasResponses = form.getResponses().length > 0;

  // Plan before touching anything. A question whose type must change has to be
  // deleted and re-added, which would split its response column — so if the
  // form already has responses, refuse here, while the form is still untouched.
  var plan = [];
  var blocked = [];
  for (var p = 0; p < specs.length; p++) {
    var found = findQuestion_(form, specs[p], props);
    var retype = !!found && found.getType() !== FormApp.ItemType[specs[p].type];
    if (retype && hasResponses) blocked.push(found.getTitle());
    plan.push({ spec: specs[p], existing: found, retype: retype });
  }
  if (blocked.length) {
    throw new Error(
      'These questions need to change type, which Google cannot do in place, and ' +
        'the form already has responses: "' + blocked.join('", "') + '". Nothing has ' +
        'been changed. If those are only test responses: open the form ▸ Responses ▸ ' +
        '⋮ ▸ Delete all responses, then run again.'
    );
  }

  form.setTitle(FORM_TITLE);
  form.setDescription(
    'One submission per person. After you submit, use "Submit another response" ' +
      'to add the next one.\n\n' +
      'We collect only name, WhatsApp number, crew type and, for loading vehicles, ' +
      'the registration. Do not send ID numbers, Aadhaar, photos, addresses or ' +
      'dates of birth.\n\n' +
      'Every person must carry photo ID matching the name given here. Bands are ' +
      'handed over at the gate from 4 October; someone not submitted here has no band.'
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(true);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage(
    'Submitted. To add the next person, click "Submit another response".'
  );

  var recreated = [];
  var ours = {};

  for (var i = 0; i < plan.length; i++) {
    var result = syncQuestion_(form, plan[i], props);
    if (result.recreated) recreated.push(plan[i].spec.title);
    ours[result.id] = true;
    // Keep the order fixed. getIndex() is on every typed item.
    form.moveItem(result.item.getIndex(), i);
  }

  // Anything else on the form is left exactly as it is — it may hold answers.
  var extras = form.getItems().filter(function (it) { return !ours[it.getId()]; });

  var sheetUrl = ensureDestination_(form);

  Logger.log('SEND THIS LINK to organisations: ' + form.getPublishedUrl());
  Logger.log('Edit the form:                   ' + form.getEditUrl());
  Logger.log('Responses land in:               ' + sheetUrl);
  if (recreated.length) {
    Logger.log(
      'NOTE: rebuilt because its type changed: ' + recreated.join(', ') + '. ' +
        'Google cannot convert a question in place, so the response sheet may now ' +
        'show the old column as well as the new one. Delete the old, empty column ' +
        'in the sheet so every column name appears once.'
    );
  }
  if (extras.length) {
    Logger.log(
      'NOTE: the form has questions this script does not manage, left untouched: ' +
        extras.map(function (it) { return '"' + it.getTitle() + '"'; }).join(', ')
    );
  }

  return {
    formUrl: form.getPublishedUrl(),
    editUrl: form.getEditUrl(),
    sheetUrl: sheetUrl,
  };
}

/** Run once to make the next buildRosterForm create a brand-new form. */
function forgetForm() {
  clearRemembered_(PropertiesService.getScriptProperties());
  Logger.log('Forgotten. The next buildRosterForm run creates a new form. ' +
    'The old form still exists — delete it in Google Drive if you no longer want it.');
}

/** Silent: used when adopting KEEP_FORM, where "forgotten" would be misleading. */
function clearRemembered_(props) {
  var keys = props.getKeys();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === PROP_FORM_ID || keys[i].indexOf(PROP_ITEM_PREFIX) === 0) {
      props.deleteProperty(keys[i]);
    }
  }
}

function openOrCreateForm_(props) {
  var stored = props.getProperty(PROP_FORM_ID);
  var wanted = KEEP_FORM ? formIdFrom_(KEEP_FORM) : null;

  // An explicit KEEP_FORM wins, and the remembered question IDs belong to the
  // old form, so they are dropped.
  if (wanted && wanted !== stored) {
    clearRemembered_(props);
    stored = null;
  }

  var id = wanted || stored;
  if (id) {
    var form;
    try {
      form = FormApp.openById(id);
    } catch (e) {
      // Keep Google's own reason: "no access" and "does not exist" need
      // different fixes, and the script cannot tell them apart for you.
      throw new Error(
        'Could not open the form ' + id + ' (Google said: ' + e.message + '). ' +
          'Usually this Google account cannot edit that form — run the script signed in ' +
          'as the form\'s owner, or have the owner share it with you as an editor. ' +
          'Check KEEP_FORM is the edit link. To start over instead, run forgetForm.'
      );
    }
    props.setProperty(PROP_FORM_ID, id);
    return form;
  }

  var created = FormApp.create(FORM_TITLE);
  props.setProperty(PROP_FORM_ID, created.getId());
  return created;
}

/** Accepts an edit link or a bare ID. Refuses the respondent link, whose ID
 *  (after /d/e/) is not the form's file ID and cannot be opened. */
function formIdFrom_(value) {
  var v = String(value).trim();
  if (/\/forms\/d\/e\//.test(v)) {
    throw new Error(
      'KEEP_FORM is the link you send to respondents (…/d/e/…/viewform). ' +
        'Paste the EDIT link instead — open the form and copy the address ending in /edit.'
    );
  }
  var m = /\/forms\/d\/([a-zA-Z0-9_-]{20,})/.exec(v);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v;
  throw new Error('KEEP_FORM does not look like a Google Form edit link: ' + v);
}

function findQuestion_(form, spec, props) {
  var savedId = props.getProperty(PROP_ITEM_PREFIX + spec.key);
  if (savedId) {
    var byId = form.getItemById(Number(savedId));
    if (byId) return byId;
  }
  var titles = [spec.title].concat(spec.legacyTitles || []);
  var items = form.getItems();
  for (var i = 0; i < items.length; i++) {
    if (titles.indexOf(items[i].getTitle()) !== -1) return items[i];
  }
  return null;
}

/** Applies one planned question. Type conflicts on a form with responses were
 *  already refused in buildRosterForm, so a retype here is always safe. */
function syncQuestion_(form, step, props) {
  var spec = step.spec;
  var existing = step.existing;
  var recreated = false;

  if (existing && step.retype) {
    form.deleteItem(existing.getIndex());
    existing = null;
    recreated = true;
  }

  var q;
  if (existing) {
    q = spec.type === 'TEXT' ? existing.asTextItem()
      : spec.type === 'LIST' ? existing.asListItem()
      : existing.asMultipleChoiceItem();
  } else {
    q = spec.type === 'TEXT' ? form.addTextItem()
      : spec.type === 'LIST' ? form.addListItem()
      : form.addMultipleChoiceItem();
  }

  q.setTitle(spec.title).setHelpText(spec.help).setRequired(spec.required);
  if (spec.choices) q.setChoiceValues(spec.choices);
  if (spec.type === 'MULTIPLE_CHOICE') q.showOtherOption(!!spec.other);
  if (spec.type === 'TEXT') {
    if (spec.pattern) {
      q.setValidation(
        FormApp.createTextValidation()
          .requireTextMatchesPattern(spec.pattern)
          .setHelpText(spec.patternHelp)
          .build()
      );
    } else {
      q.clearValidation();
    }
  }

  props.setProperty(PROP_ITEM_PREFIX + spec.key, String(q.getId()));
  return { item: q, id: q.getId(), recreated: recreated };
}

/** Keeps the existing response sheet; only creates one if none is linked.
 *
 *  "No sheet is linked" and "a sheet is linked but cannot be opened" are
 *  deliberately different. Only the first creates a sheet. Treating the second
 *  the same way would silently relink the form, and every response after that
 *  would go somewhere nobody is looking. */
function ensureDestination_(form) {
  var destId = null;
  try {
    destId = form.getDestinationId();
  } catch (e) {
    destId = null; // Google throws when no destination is set.
  }

  if (destId) {
    try {
      return SpreadsheetApp.openById(destId).getUrl();
    } catch (e) {
      throw new Error(
        'The form is linked to response sheet ' + destId + ' but this account cannot ' +
          'open it (Google said: ' + e.message + '). The form has been updated; the ' +
          'link to its sheet has NOT been changed. Share that sheet with this account, ' +
          'or run the script as its owner.'
      );
    }
  }

  var sheet = SpreadsheetApp.create(SHEET_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  return sheet.getUrl();
}
