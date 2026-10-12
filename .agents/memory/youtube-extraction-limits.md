---
name: YouTube extraction limits
description: Handling YouTube anti-bot challenges from the Replit-hosted audio extraction service.
---

A real audio request from the Replit-hosted yt-dlp service returned HTTP 422 because YouTube required sign-in to confirm the request was not automated. Search and metadata requests may still succeed when audio extraction is blocked.

**Why:** Hiding this failure makes the download flow appear broken, while asking for browser cookies or credentials would expose sensitive data and attempt to bypass YouTube's restriction.

**How to apply:** Show a concise, actionable failure in the app; do not ask users to share cookies or credentials or implement an anti-bot bypass. Do not claim a conversion succeeded unless the MP3 response is verified.
