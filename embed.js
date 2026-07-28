/* Colourbox AI chat-widget.
 * Indsæt på et vilkårligt site:
 *   <script src="https://ai-chat-nine-silk.vercel.app/embed.js" defer></script>
 * Boblen åbner en iframe med widget.html fra samme origin som scriptet.
 */
(function () {
  "use strict";
  if (window.__cbxWidgetLoaded) return;
  window.__cbxWidgetLoaded = true;

  var script = document.currentScript;
  var origin;
  try {
    origin = new URL(script.src).origin;
  } catch (e) {
    origin = "https://ai-chat-nine-silk.vercel.app";
  }

  var open = false;

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Åbn Colourbox AI-chat");
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border:none;" +
    "border-radius:50%;background:#0D68E8;color:#fff;cursor:pointer;z-index:2147483000;" +
    "box-shadow:0 6px 24px rgba(12,21,48,.25);display:flex;align-items:center;" +
    "justify-content:center;transition:transform .15s ease,background .15s";
  btn.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48H40a16 16 0 0 0-16 16v160a15.84 15.84 0 0 0 9.25 14.5A16.05 16.05 0 0 0 40 240a15.89 15.89 0 0 0 10.25-3.78l.09-.07L83 208h133a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16Z"/></svg>';
  btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
  btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };

  var panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;bottom:90px;right:20px;width:380px;height:560px;" +
    "max-width:calc(100vw - 24px);max-height:calc(100vh - 110px);" +
    "border-radius:14px;overflow:hidden;z-index:2147483000;display:none;" +
    "box-shadow:0 20px 60px rgba(12,21,48,.28);border:1px solid #E4E5E9;background:#FEFDFD";

  var frame = null;
  function toggle(show) {
    open = show === undefined ? !open : show;
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.src = origin + "/widget.html";
      frame.title = "Colourbox AI-chat";
      frame.style.cssText = "width:100%;height:100%;border:0;display:block";
      panel.appendChild(frame);
    }
    panel.style.display = open ? "block" : "none";
    btn.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/></svg>'
      : '<svg width="26" height="26" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48H40a16 16 0 0 0-16 16v160a15.84 15.84 0 0 0 9.25 14.5A16.05 16.05 0 0 0 40 240a15.89 15.89 0 0 0 10.25-3.78l.09-.07L83 208h133a16 16 0 0 0 16-16V64a16 16 0 0 0-16-16Z"/></svg>';
  }

  btn.addEventListener("click", function () { toggle(); });
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data === "cbx-widget-close") toggle(false);
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
