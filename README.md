# ModelStudio

Alibaba Cloud Model Studio demo assets for customer-facing solution discovery.

## Current Package

`AI_Model_Studio_Portal` is a custom BYOK demo console for Alibaba Cloud Telesales MYS. It showcases Qwen, Wan, vision, image editing, video generation, speech, and realtime translation through a polished web UI.

BYOK means users bring their own DashScope / Model Studio API key at runtime. The repository does not store keys and no Terraform-managed cloud resource is required.

## Run The Demo

```bash
cd AI_Model_Studio_Portal
python3 -m pip install -r requirements.txt
python3 server.py
```

Open:

```text
http://localhost:8501
```

Paste your DashScope / Model Studio API key in the UI.

## GitHub Pages Live Demo

This repo publishes the browser demo directly from `docs/` using GitHub Pages:

```text
https://khawzk.github.io/ModelStudio/
```

Users paste their own DashScope / Model Studio API key into the page. The key stays in the browser session and is not committed to the repo.

To enable:

1. Open repository Settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push to `main`.

Most REST-based modules run directly from GitHub Pages: text, vision, image, video task submission, and ASR. The page includes a sample 16 kHz mono PCM WAV for speech demos.

Some async polling endpoints may still be blocked by browser CORS from GitHub Pages. In that case, the UI keeps the accepted video task ID visible instead of failing silently. Realtime LiveTranslate still needs the Python proxy because browser WebSocket cannot set the required `Authorization` header.

## Lightweight ECS Option

For realtime LiveTranslate or any browser CORS fallback:

1. Create a small ECS manually.
2. Clone this repo.
3. Run `AI_Model_Studio_Portal/server.py`.
4. Let each user paste their own API key.
5. Stop the ECS after the session.

This keeps cost low and avoids storing API keys on infrastructure.
