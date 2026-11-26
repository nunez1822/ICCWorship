# 0007 · Code signing happens inside electron-builder

**Status:** Proposed (needs the maintainer's signing account)

## Context
The installers are unsigned: Windows SmartScreen warns ("unknown publisher"), the portable exe is the build antivirus
flags most often, winget won't accept it, and updates (ADR 0003) can't check the publisher.

## Decision
Sign in CI, **inside** the electron-builder run, never after it:
- `latest.yml` holds the SHA-512 of the installer electron-builder produced. Signing the exe afterwards changes its
  bytes, and every installed copy would then refuse the update. electron-builder signs before it computes the hashes.
- Preferred: the **SignPath Foundation** (free for OSS): a `win.sign` hook in `electron-builder.yml` that submits the
  file to SignPath and waits (their PowerShell module / CLI), credentials from repository secrets, and a signing
  policy page in the repo. Alternative: **Azure Artifact Signing** (about $10/month) through electron-builder's built-in
  `azureSignOptions`.
- Then set `publisherName` in `electron-builder.yml` so updates verify the publisher too, and submit a winget manifest.

## Consequences
- Releases need the secrets; forks and PR builds stay unsigned (PR test builds are labelled unsigned already).
- SmartScreen reputation still builds over time even with an OV certificate.

## Alternatives considered
- **Sign the exes in a separate job after the build:** breaks `latest.yml` hashes (see above). Rejected.
- **Stay unsigned:** acceptable only while there are no users.
