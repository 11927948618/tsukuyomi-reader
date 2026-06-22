const TESTS = [
  { name: "Measured pager vertical", url: "./measured-pager-browser.html?mode=vertical" },
  { name: "Measured pager horizontal", url: "./measured-pager-browser.html?mode=horizontal" },
  { name: "EPUB DocumentModel", url: "./epub-document-model-browser.html" }
];

const summary = document.querySelector("#summary");
const resultsBody = document.querySelector("#results");
const frames = document.querySelector("#frames");
const results = await Promise.all(TESTS.map(runTest));
const passed = results.every((entry) => entry.status === "pass");

document.body.dataset.testResult = passed ? "pass" : "fail";
summary.className = passed ? "pass" : "fail";
summary.textContent = passed ? `PASS (${results.length}/${results.length})` : `FAIL (${results.filter((entry) => entry.status === "pass").length}/${results.length})`;

async function runTest(test) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  const statusCell = document.createElement("td");
  const detailCell = document.createElement("td");
  const detail = document.createElement("pre");
  nameCell.textContent = test.name;
  statusCell.className = "running";
  statusCell.textContent = "RUNNING";
  detailCell.appendChild(detail);
  row.append(nameCell, statusCell, detailCell);
  resultsBody.appendChild(row);

  const frame = document.createElement("iframe");
  frame.src = appendRunId(test.url);
  frames.appendChild(frame);

  try {
    await waitForLoad(frame, 30000);
    const status = await waitForResult(frame, 30000);
    const text = String(frame.contentDocument?.querySelector("#result")?.textContent || status).trim();
    statusCell.className = status;
    statusCell.textContent = status.toUpperCase();
    detail.textContent = text;
    return { name: test.name, status, text };
  } catch (error) {
    statusCell.className = "fail";
    statusCell.textContent = "FAIL";
    detail.textContent = String(error?.message || error);
    return { name: test.name, status: "fail", text: detail.textContent };
  }
}

function appendRunId(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}run=${Date.now()}`;
}

function waitForLoad(frame, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("load timeout")), timeoutMs);
    frame.addEventListener("load", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function waitForResult(frame, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const status = frame.contentDocument?.body?.dataset?.testResult;
      if (status === "pass" || status === "fail") {
        resolve(status);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("result timeout"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}
