/*
 * Рендер интро BAVIX в MP4: покадровые скриншоты сцены → ffmpeg (H.264, 60 fps) + звук оригинала.
 * Нужен локальный сервер из корня репозитория: npx http-server -p 8080 .
 * Запуск: node motion/render.js [формат ...]   форматы: 16x9 4x5 9x16 1x1 (по умолчанию все)
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8080/motion/logo-intro/index.html";
const AUDIO = process.env.AUDIO || path.join(__dirname, "logo-intro/audio.m4a");
const OUT = path.join(__dirname, "out");
const FPS = 60, DUR = 9;
const FORMATS = { "16x9": [1920, 1080], "4x5": [1080, 1350], "9x16": [1080, 1920], "1x1": [1080, 1080] };
const pick = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FORMATS);

/* варианты: полный ролик (изумрудный и тёмный финал) и короткий «стинг» 4.25–7.85 с */
const JOBS = [];
for (const f of pick) {
  JOBS.push({ f, end: "em", from: 0, to: DUR, name: `bavix-intro-${f}-emerald` });
  JOBS.push({ f, end: "dark", from: 0, to: DUR, name: `bavix-intro-${f}-dark` });
  JOBS.push({ f, end: "em", from: 4.25, to: 7.85, name: `bavix-sting-${f}`, fade: true });
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
      await page.evaluate(t => window.__render(t), job.end === "em" ? 8.2 : 8.5);
      await page.screenshot({ path: path.join(OUT, job.name + "-end.png") });
    }
    console.log(`✓ ${job.name}.mp4  ${frames} кадров за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
