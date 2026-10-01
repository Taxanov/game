/* BAVIX — интерактив и анимации. GSAP + ScrollTrigger + Lenis (с запасными CDN). */
(function () {
  "use strict";

  var doc = document.documentElement;
  var body = document.body;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var pad = function (n, l) { return String(n).padStart(l || 2, "0"); };

  body.classList.remove("is-loading");

  /* общие ссылки, которые заполнит boot() после загрузки GSAP */
  var api = { lenis: null, replayIntro: null, glitch: null };

  function goTo(target) {
    var el = typeof target === "string" ? $(target) : target;
    if (!el) return;
    if (api.lenis) api.lenis.scrollTo(el, { duration: 1.6 });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  /* =========================================================
     УКАЗАТЕЛЬ
     ========================================================= */
  var pointer = { x: innerWidth / 2, y: innerHeight / 2, speed: 0, active: false };
  var lastPX = pointer.x, lastPY = pointer.y;
  window.addEventListener("pointermove", function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; field.dirty = true;
  }, { passive: true });
  window.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") { pointer.active = false; field.dirty = true; } }, { passive: true });
  document.documentElement.addEventListener("pointerleave", function () { pointer.active = false; field.dirty = true; });

  /* =========================================================
     ФОН: сетка точек. Базовая сетка — одна заливка паттерном,
     поштучно рисуются только точки возле курсора и в волне клика.
     ========================================================= */
  var field = { dirty: true, ripples: [] };
  var canvas = $("#field");
  var ctx = canvas.getContext("2d");
  var dpr = 1, W = 0, H = 0, gap = 32, pats = {};
  /* цвета точек под фон секции: база, яркая полоса скана, подсветка у курсора */
  var DOTS = {
    dark: { base: "rgba(255,255,255,.10)", bright: "rgba(255,255,255,.30)", lit: "0,179,126" },
    light: { base: "rgba(17,17,17,.10)", bright: "rgba(17,17,17,.26)", lit: "0,130,91" },
    ash: { base: "rgba(17,17,17,.11)", bright: "rgba(17,17,17,.26)", lit: "0,130,91" },
    em: { base: "rgba(17,17,17,.16)", bright: "rgba(17,17,17,.34)", lit: "17,17,17" }
  };
  var bandEls = $$("main > [data-theme], .footer[data-theme]");
  var bands = [];
  function measureBands() {
    bands = bandEls.map(function (el) {
      var r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, theme: el.getAttribute("data-theme") };
    });
  }
  function themeAt(y) {
    for (var i = 0; i < bands.length; i++) if (y >= bands[i].top && y < bands[i].bottom) return bands[i].theme;
    return "dark";
  }
  var fieldMouse = { x: -9999, y: -9999 };
  var scrollY = window.scrollY, lastDrawnScroll = -1;

  function makePattern(color) {
    var c = document.createElement("canvas");
    c.width = c.height = Math.round(gap * dpr);
    var x = c.getContext("2d");
    x.fillStyle = color;
    var s = 1.3 * dpr;
    x.fillRect(c.width / 2 - s / 2, c.height / 2 - s / 2, s, s);
    var p = ctx.createPattern(c, "repeat");
    try { p.setTransform(new DOMMatrix().scale(1 / dpr)); } catch (e) { /* старые браузеры: точки чуть крупнее */ }
    return p;
  }
  function resizeField() {
    dpr = Math.min(window.devicePixelRatio || 1, finePointer ? 2 : 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gap = W < 700 ? 26 : 32;
    Object.keys(DOTS).forEach(function (k) { pats[k] = { base: makePattern(DOTS[k].base), bright: makePattern(DOTS[k].bright) }; });
    field.dirty = true;
  }
  resizeField();
  window.addEventListener("resize", resizeField);
  window.addEventListener("scroll", function () { scrollY = window.scrollY; field.dirty = true; }, { passive: true });

  function ripple(x, y) {
    field.ripples.push({ x: x, y: y, t: performance.now() });
    if (field.ripples.length > 4) field.ripples.shift();
    field.dirty = true;
  }

  var tick = 0;
  function drawField(now) {
    tick++;
    var R = W < 700 ? 110 : 190;
    var follow = pointer.active;
    fieldMouse.x = follow ? lerp(fieldMouse.x < -999 ? pointer.x : fieldMouse.x, pointer.x, .2) : -9999;
    fieldMouse.y = follow ? lerp(fieldMouse.y < -999 ? pointer.y : fieldMouse.y, pointer.y, .2) : -9999;

    var offY = -((scrollY * .35) % gap) + gap / 2;
    var scan = finePointer && !reduce;
    var scanY = (tick * 2.2) % (H + 400) - 200;

    field.ripples = field.ripples.filter(function (r) { return now - r.t < 1300; });
    var hasRipple = field.ripples.length > 0;

    /* на телефоне рисуем только когда что-то изменилось */
    if (!scan && !hasRipple && !field.dirty && scrollY === lastDrawnScroll) return;
    field.dirty = false; lastDrawnScroll = scrollY;

    measureBands();
    ctx.clearRect(0, 0, W, H);
    bands.forEach(function (b) {
      if (b.bottom < 0 || b.top > H) return;
      var p = pats[b.theme] || pats.dark;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, b.top, W, b.bottom - b.top); ctx.clip();
      ctx.translate(0, offY - gap / 2);
      ctx.fillStyle = p.base;
      ctx.fillRect(0, -gap, W, H + gap * 3);
      if (scan) {
        ctx.fillStyle = p.bright;
        ctx.globalAlpha = .45; ctx.fillRect(0, scanY - 140 - offY, W, 280);
        ctx.globalAlpha = .6; ctx.fillRect(0, scanY - 60 - offY, W, 120);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });

    /* зона, где точки нужно рисовать поштучно */
    var zones = [];
    if (fieldMouse.x > -999) zones.push({ x: fieldMouse.x, y: fieldMouse.y, r: R });
    field.ripples.forEach(function (rp) {
      var age = (now - rp.t) / 1300;
      zones.push({ x: rp.x, y: rp.y, r: age * 1300 * .95 + 60, ring: age * 1300 * .95, life: 1 - age });
    });
    if (!zones.length) return;

    var minX = W, minY = H, maxX = 0, maxY = 0;
    zones.forEach(function (z) {
      minX = Math.min(minX, z.x - z.r); maxX = Math.max(maxX, z.x + z.r);
      minY = Math.min(minY, z.y - z.r); maxY = Math.max(maxY, z.y + z.r);
    });
    minX = Math.max(0, minX - gap); maxX = Math.min(W, maxX + gap);
    minY = Math.max(-gap, minY - gap); maxY = Math.min(H + gap, maxY + gap);

    ctx.save();
    ctx.beginPath();
    zones.forEach(function (z) {
      if (z.ring === undefined) { ctx.moveTo(z.x + z.r + 2, z.y); ctx.arc(z.x, z.y, z.r + 2, 0, Math.PI * 2); }
      else { ctx.moveTo(z.x + z.r, z.y); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); }
    });
    ctx.clip();
    ctx.clearRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();

    var i0 = Math.floor((minX - gap / 2) / gap), i1 = Math.ceil((maxX - gap / 2) / gap);
    var j0 = Math.floor((minY - offY) / gap), j1 = Math.ceil((maxY - offY) / gap);
    for (var j = j0; j <= j1; j++) {
      var y = offY + j * gap;
      for (var i = i0; i <= i1; i++) {
        var x = gap / 2 + i * gap;
        var px = x, py = y, lit = 0, inside = false;
        for (var k = 0; k < zones.length; k++) {
          var z = zones[k], dx = x - z.x, dy = y - z.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d > z.r + 2) continue;
          inside = true;
          var f;
          if (z.ring === undefined) { f = Math.max(0, 1 - d / z.r); f *= f; px += dx / d * f * 18; py += dy / d * f * 18; lit = Math.max(lit, f); }
          else { f = Math.max(0, 1 - Math.abs(d - z.ring) / 70) * z.life; px += dx / d * f * 22; py += dy / d * f * 22; lit = Math.max(lit, f); }
        }
        if (!inside) continue;
        var s = 1.3 + lit * 1.8;
        var dc = DOTS[themeAt(y)] || DOTS.dark;
        ctx.fillStyle = lit > .02 ? "rgba(" + dc.lit + "," + (.15 + lit * .85).toFixed(3) + ")" : dc.base;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    }
  }

  var frameHooks = [];
  (function loop(now) {
    pointer.speed = lerp(pointer.speed, Math.hypot(pointer.x - lastPX, pointer.y - lastPY), .2);
    lastPX = pointer.x; lastPY = pointer.y;
    drawField(now || performance.now());
    for (var i = 0; i < frameHooks.length; i++) frameHooks[i]();
    requestAnimationFrame(loop);
  })();

  window.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".console, input, textarea")) return;
    ripple(e.clientX, e.clientY);
    if (api.glitch && e.target.closest(".hero")) api.glitch(1);
  }, { passive: true });

  /* =========================================================
     МЕЛОЧИ БЕЗ GSAP: часы, копирование, пауза анимаций вне экрана
     ========================================================= */
  var clock = $("#clock");
  var t0 = performance.now();
  setInterval(function () {
    var s = Math.floor((performance.now() - t0) / 1000);
    clock.textContent = "T+" + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
  }, 1000);

  $$(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var el = document.getElementById(btn.getAttribute("data-copy"));
      var text = el.textContent.trim();
      var label = btn.querySelector("span");
      var done = function (msg) { label.textContent = msg; setTimeout(function () { label.textContent = "Скопировать"; }, 1600); };
      var fallback = function () {
        var range = document.createRange(); range.selectNodeContents(el);
        var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        done("Выделено");
      };
      try { navigator.clipboard.writeText(text).then(function () { done("Скопировано"); }, fallback); }
      catch (err) { fallback(); }
    });
  });

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle("is-off", !en.isIntersecting); });
    }, { rootMargin: "100px" });
    $$(".card__viz, .app, .hero__scroll, .marquee, .scheme").forEach(function (el) { io.observe(el); });
  }

  /* текст-«дешифровка» */
  var glyphs = "_/\\<>[]{}#$%01=+*";
  function scramble(el, text) {
    var final = text || el.getAttribute("data-text") || el.textContent;
    if (!text) el.setAttribute("data-text", final);
    if (reduce) { el.textContent = final; return; }
    el._token = (el._token || 0) + 1;
    var token = el._token, frame = 0, total = final.length * 2 + 8;
    (function step() {
      if (token !== el._token) return;
      var out = "";
      for (var i = 0; i < final.length; i++) {
        if (final[i] === " " || i < (frame - 8) / 2) out += final[i];
        else out += glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = out;
      if (++frame <= total) requestAnimationFrame(step);
      else el.textContent = final;
    })();
  }

  /* =========================================================
     ДОК: текущая секция и прогресс страницы
     ========================================================= */
  var nav = $("#nav");
  var dock = $("#dock"), dockSec = $("#dockSec"), dockBar = $("#dockBar"), dockPct = $("#dockPct");
  var sections = [
    ["hero", "старт"], ["manifest", "о нас"], ["services", "услуги"], ["case", "кейс"],
    ["process", "этапы"], ["why", "почему мы"], ["builder", "конструктор"], ["contact", "контакты"]
  ].map(function (p) { return { el: document.getElementById(p[0]), name: p[1] }; });
  var curSec = "";
  var dockQueued = false;
  function updateDock() {
    dockQueued = false;
    var max = doc.scrollHeight - innerHeight;
    var p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    dockBar.style.transform = "scaleX(" + p + ")";
    dockPct.textContent = pad(Math.round(p * 100)) + "%";
    var name = sections[0].name;
    sections.forEach(function (s) { if (s.el && s.el.getBoundingClientRect().top < innerHeight * .45) name = s.name; });
    if (name !== curSec) { curSec = name; scramble(dockSec, name); }
    dock.classList.toggle("is-on", window.scrollY > innerHeight * .7 && p < .985);
    measureBands();
    var nt = themeAt(36);
    if (nav.getAttribute("data-theme") !== nt) nav.setAttribute("data-theme", nt);
  }
  window.addEventListener("scroll", function () { if (!dockQueued) { dockQueued = true; requestAnimationFrame(updateDock); } }, { passive: true });
  updateDock();

  /* =========================================================
     КОНСТРУКТОР СИСТЕМЫ
     ========================================================= */
  var MODS = {
    ai: { short: "ИИ-ассистент", log: "llm.agent → лиды, расчёты, КП" },
    crm: { short: "CRM", log: "crm.pipeline → сделки и статусы" },
    web: { short: "Сайт", log: "web.site → сайт и лендинги" },
    tg: { short: "Telegram", log: "tg.bot → уведомления 24/7" },
    wa: { short: "WhatsApp", log: "wa.send → КП в одно нажатие" },
    app: { short: "iOS/Android", log: "mobile.app → приложение" },
    data: { short: "Данные", log: "data.radar → сбор каждую ночь" },
    "int": { short: "Интеграции", log: "api.bridge → ваши сервисы и учёт" }
  };
  var chips = $$(".chip");
  var scheme = $("#scheme"), schemeLog = $("#schemeLog"), schemeStatus = $("#schemeStatus");
  var sendBtn = $("#builderSend"), modCount = $("#modCount"), note = $("#bizNote");
  var SVGNS = "http://www.w3.org/2000/svg";
  var svgEl = function (tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  var nodes = {};
  (function buildScheme() {
    var g = svgEl("g", {}, scheme);
    for (var x = 0; x <= 600; x += 30) svgEl("line", { x1: x, y1: 0, x2: x, y2: 420, "class": "grid" }, g);
    for (var y = 0; y <= 420; y += 30) svgEl("line", { x1: 0, y1: y, x2: 600, y2: y, "class": "grid" }, g);
    var links = svgEl("g", {}, scheme);
    var keys = Object.keys(MODS);
    keys.forEach(function (key, i) {
      var a = (-90 + i * 45) * Math.PI / 180;
      var nx = 300 + Math.cos(a) * 225, ny = 210 + Math.sin(a) * 158;
      var mx = (300 + nx) / 2 + Math.sin(a) * 26, my = (210 + ny) / 2 - Math.cos(a) * 26;
      var d = "M300 210 Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + nx.toFixed(1) + " " + ny.toFixed(1);
      var off = svgEl("path", { d: d, "class": "link link--off" }, links);
      var on = svgEl("path", { d: d, "class": "link", id: "link-" + key }, links);
      var len = on.getTotalLength();
      on.style.strokeDasharray = len; on.style.strokeDashoffset = len;
      on.style.transition = reduce ? "none" : "stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)";
      var pulse = svgEl("circle", { r: 3.5, "class": "pulse", opacity: 0 }, links);
      var motion = svgEl("animateMotion", { dur: (1.4 + i * .13).toFixed(2) + "s", repeatCount: "indefinite", path: d }, pulse);
      var ng = svgEl("g", { "class": "node", transform: "translate(" + nx.toFixed(1) + " " + ny.toFixed(1) + ")" }, scheme);
      var w = Math.max(84, MODS[key].short.length * 9.4 + 28);
      svgEl("rect", { x: -w / 2, y: -17, width: w, height: 34, rx: 8 }, ng);
      var t = svgEl("text", { x: 0, y: 4, "text-anchor": "middle" }, ng);
      t.textContent = MODS[key].short;
      nodes[key] = { on: on, off: off, len: len, pulse: pulse, g: ng, motion: motion };
    });
    var core = svgEl("g", { "class": "core", transform: "translate(300 210)" }, scheme);
    svgEl("rect", { x: -82, y: -22, width: 164, height: 44, rx: 10 }, core);
    var ct = svgEl("text", { x: 0, y: 5, "text-anchor": "middle" }, core);
    ct.textContent = "ВАШ БИЗНЕС";
  })();

  var logLines = [];
  function log(html) {
    logLines.push(html);
    if (logLines.length > 4) logLines.shift();
    schemeLog.innerHTML = logLines.join("\n");
  }
  function selected() { return chips.filter(function (c) { return c.getAttribute("aria-pressed") === "true"; }); }
  function setNode(key, on) {
    var n = nodes[key];
    n.on.style.strokeDashoffset = on ? 0 : n.len;
    n.pulse.setAttribute("opacity", on ? 1 : 0);
    n.g.classList.toggle("is-on", on);
  }
  function updateBuilder() {
    var sel = selected();
    var names = sel.map(function (c) { return c.textContent.trim(); });
    modCount.textContent = "модулей: " + sel.length;
    schemeStatus.textContent = sel.length ? "compiled · " + sel.length + " modules" : "waiting for modules";
    var msg = "Здравствуйте! Пишу с сайта BAVIX.\n" +
      (names.length ? "Хочу обсудить систему: " + names.join(", ") + "." : "Хочу обсудить проект.");
    var extra = note.value.trim();
    if (extra) msg += "\nО бизнесе: " + extra;
    sendBtn.href = "https://wa.me/77085071403?text=" + encodeURIComponent(msg);
  }
  chips.forEach(function (c) {
    var key = c.getAttribute("data-mod");
    setNode(key, c.getAttribute("aria-pressed") === "true");
    c.addEventListener("click", function () {
      var on = c.getAttribute("aria-pressed") !== "true";
      c.setAttribute("aria-pressed", String(on));
      setNode(key, on);
      log(on ? "<b>+</b> " + key + ": " + MODS[key].log + " <b>ok</b>" : "<span>−</span> " + key + ": отключён");
      updateBuilder();
    });
  });
  note.addEventListener("input", updateBuilder);
  selected().forEach(function (c) { var k = c.getAttribute("data-mod"); log("<b>+</b> " + k + ": " + MODS[k].log + " <b>ok</b>"); });
  updateBuilder();

  /* =========================================================
     ТЕРМИНАЛ
     ========================================================= */
  var con = $("#console"), out = $("#termOut"), form = $("#termForm"), input = $("#termInput");
  out.setAttribute("data-lenis-prevent", "");
  var history = [], hIdx = 0, greeted = false;
  var esc = function (s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function print(html, cls) {
    var line = document.createElement("div");
    if (cls) line.className = cls;
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }
  function printLines(lines, delay) {
    lines.forEach(function (l, i) { setTimeout(function () { print(l[0], l[1]); }, reduce ? 0 : i * (delay || 40)); });
  }
  var cmdBtn = function (c) { return '<button type="button" class="cmd" data-cmd="' + c + '">' + c + "</button>"; };
  var COMMANDS = {
    help: function () {
      printLines([
        ["Доступные команды:", "dim"],
        [cmdBtn("about") + " кто мы"],
        [cmdBtn("services") + " что делаем"],
        [cmdBtn("case") + " кейс: ИИ-радар новостроек"],
        [cmdBtn("builder") + " собрать свою систему"],
        [cmdBtn("contact") + " телефоны, WhatsApp, Instagram"],
        [cmdBtn("build") + " пересобрать логотип"],
        [cmdBtn("glitch") + " сломать страницу на секунду"],
        [cmdBtn("clear") + " очистить · " + cmdBtn("exit") + " закрыть"]
      ]);
    },
    about: function () {
      printLines([
        ["BAVIX — IT-студия: Бейбіт и Али."],
        ["CRM, сайты, приложения, Telegram-боты и ИИ-ассистенты."],
        ["Сначала разбираемся, как работает ваш бизнес, потом пишем код.", "dim"],
        ["Работаем по Казахстану, СНГ и миру.", "dim"]
      ]);
    },
    services: function () {
      printLines([
        ["<span class='acc'>crm</span>   CRM-системы: заявки, клиенты, оплаты"],
        ["<span class='acc'>ai</span>    ИИ-ассистенты: лиды, расчёты, КП"],
        ["<span class='acc'>web</span>   сайты, которые приводят заявки"],
        ["<span class='acc'>apps</span>  мобильные приложения iOS и Android"],
        ["<span class='acc'>bots</span>  Telegram-боты"],
        ["<span class='acc'>data</span>  радары и сбор данных 24/7"],
        ["→ подробнее: " + cmdBtn("goto services"), "dim"]
      ]);
    },
    "case": function () { print("Открываю кейс…", "dim"); closeConsole(); goTo("#case"); },
    builder: function () { print("Открываю конструктор…", "dim"); closeConsole(); goTo("#builder"); },
    contact: function () {
      printLines([
        ["Таханов Бейбіт   <span class='acc'>8 708 507 14 03</span>   <a href='https://wa.me/77085071403' target='_blank' rel='noopener'>whatsapp</a>"],
        ["Ермекұлы Али     <span class='acc'>8 705 401 19 43</span>   <a href='https://wa.me/77054011943' target='_blank' rel='noopener'>whatsapp</a>"],
        ["Instagram: <a href='https://instagram.com/bavix.kz' target='_blank' rel='noopener'>@bavix.kz</a>"],
        ["Звоните или пишите любому из нас.", "dim"]
      ]);
    },
    instagram: function () { print("<a href='https://instagram.com/bavix.kz' target='_blank' rel='noopener'>instagram.com/bavix.kz</a>"); },
    "goto": function (arg) {
      var map = { hero: "#hero", top: "#hero", about: "#manifest", services: "#services", "case": "#case", process: "#process", why: "#why", builder: "#builder", contact: "#contact" };
      if (!map[arg]) { print("goto: укажите раздел — " + Object.keys(map).join(", "), "err"); return; }
      closeConsole(); goTo(map[arg]);
    },
    build: function () {
      if (!api.replayIntro) { print("build: анимации недоступны в этом браузере", "err"); return; }
      print("$ init bavix…", "acc"); closeConsole();
      goTo("#hero");
      setTimeout(api.replayIntro, api.lenis ? 900 : 300);
    },
    glitch: function () {
      closeConsole();
      body.classList.remove("storm"); void body.offsetWidth; body.classList.add("storm");
      if (api.glitch) api.glitch(1);
      ripple(innerWidth / 2, innerHeight / 2);
      setTimeout(function () { body.classList.remove("storm"); }, 1300);
    },
    whoami: function () { print("гость. скоро — клиент BAVIX."); },
    sudo: function () { print("permission denied. Попробуйте " + cmdBtn("contact") + " — договоримся.", "err"); },
    ls: function () { print("about  services  case  builder  contact  instagram  build  glitch", "dim"); },
    clear: function () { out.innerHTML = ""; },
    exit: function () { closeConsole(); }
  };
  function run(raw) {
    var line = raw.trim();
    if (!line) return;
    history.push(line); hIdx = history.length;
    print("<span class='acc'>bavix:~$</span> " + esc(line));
    var parts = line.toLowerCase().split(/\s+/);
    var fn = COMMANDS[parts[0]];
    if (fn) fn(parts[1]);
    else print("command not found: " + esc(parts[0]) + ". Наберите " + cmdBtn("help"), "err");
  }
  function openConsole() {
    con.hidden = false;
    if (!greeted) {
      greeted = true;
      printLines([
        ["BAVIX terminal · v1.0", "acc"],
        ["Наберите команду или нажмите на неё. Начните с " + cmdBtn("help"), "dim"]
      ]);
    }
    if (api.lenis) api.lenis.stop();
    setTimeout(function () { input.focus(); }, 30);
  }
  function closeConsole() {
    con.hidden = true;
    if (api.lenis) api.lenis.start();
  }
  $("#termOpen").addEventListener("click", function () { if (con.hidden) openConsole(); else closeConsole(); });
  $("#termClose").addEventListener("click", closeConsole);
  form.addEventListener("submit", function (e) { e.preventDefault(); run(input.value); input.value = ""; });
  out.addEventListener("click", function (e) {
    var b = e.target.closest("button.cmd");
    if (b) { run(b.getAttribute("data-cmd")); input.focus(); }
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" && history.length) { hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx]; e.preventDefault(); }
    else if (e.key === "ArrowDown" && history.length) { hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; e.preventDefault(); }
    else if (e.key === "Tab") {
      e.preventDefault();
      var hit = Object.keys(COMMANDS).filter(function (c) { return c.indexOf(input.value.trim().toLowerCase()) === 0; });
      if (hit.length === 1) input.value = hit[0];
      else if (hit.length > 1) print(hit.join("  "), "dim");
    }
  });
  document.addEventListener("keydown", function (e) {
    var typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === "Escape" && !con.hidden) { closeConsole(); return; }
    if (!typing && (e.key === "/" || e.key === "`" || e.key === "ё")) { e.preventDefault(); openConsole(); }
  });

  /* =========================================================
     ЗАГРУЗКА БИБЛИОТЕК (локальные → запасные CDN)
     ========================================================= */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function loadFirst(list, test) {
    if (test()) return Promise.resolve();
    return list.reduce(function (p, src) {
      return p.then(function () { if (!test()) return loadScript(src).catch(function () {}); });
    }, Promise.resolve()).then(function () { if (!test()) throw new Error("lib"); });
  }
  loadFirst([
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js",
    "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
    "https://unpkg.com/gsap@3.12.5/dist/gsap.min.js"
  ], function () { return !!window.gsap; })
    .then(function () {
      return loadFirst([
        "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js",
        "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js",
        "https://unpkg.com/gsap@3.12.5/dist/ScrollTrigger.min.js"
      ], function () { return !!window.ScrollTrigger; });
    })
    .then(function () {
      if (!finePointer || reduce) return;
      return loadFirst([
        "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js",
        "https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"
      ], function () { return !!window.Lenis; }).catch(function () {});
    })
    .then(boot, function () { /* без GSAP страница остаётся статичной, но живой: фон, терминал, конструктор */ });

  /* =========================================================
     BOOT: всё, что требует GSAP
     ========================================================= */
  function boot() {
    var gsap = window.gsap;
    var ST = window.ScrollTrigger;
    gsap.registerPlugin(ST);
    ST.config({ ignoreMobileResize: true });

    var scrollVel = 0;
    var lenis = null;
    if (finePointer && !reduce && window.Lenis) {
      lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
      api.lenis = lenis;
      lenis.on("scroll", function (e) { ST.update(); scrollVel = e.velocity || 0; });
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var lastY = window.scrollY;
      frameHooks.push(function () { var y = window.scrollY; scrollVel = lerp(scrollVel, y - lastY, .3); lastY = y; });
    }
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        var target = id === "#top" ? $("#hero") : $(id);
        if (!target) return;
        e.preventDefault();
        goTo(target);
      });
    });

    /* ---------- курсор, магниты, наклон (только мышь) ---------- */
    var cursor = $(".cursor");
    if (finePointer) {
      body.classList.add("has-cursor");
      var dot = $(".cursor__dot"), ring = $(".cursor__ring"), clabel = $(".cursor__label");
      var dotX = gsap.quickSetter(dot, "x", "px"), dotY = gsap.quickSetter(dot, "y", "px");
      var ringX = gsap.quickTo(ring, "x", { duration: .45, ease: "power3" });
      var ringY = gsap.quickTo(ring, "y", { duration: .45, ease: "power3" });
      dotX(pointer.x); dotY(pointer.y); gsap.set(ring, { x: pointer.x, y: pointer.y });
      frameHooks.push(function () { dotX(pointer.x); dotY(pointer.y); ringX(pointer.x); ringY(pointer.y); });
      /* курсор перекрашивается под фон под ним */
      window.addEventListener("pointerover", function (e) {
        var t = e.target.closest && e.target.closest("[data-theme]");
        var th = t ? t.getAttribute("data-theme") : "dark";
        if (cursor.getAttribute("data-theme") !== th) cursor.setAttribute("data-theme", th);
      }, { passive: true });
      gsap.set(cursor, { opacity: pointer.active ? 1 : 0 });
      window.addEventListener("pointermove", function once() { gsap.to(cursor, { opacity: 1, duration: .3 }); window.removeEventListener("pointermove", once); });
      var labels = { "↘": "↘", "↓": "↓", drag: "тяни", wa: "чат", copy: "copy", cmd: ">_" };
      $$("[data-cursor]").forEach(function (el) {
        el.addEventListener("pointerenter", function () {
          cursor.classList.add("is-active");
          clabel.textContent = labels[el.getAttribute("data-cursor")] || "";
        });
        el.addEventListener("pointerleave", function () { cursor.classList.remove("is-active"); });
      });
      $$("a:not([data-cursor]), button:not([data-cursor]), .chip, textarea").forEach(function (el) {
        el.addEventListener("pointerenter", function () { gsap.to(ring, { scale: 1.5, duration: .3 }); });
        el.addEventListener("pointerleave", function () { gsap.to(ring, { scale: 1, duration: .3 }); });
      });

      $$(".magnetic").forEach(function (el) {
        var mx = gsap.quickTo(el, "x", { duration: .5, ease: "power3" });
        var my = gsap.quickTo(el, "y", { duration: .5, ease: "power3" });
        var span = el.querySelector("span");
        var sx = gsap.quickTo(span, "x", { duration: .5, ease: "power3" });
        var sy = gsap.quickTo(span, "y", { duration: .5, ease: "power3" });
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          mx(dx * .35); my(dy * .45); sx(dx * .15); sy(dy * .2);
        });
        el.addEventListener("pointerleave", function () { mx(0); my(0); sx(0); sy(0); });
      });

      $$(".tilt").forEach(function (el) {
        var max = el.classList.contains("tilt--soft") ? 4 : 9;
        var rx = gsap.quickTo(el, "rotationX", { duration: .6, ease: "power3" });
        var ry = gsap.quickTo(el, "rotationY", { duration: .6, ease: "power3" });
        gsap.set(el, { transformPerspective: 900 });
        el.addEventListener("pointermove", function (e) {
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          ry((px - .5) * max * 2); rx((.5 - py) * max * 2);
          el.style.setProperty("--mx", px * 100 + "%");
          el.style.setProperty("--my", py * 100 + "%");
        });
        el.addEventListener("pointerleave", function () { rx(0); ry(0); });
      });
    }

    /* ---------- дешифровка подписей ---------- */
    $$("[data-scramble]").forEach(function (el) {
      ST.create({ trigger: el, start: "top 92%", once: true, onEnter: function () { scramble(el); } });
      if (el.tagName === "A" && finePointer) el.addEventListener("pointerenter", function () { scramble(el); });
    });

    /* ---------- навигация прячется при скролле вниз ---------- */
    ST.create({
      start: 0, end: "max",
      onUpdate: function (self) {
        var y = self.scroll();
        nav.classList.toggle("is-scrolled", y > 40);
        nav.classList.toggle("is-hidden", self.direction === 1 && y > innerHeight * .6 && con.hidden);
      }
    });

    /* =======================================================
       HERO
       ======================================================= */
    var hero = $("#hero");
    var heroLogo = $("#heroLogo");
    var heroSvg = heroLogo.querySelector("svg");
    var letters = $$(".L", heroSvg);
    var wraps = letters.map(function (L) {
      var g = document.createElementNS(SVGNS, "g");
      L.parentNode.insertBefore(g, L); g.appendChild(L);
      return g;
    });
    gsap.set(letters.concat(wraps), { transformOrigin: "50% 50%" });

    function pathPoints(d) {
      var pts = [], cx = 0, cy = 0, re = /([MLHVAZ])([^MLHVAZ]*)/gi, m;
      while ((m = re.exec(d))) {
        var c = m[1].toUpperCase(), n = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
        if (c === "M" || c === "L") { for (var i = 0; i < n.length; i += 2) { cx = n[i]; cy = n[i + 1]; pts.push([cx, cy]); } }
        else if (c === "H") { cx = n[0]; pts.push([cx, cy]); }
        else if (c === "V") { cy = n[0]; pts.push([cx, cy]); }
        else if (c === "A") { cx = n[5]; cy = n[6]; pts.push([cx, cy]); }
      }
      return pts;
    }
    letters.forEach(function (L) {
      var seen = {};
      $$(".L__line path, path.L__line", L).forEach(function (p) {
        pathPoints(p.getAttribute("d")).forEach(function (pt) {
          var k = Math.round(pt[0]) + ":" + Math.round(pt[1]);
          if (seen[k]) return; seen[k] = 1;
          svgEl("rect", { "class": "anchor", x: pt[0] - 5, y: pt[1] - 5, width: 10, height: 10 }, L);
        });
      });
      var enter = function () { L.classList.add("is-hover"); gsap.fromTo(L, { scale: 1 }, { scale: 1.06, duration: .5, ease: "elastic.out(1, .4)" }); };
      var leave = function () { L.classList.remove("is-hover"); gsap.to(L, { scale: 1, duration: .5, ease: "power3" }); };
      if (finePointer) { L.addEventListener("pointerenter", enter); L.addEventListener("pointerleave", leave); }
      else L.addEventListener("pointerdown", function () { enter(); setTimeout(leave, 900); });
    });

    function placeGuides() {
      var h = heroSvg.getBoundingClientRect().height;
      var stage = $(".hero__stage");
      stage.style.setProperty("--mid", h / 2 + "px");
      stage.style.setProperty("--base", h + "px");
    }
    placeGuides();
    window.addEventListener("resize", placeGuides);

    var crossV = $(".crosshair__v"), crossH = $(".crosshair__h"), crossRead = $(".crosshair__read"), xy = $("#xy");
    var letterMove = letters.map(function (L) {
      return {
        depth: parseFloat(L.getAttribute("data-depth")) || 1,
        x: gsap.quickTo(L, "x", { duration: .9, ease: "power3" }),
        y: gsap.quickTo(L, "y", { duration: .9, ease: "power3" }),
        r: gsap.quickTo(L, "rotation", { duration: 1.1, ease: "power3" })
      };
    });
    var ghostR = $(".hero__ghost--r"), ghostC = $(".hero__ghost--c");
    var superHero = $(".super--hero");
    var superX = gsap.quickTo(superHero, "x", { duration: 1.4, ease: "power3" });
    var superY = gsap.quickTo(superHero, "y", { duration: 1.4, ease: "power3" });
    var glitch = 0, heroVisible = true, introRunning = false;
    api.glitch = function (v) { glitch = Math.max(glitch, v); };
    ST.create({ trigger: hero, start: "top bottom", end: "bottom top", onToggle: function (s) { heroVisible = s.isActive; } });

    if (finePointer) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        crossV.style.transform = "translateX(" + x + "px)";
        crossH.style.transform = "translateY(" + y + "px)";
        crossRead.style.transform = "translate(" + (x + 14) + "px," + (y + 14) + "px)";
        xy.textContent = "X " + pad(Math.round(x), 4) + " · Y " + pad(Math.round(y), 4);
        if (introRunning) return;
        var nx = (e.clientX / innerWidth - .5) * 2, ny = (e.clientY / innerHeight - .5) * 2;
        letterMove.forEach(function (m) { m.x(nx * 22 * m.depth); m.y(ny * 14 * m.depth); m.r(nx * 2.5 * m.depth); });
        superX(nx * -40); superY(ny * -30);
      });
      hero.addEventListener("pointerleave", function () { letterMove.forEach(function (m) { m.x(0); m.y(0); m.r(0); }); });
    }

    var ghostShown = false;
    frameHooks.push(function () {
      if (!heroVisible || introRunning) return;
      var target = finePointer ? clamp((pointer.speed - 6) / 40, 0, 1) : 0;
      if (finePointer && !reduce && Math.random() < .004) target = 1;
      glitch = lerp(glitch, target, target > glitch ? .5 : .08);
      if (glitch < .01) {
        if (ghostShown) { ghostR.style.opacity = ghostC.style.opacity = 0; ghostShown = false; }
        return;
      }
      ghostShown = true;
      var off = glitch * 14, jy = (Math.random() - .5) * glitch * 6;
      ghostR.style.opacity = ghostC.style.opacity = (glitch * .85).toFixed(3);
      ghostR.style.transform = "translate(" + (-off) + "px," + jy + "px)";
      ghostC.style.transform = "translate(" + off + "px," + (-jy) + "px)";
      var cut = Math.random() * 70;
      ghostR.style.clipPath = "inset(" + cut + "% 0 " + Math.max(0, 85 - cut - glitch * 40) + "% 0)";
      ghostC.style.clipPath = "inset(" + Math.max(0, 70 - cut) + "% 0 " + cut * .5 + "% 0)";
    });

    /* уход hero: буквы разлетаются */
    var heroOut = gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: .6 } });
    wraps.forEach(function (w, i) {
      var dir = i - 2;
      heroOut.to(w, { x: dir * 140, y: -160 - Math.abs(dir) * 60 + (i % 2 ? 90 : -40), rotation: dir * 9, opacity: 0, ease: "none" }, 0);
    });
    heroOut
      .to(".hero__cursor", { x: 260, opacity: 0, ease: "none" }, 0)
      .to(".hero__tag, .dimension", { y: -60, opacity: 0, ease: "none" }, 0)
      .to(".guides", { scaleY: 6, opacity: 0, ease: "none" }, 0)
      .to(".hero__grid i", { scaleY: 0, stagger: .02, ease: "none" }, 0)
      .to(".hud, .hero__scroll", { opacity: 0, ease: "none" }, 0)
      .to(superHero, { rotation: -14, scale: 1.25, yPercent: -18, opacity: .08, ease: "none" }, 0);

    /* ---------- интро как в ролике identity.build ---------- */
    var hudbar = $("#hudbar"), status = $("#status");
    var introTl = null;
    function runIntro() {
      if (introTl) introTl.progress(1);
      introRunning = true;
      hero.classList.add("is-intro");
      if (lenis) lenis.stop();
      var term = $("#termText");
      var fills = $$(".L__fill", heroSvg);
      var lineGroups = $$(".L__line", heroSvg);
      var lines = lineGroups.reduce(function (acc, el) { return acc.concat(el.tagName === "path" ? [el] : $$("path", el)); }, []);
      lines.forEach(function (p) { var len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });
      var typed = { n: 0 }, cmd = "init bavix";
      var setStatus = function (t) { status.textContent = t; };
      gsap.set("#terminal", { autoAlpha: 1, scale: 1 });
      term.textContent = "";

      introTl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: endIntro });
      introTl.set(".hero__stage", { autoAlpha: 0 })
        .set(".hero__grid i", { scaleY: 0 })
        .set(".guide", { scaleX: 0 })
        .set(".dimension i", { scaleX: 0 })
        .set(".hero__tag", { autoAlpha: 0 })
        .set(".hero__cursor", { autoAlpha: 0 })
        .set(fills, { opacity: 0 })
        .set(lineGroups, { opacity: 1 })
        .set(hudbar, { scaleX: 0 })
        .call(setStatus, ["$ init"])
        .to(typed, {
          n: cmd.length, duration: .7, ease: "none", delay: .35,
          onUpdate: function () {
            var s = cmd.slice(0, Math.round(typed.n));
            term.innerHTML = s.length > 5 ? "init <b>" + s.slice(5) + "</b>" : s;
          }
        })
        .to({}, { duration: .15 })
        .to("#terminal", { autoAlpha: 0, scale: .96, duration: .25, ease: "power2.in" })
        .call(setStatus, ["$ tracing"])
        .to(".hero__grid i", { scaleY: 1, duration: .8, stagger: .04, ease: "expo.out" }, "<")
        .set(".hero__stage", { autoAlpha: 1 }, "<.1")
        .to(".guide", { scaleX: 1, duration: .9, stagger: .08, ease: "expo.out" }, "<")
        .to(lines, { strokeDashoffset: 0, duration: .9, stagger: .03, ease: "power2.inOut" }, "<.1")
        .to(".dimension i", { scaleX: 1, duration: .7, ease: "expo.out" }, "<.3")
        .to(hudbar, { scaleX: .64, duration: 1.1, ease: "none" }, "<")
        .call(setStatus, ["$ compiling"], null, "<")
        .to(fills, { opacity: 1, duration: .05, stagger: { each: .06, from: "random" }, ease: "steps(1)" })
        .to(fills, { opacity: .3, duration: .04, yoyo: true, repeat: 3, stagger: .03, ease: "steps(1)" })
        .addLabel("glitch")
        .call(function () { ripple(innerWidth / 2, innerHeight / 2); }, null, "glitch")
        .to(".hero__ghost", { opacity: .85, duration: .05 }, "glitch")
        .to(".hero__ghost--r", { x: -18, y: 3, duration: .08, yoyo: true, repeat: 3, ease: "steps(2)" }, "glitch")
        .to(".hero__ghost--c", { x: 18, y: -3, duration: .08, yoyo: true, repeat: 3, ease: "steps(2)" }, "glitch")
        .to(heroLogo, { x: 6, duration: .04, yoyo: true, repeat: 5, ease: "steps(1)" }, "glitch")
        .to(".hero__ghost", { opacity: 0, x: 0, y: 0, duration: .15 })
        .to(lineGroups, { opacity: 0, duration: .5 }, "<")
        .to(hudbar, { scaleX: 1, duration: .4, ease: "power2.out" }, "<")
        .call(setStatus, ["$ build ok · 0 errors"])
        .set(".hero__cursor", { autoAlpha: 1 })
        .to(".hero__tag", { autoAlpha: 1, duration: .6 }, "<")
        .from(".hero__tag", { letterSpacing: "1.2em", duration: 1.1, ease: "expo.out", immediateRender: false }, "<")
        .to(".guide", { opacity: .45, duration: .5 }, "<");

      function skip(e) {
        if (e && e.target && e.target.closest && e.target.closest(".console, .nav")) return;
        if (introTl && introTl.progress() < 1) introTl.progress(1);
      }
      function endIntro() {
        introRunning = false;
        hero.classList.remove("is-intro");
        lines.forEach(function (p) { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
        gsap.set(lineGroups, { clearProps: "opacity" });
        gsap.set(fills, { clearProps: "opacity" });
        gsap.set(".hero__tag", { clearProps: "letterSpacing" });
        if (lenis && con.hidden) lenis.start();
        ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.removeEventListener(ev, skip); });
      }
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.addEventListener(ev, skip, { passive: true }); });
    }
    api.replayIntro = runIntro;
    if (window.scrollY < 40 && !reduce) runIntro();

    /* =======================================================
       МАНИФЕСТ
       ======================================================= */
    var mt = $("#manifestText");
    mt.innerHTML = mt.textContent.split(" ").map(function (w) { return '<span class="w">' + w + "</span>"; }).join(" ");
    gsap.fromTo($$(".w", mt), { opacity: .14 }, {
      opacity: 1, stagger: .1, ease: "none",
      scrollTrigger: { trigger: mt, start: "top 80%", end: "bottom 45%", scrub: true }
    });
    gsap.from(".manifest__meta > div", { y: 40, opacity: 0, duration: 1, stagger: .12, ease: "expo.out", scrollTrigger: { trigger: ".manifest__meta", start: "top 88%" } });

    /* =======================================================
       УСЛУГИ
       ======================================================= */
    var mm = gsap.matchMedia();
    mm.add("(min-width: 861px)", function () {
      var track = $("#svcTrack");
      var cards = $$(".card", track);
      var count = $("#svcCount"), bar = $("#svcBar");
      var dist = function () { return Math.max(0, track.scrollWidth - innerWidth); };
      var tw = gsap.to(track, {
        x: function () { return -dist(); }, ease: "none",
        scrollTrigger: {
          trigger: ".services", start: "top top", end: function () { return "+=" + dist(); },
          pin: ".services__pin", scrub: .8, invalidateOnRefresh: true,
          onUpdate: function (self) {
            count.textContent = pad(Math.min(cards.length, Math.floor(self.progress * cards.length) + 1));
            bar.style.transform = "scaleX(" + Math.max(.16, self.progress) + ")";
          }
        }
      });
      var hook = null;
      if (!reduce) {
        var skew = gsap.quickTo(cards, "skewX", { duration: .5, ease: "power3" });
        hook = function () { skew(clamp(-scrollVel * .25, -6, 6)); };
        frameHooks.push(hook);
      }
      cards.forEach(function (c) {
        gsap.from(c.querySelector(".card__viz"), {
          scale: .85, opacity: 0, ease: "none",
          scrollTrigger: { trigger: c, containerAnimation: tw, start: "left 95%", end: "left 60%", scrub: true }
        });
      });
      return function () { if (hook) frameHooks.splice(frameHooks.indexOf(hook), 1); gsap.set(cards, { skewX: 0 }); };
    });
    mm.add("(max-width: 860px)", function () {
      $$(".card").forEach(function (c) {
        gsap.from(c, { y: 50, opacity: 0, duration: .8, ease: "power3.out", scrollTrigger: { trigger: c, start: "top 92%" } });
      });
    });
    gsap.from(".services .h2", { yPercent: 30, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".services", start: "top 75%" } });

    /* =======================================================
       БЕГУЩАЯ СТРОКА
       ======================================================= */
    function marquee(el, base) {
      var x = 0, dir = 1, half = 0, visible = false;
      var measure = function () { half = el.firstElementChild.offsetWidth; };
      measure(); window.addEventListener("resize", measure);
      ST.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: function (s) { visible = s.isActive; } });
      frameHooks.push(function () {
        if (!visible || !half) return;
        if (scrollVel > .5) dir = 1; else if (scrollVel < -.5) dir = -1;
        x -= (Math.abs(base) + Math.min(Math.abs(scrollVel), 40) * .6) * dir * Math.sign(base);
        if (x <= -half) x += half; if (x > 0) x -= half;
        var sk = finePointer && !reduce ? clamp(-scrollVel * .4, -12, 12) : 0;
        el.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)" + (sk ? " skewX(" + sk.toFixed(2) + "deg)" : "");
      });
    }
    gsap.fromTo(".super--marquee", { rotation: -20 }, { rotation: 20, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: true } });
    gsap.fromTo(".super--contact", { yPercent: 30, xPercent: 12, rotation: -8 }, { yPercent: 0, xPercent: 0, rotation: 0, ease: "none", scrollTrigger: { trigger: ".contact", start: "top bottom", end: "bottom bottom", scrub: .6 } });
    marquee($("#marquee1"), 1.1);
    marquee($("#marquee2"), -0.8);

    /* =======================================================
       КЕЙС
       ======================================================= */
    gsap.from(".case__copy > *", { y: 50, opacity: 0, duration: 1, stagger: .1, ease: "expo.out", scrollTrigger: { trigger: ".case__copy", start: "top 80%" } });
    gsap.timeline({ scrollTrigger: { trigger: "#app", start: "top 80%" } })
      .from("#app", { y: 80, rotationX: finePointer ? 14 : 0, opacity: 0, duration: 1.2, ease: "expo.out", transformPerspective: 1000 })
      .from(".app__row", { x: -30, opacity: 0, duration: .5, stagger: .08, ease: "power3.out" }, "-=.7")
      .from(".app__totals > div", { y: 20, opacity: 0, duration: .6, stagger: .1 }, "-=.3");

    var fmt = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
    $$(".count").forEach(function (el) {
      var to = parseFloat(el.getAttribute("data-to")), o = { v: 0 };
      ST.create({
        trigger: el, start: "top 92%", once: true,
        onEnter: function () { gsap.to(o, { v: to, duration: to > 1000 ? 2.2 : 1.4, ease: "expo.out", onUpdate: function () { el.textContent = fmt(o.v); } }); }
      });
      if (el.getBoundingClientRect().top > innerHeight) el.textContent = fmt(0);
    });
    gsap.from(".stat", { y: 50, opacity: 0, duration: 1, stagger: .1, ease: "expo.out", scrollTrigger: { trigger: ".stats", start: "top 88%" } });

    /* =======================================================
       ПРОЦЕСС
       ======================================================= */
    var steps = $$(".tstep");
    gsap.fromTo("#rail", { "--p": 0 }, {
      "--p": 1, ease: "none",
      scrollTrigger: {
        trigger: "#timeline", start: "top 75%", end: "bottom 55%", scrub: .5,
        onUpdate: function (self) { steps.forEach(function (s, i) { s.classList.toggle("is-on", self.progress >= i / steps.length + .02); }); }
      }
    });
    gsap.from(".tstep", { y: 40, opacity: 0, duration: 1, stagger: .12, ease: "expo.out", scrollTrigger: { trigger: "#timeline", start: "top 82%" } });

    /* =======================================================
       ПОЧЕМУ
       ======================================================= */
    gsap.fromTo(".why__big mark", { "--hl": "0%" }, { "--hl": "100%", ease: "none", scrollTrigger: { trigger: ".why__big", start: "top 80%", end: "top 35%", scrub: true } });
    gsap.from(".why__item", { x: 60, opacity: 0, duration: 1, stagger: .1, ease: "expo.out", scrollTrigger: { trigger: ".why__list", start: "top 82%" } });
    gsap.from(".nums > div", { y: 40, opacity: 0, duration: .9, stagger: .08, ease: "expo.out", scrollTrigger: { trigger: ".nums", start: "top 90%" } });

    /* =======================================================
       КОНСТРУКТОР
       ======================================================= */
    gsap.from(".chip", { y: 24, opacity: 0, duration: .7, stagger: .05, ease: "expo.out", scrollTrigger: { trigger: ".chips", start: "top 85%" } });
    gsap.from(".scheme", { y: 60, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".scheme", start: "top 85%" } });
    if (finePointer) {
      $$(".chip").forEach(function (c) {
        c.addEventListener("click", function () { var r = c.getBoundingClientRect(); ripple(r.left + r.width / 2, r.top + r.height / 2); });
      });
    }

    /* =======================================================
       КОНТАКТ И ФУТЕР
       ======================================================= */
    var ct = $(".contact__title");
    var ctText = ct.firstChild.textContent;
    ct.firstChild.textContent = "";
    var ctSpan = document.createElement("span");
    ct.insertBefore(ctSpan, ct.firstChild);
    ctSpan.innerHTML = ctText.split(" ").map(function (word) {
      return '<span style="display:inline-block;white-space:nowrap">' + word.split("").map(function (ch) {
        return '<span class="ch" style="display:inline-block">' + ch + "</span>";
      }).join("") + "</span>";
    }).join(" ");
    gsap.from($$(".ch", ct), { yPercent: 110, rotation: 8, opacity: 0, duration: .9, stagger: .025, ease: "expo.out", scrollTrigger: { trigger: ct, start: "top 88%" } });
    gsap.from(".next li, .person, .people__note", { y: 40, opacity: 0, duration: 1, stagger: .08, ease: "expo.out", scrollTrigger: { trigger: ".contact__grid", start: "top 88%" } });
    gsap.fromTo("#footLogo", { clipPath: "inset(0 100% 0 0)", y: 60 }, {
      clipPath: "inset(0 0% 0 0)", y: 0, ease: "none",
      scrollTrigger: { trigger: ".footer", start: "top 95%", end: "bottom bottom", scrub: .6 }
    });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeGuides(); ST.refresh(); });
    window.addEventListener("load", function () { ST.refresh(); });
  }
})();
