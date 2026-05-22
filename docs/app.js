const catalog = [
  ["Flagship LLM", ["qwen3-max", "qwen-plus", "qwen-flash"], "Reasoning, enterprise Q&A, proposal drafting, workflow automation."],
  ["Multimodal Understanding", ["qwen3.5-plus", "qwen-vl-max-latest", "qwen-vl-plus-latest"], "Image understanding, visual inspection, document screenshots."],
  ["Image Generation & Editing", ["wan2.7-image-pro", "wan2.7-image", "z-image-turbo"], "Text-to-image, image edit, multi-image fusion, product assets."],
  ["Video Generation", ["wan2.6-t2v", "wan2.7-i2v"], "Text-to-video and image-to-video async creative workflows."],
  ["Speech & Audio", ["qwen3-asr-flash", "qwen-audio-turbo"], "ASR, call transcription, speech translation positioning."],
];

let runs = [];
let imageMode = "edit";
let cameraStreams = {};
let cameraCaptures = {};

const $ = (id) => document.getElementById(id);
const state = () => ({ region: $("region").value, apiKey: $("apiKey").value.trim() });

const REGIONS = {
  intl: {
    compatible: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    api: "https://dashscope-intl.aliyuncs.com/api/v1",
    ws: "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
  },
  cn: {
    compatible: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api: "https://dashscope.aliyuncs.com/api/v1",
    ws: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
  },
  us: {
    compatible: "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
    api: "https://dashscope-us.aliyuncs.com/api/v1",
    ws: "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
  },
};

const corsHint = "If this request is blocked by browser CORS, run the Python proxy version from AI_Model_Studio_Portal/server.py for this specific module.";

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function api(path, body) {
  const data = { ...state(), ...body };
  if (!data.apiKey) throw new Error("Paste a DashScope API key first.");
  if (path === "/api/chat") return directChat(data);
  if (path === "/api/vision") return directVision(data);
  if (path === "/api/image") return directImage(data);
  if (path === "/api/video") return directVideo(data);
  if (path === "/api/asr") return directAsr(data);
  throw new Error(`Unsupported static route: ${path}`);
}

function regionConfig(region) {
  return REGIONS[region || "intl"] || REGIONS.intl;
}

async function requestJson(url, apiKey, payload, options = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (options.asyncTask) headers["X-DashScope-Async"] = "enable";
  try {
    const res = await fetch(url, {
      method: options.method || "POST",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
    return data;
  } catch (error) {
    if (String(error.message || error).includes("Failed to fetch")) {
      throw new Error(`${error.message}\n\n${corsHint}`);
    }
    throw error;
  }
}

function extractImages(payload) {
  const images = [];
  const output = payload.output || {};
  for (const choice of output.choices || []) {
    const content = choice.message?.content || [];
    for (const item of content) if (item.image) images.push(item.image);
  }
  for (const result of output.results || []) {
    if (result && typeof result === "object") {
      for (const [key, value] of Object.entries(result)) {
        if (["url", "image"].includes(key) && value) images.push(value);
      }
    }
  }
  return images;
}

async function directChat(data) {
  const cfg = regionConfig(data.region);
  const payload = {
    model: data.model || "qwen-plus",
    messages: [
      { role: "system", content: data.system || "You are a concise Alibaba Cloud solution architect." },
      { role: "user", content: data.prompt || "" },
    ],
  };
  const result = await requestJson(`${cfg.compatible}/chat/completions`, data.apiKey, payload);
  return { text: result.choices?.[0]?.message?.content || "", raw: result };
}

async function directVision(data) {
  const cfg = regionConfig(data.region);
  const payload = {
    model: data.model || "qwen-vl-max-latest",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: data.image || "" } },
        { type: "text", text: data.prompt || "" },
      ],
    }],
  };
  const result = await requestJson(`${cfg.compatible}/chat/completions`, data.apiKey, payload);
  return { text: result.choices?.[0]?.message?.content || "", raw: result };
}

async function directImage(data) {
  const cfg = regionConfig(data.region);
  const model = data.model || "qwen-image-2.0-pro";
  let payload;
  if (model === "z-image-turbo") {
    payload = {
      model,
      input: { messages: [{ role: "user", content: [{ text: data.prompt || "" }] }] },
      parameters: { prompt_extend: false, size: data.size || "1024*1024" },
    };
  } else if (model.startsWith("qwen-image")) {
    const content = (data.images || []).filter(Boolean).map((image) => ({ image }));
    content.push({ text: data.prompt || "" });
    payload = { model, input: { messages: [{ role: "user", content }] }, parameters: { n: Number(data.n || 1), watermark: false } };
  } else {
    const content = (data.images || []).filter(Boolean).map((image) => ({ image }));
    content.push({ text: data.prompt || "" });
    payload = {
      model,
      input: { messages: [{ role: "user", content }] },
      parameters: { size: data.size || "2K", n: Number(data.n || 1), watermark: false, thinking_mode: true },
    };
  }
  const result = await requestJson(`${cfg.api}/services/aigc/multimodal-generation/generation`, data.apiKey, payload);
  return { images: extractImages(result), raw: result };
}

async function directVideo(data) {
  const cfg = regionConfig(data.region);
  const model = data.model || "happyhorse-1.0-t2v";
  const input = { prompt: data.prompt || "" };
  if (data.image) {
    if (model === "wan2.7-i2v") input.media = [{ type: "first_frame", url: data.image }];
    else input.img_url = data.image;
  }
  const payload = {
    model,
    input,
    parameters: {
      resolution: data.resolution || "720P",
      duration: Number(data.duration || 5),
      prompt_extend: true,
      watermark: false,
    },
  };
  if (model === "happyhorse-1.0-t2v") payload.parameters.ratio = data.ratio || "16:9";
  const result = await requestJson(`${cfg.api}/services/aigc/video-generation/video-synthesis`, data.apiKey, payload, { asyncTask: true });
  return { taskId: result.output?.task_id, raw: result };
}

async function directTask(taskId) {
  const cfg = regionConfig($("region").value);
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) throw new Error("Paste a DashScope API key first.");
  return requestJson(`${cfg.api}/tasks/${encodeURIComponent(taskId)}`, apiKey, null, { method: "GET" });
}

async function directAsr(data) {
  const cfg = regionConfig(data.region);
  const model = data.model || "qwen3-asr-flash";
  const messages = [];
  if ((data.context || "").trim() && model === "qwen3-asr-flash") {
    messages.push({ role: "system", content: [{ text: data.context.trim() }] });
  }
  messages.push({ role: "user", content: [{ audio: data.audio || "" }] });
  const parameters = { incremental_output: false };
  if (model === "qwen3-asr-flash") {
    parameters.asr_options = { enable_itn: true };
    if (data.language && data.language !== "auto") parameters.asr_options.language = data.language;
    else parameters.asr_options.enable_lid = true;
  }
  const result = await requestJson(`${cfg.api}/services/aigc/multimodal-generation/generation`, data.apiKey, { model, input: { messages }, parameters });
  const content = result.output?.choices?.[0]?.message?.content || [];
  return { text: content.map((item) => item.text || "").join(""), raw: result };
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
    <div class="section-head"><div><h2>Text Intelligence</h2><p class="hint">Turn customer requirements into crisp scoping output.</p></div></div>
    <div class="grid">
      <div class="panel">
        <label>Model</label><select id="textModel"><option>qwen3-max</option><option>qwen-plus</option><option>qwen-flash</option><option>deepseek-v3</option><option>deepseek-r1</option></select>
        <label>Prompt</label><textarea id="textPrompt" rows="10">Turn these customer requirements into a Model Studio PoC scope with success metrics, model selection, integration risks, and next action for Alibaba Cloud Telesales MYS.</textarea>
        <button class="primary" id="runText">Generate Response</button>
      </div>
      <div class="output" id="textOutput">Ready.</div>
    </div>`;
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
    <div class="section-head"><div><h2>Omni Models</h2><p class="hint">Realtime configuration for qwen3.5-livetranslate-flash-realtime.</p></div></div>
    <div class="grid">
      <div class="panel">
        <span class="pill">Realtime WebSocket</span>
        <h3>LiveTranslate Session</h3>
        <div class="models"><span class="pill">qwen3.5-livetranslate-flash-realtime</span><span class="pill">qwen3-asr-flash-realtime</span></div>
        <label>Model</label><select id="omniModel"><option>qwen3.5-livetranslate-flash-realtime</option><option>qwen3-livetranslate-flash-realtime</option></select>
        <label>Endpoint</label><input id="omniEndpoint" value="wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-livetranslate-flash-realtime" readonly />
        <div class="row">
          <div><label>Source language</label><select id="omniSource"><option value="en">English</option><option value="zh">Chinese</option><option value="ms">Malay</option><option value="id">Indonesian</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="th">Thai</option></select></div>
          <div><label>Target language</label><select id="omniTarget"><option value="zh">Chinese</option><option value="en">English</option><option value="ms">Malay</option><option value="id">Indonesian</option><option value="ja">Japanese</option><option value="ko">Korean</option><option value="fr">French</option><option value="de">German</option><option value="es">Spanish</option><option value="th">Thai</option></select></div>
        </div>
        <label>PCM WAV file</label><input id="omniFile" type="file" accept=".wav,audio/wav,audio/x-wav" />
        <button class="primary" id="runOmniRealtime">Check Browser Realtime Support</button>
        <button class="ghost slim" id="buildOmniSession">Show Session Payload</button>
      </div>
      <div class="output" id="omniOutput">Most Model Studio REST demos run directly from this page. Realtime LiveTranslate still needs a proxy because browser WebSocket cannot attach the required Authorization header.</div>
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
      ${[["text","Text-to-image"],["edit","Image edit"],["fusion","Fusion"],["fast","Fast product"]].map(([id,label]) => `<button data-mode="${id}" class="${id === imageMode ? "active" : ""}">${label}</button>`).join("")}
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
    imageMode === "fast"
      ? "<option>z-image-turbo</option>"
      : imageMode === "text"
        ? "<option>qwen-image-2.0-pro</option><option>wan2.7-image-pro</option><option>wan2.7-image</option>"
        : "<option>qwen-image-edit-plus</option><option>qwen-image-edit-max</option><option>qwen-image-2.0-pro</option><option>qwen-image-edit</option>";
  $("imageControls").innerHTML = `
    <label>Model</label><select id="imageModel">${modelOptions}</select>
    <label>Prompt</label><textarea id="imagePrompt" rows="6">${imageMode === "edit" ? "Change the car color to matte graphite black and keep reflections realistic." : imageMode === "fusion" ? "Spray the graffiti from image 2 onto the car in image 1. Preserve the car shape and blend lighting naturally." : "Create a premium retail campaign visual for a running shoe, with clean lighting and Southeast Asia urban commuter context."}</textarea>
    ${imageMode === "text" || imageMode === "fast" ? "" : imageSourceControls(multi ? 2 : 1)}
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
    if (!["text","fast"].includes(imageMode)) {
      images.push(await collectImage(0));
      if (imageMode === "fusion") images.push(await collectImage(1));
    }
    const data = await api("/api/image", { model, prompt, images, size: model === "z-image-turbo" ? "1024*1024" : "2K", n: 1 });
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
    const model = $("omniModel").value;
    const sourceLang = $("omniSource").value;
    const targetLang = $("omniTarget").value;
    const output = [
      `Model: ${model}`,
      `WAV: ${file.name}`,
      `Language: ${sourceLang} to ${targetLang}`,
      "",
      "This GitHub Pages version is pure static BYOK. Browser JavaScript can call Model Studio REST endpoints with your key, but it cannot set the Authorization header on a native WebSocket connection.",
      "",
      "For LiveTranslate realtime WAV streaming, use the Python proxy version in AI_Model_Studio_Portal/server.py. Text, vision, image, video, and ASR are wired for direct page execution.",
    ].join("\n");
    setOutput("omniOutput", output);
    addRun("Omni Realtime Check", model, `${sourceLang} to ${targetLang}`, output);
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
      const task = await directTask(taskId);
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
