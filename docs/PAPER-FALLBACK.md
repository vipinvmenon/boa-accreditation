# Paper fallback

This is a preparation template for ACC-059. It is not an export of the
database, and it contains no event names, organisation data, pass tokens, or
device tokens. Bhoopesh must supply the approved roster before this can be
printed.

## Approved list by organisation

Prepare one CSV from the approved desk list with exactly these columns:

```text
organisation,pass_ref,full_name,role,vehicle_registration,type_code,day_validity
```

Use one row per approved person. Keep organisations grouped and sort each
group by `pass_ref`. Leave `vehicle_registration` empty when none was
submitted. Do not add `pass_token`, device tokens, phone numbers, IDs,
addresses, or any other columns. Validate the file before printing:

```bash
corepack pnpm validate:paper -- path/to/approved-roster.csv
```

The validator checks the header, required values, CSV quoting, duplicate pass
references, and that no token-like column is present. It does not connect to
Supabase or assert that the rows are approved; the desk operator must compare
the source list with `/desk/master` and record the roster's as-of time.

Print two copies:

1. one organised by company at the gate desk;
2. one sealed backup held by the accreditation lead.

Write the roster as-of time, preparer's initials, and print date on every copy.
Do not write a device token or a pass token on the paper.

## Blank issue sheet

Print one numbered bundle of blank sheets. Numbering is for reconciliation only;
it is not a pass reference and must not be pre-filled with a person or serial.

```text
BOA ACCREDITATION — PAPER ISSUE RECORD

Sheet number: ____________________    Date: ____________________
Gate: ____________________________    Recorder: _________________

Person / pass reference: ________________________________________
Organisation: _________________________________________________
Vehicle registration (if any): _________________________________

Decision:   [ ] issue   [ ] reissue   [ ] turn away
Reason / supervisor note (required for reissue or turn-away):
_______________________________________________________________
_______________________________________________________________

Wristband serial (type only when physically handed over):
_______________________________________________________________
Vehicle-sticker serial (type only when physically handed over):
_______________________________________________________________

Time physically handed over: ___________________________________
Recorder signature: ____________________________________________
Supervisor check (if reissue): _________________________________
```

The paper record is append-only. Use a new sheet for a reissue or correction;
do not erase or overwrite an earlier sheet. A blank serial means nothing was
handed over. After the radio returns, the accreditation lead reconciles each
sheet against the desk ledger and stores or destroys the paper according to the
retention decision.

## Human acceptance checklist

- [ ] Bhoopesh supplied the authoritative approved roster.
- [ ] The roster was checked against `/desk/master` at a recorded as-of time.
- [ ] The CSV validator passed.
- [ ] The paper list was physically printed and checked for legibility.
- [ ] Blank issue sheets were physically printed and counted.
- [ ] Copies are held at the gate desk and by the accreditation lead.
- [ ] The fallback has not been treated as complete until the above physical
      checks are signed off in `docs/CURRENT-STATE.md`.
