export type FindingDecision = 'unreviewed' | 'approve' | 'deny' | 'edit' | 'cant-verify'
export interface FindingAnswer { decision: FindingDecision; text: string }
export interface Finding {
  id: string
  sourceNumber: string
  title: string
  rawText: string
  claim: string
  evidence: string
  proposedFix: string
  findingAnswer: FindingAnswer
  fixAnswer: FindingAnswer
}
export interface FindingBatch { id: string; rawText: string; findings: Finding[] }

export function findingAnswerText(finding: Finding, question: 'finding' | 'fix'): string {
  return finding[question === 'finding' ? 'findingAnswer' : 'fixAnswer'].text
}

const actionLabel = (answer: FindingAnswer) => answer.decision === 'unreviewed' ? 'UNREVIEWED'
  : answer.decision === 'approve' ? 'Approve' : answer.decision === 'deny' ? 'Deny'
    : answer.decision === 'cant-verify' ? 'Can’t verify' : answer.text.trim() ? 'Edit' : 'INCOMPLETE EDIT'

export function findingBatchOutput(batch: FindingBatch): string {
  return batch.findings.map((f) => `${f.sourceNumber}. ${f.title}\nRaise finding: ${actionLabel(f.findingAnswer)}\n${f.findingAnswer.text}\nRecommend fix: ${actionLabel(f.fixAnswer)}\n${f.fixAnswer.text}`).join('\n\n')
}

export function isFindingDecision(value: unknown): value is FindingDecision {
  return value === 'unreviewed' || value === 'approve' || value === 'deny' || value === 'edit' || value === 'cant-verify'
}
