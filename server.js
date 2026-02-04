require("dotenv").config();
const express = require("express");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const fetch =
  global.fetch ||
  ((...args) => import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args)));

const app = express();
const PORT = process.env.PORT || 5173;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ALPHAVANTAGE_API_KEY = process.env.ALPHAVANTAGE_API_KEY;
const NEWSAPI_API_KEY = process.env.NEWSAPI_API_KEY;
const COINMETRICS_API_KEY = process.env.COINMETRICS_API_KEY;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const ALPHA_BASE = "https://www.alphavantage.co/query";
const NEWSAPI_BASE = "https://newsapi.org/v2/everything";
const COINMETRICS_BASE = COINMETRICS_API_KEY
  ? "https://api.coinmetrics.io/v4"
  : "https://community-api.coinmetrics.io/v4";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

function safeTrim(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function stripHtml(text) {
  return safeTrim(String(text || "").replace(/<[^>]*>/g, " "));
}

function parseJsonFromText(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (innerErr) {
        return null;
      }
    }
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

function mean(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeSMA(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return mean(slice);
}

function computeEMAArray(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [];
  let prev = mean(values.slice(0, period));
  ema[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    const value = values[i];
    prev = value * k + prev * (1 - k);
    ema[i] = prev;
  }
  return ema;
}

function computeEMA(values, period) {
  const ema = computeEMAArray(values, period);
  return ema.length ? ema[ema.length - 1] : null;
}

function computeRSI(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) {
      avgGain = (avgGain * (period - 1) + delta) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - delta) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(values) {
  if (values.length < 26) return null;
  const ema12 = computeEMAArray(values, 12);
  const ema26 = computeEMAArray(values, 26);
  const macdSeries = values.map((_, index) => {
    const fast = ema12[index];
    const slow = ema26[index];
    if (fast === undefined || slow === undefined) return null;
    return fast - slow;
  });
  const macdClean = macdSeries.filter((value) => value !== null);
  if (macdClean.length < 9) return null;
  const signalSeries = computeEMAArray(macdClean, 9);
  const macd = macdClean[macdClean.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  if (macd === undefined || signal === undefined) return null;
  return { macd, signal, histogram: macd - signal };
}

function computeVolatility(values, window = 30) {
  if (values.length < window + 1) return null;
  const slice = values.slice(-(window + 1));
  const returns = [];
  for (let i = 1; i < slice.length; i += 1) {
    const prev = slice[i - 1];
    const curr = slice[i];
    returns.push((curr - prev) / prev);
  }
  return standardDeviation(returns);
}

const coinListCache = { data: null, fetchedAt: 0 };
const COIN_LIST_TTL = 1000 * 60 * 60 * 6;

async function getCoinList() {
  const now = Date.now();
  if (coinListCache.data && now - coinListCache.fetchedAt < COIN_LIST_TTL) {
    return coinListCache.data;
  }
  const data = await fetchJson(`${COINGECKO_BASE}/coins/list`);
  coinListCache.data = data;
  coinListCache.fetchedAt = now;
  return data;
}

function resolveCoinId(input, list) {
  const query = String(input || "").trim().toLowerCase();
  if (!query) return null;
  const exactId = list.find((coin) => coin.id === query);
  if (exactId) return exactId;
  const exactSymbol = list.find((coin) => coin.symbol?.toLowerCase() === query);
  if (exactSymbol) return exactSymbol;
  const exactName = list.find((coin) => coin.name?.toLowerCase() === query);
  if (exactName) return exactName;
  return null;
}

async function pickStrongCrypto() {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data.length) {
    throw new Error("Unable to select a strong crypto candidate.");
  }
  let best = data[0];
  let bestScore = -Infinity;
  data.forEach((coin) => {
    const change = Number(coin.price_change_percentage_24h || 0);
    const volume = Number(coin.total_volume || 0);
    const score = change * Math.log10(volume + 1);
    if (score > bestScore) {
      bestScore = score;
      best = coin;
    }
  });
  return best;
}

async function getCryptoData({ symbol, strongPick }) {
  let coin;
  if (strongPick || !symbol) {
    const strong = await pickStrongCrypto();
    coin = { id: strong.id, symbol: strong.symbol, name: strong.name };
  } else {
    const list = await getCoinList();
    const resolved = resolveCoinId(symbol, list);
    if (!resolved) {
      throw new Error("Crypto asset not found. Try the ticker (e.g., BTC) or full name.");
    }
    coin = resolved;
  }

  const marketUrl = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${coin.id}&price_change_percentage=24h`;
  const marketData = await fetchJson(marketUrl);
  const market = marketData?.[0];
  if (!market) {
    throw new Error("Unable to fetch crypto market data.");
  }

  const ohlcUrl = `${COINGECKO_BASE}/coins/${coin.id}/ohlc?vs_currency=usd&days=90`;
  const ohlcRaw = await fetchJson(ohlcUrl);
  const ohlc = (ohlcRaw || []).map((row) => ({
    time: Math.floor(row[0] / 1000),
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
  }));

  const closes = ohlc.map((row) => row.close);
  const indicators = {
    sma20: computeSMA(closes, 20),
    sma50: computeSMA(closes, 50),
    ema20: computeEMA(closes, 20),
    ema50: computeEMA(closes, 50),
    rsi14: computeRSI(closes, 14),
    macd: computeMACD(closes),
    volatility30d: computeVolatility(closes, 30),
  };

  let onchain = null;
  try {
    const metrics = process.env.COINMETRICS_METRICS || "AdrActCnt,TxCnt,CapMrktCurUSD";
    const asset = coin.symbol?.toLowerCase() || "";
    if (asset) {
      const cmUrl = `${COINMETRICS_BASE}/timeseries/asset-metrics?assets=${asset}&metrics=${metrics}&limit_per_asset=1`;
      const cmHeaders = COINMETRICS_API_KEY ? { "X-Api-Key": COINMETRICS_API_KEY } : undefined;
      const cmData = await fetchJson(cmUrl, { headers: cmHeaders });
      const rows = cmData?.data || [];
      if (rows.length) {
        const latest = rows[rows.length - 1];
        let entries = [];
        if (latest.metrics) {
          entries = Object.entries(latest.metrics).map(([label, value]) => ({ label, value }));
        } else if (latest.values && cmData.metrics) {
          entries = cmData.metrics.map((metric, index) => ({ label: metric, value: latest.values[index] }));
        }
        if (entries.length) {
          onchain = { source: "CoinMetrics", metrics: entries };
        }
      }
    }
  } catch (err) {
    onchain = { source: "CoinMetrics", error: err.message };
  }

  return {
    market: "crypto",
    asset: {
      id: coin.id,
      symbol: coin.symbol?.toUpperCase() || "",
      name: coin.name || "",
    },
    price: {
      value: market.current_price,
      currency: "USD",
      changePct24h: market.price_change_percentage_24h,
      changeValue24h: market.price_change_24h,
      lastUpdated: market.last_updated,
    },
    volume: {
      value: market.total_volume,
      currency: "USD",
    },
    marketCap: {
      value: market.market_cap,
      currency: "USD",
    },
    ohlc,
    indicators,
    fundamentals: null,
    onchain,
    newsQuery: `${coin.name || coin.symbol} crypto`,
  };
}

async function pickStrongStock() {
  if (!ALPHAVANTAGE_API_KEY) {
    throw new Error("Missing ALPHAVANTAGE_API_KEY for stock research.");
  }
  const url = `${ALPHA_BASE}?function=TOP_GAINERS_LOSERS&apikey=${ALPHAVANTAGE_API_KEY}`;
  const data = await fetchJson(url);
  const gainer = data?.top_gainers?.[0];
  if (!gainer?.ticker) {
    throw new Error("Unable to select a strong stock candidate.");
  }
  return gainer.ticker;
}

function parseAlphaSeries(series) {
  const entries = Object.entries(series || {}).map(([date, values]) => ({
    date,
    open: Number(values["1. open"]),
    high: Number(values["2. high"]),
    low: Number(values["3. low"]),
    close: Number(values["4. close"]),
    volume: Number(values["6. volume"] || values["5. volume"]),
  }));
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

async function getStockData({ symbol, strongPick }) {
  if (!ALPHAVANTAGE_API_KEY) {
    throw new Error("Missing ALPHAVANTAGE_API_KEY for stock research.");
  }

  let ticker = symbol;
  if (strongPick || !ticker) {
    ticker = await pickStrongStock();
  }

  const seriesUrl = `${ALPHA_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(
    ticker
  )}&outputsize=compact&apikey=${ALPHAVANTAGE_API_KEY}`;
  const seriesData = await fetchJson(seriesUrl);
  const series = seriesData["Time Series (Daily)"];
  if (!series) {
    throw new Error("Unable to fetch stock time series data.");
  }

  const rows = parseAlphaSeries(series);
  if (rows.length < 2) {
    throw new Error("Not enough data for stock research.");
  }

  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const changeValue = latest.close - previous.close;
  const changePct = (changeValue / previous.close) * 100;

  const ohlc = rows.slice(-90).map((row) => ({
    time: Math.floor(new Date(row.date).getTime() / 1000),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
  }));

  const closes = rows.map((row) => row.close);
  const indicators = {
    sma20: computeSMA(closes, 20),
    sma50: computeSMA(closes, 50),
    ema20: computeEMA(closes, 20),
    ema50: computeEMA(closes, 50),
    rsi14: computeRSI(closes, 14),
    macd: computeMACD(closes),
    volatility30d: computeVolatility(closes, 30),
  };

  let fundamentals = null;
  try {
    const overviewUrl = `${ALPHA_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(
      ticker
    )}&apikey=${ALPHAVANTAGE_API_KEY}`;
    const overview = await fetchJson(overviewUrl);
    if (overview && overview.Symbol) {
      fundamentals = {
        name: overview.Name,
        sector: overview.Sector,
        industry: overview.Industry,
        marketCap: overview.MarketCapitalization,
        peRatio: overview.PERatio,
        profitMargin: overview.ProfitMargin,
        dividendYield: overview.DividendYield,
        week52High: overview.WeekHigh52,
        week52Low: overview.WeekLow52,
      };
    }
  } catch (err) {
    fundamentals = { error: err.message };
  }

  return {
    market: "stockmarket",
    asset: {
      id: ticker.toUpperCase(),
      symbol: ticker.toUpperCase(),
      name: fundamentals?.name || "",
    },
    price: {
      value: latest.close,
      currency: "USD",
      changePct1d: changePct,
      changeValue1d: changeValue,
      lastUpdated: latest.date,
    },
    volume: {
      value: latest.volume,
      currency: "Shares",
    },
    marketCap: fundamentals?.marketCap ? { value: Number(fundamentals.marketCap), currency: "USD" } : null,
    ohlc,
    indicators,
    fundamentals,
    onchain: null,
    newsQuery: `${ticker} stock`,
  };
}

const NEWS_SOURCES = {
  crypto: [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { name: "CryptoSlate", url: "https://cryptoslate.com/feed/" },
  ],
  stockmarket: [
    { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
    { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
    { name: "Financial Times", url: "https://www.ft.com/?format=rss" },
  ],
};

async function fetchRss(url) {
  const response = await fetch(url, { headers: { "User-Agent": "StackSkiesBot/1.0" } });
  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status}`);
  }
  const xml = await response.text();
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel || parsed?.feed;
  const rawItems = channel?.item || channel?.entry || [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  return items
    .map((item) => ({
      title: stripHtml(item.title),
      body: stripHtml(item.description || item.summary || item["content:encoded"] || ""),
      link: item.link?.href || item.link || "",
      published: item.pubDate || item.published || item.updated || "",
    }))
    .filter((item) => item.title);
}

function normalizeNews(items) {
  return items
    .map((item) => {
      const date = item.published ? new Date(item.published) : null;
      return {
        ...item,
        publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      };
    })
    .sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });
}

async function fetchNewsApi(query) {
  if (!NEWSAPI_API_KEY) return [];
  try {
    const url = `${NEWSAPI_BASE}?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=6`;
    const data = await fetchJson(url, { headers: { "X-Api-Key": NEWSAPI_API_KEY } });
    const articles = data?.articles || [];
    return articles.map((article) => ({
      title: article.title,
      body: article.description || "",
      link: article.url,
      published: article.publishedAt,
      source: article.source?.name || "NewsAPI",
    }));
  } catch (err) {
    return [];
  }
}

async function getNews({ market, query }) {
  const sources = NEWS_SOURCES[market] || [];
  const rssResults = await Promise.allSettled(
    sources.map(async (source) => {
      const items = await fetchRss(source.url);
      return items.map((item) => ({
        ...item,
        source: source.name,
      }));
    })
  );

  const apiResults = await fetchNewsApi(query || market);
  const rssItems = rssResults
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);

  const combined = normalizeNews([...rssItems, ...apiResults]);

  const seen = new Set();
  const deduped = [];
  combined.forEach((item) => {
    const key = `${item.title}-${item.source}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });

  return deduped.slice(0, 8);
}

async function buildReport({ market, asset, price, indicators, fundamentals, onchain, news, risk, horizon }) {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  const payload = {
    market,
    asset,
    price,
    indicators,
    fundamentals,
    onchain,
    news: (news || []).slice(0, 6).map((item) => ({
      title: item.title,
      source: item.source,
      publishedAt: item.publishedAt,
    })),
    risk,
    horizon,
  };

  const prompt =
    "You are a market research analyst. Use the provided data to create a full research report. " +
    "Return JSON only with keys: summary (string), thesis (string), catalysts (array of strings), " +
    "risks (array of strings), scenarios (object with bull, base, bear strings). " +
    "Avoid financial advice or trade execution steps. Mention uncertainty and risk management.\n" +
    `Data: ${JSON.stringify(payload).slice(0, 6000)}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "http://localhost",
      "X-Title": "StackSkies Market Agent",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a research assistant. Avoid financial advice or trade execution." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonFromText(content);
  if (!parsed) {
    return { summary: safeTrim(content) };
  }
  return parsed;
}

app.post("/api/research", async (req, res) => {
  const { market, symbol, risk, horizon, strongPick } = req.body || {};

  try {
    let marketData;
    if (market === "stockmarket") {
      marketData = await getStockData({ symbol, strongPick });
    } else {
      marketData = await getCryptoData({ symbol, strongPick });
    }

    const news = await getNews({ market: marketData.market, query: marketData.newsQuery });
    const report = await buildReport({
      market: marketData.market,
      asset: marketData.asset,
      price: marketData.price,
      indicators: marketData.indicators,
      fundamentals: marketData.fundamentals,
      onchain: marketData.onchain,
      news,
      risk,
      horizon,
    });

    res.json({
      ok: true,
      result: {
        ...marketData,
        news,
        report,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages, market, symbol } = req.body || {};

  if (!OPENROUTER_API_KEY) {
    res.status(500).json({ ok: false, error: "Missing OPENROUTER_API_KEY" });
    return;
  }

  const safeMessages = Array.isArray(messages)
    ? messages
        .filter((item) => item && typeof item.content === "string" && typeof item.role === "string")
        .slice(-12)
    : [];

  const systemPrompt =
    "You are a market research assistant. Avoid financial advice or trade execution steps. " +
    "Keep responses concise, risk-aware, and explain reasoning.";

  const context = `Market: ${market || "unknown"}. Symbol/topic: ${symbol || "not specified"}.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "http://localhost",
        "X-Title": "StackSkies Market Agent",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: context },
          ...safeMessages,
        ],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    res.json({ ok: true, message: safeTrim(content) || "No response received." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/news", async (req, res) => {
  const market = req.query.market === "stockmarket" ? "stockmarket" : "crypto";
  try {
    const items = await getNews({ market, query: market });
    res.json({ ok: true, items });
  } catch (err) {
    res.status(200).json({ ok: false, items: [], error: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`StackSkies running on http://localhost:${PORT}`);
});
