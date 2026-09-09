'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ProductImage = { id: string; name: string; url: string };
type Piece = { pieceFolderId: string; pieceName: string; images: ProductImage[] };
type Decision = 'good' | 'no_good';

const viewLabels = ['Front', 'Back', 'Three-quarter', 'Detail'];

export default function ReviewDashboard({
  reviewerName,
  previewMode,
}: {
  reviewerName: string;
  previewMode: boolean;
}) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submittingId, setSubmittingId] = useState('');
  const [notice, setNotice] = useState('');
  const [activeImage, setActiveImage] = useState<ProductImage | null>(null);

  const loadPieces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/pieces', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load the review queue.');
      const payload = (await response.json()) as { pieces?: Piece[] };
      setPieces(payload.pieces ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load the review queue.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPieces();
  }, [loadPieces]);

  const imageCount = useMemo(
    () => pieces.reduce((total, piece) => total + piece.images.length, 0),
    [pieces],
  );

  async function submitDecision(piece: Piece, decision: Decision) {
    if (
      decision === 'no_good' &&
      !window.confirm(`Send “${piece.pieceName}” to DesignerRejected?`)
    ) {
      return;
    }

    setSubmittingId(piece.pieceFolderId);
    setNotice('');
    setError('');

    try {
      const response = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceFolderId: piece.pieceFolderId, decision }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? 'The decision could not be saved.');
      }

      setPieces((current) =>
        current.filter((item) => item.pieceFolderId !== piece.pieceFolderId),
      );
      setNotice(
        decision === 'good'
          ? `${piece.pieceName} moved to DesignerApproved.`
          : `${piece.pieceName} moved to DesignerRejected.`,
      );
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : 'The decision could not be saved.',
      );
    } finally {
      setSubmittingId('');
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AURA designer review home">
          <span className="brand-mark">A</span>
          <span>
            <strong>AURA</strong>
            <small>Designer Review</small>
          </span>
        </a>
        <div className="reviewer-chip">
          <span className="status-dot" />
          <span>{reviewerName}</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Designer approval queue</p>
          <h1>Review each product set with confidence.</h1>
          <p className="hero-copy">
            Review the four creator-approved product views, then make the final
            design decision for the complete piece.
          </p>
        </div>
        <div className="summary" aria-label="Queue summary">
          <div>
            <strong>{loading ? '—' : pieces.length}</strong>
            <span>pieces waiting</span>
          </div>
          <div>
            <strong>{loading ? '—' : imageCount}</strong>
            <span>images to review</span>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={() => void loadPieces()}
          >
            Refresh queue
          </button>
        </div>
      </section>

      {previewMode && (
        <p className="preview-banner">
          Preview mode — connect and publish the n8n endpoints to display live pieces.
        </p>
      )}
      {notice && <p className="notice success">{notice}</p>}
      {error && <p className="notice error">{error}</p>}

      <section className="queue" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <LoadingCards />
        ) : pieces.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✓</span>
            <h2>The review queue is clear.</h2>
            <p>New creator-approved pieces will appear here automatically.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadPieces()}
            >
              Check again
            </button>
          </div>
        ) : (
          pieces.map((piece, pieceIndex) => (
            <article className="piece-card" key={piece.pieceFolderId}>
              <div className="piece-heading">
                <div>
                  <p>Piece {String(pieceIndex + 1).padStart(2, '0')}</p>
                  <h2>{piece.pieceName}</h2>
                </div>
                <span className={piece.images.length === 4 ? 'complete' : 'incomplete'}>
                  {piece.images.length}/4 images
                </span>
              </div>

              <div className="image-grid">
                {piece.images.map((productImage, imageIndex) => (
                  <button
                    type="button"
                    className="image-tile"
                    key={productImage.id}
                    onClick={() => setActiveImage(productImage)}
                    aria-label={`Open ${viewLabels[imageIndex] ?? productImage.name} image`}
                  >
                    {productImage.url.startsWith('/preview-') ? (
                      <span
                        className={`preview-art preview-art-${imageIndex + 1}`}
                        aria-hidden="true"
                      >
                        <span className="garment-shape" />
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={productImage.url}
                        alt={`${piece.pieceName} ${viewLabels[imageIndex] ?? productImage.name}`}
                      />
                    )}
                    <span>{viewLabels[imageIndex] ?? productImage.name}</span>
                  </button>
                ))}
              </div>

              <div className="decision-bar">
                <div>
                  <strong>Designer decision</strong>
                  <span>Review all four images before continuing.</span>
                </div>
                <div className="decision-actions">
                  <button
                    type="button"
                    className="reject-button"
                    disabled={Boolean(submittingId)}
                    onClick={() => void submitDecision(piece, 'no_good')}
                  >
                    No good
                  </button>
                  <button
                    type="button"
                    className="approve-button"
                    disabled={Boolean(submittingId) || piece.images.length !== 4}
                    onClick={() => void submitDecision(piece, 'good')}
                  >
                    {submittingId === piece.pieceFolderId ? 'Saving…' : 'Good — approve'}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {activeImage && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={activeImage.name}
        >
          <button
            className="lightbox-close"
            type="button"
            onClick={() => setActiveImage(null)}
          >
            Close
          </button>
          {activeImage.url.startsWith('/preview-') ? (
            <span className="preview-art preview-art-1 lightbox-preview" aria-hidden="true">
              <span className="garment-shape" />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeImage.url} alt={activeImage.name} />
          )}
        </div>
      )}
    </main>
  );
}

function LoadingCards() {
  return (
    <div className="loading-card" aria-label="Loading pieces">
      <div className="loading-line" />
      <div className="loading-grid">
        {[0, 1, 2, 3].map((item) => (
          <div className="loading-image" key={item} />
        ))}
      </div>
    </div>
  );
}
