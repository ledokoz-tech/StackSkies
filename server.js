require("dotenv").config();
const express = require("express");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const fetch = global.fetch || ((...args) => import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args)));

const app = express();
const PORT = process.env.PORT || 5173;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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

async function callOpenRouter({ market, symbol, risk, horizon, strongPick }) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY");
  }

  const topic = symbol || (market === "crypto" ? "strong crypto candidate" : "strong stock candidate");
  const prompt =
    `You are a market research agent. Provide a concise research summary for ${topic}.\n` +
    `Market: ${market}. Risk profile: ${risk}. Horizon: ${horizon}.\n` +
    "If the user did not provide a symbol, choose a strong candidate and include its name or symbol in asset.\n" +
    "Return JSON only with keys: asset (string), thesis (string), signals (array of strings), risks (string), allocation (string). " +
    "Do not give financial advice or trade execution steps. Emphasize risk management.";

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
      temperature: 0.35,
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
    return {
      asset: symbol || "",
      thesis: safeTrim(content) || "No thesis returned.",
      signals: ["Unable to parse signals from model response."],
      risks: "Unable to parse risks from model response.",
      allocation: "Unable to parse allocation from model response.",
    };
  }

  if (!parsed.asset) {
    parsed.asset = symbol || "";
  }

  return parsed;
}

app.post("/api/research", async (req, res) => {
  const { market, symbol, risk, horizon, strongPick } = req.body || {};

  try {
    const result = await callOpenRouter({ market, symbol, risk, horizon, strongPick });
    res.json({ ok: true, result });
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

const NEWS_SOURCES = {
  crypto: [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  ],
  stockmarket: [
    { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories/" },
    { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
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

app.get("/api/news", async (req, res) => {
  const market = req.query.market === "stockmarket" ? "stockmarket" : "crypto";
  const sources = NEWS_SOURCES[market] || [];

  try {
    const results = await Promise.all(
      sources.map(async (source) => {
        const items = await fetchRss(source.url);
        return items.map((item) => ({
          ...item,
          source: source.name,
        }));
      })
    );

    const merged = normalizeNews(results.flat()).slice(0, 6);
    res.json({ ok: true, items: merged });
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
