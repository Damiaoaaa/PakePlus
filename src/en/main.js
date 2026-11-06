const CATS = [
  { key: "learnedmen", label: "Learned Men", y: 30.1, h: 11.9 },
  { key: "teachers", label: "Teachers", y: 42.0, h: 10.8 },
  { key: "artists", label: "Artists", y: 54.0, h: 10.7 },
  { key: "craftspeople", label: "Craftpeople", y: 64.7, h: 10.8 },
  { key: "merchants", label: "Merchants", y: 76.6, h: 10.7 }
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof Peer !== "undefined") {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("PeerJS load failed"));
    document.head.appendChild(el);
  });
}

function send(body) {
  Bus.publish(body).catch(() => {});
}

function hit(label, x, y, w, h, onClick) {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.style.left = x + "%";
  el.style.top = y + "%";
  el.style.width = w + "%";
  el.style.height = h + "%";
  el.addEventListener("click", onClick);
  return el;
}

const hits = document.getElementById("hits");
hits.append(hit("HOME", 3.5, 1.2, 11.0, 3.6, () => send("home")));
hits.append(hit("中文", 83.4, 1.4, 6.4, 3.6, () => {
  send("lang zh");
  location.href = "../zh/";
}));
CATS.forEach((cat) => {
  hits.append(hit(cat.label, 10.4, cat.y, 79.2, cat.h, () => send("list en " + cat.key)));
});

document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  if (event.key === "f" || event.key === "F") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
});

loadScript("../shared/peerjs.min.js")
  .then(() => Bus.ensureHost())
  .catch(() => {});
