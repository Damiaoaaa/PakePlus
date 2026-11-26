(function () {
  var input = document.querySelector(".home-dialog-input");
  var toast = document.querySelector(".home-toast");
  var toastTimer = 0;
  var appName = "标签图纸转换器";

  function isViewer() {
    return /^#\/boxview\//.test(location.hash);
  }

  function sync() {
    if (document.title !== appName) document.title = appName;
    document.documentElement.classList.toggle("show-home", !isViewer());
    if (!isViewer()) input.focus();
  }

  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 1600);
  }

  function boardNo(raw) {
    var text = String(raw || "").trim();
    var query = text.match(/(?:bno|boardNo)=(\d+)/i);
    if (query) return query[1];
    var digits = text.match(/\d{4,}/);
    return digits ? digits[0] : "";
  }

  function confirmSearch() {
    var no = boardNo(input.value);
    if (!no) {
      showToast("请输入板件码");
      input.focus();
      return;
    }
    document.documentElement.classList.remove("show-home");
    location.hash = "/boxview/bno=" + no;
    window.dispatchEvent(new Event("resize"));
  }

  document.querySelector(".home-ok").addEventListener("click", confirmSearch);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") confirmSearch();
  });

  var fittedKey = "";

  function fitView() {
    if (window.__ffExporting || !isViewer()) return;
    var table = document.querySelector(".table-container");
    if (table) document.documentElement.style.setProperty("--table-h", table.offsetHeight + "px");
    var canvas = document.querySelector("#app canvas");
    var view = canvas && canvas.__viewer;
    if (!view || !view.m_DomEl || view.m_DomEl.clientHeight < 40) return;
    var count = view.m_Scene ? view.m_Scene.children.length : 0;
    var key = view.m_DomEl.clientWidth + "x" + view.m_DomEl.clientHeight + ":" + (count > 0 ? "1" : "0");
    if (key === fittedKey) return;
    fittedKey = key;
    view.OnSize();
    if (count > 0) {
      view.ZoomAll();
      view.m_Camera.m_ViewHeight *= 1.12;
      view.m_Camera.Update();
    }
    view.m_bNeedUpdate = true;
    if (view.Render) view.Render();
  }

  function ensureHomeButton() {
    if (!isViewer()) return;
    var bar = document.querySelector(".toolbar");
    if (!bar || bar.querySelector(".home-back")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn white home-back";
    btn.textContent = "首页";
    btn.addEventListener("click", function () {
      location.hash = "/home";
    });
    bar.insertBefore(btn, bar.firstChild);
  }

  new MutationObserver(function () {
    ensureHomeButton();
    fitView();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", function () {
    sync();
    fitView();
  });
  window.addEventListener("resize", fitView);
  sync();
  ensureHomeButton();
  fitView();
})();
