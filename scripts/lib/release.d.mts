export function nextVersion(current: string, kind: string): string
export function cutChangelog(text: string, version: string, date: string): { text: string; notes: string }
export function setPackageVersion(json: string, version: string): string
