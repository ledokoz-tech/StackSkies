const form = document.getElementById("research-form");
const findStrongButton = document.getElementById("find-strong");
const statusEl = document.getElementById("status");
const thesisEl = document.getElementById("thesis");
const signalsEl = document.getElementById("signals");
const riskEl = document.getElementById("risk-card");
const allocationEl = document.getElementById("allocation");
const marketSelect = document.getElementById("market");

const demoSignals = [
  "News tone: cautiously bullish",
  "Volume shift: +8% vs 30-day average",
  "Macro correlation: moderating",
  "Liquidity: stable across top venues",
];

const demoNews = [
  {
    title: "Macro sentiment shifts toward risk-on",
    body: "Demo headline. Connect to crypto & equities news feeds for live coverage.",
    source: "StackSkies",
  },
  {
    title: "Order-book liquidity holds above 30-day average",
    body: "Demo headline. Swap in on-chain analytics or exchange data.",
    source: "StackSkies",
  },
  {
    title: "Institutional inflows highlight sector rotation",
    body: "Demo headline. Replace with market news or earnings briefs.",
    source: "StackSkies",
  },
];

function setStatus(text, busy = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("busy", busy);
}

function renderSignals(signals) {
  const list = signalsEl.querySelector(".signal-list");
  list.innerHTML = "";
  signals.forEach((item) => {
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

function buildFallback({ market, symbol, risk, horizon, strongPick }) {
  const label = strongPick ? "Top candidate" : "Requested asset";
  const subject = symbol || (market === "crypto" ? "BTC" : "NVDA");
  return {
    thesis:
      `${label}: ${subject}. The agent favors balanced exposure with a ${risk} risk stance over ${horizon}. ` +
      "Momentum remains positive, but entries should be staged and protected with clear exit criteria.",
    signals: demoSignals,
    risks:
      "Primary risks include volatility spikes, macro headline shocks, and liquidity gaps. Use position sizing and clear stop levels.",
    allocation:
      "Paper trade suggestion: 3 staged entries (40% / 35% / 25%) with a 7% protective stop and a 18% target ladder.",
  };
}

async function requestResearch(payload) {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Research request failed");
  }

  return response.json();
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
      renderNews(demoNews);
    }
  } catch (err) {
    renderNews(demoNews);
  }
}

async function runResearch({ strongPick }) {
  const market = marketSelect.value;
  const symbol = document.getElementById("symbol").value.trim();
  const risk = document.getElementById("risk").value;
  const horizon = document.getElementById("horizon").value;

  setStatus("Researching...", true);

  try {
    const data = await requestResearch({ market, symbol, risk, horizon, strongPick });
    const result = data.ok ? data.result : data.fallback;

    if (!result) {
      throw new Error("No result returned");
    }

    renderCard(thesisEl, "Thesis", result.thesis || "No thesis returned.");
    renderSignals(result.signals && result.signals.length ? result.signals : demoSignals);
    renderCard(riskEl, "Risk Notes", result.risks || "Risk analysis not available.");
    renderCard(
      allocationEl,
      "Allocation Plan",
      result.allocation || "Allocation plan not available."
    );

    setStatus(data.ok ? "Research complete" : "Fallback result loaded", false);
  } catch (error) {
    const fallback = buildFallback({ market, symbol, risk, horizon, strongPick });
    renderCard(thesisEl, "Thesis", fallback.thesis);
    renderSignals(fallback.signals);
    renderCard(riskEl, "Risk Notes", fallback.risks);
    renderCard(allocationEl, "Allocation Plan", fallback.allocation);
    setStatus("Fallback result loaded", false);
  }
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

loadNews(marketSelect.value);
