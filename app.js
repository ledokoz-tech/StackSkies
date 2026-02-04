const form = document.getElementById("research-form");
const findStrongButton = document.getElementById("find-strong");
const statusEl = document.getElementById("status");
const marketSelect = document.getElementById("market");
const assetNameEl = document.getElementById("asset-name");

const priceValueEl = document.getElementById("price-value");
const priceChangeEl = document.getElementById("price-change");
const changeValueEl = document.getElementById("change-value");
const changePctEl = document.getElementById("change-pct");
const changeLabelEl = document.getElementById("change-label");
const volumeValueEl = document.getElementById("volume-value");
const volumeLabelEl = document.getElementById("volume-label");
const volatilityValueEl = document.getElementById("volatility-value");
const volatilityLabelEl = document.getElementById("volatility-label");

const indicatorListEl = document.getElementById("indicator-list");
const fundamentalsListEl = document.getElementById("fundamentals-list");
const onchainListEl = document.getElementById("onchain-list");

const thesisEl = document.getElementById("thesis");
const catalystsEl = document.getElementById("catalysts");
const risksEl = document.getElementById("risks");
const scenariosEl = document.getElementById("scenarios");

const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const chartContainer = document.getElementById("price-chart");
let priceChart = null;
let candleSeries = null;

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

function formatCurrency(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function setStatSub(el, value, isPercent = false) {
  if (!el) return;
  const num = Number(value);
  if (Number.isNaN(num)) {
    el.textContent = "--";
    el.classList.remove("positive", "negative");
    return;
  }
  const formatted = isPercent ? `${num.toFixed(2)}%` : formatNumber(num);
  el.textContent = formatted;
  el.classList.toggle("positive", num > 0);
  el.classList.toggle("negative", num < 0);
}

function renderCard(el, title, content) {
  const heading = el.querySelector("h3");
  const body = el.querySelector("p") || document.createElement("p");
  heading.textContent = title;
  body.textContent = content || "--";
  body.classList.remove("placeholder");
  if (!el.contains(body)) {
    el.appendChild(body);
  }
}

function renderDataList(el, entries) {
  el.innerHTML = "";
  (entries || []).forEach((item) => {
    const dt = document.createElement("dt");
    dt.textContent = item.label;
    const dd = document.createElement("dd");
    dd.textContent = item.value || "--";
    el.appendChild(dt);
    el.appendChild(dd);
  });
  if (!entries || entries.length === 0) {
    const dt = document.createElement("dt");
    dt.textContent = "Status";
    const dd = document.createElement("dd");
    dd.textContent = "No data";
    el.appendChild(dt);
    el.appendChild(dd);
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
    const timestamp = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "";
    meta.textContent = [item.source, timestamp].filter(Boolean).join(" • ");
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

function renderChart(ohlc) {
  if (!window.LightweightCharts) return;
  if (!priceChart) {
    priceChart = window.LightweightCharts.createChart(chartContainer, {
      layout: {
        background: { color: "transparent" },
        textColor: "#f5f3ee",
        fontFamily: "Space Grotesk, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
      },
      height: 280,
    });
    candleSeries = priceChart.addCandlestickSeries({
      upColor: "#30d5c8",
      downColor: "#ff7a3d",
      borderUpColor: "#30d5c8",
      borderDownColor: "#ff7a3d",
      wickUpColor: "#30d5c8",
      wickDownColor: "#ff7a3d",
    });
  }

  const data = (ohlc || []).map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
  }));
  candleSeries.setData(data);
  priceChart.timeScale().fitContent();
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
    }
  } catch (err) {
    renderNews([
      {
        title: "Live news unavailable",
        body: "Check your connection or RSS access.",
        source: "StackSkies",
      },
    ]);
  }
}

function updateIndicators(indicators = {}) {
  const entries = [
    { label: "SMA 20", value: formatNumber(indicators.sma20) },
    { label: "SMA 50", value: formatNumber(indicators.sma50) },
    { label: "EMA 20", value: formatNumber(indicators.ema20) },
    { label: "EMA 50", value: formatNumber(indicators.ema50) },
    { label: "RSI 14", value: formatNumber(indicators.rsi14) },
  ];
  if (indicators.macd) {
    entries.push({ label: "MACD", value: formatNumber(indicators.macd.macd) });
    entries.push({ label: "Signal", value: formatNumber(indicators.macd.signal) });
    entries.push({ label: "Histogram", value: formatNumber(indicators.macd.histogram) });
  }
  renderDataList(indicatorListEl, entries);
}

function updateFundamentals(fundamentals) {
  if (!fundamentals) {
    renderDataList(fundamentalsListEl, [{ label: "Status", value: "Not available" }]);
    return;
  }
  if (fundamentals.error) {
    renderDataList(fundamentalsListEl, [{ label: "Error", value: fundamentals.error }]);
    return;
  }
  renderDataList(fundamentalsListEl, [
    { label: "Company", value: fundamentals.name || "--" },
    { label: "Sector", value: fundamentals.sector || "--" },
    { label: "Industry", value: fundamentals.industry || "--" },
    { label: "Market Cap", value: fundamentals.marketCap ? formatCompact(fundamentals.marketCap) : "--" },
    { label: "P/E", value: fundamentals.peRatio || "--" },
    { label: "Profit Margin", value: fundamentals.profitMargin || "--" },
    { label: "Dividend Yield", value: fundamentals.dividendYield || "--" },
    { label: "52w High", value: fundamentals.week52High || "--" },
    { label: "52w Low", value: fundamentals.week52Low || "--" },
  ]);
}

function updateOnchain(onchain) {
  if (!onchain) {
    renderDataList(onchainListEl, [{ label: "Status", value: "Not available" }]);
    return;
  }
  if (onchain.error) {
    renderDataList(onchainListEl, [{ label: "Error", value: onchain.error }]);
    return;
  }
  const entries = (onchain.metrics || []).map((metric) => ({
    label: metric.label,
    value: metric.value,
  }));
  renderDataList(onchainListEl, entries);
}

function updateReport(report) {
  if (!report) {
    renderCard(thesisEl, "Summary", "Report unavailable. Ensure OpenRouter is configured.");
    renderCard(catalystsEl, "Catalysts", "--");
    renderCard(risksEl, "Risks", "--");
    renderCard(scenariosEl, "Scenarios", "--");
    return;
  }
  renderCard(thesisEl, "Summary", report.summary || report.thesis || "--");
  renderCard(catalystsEl, "Catalysts", (report.catalysts || []).join("\n") || "--");
  renderCard(risksEl, "Risks", (report.risks || []).join("\n") || "--");
  if (report.scenarios) {
    const scenarioText = [
      report.scenarios.bull ? `Bull: ${report.scenarios.bull}` : "",
      report.scenarios.base ? `Base: ${report.scenarios.base}` : "",
      report.scenarios.bear ? `Bear: ${report.scenarios.bear}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    renderCard(scenariosEl, "Scenarios", scenarioText || "--");
  } else {
    renderCard(scenariosEl, "Scenarios", "--");
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
    const assetName = result.asset?.name || result.asset?.symbol || symbol || "--";
    setAssetName(assetName);

    priceValueEl.textContent = formatCurrency(result.price?.value, result.price?.currency || "USD");
    priceChangeEl.textContent = result.price?.lastUpdated
      ? `Last update: ${new Date(result.price.lastUpdated).toLocaleString()}`
      : "";

    if (market === "crypto") {
      if (changeLabelEl) changeLabelEl.textContent = "Change (24h)";
      changeValueEl.textContent = formatCurrency(result.price?.changeValue24h, "USD");
      setStatSub(changePctEl, result.price?.changePct24h, true);
    } else {
      if (changeLabelEl) changeLabelEl.textContent = "Change (1d)";
      changeValueEl.textContent = formatCurrency(result.price?.changeValue1d, "USD");
      setStatSub(changePctEl, result.price?.changePct1d, true);
    }

    volumeValueEl.textContent = formatCompact(result.volume?.value);
    volumeLabelEl.textContent = result.volume?.currency || "--";

    const volValue = result.indicators?.volatility30d;
    volatilityValueEl.textContent = volValue ? formatPercent(volValue) : "--";
    volatilityLabelEl.textContent = volValue ? "Std dev of returns" : "--";

    updateIndicators(result.indicators);
    updateFundamentals(result.fundamentals);
    updateOnchain(result.onchain);
    updateReport(result.report);

    renderChart(result.ohlc || []);
    if (result.news && result.news.length) {
      renderNews(result.news);
    } else {
      loadNews(market);
    }

    setStatus("Research complete", false);
  } catch (error) {
    setAssetName("--");
    renderCard(thesisEl, "Summary", `Research failed: ${error.message}`);
    renderCard(catalystsEl, "Catalysts", "--");
    renderCard(risksEl, "Risks", "--");
    renderCard(scenariosEl, "Scenarios", "--");
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
