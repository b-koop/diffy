import { useMemo, useState } from 'react'
import { parseDiff, type DiffFile } from '../lib/parseDiff'
import { findingAnswerText, findingBatchOutput, type Finding, type FindingAnswer, type FindingDecision } from '../lib/findings'
import { parseFindingCitations, resolveFindingCitation, type FindingCitation } from '../lib/findingCitations'
import type { Candidate } from '../store'
import { useStore } from '../store'
import { copyTextToClipboard } from '../lib/clipboard'
import { FindingImport } from './FindingImport'

export function FindingsPanel({ problemId, candidate, onFocus }: { problemId: string; candidate: Candidate; onFocus(target: { file: string; side: 'old' | 'new'; lineNumber: number }): void }) {
  const editFinding = useStore((s) => s.editFinding)
  const deleteFindingBatch = useStore((s) => s.deleteFindingBatch)
  const [active, setActive] = useState<string>()
  const [importing, setImporting] = useState(false)
  const [filter, setFilter] = useState<'All'|'Unreviewed'|'Reviewed'>('All')
  const [editingSource, setEditingSource] = useState(false)
  const batches = candidate.findingBatches ?? []
  const findings = batches.flatMap((batch) => batch.findings)
  const selected = findings.find((f) => f.id === active) ?? findings[0]
  const files = useMemo(() => { const result = parseDiff(candidate.rawDiff); return result.ok ? result.files : [] }, [candidate.rawDiff])
  const complete = (a: FindingAnswer) => a.decision !== 'unreviewed' && (a.decision !== 'edit' || Boolean(a.text.trim()))
  const visible = findings.filter((f) => filter === 'All' || (filter === 'Reviewed' ? complete(f.findingAnswer) && complete(f.fixAnswer) : !complete(f.findingAnswer) || !complete(f.fixAnswer)))
  const queueIndex = visible.findIndex((f) => f.id === selected?.id)
  const answerGroup = (f: Finding, key: 'findingAnswer'|'fixAnswer', label: string) => {
    const answer = f[key]
    const set = (patch: Partial<FindingAnswer>) => editFinding(problemId, candidate.id, f.id, { [key]: { ...answer, ...patch } })
    const prefix = key === 'findingAnswer' ? 'Finding' : 'Fix'
    return <fieldset><legend>{label}</legend>{(['approve','deny','edit','cant-verify'] as FindingDecision[]).map((d) => <label key={d}><input type="radio" name={`${f.id}-${key}`} checked={answer.decision === d} onChange={() => set({ decision: d })} />{d === 'cant-verify' ? 'Can’t verify' : d[0].toUpperCase() + d.slice(1)}</label>)}<button type="button" className="secondary" onClick={() => set({ decision: 'unreviewed' })}>Clear decision</button>{(answer.decision !== 'unreviewed' || Boolean(answer.text)) && <label>{answer.decision === 'edit' ? (key === 'findingAnswer' ? 'Revised finding' : 'Revised fix') : answer.decision === 'unreviewed' ? `Imported ${prefix.toLowerCase()} response` : `${prefix} notes`}<textarea value={answer.text} onChange={(e) => set({ text: e.target.value })} /></label>}<button type="button" onClick={async (e) => { const ok = await copyTextToClipboard(findingAnswerText(f, key === 'findingAnswer' ? 'finding' : 'fix')); e.currentTarget.textContent = ok ? 'Copied' : 'Copy failed — select and copy the text manually.' }}>Copy response</button></fieldset>
  }
  return <section className="findings-panel"><header><h2>Findings</h2><button type="button" onClick={() => setImporting(true)}>Import findings</button></header>{batches.map((batch, index) => <div key={batch.id}><span>Batch {index + 1}: {batch.findings.length} findings</span><button type="button" className="secondary" onClick={() => { if (confirm(`Remove batch ${index + 1} (${batch.findings.length} findings) permanently?`)) deleteFindingBatch(problemId, candidate.id, batch.id) }}>Remove batch</button></div>)}{importing && <FindingImport problemId={problemId} candidate={candidate} onClose={() => setImporting(false)} onImported={(id) => { setActive(id); setImporting(false) }} />}<p>{findings.filter((f) => complete(f.findingAnswer) && complete(f.fixAnswer)).length}/{findings.length} reviewed</p><label>Filter <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option>All</option><option>Unreviewed</option><option>Reviewed</option></select></label><button type="button" onClick={async () => { const ok = await copyTextToClipboard(batches.map(findingBatchOutput).join('\n\n')); if (!ok) window.alert('Copy failed — select and copy the text manually.') }}>Copy all answers</button><nav aria-label="Finding queue">{visible.map((f) => <button type="button" key={f.id} onClick={() => setActive(f.id)} aria-current={f.id === selected?.id}>{f.sourceNumber}. {f.title}</button>)}</nav>{selected && <div className="row"><button type="button" disabled={queueIndex <= 0} onClick={() => setActive(visible[queueIndex - 1].id)}>Previous</button><button type="button" disabled={queueIndex < 0 || queueIndex >= visible.length - 1} onClick={() => setActive(visible[queueIndex + 1].id)}>Next</button></div>}{findings.length === 0 && <p>No findings yet. Import pasted findings for this patch.</p>}{selected && <article><h3>{selected.sourceNumber}. {selected.title}</h3><button type="button" onClick={() => setEditingSource((value) => !value)}>{editingSource ? 'Done editing source fields' : 'Edit source fields'}</button>{editingSource && (['sourceNumber','title','claim','evidence','proposedFix'] as const).map((field) => <label key={field}>{field}<textarea value={selected[field]} onChange={(e) => editFinding(problemId,candidate.id,selected.id,{ [field]: e.target.value })} /></label>)}<h4>Claim</h4><pre>{selected.claim}</pre><h4>Evidence</h4><pre>{selected.evidence}</pre>{parseFindingCitations(selected.evidence).map((citation, i) => <Citation key={`${citation.file}:${i}`} citation={citation} files={files} onFocus={onFocus} />)}<h4>Proposed fix</h4><pre>{selected.proposedFix}</pre><details><summary>Original pasted card</summary><pre>{selected.rawText}</pre></details>{answerGroup(selected,'findingAnswer','Would you raise this finding?')}{answerGroup(selected,'fixAnswer','Would you recommend this fix?')}</article>}<label>Batch answers<textarea readOnly value={batches.map(findingBatchOutput).join('\n\n')} /></label></section>
}
function Citation({ citation, files, onFocus }: { citation: FindingCitation; files: DiffFile[]; onFocus(target: { file: string; side: 'old'|'new'; lineNumber: number }): void }) {
  const initial = files.find((f) => [f.oldPath,f.newPath,f.path].includes(citation.file))
  const [side,setSide]=useState<'old'|'new'>(initial?.isDeleted?'old':'new')
  const result=resolveFindingCitation(citation,files,side)
  return <div><label>{citation.file} side <select value={side} onChange={(e)=>setSide(e.target.value as 'old'|'new')}><option value="old">Old</option><option value="new">New</option></select></label><span>{result.message}</span>{result.target && <button type="button" onClick={()=>onFocus(result.target!)}>Go to cited line</button>}</div>
}
