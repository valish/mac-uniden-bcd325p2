# Programming and recovery

## First session

Run `npm start` or double-click `Start Programmer.command`. Keep its Terminal window open. Use desktop Chrome for the scanner connection; plan preparation itself does not require a serial-capable browser.

Connect the powered-on BCD325P2 with a mini-USB data cable. Leave it on Scan/Hold, outside the menu. Click **Connect scanner** and select **BCD325P2 Serial Port**. The application checks the model and reads the firmware before offering memory operations.

Import or prepare a plan. Check the channels, sources, site frequencies, decimal talkgroups and initial listening selection. Then select the review checkbox and use **Back up & program**.

The uploader:

1. Reads existing systems and selected global settings and saves a durable snapshot.
2. Checks memory capacity, existing system names, quick-key collisions and any matching recovery receipt.
3. Adds new systems or reuses matching records from a partial upload. New systems/sites remain locked during channel writes. Every setter is followed by a readback.
4. Leaves Remote Mode, starts a fresh programming session, applies listening quick keys, and unlocks the managed systems/sites.
5. Leaves Remote Mode again and performs a complete fresh-session readback, including group keys, system/site lockouts and initial listening state.
6. Saves the final snapshot and receipt, then returns to Scan Hold.

Only **Upload verified** and a completed receipt establish that this sequence finished. Press **Scan/Srch** to listen.

## Existing systems and later visits

Existing systems are preserved. Preferred quick keys can change when occupied; the displayed and printed actual mapping is authoritative after upload.

Use **Verify installed plan** to check an already-installed plan. Verification reports current listening selection and compares the configuration. It does not rewrite the scanner.

Editing a source plan produces a different fingerprint. This version does not silently update arbitrary previously installed systems. To append a deliberately separate plan, choose a distinct namespace. If replacing an older plan is necessary, review and manage those systems deliberately outside this app; there is no erase/reset/delete button here.

## Interrupted upload

Keep the same source plan and private data directory. Reconnect, load the plan, and run **Back up & program** again. The application loads the latest incomplete receipt and verifies that recorded systems, groups, channels, sites and receive settings match the planned prefix before reusing them.

Recovery refuses changed names, frequencies, IDs, unexpected extra records, a different firmware, or an unrecorded allocation. If a device allocation succeeded but its reply or the following receipt save was lost, automatic recovery may be impossible. The snapshot and transcript help a maintainer inspect that exact state. Do not repeatedly retry an uncertain allocation or reset the whole scanner.

Verified recovery assignments keep their existing quick keys, even when all 100 keys are occupied. Recovery stops before writes if another system now shares one of those keys or duplicates a managed system name. Review that conflict on the scanner before trying again.

A stop request completes the outstanding command, then attempts to leave Remote Mode. A disconnected cable or failed transport may prevent that final command; power the scanner off/on if Remote Mode remains on screen.

The snapshot is raw diagnostic JSON. It is **not** a ProScan file, a FreeSCAN file, or a one-click restoration backup. Preserve the original software’s native backup too when available.

## Common connection problems

| Symptom                         | Action                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| No serial API                   | Use desktop Chrome; Safari is not the connection route used here                          |
| No device in chooser            | Confirm power, data-capable cable, adapter and Mac device detection                       |
| Port busy                       | Disconnect another tab or scanner application using the same port                         |
| `claimInterface`                | This is a raw WebUSB path; this project uses Web Serial through the Mac driver            |
| No response to MDL/VER          | Return to Scan/Hold, reconnect and check cable; do not continue writes                    |
| Readback mismatch               | Keep the receipt; inspect the exact command and response before changing expectations     |
| Matching names without recovery | Verify the existing plan or select a different namespace; do not create duplicate systems |
| Local server unavailable        | Start the launcher again and open its printed URL; keep Terminal running                  |
| Node not found                  | Install Node.js 22+ or run from a terminal where Node is available                        |

Do not install an obsolete unsigned scanner driver or change Mac security settings as a routine workaround. No such change was needed for the tested configuration.

## Listen and print

During scanning, a one-digit system quick key toggles that system. For a two-digit key, press **./no** and then both digits. Group quick keys control groups within the current system. A source plan’s preferred keys can differ from actual allocated keys.

Print the plan after upload or verification to capture actual assignments. The print reference includes channel labels, full names, frequencies/talkgroups, sites, sources, exclusions and notes. Documented tone/NAC values in notes are reference information; this version still programs analog tone off and conventional P25 NAC Search.

Keep NOAA and broadcast FM separate from incident scanning because continuous signals can hold scanning. This app does not configure SAME alert standby. A programmed frequency is not evidence of current traffic or local reception.
