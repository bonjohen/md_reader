window.MdReader = window.MdReader || {};

(function () {
  var ui = window.MdReader.ui;
  var md = window.MdReader.markdown;
  var tts = window.MdReader.tts;
  var files = window.MdReader.files;
  var el = ui.elements;

  // Editor -> live preview
  el.editor.addEventListener("input", md.renderToPreview);

  // File operations
  el.pasteBtn.addEventListener("click", files.pasteFromClipboard);
  el.loadBtn.addEventListener("click", files.openBookPicker);

  // Playlist sidebar close
  el.playlistCloseBtn.addEventListener("click", ui.hidePlaylistPanel);

  // TTS controls
  el.speakBtn.addEventListener("click", tts.speak);
  el.pauseBtn.addEventListener("click", tts.pauseSpeech);
  el.resumeBtn.addEventListener("click", tts.resumeSpeech);
  el.stopBtn.addEventListener("click", tts.stopSpeech);

  // Rate slider
  el.rateInput.addEventListener("input", function () {
    ui.setRateDisplay(el.rateInput.value);
    tts.savePreferences();
  });

  // Voice selection persistence
  el.voiceSelect.addEventListener("change", tts.savePreferences);

  // Auto-advance: when TTS finishes a file and auto-play is on, load next file and speak.
  // Chained on the load promise so we never speak stale editor content (race that
  // caused the same chapter to replay when fetch was slower than the fixed delay).
  tts.setOnFinished(function () {
    ui.setProgress(1);
    if (el.autoPlayToggle.checked && files.hasNext()) {
      files.advanceToNext().then(function (loaded) {
        if (loaded) tts.speak();
      });
    }
  });

  // Update progress bar during speech
  setInterval(function () {
    if (tts.isSpeaking()) {
      ui.setProgress(tts.getProgress());
    }
  }, 500);

  // Voice loading
  window.speechSynthesis.onvoiceschanged = tts.loadVoices;
  tts.loadVoices();


  // Initial render
  md.renderToPreview();
})();
