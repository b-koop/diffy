interface NamedCandidate {
  label: string
}

const labelAt = (index: number): string => {
  let value = index + 1
  let label = ''
  while (value > 0) {
    value--
    label = String.fromCharCode(65 + value % 26) + label
    value = Math.floor(value / 26)
  }
  return label
}

export function nextCandidateLabel(candidates: NamedCandidate[]): string {
  const existing = new Set(candidates.map(({ label }) => label.trim().toLowerCase()))
  for (let index = 0; ; index++) {
    const label = labelAt(index)
    if (!existing.has(label.toLowerCase())) return label
  }
}
