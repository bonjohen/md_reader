window.MdReader = window.MdReader || {};

window.MdReader.tts = (function () {
  var voices = [];
  var chunkQueue = [];
  var chunkIndex = 0;
  var totalChunks = 0;
  var currentUtterance = null;
  var keepAliveTimer = null;
  var speaking = false;
  var paused = false;
  var onFinishedCallback = null;
  var wakeLock = null;

  var PREMIUM_PATTERN = /Natural|Neural|Online|Premium|Enhanced/i;
  // Android Chrome has different TTS quirks than desktop Chrome:
  //  - The pause/resume keep-alive hack (a desktop-Chrome workaround for the
  //    15s cutoff) actively breaks Android: pause() can permanently stop the
  //    utterance and resume() may not restart it.
  //  - Calling speak() synchronously inside onend is racy on Android; the
  //    engine needs a small delay before accepting the next utterance.
  //  - The desktop 15s cutoff doesn't apply, so smaller chunks just create
  //    more transition points where Android can drop speech.
  var IS_ANDROID = /Android/i.test(navigator.userAgent);
  var CHUNK_MAX = IS_ANDROID ? 500 : 200;
  var NEXT_CHUNK_DELAY_MS = IS_ANDROID ? 80 : 0;

  // --- Voice management ---

  function isEnglish(voice) {
    return voice.lang.startsWith("en");
  }

  function isPremium(voice) {
    return PREMIUM_PATTERN.test(voice.name);
  }

  function loadVoices() {
    var ui = window.MdReader.ui;
    voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    var savedVoice = localStorage.getItem("mdreader-voice");
    ui.elements.voiceSelect.innerHTML = "";

    // Separate into premium and standard
    var premium = [];
    var standard = [];
    voices.forEach(function (voice, index) {
      var entry = { voice: voice, index: index };
      if (isPremium(voice)) {
        premium.push(entry);
      } else {
        standard.push(entry);
      }
    });

    // Sort: English first within each group, then alphabetical
    function sortVoices(arr) {
      arr.sort(function (a, b) {
        var aEn = isEnglish(a.voice) ? 0 : 1;
        var bEn = isEnglish(b.voice) ? 0 : 1;
        if (aEn !== bEn) return aEn - bEn;
        return a.voice.name.localeCompare(b.voice.name);
      });
    }
    sortVoices(premium);
    sortVoices(standard);

    function addGroup(label, entries) {
      if (!entries.length) return;
      var group = document.createElement("optgroup");
      group.label = label;
      entries.forEach(function (entry) {
        var opt = document.createElement("option");
        opt.value = String(entry.index);
        opt.textContent = entry.voice.name + " (" + entry.voice.lang + ")";
        group.appendChild(opt);
      });
      ui.elements.voiceSelect.appendChild(group);
    }

    addGroup("High Quality Voices", premium);
    addGroup("Standard Voices", standard);

    // Restore saved voice or auto-select best
    var restored = false;
    if (savedVoice) {
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].name === savedVoice) {
          ui.elements.voiceSelect.value = String(i);
          restored = true;
          break;
        }
      }
    }
    if (!restored) {
      // Auto-select: first premium English, else first premium, else first English
      var best =
        premium.find(function (e) { return isEnglish(e.voice); }) ||
        premium[0] ||
        standard.find(function (e) { return isEnglish(e.voice); }) ||
        standard[0];
      if (best) ui.elements.voiceSelect.value = String(best.index);
    }

    // Restore saved rate
    var savedRate = localStorage.getItem("mdreader-rate");
    if (savedRate) {
      ui.elements.rateInput.value = savedRate;
      ui.setRateDisplay(savedRate);
    }
  }

  function savePreferences() {
    var ui = window.MdReader.ui;
    var voice = voices[Number(ui.elements.voiceSelect.value)];
    if (voice) localStorage.setItem("mdreader-voice", voice.name);
    localStorage.setItem("mdreader-rate", ui.elements.rateInput.value);
  }

  // --- Text chunking ---

  function chunkText(text) {
    if (text.length <= CHUNK_MAX) return [text];

    var chunks = [];
    // Split on sentence boundaries first
    var sentences = text.split(/(?<=[.!?])\s+/);
    var current = "";

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      if (current.length + s.length + 1 <= CHUNK_MAX) {
        current = current ? current + " " + s : s;
      } else {
        if (current) chunks.push(current);
        // If single sentence exceeds max, split at commas or words
        if (s.length > CHUNK_MAX) {
          var parts = s.split(/,\s*/);
          var sub = "";
          for (var j = 0; j < parts.length; j++) {
            if (sub.length + parts[j].length + 2 <= CHUNK_MAX) {
              sub = sub ? sub + ", " + parts[j] : parts[j];
            } else {
              if (sub) chunks.push(sub);
              sub = parts[j];
            }
          }
          current = sub;
        } else {
          current = s;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // --- Screen wake lock ---
  // Keeps the device screen from auto-locking while speech is playing.
  // Cannot prevent a manual power-button lock — that's a hard browser
  // limitation: when the screen is actually locked, the page is suspended
  // and Web Speech stops. Wake lock auto-releases on visibility change,
  // so we re-acquire when the page becomes visible again while speaking.

  function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock) return;
    navigator.wakeLock
      .request("screen")
      .then(function (lock) {
        wakeLock = lock;
        lock.addEventListener("release", function () {
          if (wakeLock === lock) wakeLock = null;
        });
      })
      .catch(function () { /* ignored — wake lock is best-effort */ });
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    var lock = wakeLock;
    wakeLock = null;
    lock.release().catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && speaking) {
      acquireWakeLock();
    }
  });

  // --- Chrome keep-alive workaround ---

  function startKeepAlive() {
    stopKeepAlive();
    // Android: skip the pause/resume hack — it permanently stops speech there.
    if (IS_ANDROID) return;
    keepAliveTimer = setInterval(function () {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }

  function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  // --- Speech control ---

  function getReadableText() {
    var ui = window.MdReader.ui;
    return ui.elements.preview.innerText.trim() || ui.elements.editor.value.trim();
  }

  function stopSpeech() {
    speaking = false;
    paused = false;
    window.speechSynthesis.cancel();
    stopKeepAlive();
    releaseWakeLock();
    chunkQueue = [];
    chunkIndex = 0;
    totalChunks = 0;
    currentUtterance = null;
    window.MdReader.ui.setStatus("Speech stopped.");
  }

  function speakNextChunk() {
    var ui = window.MdReader.ui;

    if (chunkIndex >= chunkQueue.length) {
      stopKeepAlive();
      releaseWakeLock();
      speaking = false;
      ui.setStatus("Finished.");
      if (onFinishedCallback) onFinishedCallback();
      return;
    }

    var text = chunkQueue[chunkIndex];
    var utterance = new SpeechSynthesisUtterance(text);

    var voice = voices[Number(ui.elements.voiceSelect.value)];
    if (voice) utterance.voice = voice;
    utterance.rate = parseFloat(ui.elements.rateInput.value);

    utterance.onstart = function () {
      ui.setStatus("Speaking... (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onpause = function () {
      ui.setStatus("Paused. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onresume = function () {
      ui.setStatus("Resumed. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    };
    utterance.onend = function () {
      // Suppress advance if a pause cancelled us, or stopSpeech ran.
      if (paused || !speaking) return;
      chunkIndex++;
      if (NEXT_CHUNK_DELAY_MS > 0) {
        setTimeout(speakNextChunk, NEXT_CHUNK_DELAY_MS);
      } else {
        speakNextChunk();
      }
    };
    utterance.onerror = function (e) {
      if (e.error === "canceled" || e.error === "interrupted") return;
      if (paused || !speaking) return;
      ui.setStatus("Speech error: " + e.error);
      // Try next chunk on error
      chunkIndex++;
      if (NEXT_CHUNK_DELAY_MS > 0) {
        setTimeout(speakNextChunk, NEXT_CHUNK_DELAY_MS);
      } else {
        speakNextChunk();
      }
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function speak() {
    var ui = window.MdReader.ui;
    var text = getReadableText();
    if (!text) {
      ui.setStatus("Nothing to read.");
      return;
    }

    stopSpeech();
    savePreferences();

    chunkQueue = chunkText(text);
    chunkIndex = 0;
    totalChunks = chunkQueue.length;
    speaking = true;
    paused = false;

    acquireWakeLock();
    startKeepAlive();
    speakNextChunk();
  }

  function pauseSpeech() {
    if (!speaking || paused) return;
    paused = true;
    var ui = window.MdReader.ui;
    if (IS_ANDROID) {
      // Android Chrome's pause() halts speech but resume() doesn't restart
      // it. Fake pause by cancelling — onerror sees "canceled" and bails
      // without advancing because `paused` is set. Resume re-speaks the
      // current chunk from its start.
      window.speechSynthesis.cancel();
      ui.setStatus("Paused. (" + (chunkIndex + 1) + "/" + totalChunks + ")");
    } else {
      stopKeepAlive();
      window.speechSynthesis.pause();
    }
  }

  function resumeSpeech() {
    if (!speaking || !paused) return;
    paused = false;
    if (IS_ANDROID) {
      // Re-speak the current chunk from the start (no way to know intra-
      // chunk position with Web Speech).
      speakNextChunk();
    } else {
      startKeepAlive();
      window.speechSynthesis.resume();
    }
  }

  function isSpeaking() {
    return speaking;
  }

  function setOnFinished(cb) {
    onFinishedCallback = cb;
  }

  function getProgress() {
    if (totalChunks === 0) return 0;
    return chunkIndex / totalChunks;
  }

  return {
    loadVoices,
    speak,
    stopSpeech,
    pauseSpeech,
    resumeSpeech,
    savePreferences,
    isSpeaking,
    setOnFinished,
    getProgress,
  };
})();
