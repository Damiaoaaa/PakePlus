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

  function frameShot(shot) {
    applyShotSize(shot);
    if (shot.view.ViewToSwiso) shot.view.ViewToSwiso();
    shot.view.ZoomAll();
    shot.cam.m_ViewHeight *= 1.04;
    shot.cam.Update();
  }

  function closeShot(shot) {
    if (!shot) return;
    shot.renderer.setPixelRatio(shot.ratio);
    shot.renderer.setSize(shot.width || 0, shot.height || 0, false);
    shot.view._Width = shot.width;
    shot.view._Height = shot.height;
    shot.cam.SetSize(shot.width, shot.height);
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
    var out = shot.out;
    out.width = cw;
    out.height = ch;
    shot.outCtx.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
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

  function writeRaw(path, bytes, append) {
    var invoke = window.__TAURI__.core.invoke;
    return invoke("plugin:fs|write_file", bytes, {
      headers: {
        path: encodeURIComponent(path),
        options: JSON.stringify(append ? { append: true } : {})
      }
    });
  }

  function desktopFile(filename) {
    return window.__TAURI__.core.invoke("plugin:path|resolve_directory", { directory: 18 }).then(function (dir) {
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

  function FolderOut(dir) {
    this.dir = dir;
    this.made = new Set();
    this.count = 0;
  }

  FolderOut.prototype.add = function (name, data) {
    var full = joinPath(this.dir, String(name).replace(/\//g, "\\"));
    var slash = Math.max(full.lastIndexOf("\\"), full.lastIndexOf("/"));
    var parent = slash > 0 ? full.slice(0, slash) : this.dir;
    var self = this;
    var ready = this.made.has(parent) ? Promise.resolve() : runCommand("New-Item -ItemType Directory -Force -Path " + psQuote(parent) + " | Out-Null").then(function () {
      self.made.add(parent);
    });
    return ready.then(function () {
      return writeRaw(full, data, false);
    }).then(function () {
      self.count += 1;
    });
  };

  async function openSink(filename) {
    var dir = await window.__TAURI__.core.invoke("plugin:path|resolve_directory", { directory: 18 });
    if (await appendSupported(dir)) return { kind: "zip", out: new ZipOut(joinPath(dir, filename)), label: filename };
    var folder = filename.replace(/\.zip$/i, "");
    return { kind: "folder", out: new FolderOut(joinPath(dir, folder)), label: folder };
  }

  function download(bytes, filename, type) {
    return writeDesktopFile(bytes, filename).then(function (saved) {
      if (saved) {
        alert("已保存到桌面：" + filename);
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
    document.querySelectorAll(".export-btn, .export-current-btn").forEach(function (btn) {
      btn.disabled = exportState.running;
      if (btn === active && text) btn.textContent = text;
      if (!exportState.running) btn.textContent = btn.classList.contains("export-current-btn") ? "当前" : "导出";
    });
  }

  function waitFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(resolve); });
  }

  function cabinetName(vm) {
    var box = (vm.boxList || []).find(function (item) { return String(item.BoxID) === String(vm.selBoxID); });
    return safeName(vm.orderNo || "订单") + "_" + safeName(box && box.Name || "柜体");
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

  async function loadCabinet(vm, boxId) {
    if (String(vm.selBoxID) === String(boxId) && vm.viewData && vm.viewData.length) return true;
    await vm.getViewData("", "", boxId);
    await waitFrame();
    return String(vm.selBoxID) === String(boxId) && vm.viewData && vm.viewData.length > 0;
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
      var zipName = multi ? safeName(ctx.vm.orderNo || "订单") + ".zip" : cabinetName(ctx.vm) + ".zip";
      var count = 0;
      async function store(name) {
        var bytes = grab(ctx.shot);
        if (hasTauri()) {
          if (!sink) sink = await openSink(zipName);
          await sink.out.add(name, bytes);
        } else {
          memoryFiles.push({ name: name, data: bytes });
        }
        count += 1;
        await pause();
      }
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        if (String(ctx.vm.selBoxID) !== String(box.BoxID)) ctx.switched = true;
        setBusy(button, "柜" + (b + 1) + "/" + boxes.length);
        if (!await loadCabinet(ctx.vm, box.BoxID)) continue;
        var live = viewer();
        if (live && ctx.shot.view !== live) {
          closeShot(ctx.shot);
          ctx.shot = openShot(live);
        }
        var show = ctx.vm.$refs.showView;
        show.setData(ctx.vm.viewData, true);
        show.setMaterial({ transparent: false });
        frameShot(ctx.shot);
        await store("实体图/" + solidFileName(ctx.vm, box, solidNames));
        show.setMaterial({ transparent: ctx.viewTrans });
        var cabinetRows = boardRows(ctx.vm);
        var folder = multi ? uniqueFolder(box.Name || ("柜体" + (b + 1)), folders) : "";
        var used = new Set();
        for (var i = 0; i < cabinetRows.length; i++) {
          setBusy(button, (b + 1) + "/" + boxes.length + " " + (i + 1) + "/" + cabinetRows.length);
          ctx.vm.selectedBlockNo = cabinetRows[i].row.ItemNo;
          show.selectBlock(cabinetRows[i].row.DataID);
          var name = fileName(cabinetRows[i].row, i, used);
          if (folder) name = folder + "/" + name;
          await store(name);
        }
      }
      if (!count) {
        alert("没有可导出的板件");
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
      alert("导出失败");
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
    if (savedLabel) alert("已保存到桌面：" + savedLabel);
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
      alert("导出失败");
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
  }

  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
  ensureButton();
})();
