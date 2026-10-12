import { useState } from 'react';
import { ArrowDownToLine, CircleHelp, Info, LoaderCircle, Plus, Search, ShieldCheck, Youtube } from 'lucide-react';
import './Current.css';

export function Current() {
  const [url, setUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [rights, setRights] = useState(false);
  return (
    <main className="audio-current">
      <section className="audio-current-section">
        <div className="audio-current-intro">
          <div className="audio-current-eyebrow"><span>03</span><i /><span>Explorar una referencia</span></div>
          <h1>Explora el video.<br /><em>Guarda tu canción.</em></h1>
          <p>Pega un enlace para ver el video aquí y descargar el audio autorizado como MP3 a 160 kbps.</p>
        </div>
        <div className="audio-current-card">
          <label htmlFor="current-url">Enlace de YouTube</label>
          <div className="audio-current-inputrow">
            <div className="audio-current-inputwrap"><Youtube size={17} /><input id="current-url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && url.trim()) setShowPreview(true); }} placeholder="https://youtube.com/watch?v=…" data-testid="current-url-input" /></div>
            <button className="audio-current-primary" type="button" disabled={!url.trim()} onClick={() => setShowPreview(true)}><Search size={16} />Ver vista previa</button>
          </div>
          <p className="audio-current-hint"><Info size={13} />El reproductor permanece dentro de esta página.</p>
          <label className="audio-current-rights"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /> <span>Confirmo que tengo derecho a descargar y guardar el audio de los videos que añada en esta sesión.</span></label>
          {showPreview && (
            <div className="audio-current-preview">
              <div className="audio-current-fake-player"><span className="audio-current-play">▶</span><span>Vista previa del video</span></div>
              <div className="audio-current-preview-details">
                <div><span>VISTA PREVIA ENCONTRADA</span><h2>Una tarde tranquila — Sesión acústica en directo</h2><p>Casa Sonora</p></div>
                <div className="audio-current-actions"><button type="button" disabled={!rights}><ArrowDownToLine size={15} />Descargar MP3</button><button type="button" disabled={!rights}><Plus size={15} />Añadir a mi cola</button></div>
              </div>
              <div className="audio-current-disclaimer"><ShieldCheck size={14} />El audio se procesa temporalmente y el MP3 se descarga directamente en tu dispositivo.</div>
            </div>
          )}
        </div>
        <div className="audio-current-help"><span><CircleHelp size={16} /></span><div><b>¿Cómo funciona?</b><p>La aplicación procesa un video por solicitud, añade título, artista y portada al MP3 y elimina el archivo temporal al terminar.</p></div></div>
        <div className="audio-current-bottom"><LoaderCircle size={13} /> Extracción autorizada · MP3 160 kbps</div>
      </section>
    </main>
  );
}
