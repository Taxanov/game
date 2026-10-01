/*
 * Рендер интро BAVIX в MP4: покадровые скриншоты сцены → ffmpeg (H.264, 60 fps) + звук оригинала.
 * Нужен локальный сервер из корня репозитория: npx http-server -p 8080 .
 * Запуск: node motion/render.js [формат ...]   форматы: 16x9 4x5 9x16 1x1 (по умолчанию все)
 * Сцена: SCENE=logo-intro (по умолчанию) или SCENE=supergraphic
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const SCENE = process.env.SCENE || "logo-intro";
const BASE = process.env.BASE_URL || `http://localhost:8080/motion/${SCENE}/index.html`;
/* у каждой сцены свои финалы и префикс имени файла */
const SCENES = {
  "logo-intro": { prefix: "bavix-intro", ends: [["em", "emerald", 8.2], ["dark", "dark", 8.5]], sting: [4.25, 7.85] },
  "supergraphic": { prefix: "bavix-super", ends: [["em", "emerald", 8.9], ["white", "white", 8.5]], sting: [4.1, 7.9] }
};
const SC = SCENES[SCENE];
const AUDIO = process.env.AUDIO || path.join(__dirname, "logo-intro/audio.m4a");
const OUT = path.join(__dirname, "out");
const FPS = 60, DUR = 9;
const FORMATS = { "16x9": [1920, 1080], "4x5": [1080, 1350], "9x16": [1080, 1920], "1x1": [1080, 1080] };
const pick = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FORMATS);

/* варианты: полный ролик (изумрудный и тёмный финал) и короткий «стинг» 4.25–7.85 с */
const JOBS = [];
for (const f of pick) {
  for (const [end, label, still] of SC.ends) JOBS.push({ f, end, still, from: 0, to: DUR, name: `${SC.prefix}-${f}-${label}` });
  JOBS.push({ f, end: SC.ends[0][0], from: SC.sting[0], to: SC.sting[1], name: `${SC.prefix}-sting-${f}`, fade: true });
}

function ffmpeg(args) {
  return spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "inherit"] });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const job of JOBS) {
    const [w, h] = FORMATS[job.f];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`${BASE}?w=${w}&h=${h}&end=${job.end}&t=0`);
    await page.waitForFunction(() => window.__ready);
    const dur = job.to - job.from, frames = Math.round(dur * FPS);
    const file = path.join(OUT, job.name + ".mp4");
    const af = job.fade ? ["-af", `afade=t=in:st=0:d=0.08,afade=t=out:st=${(dur - 0.35).toFixed(2)}:d=0.35`] : [];
    const ff = ffmpeg(["-y", "-loglevel", "error",
      "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-ss", String(job.from), "-t", String(dur), "-i", AUDIO,
      "-map", "0:v", "-map", "1:a", ...af,
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", file]);
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.__render(t), job.from + i / FPS);
      const buf = await page.screenshot({ type: "png" });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on("close", c => (c ? rej(new Error("ffmpeg " + c)) : res())));
    /* финальный кадр PNG для превью и постеров */
    if (job.from === 0) {
      await page.evaluate(t => window.__render(t), job.still);
      await page.screenshot({ path: path.join(OUT, job.name + "-end.png") });
    }
    console.log(`✓ ${job.name}.mp4  ${frames} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
