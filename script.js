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
document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
  item.addEventListener('click', function(e) {
    e.preventDefault();
    irPara(this.dataset.tela);
  });
});

function irPara(tela) {
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.querySelectorAll(`[data-tela="${tela}"]`).forEach(el => el.classList.add('active'));
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
  document.getElementById('modal-titulo').textContent = tipo === 'ganho' ? 'Registrar Entrada' : 'Registrar Saída';
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
    const continuar = confirm('Isso é um desejo!\n\nVocê tem certeza que quer gastar?\n\nPense bem antes de confirmar');
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
          <span class="meta-nome">${m.nome}</span>
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
  document.getElementById('modal-meta-nome-display').textContent = metas[index].nome;
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
    `Você vai pagar ${pct}% a mais do valor original! Em ${parcelas} meses, ${fmt(jurosTotal)} vai direto para o banco.`;
  document.getElementById('resultado-divida').classList.remove('hidden');
}

// ---------- INVESTIMENTOS ----------
function calcularInvestimentos() {
  const valor = parseFloat(document.getElementById('inv-valor').value);
  const meses = parseInt(document.getElementById('inv-meses').value);
  if (!valor || !meses) { alert('Preencha todos os campos!'); return; }

  const taxas = { poupanca: 0.005, selic: 0.009, cdb: 0.01 };
  const calc  = taxa => valor * Math.pow(1 + taxa, meses);

  const tp = calc(taxas.poupanca);
  const ts = calc(taxas.selic);
  const tc = calc(taxas.cdb);

  document.getElementById('inv-poupanca').textContent       = fmt(tp);
  document.getElementById('inv-poupanca-ganho').textContent = '+' + fmt(tp - valor) + ' de rendimento';
  document.getElementById('inv-selic').textContent          = fmt(ts);
  document.getElementById('inv-selic-ganho').textContent    = '+' + fmt(ts - valor) + ' de rendimento';
  document.getElementById('inv-cdb').textContent            = fmt(tc);
  document.getElementById('inv-cdb-ganho').textContent      = '+' + fmt(tc - valor) + ' de rendimento';

  document.getElementById('resultado-inv').classList.remove('hidden');
}

// ---------- ARTIGOS ----------
const artigos = [
  { titulo: 'O que é reserva de emergência?', conteudo: `<h2>O que é reserva de emergência?</h2><p>Reserva de emergência é um dinheiro guardado exclusivamente para imprevistos: perder o emprego, um problema de saúde, um conserto urgente.</p><p><strong>Quanto guardar?</strong> O ideal é ter de 3 a 6 meses dos seus gastos mensais guardados.</p><p>Exemplo: se você gasta R$ 2.000 por mês, sua reserva deve ser entre R$ 6.000 e R$ 12.000.</p><p><strong>Onde guardar?</strong></p><ul><li>Tesouro Selic (recomendado)</li><li>CDB com liquidez diária</li><li>Conta remunerada</li></ul><p><strong>Por que é tão importante?</strong> Sem reserva, qualquer imprevisto vira dívida. Com reserva, você tem tranquilidade.</p>` },
  { titulo: 'Por que evitar o cartão de crédito?', conteudo: `<h2>Por que evitar o cartão de crédito?</h2><p>O cartão de crédito não é dinheiro extra. É dinheiro adiantado que você vai ter que devolver.</p><p><strong>O perigo do rotativo:</strong> Se você não pagar a fatura completa, os juros podem ser de 15% a 20% ao mês.</p><p><strong>Como usar sem se prejudicar:</strong></p><ul><li>Nunca gaste mais do que você tem</li><li>Pague SEMPRE a fatura total</li><li>Evite parcelar compras desnecessárias</li></ul><p><strong>Regra de ouro:</strong> Se você precisa parcelar, provavelmente não pode comprar.</p>` },
  { titulo: 'Como sair das dívidas?', conteudo: `<h2>Como sair das dívidas?</h2><p>Sair das dívidas é possível. Mas exige disciplina e um plano claro.</p><p><strong>Passo 1:</strong> Liste todas as suas dívidas — valor, juros e prazo.</p><p><strong>Passo 2:</strong> Priorize as com maior juros. Cartão e cheque especial primeiro.</p><p><strong>Passo 3:</strong> Negocie. Muitas empresas oferecem desconto para quitar à vista.</p><p><strong>Passo 4:</strong> Corte gastos desnecessários temporariamente.</p><p><strong>Passo 5:</strong> Use o Monvy para acompanhar seu progresso!</p>` },
  { titulo: 'Necessidade vs Desejo', conteudo: `<h2>Necessidade vs Desejo</h2><p>Essa diferença é a base da educação financeira.</p><p><strong>Necessidade</strong> é o que você precisa para viver: alimentação, moradia, saúde, transporte.</p><p><strong>Desejo</strong> é o que você quer: roupas de marca, restaurante caro, o celular mais novo.</p><p>Desejos não são errados. O problema é quando tratamos desejos como necessidades.</p><p><strong>A regra das 24 horas:</strong> Esperou um dia e ainda quer? Talvez valha. Se esqueceu, era impulso.</p>` },
  { titulo: 'Regra dos 50-30-20', conteudo: `<h2>Regra dos 50-30-20</h2><p>É o jeito mais simples de organizar seu salário.</p><p><strong>50% — Necessidades:</strong> Aluguel, mercado, contas, transporte.</p><p><strong>30% — Desejos:</strong> Lazer, roupas, restaurante, streaming.</p><p><strong>20% — Futuro:</strong> Reserva de emergência, investimentos, pagamento de dívidas.</p><p><strong>Exemplo com R$ 2.000:</strong></p><ul><li>R$ 1.000 — Necessidades</li><li>R$ 600 — Desejos</li><li>R$ 400 — Futuro</li></ul>` },
  { titulo: 'Como começar a investir?', conteudo: `<h2>Como começar a investir?</h2><p>Você não precisa ser rico para investir. Pode começar com R$ 30.</p><p><strong>Antes de investir:</strong> Quite suas dívidas de alto juros e monte sua reserva primeiro.</p><p><strong>Primeiros passos:</strong></p><ul><li><strong>Tesouro Selic:</strong> O mais seguro. Ideal para reserva e primeiros investimentos.</li><li><strong>CDB:</strong> Seguro e com boa rentabilidade. Veja se tem liquidez diária.</li></ul><p><strong>O segredo:</strong> Consistência. Investir R$ 100 por mês todo mês é melhor que R$ 1.200 uma vez por ano.</p>` }
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

// ---------- AUTH & TEMA ----------
function logout() {
  if (confirm('Deseja sair da sua conta?')) {
    localStorage.removeItem('monvy_logado');
    localStorage.removeItem('monvy_logged');
    window.location.href = 'auth.html';
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const moon = document.getElementById('theme-icon-moon');
  const sun = document.getElementById('theme-icon-sun');
  if (theme === 'light') {
    if (moon) moon.style.display = 'none';
    if (sun) sun.style.display = 'block';
  } else {
    if (moon) moon.style.display = 'block';
    if (sun) sun.style.display = 'none';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('monvy_theme', next);
  applyTheme(next);
}

// Inicializar
(function init() {
  // Tema
  const savedTheme = localStorage.getItem('monvy_theme') || 'dark';
  applyTheme(savedTheme);

  // Auth — tenta as duas chaves para compatibilidade
  const raw = localStorage.getItem('monvy_logado') || localStorage.getItem('monvy_logged');
  if (!raw) { window.location.href = 'auth.html'; return; }

  let user;
  try { user = JSON.parse(raw); } catch(e) { window.location.href = 'auth.html'; return; }

  const nome = user.nome || user.name || '';
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl && nome) {
    avatarEl.textContent = nome.charAt(0).toUpperCase();
    avatarEl.title = nome;
  }
  const greetEl = document.getElementById('topbar-greeting');
  if (greetEl && nome) greetEl.textContent = 'Olá, ' + nome.split(' ')[0];
})();
const script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
script.onload = () => atualizarChart();
document.head.appendChild(script);
