window.MdReader = window.MdReader || {};

window.MdReader.markdown = (function () {
  var markedInstance = new marked.Marked(
    markedHighlight.markedHighlight({
      langPrefix: "hljs language-",
      highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
    })
  );

  markedInstance.setOptions({
    breaks: true,
    gfm: true,
  });

  function render(markdownString) {
    return markedInstance.parse(markdownString || "");
  }

  function renderToPreview() {
    var ui = window.MdReader.ui;
    ui.elements.preview.innerHTML = render(ui.elements.editor.value);
  }

  return { render, renderToPreview };
})();
