/**
 * BANGALORE OPEN AIR 2026 — crew roster form builder
 * ==================================================
 *
 * Builds the Google Form organisations use to submit their people, and links it
 * to a response spreadsheet so every submission lands in one place.
 *
 * HOW TO RUN (once):
 *   1. Go to https://script.google.com  ▸  New project
 *   2. Paste this whole file over everything  ▸  Save
 *   3. Choose buildRosterForm in the function dropdown  ▸  Run
 *   4. Authorise when Google asks (it creates one form and one spreadsheet)
 *   5. Open  View ▸ Logs  (or Execution log) — it prints the form link to send
 *      out, the edit link, and the response spreadsheet link.
 *
 * Running it again creates a SECOND form and sheet. It never edits or deletes
 * an existing one, so a mistaken re-run cannot touch responses already in.
 *
 * WHAT IT COLLECTS — and nothing more (CLAUDE.md non-negotiable #9):
 *   organisation, full name, phone, crew type, job title, days, and a loading
 *   vehicle's registration where there is one.
 * No ID number, no Aadhaar, no photo, no address, no date of birth, and the
 * form does not collect respondents' email addresses.
 *
 * THE QUESTION TITLES ARE A CONTRACT. Google names each response-sheet column
 * after its question title, and the importer reads those columns by name. Do
 * not reword a title in the form editor after launch without updating
 * docs/ROSTER-FORM.md and the importer.
 */

// ─────────────────────────────────────────────────────────────────────────────
// ORGANISATIONS — the real list is still owed (ROADMAP ACC-030a).
//
// Leave this EMPTY and the form asks for the organisation as free text.
// Fill it in and the question becomes a dropdown, which gives far cleaner data
// ("F5 Events" rather than "F5", "f5 events", "F5 Events Pvt Ltd"...).
//   var ORGS = ['F5 Events', 'Reynolds', ...];
// ─────────────────────────────────────────────────────────────────────────────
var ORGS = [];

var FORM_TITLE = 'Bangalore Open Air 2026 — Crew accreditation';
var SHEET_TITLE = 'BOA 2026 — Crew roster (form responses)';

/** Question titles. These become the response-sheet column headers. */
var Q = {
  ORG: 'Organisation',
  NAME: 'Full name',
  PHONE: 'Mobile number',
  CREW_TYPE: 'Crew type',
  JOB: 'Job title',
  DAYS: 'Days on site',
  VEHICLE: 'Loading vehicle registration',
};

/** As given by Salman, 21 Sep 2026, plus an "Other" write-in (Vipin, same day)
 *  for anything the list does not cover. Add a type here, not in the form
 *  editor, so it stays recorded. */
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
];

/** Mirrors the boa_acc_day_validity enum: build / show / build_show. */
var DAYS = [
  'Build days only (5–9 Oct)',
  'Show day only (10 Oct)',
  'Both build and show',
];

function buildRosterForm() {
  var form = FormApp.create(FORM_TITLE);

  form.setDescription(
    'One submission per person. After you submit, use "Submit another response" ' +
      'to add the next one.\n\n' +
      'We collect only name, mobile number, crew type and vehicle registration. ' +
      'Do not send ID numbers, Aadhaar, photos, addresses or dates of birth.\n\n' +
      'Every person must carry photo ID matching the name given here. Bands are ' +
      'handed over at the gate from 4 October; someone not submitted here has no band.'
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(true);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage(
    'Submitted. To add the next person, click "Submit another response".'
  );

  // 1. Organisation
  if (ORGS.length > 0) {
    form
      .addListItem()
      .setTitle(Q.ORG)
      .setHelpText('The company you are working with or for.')
      .setChoiceValues(ORGS)
      .setRequired(true);
  } else {
    form
      .addTextItem()
      .setTitle(Q.ORG)
      .setHelpText('The company you are working with or for — spelled the same way every time.')
      .setRequired(true);
  }

  // 2. Full name
  form
    .addTextItem()
    .setTitle(Q.NAME)
    .setHelpText('As printed on the photo ID they will carry.')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^.{2,80}$')
        .setHelpText('Between 2 and 80 characters.')
        .build()
    )
    .setRequired(true);

  // 3. Mobile number — ten digits only. The importer adds +91.
  form
    .addTextItem()
    .setTitle(Q.PHONE)
    .setHelpText('10 digits, no +91, no spaces. Example: 9876543210')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[6-9][0-9]{9}$')
        .setHelpText('Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9. No +91, no spaces.')
        .build()
    )
    .setRequired(true);

  // 4. Crew type — the organisation knows this; the desk maps it to a band.
  // Multiple choice, not a dropdown: Google Forms only offers a write-in
  // "Other" on multiple-choice questions. Whatever is typed there lands in the
  // response sheet as the crew type itself.
  form
    .addMultipleChoiceItem()
    .setTitle(Q.CREW_TYPE)
    .setHelpText(
      'What they will be doing. The accreditation desk decides the band from this. ' +
        'If none fits, choose Other and type it in.'
    )
    .setChoiceValues(CREW_TYPES)
    .showOtherOption(true)
    .setRequired(true);

  // 5. Job title — optional detail within the crew type.
  form
    .addTextItem()
    .setTitle(Q.JOB)
    .setHelpText('Optional. e.g. Head rigger, Shift supervisor, Driver.')
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^.{2,60}$')
        .setHelpText('Between 2 and 60 characters.')
        .build()
    )
    .setRequired(false);

  // 6. Days on site — required: nobody can be approved without it.
  form
    .addMultipleChoiceItem()
    .setTitle(Q.DAYS)
    .setHelpText('A show-day band does not open the gate during build days.')
    .setChoiceValues(DAYS)
    .setRequired(true);

  // 7. Loading vehicle registration — optional, and only for vehicles that load
  // or unload equipment (Vipin, 21 Sep). Not for personal transport.
  form
    .addTextItem()
    .setTitle(Q.VEHICLE)
    .setHelpText(
      'Only for a vehicle loading or unloading equipment. Example: KA01AB1234. ' +
        'Leave blank for everyone else.'
    )
    .setValidation(
      FormApp.createTextValidation()
        .requireTextMatchesPattern('^[A-Za-z]{2} ?[0-9]{1,2} ?[A-Za-z]{0,3} ?[0-9]{1,4}$')
        .setHelpText('Indian registration format, e.g. KA01AB1234.')
        .build()
    )
    .setRequired(false);

  var sheet = SpreadsheetApp.create(SHEET_TITLE);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('SEND THIS LINK to organisations: ' + form.getPublishedUrl());
  Logger.log('Edit the form:                   ' + form.getEditUrl());
  Logger.log('Responses land in:               ' + sheet.getUrl());

  return {
    formUrl: form.getPublishedUrl(),
    editUrl: form.getEditUrl(),
    sheetUrl: sheet.getUrl(),
  };
}
