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

  // ---- Dansk sprog-primer ----
  // Voxtral kan ikke låses til dansk (language-param understøtter ikke 'da'),
  // og korte klip fejl-detekteres som andre sprog. Løsning: et kendt dansk
  // primer-klip sættes foran optagelsen, så sprogdetektionen kalibreres —
  // serveren klipper primer-teksten af transskriptionen igen.
  var primerPromise = null;
  function loadPrimer(ctx) {
    if (!primerPromise) {
      primerPromise = fetch("primer.wav")
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return ctx.decodeAudioData(ab); })
        .catch(function () { return null; });
    }
    return primerPromise;
  }

  function toMono16k(buffer) {
    var off = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16000) || 1, 16000);
    var src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    return off.startRendering();
  }

  function encodeWav(samples, rate) {
    var len = samples.length;
    var buf = new ArrayBuffer(44 + len * 2);
    var v = new DataView(buf);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, len * 2, true);
    for (var i = 0; i < len; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  function prepareUpload(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.OfflineAudioContext) return Promise.resolve(blob);
    var ctx = new AC();
    return blob.arrayBuffer()
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (user) {
        return loadPrimer(ctx).then(function (primer) {
          return Promise.all([primer ? toMono16k(primer) : null, toMono16k(user)]);
        });
      })
      .then(function (bufs) {
        var p = bufs[0], u = bufs[1];
        var out = new Float32Array((p ? p.length : 0) + u.length);
        if (p) out.set(p.getChannelData(0), 0);
        out.set(u.getChannelData(0), p ? p.length : 0);
        try { ctx.close(); } catch (e) { /* noop */ }
        return encodeWav(out, 16000);
      })
      .catch(function () {
        try { ctx.close(); } catch (e) { /* noop */ }
        return blob; // fallback: rå optagelse uden primer
      });
  }

  function transcribe(blob, opts) {
    state = "transcribing";
    opts.onState(state);
    prepareUpload(blob).then(function (upload) {
      var headers = { "Content-Type": "application/octet-stream", "x-audio-type": upload.type || "audio/webm" };
      if (opts.widget) headers["x-widget"] = "1";
      return fetch("/api/transcribe", { method: "POST", headers: headers, body: upload });
    })
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
