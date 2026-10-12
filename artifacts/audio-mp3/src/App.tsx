import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { YouTubeExplorer } from '@/components/YouTubeExplorer';
import { useDownloadYoutubeAudio } from '@workspace/api-client-react';
import type { YoutubeMetadata, YoutubeSearchResult } from '@workspace/api-client-react';
import { AudioTrack, readTrack, readTracks, saveTrack } from '@/lib/audio-library';
import './app.css';
import {
  ArrowDownToLine, AudioLines, Check, Clock3, Download, LoaderCircle, Music2,
  Plus, Search, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from '@/components/ui/dialog';

const queryClient = new QueryClient();
type Destination = 'search' | 'downloads';
type QueueState = 'pending' | 'downloading' | 'error' | 'done';
type QueueTrack = {
  id: string;
  url: string;
  title: string;
  state: QueueState;
  videoId: string;
  author: string;
  thumbnail: string;
  embedUrl: string;
  error?: string;
};
type Video = YoutubeMetadata & { durationSeconds?: number | null };

const rightsSessionKey = 'audio-mp3-rights-accepted';
const queueStorageKey = 'audio-mp3-pending-queue';

function hasRightsAcceptance() {
  try { return sessionStorage.getItem(rightsSessionKey) === 'yes'; } catch { return false; }
}

function readPendingQueue(): QueueTrack[] {
  try { return JSON.parse(localStorage.getItem(queueStorageKey) || '[]') as QueueTrack[]; } catch { return []; }
}

function videoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'audio';
}

function triggerDownload(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function AppContent() {
  const [destination, setDestination] = useState<Destination>('search');
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [selected, setSelected] = useState<Video | null>(null);
  const [rightsAccepted, setRightsAccepted] = useState(hasRightsAcceptance);
  const [rightsChecked, setRightsChecked] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(() => !hasRightsAcceptance());
  const [queue, setQueue] = useState<QueueTrack[]>(readPendingQueue);
  const [processing, setProcessing] = useState(false);
  const [downloadId, setDownloadId] = useState('');
  const [downloadStatus, setDownloadStatus] = useState<{ id: string; state: 'downloading' | 'done' | 'error'; message?: string } | null>(null);
  const [storageNotice, setStorageNotice] = useState('');
  const downloadMutation = useDownloadYoutubeAudio({ request: { responseType: 'blob' } });

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError('');
    try { setTracks(await readTracks()); }
    catch (error) { setLibraryError(error instanceof Error ? error.message : 'La biblioteca no está disponible.'); }
    finally { setLibraryLoading(false); }
  }, []);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);
  useEffect(() => {
    try { localStorage.setItem(queueStorageKey, JSON.stringify(queue)); } catch { /* Queue persistence is best-effort. */ }
  }, [queue]);

  const chooseVideo = (video: Video) => {
    setStorageNotice('');
    setDownloadStatus(null);
    setSelected(video);
  };

  const addToQueue = (video: Video) => {
    if (queue.some((item) => item.videoId === video.videoId)) return;
    setQueue((items) => [...items, {
      id: crypto.randomUUID(), url: videoUrl(video.videoId), title: video.title,
      state: 'pending', videoId: video.videoId, author: video.authorName,
      thumbnail: video.thumbnailUrl, embedUrl: video.embedUrl,
    }]);
    setStorageNotice('Se añadió a la cola.');
  };

  const downloadVideo = async (video: Video): Promise<string | null> => {
    if (!rightsAccepted || downloadMutation.isPending) return null;
    setDownloadId(video.videoId);
    setDownloadStatus({ id: video.videoId, state: 'downloading' });
    setStorageNotice('');
    const sourceUrl = videoUrl(video.videoId);
    const filename = `${safeFilename(video.title)}.mp3`;
    try {
      const cached = await readTrack(video.videoId).catch(() => undefined);
      if (cached) {
        triggerDownload(cached.blob, cached.filename);
        setDownloadStatus({ id: video.videoId, state: 'done' });
        setStorageNotice('Se volvió a descargar desde este dispositivo.');
        return null;
      }
      const blob = await downloadMutation.mutateAsync({ data: { url: sourceUrl, rightsConfirmed: true } });
      triggerDownload(blob, filename);
      const entry: AudioTrack = {
        ...video, sourceUrl, filename, downloadedAt: Date.now(), blob,
      };
      try {
        await saveTrack(entry);
        await refreshLibrary();
        setDownloadStatus({ id: video.videoId, state: 'done' });
        setStorageNotice('MP3 descargado y guardado en este dispositivo.');
      } catch {
        setDownloadStatus({ id: video.videoId, state: 'done' });
        setStorageNotice('La descarga empezó, pero el audio no se pudo guardar en la biblioteca.');
      }
      return null;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'No se pudo preparar el MP3. Inténtalo de nuevo.';
      const message = /sign in to confirm|not a bot/i.test(rawMessage)
        ? 'YouTube no permitió procesar este video automáticamente. Inténtalo más tarde o con otro video.'
        : rawMessage;
      setDownloadStatus({ id: video.videoId, state: 'error', message });
      return message;
    } finally {
      setDownloadId('');
    }
  };

  const runQueue = async () => {
    if (processing || downloadMutation.isPending || !rightsAccepted) return;
    setProcessing(true);
    try {
      for (const item of queue) {
        if (item.state === 'done') continue;
        setQueue((current) => current.map((track) => track.id === item.id ? { ...track, state: 'downloading', error: undefined } : track));
        try {
          const errorMessage = await downloadVideo({
            videoId: item.videoId, title: item.title, authorName: item.author,
            thumbnailUrl: item.thumbnail, embedUrl: item.embedUrl,
          });
          if (errorMessage) {
            setQueue((current) => current.map((track) => track.id === item.id
              ? { ...track, state: 'error', error: errorMessage } : track));
          } else {
            setQueue((current) => current.map((track) => track.id === item.id ? { ...track, state: 'done' } : track));
          }
        } catch (error) {
          setQueue((current) => current.map((track) => track.id === item.id
            ? { ...track, state: 'error', error: error instanceof Error ? error.message : 'Falló la descarga.' } : track));
        }
      }
    } finally {
      setProcessing(false);
    }
  };

  const cached = tracks.find((track) => track.videoId === selected?.videoId);
  const pendingQueue = queue.filter((item) => item.state !== 'done');

  return (
    <div className="app-shell">
      <main className="library-frame">
        <header className="app-header">
          <div className="brand-mark" aria-hidden="true"><AudioLines size={20} strokeWidth={2.2} /></div>
          <div className="brand-copy"><strong>audio mp3</strong></div>
          <span className="header-spark" aria-hidden="true" />
        </header>
        <section className="page-content" aria-label={destination === 'search' ? 'Buscar música' : 'Descargas'}>
          {destination === 'search' ? (
            <YouTubeExplorer onSelect={chooseVideo} recentTracks={tracks.slice(0, 5)} />
          ) : (
            <div className="downloads-view rise-in">
              <div className="section-heading">
                 <div><span className="eyebrow">TU BIBLIOTECA</span><h1>Descargas</h1></div>
                <span className="count-pill" data-testid="text-download-count">{tracks.length}</span>
              </div>
              {pendingQueue.length > 0 && (
                <section className="queue-card" aria-labelledby="pending-heading" data-testid="card-pending-queue">
                  <div className="queue-card-top">
                     <div><span className="eyebrow">EN COLA</span><h2 id="pending-heading">Descargas pendientes</h2></div>
                     <button className="primary-button compact-button" type="button" onClick={() => void runQueue()} disabled={processing || downloadMutation.isPending} data-testid="button-download-pending">
                      {processing ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}
                       {processing ? 'Descargando' : 'Descargar cola'}
                    </button>
                  </div>
                  <div className="pending-list">
                    {queue.filter((item) => item.state !== 'done').map((item, index) => (
                      <div className="pending-row" key={item.id} data-testid={`row-pending-${item.id}`}>
                        <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
                        <img src={item.thumbnail} alt="" />
                         <span className="pending-copy"><strong>{item.title}</strong><small>{item.state === 'error' ? item.error : item.state === 'downloading' ? 'Preparando MP3…' : item.author}</small></span>
                         <button type="button" className="icon-button remove-queue" aria-label={`Quitar ${item.title} de la cola`} onClick={() => setQueue((all) => all.filter((entry) => entry.id !== item.id))} disabled={processing} data-testid={`button-remove-pending-${item.id}`}><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
               {libraryError && <div className="inline-alert" role="alert" data-testid="status-library-error"><span>{libraryError}</span><button type="button" onClick={() => void refreshLibrary()} data-testid="button-retry-library">Reintentar</button></div>}
              {libraryLoading ? (
                 <div className="library-skeleton" aria-label="Cargando descargas" data-testid="status-library-loading">
                  {[0, 1, 2].map((item) => <div className="skeleton-row" key={item}><i /><span><i /><i /></span></div>)}
                </div>
              ) : tracks.length > 0 ? (
                <div className="track-list" data-testid="list-downloads">
                  {tracks.map((track) => (
                    <button key={track.videoId} className="track-row" type="button" onClick={() => chooseVideo(track)} data-testid={`button-open-download-${track.videoId}`}>
                      <img src={track.thumbnailUrl} alt="" loading="lazy" />
                      <span className="track-copy"><strong>{track.title}</strong><small>{track.authorName}</small></span>
                       <span className="track-date"><Clock3 size={12} />{new Date(track.downloadedAt).toLocaleDateString('es', { month: 'short', day: 'numeric' })}</span>
                    </button>
                  ))}
                </div>
              ) : !libraryError ? (
                <div className="empty-library" data-testid="status-downloads-empty">
                  <span className="empty-icon"><Music2 size={24} /></span>
                   <h2>Aún no hay descargas</h2>
                   <button type="button" className="text-button" onClick={() => setDestination('search')} data-testid="button-find-audio">Buscar música <Search size={15} /></button>
                </div>
              ) : null}
            </div>
          )}
        </section>
        <nav className="bottom-nav" aria-label="Navegación principal" data-testid="navigation-main">
          <NavButton active={destination === 'search'} onClick={() => setDestination('search')} icon={<Search size={19} />} label="Buscar" testId="nav-search" />
          <NavButton active={destination === 'downloads'} onClick={() => setDestination('downloads')} icon={<Download size={19} />} label="Descargas" badge={pendingQueue.length || undefined} testId="nav-downloads" />
        </nav>
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="detail-dialog" data-testid="modal-video-detail">
          {selected && <>
            <div className="dialog-topline">
               <span className="eyebrow">DETALLES</span>
               <button className="icon-button dialog-close" type="button" onClick={() => setSelected(null)} aria-label="Cerrar detalles" data-testid="button-close-detail"><X size={19} /></button>
            </div>
            <div className="video-preview">
               <iframe src={selected.embedUrl} title={`Vista previa de ${selected.title}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen data-testid="iframe-video-preview" />
            </div>
            <div className="detail-info">
              <img src={selected.thumbnailUrl} alt="" />
              <div><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{selected.authorName}</DialogDescription></div>
            </div>
             <div className="detail-meta"><span>MP3</span><span>160 kbps</span>{cached && <span className="cached-label"><Check size={13} /> Guardado en este dispositivo</span>}</div>
            <div className="detail-actions">
              <button type="button" className="primary-button" onClick={() => void downloadVideo(selected)} disabled={downloadId === selected.videoId || downloadMutation.isPending} data-testid="button-download-mp3">
                {downloadId === selected.videoId ? <LoaderCircle size={17} className="spin" /> : cached ? <ArrowDownToLine size={17} /> : <Download size={17} />}
                 {downloadId === selected.videoId ? 'Preparando MP3…' : cached ? 'Volver a descargar' : 'Descargar MP3'}
              </button>
               <button type="button" className="secondary-button" onClick={() => addToQueue(selected)} disabled={queue.some((item) => item.videoId === selected.videoId && item.state !== 'done')} data-testid="button-add-to-queue">
                 <Plus size={17} />{queue.some((item) => item.videoId === selected.videoId && item.state !== 'done') ? 'En la cola' : 'Añadir a la cola'}
              </button>
            </div>
            {downloadStatus?.id === selected.videoId && downloadStatus.state === 'error' && <p className="download-message error-message" role="alert" data-testid="status-download-error">{downloadStatus.message}</p>}
             {downloadStatus?.id === selected.videoId && downloadStatus.state === 'done' && <p className="download-message success-message" role="status" data-testid="status-download-success">{storageNotice || 'La descarga ha comenzado.'}</p>}
            {storageNotice && downloadStatus?.id !== selected.videoId && <p className="download-message success-message" role="status" data-testid="status-queue-added">{storageNotice}</p>}
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={rightsOpen} onOpenChange={(open) => { if (!rightsAccepted && !open) setRightsOpen(true); }}>
        <DialogContent className="rights-dialog" data-testid="modal-rights-confirmation">
          <div className="rights-mark"><AudioLines size={22} /></div>
           <span className="eyebrow">ANTES DE EMPEZAR</span>
           <DialogTitle>Confirma tus derechos</DialogTitle>
           <DialogDescription>Continúa solo si tienes permiso para guardar ese audio.</DialogDescription>
          <label className="rights-choice">
            <input type="checkbox" checked={rightsChecked} onChange={(event) => setRightsChecked(event.target.checked)} data-testid="checkbox-rights-confirmation" />
             <span>Confirmo que tengo derecho a guardar el audio de los videos que descargue.</span>
          </label>
          <button type="button" disabled={!rightsChecked} className="primary-button" onClick={() => {
             try { sessionStorage.setItem(rightsSessionKey, 'yes'); } catch { /* The gate remains accepted for this app session. */ }
            setRightsAccepted(true);
            setRightsOpen(false);
           }} data-testid="button-continue-rights">Continuar <ArrowDownToLine size={16} /></button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, badge, testId }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; badge?: number; testId: string }) {
  return <button type="button" className={`nav-button ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} data-testid={testId}>
    <span className="nav-icon">{icon}{badge !== undefined && <i className="nav-badge">{badge}</i>}</span><span>{label}</span>
  </button>;
}

function Home() {
  return <AppContent />;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
