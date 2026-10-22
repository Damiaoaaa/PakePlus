(function () {
  var exportState = { running: false, label: "导出" };

  function findVm(vm) {
    if (!vm) return null;
    if (vm.$refs && vm.$refs.showView && Array.isArray(vm.viewData)) return vm;
    var children = vm.$children || [];
    for (var i = 0; i < children.length; i++) {
      var hit = findVm(children[i]);
      if (hit) return hit;
    }
    return null;
  }

  function appVm() {
    var root = document.querySelector("#app");
    return root && root.__vue__ ? findVm(root.__vue__) : null;
  }

  function viewer() {
    var canvas = document.querySelector("#app canvas");
    return canvas && canvas.__viewer;
  }

  function stampBoards(data) {
    var view = viewer();
    if (!view || !data) return;
    var meshes = view.m_Scene.children.filter(function (child) { return child.isMesh; });
    if (meshes.length < data.length) return;
    for (var i = 0; i < data.length; i++) meshes[i].__dataId = data[i].DataID;
  }

  function hookView(vm) {
    if (!vm) return;
    var show = vm.$refs.showView;
    if (!show || show.__exportHooked) return;
    show.__exportHooked = true;
    var orig = show.setData;
    show.setData = function (data) {
      var result = orig.apply(this, arguments);
      stampBoards(Array.isArray(data) ? data : []);
      return result;
    };
    if (vm.viewData && vm.viewData.length) stampBoards(vm.viewData);
  }

  function visibleData(vm) {
    var view = viewer();
    var ids = new Set();
    if (view) {
      view.m_Scene.children.forEach(function (child) {
        if (child.__dataId != null) ids.add(child.__dataId);
      });
    }
    if (!ids.size) return vm.viewData.slice();
    return vm.viewData.filter(function (board) { return ids.has(board.DataID); });
  }

  function saveCamera(view) {
    var cam = view.m_Camera;
    return {
      target: cam.m_Target.clone(),
      direction: cam.m_Direction.clone(),
      viewHeight: cam.m_ViewHeight,
      roX: cam.m_Orbit.m_RoX,
      roZ: cam.m_Orbit.RoZ
    };
  }

  function restoreCamera(view, saved) {
    var cam = view.m_Camera;
    cam.m_Target.copy(saved.target);
    cam.m_Direction.copy(saved.direction);
    cam.m_ViewHeight = saved.viewHeight;
    cam.m_Orbit.m_RoX = saved.roX;
    cam.m_Orbit.RoZ = saved.roZ;
    cam.UpdateUp();
    cam.Update();
    view.m_bNeedUpdate = true;
  }

  var EXPORT_SIZE = 1920;

  function openShot(view) {
    var renderer = view.m_Render;
    var cam = view.m_Camera;
    var shot = {
      view: view,
      renderer: renderer,
      cam: cam,
      ratio: renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1),
      width: view._Width,
      height: view._Height,
      scratch: document.createElement("canvas"),
      out: document.createElement("canvas")
    };
    shot.scratchCtx = shot.scratch.getContext("2d", { willReadFrequently: true });
    shot.outCtx = shot.out.getContext("2d");
    applyShotSize(shot);
    return shot;
  }

  function applyShotSize(shot) {
    shot.renderer.setPixelRatio(1);
    shot.renderer.setSize(EXPORT_SIZE, EXPORT_SIZE, false);
    shot.view._Width = EXPORT_SIZE;
    shot.view._Height = EXPORT_SIZE;
    shot.cam.SetSize(EXPORT_SIZE, EXPORT_SIZE);
    if (shot.scratch.width !== EXPORT_SIZE) {
      shot.scratch.width = EXPORT_SIZE;
      shot.scratch.height = EXPORT_SIZE;
    }
  }

  function setDimensionsVisible(view, visible) {
    var scene = view && view.m_Scene;
    if (!scene) return;
    scene.children.forEach(function (child) {
      if (!child.isGroup || !child.traverse) return;
      child.traverse(function (node) { node.visible = visible; });
    });
  }

  function frameShot(shot) {
    applyShotSize(shot);
    setDimensionsVisible(shot.view, false);
    try {
      if (shot.view.ViewToSwiso) shot.view.ViewToSwiso();
      shot.view.ZoomAll();
    } catch (error) {
      setDimensionsVisible(shot.view, true);
      if (shot.view.ViewToSwiso) shot.view.ViewToSwiso();
      shot.view.ZoomAll();
    }
    if (!(shot.cam.m_ViewHeight > 0)) shot.cam.m_ViewHeight = 10;
    shot.cam.m_ViewHeight *= 1.04;
    shot.cam.Update();
  }

  function closeShot(shot) {
    if (!shot) return;
    setDimensionsVisible(shot.view, true);
    var width = shot.width > 0 ? shot.width : 300;
    var height = shot.height > 0 ? shot.height : 150;
    shot.renderer.setPixelRatio(shot.ratio);
    shot.renderer.setSize(width, height, false);
    shot.view._Width = width;
    shot.view._Height = height;
    shot.cam.SetSize(width, height);
    shot.cam.Update();
    shot.view.m_bNeedUpdate = true;
    shot.scratch.width = 1;
    shot.scratch.height = 1;
    shot.out.width = 1;
    shot.out.height = 1;
  }

  function cropCanvas(shot, glCanvas) {
    var src = shot.scratch;
    var ctx = shot.scratchCtx;
    var width = glCanvas.width || EXPORT_SIZE;
    var height = glCanvas.height || EXPORT_SIZE;
    if (src.width !== width || src.height !== height) {
      src.width = width;
      src.height = height;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(glCanvas, 0, 0, width, height);
    var pixels = ctx.getImageData(0, 0, width, height).data;
    var minX = width;
    var minY = height;
    var maxX = -1;
    var maxY = -1;
    var stride = 4;
    for (var y = 0; y < height; y += stride) {
      var row = y * width;
      for (var x = 0; x < width; x += stride) {
        var i = (row + x) * 4;
        if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) {
      minX = 0;
      minY = 0;
      maxX = width - 1;
      maxY = height - 1;
    }
    var pad = Math.round(Math.max(width, height) * 0.015) + stride;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    var cw = maxX - minX + 1;
    var ch = maxY - minY + 1;
    var side = Math.max(cw, ch);
    var out = shot.out;
    out.width = side;
    out.height = side;
    shot.outCtx.fillStyle = "#ffffff";
    shot.outCtx.fillRect(0, 0, side, side);
    if (side <= width && side <= height) {
      var sx = Math.round((minX + maxX) / 2 - side / 2);
      var sy = Math.round((minY + maxY) / 2 - side / 2);
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx + side > width) sx = width - side;
      if (sy + side > height) sy = height - side;
      shot.outCtx.drawImage(src, sx, sy, side, side, 0, 0, side, side);
    } else {
      shot.outCtx.drawImage(src, minX, minY, cw, ch, Math.round((side - cw) / 2), Math.round((side - ch) / 2), cw, ch);
    }
    return out;
  }

  function pngBytes(canvas) {
    var url = canvas.toDataURL("image/png");
    var bin = atob(url.slice(url.indexOf(",") + 1));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function grab(shot) {
    shot.view.Render();
    return pngBytes(cropCanvas(shot, shot.renderer.domElement));
  }

  function pause() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function safeName(name) {
    var text = String(name == null ? "" : name).replace(/[\\/:*?"<>|]/g, "_").trim();
    return text || "未命名";
  }

  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }

  function concat(parts) {
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

  function u16(n) { return new Uint8Array([n & 255, (n >> 8) & 255]); }
  function u32(n) { return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]); }

  function zipEntry(name, data, offset) {
    var nameBytes = new TextEncoder().encode(name);
    var crc = crc32(data);
    var bytes = concat([
      u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data
    ]);
    var central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]);
    return { bytes: bytes, central: central };
  }

  function zipEnd(central, count, offset) {
    return concat([
      central,
      u32(0x06054b50), u16(0), u16(0), u16(count), u16(count),
      u32(central.length), u32(offset), u16(0)
    ]);
  }

  function buildZip(files) {
    var parts = [];
    var central = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var entry = zipEntry(files[i].name, files[i].data, offset);
      parts.push(entry.bytes);
      central.push(entry.central);
      offset += entry.bytes.length;
    }
    parts.push(zipEnd(concat(central), files.length, offset));
    return new Blob(parts, { type: "application/zip" });
  }

  function browserDownload(bytes, filename, type) {
    var blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: type || "application/zip" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
  }

  function joinPath(dir, filename) {
    var base = String(dir || "");
    var sep = base.indexOf("\\") >= 0 ? "\\" : "/";
    if (base && base.slice(-1) !== "\\" && base.slice(-1) !== "/") base += sep;
    return base + filename;
  }

  function hasTauri() {
    return !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
  }

  var WRITE_CHUNK = 512 * 1024;

  function writeOnce(path, bytes, append) {
    return window.__TAURI__.core.invoke("plugin:fs|write_file", bytes, {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(append ? { append: true } : {})
      }
    });
  }

  function writeRaw(path, bytes, append) {
    if (!(window.__ffAppend && bytes && bytes.length > WRITE_CHUNK)) return writeOnce(path, bytes, append);
    var parts = [];
    for (var offset = 0; offset < bytes.length; offset += WRITE_CHUNK) parts.push(bytes.slice(offset, offset + WRITE_CHUNK));
    var chain = writeOnce(path, parts[0], !!append);
    for (var i = 1; i < parts.length; i++) {
      (function (part) {
        chain = chain.then(function () { return writeOnce(path, part, true); });
      })(parts[i]);
    }
    return chain;
  }

  function desktopDirectory() {
    return window.__TAURI__.core.invoke("plugin:path|resolve_directory", { directory: 18 });
  }

  var exportDirKey = "ff-export-dir";

  function savedExportDir() {
    try { return String(localStorage.getItem(exportDirKey) || "").trim(); } catch (error) { return ""; }
  }

  function pathButtonTitle(dir) {
    return dir ? ("保存到：" + dir + "。点击可更换") : "选择导出保存文件夹，未选择时保存到桌面";
  }

  function rememberExportDir(dir) {
    var text = String(dir || "").trim();
    try {
      if (text) localStorage.setItem(exportDirKey, text);
      else localStorage.removeItem(exportDirKey);
    } catch (error) {}
    var button = document.querySelector(".export-path-btn");
    if (button) button.title = pathButtonTitle(text);
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

  function pathFromDialog(picked) {
    if (picked == null || picked === false) return "";
    if (typeof picked === "string") return picked.trim();
    if (Array.isArray(picked)) return picked.length ? pathFromDialog(picked[0]) : "";
    if (typeof picked === "object" && typeof picked.path === "string") return picked.path.trim();
    return "";
  }

  async function pickDirectory() {
    var current = savedExportDir();
    if (!hasTauri()) {
      var typed = window.prompt("请输入导出保存文件夹的完整路径", current || "");
      return typed ? typed.trim() : "";
    }
    var invoke = window.__TAURI__.core.invoke;
    var options = { directory: true, multiple: false, title: "选择导出保存文件夹" };
    if (current) options.defaultPath = current;
    var payloads = [options, { options: options }];
    for (var i = 0; i < payloads.length; i++) {
      try {
        var picked = pathFromDialog(await invoke("plugin:dialog|open", payloads[i]));
        if (picked) return picked;
        return "";
      } catch (error) {}
    }
    var script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = '选择导出保存文件夹'",
      "$dialog.ShowNewFolderButton = $true",
      "$current = " + psQuote(current),
      "if ($current -and (Test-Path -LiteralPath $current)) { $dialog.SelectedPath = $current }",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }"
    ].join("\n");
    try {
      var output = await runCommand("powershell.exe -STA -NoProfile -EncodedCommand " + encodeCommand(script));
      return String(output || "").replace(/^\uFEFF/, "").trim();
    } catch (error2) {
      return "";
    }
  }

  async function chooseExportDir() {
    var picked = await pickDirectory();
    if (!picked) return "";
    rememberExportDir(picked);
    alert("之后将保存到：" + picked);
    return picked;
  }

  async function dirExists(dir) {
    if (!dir || !hasTauri()) return false;
    try {
      var found = await window.__TAURI__.core.invoke("plugin:fs|exists", { path: dir });
      if (found === true || found === "true") return true;
    } catch (error) {}
    try {
      var output = await runCommand("if (Test-Path -LiteralPath " + psQuote(dir) + " -PathType Container) { 'yes' }");
      return String(output || "").indexOf("yes") >= 0;
    } catch (error2) {
      return false;
    }
  }

  async function ensureDir(dir) {
    if (!dir) return false;
    if (await dirExists(dir)) return true;
    if (!hasTauri()) return false;
    var invoke = window.__TAURI__.core.invoke;
    var payloads = [
      { path: dir, options: { recursive: true } },
      { path: dir, recursive: true }
    ];
    for (var i = 0; i < payloads.length; i++) {
      try { await invoke("plugin:fs|mkdir", payloads[i]); } catch (error) {}
    }
    try {
      await runCommand("New-Item -ItemType Directory -Force -Path " + psQuote(dir) + " | Out-Null");
    } catch (error2) {}
    if (await dirExists(dir)) return true;
    var probe = joinPath(dir, ".ff-dir-probe");
    try {
      await writeOnce(probe, new Uint8Array([1]), false);
    } catch (error3) {
      return false;
    }
    try { await runCommand("Remove-Item -LiteralPath " + psQuote(probe) + " -Force"); } catch (cleanupError) {}
    return true;
  }

  async function exportDirectory() {
    var custom = savedExportDir();
    if (custom && await ensureDir(custom)) return custom;
    if (custom) {
      rememberExportDir("");
      alert("原来的保存文件夹无法使用，这次改存到桌面：" + custom);
    }
    var desktop = await desktopDirectory();
    if (!await ensureDir(desktop)) throw new Error("找不到桌面文件夹");
    return desktop;
  }

  function desktopFile(filename) {
    return exportDirectory().then(function (dir) {
      return joinPath(dir, filename);
    });
  }

  function ZipOut(path) {
    this.path = path;
    this.offset = 0;
    this.central = [];
    this.count = 0;
    this.append = false;
  }

  ZipOut.prototype.add = function (name, data) {
    var entry = zipEntry(name, data, this.offset);
    var self = this;
    return writeRaw(this.path, entry.bytes, this.append).then(function () {
      self.append = true;
      self.central.push(entry.central);
      self.offset += entry.bytes.length;
      self.count += 1;
    });
  };

  ZipOut.prototype.finish = function () {
    if (!this.count) return Promise.resolve();
    return writeRaw(this.path, zipEnd(concat(this.central), this.count, this.offset), true);
  };

  function writeDesktopFile(bytes, filename) {
    if (!hasTauri()) return Promise.resolve("");
    var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return desktopFile(filename).then(function (full) {
      return writeRaw(full, data, false).then(function () { return full; });
    });
  }

  function psQuote(value) {
    return "'" + String(value == null ? "" : value).replace(/'/g, "''") + "'";
  }

  function runCommand(command) {
    return window.__TAURI__.core.invoke("run_command", { command: command });
  }

  async function appendSupported(dir) {
    if (window.__ffAppend != null) return window.__ffAppend;
    var path = joinPath(dir, ".ff-write-test.bin");
    var ok = false;
    try {
      await writeRaw(path, new Uint8Array([1, 2, 3, 4]), false);
      await writeRaw(path, new Uint8Array([5, 6]), true);
      var length = parseInt(String(await runCommand("(Get-Item -LiteralPath " + psQuote(path) + ").Length")).trim(), 10);
      ok = length === 6;
    } catch (error) {
      ok = false;
    }
    try { await runCommand("Remove-Item -LiteralPath " + psQuote(path) + " -Force"); } catch (cleanupError) {}
    window.__ffAppend = ok;
    return ok;
  }

  function FolderOut(dir, root) {
    this.dir = dir;
    this.root = root || dir;
    this.made = new Set();
    this.count = 0;
  }

  FolderOut.prototype.add = function (name, data) {
    var full = joinPath(this.dir, String(name).replace(/\//g, "\\"));
    var slash = Math.max(full.lastIndexOf("\\"), full.lastIndexOf("/"));
    var parent = slash > 0 ? full.slice(0, slash) : this.dir;
    var self = this;
    var ready = this.made.has(parent) ? Promise.resolve(true) : ensureDir(parent).then(function (ok) {
      if (ok) self.made.add(parent);
      return ok;
    });
    return ready.then(function (ok) {
      if (!ok) throw new Error("无法创建文件夹");
      return writeRaw(full, data, false);
    }).catch(function () {
      var flat = joinPath(self.root, String(name).replace(/[\\/]/g, "_"));
      return ensureDir(self.root).then(function (ok) {
        if (!ok) throw new Error("无法创建文件夹：" + self.root);
        return writeRaw(flat, data, false);
      });
    }).then(function () {
      self.count += 1;
    });
  };

  async function openSink(filename) {
    var dir = await exportDirectory();
    var labelDir = dir;
    if (await appendSupported(dir)) return { kind: "zip", out: new ZipOut(joinPath(dir, filename)), label: joinPath(dir, filename) };
    var folder = joinPath(dir, filename.replace(/\.zip$/i, ""));
    if (await ensureDir(folder)) labelDir = folder;
    else folder = dir;
    return { kind: "folder", out: new FolderOut(folder, dir), label: labelDir };
  }

  function download(bytes, filename, type) {
    return writeDesktopFile(bytes, filename).then(function (saved) {
      if (saved) {
        alert("已保存到：" + saved);
        return;
      }
      browserDownload(bytes, filename, type);
    }).catch(function () {
      browserDownload(bytes, filename, type);
    });
  }

  function boardRows(vm) {
    var byId = new Map();
    vm.viewData.forEach(function (board) {
      var list = byId.get(board.DataID);
      if (!list) byId.set(board.DataID, list = []);
      list.push(board);
    });
    var rows = [];
    var seen = new Set();
    (vm.blocks || []).forEach(function (row) {
      if (seen.has(row.DataID) || !byId.has(row.DataID)) return;
      seen.add(row.DataID);
      rows.push({ row: row, parts: byId.get(row.DataID) });
    });
    byId.forEach(function (parts, id) {
      if (seen.has(id)) return;
      rows.push({ row: parts[0], parts: parts });
    });
    return rows;
  }

  function fileName(row, index, used) {
    var base = safeName(row.ItemNo || row.CustomNumber || ("板" + (index + 1)));
    var name = base + ".png";
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    var extra = base + "_" + (index + 1) + ".png";
    used.add(extra);
    return extra;
  }

  function setBusy(active, text) {
    exportState.running = !!text;
    document.querySelectorAll(".export-btn, .export-current-btn, .export-path-btn").forEach(function (btn) {
      btn.disabled = exportState.running;
      if (btn.classList.contains("export-path-btn")) return;
      if (btn === active && text) btn.textContent = text;
      if (!exportState.running) btn.textContent = btn.classList.contains("export-current-btn") ? "当前" : "导出";
    });
  }

  function waitFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(resolve); });
  }

  function packageNo(vm) {
    var info = vm.orderInfo || {};
    var remark = String(info.Remark == null ? "" : info.Remark).trim();
    return safeName(remark || vm.orderNo || "订单");
  }

  function cabinetName(vm) {
    var box = (vm.boxList || []).find(function (item) { return String(item.BoxID) === String(vm.selBoxID); });
    return packageNo(vm) + "_" + safeName(box && box.Name || "柜体");
  }

  function uniqueFolder(name, used) {
    var base = safeName(name);
    var folder = base;
    var n = 2;
    while (used.has(folder)) {
      folder = base + "_" + n;
      n += 1;
    }
    used.add(folder);
    return folder;
  }

  function solidFileName(vm, box, used) {
    var info = vm.orderInfo || {};
    var customer = safeName(info.Consignee || "终端客户");
    var customNo = safeName(info.CustomOrderNo || "自定义单号");
    var cabinet = safeName(box && box.Name || "柜体");
    var base = customer + "-" + customNo + "-" + cabinet;
    var name = base + ".png";
    var n = 2;
    while (used.has(name)) {
      name = base + "_" + n + ".png";
      n += 1;
    }
    used.add(name);
    return name;
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function loadCabinet(vm, boxId) {
    if (String(vm.selBoxID) === String(boxId) && vm.viewData && vm.viewData.length) return true;
    for (var attempt = 0; attempt < 3; attempt++) {
      await sleep(attempt ? 800 * attempt : 300);
      var origAlert = window.alert;
      window.alert = function () {};
      try {
        await vm.getViewData("", "", boxId);
      } catch (error) {
        console.error(error);
      } finally {
        window.alert = origAlert;
      }
      await waitFrame();
      if (String(vm.selBoxID) === String(boxId) && vm.viewData && vm.viewData.length) return true;
    }
    return false;
  }

  function errorText(error) {
    if (error == null || error === "") return "未知错误";
    if (typeof error === "string") return error;
    if (error.message) return String(error.message);
    try { return JSON.stringify(error); } catch (ignored) { return String(error); }
  }

  function meshCount(view) {
    var count = 0;
    if (!view || !view.m_Scene) return 0;
    view.m_Scene.children.forEach(function (child) { if (child.isMesh) count += 1; });
    return count;
  }

  function clearHighlight(view) {
    if (!view || !view.oldMesh) return;
    if (view._Settings && view._Settings.boardMaterial) view.oldMesh.material = view._Settings.boardMaterial;
    view.oldMesh = null;
  }

  function ensureScene(show, vm) {
    var need = (vm.viewData || []).length;
    if (need && meshCount(viewer()) >= need) return;
    show.setData(vm.viewData, true);
  }

  function prepareExport() {
    var vm = appVm();
    var view = viewer();
    if (!vm || !view || !vm.viewData || !vm.viewData.length) {
      alert("没有可导出的板件");
      return null;
    }
    return { vm: vm, view: view, show: vm.$refs.showView, selected: vm.selectedBlockNo };
  }

  function restoreExport(ctx) {
    if (!ctx) return;
    try {
      if (ctx.reload && ctx.visible) ctx.show.setData(ctx.visible, true);
      if (ctx.camera) restoreCamera(ctx.view, ctx.camera);
      if (ctx.selected && ctx.vm.blockDic) {
        var dataId = ctx.vm.blockDic[ctx.selected];
        if (dataId == null) dataId = ctx.vm.blockDic[Number(ctx.selected)];
        if (dataId != null) ctx.show.selectBlock(dataId);
      }
      ctx.view.Render();
    } catch (restoreError) {
      console.error(restoreError);
    }
  }

  async function onExport() {
    if (exportState.running) return;
    var ctx = prepareExport();
    if (!ctx) return;
    var boxes = (ctx.vm.boxList || []).slice();
    if (!boxes.length) boxes = [{ BoxID: ctx.vm.selBoxID, Name: "柜体" }];
    var button = document.querySelector(".export-btn");
    window.__ffExporting = true;
    setBusy(button, "导出中");
    var sink = null;
    try {
      ctx.camera = saveCamera(ctx.view);
      ctx.visible = visibleData(ctx.vm);
      ctx.reload = true;
      ctx.saved = {
        selBoxID: ctx.vm.selBoxID,
        blocks: ctx.vm.blocks,
        viewData: ctx.vm.viewData,
        blockDic: ctx.vm.blockDic,
        dataDic: ctx.vm.dataDic,
        orderInfo: ctx.vm.orderInfo
      };
      ctx.viewTrans = !!ctx.vm.viewTrans;
      ctx.shot = openShot(ctx.view);
      var memoryFiles = [];
      var folders = new Set();
      var solidNames = new Set();
      var multi = boxes.length > 1;
      var zipName = multi ? packageNo(ctx.vm) + ".zip" : cabinetName(ctx.vm) + ".zip";
      var count = 0;
      var failures = [];
      async function store(name) {
        try {
          var bytes = grab(ctx.shot);
          if (hasTauri()) {
            if (!sink) sink = await openSink(zipName);
            await sink.out.add(name, bytes);
          } else {
            memoryFiles.push({ name: name, data: bytes });
          }
          count += 1;
        } catch (error) {
          failures.push(errorText(error));
          console.error(name, error);
        }
        await pause();
      }
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        if (String(ctx.vm.selBoxID) !== String(box.BoxID)) ctx.switched = true;
        setBusy(button, "柜" + (b + 1) + "/" + boxes.length);
        if (!await loadCabinet(ctx.vm, box.BoxID)) {
          failures.push((box.Name || "柜体") + " 图纸下载失败，已跳过");
          continue;
        }
        var live = viewer();
        if (live && ctx.shot.view !== live) {
          closeShot(ctx.shot);
          ctx.shot = openShot(live);
        }
        var show = ctx.vm.$refs.showView;
        try {
          ensureScene(show, ctx.vm);
          clearHighlight(viewer() || ctx.view);
          show.setMaterial({ transparent: false });
          frameShot(ctx.shot);
          await store("实体图/" + solidFileName(ctx.vm, box, solidNames));
          show.setMaterial({ transparent: ctx.viewTrans });
        } catch (error) {
          failures.push(errorText(error));
          console.error(error);
          continue;
        }
        var cabinetRows = boardRows(ctx.vm);
        var folder = multi ? uniqueFolder(box.Name || ("柜体" + (b + 1)), folders) : "";
        var used = new Set();
        for (var i = 0; i < cabinetRows.length; i++) {
          setBusy(button, (b + 1) + "/" + boxes.length + " " + (i + 1) + "/" + cabinetRows.length);
          try {
            ctx.vm.selectedBlockNo = cabinetRows[i].row.ItemNo;
            show.selectBlock(cabinetRows[i].row.DataID);
          } catch (error) {
            failures.push(errorText(error));
            console.error(error);
            continue;
          }
          var name = fileName(cabinetRows[i].row, i, used);
          if (folder) name = folder + "/" + name;
          await store(name);
        }
      }
      if (!count) {
        alert(failures.length ? ("导出失败：" + failures[0]) : "没有可导出的板件");
        return;
      }
      var savedLabel = "";
      closeShot(ctx.shot);
      ctx.shot = null;
      if (sink) {
        setBusy(button, "保存");
        if (sink.out.finish) await sink.out.finish();
        savedLabel = sink.label;
      } else {
        browserDownload(buildZip(memoryFiles), zipName);
      }
    } catch (error) {
      alert("导出失败：" + errorText(error));
      console.error(error);
    } finally {
      closeShot(ctx.shot);
      if (ctx.switched && ctx.saved) {
        ctx.vm.selBoxID = ctx.saved.selBoxID;
        ctx.vm.blocks = ctx.saved.blocks;
        ctx.vm.viewData = ctx.saved.viewData;
        ctx.vm.blockDic = ctx.saved.blockDic;
        ctx.vm.dataDic = ctx.saved.dataDic;
        ctx.vm.orderInfo = ctx.saved.orderInfo;
      }
      if (ctx.viewTrans != null && ctx.show && ctx.show.setMaterial) ctx.show.setMaterial({ transparent: ctx.viewTrans });
      restoreExport(ctx);
      window.__ffExporting = false;
      setBusy(null, "");
    }
    if (savedLabel) alert("已保存到：" + savedLabel + (failures && failures.length ? "\n其中 " + failures.length + " 项未导出：" + failures[0] : ""));
  }

  async function onExportCurrent() {
    if (exportState.running) return;
    var ctx = prepareExport();
    if (!ctx) return;
    var button = document.querySelector(".export-current-btn");
    window.__ffExporting = true;
    setBusy(button, "导出中");
    try {
      ctx.camera = saveCamera(ctx.view);
      ctx.visible = visibleData(ctx.vm);
      ctx.shot = openShot(ctx.view);
      frameShot(ctx.shot);
      var png = grab(ctx.shot);
      closeShot(ctx.shot);
      ctx.shot = null;
      await download(png, cabinetName(ctx.vm) + "_当前.png", "image/png");
    } catch (error) {
      alert("导出失败：" + errorText(error));
      console.error(error);
    } finally {
      closeShot(ctx.shot);
      restoreExport(ctx);
      window.__ffExporting = false;
      setBusy(null, "");
    }
  }

  function makeButton(className, text, title, action) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn white " + className;
    btn.textContent = text;
    btn.title = title;
    btn.disabled = exportState.running;
    btn.addEventListener("click", action);
    return btn;
  }

  function ensureButton() {
    hookView(appVm());
    var bar = document.querySelector(".toolbar");
    if (!bar || bar.querySelector(".export-btn")) return;
    bar.appendChild(makeButton("export-btn", "导出", "导出全部柜体的板件图，并另存每款柜体的整柜实体图", onExport));
    bar.appendChild(makeButton("export-current-btn", "当前", "导出当前状态下的完整图片", onExportCurrent));
    bar.appendChild(makeButton("export-path-btn", "路径", pathButtonTitle(savedExportDir()), function () {
      chooseExportDir().catch(function (error) {
        alert("选择文件夹失败：" + errorText(error));
        console.error(error);
      });
    }));
  }

  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
  ensureButton();
})();
