const catalog = [
  ["Flagship LLM", ["qwen3-max", "qwen-plus", "qwen-flash"], "Reasoning, enterprise Q&A, proposal drafting, workflow automation."],
  ["Multimodal Understanding", ["qwen3.5-plus", "qwen-vl-max-latest", "qwen-vl-plus-latest"], "Image understanding, visual inspection, document screenshots."],
  ["Image Generation & Editing", ["qwen-image-2.0-pro", "qwen-image-edit-plus", "wan2.7-image-pro"], "Text-to-image, image edit, multi-image fusion, product assets."],
  ["Video Generation", ["wan2.6-t2v", "wan2.7-i2v"], "Text-to-video and image-to-video async creative workflows."],
  ["Speech & Audio", ["qwen3-asr-flash", "qwen-audio-turbo"], "ASR, call transcription, speech translation positioning."],
];

let runs = [];
let imageMode = "edit";
let cameraStreams = {};
let cameraCaptures = {};

const $ = (id) => document.getElementById(id);
const state = () => ({ region: $("region").value, apiKey: $("apiKey").value.trim() });

const textCases = {
  warroom: `You are Qwen 3.7 Max acting as a principal Alibaba Cloud solution architect in a live executive war room.

Customer: A Malaysian retail bank wants an AI telesales platform in 6 weeks. Constraints:
- 3.2M customer profiles, 18 months call history, Bahasa Malaysia + English call transcripts.
- Data must stay in Malaysia/Singapore approved regions; no raw PII in prompts.
- Existing CRM is Salesforce, data lake is MaxCompute, contact center exports WAV files nightly.
- Compliance asks for auditability, hallucination controls, and explainable next-best-action recommendations.
- Business wants +12% conversion, -20% manual call prep time, and measurable agent adoption.

Produce:
1. A sharp executive recommendation in 5 bullets.
2. Target architecture using Alibaba Cloud Model Studio, Qwen, ASR, RAG, feature store/scoring, and human approval.
3. A phased 6-week PoC plan with owners, acceptance criteria, and measurable KPIs.
4. Risk register with mitigation for privacy, model quality, latency, sales adoption, and regulatory review.
5. A decision matrix comparing: rules engine, classic ML lead scoring, LLM-only workflow, and hybrid Qwen + RAG + scoring.
6. A final "next meeting close" script for telesales MYS to secure customer buy-in.

Make it commercially grounded, technically specific, and concise enough to paste into a customer follow-up email.`,
  rfp: `Draft a high-quality RFP response strategy for Alibaba Cloud Model Studio.

Scenario: A regional e-commerce group wants a multimodal AI platform for product content, livestream clips, seller support, and multilingual customer service. They compare Alibaba Cloud against OpenAI, AWS, and Google.

Return:
1. Win themes.
2. Differentiated Model Studio capabilities.
3. Reference architecture.
4. Security and governance response.
5. Pricing / cost-control narrative.
6. Demo script that uses text, vision, image editing, video, speech, and omni models.
7. Red-team objections and strong rebuttals.`,
  migration: `Analyze this AI migration case.

Customer runs multiple disconnected AI pilots: one OpenAI chatbot, one local OCR model, one video generation SaaS, and one speech transcription vendor. Costs are rising, data governance is weak, and leadership wants a single AI platform on Alibaba Cloud.

Build a migration plan:
1. Current-state diagnosis.
2. Target-state Model Studio architecture.
3. Model selection table.
4. Integration sequence.
5. Data governance and PII strategy.
6. Migration risks and rollback plan.
7. 30/60/90 day roadmap.`,
};

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function api(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...state(), ...body }) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

function addRun(type, model, prompt, output) {
  runs.unshift({ time: new Date().toLocaleTimeString(), type, model, prompt, output });
  $("runCount").textContent = runs.length;
  renderSession();
}

function setOutput(id, content, loading = false) {
  $(id).textContent = loading ? "Working..." : content;
}

function setView(view) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
}

function renderText() {
  $("view-text").innerHTML = `
    <div class="section-head"><div><h2>Text Intelligence</h2><p class="hint">Use Qwen 3.7 Max for complex multi-constraint solution design and executive-ready PoC planning.</p></div></div>
    <div class="grid">
      <div class="panel">
        <label>Model</label><select id="textModel"><option>qwen3.7-max</option><option>qwen3-max</option><option>qwen-plus</option><option>qwen-flash</option><option>deepseek-v3</option><option>deepseek-r1</option></select>
        <div class="tabs mini-tabs">
          <button type="button" data-text-case="warroom" class="active">War Room</button>
          <button type="button" data-text-case="rfp">RFP Strategy</button>
          <button type="button" data-text-case="migration">Migration Risk</button>
        </div>
        <label>Prompt</label><textarea id="textPrompt" rows="12">${textCases.warroom}</textarea>
        <button class="primary" id="runText">Generate Response</button>
      </div>
      <div class="output" id="textOutput">Ready.</div>
    </div>`;
  document.querySelectorAll("[data-text-case]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-text-case]").forEach((item) => item.classList.toggle("active", item === btn));
      $("textPrompt").value = textCases[btn.dataset.textCase];
    };
  });
  $("runText").onclick = async () => {
    try {
      setOutput("textOutput", "", true);
      const model = $("textModel").value;
      const prompt = $("textPrompt").value;
      const data = await api("/api/chat", { model, prompt, system: "You are an Alibaba Cloud solution architect. Be concise, polished, and commercially grounded." });
      setOutput("textOutput", data.text);
      addRun("Text", model, prompt, data.text);
    } catch (e) { setOutput("textOutput", e.message); }
  };
}

function renderVision() {
  $("view-vision").innerHTML = `
    <div class="section-head"><div><h2>Vision Lab</h2><p class="hint">Upload or link an image, then analyze it with Qwen 3.6 Plus or VL fallbacks.</p></div></div>
    <div class="grid">
      <div class="panel">
        <label>Model</label><select id="visionModel"><option>qwen3.6-plus</option><option>qwen3.5-plus</option><option>qwen-vl-max-latest</option><option>qwen-vl-plus-latest</option></select>
        <label>Image source</label><select id="visionSource"><option value="url">URL</option><option value="upload">Upload photo</option></select>
        <input id="visionImage" value="https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg" />
        <input id="visionFile" type="file" accept="image/*" hidden />
        <label>Prompt</label><textarea id="visionPrompt" rows="7">Analyze the visual, identify practical enterprise applications, and recommend one elegant workflow narrative.</textarea>
        <button class="primary" id="runVision">Analyze Image</button>
      </div>
      <div><div class="preview"><img id="visionPreview" src="https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg" /></div><pre class="output" id="visionOutput">Ready.</pre></div>
    </div>`;
  $("visionImage").oninput = () => $("visionPreview").src = $("visionImage").value;
  $("visionSource").onchange = () => {
    const upload = $("visionSource").value === "upload";
    $("visionImage").hidden = upload;
    $("visionFile").hidden = !upload;
  };
  $("visionFile").onchange = async () => {
    const image = await readFileAsDataUrl($("visionFile").files[0]);
    if (image) $("visionPreview").src = image;
  };
  $("runVision").onclick = async () => {
    try {
      setOutput("visionOutput", "", true);
      const model = $("visionModel").value, prompt = $("visionPrompt").value;
      const image = $("visionSource").value === "upload" ? await readFileAsDataUrl($("visionFile").files[0]) : $("visionImage").value;
      const data = await api("/api/vision", { model, prompt, image });
      setOutput("visionOutput", data.text);
      addRun("Vision", model, prompt, data.text);
    } catch (e) { setOutput("visionOutput", e.message); }
  };
}

function renderOmni() {
  $("view-omni").innerHTML = `
    <div class="section-head"><div><h2>Omni Models</h2><p class="hint">Realtime audio/video translation architecture for qwen3.5-livetranslate-flash-realtime.</p></div></div>
    <div class="grid">
      <div class="panel">
        <span class="pill">Realtime WebSocket</span>
        <h3>LiveTranslate WAV Runner</h3>
        <div class="models"><span class="pill">qwen3.5-livetranslate-flash-realtime</span><span class="pill">qwen3-asr-flash-realtime</span></div>
        <label>Model</label><select id="omniModel"><option>qwen3.5-livetranslate-flash-realtime</option><option>qwen3-livetranslate-flash-realtime</option></select>
        <label>Endpoint</label><input id="omniEndpoint" value="wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime" readonly />
        <div class="row">
          <div><label>Source language</label><select id="omniSource"><option value="en">English</option><option value="zh">Chinese</option><option value="ms">Malay</option><option value="id">Indonesian</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="th">Thai</option></select></div>
          <div><label>Target language</label><select id="omniTarget"><option value="zh">Chinese</option><option value="en">English</option><option value="ms">Malay</option><option value="id">Indonesian</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="th">Thai</option></select></div>
        </div>
        <label>PCM WAV file</label><input id="omniFile" type="file" accept=".wav,audio/wav,audio/x-wav" />
        <button class="primary" id="runOmniRealtime">Run Realtime Translation</button>
        <button class="ghost slim" id="buildOmniSession">Show Session Payload</button>
      </div>
      <div class="output" id="omniOutput">Upload a PCM16 WAV file and run qwen3.5-livetranslate-flash-realtime through the backend WebSocket proxy.</div>
    </div>
    <div class="cards omni-cases">
      <article class="card">
        <span class="pill">Input events</span>
        <h3>Audio + Optional Image Context</h3>
        <p class="hint">Send PCM audio chunks through <code>input_audio_buffer.append</code>. Send optional image frames through <code>input_image_buffer.append</code> for visual disambiguation.</p>
      </article>
      <article class="card">
        <span class="pill">Output events</span>
        <h3>Translated Text + Audio</h3>
        <p class="hint">Text-only sessions return <code>response.text.done</code>. Audio sessions stream <code>response.audio.delta</code> and final transcript events.</p>
      </article>
      <article class="card">
        <span class="pill">Customer cases</span>
        <h3>Where It Fits</h3>
        <p class="hint">Cross-border telesales calls, webinars, livestream product pitches, internal bilingual training, and noisy support calls where visual context helps translation.</p>
      </article>
    </div>`;
  updateOmniEndpoint();
  $("omniModel").onchange = updateOmniEndpoint;
  $("buildOmniSession").onclick = buildOmniSession;
  $("runOmniRealtime").onclick = runOmniRealtime;
}

function realtimeBaseUrl() {
  const region = $("region").value;
  if (region === "cn") return "wss://dashscope.aliyuncs.com/api-ws/v1/realtime";
  return "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime";
}

function updateOmniEndpoint() {
  if (!$("omniEndpoint") || !$("omniModel")) return;
  $("omniEndpoint").value = `${realtimeBaseUrl()}?model=${$("omniModel").value}`;
}

function renderImage() {
  $("view-image").innerHTML = `
    <div class="section-head"><div><h2>Image Studio</h2><p class="hint">Qwen-powered image editing with upload/camera input, plus Wan creation and selected-area workflows.</p></div></div>
    <div class="tabs">
      ${[["text","Text-to-image"],["edit","Image edit"],["fusion","Fusion"]].map(([id,label]) => `<button data-mode="${id}" class="${id === imageMode ? "active" : ""}">${label}</button>`).join("")}
    </div>
    <div class="grid">
      <div class="panel" id="imageControls"></div>
      <div><div class="gallery" id="imageGallery"></div><pre class="output" id="imageOutput">Ready.</pre></div>
    </div>`;
  document.querySelectorAll("[data-mode]").forEach((btn) => btn.onclick = () => { imageMode = btn.dataset.mode; renderImage(); });
  renderImageControls();
}

function imageSourceControls(count = 1) {
  return Array.from({ length: count }, (_, i) => `
    <label>Image ${i + 1}</label>
    <select id="imgType${i}"><option value="url">URL</option><option value="upload">Upload</option><option value="camera">Camera</option></select>
    <input id="imgUrl${i}" value="${i === 0 ? "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251229/pjeqdf/car.webp" : "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251229/xsunlm/paint.webp"}" />
    <input id="imgFile${i}" type="file" accept="image/*" hidden />
    <div id="cameraBox${i}" class="camera-box" hidden>
      <video id="cameraVideo${i}" autoplay playsinline muted></video>
      <div class="row">
        <button class="ghost" type="button" id="openCamera${i}">Open camera</button>
        <button class="ghost" type="button" id="captureCamera${i}">Capture</button>
      </div>
      <canvas id="cameraCanvas${i}" hidden></canvas>
      <img id="cameraPreview${i}" alt="Camera capture preview" hidden />
    </div>
  `).join("");
}

function renderImageControls() {
  const multi = imageMode === "fusion";
  const modelOptions =
    imageMode === "text"
        ? "<option>qwen-image-2.0-pro</option><option>wan2.7-image-pro</option><option>wan2.7-image</option>"
        : "<option>qwen-image-edit-plus</option><option>qwen-image-edit-max</option><option>qwen-image-2.0-pro</option><option>qwen-image-edit</option>";
  $("imageControls").innerHTML = `
    <label>Model</label><select id="imageModel">${modelOptions}</select>
    <label>Prompt</label><textarea id="imagePrompt" rows="6">${imageMode === "edit" ? "Change the car color to matte graphite black and keep reflections realistic." : imageMode === "fusion" ? "Spray the graffiti from image 2 onto the car in image 1. Preserve the car shape and blend lighting naturally." : "Create a premium retail campaign visual for a running shoe, with clean lighting and Southeast Asia urban commuter context."}</textarea>
    ${imageMode === "text" ? "" : imageSourceControls(multi ? 2 : 1)}
    <button class="primary" id="runImage">Create Image</button>`;
  for (let i = 0; i < (multi ? 2 : 1); i++) setupImageSource(i);
  $("runImage").onclick = runImage;
}

function setupImageSource(i) {
  const type = $(`imgType${i}`);
  if (!type) return;
  type.onchange = () => {
    $(`imgUrl${i}`).hidden = type.value !== "url";
    $(`imgFile${i}`).hidden = type.value !== "upload";
    $(`cameraBox${i}`).hidden = type.value !== "camera";
  };
  $(`openCamera${i}`).onclick = () => openCamera(i);
  $(`captureCamera${i}`).onclick = () => captureCamera(i);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function collectImage(i) {
  const type = $(`imgType${i}`)?.value;
  if (!type) return "";
  if (type === "url") return $(`imgUrl${i}`).value;
  if (type === "upload") return readFileAsDataUrl($(`imgFile${i}`).files[0]);
  return cameraCaptures[i] || "";
}

async function openCamera(i) {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Camera API is not available in this browser context.");
    return;
  }
  cameraStreams[i] = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  $(`cameraVideo${i}`).srcObject = cameraStreams[i];
}

function captureCamera(i) {
  const video = $(`cameraVideo${i}`);
  if (!video.srcObject) {
    alert("Open the camera first.");
    return;
  }
  const canvas = $(`cameraCanvas${i}`);
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  cameraCaptures[i] = canvas.toDataURL("image/jpeg", 0.92);
  const preview = $(`cameraPreview${i}`);
  preview.src = cameraCaptures[i];
  preview.hidden = false;
}

async function runImage() {
  try {
    setOutput("imageOutput", "", true);
    const model = $("imageModel").value, prompt = $("imagePrompt").value;
    const images = [];
    if (imageMode !== "text") {
      images.push(await collectImage(0));
      if (imageMode === "fusion") images.push(await collectImage(1));
    }
    const data = await api("/api/image", { model, prompt, images, size: "2K", n: 1 });
    $("imageGallery").innerHTML = data.images.map((src) => `<a href="${src}" target="_blank"><img src="${src}" /></a>`).join("");
    setOutput("imageOutput", `Generated ${data.images.length} image(s).`);
    addRun("Image", model, prompt, data.images.join("\n"));
  } catch (e) { setOutput("imageOutput", e.message); }
}

function buildOmniSession() {
  const source = $("omniSource").value;
  const target = $("omniTarget").value;
  const model = $("omniModel").value;
  const payload = {
    type: "session.update",
    session: {
      modalities: ["text"],
      input_audio_format: "pcm16",
      input_audio_transcription: {
        model: "qwen3-asr-flash-realtime",
        language: source,
      },
      translation: {
        language: target,
      },
    },
  };
  updateOmniEndpoint();
  setOutput("omniOutput", `WebSocket\n${$("omniEndpoint").value}\n\n${JSON.stringify(payload, null, 2)}\n\nAudio chunks are sent as input_audio_buffer.append, then the client sends session.finish.`);
  addRun("Omni Realtime Payload", model, `${source} to ${target}`, JSON.stringify(payload));
}

async function runOmniRealtime() {
  try {
    const file = $("omniFile").files[0];
    if (!file) throw new Error("Upload a WAV file first.");
    setOutput("omniOutput", "Opening realtime WebSocket, streaming WAV chunks...", true);
    const media = await readFileAsDataUrl(file);
    const model = $("omniModel").value;
    const sourceLang = $("omniSource").value;
    const targetLang = $("omniTarget").value;
    const data = await api("/api/livetranslate-realtime", { model, media, sourceLang, targetLang });
    const eventLines = (data.events || []).map((event) => `- ${event.type}`).join("\n");
    const output = [
      `Model: ${data.model}`,
      `Audio: ${data.audio?.sampleRate || "?"} Hz, ${data.audio?.channels || "?"} channel(s), ${data.audio?.durationSec || "?"} sec`,
      "",
      "Translated:",
      data.text || "(No translated text returned.)",
      "",
      "Transcript:",
      data.transcript || "(No source transcript returned.)",
      "",
      "Realtime events:",
      eventLines || "(No event summary.)",
    ].join("\n");
    setOutput("omniOutput", output);
    addRun("Omni LiveTranslate", model, `${sourceLang} to ${targetLang}`, data.text || data.transcript || JSON.stringify(data.events, null, 2));
  } catch (e) {
    setOutput("omniOutput", e.message);
  }
}

function renderVideo() {
  $("view-video").innerHTML = `
    <div class="section-head"><div><h2>Video Studio</h2><p class="hint">Async Wan video workflow without noisy polling output.</p></div></div>
    <div class="grid">
      <div class="panel">
        <label>Mode</label><select id="videoMode"><option value="t2v">Text-to-video</option><option value="i2v">Image-to-video</option></select>
        <label>Model</label><select id="videoModel"><option>happyhorse-1.0-t2v</option><option>wan2.6-t2v</option></select>
        <label>Prompt</label><textarea id="videoPrompt" rows="6">A cinematic product video of a premium running shoe moving through Kuala Lumpur at night, clean commercial style.</textarea>
        <label>First frame URL</label><input id="videoImage" value="https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251229/pjeqdf/car.webp" hidden />
        <div class="row"><div><label>Resolution</label><select id="videoResolution"><option>720P</option><option>1080P</option></select></div><div><label>Duration</label><input id="videoDuration" type="number" min="3" max="15" value="5" /></div></div>
        <label>Ratio</label><select id="videoRatio"><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option><option>3:4</option></select>
        <button class="primary" id="runVideo">Submit Video</button>
      </div>
      <div><video id="videoResult" controls hidden></video><div class="bar"><span id="videoBar"></span></div><div class="status" id="videoStatus">Ready.</div></div>
    </div>`;
  $("videoMode").onchange = () => {
    const i2v = $("videoMode").value === "i2v";
    $("videoModel").innerHTML = i2v ? "<option>wan2.7-i2v</option><option>wan2.6-i2v-flash</option>" : "<option>happyhorse-1.0-t2v</option><option>wan2.6-t2v</option>";
    $("videoImage").hidden = !i2v;
  };
  $("runVideo").onclick = runVideo;
}

async function runVideo() {
  try {
    $("videoStatus").textContent = "Submitting task...";
    $("videoBar").style.width = "20%";
    const model = $("videoModel").value, prompt = $("videoPrompt").value;
    const data = await api("/api/video", { model, prompt, image: $("videoMode").value === "i2v" ? $("videoImage").value : "", resolution: $("videoResolution").value, duration: $("videoDuration").value, ratio: $("videoRatio").value });
    const taskId = data.taskId;
    $("videoStatus").textContent = `Task accepted. Waiting for result...`;
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const url = `/api/task?id=${encodeURIComponent(taskId)}&region=${$("region").value}&apiKey=${encodeURIComponent($("apiKey").value.trim())}`;
      const task = await fetch(url).then((r) => r.json());
      const status = task.output?.task_status || "UNKNOWN";
      $("videoBar").style.width = status === "PENDING" ? "38%" : status === "RUNNING" ? "72%" : "100%";
      $("videoStatus").textContent = status === "PENDING" || status === "RUNNING" ? "Rendering in Model Studio..." : status;
      if (status === "SUCCEEDED") {
        $("videoResult").src = task.output.video_url;
        $("videoResult").hidden = false;
        addRun("Video", model, prompt, task.output.video_url);
        return;
      }
      if (status === "FAILED") throw new Error(task.output?.message || "Video task failed");
    }
  } catch (e) { $("videoStatus").textContent = e.message; }
}

function renderSpeech() {
  $("view-speech").innerHTML = `
    <div class="section-head"><div><h2>Speech AI</h2><p class="hint">Context-aware ASR for multilingual customer calls.</p></div></div>
    <div class="grid">
      <div class="panel">
        <label>Model</label><select id="asrModel"><option>qwen3-asr-flash</option></select>
        <label>Language hint</label><select id="asrLang"><option value="auto">Auto</option><option value="en">English</option><option value="zh">Chinese</option><option value="ms">Malay</option><option value="id">Indonesian</option></select>
        <label>Context</label><textarea id="asrContext" rows="4">Alibaba Cloud, Model Studio, Qwen, Wan, DashScope, Telesales MYS</textarea>
        <label>Audio file</label><input id="asrFile" type="file" accept="audio/*" />
        <button class="primary" id="runAsr">Transcribe</button>
      </div>
      <div class="output" id="asrOutput">Ready.</div>
    </div>`;
  $("runAsr").onclick = async () => {
    try {
      setOutput("asrOutput", "", true);
      const audio = await readFileAsDataUrl($("asrFile").files[0]);
      const data = await api("/api/asr", { model: $("asrModel").value, audio, language: $("asrLang").value, context: $("asrContext").value });
      setOutput("asrOutput", data.text || JSON.stringify(data.raw, null, 2));
      addRun("Speech", $("asrModel").value, "Audio transcription", data.text);
    } catch (e) { setOutput("asrOutput", e.message); }
  };
}

function renderSession() {
  $("view-session").innerHTML = `
    <div class="section-head"><div><h2>Session</h2><p class="hint">Captured outputs from this showcase session.</p></div></div>
    <div class="cards">${runs.map((run) => `
      <article class="card">
        <span class="pill">${run.type}</span>
        <h3>${run.model}</h3>
        <p class="hint">${escapeHtml(run.time)}</p>
        <pre>${escapeHtml((run.output || "").slice(0, 700))}</pre>
      </article>`).join("") || '<p class="hint">No runs captured yet.</p>'}</div>`;
}

function boot() {
  renderText(); renderVision(); renderOmni(); renderImage(); renderVideo(); renderSpeech(); renderSession();
  document.querySelectorAll("nav button").forEach((btn) => btn.onclick = () => setView(btn.dataset.view));
  $("region").onchange = updateOmniEndpoint;
}
boot();
