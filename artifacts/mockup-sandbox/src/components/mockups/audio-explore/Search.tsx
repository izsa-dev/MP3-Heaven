import { useState } from 'react';
import { ArrowDownToLine, Check, Clock3, Plus, Search as SearchIcon, ShieldCheck, Youtube } from 'lucide-react';
import './Search.css';

const samples = [
  { title: 'Golden — Live Session at the Greenhouse', channel: 'Luna de Abril', time: '4:18', tone: 'sunset' },
  { title: 'Softly, as in a Morning Sunrise · Trio Session', channel: 'Estudio Patio', time: '6:42', tone: 'plum' },
  { title: 'Noches de verano — versión acústica', channel: 'Río Quieto', time: '3:51', tone: 'sage' },
];

export function Search() {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [rights, setRights] = useState(false);
  return (
    <main className="audio-search-prototype">
      <section className="audio-search-window">
        <header className="audio-search-bar"><div><span className="audio-search-logo"><Youtube size={17} fill="currentColor" /></span><b>YouTube</b><i>·</i><span>Explorar</span></div><small>AUDIO MP3 / BIBLIOTECA</small></header>
        <div className="audio-search-scroll">
          <div className={`audio-search-hero ${searched ? 'is-compact' : ''}`}>
            {!searched && <div className="audio-search-welcome"><span>ENCUENTRA TU PRÓXIMA CANCIÓN</span><h1>¿Qué quieres<br />escuchar?</h1><p>Busca un video o pega su enlace. Lo reproducimos aquí mismo.</p></div>}
            <form onSubmit={(event) => { event.preventDefault(); if (query.trim()) { setSearched(true); setSelected(null); } }}>
              <label><SearchIcon size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Canción, artista o enlace de YouTube" data-testid="prototype-search-input" /></label>
              <button disabled={!query.trim()}><SearchIcon size={16} /><span>Buscar</span></button>
            </form>
            {!searched && <div className="audio-search-suggestions"><span>Prueba con</span>{['jazz para concentrarse', 'música en directo', 'acústicos'].map((item) => <button type="button" key={item} onClick={() => { setQuery(item); setSearched(true); }}>{item}</button>)}</div>}
          </div>
          {searched && (
            <div className="audio-search-results">
              {selected === null ? <><div className="audio-search-result-heading"><div><span>RESULTADOS</span><h2>Resultados para “{query}”</h2></div><small>3 videos</small></div>
                <div className="audio-search-list">{samples.map((item, index) => <button type="button" className="audio-search-result" key={item.title} onClick={() => setSelected(index)}>
                  <span className={`audio-search-art ${item.tone}`}><i /><i /><i /><b>{item.time}</b></span><span className="audio-search-result-copy"><strong>{item.title}</strong><small>{item.channel}</small><em>Ver video <b>→</b></em></span>
                </button>)}</div></> : <div className="audio-search-player-card">
                  <div className={`audio-search-stage ${samples[selected].tone}`}><span className="audio-search-big-play">▶</span><small>REPRODUCIENDO EN ESTA PÁGINA</small></div>
                  <div className="audio-search-now"><div><small>VIDEO SELECCIONADO</small><h2>{samples[selected].title}</h2><p>{samples[selected].channel}</p></div><button type="button" onClick={() => setSelected(null)}>Volver a resultados</button></div>
                  <label className="audio-search-rights"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} /><span>Confirmo que tengo derecho a guardar el audio de este video.</span></label>
                  <div className="audio-search-actions"><button type="button" disabled={!rights}><ArrowDownToLine size={15} />Descargar MP3</button><button type="button" disabled={!rights}><Plus size={15} />Añadir a mi cola</button></div>
                  <p className="audio-search-safe"><ShieldCheck size={14} />MP3 a 160 kbps · Título, canal y portada incluidos</p>
                </div>}
              <div className="audio-search-footnote"><ShieldCheck size={14} />Descarga únicamente audio que estés autorizado a guardar.</div>
            </div>
          )}
        </div>
        <footer>BUSCADOR INTEGRADO <i>·</i> REPRODUCCIÓN PRIVADA EN ESTA PÁGINA <span><Check size={12} /></span></footer>
      </section>
    </main>
  );
}
