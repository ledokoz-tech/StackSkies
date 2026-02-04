# StackSkies — AI Market Research Agent

StackSkies is a full‑stack market research app that blends live crypto + stock data, technical indicators, on‑chain metrics, and multi‑source news into a structured research report. It also includes a ChatGPT‑style assistant backed by OpenRouter.

## Features
- **Live market data**
  - Crypto prices + OHLC history (CoinGecko)
  - Stock prices + OHLC history (Alpha Vantage)
- **Technical indicators**
  - RSI, MACD, SMA/EMA, volatility (computed locally)
- **Fundamentals (stocks)**
  - Company overview, sector, market cap, P/E, margins, 52‑week range (Alpha Vantage)
- **On‑chain metrics (crypto)**
  - Active addresses, transactions, market cap (CoinMetrics)
- **Live news**
  - RSS feeds + optional NewsAPI enrichment
- **Research report**
  - Summary, catalysts, risks, and bull/base/bear scenarios (OpenRouter)
- **ChatGPT‑style chat**
  - Ask follow‑ups and get quick risk‑aware responses (OpenRouter)

## Quick Start

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
Create `.env` in the project root (see `.env.example`):
```
OPENROUTER_API_KEY=your_openrouter_key_here
ALPHAVANTAGE_API_KEY=your_alpha_vantage_key_here
NEWSAPI_API_KEY=your_newsapi_key_here
COINMETRICS_API_KEY=
COINMETRICS_METRICS=AdrActCnt,TxCnt,CapMrktCurUSD
PORT=5173
```

### 3) Run the app
```bash
npm start
```
Then open:
```
http://localhost:5173
```

## Environment Variables
- `OPENROUTER_API_KEY` (required)
  - Used for research summaries and chat responses.
- `ALPHAVANTAGE_API_KEY` (required for stocks)
  - Enables stock price history and fundamentals.
- `NEWSAPI_API_KEY` (optional)
  - Adds additional real‑time news articles.
- `COINMETRICS_API_KEY` (optional)
  - Higher rate limits / richer on‑chain data.
- `COINMETRICS_METRICS` (optional)
  - Customize on‑chain metrics queried from CoinMetrics.
- `PORT` (optional)
  - Server port (default `5173`).

## Data Sources
- **Crypto prices & OHLC**: CoinGecko API
- **Stock prices & fundamentals**: Alpha Vantage API
- **On‑chain metrics**: CoinMetrics (community API by default)
- **News**: RSS feeds + NewsAPI (if configured)
- **AI research + chat**: OpenRouter

## API Endpoints
- `POST /api/research`
  - Body: `{ market, symbol, risk, horizon, strongPick }`
  - Returns: market data, indicators, news, and full report
- `POST /api/chat`
  - Body: `{ messages, market, symbol }`
  - Returns: assistant response
- `GET /api/news?market=crypto|stockmarket`
  - Returns: combined RSS + NewsAPI headlines
- `GET /api/health`
  - Returns: server health

## Project Structure
```
StackSkies/
  app.js           # Frontend logic
  index.html       # UI layout
  styles.css       # Visual system
  server.js        # API + data aggregation
  package.json     # Dependencies
  .env.example     # Environment template
```

## Research Flow
1. User selects **Crypto** or **Stockmarket** and optionally enters a symbol.
2. Server fetches **live market data** and **news**.
3. Technical indicators are computed locally.
4. OpenRouter generates a **structured report** (summary, catalysts, risks, scenarios).
5. UI renders the report + chart + metrics.

## Important Notes
- This app provides **research insights only** and does **not** execute trades.
- It is **not financial advice**.
- Some APIs (Alpha Vantage, NewsAPI) may have rate limits — upgrade if needed.

## Troubleshooting
- **Stocks not loading**: Check `ALPHAVANTAGE_API_KEY`.
- **News empty**: Add `NEWSAPI_API_KEY` or ensure RSS sources are reachable.
- **On‑chain metrics missing**: Try adding a `COINMETRICS_API_KEY`.
- **Chat/research errors**: Verify `OPENROUTER_API_KEY` and server logs.

## Next Ideas
- Add more news providers (Bloomberg, Benzinga, etc.).
- Integrate broker APIs for paper‑trading or real trading.
- Add intraday charts and order‑book analytics.

---

If you want any branding changes, deployment help, or new integrations, just say the word.
