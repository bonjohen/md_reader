window.MdReader = window.MdReader || {};

window.MdReader.ui = (function () {
  var elements = {
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    statusEl: document.getElementById("status"),
    pasteBtn: document.getElementById("pasteBtn"),
    loadBtn: document.getElementById("loadBtn"),
    speakBtn: document.getElementById("speakBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    resumeBtn: document.getElementById("resumeBtn"),
    stopBtn: document.getElementById("stopBtn"),
    voiceSelect: document.getElementById("voiceSelect"),
    rateInput: document.getElementById("rateInput"),
    rateValue: document.getElementById("rateValue"),
    autoPlayToggle: document.getElementById("autoPlayToggle"),
    playlistPanel: document.getElementById("playlistPanel"),
    playlistList: document.getElementById("playlistList"),
    playlistCloseBtn: document.getElementById("playlistCloseBtn"),
    editorTitle: document.getElementById("editorTitle"),
    progressFill: document.getElementById("progressFill"),
    bookDialog: document.getElementById("bookDialog"),
    bookDialogList: document.getElementById("bookDialogList"),
  };

  function showBookDialog(books, onPick) {
    elements.bookDialogList.innerHTML = "";
    books.forEach(function (book) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "book-dialog-item";
      btn.textContent = book.title;
      btn.addEventListener("click", function () {
        elements.bookDialog.close();
        onPick(book);
      });
      elements.bookDialogList.appendChild(btn);
    });
    if (typeof elements.bookDialog.showModal === "function") {
      elements.bookDialog.showModal();
    } else {
      elements.bookDialog.setAttribute("open", "");
    }
  }

  function setStatus(text) {
    elements.statusEl.textContent = text;
  }

  function setRateDisplay(value) {
    elements.rateValue.textContent = Number(value).toFixed(1);
  }

  function setProgress(fraction) {
    elements.progressFill.style.width = Math.round(fraction * 100) + "%";
  }

  function setEditorTitle(text) {
    elements.editorTitle.textContent = text;
  }

  // --- Playlist UI ---

  function showPlaylist(files, onItemClick) {
    elements.playlistList.innerHTML = "";
    files.forEach(function (name, index) {
      var item = document.createElement("div");
      item.className = "playlist-item";
      item.setAttribute("tabindex", "0");
      item.innerHTML =
        '<span class="file-icon">&#9834;</span>' +
        '<span class="file-name">' + escapeText(name) + '</span>';
      item.addEventListener("click", function () {
        onItemClick(index);
      });
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onItemClick(index);
        }
      });
      elements.playlistList.appendChild(item);
    });
    elements.playlistPanel.classList.remove("hidden");
  }

  function highlightPlaylistItem(index) {
    var items = elements.playlistList.querySelectorAll(".playlist-item");
    items.forEach(function (item, i) {
      item.classList.toggle("active", i === index);
    });
  }

  function togglePlaylistPanel() {
    elements.playlistPanel.classList.toggle("hidden");
  }

  function hidePlaylistPanel() {
    elements.playlistPanel.classList.add("hidden");
  }

  function escapeText(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  return {
    elements,
    setStatus,
    setRateDisplay,
    setProgress,
    setEditorTitle,
    showPlaylist,
    highlightPlaylistItem,
    togglePlaylistPanel,
    hidePlaylistPanel,
    showBookDialog,
  };
})();
