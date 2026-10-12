import { Router, type IRouter } from "express";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DownloadYoutubeAudioBody,
  GetYoutubeMetadataQueryParams,
  GetYoutubeMetadataResponse,
  SearchYoutubeVideosQueryParams,
  SearchYoutubeVideosResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_CONCURRENT_AUDIO_DOWNLOADS = 2;
let activeAudioDownloads = 0;
const acceptedHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

function extractVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!acceptedHosts.has(url.hostname.toLowerCase())) return null;

  const candidate =
    url.hostname.toLowerCase() === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];

  return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : null;
}

function runYtDlp(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("python3", ["-m", "yt_dlp", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      process.kill("SIGTERM");
      settled = true;
      reject(new Error("La descarga tardó demasiado y se canceló."));
    }, 10 * 60 * 1000);

    process.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    process.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          error.message.includes("ENOENT")
            ? "El servicio de descarga no está disponible."
            : "No se pudo iniciar la descarga.",
        ),
      );
    });
    process.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        const details = stderr.trim().split("\n").at(-1);
        reject(
          new Error(
            details
              ? `No se pudo procesar el video: ${details}`
              : `yt-dlp terminó con el código ${code ?? "desconocido"}.`,
          ),
        );
      }
    });
  });
}

function runYtDlpJson(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", "yt_dlp", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let stdoutSize = 0;
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("La búsqueda tardó demasiado."));
    }, 25_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > 2_000_000) {
        child.kill("SIGTERM");
        finish(new Error("La respuesta de búsqueda fue demasiado grande."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2_000);
    });
    child.on("error", (error) => {
      finish(
        new Error(
          error.message.includes("ENOENT")
            ? "El servicio de búsqueda no está disponible."
            : "No se pudo iniciar la búsqueda.",
        ),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const details = stderr.trim().split("\n").at(-1);
        finish(new Error(details || `yt-dlp terminó con el código ${code ?? "desconocido"}.`));
        return;
      }
      try {
        finish(undefined, JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch {
        finish(new Error("YouTube devolvió una respuesta de búsqueda no válida."));
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

router.get("/youtube/search", async (req, res) => {
  const query = SearchYoutubeVideosQueryParams.safeParse(req.query);
  const searchTerm = query.success ? query.data.q.trim() : "";
  if (!query.success || searchTerm.length < 2) {
    res.status(400).json({ error: "Escribe al menos dos caracteres para buscar." });
    return;
  }

  try {
    const payload = await runYtDlpJson([
      "--js-runtimes",
      "node",
      "--flat-playlist",
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--ignore-errors",
      "--socket-timeout",
      "15",
      "--retries",
      "1",
      "--playlist-end",
      "8",
      `ytsearch8:${searchTerm}`,
    ]);
    const rawEntries = isRecord(payload) && Array.isArray(payload.entries) ? payload.entries : [];
    const results = rawEntries.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const videoId = entry.id;
      const title = entry.title;
      if (
        typeof videoId !== "string" ||
        !/^[\w-]{11}$/.test(videoId) ||
        typeof title !== "string" ||
        !title.trim()
      ) {
        return [];
      }
      const authorName =
        (typeof entry.channel === "string" && entry.channel) ||
        (typeof entry.uploader === "string" && entry.uploader) ||
        (typeof entry.creator === "string" && entry.creator) ||
        "Canal de YouTube";
      const durationSeconds =
        typeof entry.duration === "number" && Number.isFinite(entry.duration)
          ? Math.max(0, Math.round(entry.duration))
          : null;
      return [{
        videoId,
        title: title.trim(),
        authorName,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`,
        durationSeconds,
      }];
    });
    res.json(SearchYoutubeVideosResponse.parse({ results }));
  } catch (error) {
    req.log.warn({ err: error }, "YouTube video search failed");
    res.status(502).json({ error: "No se pudo buscar en YouTube. Inténtalo de nuevo." });
  }
});

router.get("/youtube/metadata", async (req, res) => {
  const query = GetYoutubeMetadataQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Agrega un enlace válido de YouTube." });
    return;
  }

  const videoId = extractVideoId(query.data.url);
  if (!videoId) {
    res.status(400).json({ error: "Ese enlace no corresponde a un video compatible de YouTube." });
    return;
  }

  try {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = new URL("https://www.youtube.com/oembed");
    oembedUrl.searchParams.set("url", canonicalUrl);
    oembedUrl.searchParams.set("format", "json");

    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      res.status(404).json({ error: "No se pudo encontrar la información pública de ese video." });
      return;
    }

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("title" in payload) ||
      typeof payload.title !== "string" ||
      !("author_name" in payload) ||
      typeof payload.author_name !== "string" ||
      !("thumbnail_url" in payload) ||
      typeof payload.thumbnail_url !== "string"
    ) {
      res.status(502).json({ error: "YouTube devolvió datos incompletos para este video." });
      return;
    }

    const data = GetYoutubeMetadataResponse.parse({
      videoId,
      title: payload.title,
      authorName: payload.author_name,
      thumbnailUrl: payload.thumbnail_url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`,
    });
    res.json(data);
  } catch {
    res.status(502).json({ error: "No se pudo consultar YouTube. Inténtalo de nuevo." });
  }
});

router.post("/youtube/audio", async (req, res) => {
  const body = DownloadYoutubeAudioBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "La solicitud de descarga no es válida." });
    return;
  }
  if (!body.data.rightsConfirmed) {
    res.status(400).json({ error: "Confirma que tienes derecho a respaldar este audio." });
    return;
  }

  const videoId = extractVideoId(body.data.url);
  if (!videoId) {
    res.status(400).json({ error: "Solo se admiten enlaces directos a videos de YouTube." });
    return;
  }
  if (activeAudioDownloads >= MAX_CONCURRENT_AUDIO_DOWNLOADS) {
    res.status(429).json({ error: "Hay varias descargas en curso. Inténtalo de nuevo en un momento." });
    return;
  }

  activeAudioDownloads += 1;
  let directory: string;
  try {
    directory = await mkdtemp(join(tmpdir(), "audio-mp3-"));
  } catch {
    activeAudioDownloads -= 1;
    res.status(503).json({ error: "No se pudo preparar la descarga temporal." });
    return;
  }

  try {
    const outputTemplate = join(directory, "%(id)s.%(ext)s");
    await runYtDlp([
      "--js-runtimes",
      "node",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--socket-timeout",
      "30",
      "--retries",
      "2",
      "--fragment-retries",
      "2",
      "--match-filters",
      "duration <= 3600",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "160K",
      "--embed-metadata",
      "--parse-metadata",
      "channel:%(meta_artist)s",
      "--embed-thumbnail",
      "--convert-thumbnails",
      "jpg",
      "--no-embed-chapters",
      "--no-embed-info-json",
      "--output",
      outputTemplate,
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    const outputName = (await readdir(directory)).find((name) =>
      name.toLowerCase().endsWith(".mp3"),
    );
    if (!outputName) {
      res.status(422).json({ error: "No se generó el archivo MP3 para este video." });
      return;
    }

    const outputPath = join(directory, outputName);
    const outputStat = await stat(outputPath);
    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", outputStat.size);
    res.setHeader("Content-Disposition", `attachment; filename="audio-${videoId}.mp3"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(createReadStream(outputPath), res);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ocurrió un error al descargar el video.";
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = message.includes("tardó demasiado")
      ? 504
      : message.includes("no está disponible")
        ? 503
        : 422;
    res.status(status).json({ error: message });
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    activeAudioDownloads -= 1;
  }
});

export default router;
