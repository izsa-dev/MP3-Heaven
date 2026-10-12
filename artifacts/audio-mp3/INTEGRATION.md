# Audio MP3

La interfaz obtiene los datos públicos de un enlace en `GET /api/youtube/metadata`.
Para descargar, envía la URL y la confirmación de derechos a
`POST /api/youtube/audio`. El servidor acepta un video individual de YouTube,
procesa el audio temporalmente con `yt-dlp[default]` y FFmpeg, y usa Node.js
como runtime JavaScript para resolver los formatos de YouTube. Incrusta título,
artista del canal y miniatura en un MP3 de 160 kbps, y transmite el archivo al
navegador.

Los archivos de trabajo se crean en un directorio temporal y se eliminan cuando
termina la respuesta. La cola del navegador solicita cada MP3 de forma
secuencial. No se aceptan listas de reproducción ni enlaces de otros sitios.
