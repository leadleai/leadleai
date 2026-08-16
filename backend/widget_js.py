"""
The self-contained embeddable widget script served at GET /widget.js.

A business drops ONE tag on their site:

    <script src="https://YOUR-BACKEND/widget.js"
            data-widget-key="THEIR_PUBLIC_WIDGET_KEY" async></script>

The script is dependency-free and renders inside a Shadow DOM so the host page's
CSS can never leak in (or out). It discovers the API base from its own <script>
src, so it always talks back to the backend that served it. Everything it does is
against the three PUBLIC endpoints (/config, /message, /capture) keyed by the
widget_key — no user auth, no secrets in the browser.

Kept as a Python string (not a file on disk) so it ships with the backend image
and is served from memory with a long cache header.
"""

WIDGET_JS = r"""
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    script = all[all.length - 1];
  }
  var KEY = script.getAttribute("data-widget-key");
  if (!KEY) { console.error("[widget] missing data-widget-key on <script>"); return; }

  // API base = the origin the script was served from (override with data-api).
  var API = script.getAttribute("data-api");
  if (!API) { try { API = new URL(script.src).origin; } catch (e) { API = ""; } }
  API = (API || "").replace(/\/+$/, "");

  var SESSION_STORE = "leadle_widget_session_" + KEY;
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  var sessionId;
  try {
    sessionId = localStorage.getItem(SESSION_STORE) || uuid();
    localStorage.setItem(SESSION_STORE, sessionId);
  } catch (e) { sessionId = uuid(); }

  function api(path, body) {
    return fetch(API + "/api/widget/" + encodeURIComponent(KEY) + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error((data && data.detail) || ("HTTP " + r.status));
        return data;
      });
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmt(s) { return esc(s).replace(/\n/g, "<br>"); }

  api("/config").then(function (cfg) {
    if (!cfg || cfg.is_active === false) return;
    render(cfg);
  }).catch(function (e) { console.warn("[widget] disabled:", e.message); });

  function render(cfg) {
    var color = cfg.primary_color || "#4f46e5";
    var greeting = cfg.greeting_message || "Hi! How can I help you today?";
    var fields = Array.isArray(cfg.capture_fields) && cfg.capture_fields.length
      ? cfg.capture_fields : ["name", "email", "phone"];
    var biz = cfg.business_name || "Chat";

    var host = document.createElement("div");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

    var css =
      ":host,*{box-sizing:border-box}" +
      ".wrap{position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      ".bubble{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;" +
        "box-shadow:0 6px 24px rgba(0,0,0,.24);display:flex;align-items:center;justify-content:center;" +
        "background:" + color + ";color:#fff;transition:transform .15s ease}" +
      ".bubble:hover{transform:scale(1.06)}" +
      ".bubble svg{width:28px;height:28px}" +
      ".panel{position:absolute;bottom:76px;right:0;width:370px;max-width:calc(100vw - 40px);" +
        "height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;overflow:hidden;" +
        "box-shadow:0 12px 48px rgba(0,0,0,.28);display:none;flex-direction:column}" +
      ".panel.open{display:flex}" +
      ".hd{background:" + color + ";color:#fff;padding:16px 18px;font-weight:600;font-size:15px;" +
        "display:flex;align-items:center;justify-content:space-between}" +
      ".hd button{background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;opacity:.85}" +
      ".hd button:hover{opacity:1}" +
      ".body{flex:1;overflow-y:auto;padding:16px;background:#f7f7f8}" +
      ".msg{max-width:82%;padding:10px 13px;border-radius:14px;margin-bottom:10px;font-size:14px;" +
        "line-height:1.45;white-space:normal;word-wrap:break-word}" +
      ".msg.bot{background:#fff;color:#1a1a1a;border:1px solid #ececec;border-bottom-left-radius:4px}" +
      ".msg.me{background:" + color + ";color:#fff;margin-left:auto;border-bottom-right-radius:4px}" +
      ".typing{display:inline-flex;gap:4px;padding:12px 14px}" +
      ".typing span{width:7px;height:7px;border-radius:50%;background:#bbb;animation:b 1.2s infinite}" +
      ".typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}" +
      "@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}" +
      ".ft{border-top:1px solid #ececec;padding:10px;background:#fff}" +
      ".row{display:flex;gap:8px;align-items:flex-end}" +
      "textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:12px;padding:10px 12px;font-size:14px;" +
        "font-family:inherit;max-height:100px;outline:none}" +
      "textarea:focus{border-color:" + color + "}" +
      ".send{background:" + color + ";border:none;color:#fff;width:40px;height:40px;border-radius:50%;" +
        "cursor:pointer;display:flex;align-items:center;justify-content:center;flex:0 0 auto}" +
      ".send:disabled{opacity:.5;cursor:default}" +
      ".send svg{width:18px;height:18px}" +
      ".lead{display:block;width:100%;text-align:center;background:none;border:none;color:" + color + ";" +
        "cursor:pointer;font-size:12.5px;padding:6px;margin-bottom:6px;font-weight:600}" +
      ".form{padding:14px;background:#fff;border-top:1px solid #ececec}" +
      ".form h4{margin:0 0 8px;font-size:14px;color:#1a1a1a}" +
      ".form input{width:100%;border:1px solid #ddd;border-radius:10px;padding:9px 11px;font-size:14px;margin-bottom:8px;outline:none}" +
      ".form input:focus{border-color:" + color + "}" +
      ".form button{width:100%;background:" + color + ";border:none;color:#fff;padding:10px;border-radius:10px;" +
        "cursor:pointer;font-size:14px;font-weight:600}" +
      ".form .cancel{background:#eee;color:#444;margin-top:6px}" +
      ".ok{padding:14px;text-align:center;font-size:14px;color:#1a7a3c}" +
      ".powered{text-align:center;font-size:11px;color:#aaa;padding:4px 0 8px}";

    var style = document.createElement("style"); style.textContent = css; root.appendChild(style);

    var wrap = document.createElement("div"); wrap.className = "wrap"; root.appendChild(wrap);
    wrap.innerHTML =
      '<div class="panel" part="panel">' +
        '<div class="hd"><span>' + esc(biz) + '</span><button aria-label="Close" data-x>&times;</button></div>' +
        '<div class="body"></div>' +
        '<div class="foot"></div>' +
      '</div>' +
      '<button class="bubble" aria-label="Open chat">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 5.94 2 10.8c0 2.5 1.2 4.75 3.13 6.34L4.2 21.5l4.2-2.2c1.13.32 2.34.5 3.6.5 5.52 0 10-3.94 10-8.8S17.52 2 12 2z"/></svg>' +
      '</button>';

    var panel = wrap.querySelector(".panel");
    var bubble = wrap.querySelector(".bubble");
    var body = wrap.querySelector(".body");
    var foot = wrap.querySelector(".foot");

    function scroll() { body.scrollTop = body.scrollHeight; }
    function addMsg(who, text) {
      var d = document.createElement("div"); d.className = "msg " + who;
      d.innerHTML = fmt(text); body.appendChild(d); scroll(); return d;
    }

    var started = false;
    function open() {
      panel.classList.add("open");
      if (!started) { started = true; addMsg("bot", greeting); renderComposer(); }
    }
    function close() { panel.classList.remove("open"); }
    bubble.addEventListener("click", function () { panel.classList.contains("open") ? close() : open(); });
    wrap.querySelector("[data-x]").addEventListener("click", close);

    var sending = false;
    function renderComposer() {
      foot.innerHTML =
        '<div class="ft">' +
          '<button class="lead" data-lead>Leave your details</button>' +
          '<div class="row">' +
            '<textarea rows="1" placeholder="Type your message…" data-input></textarea>' +
            '<button class="send" data-send aria-label="Send">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-6l8-2.5-8-2.5v-6l19 8.5-19 8.5z"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="powered">Powered by AI</div>';
      var input = foot.querySelector("[data-input]");
      var sendBtn = foot.querySelector("[data-send]");
      foot.querySelector("[data-lead]").addEventListener("click", showForm);
      function autos() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 100) + "px"; }
      input.addEventListener("input", autos);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
      });
      sendBtn.addEventListener("click", send);
      input.focus();

      function send() {
        var text = input.value.trim();
        if (!text || sending) return;
        sending = true; sendBtn.disabled = true;
        addMsg("me", text); input.value = ""; autos();
        var t = document.createElement("div"); t.className = "msg bot";
        t.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
        body.appendChild(t); scroll();
        api("/message", { session_id: sessionId, message: text }).then(function (res) {
          t.remove(); addMsg("bot", (res && res.reply) || "…");
        }).catch(function () {
          t.remove();
          addMsg("bot", "Sorry, something went wrong. Please try again or leave your details.");
        }).then(function () { sending = false; sendBtn.disabled = false; input.focus(); });
      }
    }

    function showForm() {
      var labels = { name: "Your name", email: "Email address", phone: "Phone number" };
      var types = { name: "text", email: "email", phone: "tel" };
      var inputs = fields.map(function (f) {
        return '<input data-f="' + f + '" type="' + (types[f] || "text") + '" placeholder="' + labels[f] + '">';
      }).join("");
      foot.innerHTML =
        '<div class="form">' +
          '<h4>Leave your details and we\'ll get back to you</h4>' + inputs +
          '<button data-submit>Send</button>' +
          '<button class="cancel" data-cancel>Cancel</button>' +
        '</div>';
      foot.querySelector("[data-cancel]").addEventListener("click", renderComposer);
      var submitBtn = foot.querySelector("[data-submit]");
      submitBtn.addEventListener("click", function () {
        var payload = { session_id: sessionId };
        fields.forEach(function (f) {
          var el = foot.querySelector('[data-f="' + f + '"]');
          if (el && el.value.trim()) payload[f] = el.value.trim();
        });
        if (!payload.email && !payload.phone) { alert("Please add an email or phone number."); return; }
        submitBtn.disabled = true; submitBtn.textContent = "Sending…";
        api("/capture", payload).then(function () {
          foot.innerHTML = '<div class="ok">Thanks! We\'ll be in touch soon. ✅</div>';
          setTimeout(renderComposer, 2600);
        }).catch(function (e) {
          submitBtn.disabled = false; submitBtn.textContent = "Send";
          alert(e.message || "Could not submit. Please try again.");
        });
      });
    }
  }
})();
"""
