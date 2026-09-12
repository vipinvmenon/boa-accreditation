# Gate device-token handoff

This is the preparation and sign-off template for ACC-061. It does not mint
tokens and contains no real device credentials. Tokens are secrets: never put
one in this document, a ticket, source control, or a paper fallback sheet.

## Handoff record

Complete one row per physical phone, by hand at the desk:

```text
Phone label / asset ID: _________________________________________
Gate label: ____________________________________________________
Volunteer name: ________________________________________________
Scope:   [ ] crew   [ ] vehicle   [ ] both
Expires at (shown by desk): _____________________________________
Device token pasted successfully:   [ ] yes   [ ] no
Roster pull completed:              [ ] yes   [ ] no
Roster count / as-of time: ______________________________________
Volunteer confirmed offline screen: [ ] yes   [ ] no
Desk operator initials: _________________________________________
Volunteer initials: _____________________________________________
```

## Operator procedure

1. On `/desk/devices`, sign in as Bhoopesh or another lead/admin. Confirm the
   gate label, volunteer name, and scope before selecting **Mint device**.
2. Copy the raw token immediately. The UI shows it once; it cannot be recovered.
   Do not read it aloud or write it in the handoff record.
3. On the intended phone, open `/gate/setup`, paste the token, and wait for a
   non-empty roster pull. Do not take the phone to the barrier before this
   succeeds.
4. Compare the displayed roster count and as-of time with the desk's approved
   figure. If they differ, stop and resolve the discrepancy at the desk.
5. Disable the radio and confirm the cached gate screen still renders. Re-enable
   the radio before leaving setup so queued work can eventually drain.
6. Record only the non-secret handoff fields above. The volunteer may hold the
   token in the phone's local storage; the desk list retains only its hint.
7. If a token is lost or exposed, revoke that device at `/desk/devices` and mint
   a replacement. Never try to reconstruct or reuse the old token.

## Human acceptance checklist

- [ ] Four physical phones were identified.
- [ ] Four device rows were minted by an authorised lead/admin.
- [ ] Each raw token was pasted into its intended phone and not recorded here.
- [ ] Each phone completed a non-empty roster pull.
- [ ] Each phone passed the offline-screen check.
- [ ] Device labels, volunteers, scopes, expiry times, and roster as-of times
      were recorded above.
- [ ] The physical handoff was signed off in `docs/CURRENT-STATE.md`.

Until these boxes are completed by a human, ACC-061 is preparation only. The
database's mint/revoke path and `/gate/setup` are not evidence that four
physical phones received usable credentials.
