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

  function cropPng(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var src = document.createElement("canvas");
        src.width = img.width;
        src.height = img.height;
        var ctx = src.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, src.width, src.height);
        ctx.drawImage(img, 0, 0);
        var pixels = ctx.getImageData(0, 0, src.width, src.height).data;
        var minX = src.width;
        var minY = src.height;
        var maxX = -1;
        var maxY = -1;
        var stride = 2;
        for (var y = 0; y < src.height; y += stride) {
          for (var x = 0; x < src.width; x += stride) {
            var i = (y * src.width + x) * 4;
            if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < minX) {
          resolve(dataUrl);
          return;
        }
        var pad = Math.round(Math.max(src.width, src.height) * 0.015) + stride;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(src.width - 1, maxX + pad);
        maxY = Math.min(src.height - 1, maxY + pad);
        var cw = maxX - minX + 1;
        var ch = maxY - minY + 1;
        var out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out.getContext("2d").drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
        resolve(out.toDataURL("image/png"));
      };
      img.src = dataUrl;
    });
  }

  async function capture(view) {
    var renderer = view.m_Render;
    var cam = view.m_Camera;
    var oldRatio = renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1);
    var oldW = view._Width;
    var oldH = view._Height;
    var size = 2560;
    var url;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      view._Width = size;
      view._Height = size;
      cam.SetSize(size, size);
      view.ZoomAll();
      cam.m_ViewHeight *= 1.04;
      cam.Update();
      view.Render();
      url = renderer.domElement.toDataURL("image/png");
    } finally {
      renderer.setPixelRatio(oldRatio);
      renderer.setSize(oldW || 0, oldH || 0, false);
      view._Width = oldW;
      view._Height = oldH;
      cam.SetSize(oldW, oldH);
      cam.Update();
      view.m_bNeedUpdate = true;
    }
    return cropPng(url);
  }

  function dataUrlBytes(url) {
    var bin = atob(url.split(",")[1]);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
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

  function buildZip(files) {
    var locals = [];
    var central = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var name = new TextEncoder().encode(files[i].name);
      var data = files[i].data;
      var crc = crc32(data);
      var local = concat([
        u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
        name, data
      ]);
      locals.push(local);
      central.push(concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), name
      ]));
      offset += local.length;
    }
    var centralBytes = concat(central);
    var end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0)
    ]);
    return concat(locals.concat([centralBytes, end]));
  }

  function browserDownload(bytes, filename, type) {
    var blob = new Blob([bytes], { type: type || "application/zip" });
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

  function writeDesktopFile(bytes, filename) {
    var tauri = window.__TAURI__;
    if (!tauri || !tauri.core || !tauri.core.invoke) return Promise.resolve("");
    var invoke = tauri.core.invoke;
    var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    function write(path, options) {
      return invoke("plugin:fs|write_file", data, {
        headers: {
          path: encodeURIComponent(path),
          options: JSON.stringify(options || {})
        }
      }).catch(function () {
        return invoke("plugin:fs|write_file", {
          path: path,
          contents: Array.from(data),
          options: options || {}
        });
      });
    }
    return invoke("plugin:path|resolve_directory", { directory: 18 }).then(function (dir) {
      var full = joinPath(dir, filename);
      return write(full, {}).then(function () { return full; });
    }).catch(function () {
      return write(filename, { baseDir: 18 }).then(function () { return filename; });
    });
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
    setBusy(button, "导出中");
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
      var files = [];
      var folders = new Set();
      var solidNames = new Set();
      var multi = boxes.length > 1;
      for (var b = 0; b < boxes.length; b++) {
        var box = boxes[b];
        if (String(ctx.vm.selBoxID) !== String(box.BoxID)) ctx.switched = true;
        setBusy(button, "柜" + (b + 1) + "/" + boxes.length);
        if (!await loadCabinet(ctx.vm, box.BoxID)) continue;
        var show = ctx.vm.$refs.showView;
        show.setData(ctx.vm.viewData, true);
        show.setMaterial({ transparent: false });
        await waitFrame();
        var view = viewer();
        if (view && view.ViewToSwiso) view.ViewToSwiso();
        if (view && view.Render) view.Render();
        files.push({
          name: "实体图/" + solidFileName(ctx.vm, box, solidNames),
          data: dataUrlBytes(await capture(viewer()))
        });
        show.setMaterial({ transparent: ctx.viewTrans });
        var cabinetRows = boardRows(ctx.vm);
        var folder = multi ? uniqueFolder(box.Name || ("柜体" + (b + 1)), folders) : "";
        var used = new Set();
        for (var i = 0; i < cabinetRows.length; i++) {
          setBusy(button, (b + 1) + "/" + boxes.length + " " + (i + 1) + "/" + cabinetRows.length);
          ctx.vm.selectedBlockNo = cabinetRows[i].row.ItemNo;
          show.selectBlock(cabinetRows[i].row.DataID);
          await waitFrame();
          var name = fileName(cabinetRows[i].row, i, used);
          if (folder) name = folder + "/" + name;
          files.push({ name: name, data: dataUrlBytes(await capture(viewer())) });
        }
      }
      if (!files.length) {
        alert("没有可导出的板件");
        return;
      }
      var zipName = multi ? safeName(ctx.vm.orderNo || "订单") + ".zip" : cabinetName(ctx.vm) + ".zip";
      await download(buildZip(files), zipName);
    } catch (error) {
      alert("导出失败");
      console.error(error);
    } finally {
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
      setBusy(null, "");
    }
  }

  async function onExportCurrent() {
    if (exportState.running) return;
    var ctx = prepareExport();
    if (!ctx) return;
    var button = document.querySelector(".export-current-btn");
    setBusy(button, "导出中");
    try {
      ctx.camera = saveCamera(ctx.view);
      ctx.visible = visibleData(ctx.vm);
      var png = dataUrlBytes(await capture(ctx.view));
      await download(png, cabinetName(ctx.vm) + "_当前.png", "image/png");
    } catch (error) {
      alert("导出失败");
      console.error(error);
    } finally {
      restoreExport(ctx);
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
