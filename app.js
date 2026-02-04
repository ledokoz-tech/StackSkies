const form = document.getElementById("research-form");
const findStrongButton = document.getElementById("find-strong");
const statusEl = document.getElementById("status");
const thesisEl = document.getElementById("thesis");
const signalsEl = document.getElementById("signals");
const riskEl = document.getElementById("risk-card");
const allocationEl = document.getElementById("allocation");
const marketSelect = document.getElementById("market");
const assetNameEl = document.getElementById("asset-name");
const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const chatHistory = [
  {
    role: "assistant",
    content:
      "Hi! Tell me which market or symbol you want to explore, and I will summarize the latest signals.",
  },
];

function setStatus(text, busy = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("busy", busy);
}

function setAssetName(text) {
  assetNameEl.textContent = text || "--";
}

function renderSignals(signals) {
  const list = signalsEl.querySelector(".signal-list");
  list.innerHTML = "";
  (signals || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderCard(el, title, content) {
  const heading = el.querySelector("h3");
  const body = el.querySelector("p") || document.createElement("p");
  heading.textContent = title;
  body.textContent = content;
  body.classList.remove("placeholder");
  if (!el.contains(body)) {
    el.appendChild(body);
  }
}

function renderNews(items) {
  const feed = document.getElementById("news-feed");
  feed.innerHTML = "";
  items.forEach((item) => {
    const article = document.createElement("article");
    const h4 = document.createElement("h4");
    h4.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "news-meta";
    meta.textContent = item.source ? `Source: ${item.source}` : "";
    const p = document.createElement("p");
    p.textContent = item.body || "";
    article.appendChild(h4);
    if (meta.textContent) {
      article.appendChild(meta);
    }
    article.appendChild(p);
    if (item.link) {
      const link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Read more";
      link.className = "news-link";
      article.appendChild(link);
    }
    feed.appendChild(article);
  });
}

function renderNewsPlaceholder(title, detail) {
  renderNews([
    {
      title,
      body: detail,
      source: "StackSkies",
    },
  ]);
}

async function requestResearch(payload) {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Research request failed");
  }

  return data.result;
}

async function requestChat(messages, market, symbol) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, market, symbol }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Chat request failed");
  }

  return data.message;
}

async function loadNews(market) {
  try {
    const response = await fetch(`/api/news?market=${encodeURIComponent(market)}`);
    if (!response.ok) {
      throw new Error("News request failed");
    }
    const data = await response.json();
    if (data.ok && data.items?.length) {
      renderNews(data.items);
    } else {
      renderNewsPlaceholder("No live headlines yet", "Try again in a moment.");
    }
  } catch (err) {
    renderNewsPlaceholder("Live news unavailable", "Check your connection or RSS access.");
  }
}

async function runResearch({ strongPick }) {
  const market = marketSelect.value;
  const symbol = document.getElementById("symbol").value.trim();
  const risk = document.getElementById("risk").value;
  const horizon = document.getElementById("horizon").value;

  setStatus("Researching...", true);

  try {
    const result = await requestResearch({ market, symbol, risk, horizon, strongPick });

    const assetName = result.asset || symbol || (market === "crypto" ? "Crypto" : "Stockmarket");
    setAssetName(assetName);

    renderCard(thesisEl, `Thesis · ${assetName}`, result.thesis || "No thesis returned.");
    renderSignals(result.signals && result.signals.length ? result.signals : ["Signals not provided."]);
    renderCard(riskEl, "Risk Notes", result.risks || "Risk analysis not available.");
    renderCard(
      allocationEl,
      "Allocation Plan",
      result.allocation || "Allocation plan not available."
    );

    setStatus("Research complete", false);
  } catch (error) {
    renderCard(thesisEl, "Thesis", "Research failed. Check the server logs or API key.");
    renderSignals(["No signals available."]);
    renderCard(riskEl, "Risk Notes", "No risk analysis available.");
    renderCard(allocationEl, "Allocation Plan", "No allocation available.");
    setAssetName("--");
    setStatus("Research failed", false);
  }
}

function addChatMessage(role, content, { pending = false } = {}) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}${pending ? " pending" : ""}`;
  const p = document.createElement("p");
  p.textContent = content;
  message.appendChild(p);
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return message;
}

function updateChatMessage(el, content, pending = false) {
  const p = el.querySelector("p");
  if (p) {
    p.textContent = content;
  }
  el.classList.toggle("pending", pending);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runResearch({ strongPick: false });
});

findStrongButton.addEventListener("click", () => {
  runResearch({ strongPick: true });
});

marketSelect.addEventListener("change", () => {
  loadNews(marketSelect.value);
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const market = marketSelect.value;
  const symbol = document.getElementById("symbol").value.trim();

  chatInput.value = "";
  chatInput.disabled = true;

  addChatMessage("user", text);
  chatHistory.push({ role: "user", content: text });

  const pending = addChatMessage("assistant", "Thinking...", { pending: true });

  try {
    const reply = await requestChat(chatHistory, market, symbol);
    updateChatMessage(pending, reply, false);
    chatHistory.push({ role: "assistant", content: reply });
  } catch (err) {
    updateChatMessage(pending, "Chat failed. Check the server or API key.", false);
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

setAssetName("--");
loadNews(marketSelect.value);
