import { useState } from 'react'
import { parseFindings, type FindingImportItem } from '../lib/parseFindings'
import type { Candidate } from '../store'
import { useStore } from '../store'

export function FindingImport({ problemId, candidate, onClose, onImported }: { problemId: string; candidate: Candidate; onClose(): void; onImported(id: string): void }) {
  const addBatch = useStore((s) => s.addFindingBatch)
  const [source, setSource] = useState('')
  const [items, setItems] = useState<FindingImportItem[]>([])
  const [raw, setRaw] = useState('')
  const [fragments, setFragments] = useState<string[]>([])
  const [error, setError] = useState('')
  const [removed, setRemoved] = useState(false)
  const [ack, setAck] = useState(false)
  const parse = () => { const result = parseFindings(source); if (!result.ok) { setError(result.error); return } setError(''); setRaw(result.rawText); setItems(result.items); setFragments(result.fragments); setAck(false); setRemoved(false) }
  const update = (index: number, patch: Partial<FindingImportItem>) => setItems((old) => old.map((item, i) => i === index ? { ...item, ...patch } : item))
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="finding-import-title"><h2 id="finding-import-title">Import findings</h2><label>Source text<textarea rows={8} value={source} onChange={(e) => setSource(e.target.value)} /></label><button type="button" className="secondary" onClick={() => { if (items.length && !confirm('Reparse and replace corrected preview fields?')) return; parse() }}>Reparse</button>
    {error && <p role="alert">{error}</p>}{fragments.length > 0 && <div><p>Unassigned source text. Correct the source or explicitly remove it before import.</p><pre>{fragments.join('\n')}</pre><label><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I explicitly removed or accept this unassigned text</label></div>}
    {items.map((item, i) => <fieldset key={`${i}:${item.sourceNumber}`}><legend>{item.sourceNumber}. {item.title}</legend><p><strong>Original pasted card</strong></p><pre>{item.rawText}</pre>{(['claim','evidence','proposedFix'] as const).map((key) => <label key={key}>{key}<textarea value={item[key]} onChange={(e) => update(i, { [key]: e.target.value })} /></label>)}{item.needsConfirmation && <><p>Assign text from this unresolved segment to Finding response and Original proposed fix, then confirm.</p><pre>{item.unresolvedText}</pre><label>Finding response<textarea value={item.findingAnswer.text} onChange={(e) => update(i, { findingAnswer: { ...item.findingAnswer, text: e.target.value } })} /></label><label>Original proposed fix<textarea value={item.proposedFix} onChange={(e) => update(i, { proposedFix: e.target.value })} /></label><label><input type="checkbox" checked={item.needsConfirmation} onChange={() => update(i, { needsConfirmation: false })} /> I confirmed the assignment</label></>}{item.findingAnswer.text && <p>Imported finding response: {item.findingAnswer.text}</p>}{item.fixAnswer.text && <p>Imported fix response: {item.fixAnswer.text}</p>}<button type="button" className="secondary" onClick={() => setItems((old) => old.filter((_, n) => n !== i))}>Remove item</button></fieldset>)}
    {raw && <details><summary>Batch source (read-only)</summary><pre>{raw}</pre></details>}<div className="row"><button type="button" disabled={!items.length || fragments.length > 0 && !ack || items.some((x) => x.needsConfirmation)} onClick={() => { try { const batch = addBatch(problemId, candidate.id, { rawText: raw, findings: items.map((x) => ({ id: '', sourceNumber: x.sourceNumber, title: x.title, rawText: x.rawText, claim: x.claim, evidence: x.evidence, proposedFix: x.proposedFix, findingAnswer: x.findingAnswer, fixAnswer: x.fixAnswer })) }); onImported(batch.findings[0].id) } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.') } }}>Import</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div></section></div>
}
