# Architecture decision records

Short notes on decisions that shape ICCWorship and would be expensive to reverse: what we chose, what else we
considered, and why. Read them before proposing a change in the same area; if a decision no longer holds, add a
new record that supersedes it rather than editing history.

| # | Decision | Status |
|---|---|---|
| [0001](0001-json-files-not-sqlite.md) | Keep the data in JSON files, not SQLite | Accepted |
| [0002](0002-pages-from-app-protocol.md) | Serve the app's pages from `app://iccworship`, not `file://` | Accepted |
| [0003](0003-updates-opt-in-install-on-quit.md) | Updates: opt-in, never during a service, installed on quit | Accepted |
| [0004](0004-media-library-copies.md) | The media library keeps its own copies | Accepted |
| [0005](0005-portable-data-beside-exe.md) | The portable exe keeps its data beside it | Accepted |
| [0006](0006-content-languages.md) | Song and Bible content stays English + Spanish | Accepted (revisit) |
| [0007](0007-code-signing.md) | Code signing happens inside electron-builder | Proposed |
| [0008](0008-typed-ipc-contract.md) | The IPC contract is main's handler objects | Accepted |

New record: copy the format of an existing one (Context, Decision, Consequences, Alternatives), number it next.
