/* Voice-lag for Colourbox AI chat.
 * STT: optager via MediaRecorder og transskriberer gennem /api/transcribe
 *      (Mistral Voxtral, EU-hostet) — ingen lyd til tredjelande.
 * TTS: browserens lokale speechSynthesis-stemmer (dansk hvis tilgængelig).
 */
(function () {
  "use strict";
  var recorder = null;
  var stream = null;
  var chunks = [];
  var state = "idle"; // idle | recording | transcribing
  var maxTimer = null;

  function pickMime() {
    var candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  function cleanup() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    recorder = null;
    chunks = [];
    clearTimeout(maxTimer);
  }

  function transcribe(blob, opts) {
    state = "transcribing";
    opts.onState(state);
    var headers = { "Content-Type": "application/octet-stream", "x-audio-type": blob.type || "audio/webm" };
    if (opts.widget) headers["x-widget"] = "1";
    fetch("/api/transcribe", { method: "POST", headers: headers, body: blob })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
      })
      .then(function (res) {
        state = "idle";
        opts.onState(state);
        if (!res.ok) throw new Error(res.j.error || "Transskription fejlede.");
        if (!res.j.text) throw new Error("Kunne ikke høre noget — prøv igen.");
        opts.onText(res.j.text);
      })
      .catch(function (e) {
        state = "idle";
        opts.onState(state);
        if (opts.onError) opts.onError(e.message);
      });
  }

  function toggle(opts) {
    if (state === "transcribing") return;
    if (state === "recording") {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      return;
    }
    stopSpeak();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (opts.onError) opts.onError("Din browser understøtter ikke mikrofon-optagelse.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      var mime = pickMime();
      recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      chunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        if (blob.size < 1000) {
          state = "idle";
          opts.onState(state);
          if (opts.onError) opts.onError("Optagelsen var for kort.");
          return;
        }
        transcribe(blob, opts);
      };
      recorder.start();
      state = "recording";
      opts.onState(state);
      maxTimer = setTimeout(function () {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }, 60000);
    }).catch(function () {
      if (opts.onError) opts.onError("Kunne ikke få adgang til mikrofonen — tjek tilladelser.");
    });
  }

  // ---- TTS ----
  function cleanForSpeech(text) {
    return String(text)
      .replace(/https?:\/\/\S+/g, "")           // URLs
      .replace(/```[\s\S]*?```/g, " kodeblok ") // code blocks
      .replace(/[#*_`>|]/g, "")                 // markdown symbols
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
  }

  function pickVoice() {
    var voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    for (var i = 0; i < voices.length; i++) {
      if (/^da([-_]|$)/i.test(voices[i].lang)) return voices[i];
    }
    return null;
  }

  function speak(text, onDone) {
    if (!window.speechSynthesis) return;
    stopSpeak();
    var clean = cleanForSpeech(text);
    if (!clean) return;
    var u = new SpeechSynthesisUtterance(clean);
    var v = pickVoice();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || "da-DK";
    u.rate = 1.05;
    if (onDone) u.onend = onDone;
    speechSynthesis.speak(u);
  }

  function stopSpeak() {
    if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel();
  }

  // Preload voice list (Chrome loads async).
  if (window.speechSynthesis) speechSynthesis.getVoices();

  window.CbxVoice = { toggle: toggle, speak: speak, stopSpeak: stopSpeak,
                      getState: function () { return state; } };
})();
