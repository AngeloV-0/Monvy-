const cache = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ ok: false, erro: 'ticker obrigatório' });

  const tickerLimpo = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  // Cache de 2 minutos por ticker
  const agora = Date.now();
  if (cache[tickerLimpo] && agora - cache[tickerLimpo].ts < 120000) {
    return res.status(200).json(cache[tickerLimpo].data);
  }

  // Rate limit simples: max 50 req/hora por IP
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!handler._rl) handler._rl = {};
  const rl = handler._rl;
  const hora = Math.floor(agora / 3600000);
  const chave = `${ip}_${hora}`;
  rl[chave] = (rl[chave] || 0) + 1;
  if (rl[chave] > 50) {
    return res.status(429).json({ ok: false, erro: 'Muitas requisições. Tente novamente em instantes.' });
  }

  try {
    const url = `https://brapi.dev/api/quote/${tickerLimpo}?range=1d&interval=1d&fundamental=true`;
    const resp = await fetch(url);
    const json = await resp.json();

    if (!json.results?.length) {
      return res.status(404).json({ ok: false, erro: 'Ticker não encontrado. Verifique o código e tente novamente.' });
    }

    const a = json.results[0];
    const dados = {
      ok: true,
      ativo: {
        ticker:           a.symbol,
        nome:             a.longName || a.shortName || tickerLimpo,
        preco:            a.regularMarketPrice,
        variacao:         a.regularMarketChangePercent,
        variacao_valor:   a.regularMarketChange,
        abertura:         a.regularMarketOpen,
        minimo:           a.regularMarketDayLow,
        maximo:           a.regularMarketDayHigh,
        volume:           a.regularMarketVolume,
        mercado:          a.exchange,
        moeda:            a.currency || 'BRL',
        p_vp:             a.priceToBook        || null,
        dividend_yield:   a.dividendYield      || null,
        ultimo_dividendo: a.dividendsPerShare  || null,
        market_cap:       a.marketCap          || null,
        tipo:             a.quoteType          || 'EQUITY',
        atualizado_em:    new Date().toISOString(),
      }
    };

    cache[tickerLimpo] = { ts: agora, data: dados };
    return res.status(200).json(dados);
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'Erro ao consultar BRAPI: ' + e.message });
  }
}
