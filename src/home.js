(function () {
  var input = document.querySelector(".home-dialog-input");
  var gateMsg = document.querySelector(".home-gate-msg");
  var gateId = document.querySelector(".home-gate-id");
  var gateUuid = document.querySelector(".home-gate-uuid");
  var toast = document.querySelector(".home-toast");
  var toastTimer = 0;
  var appName = "标签图纸转换器";
  var refreshBtn = document.querySelector(".home-refresh");
  var deviceOk = false;
  var deviceId = "";
  var checking = false;
  var checkTimer = 0;
  var checkWait = 10 * 60 * 1000;

  function isViewer() {
    return /^#\/boxview\//.test(location.hash);
  }

  function sync() {
    if (document.title !== appName) document.title = appName;
    document.documentElement.classList.toggle("show-home", !deviceOk || !isViewer());
    if (deviceOk && !isViewer()) input.focus();
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

  function invokeFn() {
    var tauri = window.__TAURI__;
    if (tauri && tauri.core && typeof tauri.core.invoke === "function") return tauri.core.invoke.bind(tauri.core);
    if (tauri && typeof tauri.invoke === "function") return tauri.invoke.bind(tauri);
    var internals = window.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === "function") return internals.invoke.bind(internals);
    return null;
  }

  function hasTauri() {
    return !!invokeFn();
  }

  function psQuote(value) {
    return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
  }

  function runCommand(command) {
    var invoke = invokeFn();
    if (!invoke) return Promise.reject(new Error("tauri"));
    return invoke("run_command", { command: command });
  }

  function readCookie(name) {
    var parts = ("; " + document.cookie).split("; " + name + "=");
    if (parts.length < 2) return "";
    try { return decodeURIComponent(parts.pop().split(";").shift() || ""); } catch (error) { return ""; }
  }

  function writeCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=315360000; SameSite=Lax";
  }

  function fallbackUuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  function rememberUuid(id) {
    var text = cleanId(id);
    if (!text) return "";
    writeCookie("ff-device-uuid", text);
    try { localStorage.setItem("ff-device-uuid", text); } catch (error) {}
    return text;
  }

  function localUuid() {
    var saved = cleanId(readCookie("ff-device-uuid"));
    if (!saved) {
      try { saved = cleanId(localStorage.getItem("ff-device-uuid")); } catch (error) {}
    }
    if (saved) return rememberUuid(saved);
    var id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : fallbackUuid();
    return rememberUuid(id);
  }

  function cleanId(text) {
    var match = String(text || "").replace(/^\uFEFF/, "").match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return match ? match[0] : "";
  }

  function serverUuid() {
    if (location.protocol === "file:") return Promise.resolve("");
    return fetch("/device-id", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("id");
      return res.json();
    }).then(function (data) {
      return cleanId(data && data.uuid);
    }, function () {
      return "";
    });
  }

  function savedUuid() {
    return serverUuid().then(function (id) {
      return rememberUuid(id || localUuid());
    });
  }

  function systemUuid() {
    var invoke = invokeFn();
    if (!invoke) return Promise.resolve("");
    return invoke("get_machine_uid", {}).then(function (value) {
      return cleanId(value);
    }, function () {
      return "";
    }).then(function (id) {
      if (id) return id;
      return runCommand("(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid").then(function (output) {
        return cleanId(output);
      }, function () {
        return "";
      });
    });
  }

  function machineUuid() {
    return systemUuid().then(function (id) {
      if (id) return rememberUuid(id);
      return savedUuid();
    });
  }

  var checkUrl = "http://123.56.204.77/check";

  function parseResult(text) {
    var raw = String(text || "").replace(/^\uFEFF/, "").trim();
    try {
      return JSON.parse(raw) || {};
    } catch (error) {
      var start = raw.indexOf("{");
      var end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { return JSON.parse(raw.slice(start, end + 1)) || {}; } catch (error2) {}
      }
      return {};
    }
  }

  function toU8(data) {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (Array.isArray(data)) return new Uint8Array(data);
    return new Uint8Array(0);
  }

  function concatBytes(parts) {
    var len = 0;
    for (var i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], offset);
      offset += parts[j].length;
    }
    return out;
  }

  function readBody(invoke, rid) {
    var parts = [];
    function step() {
      return invoke("plugin:http|fetch_read_body", { rid: rid }).then(function (data) {
        var bytes = toU8(data);
        if (!bytes.length) return concatBytes(parts);
        var last = bytes[bytes.length - 1];
        if (bytes.length > 1) parts.push(bytes.subarray(0, bytes.length - 1));
        if (last === 1) return concatBytes(parts);
        return step();
      });
    }
    return step();
  }

  function decodeB64(b64) {
    var clean = String(b64 || "").replace(/^\uFEFF/, "").replace(/[^A-Za-z0-9+/=]/g, "");
    if (!clean) return "";
    try {
      var bin = atob(clean);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
      return new TextDecoder("utf-8").decode(bytes);
    } catch (error) {
      return "";
    }
  }

  function encodeCommand(script) {
    var bytes = new Uint8Array(script.length * 2);
    for (var i = 0; i < script.length; i++) {
      var code = script.charCodeAt(i);
      bytes[i * 2] = code & 255;
      bytes[i * 2 + 1] = (code >> 8) & 255;
    }
    var binary = "";
    for (var j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
    return btoa(binary);
  }

  function tauriPost(body) {
    var invoke = window.__TAURI__.core.invoke;
    var data = Array.from(new TextEncoder().encode(body));
    return invoke("plugin:http|fetch", {
      clientConfig: {
        method: "POST",
        url: checkUrl,
        headers: [["content-type", "application/x-www-form-urlencoded"], ["accept", "application/json"]],
        data: data
      }
    }).then(function (first) {
      if (first && typeof first === "object" && first.status != null && Object.prototype.hasOwnProperty.call(first, "data")) {
        return new TextDecoder("utf-8").decode(toU8(first.data));
      }
      var rid = typeof first === "number" ? first : first && first.rid;
      if (rid == null) throw new Error("http");
      return invoke("plugin:http|fetch_send", { rid: rid }).then(function (sent) {
        return readBody(invoke, sent.rid).then(function (buf) {
          return new TextDecoder("utf-8").decode(buf);
        });
      });
    });
  }

  function shellPost(body) {
    var script = [
      "$ProgressPreference='SilentlyContinue'",
      "$text = ''",
      "try {",
      "  $resp = Invoke-WebRequest -UseBasicParsing -Method POST -Uri " + psQuote(checkUrl) + " -ContentType 'application/x-www-form-urlencoded' -Headers @{Accept='application/json'} -Body " + psQuote(body) + " -TimeoutSec 15",
      "  $text = [string]$resp.Content",
      "} catch {",
      "  $err = $_.Exception.Response",
      "  if ($err) {",
      "    $reader = New-Object IO.StreamReader($err.GetResponseStream())",
      "    $text = $reader.ReadToEnd()",
      "  }",
      "}",
      "if ($text) { [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))) }"
    ].join("\n");
    return runCommand("powershell.exe -NoProfile -EncodedCommand " + encodeCommand(script)).then(decodeB64);
  }

  function fetchPost(url, body) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 15000);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.text();
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function withCode(text) {
    var data = parseResult(text);
    if (data && data.code != null) return data;
    throw new Error("bad");
  }

  function postCheck(uuid) {
    var body = "uuid=" + encodeURIComponent(uuid);
    var steps = [];
    if (hasTauri()) {
      steps.push(function () { return tauriPost(body).then(withCode); });
      steps.push(function () { return shellPost(body).then(withCode); });
    }
    var local = location.hostname === "127.0.0.1" && String(location.port) === "8765";
    if (local) steps.push(function () { return fetchPost("/device-check", body).then(withCode); });
    steps.push(function () { return fetchPost(checkUrl, body).then(withCode); });
    function run(index) {
      if (index >= steps.length) return Promise.reject(new Error("network"));
      return steps[index]().catch(function () { return run(index + 1); });
    }
    return run(0);
  }

  function showGate(msg, uuid) {
    deviceOk = false;
    window.__ffDeviceOk = false;
    document.documentElement.classList.remove("device-pending");
    document.documentElement.classList.add("device-locked", "show-home");
    if (gateMsg) gateMsg.textContent = msg || "设备校验未通过";
    if (gateUuid) gateUuid.textContent = uuid || "";
    if (gateId) gateId.hidden = !uuid;
    if (isViewer()) location.hash = "/home";
  }

  function allowEntry() {
    deviceOk = true;
    window.__ffDeviceOk = true;
    document.documentElement.classList.remove("device-pending", "device-locked");
    sync();
  }

  function setRefreshBusy(busy) {
    if (!refreshBtn) return;
    refreshBtn.disabled = !!busy;
    refreshBtn.textContent = busy ? "正在刷新…" : "刷新设备状态";
  }

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () {
      runCheck({ silent: true });
    }, checkWait);
  }

  function runCheck(options) {
    var silent = !!(options && options.silent);
    var manual = !!(options && options.manual);
    if (checking) return;
    checking = true;
    clearTimeout(checkTimer);
    if (!silent && !manual) {
      document.documentElement.classList.add("device-pending", "show-home");
      if (gateMsg) gateMsg.textContent = "正在校验设备…";
      if (gateId) gateId.hidden = true;
    }
    if (manual) setRefreshBusy(true);
    var ready = deviceId ? Promise.resolve(deviceId) : machineUuid();
    ready.then(function (uuid) {
      deviceId = uuid;
      return postCheck(uuid).then(function (data) {
        if (data && Number(data.code) === 200) {
          var wasOk = deviceOk;
          allowEntry();
          if (manual && wasOk) showToast("设备状态正常");
          return;
        }
        showGate(data && data.msg, uuid);
      }, function () {
        if (silent && deviceOk) return;
        showGate("无法连接校验服务，请检查网络", deviceId);
      });
    }).then(function () {
      checking = false;
      setRefreshBusy(false);
      scheduleCheck();
    }, function () {
      checking = false;
      setRefreshBusy(false);
      scheduleCheck();
    });
  }

  function copyDeviceId() {
    var text = deviceId || (gateUuid && gateUuid.textContent) || "";
    if (!text) return;
    var done = function () { showToast("设备号已复制"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
      return;
    }
    fallbackCopy(text);
    done();
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) {}
    area.remove();
  }

  function confirmSearch() {
    if (!deviceOk) return;
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

  if (gateUuid) gateUuid.addEventListener("click", copyDeviceId);
  if (refreshBtn) refreshBtn.addEventListener("click", function () { runCheck({ manual: true }); });
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
  runCheck();
})();
