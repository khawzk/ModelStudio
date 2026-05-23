# ModelStudio

Customer-facing BYOK demo console for Alibaba Cloud Model Studio, built for the Alibaba Cloud Telesales MYS site.

## Live Demo

Open the GitHub Pages app:

```text
https://khawzk.github.io/ModelStudio/
```

Paste a DashScope / Model Studio API key in the sidebar and run the demos directly in the browser. No local setup is required.

## What It Shows

- Text Intelligence: Qwen chat models for PoC scoping, RFP strategy, and migration planning.
- Vision Lab: upload or link an image for multimodal analysis.
- Omni Lab: Qwen-Omni audio/image/text understanding demos, plus LiveTranslate positioning.
- Image Studio: text-to-image, image editing, fusion, upload, and camera capture flows.
- Speech AI: sample WAV and uploaded audio transcription with Qwen ASR.
- Session: run history for customer-facing demo evidence.

## BYOK Design

BYOK means bring your own key. The app does not store API keys in the repository or backend infrastructure. In the GitHub Pages version, the key is entered at runtime and used from the browser session.

Most REST-based demos can run from Pages directly: text, vision, image, omni chat completion, and ASR. Realtime LiveTranslate uses WebSocket authorization that browsers cannot attach natively, so it remains documented as an architecture/demo positioning item unless a backend proxy is added.

## Repository Layout

```text
docs/                  GitHub Pages app
AI_Model_Studio_Portal/ Optional Python proxy version for private backend demos
.github/workflows/     Pages deployment workflow
```

## Deployment

This repo publishes `docs/` through GitHub Pages using `.github/workflows/pages.yml`.

To enable Pages on a fork:

1. Open repository Settings.
2. Go to Pages.
3. Set the source to GitHub Actions.
4. Push to `main`.

## Notes

Model availability and API keys are region-sensitive. The UI exposes International / Singapore, China / Beijing, and US / Virginia region choices. Use the region that matches the API key entitlement.
