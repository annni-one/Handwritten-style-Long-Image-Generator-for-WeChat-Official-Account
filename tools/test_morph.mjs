// 测试 sharp erode/dilate 在单通道 raw 上的行为
import sharp from "sharp";

// 造一个 100x100 中央 60x60 白块
const w = 100, h = 100;
const buf = Buffer.alloc(w * h);
for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) buf[y * w + x] = 255;

const er = await sharp(buf, { raw: { width: w, height: h, channels: 1 } }).erode(25).raw().toBuffer({ resolveWithObject: true });
console.log("erode info:", JSON.stringify(er.info));
const cnt = (b, c) => { let n = 0; for (let i = 0; i < b.length; i += c) if (b[i] > 127) n++; return n; };
console.log("src fg:", cnt(buf, 1), "eroded fg:", cnt(er.data, er.info.channels));

const di = await sharp(er.data, { raw: { width: w, height: h, channels: er.info.channels } }).dilate(25).raw().toBuffer({ resolveWithObject: true });
console.log("dilate info:", JSON.stringify(di.info), "fg:", cnt(di.data, di.info.channels));
