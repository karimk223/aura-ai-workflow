'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VIEWS, VIEW_LABELS, SELECTION_PROTOCOL, selectionIsComplete, validatePiece, jsonObject } from './creator-selection';
import type { Piece, ProductImage, Selection } from './creator-selection';

export default function ReviewDashboard({ reviewerName, previewMode }: { reviewerName: string; previewMode: boolean }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submittingId, setSubmittingId] = useState('');
  const [notice, setNotice] = useState('');
  const [demo, setDemo] = useState(false);
  const [activeImage, setActiveImage] = useState<ProductImage | null>(null);
  const [pendingPiece, setPendingPiece] = useState<Piece | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  const loadPieces = useCallback(async () => {
    if (busy.current) return;
    setLoading(true); setError(''); setNotice(''); setSelections({}); setPendingPiece(null);
    try {
      const response = await fetch('/api/pieces', { cache: 'no-store' });
      const payload = jsonObject(await response.json());
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load the review queue.');
      if (payload.protocol !== SELECTION_PROTOCOL || !Array.isArray(payload.pieces)) throw new Error('The candidate-selection backend is required.');
      setPieces(payload.pieces.map(validatePiece)); setDemo(payload.preview === true);
    } catch (error) {
      setPieces([]); setError(error instanceof Error ? error.message : 'Unable to load the review queue.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadPieces(); }, [loadPieces]);
  useEffect(() => {
    if (!activeImage && !pendingPiece) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setActiveImage(null); setPendingPiece(null); }
      if (event.key === 'Tab') {
        const buttons = closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [activeImage, pendingPiece]);

  const imageCount = useMemo(() => pieces.reduce((total, piece) => total + piece.images.length, 0), [pieces]);

  async function submitSelection(piece: Piece) {
    const chosen = selections[piece.pieceFolderId] ?? {};
    if (busy.current || !selectionIsComplete(piece, chosen)) return;
    const rejectedCount = piece.images.length - 4;
    busy.current = true; setPendingPiece(null); setSubmittingId(piece.pieceFolderId); setNotice(''); setError('');
    try {
      const response = await fetch('/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol: SELECTION_PROTOCOL, pieceFolderId: piece.pieceFolderId,
          reviewRevision: piece.reviewRevision, selections: chosen }) });
      const payload = jsonObject(await response.json());
      if (!response.ok || payload.success !== true || payload.protocol !== SELECTION_PROTOCOL
        || (payload.committed !== true && !(demo && payload.preview === true))) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Selection was not confirmed. Check the n8n execution before retrying.');
      }
      setPieces((current) => current.filter((item) => item.pieceFolderId !== piece.pieceFolderId));
      setNotice(demo ? 'Preview complete — four choices recorded for this screen only. No Drive files moved.'
        : `${piece.pieceName}: four selected images forwarded to the designer; ${rejectedCount} unselected candidates archived in CreatorRejected.`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Selection could not be saved.'); }
    finally { busy.current = false; setSubmittingId(''); }
  }

  return (
    <>
    <main className="site-shell" inert={Boolean(activeImage || pendingPiece)}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AURA content review home">
          <img className="brand-logo" src="/aura-logo.png" alt="AURA by Nada" />
          <span className="brand-section">Content Review</span>
        </a>
        <div className="reviewer-chip"><span className="status-dot" /><span>{reviewerName}</span></div>
      </header>
      <section className="hero" id="top">
        <div>
          <p className="eyebrow">The creator’s edit</p>
          <h1>Four views.<br />Your best selection.</h1>
          <p className="hero-copy">Compare every generation attempt — including candidates the AI did not pass. Choose one image per view to create the set the designer will review.</p>
        </div>
        <div className="summary" aria-label="Queue summary">
          <div><strong>{loading || error && pieces.length === 0 ? '—' : pieces.length}</strong><span>pieces waiting</span></div>
          <div><strong>{loading || error && pieces.length === 0 ? '—' : imageCount}</strong><span>candidates to compare</span></div>
          <button type="button" className="refresh-button" disabled={loading || Boolean(submittingId)} onClick={() => void loadPieces()}>Refresh queue</button>
        </div>
      </section>
      {(demo || previewMode) && <p className="preview-banner">{demo ? 'Offline preview — sample artwork only. No n8n requests or Drive moves.' : 'Local development preview. Live routing requires the new selection backend.'}</p>}
      {notice && <p className="notice success" role="status">{notice}</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <section className="queue" aria-live="polite" aria-busy={loading}>
        {loading ? <LoadingCards /> : pieces.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">{error ? '!' : '✓'}</span>
            <h2>{error ? 'The queue is unavailable.' : 'The review queue is clear.'}</h2>
            <p>{error ? 'No folder state has been assumed. Check the service, then refresh.' : 'New candidate sets will appear here when they are ready.'}</p>
            <button type="button" className="secondary-button" onClick={() => void loadPieces()}>Check again</button>
          </div>
        ) : pieces.map((piece, pieceIndex) => {
          const chosen = selections[piece.pieceFolderId] ?? {};
          const count = VIEWS.filter((view) => chosen[view]).length;
          return <article className="piece-card" key={piece.pieceFolderId}>
            <div className="piece-heading">
              <div><p>Piece {String(pieceIndex + 1).padStart(2, '0')}</p><h2>{piece.pieceName}</h2></div>
              <span className={count === 4 ? 'complete' : 'selection-count'}>{count}/4 selected</span>
            </div>
            <div className="selection-steps" aria-label="Selected views">
              {VIEWS.map((view) => <span className={chosen[view] ? 'step selected' : 'step'} key={view}><span aria-hidden="true">{chosen[view] ? '✓' : '○'}</span> {VIEW_LABELS[view]}</span>)}
            </div>
            {piece.issues.length > 0 && <div className="piece-warning" role="alert"><strong>This set needs attention before submission.</strong><ul>{piece.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
            <div className="view-groups">
              {VIEWS.map((view, viewIndex) => {
                const candidates = piece.images.filter((image) => image.view === view).sort((a, b) => a.attempt - b.attempt);
                return <fieldset className="view-group" key={view} disabled={Boolean(submittingId)}>
                  <legend><span className="view-number">0{viewIndex + 1}</span>{VIEW_LABELS[view]}<span className="view-hint">Choose one · {candidates.length}/3 attempts</span></legend>
                  {candidates.length === 0 ? <p className="missing-view">No candidates for this view.</p> : <div className="candidate-grid">
                    {candidates.map((image) => <div className={chosen[view] === image.id ? 'candidate selected' : 'candidate'} key={image.id}>
                      <button type="button" className="candidate-image" onClick={() => setActiveImage(image)} aria-label={`Enlarge ${VIEW_LABELS[view]}, attempt ${image.attempt}`}>
                        <CandidateArtwork image={image} />
                        <span className="attempt-badge">Attempt 0{image.attempt}</span><span className="enlarge-hint">Enlarge ↗</span>
                      </button>
                      <div className="candidate-meta"><span className={image.aiReview === 'pass' ? 'ai-status passed' : 'ai-status'}>{image.aiReview === 'pass' ? 'AI passed' : image.aiReview === 'fail' ? 'AI did not pass' : 'AI report not supplied'}</span><p title={image.path}>{image.name}</p></div>
                      <label className="candidate-choice"><input type="radio" name={`${piece.pieceFolderId}-${view}`} value={image.id} checked={chosen[view] === image.id}
                        onChange={() => setSelections((current) => ({ ...current, [piece.pieceFolderId]: { ...current[piece.pieceFolderId], [view]: image.id } }))} />
                        <span>{chosen[view] === image.id ? 'Selected for designer' : 'Select this image'}</span>
                      </label>
                    </div>)}
                  </div>}
                </fieldset>;
              })}
            </div>
            <div className="decision-bar">
              <div><strong>{count === 4 ? 'Your four-view set is ready.' : `Choose ${4 - count} more view${4 - count === 1 ? '' : 's'}.`}</strong><span>Four selected images → CreatorApproved. Remaining {piece.images.length - 4 > 0 ? piece.images.length - 4 : 0} candidates → CreatorRejected.</span></div>
              <div className="decision-actions">
                <button type="button" className="secondary-button" disabled={Boolean(submittingId) || count === 0} onClick={() => setSelections((current) => ({ ...current, [piece.pieceFolderId]: {} }))}>Clear choices</button>
                <button type="button" className="approve-button" disabled={Boolean(submittingId) || !selectionIsComplete(piece, chosen)} onClick={() => setPendingPiece(piece)}>{submittingId === piece.pieceFolderId ? 'Saving selection…' : 'Send four to designer →'}</button>
              </div>
            </div>
          </article>;
        })}
      </section>
    </main>
      {activeImage && <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${VIEW_LABELS[activeImage.view]}, attempt ${activeImage.attempt}`}>
        <button className="lightbox-close" type="button" ref={closeRef} onClick={() => setActiveImage(null)}>Close · Esc</button>
        <div className="lightbox-content"><CandidateArtwork image={activeImage} enlarged /><p>{VIEW_LABELS[activeImage.view]} · Attempt {activeImage.attempt} · {activeImage.name}</p></div>
      </div>}
      {pendingPiece && <div className="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-copy">
        <div className="confirmation-card">
          <p className="eyebrow">Your final edit</p><h2 id="confirmation-title">Confirm the four views.</h2>
          <p className="confirmation-piece">{pendingPiece.pieceName}</p>
          <div className="confirmation-views">{VIEWS.map((view) => {
            const image = pendingPiece.images.find((image) => image.id === selections[pendingPiece.pieceFolderId]?.[view]);
            return <div key={view}><strong>{VIEW_LABELS[view]}</strong><span>{image ? `Attempt ${image.attempt} · ${image.name}` : 'No image selected'}</span></div>;
          })}</div>
          <p id="confirmation-copy">{demo ? 'Offline preview only. This records your choices on this screen; no n8n calls or Drive moves.'
            : `These four images will go to CreatorApproved for the designer. The other ${pendingPiece.images.length - 4} candidates will go to CreatorRejected. Your reference folders are retained.`}</p>
          <div className="decision-actions"><button ref={closeRef} type="button" className="secondary-button" onClick={() => setPendingPiece(null)}>Keep reviewing</button>
            <button type="button" className="approve-button" disabled={Boolean(submittingId) || !selectionIsComplete(pendingPiece, selections[pendingPiece.pieceFolderId] ?? {})} onClick={() => void submitSelection(pendingPiece)}>{demo ? 'Confirm sample choices' : 'Confirm four views'}</button></div>
        </div>
      </div>}
    </>
  );
}

function CandidateArtwork({ image, enlarged = false }: { image: ProductImage; enlarged?: boolean }) {
  if (image.url.startsWith('/preview-')) return <span className={`preview-art preview-art-${VIEWS.indexOf(image.view) + 1} attempt-art-${image.attempt}${enlarged ? ' lightbox-preview' : ''}`} aria-hidden="true"><span className="garment-shape" /></span>;
  return <img src={image.url} alt={`${VIEW_LABELS[image.view]}, attempt ${image.attempt}`} loading={enlarged ? 'eager' : 'lazy'} />;
}
function LoadingCards() {
  return <div className="loading-card" aria-label="Loading candidates"><div className="loading-line" /><div className="loading-grid">{[0, 1, 2].map((item) => <div className="loading-image" key={item} />)}</div></div>;
}
