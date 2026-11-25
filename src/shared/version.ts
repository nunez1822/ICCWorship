/** Release versions ("1.2.3", "v1.2.3", "1.2.3-beta.1"): is `latest` newer than `current`? Pure, unit tested. */
function parse(v: string): { nums: number[]; pre: string } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim())
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' } : null
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parse(latest)
  const b = parse(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i]
  // same numbers: a release beats its own pre-release; pre-releases are never offered over a release
  if (!a.pre && b.pre) return true
  return false
}
