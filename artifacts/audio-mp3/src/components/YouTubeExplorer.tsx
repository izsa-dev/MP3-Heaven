import { useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, LoaderCircle, Music2, Search, TriangleAlert, Youtube } from 'lucide-react';
import {
  getGetYoutubeMetadataQueryKey,
  getSearchYoutubeVideosQueryKey,
  useGetYoutubeMetadata,
  useSearchYoutubeVideos,
} from '@workspace/api-client-react';
import type { YoutubeMetadata, YoutubeSearchResult } from '@workspace/api-client-react';
import type { AudioTrack } from '@/lib/audio-library';

type Video = YoutubeMetadata & { durationSeconds?: number | null };
type RecentTrack = Pick<AudioTrack, 'videoId' | 'title' | 'authorName' | 'thumbnailUrl' | 'embedUrl'>;

type YouTubeExplorerProps = {
  onSelect: (video: Video) => void;
  recentTracks: RecentTrack[];
};

function parseYoutubeUrl(value: string): boolean {
  try {
    const raw = value.trim();
    const url = new URL(/^(https?:)?\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const validHost = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host);
    const id = host === 'youtu.be' ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    return validHost && Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id));
  } catch { return false; }
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|www\.|youtu\.be\/|(?:m\.|music\.)?youtube\.com\/)/i.test(value.trim());
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function YouTubeExplorer({ onSelect, recentTracks }: YouTubeExplorerProps) {
  const [input, setInput] = useState('');
  const [queryPhrase, setQueryPhrase] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const searchParams = useMemo(() => ({ q: queryPhrase }), [queryPhrase]);
  const metadataParams = useMemo(() => ({ url: videoUrl }), [videoUrl]);
  const searchQuery = useSearchYoutubeVideos(searchParams, {
    query: { enabled: Boolean(queryPhrase), queryKey: getSearchYoutubeVideosQueryKey(searchParams), staleTime: 30_000 },
  });
  const metadataQuery = useGetYoutubeMetadata(metadataParams, {
    query: { enabled: Boolean(videoUrl), queryKey: getGetYoutubeMetadataQueryKey(metadataParams), staleTime: 30_000 },
  });

  const submit = (event?: FormEvent<HTMLFormElement>, value = input) => {
    event?.preventDefault();
    const normalized = value.trim();
    if (normalized.length < 2) {
      setValidationError('Escribe una búsqueda o un enlace de video.');
      return;
    }
    setValidationError('');
    if (looksLikeUrl(normalized)) {
      if (!parseYoutubeUrl(normalized)) {
        setQueryPhrase('');
        setVideoUrl('');
        setValidationError('El enlace de YouTube no parece válido.');
        return;
      }
      setQueryPhrase('');
      setVideoUrl(normalized);
    } else {
      setVideoUrl('');
      setQueryPhrase(normalized);
    }
  };

  const isUrlSearch = Boolean(videoUrl);
  const loading = isUrlSearch ? metadataQuery.isLoading : searchQuery.isLoading;
  const error = isUrlSearch ? metadataQuery.isError : searchQuery.isError;
  const hasSearch = Boolean(queryPhrase || videoUrl);
  const results: YoutubeSearchResult[] = isUrlSearch
    ? metadataQuery.data ? [{ ...metadataQuery.data, durationSeconds: null }] : []
    : searchQuery.data?.results ?? [];
  const choose = (item: YoutubeSearchResult) => onSelect({
    videoId: item.videoId, title: item.title, authorName: item.authorName,
    thumbnailUrl: item.thumbnailUrl, embedUrl: item.embedUrl, durationSeconds: item.durationSeconds,
  });

  return (
    <section className="search-view rise-in" aria-label="Buscar música" data-testid="youtube-explorer">
      <div className="search-top">
        <form className="search-form" role="search" onSubmit={(event) => submit(event)}>
          <label className="search-input-wrap" htmlFor="audio-search">
            <Search size={19} aria-hidden="true" />
            <input id="audio-search" value={input} onChange={(event) => { setInput(event.target.value); setValidationError(''); }} placeholder="Canción, artista o enlace de YouTube" autoComplete="off" data-testid="input-youtube-search" />
            {input && <button type="button" className="clear-search" aria-label="Borrar búsqueda" onClick={() => { setInput(''); setValidationError(''); }} data-testid="button-clear-search">×</button>}
          </label>
          <button className="search-submit" type="submit" disabled={!input.trim()} aria-label="Buscar" data-testid="button-search-youtube"><Search size={19} /></button>
        </form>
        {validationError && <p className="search-validation" role="alert" data-testid="status-search-validation">{validationError}</p>}
      </div>

      <div className="results-area" data-testid="youtube-search-content">
        {hasSearch ? <>
            <div className="results-title">
              <div><span className="eyebrow">{isUrlSearch ? 'VIDEO' : 'RESULTADOS'}</span><h2>{isUrlSearch ? 'Enlace de YouTube' : queryPhrase}</h2></div>
              {results.length > 0 && !loading && <span className="result-total">{results.length} {results.length === 1 ? 'video' : 'videos'}</span>}
          </div>
          {loading ? <div className="result-skeletons" data-testid="status-search-loading" aria-label="Buscando videos">{[0, 1, 2, 3].map((row) => <div className="search-skeleton" key={row}><i /><span><i /><i /></span></div>)}</div>
            : error ? <div className="search-state search-error" role="alert" data-testid="status-search-error"><TriangleAlert size={22} /><strong>No se pudo completar la búsqueda</strong><button type="button" onClick={() => isUrlSearch ? void metadataQuery.refetch() : void searchQuery.refetch()} data-testid="button-retry-search">Reintentar</button></div>
              : results.length === 0 ? <div className="search-state" data-testid="status-search-empty"><Search size={23} /><strong>No se encontraron videos</strong></div>
                : <div className="result-list" data-testid="list-youtube-results">{results.map((item) => (
                  <button type="button" className="result-row" key={item.videoId} onClick={() => choose(item)} data-testid={`button-select-video-${item.videoId}`}>
                    <span className="result-art"><img src={item.thumbnailUrl} alt="" loading="lazy" />{item.durationSeconds != null && <span>{formatDuration(item.durationSeconds)}</span>}</span>
                    <span className="result-copy"><strong>{item.title}</strong><small>{item.authorName}</small><span className="result-open">Abrir detalles <ArrowUpRight size={14} /></span></span>
                  </button>
                ))}</div>}
        </> : <div className="recent-section">
          <div className="recent-heading"><span className="eyebrow">RECIENTES</span><h2>Descargas recientes</h2></div>
          {recentTracks.length > 0 ? (
            <div className="result-list recent-list" data-testid="list-recent-downloads">
              {recentTracks.map((track) => (
                <button type="button" className="result-row recent-track-row" key={track.videoId} onClick={() => onSelect(track)} data-testid={`button-open-recent-${track.videoId}`}>
                  <span className="result-art recent-art"><img src={track.thumbnailUrl} alt="" loading="lazy" /></span>
                  <span className="result-copy"><strong>{track.title}</strong><small>{track.authorName}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="recent-empty" data-testid="status-recent-empty"><Music2 size={18} /><span>Sin descargas recientes</span></div>
          )}
        </div>}
      </div>
    </section>
  );
}
