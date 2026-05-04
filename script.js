// ==============================
// MONVY REDESIGN — LÓGICA
// ==============================

// ---------- ESTADO ----------
let saldo = 0;
let totalEntradas = 0;
let totalSaidas = 0;
let movimentacoes = [];
let metas = [];
let tipoAtual = '';
let metaAtualIndex = -1;
let respostaPergunta = '';

const pageTitles = {
  inicio: 'Dashboard',
  gastos: 'Gastos',
  metas: 'Metas',
  dividas: 'Simulador de Dívidas',
  investimentos: 'Investimentos',
  aprender: 'Aprender'
};

// ---------- NAVEGAÇÃO ----------
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function(e) {
    e.preventDefault();
    irPara(this.dataset.tela);
  });
});

function irPara(tela) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tela="${tela}"]`).classList.add('active');
  document.getElementById('tela-' + tela).classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[tela] || 'Monvy';
  if (tela === 'gastos') atualizarTelaCategorias();
}

// ---------- FORMATO ----------
function fmt(valor) {
  return 'R$ ' + Math.abs(valor).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---------- ATUALIZAR KPIs ----------
function atualizarKPIs() {
  document.getElementById('saldo-display').textContent = fmt(saldo);
  document.getElementById('saldo-mes').textContent = `Este mês: +${fmt(totalEntradas)} entrou`;
  document.getElementById('kpi-entradas').textContent = fmt(totalEntradas);
  document.getElementById('kpi-saidas').textContent = fmt(totalSaidas);
  document.getElementById('kpi-movs').textContent = movimentacoes.length;
}

// ---------- CHART ----------
let chartInstance = null;

function atualizarChart() {
  const canvas = document.getElementById('chart-fluxo');
  const emptyEl = document.getElementById('chart-empty');

  if (movimentacoes.length === 0) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'flex';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  // Agrupar por ordem de registro (últimas 8)
  const ultimas = movimentacoes.slice(-8);
  const labels = ultimas.map((m, i) => `#${movimentacoes.indexOf(m) + 1}`);
  const entradas = ultimas.map(m => m.tipo === 'ganho' ? m.valor : 0);
  const saidas   = ultimas.map(m => m.tipo === 'gasto' ? m.valor : 0);

  if (chartInstance) chartInstance.destroy();

  const ctx = canvas.getContext('2d');

  const gradGreen = ctx.createLinearGradient(0, 0, 0, 180);
  gradGreen.addColorStop(0, 'rgba(34,197,94,0.3)');
  gradGreen.addColorStop(1, 'rgba(34,197,94,0)');

  const gradRed = ctx.createLinearGradient(0, 0, 0, 180);
  gradRed.addColorStop(0, 'rgba(239,68,68,0.25)');
  gradRed.addColorStop(1, 'rgba(239,68,68,0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Entradas',
          data: entradas,
          borderColor: '#22C55E',
          backgroundColor: gradGreen,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#22C55E',
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Saídas',
          data: saidas,
          borderColor: '#EF4444',
          backgroundColor: gradRed,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#EF4444',
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A2235',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#94A3B8',
          bodyColor: '#ffffff',
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: R$ ${ctx.raw.toFixed(2).replace('.', ',')}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748B', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#64748B',
            font: { size: 11 },
            callback: v => 'R$' + v.toFixed(0)
          }
        }
      }
    }
  });
}

// ---------- LISTA INÍCIO ----------
function atualizarListaInicio() {
  const lista = document.getElementById('lista-inicio');
  if (movimentacoes.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhuma movimentação ainda. Comece registrando!</div>';
    return;
  }
  const ultimas = [...movimentacoes].reverse().slice(0, 8);
  lista.innerHTML = ultimas.map(m => `
    <div class="mov-item">
      <div class="mov-left">
        <div class="mov-dot ${m.tipo === 'ganho' ? 'g' : 'r'}"></div>
        <div class="mov-info">
          <span class="mov-desc">${m.descricao || (m.tipo === 'ganho' ? 'Entrada' : 'Saída')}</span>
          <span class="mov-cat">${m.tipo === 'ganho' ? 'Entrada' : m.categoria}</span>
        </div>
      </div>
      <span class="mov-valor ${m.tipo === 'ganho' ? 'positivo' : 'negativo'}">
        ${m.tipo === 'ganho' ? '+' : '-'}${fmt(m.valor)}
      </span>
    </div>
  `).join('');
}

// ---------- MODAL ----------
function abrirModal(tipo) {
  tipoAtual = tipo;
  respostaPergunta = '';
  document.getElementById('modal-titulo').textContent = tipo === 'ganho' ? '💚 Registrar Entrada' : '❤️ Registrar Saída';
  document.getElementById('modal-valor').value = '';
  document.getElementById('modal-descricao').value = '';
  document.getElementById('modal-categoria-area').style.display = tipo === 'gasto' ? 'block' : 'none';
  document.getElementById('modal-pergunta').classList.add('hidden');
  document.getElementById('btn-confirmar').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
}

function fecharModal() {
  document.getElementById('modal').classList.add('hidden');
}

function confirmarModal() {
  const valor = parseFloat(document.getElementById('modal-valor').value);
  if (!valor || valor <= 0) { alert('Digite um valor válido!'); return; }

  if (tipoAtual === 'gasto' && respostaPergunta === '') {
    document.getElementById('modal-pergunta').classList.remove('hidden');
    document.getElementById('btn-confirmar').classList.add('hidden');
    return;
  }

  const descricao = document.getElementById('modal-descricao').value || (tipoAtual === 'ganho' ? 'Entrada' : 'Saída');
  const categoria = document.getElementById('modal-categoria').value;
  registrar(valor, descricao, categoria);
  fecharModal();
}

function responderPergunta(resposta) {
  respostaPergunta = resposta;
  const valor = parseFloat(document.getElementById('modal-valor').value);
  const descricao = document.getElementById('modal-descricao').value || 'Saída';
  const categoria = document.getElementById('modal-categoria').value;

  if (resposta === 'desejo') {
    const continuar = confirm('🛍️ Isso é um desejo!\n\nVocê tem certeza que quer gastar?\n\nPense bem antes de confirmar 💭');
    if (!continuar) { fecharModal(); return; }
  }

  registrar(valor, descricao, categoria);
  fecharModal();
}

function registrar(valor, descricao, categoria) {
  const mov = { tipo: tipoAtual, valor, descricao, categoria, resposta: respostaPergunta };
  movimentacoes.push(mov);

  if (tipoAtual === 'ganho') {
    saldo += valor;
    totalEntradas += valor;
  } else {
    saldo -= valor;
    totalSaidas += valor;
  }

  atualizarKPIs();
  atualizarListaInicio();
  atualizarChart();
}

// ---------- GASTOS ----------
function atualizarTelaCategorias() {
  const cats = { Casa: 0, Alimentação: 0, Transporte: 0, Lazer: 0, Saúde: 0, Outros: 0 };
  movimentacoes.filter(m => m.tipo === 'gasto').forEach(m => {
    if (cats[m.categoria] !== undefined) cats[m.categoria] += m.valor;
  });

  document.getElementById('cat-casa').textContent        = fmt(cats['Casa']);
  document.getElementById('cat-alimentacao').textContent = fmt(cats['Alimentação']);
  document.getElementById('cat-transporte').textContent  = fmt(cats['Transporte']);
  document.getElementById('cat-lazer').textContent       = fmt(cats['Lazer']);
  document.getElementById('cat-saude').textContent       = fmt(cats['Saúde']);
  document.getElementById('cat-outros').textContent      = fmt(cats['Outros']);

  const tbody = document.getElementById('tabela-gastos');
  const count = document.getElementById('table-count');
  count.textContent = movimentacoes.length + ' registros';

  if (movimentacoes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="vazio">Nenhuma movimentação ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = [...movimentacoes].reverse().map(m => `
    <tr>
      <td>${m.descricao}</td>
      <td>${m.tipo === 'ganho' ? '—' : m.categoria}</td>
      <td><span class="badge ${m.tipo}">${m.tipo === 'ganho' ? '↑ Entrada' : '↓ Saída'}</span></td>
      <td class="mov-valor ${m.tipo === 'ganho' ? 'positivo' : 'negativo'}">${m.tipo === 'ganho' ? '+' : '-'}${fmt(m.valor)}</td>
    </tr>
  `).join('');
}

// ---------- METAS ----------
function criarMeta() {
  const nome = document.getElementById('meta-nome').value.trim();
  const valor = parseFloat(document.getElementById('meta-valor').value);
  if (!nome || !valor || valor <= 0) { alert('Preencha nome e valor!'); return; }
  metas.push({ nome, objetivo: valor, atual: 0 });
  document.getElementById('meta-nome').value = '';
  document.getElementById('meta-valor').value = '';
  renderizarMetas();
}

function renderizarMetas() {
  const lista = document.getElementById('lista-metas');
  if (metas.length === 0) { lista.innerHTML = '<div class="vazio">Nenhuma meta ainda.</div>'; return; }
  lista.innerHTML = metas.map((m, i) => {
    const pct = Math.min(100, Math.round((m.atual / m.objetivo) * 100));
    return `
      <div class="meta-card">
        <div class="meta-topo">
          <span class="meta-nome">🎯 ${m.nome}</span>
          <span class="meta-valores">${fmt(m.atual)} / ${fmt(m.objetivo)}</span>
        </div>
        <div class="meta-barra-bg"><div class="meta-barra-fill" style="width:${pct}%"></div></div>
        <div class="meta-rodape">
          <span class="meta-pct">${pct}% concluído</span>
          <button class="btn-meta" onclick="abrirModalMeta(${i})">+ Adicionar</button>
        </div>
      </div>`;
  }).join('');
}

function abrirModalMeta(index) {
  metaAtualIndex = index;
  document.getElementById('modal-meta-nome-display').textContent = '🎯 ' + metas[index].nome;
  document.getElementById('modal-meta-valor').value = '';
  document.getElementById('modal-meta').classList.remove('hidden');
}

function fecharModalMeta() { document.getElementById('modal-meta').classList.add('hidden'); }

function adicionarMeta() {
  const valor = parseFloat(document.getElementById('modal-meta-valor').value);
  if (!valor || valor <= 0) { alert('Digite um valor válido!'); return; }
  metas[metaAtualIndex].atual += valor;
  fecharModalMeta();
  renderizarMetas();
}

// ---------- DÍVIDAS ----------
function calcularDivida() {
  const valor    = parseFloat(document.getElementById('div-valor').value);
  const juros    = parseFloat(document.getElementById('div-juros').value) / 100;
  const parcelas = parseInt(document.getElementById('div-parcelas').value);
  if (!valor || !juros || !parcelas) { alert('Preencha todos os campos!'); return; }

  const parcela    = valor * (juros * Math.pow(1 + juros, parcelas)) / (Math.pow(1 + juros, parcelas) - 1);
  const total      = parcela * parcelas;
  const jurosTotal = total - valor;
  const pct        = ((jurosTotal / valor) * 100).toFixed(0);

  document.getElementById('div-original').textContent    = fmt(valor);
  document.getElementById('div-juros-total').textContent = fmt(jurosTotal);
  document.getElementById('div-total').textContent       = fmt(total);
  document.getElementById('div-parcela').textContent     = fmt(parcela) + '/mês';
  document.getElementById('div-alerta').textContent      =
    `⚠️ Você vai pagar ${pct}% a mais do valor original! Em ${parcelas} meses, ${fmt(jurosTotal)} vai direto para o banco.`;
  document.getElementById('resultado-divida').classList.remove('hidden');
}

// ---------- INVESTIMENTOS ----------
function calcularInvestimentos() {
  const valorInicial = parseFloat(document.getElementById('inv-valor-inicial').value) || 0;
  const aporte       = parseFloat(document.getElementById('inv-aporte').value) || 0;
  const meses        = parseInt(document.getElementById('inv-meses').value);
  if ((!valorInicial && !aporte) || !meses) { alert('Preencha pelo menos o valor inicial e o período!'); return; }

  const taxas = { poupanca: 0.005, selic: 0.009, cdb: 0.01 };

  function calcComAporte(taxa) {
    let total = valorInicial;
    for (let i = 0; i < meses; i++) {
      total = total * (1 + taxa) + aporte;
    }
    return total;
  }

  const tp = calcComAporte(taxas.poupanca);
  const ts = calcComAporte(taxas.selic);
  const tc = calcComAporte(taxas.cdb);
  const totalInvestido = valorInicial + aporte * meses;

  document.getElementById('inv-poupanca').textContent       = fmt(tp);
  document.getElementById('inv-poupanca-ganho').textContent = '+' + fmt(tp - totalInvestido) + ' de rendimento';
  document.getElementById('inv-selic').textContent          = fmt(ts);
  document.getElementById('inv-selic-ganho').textContent    = '+' + fmt(ts - totalInvestido) + ' de rendimento';
  document.getElementById('inv-cdb').textContent            = fmt(tc);
  document.getElementById('inv-cdb-ganho').textContent      = '+' + fmt(tc - totalInvestido) + ' de rendimento';

  document.getElementById('resultado-inv').classList.remove('hidden');
}

// ---------- BOLSA DE VALORES B3 — MODELO APRIMORADO ----------
const ACOES_B3  = ['PETR4','VALE3','ITUB4','BBDC4','ABEV3','WEGE3','RENT3','BBAS3','SUZB3','BPAC11'];
const FIIS_B3   = ['MXRF11','KNRI11','HGLG11','XPML11','VISC11','RBRF11','IRDM11','CPTS11'];
const BDRS_B3   = ['JBSS32','NVDC34','AMZO34','MSFT34','AAPL34'];
const CRYPTO_B3 = ['BTC','ETH','SOL'];
const TODOS_B3  = [...ACOES_B3, ...FIIS_B3, ...BDRS_B3];

const CAT_LABELS_B3 = { acoes: 'Ações', fiis: 'Fundos Imobiliários', bdrs: 'BDRs', crypto: 'Criptomoedas' };

let ativosCache = {};
let bolsaFiltroAtual = 'todos';
let bolsaSearchTerm  = '';
let favoritosB3 = JSON.parse(localStorage.getItem('b3_favs') || '[]');
let ativoDetalheAtual = null;
let b3ChartInstance = null;

// Cripto local (preços estáticos como fallback)
const CRYPTO_MOCK = {
  BTC: { symbol:'BTC', shortName:'Bitcoin',  regularMarketPrice:312450, regularMarketChangePercent:2.85, regularMarketDayLow:305000, regularMarketDayHigh:315000, regularMarketVolume:null, exchange:'Crypto', logourl:null },
  ETH: { symbol:'ETH', shortName:'Ethereum', regularMarketPrice:15820,  regularMarketChangePercent:-0.93, regularMarketDayLow:15400, regularMarketDayHigh:16100, regularMarketVolume:null, exchange:'Crypto', logourl:null },
  SOL: { symbol:'SOL', shortName:'Solana',   regularMarketPrice:820.40, regularMarketChangePercent:4.12, regularMarketDayLow:790, regularMarketDayHigh:835, regularMarketVolume:null, exchange:'Crypto', logourl:null },
};

// Detecta tipo do ativo
function tipoAtivo(symbol) {
  if (CRYPTO_B3.includes(symbol)) return 'Crypto';
  if (/\d{2}$/.test(symbol) && parseInt(symbol.slice(-2)) >= 30) return 'BDR';
  if (symbol.endsWith('11')) return 'FII';
  return 'Ação';
}

// Cor de fundo do avatar por símbolo
function logoColorB3(symbol) {
  const colors = { PETR4:'#1e3a5f',VALE3:'#1a3a2a',ITUB4:'#3b1a00',BBDC4:'#1a0030',WEGE3:'#002a40',ABEV3:'#2a1a00',RENT3:'#2a001a',BBAS3:'#001a3a',SUZB3:'#1a2a00',BPAC11:'#0a2040',MXRF11:'#1a1a3a',KNRI11:'#0f2a1a',HGLG11:'#2a2a00',XPML11:'#2a0020',VISC11:'#001a2a',RBRF11:'#1a0a2a',IRDM11:'#002a1a',CPTS11:'#2a1a1a',JBSS32:'#2a1500',NVDC34:'#101038',AMZO34:'#1a1500',MSFT34:'#001a2a',AAPL34:'#1a1a1a',BTC:'#2a1500',ETH:'#10103a',SOL:'#002820' };
  return colors[symbol] || '#1a1a2a';
}

// Renderiza logo/avatar do ativo
function renderLogoB3(symbol, logourl) {
  const initials = symbol.substring(0, 2);
  const bg = logoColorB3(symbol);
  if (logourl) {
    return `<div class="bolsa-logo" style="background:${bg}"><img src="${logourl}" alt="${symbol}" onerror="this.parentElement.innerHTML='<span style=color:#aaa;font-weight:800;font-size:10px>${initials}</span>'"></div>`;
  }
  return `<div class="bolsa-logo" style="background:${bg}"><span style="color:#aaa;font-weight:800;font-size:10px">${initials}</span></div>`;
}

// Formata preço em BRL
function fmtBRL(v) {
  if (v == null) return '—';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function carregarAtivosB3() {
  const lista = document.getElementById('b3-lista');
  lista.innerHTML = '<div class="b3-loading" style="padding:20px 16px">⏳ Carregando ativos...</div>';
  try {
    const tickers = TODOS_B3.join(',');
    const res = await fetch(`https://brapi.dev/api/quote/${tickers}?fundamental=false&logourl=true`, {headers:{"Authorization":"Bearer eHcu2c4JXhGAFG4MGj7Zim"}});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.results || json.results.length === 0) throw new Error('Sem resultados');
    ativosCache = {};
    json.results.forEach(a => { ativosCache[a.symbol] = a; });
    // Adiciona cripto mock
    Object.assign(ativosCache, CRYPTO_MOCK);
    bolsaRenderAtivos(bolsaFiltroAtual, bolsaSearchTerm);
  } catch(e) {
    // Usa cripto mock mesmo offline + mostra erro para renda variável
    Object.assign(ativosCache, CRYPTO_MOCK);
    lista.innerHTML = `<div class="b3-erro" style="margin:12px 16px;border-radius:10px">⚠️ Não foi possível carregar ativos da B3. Verifique sua conexão.<br><br><button onclick="carregarAtivosB3()" class="b3-retry-btn">🔄 Tentar novamente</button></div>`;
    console.error('B3 error:', e);
  }
}

function bolsaRenderAtivos(filtro, search) {
  const lista = document.getElementById('b3-lista');
  const q = (search || '').toUpperCase().trim();

  const grupos = [];
  if (filtro === 'todos' || filtro === 'acoes') grupos.push({ cat: 'acoes', tickers: ACOES_B3 });
  if (filtro === 'todos' || filtro === 'fiis')  grupos.push({ cat: 'fiis',  tickers: FIIS_B3  });
  if (filtro === 'todos' || filtro === 'bdrs')  grupos.push({ cat: 'bdrs',  tickers: BDRS_B3  });
  if (filtro === 'todos' || filtro === 'crypto') grupos.push({ cat: 'crypto', tickers: CRYPTO_B3 });

  let html = '';
  grupos.forEach(({ cat, tickers }) => {
    const ativos = tickers
      .map(t => ativosCache[t])
      .filter(a => a && (!q || a.symbol.includes(q) || (a.shortName || '').toUpperCase().includes(q)));
    if (!ativos.length) return;

    html += `<div class="bolsa-section-label">${CAT_LABELS_B3[cat]}</div>`;
    ativos.forEach(a => {
      const pct    = a.regularMarketChangePercent || 0;
      const varCls = pct >= 0 ? 'pos' : 'neg';
      const varStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
      const preco  = fmtBRL(a.regularMarketPrice);
      const tipo   = tipoAtivo(a.symbol);
      const nome   = (a.shortName || a.symbol).substring(0, 26);
      html += `<div class="bolsa-row" onclick="abrirDetalheB3('${a.symbol}')">
        ${renderLogoB3(a.symbol, a.logourl)}
        <div class="bolsa-info">
          <div class="bolsa-nome">${nome}<span class="bolsa-badge">${tipo}</span></div>
          <div class="bolsa-code">${a.symbol}</div>
        </div>
        <div class="bolsa-right">
          <div class="bolsa-preco">${preco}</div>
          <div class="bolsa-var ${varCls}">${varStr}</div>
        </div>
      </div>`;
    });
  });

  if (!html) html = '<div style="text-align:center;padding:32px 16px;color:var(--gray);font-size:.83rem">Nenhum ativo encontrado</div>';
  lista.innerHTML = html;
}

function bolsaSetTab(filtro, btn) {
  bolsaFiltroAtual = filtro;
  document.querySelectorAll('.bolsa-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (!Object.keys(ativosCache).length) carregarAtivosB3();
  else bolsaRenderAtivos(filtro, bolsaSearchTerm);
}

function bolsaFiltrar(v) {
  bolsaSearchTerm = v;
  if (!Object.keys(ativosCache).length) return;
  bolsaRenderAtivos(bolsaFiltroAtual, v);
}

// Compatibilidade com funções antigas (botões de busca manual removidos, mas mantém a função)
function filtrarAtivos(filtro, btn) { bolsaSetTab(filtro, btn); }
function buscarAtivoB3() {
  const input = document.getElementById('b3-busca-input');
  if (!input) return;
  const v = input.value.trim().toUpperCase();
  if (!v) return;
  bolsaSearchTerm = v;
  bolsaRenderAtivos(bolsaFiltroAtual, v);
}


// ---- DETALHE DO ATIVO ----
async function abrirDetalheB3(symbol) {
  ativoDetalheAtual = symbol;
  const a = ativosCache[symbol];
  if (!a) return;

  // Preenche dados estáticos
  document.getElementById('b3-det-symbol').textContent  = symbol;
  document.getElementById('b3-det-empresa').textContent = a.shortName || symbol;

  const preco = a.regularMarketPrice != null ? 'R$ ' + a.regularMarketPrice.toFixed(2).replace('.',',') : '—';
  document.getElementById('b3-det-preco').textContent = preco;

  const var1   = a.regularMarketChangePercent || 0;
  const change = a.regularMarketChange || 0;
  const seta   = var1 >= 0 ? '↑' : '↓';
  const badgeEl = document.getElementById('b3-det-var-badge');
  badgeEl.textContent = `${seta} R$ ${Math.abs(change).toFixed(2).replace('.',',')} (${Math.abs(var1).toFixed(2)}%)`;
  badgeEl.className   = 'b3-det-badge ' + (var1 >= 0 ? 'badge-pos' : 'badge-neg');

  const minDay = a.regularMarketDayLow  ? 'R$ ' + a.regularMarketDayLow.toFixed(2).replace('.',',')  : '—';
  const maxDay = a.regularMarketDayHigh ? 'R$ ' + a.regularMarketDayHigh.toFixed(2).replace('.',',') : '—';
  const vol    = a.regularMarketVolume  ? a.regularMarketVolume.toLocaleString('pt-BR')               : '—';
  document.getElementById('b3-det-min').textContent = minDay;
  document.getElementById('b3-det-max').textContent = maxDay;
  document.getElementById('b3-det-vol').textContent = vol;
  document.getElementById('b3-det-mkt').textContent = a.exchange || 'B3';

  // Favorito
  const favBtn = document.getElementById('b3-det-fav');
  favBtn.textContent = favoritosB3.includes(symbol) ? '♥' : '♡';
  favBtn.style.color = favoritosB3.includes(symbol) ? '#22c55e' : '';

  // Abre modal
  document.getElementById('modal-b3-detalhe').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Reset abas e carrega gráfico
  document.querySelectorAll('.b3-periodo-tab').forEach((t,i) => t.classList.toggle('active', i === 0));
  await carregarGraficoB3(symbol, '1d', '5m');
}

function fecharDetalheB3() {
  document.getElementById('modal-b3-detalhe').classList.add('hidden');
  document.body.style.overflow = '';
  if (b3ChartInstance) { b3ChartInstance.destroy(); b3ChartInstance = null; }
}

function toggleFavoritoB3() {
  const s = ativoDetalheAtual;
  if (!s) return;
  const idx = favoritosB3.indexOf(s);
  if (idx > -1) favoritosB3.splice(idx, 1);
  else favoritosB3.push(s);
  localStorage.setItem('b3_favs', JSON.stringify(favoritosB3));
  const favBtn = document.getElementById('b3-det-fav');
  favBtn.textContent = favoritosB3.includes(s) ? '♥' : '♡';
  favBtn.style.color = favoritosB3.includes(s) ? '#22c55e' : '';
}

async function mudarPeriodoB3(range, interval, btn) {
  document.querySelectorAll('.b3-periodo-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (ativoDetalheAtual) await carregarGraficoB3(ativoDetalheAtual, range, interval);
}

async function carregarGraficoB3(symbol, range, interval) {
  const loadEl = document.getElementById('b3-chart-loading');
  const canvas  = document.getElementById('b3-chart-canvas');
  loadEl.classList.remove('hidden');
  canvas.style.opacity = '0.3';
  if (b3ChartInstance) { b3ChartInstance.destroy(); b3ChartInstance = null; }

  try {
    const url = `https://brapi.dev/api/quote/${symbol}?range=${range}&interval=${interval}&fundamental=false&token=eHcu2c4JXhGAFG4MGj7Zim`;
    const res  = await fetch(url);
    const json = await res.json();
    const hist = json.results?.[0]?.historicalDataPrice || [];

    const labels = hist.map(p => {
      const d = new Date(p.date * 1000);
      if (range === '1d') return d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
    });
    const prices = hist.map(p => p.close);

    const isUp = prices.length < 2 || prices[prices.length-1] >= prices[0];
    const lineColor = isUp ? '#22c55e' : '#ef4444';

    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    b3ChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: prices,
          borderColor: lineColor,
          backgroundColor: grad,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => 'R$ ' + ctx.parsed.y.toFixed(2).replace('.',',') }
        }},
        scales: {
          x: { grid: { display: false }, ticks: { color: '#888', maxTicksLimit: 6, font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888', font: { size: 11 }, callback: v => 'R$' + v.toFixed(0) } }
        }
      }
    });

    canvas.style.opacity = '1';
  } catch(e) {
    console.error('Chart error:', e);
  } finally {
    loadEl.classList.add('hidden');
  }
}

// ---- BUSCAR ATIVO ----
async function buscarAtivoB3() {
  const input = document.getElementById('b3-busca-input').value.trim().toUpperCase();
  const res   = document.getElementById('b3-busca-resultado');
  if (!input) { res.innerHTML = '<div class="b3-erro">Digite um ticker válido.</div>'; return; }
  res.innerHTML = '<div class="b3-loading">⏳ Buscando...</div>';
  try {
    const r = await fetch(`https://brapi.dev/api/quote/${input}?fundamental=false&logourl=true`, {headers:{"Authorization":"Bearer eHcu2c4JXhGAFG4MGj7Zim"}});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    const a = json.results?.[0];
    if (!a) throw new Error('Não encontrado');
    // Salva no cache e abre detalhe
    ativosCache[a.symbol] = a;
    res.innerHTML = '';
    await abrirDetalheB3(a.symbol);
  } catch(e) {
    res.innerHTML = `<div class="b3-erro">⚠️ Ativo "${input}" não encontrado ou indisponível.</div>`;
  }
}

document.querySelector('[data-tela="investimentos"]').addEventListener('click', () => {
  setTimeout(() => { if (!Object.keys(ativosCache).length) carregarAtivosB3(); }, 100);
});

// ---------- ARTIGOS ----------
const artigos = [
  { titulo: '🛡️ O que é reserva de emergência?', conteudo: `<h2>🛡️ O que é reserva de emergência?</h2><p>Reserva de emergência é um dinheiro guardado exclusivamente para imprevistos: perder o emprego, um problema de saúde, um conserto urgente.</p><p><strong>Quanto guardar?</strong> O ideal é ter de 3 a 6 meses dos seus gastos mensais guardados.</p><p>Exemplo: se você gasta R$ 2.000 por mês, sua reserva deve ser entre R$ 6.000 e R$ 12.000.</p><p><strong>Onde guardar?</strong></p><ul><li>Tesouro Selic (recomendado)</li><li>CDB com liquidez diária</li><li>Conta remunerada</li></ul><p><strong>Por que é tão importante?</strong> Sem reserva, qualquer imprevisto vira dívida. Com reserva, você tem tranquilidade.</p>` },
  { titulo: '💳 Por que evitar o cartão de crédito?', conteudo: `<h2>💳 Por que evitar o cartão de crédito?</h2><p>O cartão de crédito não é dinheiro extra. É dinheiro adiantado que você vai ter que devolver.</p><p><strong>O perigo do rotativo:</strong> Se você não pagar a fatura completa, os juros podem ser de 15% a 20% ao mês.</p><p><strong>Como usar sem se prejudicar:</strong></p><ul><li>Nunca gaste mais do que você tem</li><li>Pague SEMPRE a fatura total</li><li>Evite parcelar compras desnecessárias</li></ul><p><strong>Regra de ouro:</strong> Se você precisa parcelar, provavelmente não pode comprar.</p>` },
  { titulo: '🔓 Como sair das dívidas?', conteudo: `<h2>🔓 Como sair das dívidas?</h2><p>Sair das dívidas é possível. Mas exige disciplina e um plano claro.</p><p><strong>Passo 1:</strong> Liste todas as suas dívidas — valor, juros e prazo.</p><p><strong>Passo 2:</strong> Priorize as com maior juros. Cartão e cheque especial primeiro.</p><p><strong>Passo 3:</strong> Negocie. Muitas empresas oferecem desconto para quitar à vista.</p><p><strong>Passo 4:</strong> Corte gastos desnecessários temporariamente.</p><p><strong>Passo 5:</strong> Use o Monvy para acompanhar seu progresso!</p>` },
  { titulo: '🧠 Necessidade vs Desejo', conteudo: `<h2>🧠 Necessidade vs Desejo</h2><p>Essa diferença é a base da educação financeira.</p><p><strong>Necessidade</strong> é o que você precisa para viver: alimentação, moradia, saúde, transporte.</p><p><strong>Desejo</strong> é o que você quer: roupas de marca, restaurante caro, o celular mais novo.</p><p>Desejos não são errados. O problema é quando tratamos desejos como necessidades.</p><p><strong>A regra das 24 horas:</strong> Esperou um dia e ainda quer? Talvez valha. Se esqueceu, era impulso.</p>` },
  { titulo: '📊 Regra dos 50-30-20', conteudo: `<h2>📊 Regra dos 50-30-20</h2><p>É o jeito mais simples de organizar seu salário.</p><p><strong>50% — Necessidades:</strong> Aluguel, mercado, contas, transporte.</p><p><strong>30% — Desejos:</strong> Lazer, roupas, restaurante, streaming.</p><p><strong>20% — Futuro:</strong> Reserva de emergência, investimentos, pagamento de dívidas.</p><p><strong>Exemplo com R$ 2.000:</strong></p><ul><li>R$ 1.000 — Necessidades</li><li>R$ 600 — Desejos</li><li>R$ 400 — Futuro</li></ul>` },
  { titulo: '🌱 Como começar a investir?', conteudo: `<h2>🌱 Como começar a investir?</h2><p>Você não precisa ser rico para investir. Pode começar com R$ 30.</p><p><strong>Antes de investir:</strong> Quite suas dívidas de alto juros e monte sua reserva primeiro.</p><p><strong>Primeiros passos:</strong></p><ul><li><strong>Tesouro Selic:</strong> O mais seguro. Ideal para reserva e primeiros investimentos.</li><li><strong>CDB:</strong> Seguro e com boa rentabilidade. Veja se tem liquidez diária.</li></ul><p><strong>O segredo:</strong> Consistência. Investir R$ 100 por mês todo mês é melhor que R$ 1.200 uma vez por ano.</p>` }
];

function abrirArtigo(index) {
  document.getElementById('artigo-conteudo').innerHTML = artigos[index].conteudo;
  document.getElementById('modal-artigo').classList.remove('hidden');
}

function fecharArtigo() { document.getElementById('modal-artigo').classList.add('hidden'); }

// ---------- FECHAR CLICANDO FORA ----------
['modal', 'modal-artigo', 'modal-meta'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });
});

// ---------- AUTH ----------
function logout() {
  if (confirm('Deseja sair da sua conta?')) {
    localStorage.removeItem('monvy_logado');
    window.location.href = 'auth.html';
  }
}

// Inicializar usuário logado
(function initUser() {
  const raw = localStorage.getItem('monvy_logado');
  if (!raw) return;
  const user = JSON.parse(raw);
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl && user.nome) {
    avatarEl.textContent = user.nome.charAt(0).toUpperCase();
    avatarEl.title = user.nome;
  }
  // Saudação no topbar
  const titleEl = document.getElementById('page-title');
  if (titleEl && user.nome) {
    // Nome curto na topbar ao iniciar
  }
})();

