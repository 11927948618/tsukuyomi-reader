export function drawClock(ctx, now) {
  const { width: w, height: h } = ctx.canvas;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 6;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#334";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const hand = (angle, length, width) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(angle) * length, cy - Math.cos(angle) * length);
    ctx.stroke();
  };
  const s = now.getSeconds();
  const m = now.getMinutes() + s / 60;
  const hr = (now.getHours() % 12) + m / 60;
  hand((hr / 12) * Math.PI * 2, r * 0.5, 5);
  hand((m / 60) * Math.PI * 2, r * 0.75, 3);
  ctx.strokeStyle = "#c33";
  hand((s / 60) * Math.PI * 2, r * 0.85, 1.5);
}

export function formatToday(now) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "full", timeStyle: "medium" }).format(now);
}
