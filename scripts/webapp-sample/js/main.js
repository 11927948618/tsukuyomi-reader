import { drawClock, formatToday } from "./clock.js";

const quiz = await (await fetch("data/quiz.json")).json();

const canvas = document.getElementById("clock");
const tick = () => {
  drawClock(canvas.getContext("2d"), new Date());
  document.getElementById("today").textContent = formatToday(new Date());
};
tick();
setInterval(tick, 1000);

let index = 0;
function showQuestion() {
  const q = quiz.questions[index % quiz.questions.length];
  document.getElementById("question").textContent = q.text;
  document.getElementById("result").textContent = "";
  const box = document.getElementById("choices");
  box.replaceChildren();
  q.choices.forEach((label, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      const ok = i === q.answer;
      button.classList.add(ok ? "correct" : "wrong");
      document.getElementById("result").textContent = ok ? "正解！" : "ざんねん…";
      if (ok) setTimeout(() => { index += 1; showQuestion(); }, 900);
    });
    box.append(button);
  });
}
showQuestion();

// a dynamic import of a sibling module (exercises the shim's module handling)
const { describe } = await import("./meta.js");
document.getElementById("meta").textContent = describe(quiz);

document.getElementById("exit").addEventListener("click", () => window.tk?.exit());
