/* BAVIX — интерактив и анимации. GSAP + ScrollTrigger + Lenis. */
(function () {
  "use strict";

  var doc = document.documentElement;
  var body = document.body;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasGsap = typeof window.gsap !== "undefined";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  body.classList.remove("is-loading");

  /* ---------- общее состояние указателя ---------- */
  var pointer = { x: innerWidth / 2, y: innerHeight / 2, vx: 0, vy: 0, speed: 0, active: false };
  var lastPX = pointer.x, lastPY = pointer.y;
  window.addEventListener("pointermove", function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
  }, { passive: true });
  document.addEventListener("pointerleave", function () { pointer.active = false; });

  /* ---------- копирование телефонов (работает и без GSAP) ---------- */
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
      try {
        navigator.clipboard.writeText(text).then(function () { done("Скопировано"); }, fallback);
      } catch (err) { fallback(); }
    });
  });

  /* ---------- часы в HUD: T+00:00:00 как в видео ---------- */
  var clock = $("#clock");
  var t0 = performance.now();
  setInterval(function () {
    var s = Math.floor((performance.now() - t0) / 1000);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    clock.textContent = "T+" + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
  }, 1000);

  /* ---------- фон: поле точек, реагирует на курсор и скролл ---------- */
  var canvas = $("#field");
  var ctx = canvas.getContext("2d");
  var dpr = 1, W = 0, H = 0, gap = 32;
  var fieldMouse = { x: -9999, y: -9999 };
  function resizeField() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gap = W < 700 ? 26 : 32;
  }
  resizeField();
  window.addEventListener("resize", resizeField);

  var scrollY = window.scrollY;
  var scrollVel = 0;
  var tick = 0;
  function drawField() {
    tick++;
    fieldMouse.x = lerp(fieldMouse.x, pointer.active ? pointer.x : -9999, pointer.active ? .18 : 1);
    fieldMouse.y = lerp(fieldMouse.y, pointer.active ? pointer.y : -9999, pointer.active ? .18 : 1);
    ctx.clearRect(0, 0, W, H);
    var offY = -((scrollY * .35) % gap);
    var R = W < 700 ? 120 : 190, R2 = R * R;
    var scanY = (tick * 2.2) % (H + 400) - 200;
    for (var y = offY; y < H + gap; y += gap) {
      var scanA = Math.max(0, 1 - Math.abs(y - scanY) / 140);
      for (var x = gap / 2; x < W; x += gap) {
        var dx = x - fieldMouse.x, dy = y - fieldMouse.y, d2 = dx * dx + dy * dy;
        var a = .09 + scanA * .12, px = x, py = y, s = 1.2;
        if (d2 < R2) {
          var d = Math.sqrt(d2), f = 1 - d / R, push = f * f * 18;
          px += (dx / (d || 1)) * push; py += (dy / (d || 1)) * push;
          a = .09 + f * .9; s = 1.2 + f * 1.6;
          ctx.fillStyle = "rgba(200,245,58," + a.toFixed(3) + ")";
        } else {
          ctx.fillStyle = "rgba(241,242,236," + a.toFixed(3) + ")";
        }
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
    }
  }

  /* ---------- без GSAP: только поле точек, страница остаётся статичной ---------- */
  if (!hasGsap || reduce) {
    if (!reduce) (function loop() { drawField(); requestAnimationFrame(loop); })();
    else drawField();
    window.addEventListener("scroll", function () { scrollY = window.scrollY; if (reduce) drawField(); }, { passive: true });
    return;
  }

  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  var ST = window.ScrollTrigger;

  /* ---------- плавный скролл ---------- */
  var lenis = null;
  if (typeof window.Lenis !== "undefined") {
    lenis = new window.Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 1 });
    lenis.on("scroll", function (e) { ST.update(); scrollVel = e.velocity || 0; });
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        var target = id === "#top" ? 0 : $(id);
        if (target === null) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0, duration: 1.6 });
      });
    });
  }
  window.addEventListener("scroll", function () { scrollY = window.scrollY; }, { passive: true });

  /* ---------- главный цикл кадра ---------- */
  var frameHooks = [];
  gsap.ticker.add(function () {
    pointer.vx = pointer.x - lastPX; pointer.vy = pointer.y - lastPY;
    lastPX = pointer.x; lastPY = pointer.y;
    pointer.speed = lerp(pointer.speed, Math.hypot(pointer.vx, pointer.vy), .2);
    if (!lenis) scrollVel = lerp(scrollVel, 0, .1);
    drawField();
    for (var i = 0; i < frameHooks.length; i++) frameHooks[i]();
  });

  /* ---------- кастомный курсор ---------- */
  var cursor = $(".cursor");
  if (finePointer) {
    body.classList.add("has-cursor");
    var dot = $(".cursor__dot"), ring = $(".cursor__ring"), clabel = $(".cursor__label");
    var dotX = gsap.quickSetter(dot, "x", "px"), dotY = gsap.quickSetter(dot, "y", "px");
    var ringX = gsap.quickTo(ring, "x", { duration: .45, ease: "power3" });
    var ringY = gsap.quickTo(ring, "y", { duration: .45, ease: "power3" });
    frameHooks.push(function () { dotX(pointer.x); dotY(pointer.y); ringX(pointer.x); ringY(pointer.y); });
    var labels = { "↘": "↘", "↓": "↓", drag: "тяни", wa: "чат", copy: "copy" };
    $$("[data-cursor]").forEach(function (el) {
      el.addEventListener("pointerenter", function () {
        cursor.classList.add("is-active");
        clabel.textContent = labels[el.getAttribute("data-cursor")] || "";
      });
      el.addEventListener("pointerleave", function () { cursor.classList.remove("is-active"); });
    });
    $$("a:not([data-cursor]), button:not([data-cursor])").forEach(function (el) {
      el.addEventListener("pointerenter", function () { gsap.to(ring, { scale: 1.5, duration: .3 }); });
      el.addEventListener("pointerleave", function () { gsap.to(ring, { scale: 1, duration: .3 }); });
    });

    /* магнитные кнопки */
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

    /* 3D-наклон карточек со световым пятном */
    $$(".tilt").forEach(function (el) {
      var soft = el.classList.contains("tilt--soft");
      var max = soft ? 4 : 9;
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

  /* ---------- текст-«дешифровка» для моно-подписей ---------- */
  var glyphs = "_/\\<>[]{}#$%01=+*";
  function scramble(el) {
    if (el._busy) return;
    var final = el.getAttribute("data-text") || el.textContent;
    el.setAttribute("data-text", final);
    el._busy = true;
    var frame = 0, total = final.length * 2 + 8;
    (function step() {
      var out = "";
      for (var i = 0; i < final.length; i++) {
        if (final[i] === " " || i < (frame - 8) / 2) out += final[i];
        else out += glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = out;
      if (++frame <= total) requestAnimationFrame(step);
      else { el.textContent = final; el._busy = false; }
    })();
  }
  $$("[data-scramble]").forEach(function (el) {
    ST.create({ trigger: el, start: "top 92%", once: true, onEnter: function () { scramble(el); } });
    if (el.tagName === "A") el.addEventListener("pointerenter", function () { scramble(el); });
  });

  /* ---------- навигация: прячется при скролле вниз ---------- */
  var nav = $("#nav");
  ST.create({
    start: 0, end: "max",
    onUpdate: function (self) {
      var y = self.scroll();
      nav.classList.toggle("is-scrolled", y > 40);
      nav.classList.toggle("is-hidden", self.direction === 1 && y > innerHeight * .6);
    }
  });

  /* =========================================================
     HERO
     ========================================================= */
  var hero = $("#hero");
  var heroLogo = $("#heroLogo");
  var heroSvg = heroLogo.querySelector("svg");
  var letters = $$(".L", heroSvg);
  var SVGNS = "http://www.w3.org/2000/svg";

  /* обёртки: скролл двигает обёртку, мышь — саму букву */
  var wraps = letters.map(function (L) {
    var g = document.createElementNS(SVGNS, "g");
    L.parentNode.insertBefore(g, L); g.appendChild(L);
    return g;
  });

  gsap.set(letters.concat(wraps), { transformOrigin: "50% 50%" });

  /* опорные точки построения, как в кадре identity.build */
  function pathPoints(d) {
    var pts = [], cx = 0, cy = 0;
    var re = /([MLHVAZ])([^MLHVAZ]*)/gi, m;
    while ((m = re.exec(d))) {
      var c = m[1].toUpperCase();
      var n = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
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
        var r = document.createElementNS(SVGNS, "rect");
        r.setAttribute("class", "anchor");
        r.setAttribute("x", pt[0] - 5); r.setAttribute("y", pt[1] - 5);
        r.setAttribute("width", 10); r.setAttribute("height", 10);
        L.appendChild(r);
      });
    });
    if (finePointer) {
      L.addEventListener("pointerenter", function () {
        L.classList.add("is-hover");
        gsap.fromTo(L, { scale: 1 }, { scale: 1.06, duration: .5, ease: "elastic.out(1, .4)" });
      });
      L.addEventListener("pointerleave", function () {
        L.classList.remove("is-hover");
        gsap.to(L, { scale: 1, duration: .5, ease: "power3" });
      });
    }
  });

  /* направляющие CAP / MID / BASE по реальной высоте логотипа */
  function placeGuides() {
    var h = heroSvg.getBoundingClientRect().height;
    var stage = $(".hero__stage");
    stage.style.setProperty("--mid", h / 2 + "px");
    stage.style.setProperty("--base", h + "px");
  }
  placeGuides();
  window.addEventListener("resize", placeGuides);

  /* мышь: параллакс букв, перекрестие с координатами, RGB-глитч от скорости */
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
  var glitch = 0, heroVisible = true, introRunning = false;
  ST.create({ trigger: hero, start: "top bottom", end: "bottom top", onToggle: function (s) { heroVisible = s.isActive; } });

  hero.addEventListener("pointermove", function (e) {
    var r = hero.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    crossV.style.transform = "translateX(" + x + "px)";
    crossH.style.transform = "translateY(" + y + "px)";
    crossRead.style.transform = "translate(" + (x + 14) + "px," + (y + 14) + "px)";
    xy.textContent = "X " + String(Math.round(x)).padStart(4, "0") + " · Y " + String(Math.round(y)).padStart(4, "0");
    if (introRunning) return;
    var nx = (e.clientX / innerWidth - .5) * 2, ny = (e.clientY / innerHeight - .5) * 2;
    letterMove.forEach(function (m) {
      m.x(nx * 22 * m.depth); m.y(ny * 14 * m.depth); m.r(nx * 2.5 * m.depth);
    });
  });
  hero.addEventListener("pointerleave", function () {
    letterMove.forEach(function (m) { m.x(0); m.y(0); m.r(0); });
  });

  frameHooks.push(function () {
    if (!heroVisible || introRunning) return;
    var target = clamp((pointer.speed - 6) / 40, 0, 1);
    if (Math.random() < .004) target = 1; // редкий случайный сбой, как в видео
    glitch = lerp(glitch, target, target > glitch ? .5 : .08);
    if (glitch < .01) { ghostR.style.opacity = ghostC.style.opacity = 0; return; }
    var off = glitch * 14;
    var jy = (Math.random() - .5) * glitch * 6;
    ghostR.style.opacity = ghostC.style.opacity = (glitch * .85).toFixed(3);
    ghostR.style.transform = "translate(" + (-off) + "px," + jy + "px)";
    ghostC.style.transform = "translate(" + off + "px," + (-jy) + "px)";
    var cut = Math.random() * 70;
    ghostR.style.clipPath = "inset(" + cut + "% 0 " + Math.max(0, 85 - cut - glitch * 40) + "% 0)";
    ghostC.style.clipPath = "inset(" + Math.max(0, 70 - cut) + "% 0 " + cut * .5 + "% 0)";
  });

  /* уход hero при скролле: буквы разлетаются в разные стороны */
  var heroOut = gsap.timeline({
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: .6 }
  });
  wraps.forEach(function (w, i) {
    var dir = i - 2;
    heroOut.to(w, {
      x: dir * 140, y: -160 - Math.abs(dir) * 60 + (i % 2 ? 90 : -40),
      rotation: dir * 9, opacity: 0, ease: "none"
    }, 0);
  });
  heroOut
    .to(".hero__cursor", { x: 260, opacity: 0, ease: "none" }, 0)
    .to(".hero__tag, .dimension", { y: -60, opacity: 0, ease: "none" }, 0)
    .to(".guides", { scaleY: 6, opacity: 0, ease: "none" }, 0)
    .to(".hero__grid i", { scaleY: 0, stagger: .02, ease: "none" }, 0)
    .to(".hud, .hero__scroll", { opacity: 0, ease: "none" }, 0);

  /* ---------- интро: повтор ролика identity.build ---------- */
  var hudbar = $("#hudbar"), status = $("#status");
  function runIntro() {
    introRunning = true;
    doc.classList.add("is-intro");
    hero.classList.add("is-intro");
    if (lenis) lenis.stop();
    var term = $("#termText");
    var fills = $$(".L__fill", heroSvg);
    var lines = $$(".L__line", heroSvg).reduce(function (acc, el) {
      return acc.concat(el.tagName === "path" ? [el] : $$("path", el));
    }, []);
    var lineGroups = $$(".L__line", heroSvg);
    lines.forEach(function (p) { var len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; });

    var typed = { n: 0 };
    var cmd = "init bavix";
    var setStatus = function (t) { status.textContent = t; };

    var tl = gsap.timeline({
      defaults: { ease: "power3.out" },
      onComplete: endIntro
    });
    tl.set(".hero__stage", { autoAlpha: 0 })
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
      .to({}, { duration: .3 })
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
      .from(".hero__tag", { letterSpacing: "1.2em", duration: 1.1, ease: "expo.out" }, "<")
      .to(".guide", { opacity: .45, duration: .5 }, "<");

    function skip() { if (tl.progress() < 1) tl.progress(1); }
    function endIntro() {
      introRunning = false;
      doc.classList.remove("is-intro");
      hero.classList.remove("is-intro");
      lines.forEach(function (p) { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
      gsap.set(lineGroups, { clearProps: "opacity" });
      gsap.set(fills, { clearProps: "opacity" });
      if (lenis) lenis.start();
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.removeEventListener(ev, skip); });
    }
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { window.addEventListener(ev, skip, { passive: true }); });
  }
  if (window.scrollY < 40) runIntro();

  /* =========================================================
     01 МАНИФЕСТ — слова загораются по мере скролла
     ========================================================= */
  var mt = $("#manifestText");
  var words = mt.textContent.split(" ");
  mt.innerHTML = words.map(function (w) { return '<span class="w">' + w + "</span>"; }).join(" ");
  gsap.fromTo($$(".w", mt), { opacity: .14 }, {
    opacity: 1, stagger: .1, ease: "none",
    scrollTrigger: { trigger: mt, start: "top 80%", end: "bottom 45%", scrub: true }
  });
  gsap.from(".manifest__meta > div", {
    y: 40, opacity: 0, duration: 1, stagger: .12, ease: "expo.out",
    scrollTrigger: { trigger: ".manifest__meta", start: "top 88%" }
  });

  /* =========================================================
     02 УСЛУГИ — горизонтальная лента на десктопе
     ========================================================= */
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
          var i = Math.min(cards.length, Math.floor(self.progress * cards.length) + 1);
          count.textContent = String(i).padStart(2, "0");
          bar.style.transform = "scaleX(" + Math.max(.16, self.progress) + ")";
        }
      }
    });
    /* карточки слегка «тянутся» за скоростью ленты */
    var skew = gsap.quickTo(cards, "skewX", { duration: .5, ease: "power3" });
    var hook = function () { skew(clamp(-scrollVel * .25, -6, 6)); };
    frameHooks.push(hook);
    cards.forEach(function (c) {
      gsap.from(c.querySelector(".card__viz"), {
        scale: .85, opacity: 0, ease: "none",
        scrollTrigger: { trigger: c, containerAnimation: tw, start: "left 95%", end: "left 60%", scrub: true }
      });
    });
    return function () { frameHooks.splice(frameHooks.indexOf(hook), 1); gsap.set(cards, { skewX: 0 }); };
  });
  mm.add("(max-width: 860px)", function () {
    $$(".card").forEach(function (c) {
      gsap.from(c, { y: 60, opacity: 0, duration: .9, ease: "expo.out", scrollTrigger: { trigger: c, start: "top 90%" } });
    });
  });
  gsap.from(".services .h2", {
    yPercent: 30, opacity: 0, duration: 1.1, ease: "expo.out",
    scrollTrigger: { trigger: ".services", start: "top 75%" }
  });

  /* =========================================================
     БЕГУЩАЯ СТРОКА — скорость и наклон от скролла
     ========================================================= */
  function marquee(el, base) {
    var x = 0, dir = 1, half = 0;
    var measure = function () { half = el.firstElementChild.offsetWidth; };
    measure(); window.addEventListener("resize", measure);
    var visible = false;
    ST.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: function (s) { visible = s.isActive; } });
    frameHooks.push(function () {
      if (!visible || !half) return;
      if (scrollVel > .5) dir = 1; else if (scrollVel < -.5) dir = -1;
      x -= (Math.abs(base) + Math.abs(scrollVel) * .6) * dir * Math.sign(base);
      if (x <= -half) x += half; if (x > 0) x -= half;
      el.style.transform = "translate3d(" + x + "px,0,0) skewX(" + clamp(-scrollVel * .4, -12, 12) + "deg)";
    });
  }
  marquee($("#marquee1"), 1.1);
  marquee($("#marquee2"), -0.8);

  /* =========================================================
     03 КЕЙС
     ========================================================= */
  gsap.from(".case__copy > *", {
    y: 50, opacity: 0, duration: 1, stagger: .1, ease: "expo.out",
    scrollTrigger: { trigger: ".case__copy", start: "top 80%" }
  });
  var appTl = gsap.timeline({ scrollTrigger: { trigger: "#app", start: "top 78%" } });
  appTl.from("#app", { y: 80, rotationX: 14, opacity: 0, duration: 1.2, ease: "expo.out", transformPerspective: 1000 })
    .from(".app__row", { x: -30, opacity: 0, duration: .5, stagger: .08, ease: "power3.out" }, "-=.7")
    .from(".app__totals > div", { y: 20, opacity: 0, duration: .6, stagger: .1 }, "-=.3");

  /* счётчики */
  var fmt = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
  $$(".count").forEach(function (el) {
    var to = parseFloat(el.getAttribute("data-to"));
    var o = { v: 0 };
    ST.create({
      trigger: el, start: "top 90%", once: true,
      onEnter: function () {
        gsap.to(o, { v: to, duration: to > 1000 ? 2.2 : 1.4, ease: "expo.out", onUpdate: function () { el.textContent = fmt(o.v); } });
      }
    });
    el.textContent = fmt(0);
  });
  gsap.from(".stat", {
    y: 50, opacity: 0, duration: 1, stagger: .1, ease: "expo.out",
    scrollTrigger: { trigger: ".stats", start: "top 85%" }
  });

  /* =========================================================
     04 ПРОЦЕСС — линия прорисовывается, шаги загораются
     ========================================================= */
  var steps = $$(".tstep");
  gsap.fromTo("#rail", { "--p": 0 }, {
    "--p": 1, ease: "none",
    scrollTrigger: {
      trigger: "#timeline", start: "top 75%", end: "bottom 55%", scrub: .5,
      onUpdate: function (self) {
        steps.forEach(function (s, i) { s.classList.toggle("is-on", self.progress >= i / steps.length + .02); });
      }
    }
  });
  gsap.from(".tstep", {
    y: 40, opacity: 0, duration: 1, stagger: .12, ease: "expo.out",
    scrollTrigger: { trigger: "#timeline", start: "top 80%" }
  });

  /* =========================================================
     05 ПОЧЕМУ — маркер закрашивается по скроллу
     ========================================================= */
  gsap.fromTo(".why__big mark", { "--hl": "0%" }, {
    "--hl": "100%", ease: "none",
    scrollTrigger: { trigger: ".why__big", start: "top 80%", end: "top 35%", scrub: true }
  });
  gsap.from(".why__item", {
    x: 60, opacity: 0, duration: 1, stagger: .1, ease: "expo.out",
    scrollTrigger: { trigger: ".why__list", start: "top 80%" }
  });
  gsap.from(".nums > div", {
    y: 40, opacity: 0, duration: .9, stagger: .08, ease: "expo.out",
    scrollTrigger: { trigger: ".nums", start: "top 88%" }
  });

  /* =========================================================
     06 КОНТАКТ И ФУТЕР
     ========================================================= */
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
  gsap.from($$(".ch", ct), {
    yPercent: 110, rotation: 8, opacity: 0, duration: .9, stagger: .025, ease: "expo.out",
    scrollTrigger: { trigger: ct, start: "top 85%" }
  });
  gsap.from(".next li, .person, .people__note", {
    y: 40, opacity: 0, duration: 1, stagger: .08, ease: "expo.out",
    scrollTrigger: { trigger: ".contact__grid", start: "top 85%" }
  });
  gsap.fromTo("#footLogo", { clipPath: "inset(0 100% 0 0)", y: 60 }, {
    clipPath: "inset(0 0% 0 0)", y: 0, ease: "none",
    scrollTrigger: { trigger: ".footer", start: "top 95%", end: "bottom bottom", scrub: .6 }
  });

  /* пересчёт после загрузки шрифтов */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { placeGuides(); ST.refresh(); });
  window.addEventListener("load", function () { ST.refresh(); });
})();
