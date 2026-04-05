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
  el.fileInput.addEventListener("change", files.handleFileSelect);
  el.folderBtn.addEventListener("click", files.openFolder);
  el.sampleBtn.addEventListener("click", files.loadSampleMarkdown);
  el.clearBtn.addEventListener("click", files.clearAll);

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

  // Auto-advance: when TTS finishes a file and auto-play is on, load next file and speak
  tts.setOnFinished(function () {
    ui.setProgress(1);
    if (el.autoPlayToggle.checked && files.hasNext()) {
      // Small delay so UI updates before starting next file
      setTimeout(function () {
        files.advanceToNext();
        // Wait for file to load before speaking
        setTimeout(function () {
          tts.speak();
        }, 300);
      }, 500);
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

  // Disable folder button if not supported
  if (!files.folderSupported()) {
    el.folderBtn.title = "Requires Chrome or Edge 86+";
    el.folderBtn.style.opacity = "0.5";
  }

  // Initial render
  md.renderToPreview();
})();
