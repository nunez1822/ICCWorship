# 0007 · Code signing happens inside electron-builder

**Status:** Proposed (2026-11; needs the maintainer's signing account)

## Context
The installers are unsigned: Windows SmartScreen warns ("unknown publisher"), the portable exe is the build antivirus
flags most often, winget validation is more likely to flag an unsigned installer, and updates (ADR 0003) can't check
the publisher.

## Decision
Sign in CI, **inside** the electron-builder run, never after it:
- `latest.yml` holds the SHA-512 of the installer electron-builder produced. Signing the exe afterwards changes its
  bytes, and every installed copy would then refuse the update. electron-builder signs before it computes the hashes.
- Preferred: the **SignPath Foundation** (free for OSS): a custom `win.signtoolOptions.sign` script in
  `electron-builder.yml` that submits each file to SignPath and waits (their PowerShell module / CLI), credentials
  from repository secrets, and a signing policy page in the repo. To check with SignPath before choosing: their
  certificates are issued to "SignPath Foundation" (that is the publisher users see, and the `publisherName`);
  release signing requests usually need a manual approval and origin verification through their CI integration; and
  electron-builder signs several files per build (the app exe, the uninstaller, the installer, the portable exe), so
  a per-file hook may mean several approvals — batching them may need SignPath's own GitHub action instead.
- Alternative: **Azure Artifact Signing** (about $10/month) through electron-builder's built-in `win.azureSignOptions`
  (`publisherName` is required there).
- Then set `publisherName` so updates verify the publisher too, and submit a winget manifest.

## Consequences
- Releases need the secrets; forks and PR builds stay unsigned (PR test builds are labelled unsigned already).
- SmartScreen reputation still builds over time even with an OV certificate.
- Once a release puts `publisherName` into `app-update.yml`, electron-updater refuses any update not signed by that
  name. Changing provider or certificate subject (or one unsigned release) would strand installed copies: list both
  the old and the new name in `publisherName` for at least one release before switching.

## Alternatives considered
- **Sign the exes in a separate job after the build:** breaks `latest.yml` hashes (see above). Rejected.
- **Stay unsigned:** acceptable only while there are no users.
