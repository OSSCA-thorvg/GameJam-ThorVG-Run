import React, { useEffect, useRef, useState } from 'react';
import { ThorVGRenderer } from './renderer/ThorVGRenderer';
import { type RendererMode, type ResonanceFormType } from './types/game';

export const App: React.FC = () => {
  const [rendererMode, setRendererMode] = useState<RendererMode>('sw');
  const [previewForm, setPreviewForm] = useState<ResonanceFormType>('synth');
  const [engineReady, setEngineReady] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    let cancelled = false;
    let rafId = 0;
    const renderer = new ThorVGRenderer(rendererMode);
    setEngineReady(false);

    renderer
      .init(canvasEl, window.innerWidth, window.innerHeight)
      .then(() => {
        if (cancelled) return;
        setEngineReady(true);
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          renderer.renderPreviewFrame((now - start) / 1000, previewForm);
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      })
      .catch((err) => {
        console.error('ThorVG initialization failed:', err);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      renderer.destroy();
    };
  }, [rendererMode, previewForm]);

  return (
    <div className="app-shell">
      {/* Canvas DOM is isolated per rendererMode via key={rendererMode} */}
      <canvas
        key={rendererMode}
        ref={canvasRef}
        id="tvg-canvas"
        className="tvg-canvas"
      />
      <div className="overlay-panel">
        <h1>THORVG RUN</h1>
        <p>
          Active Backend: <strong>{rendererMode === 'sw' ? 'CPU [SwCanvas]' : 'GPU [GlCanvas - WebGL2]'}</strong>{' '}
          ({engineReady ? 'Ready' : 'Initializing...'})
        </p>
        <div className="toggle-row">
          <button
            type="button"
            className={rendererMode === 'sw' ? 'active' : ''}
            onClick={() => setRendererMode('sw')}
          >
            🖥️ CPU Rendering (SwCanvas)
          </button>
          <button
            type="button"
            className={rendererMode === 'gl' ? 'active' : ''}
            onClick={() => setRendererMode('gl')}
          >
            🚀 GPU Rendering (GlCanvas)
          </button>
        </div>
        <div className="toggle-row">
          <button type="button" onClick={() => setPreviewForm('bass')}>Bass Form</button>
          <button type="button" onClick={() => setPreviewForm('synth')}>Synth Form</button>
          <button type="button" onClick={() => setPreviewForm('treble')}>Treble Form</button>
        </div>
      </div>
    </div>
  );
};

export default App;
