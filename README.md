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

## GitHub Pages

This repo includes a static project page under `docs/` and a GitHub Actions workflow under `.github/workflows/pages.yml`.

To enable:

1. Open repository Settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push to `main`.

GitHub Pages is only the public project page. Live Model Studio calls still need the local Python app or a lightweight manually managed host because GitHub Pages cannot run the backend WebSocket proxy.

## Lightweight ECS Option

For a temporary customer demo:

1. Create a small ECS manually.
2. Clone this repo.
3. Run `AI_Model_Studio_Portal/server.py`.
4. Let each user paste their own API key.
5. Stop the ECS after the session.

This keeps cost low and avoids storing API keys on infrastructure.
