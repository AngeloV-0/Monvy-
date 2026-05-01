// ==============================
// MONVAY — LÓGICA COMPLETA
// ==============================
import {
  onAuth, fazerLogout as fbLogout, getPerfil,
  ouvirMovimentacoes, adicionarMovimentacao, atualizarMovimentacao, deletarMovimentacao,
  getMetas, adicionarMeta, atualizarMeta, deletarMeta,
  getDividas, adicionarDivida, atualizarDivida, deletarDivida,
  getContas, adicionarConta, atualizarConta, deletarConta,
  salvarPerfilVida as fbSalvarPerfilVida,
  salvarPerfil as fbSalvarPerfil,
  verificarEResetarMes, getHistorico,
  auth, db
} from './firebase.js';

// Expor auth e db para scripts inline do index.html
window._firebaseExports = { auth, db };

let currentUser = null;
let unsubMovimentacoes = null;

let saldo = 0, totalEntradas = 0, totalSaidas = 0;
let movimentacoes = [], metas = [];
let tipoAtual = '', metaAtualIndex = -1, respostaPergunta = '';
let editandoIndex = -1, filtroAtual = 'mes', relatorioMesOffset = 0;

const pageTitles = { inicio:'Dashboard', gastos:'Gastos', metas:'Metas', dividas:'Dívidas', investimentos:'Investimentos', aprender:'Aprender', relatorio:'Relatório Mensal', contas:'Contas a Pagar', score:'Score Financeiro' };
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// NAVEGAÇÃO
// Listeners registrados aqui no escopo do módulo (após DOM parseado, pois módulos são defer)
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const tela = this.dataset.tela;
    if (tela) irParaComHooks(tela);
  });
  item._monvayNavBound = true;
});

function irPara(tela) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[data-tela="'+tela+'"]').forEach(el => el.classList.add('active'));
  const telaEl = document.getElementById('tela-'+tela);
  if (telaEl) telaEl.classList.add('active');
  const titulo = pageTitles[tela] || 'Monvay';
  const ptEl = document.getElementById('page-title');
  if (ptEl) ptEl.textContent = titulo;
  const mobileTelaEl = document.getElementById('topbar-mobile-tela');
  if (mobileTelaEl) mobileTelaEl.textContent = titulo;
}

// Função principal de navegação com hooks por tela
// Definida logo após irPara para estar disponível para os listeners acima
function irParaComHooks(tela) {
  // Destruir chartInstance ao sair da tela inicio para evitar estado corrompido
  // quando o canvas fica display:none e o Chart.js perde o contexto de resize
  if (tela !== 'inicio' && chartInstance) {
    try { chartInstance.destroy(); } catch(e) {}
    chartInstance = null;
  }
  // 1. Navegação base (atualiza DOM)
  irPara(tela);
  // 2. Hooks por tela com delay para garantir DOM visível
  const D = 60;
  switch (tela) {
    case 'inicio':
      setTimeout(() => { try { executarManualEngine(); } catch(e) {} }, 200);
      setTimeout(() => { try { atualizarChart(); } catch(e) {} }, 250);
      break;
    case 'gastos':
      setTimeout(() => { try { atualizarTelaCategorias(); } catch(e) {} }, D);
      break;
    case 'dividas':
      setTimeout(() => { try { renderizarDividas(); atualizarKPIsDividas(); } catch(e) {} }, D);
      break;
    case 'score':
      setTimeout(() => { try { calcularScore(); } catch(e) {} }, 100);
      break;
    case 'investimentos':
      setTimeout(() => { try { buscarTaxasBCB(); } catch(e) {} }, D);
      break;
    case 'relatorio':
      setTimeout(() => { try { atualizarRelatorio(); carregarHistorico(); } catch(e) {} }, D);
      break;
    case 'contas':
      setTimeout(() => { try { renderizarContas(); } catch(e) {} }, D);
      break;
  }
}

// Expor globalmente IMEDIATAMENTE para que onclicks e drawer funcionem
window.irPara = irParaComHooks;

// FORMATO
function fmt(v) { return 'R$ '+Math.abs(v).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function fmtData(iso) { if (!iso) return ''; const [y,m,d]=iso.split('-'); return d+'/'+m+'/'+y; }
function hojeISO() { return new Date().toISOString().slice(0,10); }

// KPIs
function atualizarKPIs() {
  document.getElementById('saldo-display').textContent = fmt(saldo);
  document.getElementById('saldo-mes').textContent = 'Este mês: +'+fmt(totalEntradas)+' entrou';
  document.getElementById('kpi-entradas').textContent = fmt(totalEntradas);
  document.getElementById('kpi-saidas').textContent = fmt(totalSaidas);
  document.getElementById('kpi-movs').textContent = movimentacoes.length;
}

// CHART FLUXO
let chartInstance = null;
let fluxoModo = 'recentes'; // 'recentes' | 'todas'

function setFluxoModo(modo) {
  fluxoModo = modo;
  // Atualizar visual dos botões
  const btnR = document.getElementById('btn-fluxo-recentes');
  const btnT = document.getElementById('btn-fluxo-todas');
  if (btnR && btnT) {
    if (modo === 'recentes') {
      btnR.style.background = '#22c55e'; btnR.style.color = '#000';
      btnT.style.background = 'transparent'; btnT.style.color = '#64748b';
    } else {
      btnT.style.background = '#22c55e'; btnT.style.color = '#000';
      btnR.style.background = 'transparent'; btnR.style.color = '#64748b';
    }
  }
  atualizarChart();
}

function atualizarChart() {
  const canvas = document.getElementById('chart-fluxo');
  const emptyEl = document.getElementById('chart-empty');
  const subEl = document.getElementById('fluxo-sub');
  if (!canvas) return;
  if (movimentacoes.length === 0) { canvas.style.display='none'; emptyEl.style.display='flex'; return; }
  canvas.style.display='block'; emptyEl.style.display='none';

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gG = ctx.createLinearGradient(0,0,0,180); gG.addColorStop(0,'rgba(34,197,94,0.3)'); gG.addColorStop(1,'rgba(34,197,94,0)');
  const gR = ctx.createLinearGradient(0,0,0,180); gR.addColorStop(0,'rgba(239,68,68,0.25)'); gR.addColorStop(1,'rgba(239,68,68,0)');

  if (fluxoModo === 'recentes') {
    // --- MODO RECENTES: movimentações dos últimos 8 dias ---
    const corte8 = new Date(); corte8.setDate(corte8.getDate() - 7); corte8.setHours(0,0,0,0);
    const movsOrdenadas = [...movimentacoes]
      .filter(m => m.data && new Date(m.data) >= corte8)
      .sort((a, b) => new Date(a.data) - new Date(b.data));

    // Montar labels e datasets individuais
    // Cada ponto no eixo X é uma movimentação; entradas e saídas em datasets separados
    // Usamos índice global para alinhar os dois datasets no mesmo eixo
    const labels = movsOrdenadas.map((m, i) => {
      const [ano, mes, dia] = m.data.split('-');
      return `${dia}/${mes}`;
    });

    // Para cada posição do eixo X, entrada ou saída (null se não for do tipo)
    const dataEntradas = movsOrdenadas.map(m => m.tipo === 'ganho' ? m.valor : null);
    const dataSaidas   = movsOrdenadas.map(m => m.tipo !== 'ganho' ? m.valor : null);

    if (subEl) subEl.textContent = 'Últimos 8 dias (' + movsOrdenadas.length + (movsOrdenadas.length === 1 ? ' movimentação)' : ' movimentações)');

    chartInstance = new Chart(ctx, { type:'line', data:{ labels, datasets:[
      { label:'Entradas', data:dataEntradas, borderColor:'#22C55E', backgroundColor:gG, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#22C55E', pointRadius:5, pointHoverRadius:7, spanGaps:true },
      { label:'Saídas',   data:dataSaidas,   borderColor:'#EF4444', backgroundColor:gR, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#EF4444', pointRadius:5, pointHoverRadius:7, spanGaps:true }
    ]}, options:{ responsive:true, maintainAspectRatio:true, interaction:{intersect:false, mode:'index'},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1A2235', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          titleColor:'#94A3B8', bodyColor:'#fff', padding:10,
          callbacks:{
            title: items => {
              const m = movsOrdenadas[items[0].dataIndex];
              if (!m) return '';
              const [ano,mes,dia] = m.data.split('-');
              return `${dia}/${mes}/${ano}`;
            },
            label: c => {
              if (c.raw === null) return null;
              const m = movsOrdenadas[c.dataIndex];
              const sinal = m.tipo === 'ganho' ? '+' : '-';
              const nome = m.descricao || m.categoria || (m.tipo === 'ganho' ? 'Entrada' : 'Saída');
              return ` ${nome}: ${sinal}R$ ${Math.abs(c.raw).toFixed(2).replace('.',',')}`;
            },
            filter: item => item.raw !== null
          }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{ color:'#64748B', font:{size:10}, maxRotation:45, autoSkip:true, maxTicksLimit:16 } },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{ color:'#64748B', font:{size:11}, callback:v=>'R$'+v.toFixed(0) } }
      }
    }});

  } else {
    // --- MODO TODAS: cada movimentação individual do mês atual como um ponto ---
    const corte30 = new Date(); corte30.setDate(corte30.getDate() - 29); corte30.setHours(0,0,0,0);
    const movsOrdenadas = [...movimentacoes]
      .filter(m => m.data && new Date(m.data) >= corte30)
      .sort((a, b) => new Date(a.data) - new Date(b.data));

    // Fallback: se não há dados nos últimos 30 dias, usar todas
    const movsFinal = movsOrdenadas.length > 0
      ? movsOrdenadas
      : [...movimentacoes].filter(m => m.data).sort((a, b) => new Date(a.data) - new Date(b.data));

    const labels = movsFinal.map(m => {
      const [ano, mes, dia] = m.data.split('-');
      return `${dia}/${mes}`;
    });

    const dataEntradas = movsFinal.map(m => m.tipo === 'ganho' ? m.valor : null);
    const dataSaidas   = movsFinal.map(m => m.tipo !== 'ganho' ? m.valor : null);

    if (subEl) subEl.textContent = 'Últimos 30 dias (' + movsFinal.length + (movsFinal.length === 1 ? ' movimentação)' : ' movimentações)');

    chartInstance = new Chart(ctx, { type:'line', data:{ labels, datasets:[
      { label:'Entradas', data:dataEntradas, borderColor:'#22C55E', backgroundColor:gG, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#22C55E', pointRadius:5, pointHoverRadius:7, spanGaps:true },
      { label:'Saídas',   data:dataSaidas,   borderColor:'#EF4444', backgroundColor:gR, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#EF4444', pointRadius:5, pointHoverRadius:7, spanGaps:true }
    ]}, options:{ responsive:true, maintainAspectRatio:true, interaction:{intersect:false, mode:'index'},
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#1A2235', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          titleColor:'#94A3B8', bodyColor:'#fff', padding:10,
          callbacks:{
            title: items => {
              const m = movsFinal[items[0].dataIndex];
              if (!m) return '';
              const [ano,mes,dia] = m.data.split('-');
              return `${dia}/${mes}/${ano}`;
            },
            label: c => {
              if (c.raw === null) return null;
              const m = movsFinal[c.dataIndex];
              const sinal = m.tipo === 'ganho' ? '+' : '-';
              const nome = m.descricao || m.categoria || (m.tipo === 'ganho' ? 'Entrada' : 'Saída');
              return ` ${nome}: ${sinal}R$ ${Math.abs(c.raw).toFixed(2).replace('.',',')}`;
            },
            filter: item => item.raw !== null
          }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{ color:'#64748B', font:{size:10}, maxRotation:45, autoSkip:true, maxTicksLimit:16 } },
        y:{ grid:{color:'rgba(255,255,255,0.04)'}, ticks:{ color:'#64748B', font:{size:11}, callback:v=>'R$'+v.toFixed(0) } }
      }
    }});
  }
}

// CHART PIZZA
let chartPizza = null;
let tipoGraficoPizza = 'doughnut'; // 'doughnut' ou 'bar'

function setTipoGrafico(tipo) {
  tipoGraficoPizza = tipo;
  // Atualizar estilos dos botões
  const btnPizza = document.getElementById('btn-tipo-pizza');
  const btnColuna = document.getElementById('btn-tipo-coluna');
  if (btnPizza && btnColuna) {
    if (tipo === 'doughnut') {
      btnPizza.style.background = 'var(--primary)';
      btnPizza.style.color = '#000';
      btnColuna.style.background = 'transparent';
      btnColuna.style.color = 'var(--gray)';
    } else {
      btnColuna.style.background = 'var(--primary)';
      btnColuna.style.color = '#000';
      btnPizza.style.background = 'transparent';
      btnPizza.style.color = 'var(--gray)';
    }
  }
  // Re-renderizar com os dados atuais
  if (chartPizza) {
    const labels = chartPizza.data.labels;
    const data = chartPizza.data.datasets[0].data;
    const cats = {};
    labels.forEach((l, i) => cats[l] = data[i]);
    atualizarChartPizza(cats);
  }
}

function atualizarChartPizza(cats) {
  const canvas = document.getElementById('chart-pizza');
  const emptyEl = document.getElementById('pizza-empty');
  const legendaEl = document.getElementById('pizza-legenda');
  if (!canvas) return;
  const total = Object.values(cats).reduce((a,b)=>a+b,0);
  if (total === 0) { canvas.style.display='none'; if(emptyEl)emptyEl.style.display='flex'; if(legendaEl)legendaEl.innerHTML=''; return; }
  canvas.style.display='block'; if(emptyEl)emptyEl.style.display='none';
  const labels = Object.keys(cats).filter(k=>cats[k]>0);
  const data = labels.map(k=>cats[k]);
  const cores = ['#22C55E','#3B82F6','#F59E0B','#EF4444','#A855F7','#64748B'];
  if (chartPizza) chartPizza.destroy();

  if (tipoGraficoPizza === 'bar') {
    // Gráfico de colunas
    chartPizza = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: cores.slice(0, labels.length), borderWidth: 0, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.raw) + ' (' + ((c.raw/total)*100).toFixed(0) + '%)' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, callback: v => 'R$' + v } }
        }
      }
    });
    if (legendaEl) legendaEl.innerHTML = '';
  } else {
    // Gráfico de rosca (doughnut)
    chartPizza = new Chart(canvas.getContext('2d'), { type:'doughnut', data:{ labels, datasets:[{data, backgroundColor:cores.slice(0,labels.length), borderWidth:0, hoverOffset:6}]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.raw)+' ('+((c.raw/total)*100).toFixed(0)+'%)'}}}, cutout:'60%' }
    });
    if (legendaEl) {
      legendaEl.innerHTML = labels.map((l,i)=>`<div class="pizza-leg-item"><span style="width:10px;height:10px;border-radius:50%;background:${cores[i]};flex-shrink:0;display:inline-block"></span><span style="font-size:.78rem;color:var(--gray)">${l}</span><span style="font-size:.78rem;font-weight:600;color:var(--white);margin-left:auto">${((data[i]/total)*100).toFixed(0)}%</span></div>`).join('');
    }
  }
}

// FILTRO
function setFiltro(filtro, btn) {
  filtroAtual = filtro;
  document.querySelectorAll('.filtro-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  atualizarTelaCategorias();
}

function movsFiltradas() {
  const agora = new Date();
  return movimentacoes.filter(m => {
    if (filtroAtual==='todos'||!m.data) return true;
    const d = new Date(m.data+'T00:00:00');
    if (filtroAtual==='mes') return d.getMonth()===agora.getMonth()&&d.getFullYear()===agora.getFullYear();
    if (filtroAtual==='3meses') { const lim=new Date(agora); lim.setMonth(lim.getMonth()-3); return d>=lim; }
    if (filtroAtual==='ano') return d.getFullYear()===agora.getFullYear();
    return true;
  });
}

// LISTA INÍCIO
function atualizarListaInicio() {
  const lista = document.getElementById('lista-inicio');
  if (movimentacoes.length===0) { lista.innerHTML='<div class="vazio">Nenhuma movimentação ainda. Comece registrando!</div>'; return; }
  lista.innerHTML = [...movimentacoes].slice(0,8).map(m=>`
    <div class="mov-item">
      <div class="mov-left">
        <div class="mov-dot ${m.tipo==='ganho'?'g':'r'}"></div>
        <div class="mov-info">
          <span class="mov-desc">${m.descricao||(m.tipo==='ganho'?'Entrada':'Saída')}</span>
          <span class="mov-cat">${m.data?fmtData(m.data)+' · ':''}${m.tipo==='ganho'?'Entrada':m.categoria}</span>
        </div>
      </div>
      <span class="mov-valor ${m.tipo==='ganho'?'positivo':'negativo'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</span>
    </div>`).join('');
}

// MODAL REGISTRAR
function abrirModal(tipo) {
  tipoAtual=tipo; respostaPergunta='';
  document.getElementById('modal-titulo').textContent = tipo==='ganho'?'Registrar Entrada':'Registrar Saída';
  document.getElementById('modal-valor').value='';
  document.getElementById('modal-descricao').value='';
  document.getElementById('modal-data').value=hojeISO();
  document.getElementById('modal-recorrente').checked=false;
  document.getElementById('modal-categoria-area').style.display=tipo==='gasto'?'block':'none';
  document.getElementById('modal-pergunta').classList.add('hidden');
  document.getElementById('btn-confirmar').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
}

function fecharModal() { document.getElementById('modal').classList.add('hidden'); }

async function confirmarModal() {
  const valor = parseFloat(document.getElementById('modal-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  if (tipoAtual==='gasto'&&respostaPergunta==='') {
    document.getElementById('modal-pergunta').classList.remove('hidden');
    document.getElementById('btn-confirmar').classList.add('hidden');
    return;
  }
  const catEl = document.getElementById('modal-categoria');
  const categoria = (tipoAtual === 'gasto' && catEl) ? (catEl.value || 'Outros') : '';
  await registrar(
    valor,
    document.getElementById('modal-descricao').value || (tipoAtual==='ganho' ? 'Entrada' : 'Saída'),
    categoria,
    document.getElementById('modal-data').value || hojeISO(),
    document.getElementById('modal-recorrente').checked
  );
  fecharModal();
}

async function responderPergunta(resposta) {
  respostaPergunta = resposta;
  const valor = parseFloat(document.getElementById('modal-valor').value);
  if (resposta==='desejo') {
    if (!confirm('Isso é um desejo!\n\nVocê tem certeza que quer gastar?\n\nPense bem antes de confirmar')) {
      fecharModal(); return;
    }
  }
  const catEl = document.getElementById('modal-categoria');
  const categoria = catEl ? (catEl.value || 'Outros') : 'Outros';
  await registrar(
    valor,
    document.getElementById('modal-descricao').value || 'Saída',
    categoria,
    document.getElementById('modal-data').value || hojeISO(),
    document.getElementById('modal-recorrente').checked
  );
  fecharModal();
}

async function registrar(valor, descricao, categoria, data, recorrente) {
  if (!currentUser) { alert('Você precisa estar logado.'); return; }
  const mov = {
    tipo: tipoAtual,
    valor: Number(valor),
    descricao: descricao || (tipoAtual === 'ganho' ? 'Entrada' : 'Saída'),
    categoria: categoria || '',
    data: data || hojeISO(),
    recorrente: !!recorrente,
    resposta: respostaPergunta || ''
  };
  try {
    console.log('[Monvay] Salvando movimentação:', mov, 'uid:', currentUser.uid);
    await adicionarMovimentacao(currentUser.uid, mov);
    console.log('[Monvay] Movimentação salva com sucesso!');
  } catch(e) {
    console.error('[Monvay] ERRO ao salvar movimentação:', e.code, e.message);
    const msg = e && e.code === 'permission-denied'
      ? '❌ Sem permissão no Firestore!\n\nVerifique as regras no Firebase Console.'
      : e && e.code === 'unauthenticated'
      ? '❌ Usuário não autenticado!\n\nFaça login novamente.'
      : `❌ Erro ao salvar: ${e.message || e.code || 'Erro desconhecido'}`;
    alert(msg);
  }
}

function recalcular() { recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart(); }

// Aliases para compatibilidade Firebase
function atualizarListaMetas() { renderizarMetas(); }
function renderizarMovimentacoes() { atualizarListaInicio(); }
function recalcularTotais() {
  saldo=0; totalEntradas=0; totalSaidas=0;
  movimentacoes.forEach(m=>{ if(m.tipo==='ganho'){saldo+=m.valor;totalEntradas+=m.valor;}else{saldo-=m.valor;totalSaidas+=m.valor;} });
}

// EDITAR / EXCLUIR
function abrirModalEditar(index) {
  editandoIndex=index;
  const m = movimentacoes[index];
  document.getElementById('edit-valor').value=m.valor;
  document.getElementById('edit-descricao').value=m.descricao||'';
  document.getElementById('edit-data').value=m.data||hojeISO();
  document.getElementById('edit-categoria-area').style.display=m.tipo==='gasto'?'block':'none';
  if (m.tipo==='gasto') document.getElementById('edit-categoria').value=m.categoria||'Outros';
  document.getElementById('modal-editar').classList.remove('hidden');
}

function fecharModalEditar() { document.getElementById('modal-editar').classList.add('hidden'); editandoIndex=-1; }

async function salvarEdicao() {
  const valor = parseFloat(document.getElementById('edit-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  if (!currentUser) return;
  const m = movimentacoes[editandoIndex];
  if (!m || !m.id) return;
  const catEl = document.getElementById('edit-categoria');
  const dados = {
    valor: Number(valor),
    descricao: document.getElementById('edit-descricao').value || (m.tipo==='ganho' ? 'Entrada' : 'Saída'),
    data: document.getElementById('edit-data').value || hojeISO(),
    categoria: m.tipo==='gasto' ? (catEl ? catEl.value || 'Outros' : 'Outros') : (m.categoria || ''),
    recorrente: !!m.recorrente,
    resposta: m.resposta || ''
  };
  try {
    // Atualiza direto — preserva criadoEm original para não mudar a ordem de cadastro
    await atualizarMovimentacao(currentUser.uid, m.id, dados);
  } catch(e) {
    console.error('Erro ao editar:', e);
    alert('Erro ao salvar edição. Tente novamente.');
  }
  fecharModalEditar();
}

async function excluirMovimentacao() {
  if (!confirm('Excluir esta movimentação?')) return;
  if (!currentUser) return;
  const mov = movimentacoes[editandoIndex];
  if (mov && mov.id) {
    try {
      await deletarMovimentacao(currentUser.uid, mov.id);
      // onSnapshot atualiza automaticamente
    } catch(e) { console.error('Erro ao excluir:', e); }
  }
  fecharModalEditar();
}

// GASTOS
function atualizarTelaCategorias_v16_legado() {
  // Substituída pelo Módulo 2 — versão adaptativa no final do arquivo
}

// METAS
async function criarMeta() {
  const nome = document.getElementById('meta-nome').value.trim();
  const valor = parseFloat(document.getElementById('meta-valor').value);
  const atual = parseFloat(document.getElementById('meta-atual').value) || 0;
  const dataAlvo = document.getElementById('meta-data-alvo').value || null;
  if (!nome || !valor || valor <= 0) { alert('Preencha nome e valor!'); return; }
  if (!currentUser) return;
  try {
    const metaObj = { nome, objetivo: valor, atual, dataAlvo };
    const id = await adicionarMeta(currentUser.uid, metaObj);
    metas.push({ id, ...metaObj });
    document.getElementById('meta-nome').value = '';
    document.getElementById('meta-valor').value = '';
    document.getElementById('meta-atual').value = '';
    document.getElementById('meta-data-alvo').value = '';
    renderizarMetas();
    executarManualEngine();
  } catch(e) { console.error('Erro ao criar meta:', e); }
}

function calcularMensalMeta(m) {
  if (!m.dataAlvo) return null;
  const agora = new Date();
  const alvo = new Date(m.dataAlvo + '-01');
  const mesesRestantes = (alvo.getFullYear() - agora.getFullYear()) * 12 + (alvo.getMonth() - agora.getMonth());
  if (mesesRestantes <= 0) return null;
  const faltando = Math.max(0, m.objetivo - (m.atual || 0));
  return faltando / mesesRestantes;
}

function renderizarMetas() {
  const lista = document.getElementById('lista-metas');
  if (metas.length === 0) { lista.innerHTML = '<div class="vazio">Nenhuma meta ainda.</div>'; return; }
  lista.innerHTML = metas.map((m, i) => {
    const pct = Math.min(100, Math.round(((m.atual||0) / m.objetivo) * 100));
    const mensal = calcularMensalMeta(m);
    const dataStr = m.dataAlvo ? `<span style="color:var(--gray);font-size:.72rem">📅 ${m.dataAlvo.replace('-', '/')}</span>` : '';
    const mensalStr = mensal !== null ? `<div style="margin-top:6px;padding:7px 10px;background:rgba(34,197,94,0.08);border-radius:8px;font-size:.8rem;color:var(--primary)">💡 Guardar <strong>${fmt(mensal)}/mês</strong> para atingir no prazo</div>` : '';
    const concluida = pct >= 100;
    return `<div class="meta-card${concluida ? ' concluida' : ''}">
      <div class="meta-topo">
        <span class="meta-nome">${concluida ? '✅ ' : ''}${m.nome}</span>
        <span class="meta-valores">${fmt(m.atual||0)} / ${fmt(m.objetivo)}</span>
      </div>
      ${dataStr}
      <div class="meta-barra-bg"><div class="meta-barra-fill" style="width:${pct}%"></div></div>
      <div class="meta-rodape">
        <span class="meta-pct">${pct}% concluído</span>
        ${!concluida ? `<button class="btn-meta" onclick="abrirModalMetaPorId('${m.id}')">+ Adicionar</button>` : '<span style="color:var(--primary);font-size:.78rem;font-weight:600">🎉 Concluída!</span>'}
        <button onclick="excluirMeta('${m.id}')" style="background:none;border:none;cursor:pointer;color:var(--gray);font-size:.75rem;padding:2px 6px;border-radius:4px;margin-left:4px" title="Excluir meta">🗑️</button>
      </div>
      ${mensalStr}
    </div>`;
  }).join('');
}

async function excluirMeta(id) {
  if (!confirm('Excluir esta meta?')) return;
  if (!currentUser) return;
  try {
    await deletarMeta(currentUser.uid, id);
    metas = metas.filter(m => m.id !== id);
    renderizarMetas();
    if (typeof executarManualEngine === 'function') executarManualEngine();
  } catch(e) { console.error('Erro ao excluir meta:', e); alert('Erro ao excluir meta.'); }
}
function abrirModalMeta(index) {
  metaAtualIndex=index;
  document.getElementById('modal-meta-nome-display').textContent=metas[index].nome;
  document.getElementById('modal-meta-valor').value='';
  document.getElementById('modal-meta').classList.remove('hidden');
}

function fecharModalMeta() { document.getElementById('modal-meta').classList.add('hidden'); }

function abrirModalMetaPorId(id) {
  const index = metas.findIndex(m => m.id === id);
  if (index === -1) return;
  abrirModalMeta(index);
}

async function adicionarValorMeta() {
  const valor=parseFloat(document.getElementById('modal-meta-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  if (!currentUser) return;
  const meta = metas[metaAtualIndex];
  if (!meta) return;
  meta.atual = (meta.atual || 0) + valor;
  try {
    if (meta.id) await atualizarMeta(currentUser.uid, meta.id, {atual: meta.atual});
  } catch(e) { console.error('Erro ao atualizar meta:', e); }
  fecharModalMeta(); renderizarMetas();
}

// DÍVIDAS
function calcularDivida() {
  const valor=parseFloat(document.getElementById('sim-valor').value), juros=parseFloat(document.getElementById('sim-juros').value)/100, parcelas=parseInt(document.getElementById('sim-parcelas').value);
  if (!valor||!juros||!parcelas) { alert('Preencha valor, juros e parcelas para simular!'); return; }
  const parcela=valor*(juros*Math.pow(1+juros,parcelas))/(Math.pow(1+juros,parcelas)-1), total=parcela*parcelas, jurosTotal=total-valor, pct=((jurosTotal/valor)*100).toFixed(0);
  document.getElementById('div-original').textContent=fmt(valor); document.getElementById('div-juros-total').textContent=fmt(jurosTotal);
  document.getElementById('div-total').textContent=fmt(total); document.getElementById('div-parcela').textContent=fmt(parcela)+'/mês';
  document.getElementById('div-alerta').textContent='Você vai pagar '+pct+'% a mais do valor original! Em '+parcelas+' meses, '+fmt(jurosTotal)+' vai para juros.';
  document.getElementById('resultado-divida').classList.remove('hidden');
}

// INVESTIMENTOS
// ===== MÓDULO 4: SIMULADOR DE INVESTIMENTOS =====

let simChartInstance = null;
let simResultados = [];
let simParams = {};
let bcbTaxasCarregadas = false;

// Taxas de fallback (mercado atual 2025-2026, Selic ~14.75% a.a.)
const TAXAS_FALLBACK = {
  selicAa: 14.75,   // % a.a.
  cdiMes:  0.01195, // % ao mês
  ipcaMes: 0.00407, // % ao mês
  poupMes: 0.005,   // % ao mês
};

// INV_TIPOS começa com fallback; buscarTaxasBCB() atualiza taxaMes dinamicamente
const INV_TIPOS = [
  { id:'lci',   nome:'LCI e LCA',          taxaMes: 0.01195, custoAa: 0,     isentoIR: true,  cor:'#3B82F6', fatorCdi: 1.00,  ehLci: true  },
  { id:'cdb',   nome:'CDB 110% CDI',       taxaMes: 0.01315, custoAa: 0,     isentoIR: false, cor:'#6366F1', fatorCdi: 1.10,  ehCdi: true  },
  { id:'selic', nome:'Tesouro Selic',       taxaMes: 0.01195, custoAa: 0.002, isentoIR: false, cor:'#8B5CF6', ehSelic: true              },
  { id:'fundo', nome:'Fundo DI',            taxaMes: 0.01135, custoAa: 0.005, isentoIR: false, cor:'#EC4899', fatorCdi: 0.95,  ehCdi: true  },
  { id:'prfix', nome:'Tesouro Prefixado',   taxaMes: 0.01065, custoAa: 0.002, isentoIR: false, cor:'#F97316', fatorSelic:0.92              },
  { id:'poup',  nome:'Poupança',            taxaMes: 0.005,   custoAa: 0,     isentoIR: true,  cor:'#14B8A6', ehPoup: true               },
  { id:'ipca',  nome:'Tesouro IPCA+',       taxaMes: 0.00975, custoAa: 0.002, isentoIR: false, cor:'#22C55E', premioAa: 7.0,  ehIpca: true },
  { id:'corr',  nome:'Correção pelo IPCA',  taxaMes: 0.00407, custoAa: 0,     isentoIR: true,  cor:'#A3E635', ehIpcaPuro: true            },
];

// ---- Busca taxas do Banco Central (API SGS) ----
async function buscarTaxasBCB() {
  const statusBar  = document.getElementById('bcb-status-bar');
  const statusDot  = document.getElementById('bcb-dot');
  const statusTxt  = document.getElementById('bcb-status-text');
  const updateTime = document.getElementById('bcb-update-time');
  const ratesRow   = document.getElementById('bcb-rates-row');

  // Cache por 4 horas para não sobrecarregar a API do Bacen
  const CACHE_KEY = 'monvy_bcb_taxas';
  const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h em ms
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      aplicarTaxasBCB(cached.dados);
      if (statusDot) statusDot.className = 'bcb-status-dot online';
      if (statusTxt) statusTxt.textContent = '🟢 Taxas em tempo real — Banco Central do Brasil';
      if (updateTime) updateTime.textContent = 'Cache de ' + new Date(cached.ts).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
      return;
    }
  } catch(e) {}

  const BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.';
  const SUFIXO = '/dados/ultimos/1?formato=json';

  try {
    // Busca paralela: Selic meta (432), IPCA mensal (433), Poupança (195), CDI diário (12)
    const [rSelic, rIpca, rPoup, rCdi] = await Promise.all([
      fetch(BASE + '432' + SUFIXO).then(r => r.json()),
      fetch(BASE + '433' + SUFIXO).then(r => r.json()),
      fetch(BASE + '195' + SUFIXO).then(r => r.json()),
      fetch(BASE + '12'  + SUFIXO).then(r => r.json()),
    ]);

    const selicAa  = parseFloat(rSelic[0].valor);  // % a.a.
    const ipcaMes  = parseFloat(rIpca[0].valor) / 100; // % ao mês → decimal
    const poupMes  = parseFloat(rPoup[0].valor) / 100;
    // CDI diário → mensal: (1 + diario/100)^22 - 1 (aprox. 22 dias úteis)
    const cdiDiario = parseFloat(rCdi[0].valor);
    const cdiMes   = Math.pow(1 + cdiDiario / 100, 22) - 1;
    const selicMes = Math.pow(1 + selicAa / 100, 1 / 12) - 1;
    // IPCA+ prêmio ~7% a.a.
    const premioIpcaMes = Math.pow(1 + 0.07, 1 / 12) - 1;

    const dados = { selicAa, ipcaMes, poupMes, cdiMes, selicMes, premioIpcaMes };

    // Salvar cache
    localStorage.setItem('monvy_bcb_taxas', JSON.stringify({ ts: Date.now(), dados }));

    aplicarTaxasBCB(dados);

    // Atualizar UI
    if (statusDot) statusDot.className = 'bcb-status-dot online';
    if (statusTxt) statusTxt.textContent = '🟢 Taxas em tempo real — Banco Central do Brasil';
    if (updateTime) {
      const agora = new Date();
      updateTime.textContent = `Atualizado às ${agora.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
    }

    // Mostrar chips de taxas
    if (ratesRow) ratesRow.style.display = 'flex';
    const fmtPct = v => (v * 100).toFixed(3).replace('.', ',') + '% a.m.';
    const fmtAa  = v => v.toFixed(2).replace('.', ',') + '% a.a.';
    const el = id => document.getElementById(id);
    if (el('bcb-selic')) el('bcb-selic').textContent = fmtAa(dados.selicAa);
    if (el('bcb-cdi'))   el('bcb-cdi').textContent   = fmtPct(dados.cdiMes);
    if (el('bcb-ipca'))  el('bcb-ipca').textContent  = fmtPct(dados.ipcaMes);
    if (el('bcb-poup'))  el('bcb-poup').textContent  = fmtPct(dados.poupMes);
    if (el('bcb-lci'))   el('bcb-lci').textContent   = fmtPct(dados.cdiMes);

  } catch (err) {
    console.warn('BCB API indisponível — usando taxas estimadas:', err);
    if (statusDot) statusDot.className = 'bcb-status-dot offline';
    if (statusTxt) statusTxt.textContent = '⚠️ Usando taxas estimadas (BCB temporariamente indisponível)';
    if (ratesRow) ratesRow.style.display = 'none';

    // Aplicar fallback para que o simulador funcione mesmo sem conexão com BCB
    const selicMesFallback = Math.pow(1 + TAXAS_FALLBACK.selicAa / 100, 1 / 12) - 1;
    const premioIpcaMesFallback = Math.pow(1 + 0.07, 1 / 12) - 1;
    const dadosFallback = {
      selicAa:       TAXAS_FALLBACK.selicAa,
      cdiMes:        TAXAS_FALLBACK.cdiMes,
      ipcaMes:       TAXAS_FALLBACK.ipcaMes,
      poupMes:       TAXAS_FALLBACK.poupMes,
      selicMes:      selicMesFallback,
      premioIpcaMes: premioIpcaMesFallback,
    };
    aplicarTaxasBCB(dadosFallback);
    // Mostrar chips mesmo com fallback (identificados como estimados)
    if (ratesRow) {
      ratesRow.style.display = 'flex';
      const fmtPct = v => (v * 100).toFixed(3).replace('.', ',') + '% a.m.*';
      const fmtAa  = v => v.toFixed(2).replace('.', ',') + '% a.a.*';
      const el = id => document.getElementById(id);
      if (el('bcb-selic')) el('bcb-selic').textContent = fmtAa(dadosFallback.selicAa);
      if (el('bcb-cdi'))   el('bcb-cdi').textContent   = fmtPct(dadosFallback.cdiMes);
      if (el('bcb-ipca'))  el('bcb-ipca').textContent  = fmtPct(dadosFallback.ipcaMes);
      if (el('bcb-poup'))  el('bcb-poup').textContent  = fmtPct(dadosFallback.poupMes);
      if (el('bcb-lci'))   el('bcb-lci').textContent   = fmtPct(dadosFallback.cdiMes);
    }
  }
}

// Aplica taxas reais (ou do cache) nos INV_TIPOS
function aplicarTaxasBCB(d) {
  bcbTaxasCarregadas = true;
  const premioIpcaMes = d.premioIpcaMes || (Math.pow(1.07, 1/12) - 1);
  INV_TIPOS.forEach(t => {
    if (t.ehLci)           t.taxaMes = d.cdiMes;
    else if (t.ehCdi)      t.taxaMes = d.cdiMes * (t.fatorCdi || 1);
    else if (t.ehSelic)    t.taxaMes = d.selicMes;
    else if (t.fatorSelic) t.taxaMes = d.selicMes * t.fatorSelic;
    else if (t.ehPoup)     t.taxaMes = d.poupMes;
    else if (t.ehIpca)     t.taxaMes = (1 + d.ipcaMes) * (1 + premioIpcaMes) - 1;
    else if (t.ehIpcaPuro) t.taxaMes = d.ipcaMes;
  });
  // Mostrar chips de taxas se já estiver na tela
  const ratesRow = document.getElementById('bcb-rates-row');
  if (ratesRow) {
    ratesRow.style.display = 'flex';
    const fmtPct = v => (v * 100).toFixed(3).replace('.', ',') + '% a.m.';
    const fmtAa  = v => v.toFixed(2).replace('.', ',') + '% a.a.';
    const el = id => document.getElementById(id);
    if (el('bcb-selic')) el('bcb-selic').textContent = fmtAa(d.selicAa);
    if (el('bcb-cdi'))   el('bcb-cdi').textContent   = fmtPct(d.cdiMes);
    if (el('bcb-ipca'))  el('bcb-ipca').textContent  = fmtPct(d.ipcaMes);
    if (el('bcb-poup'))  el('bcb-poup').textContent  = fmtPct(d.poupMes);
    if (el('bcb-lci'))   el('bcb-lci').textContent   = fmtPct(d.cdiMes);
  }
}



function aliquotaIR(meses) {
  if (meses <= 6)  return 0.225;
  if (meses <= 12) return 0.20;
  if (meses <= 24) return 0.175;
  return 0.15;
}

function simularInvestimento(inicial, aporte, meses, tipo) {
  const { taxaMes, custoAa, isentoIR } = tipo;
  const custoMes = custoAa / 12;
  let saldo = inicial;
  let totalInvestido = inicial;

  // Crescimento mês a mês
  const historico = [inicial];
  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + taxaMes - custoMes) + aporte;
    totalInvestido += aporte;
    historico.push(saldo);
  }

  const valorBruto = saldo;
  const rentBruta = totalInvestido > 0 ? ((valorBruto / totalInvestido) - 1) * 100 : 0;
  const custos = totalInvestido * (custoAa / 12) * meses; // aproximado
  const rendimento = valorBruto - totalInvestido;
  const ir = isentoIR ? 0 : rendimento > 0 ? rendimento * aliquotaIR(meses) : 0;
  const valorLiquido = valorBruto - ir;
  const rentLiquida = totalInvestido > 0 ? ((valorLiquido / totalInvestido) - 1) * 100 : 0;
  const ganhoLiquido = valorLiquido - totalInvestido;

  return { valorBruto, rentBruta, custos, ir, valorLiquido, rentLiquida, ganhoLiquido, totalInvestido, historico };
}

function calcularInvestimentos() {
  const inicial = parseFloat(document.getElementById('inv-inicial').value) || 0;
  const aporte  = parseFloat(document.getElementById('inv-aporte').value)  || 0;
  const meses   = parseInt(document.getElementById('inv-meses').value)     || 0;

  if ((!inicial && !aporte) || !meses) {
    alert('Preencha o valor inicial (ou aporte) e o período!');
    return;
  }

  const totalInvestido = inicial + aporte * meses;
  simParams = { inicial, aporte, meses, totalInvestido };

  // Calcular todos
  simResultados = INV_TIPOS.map(tipo => ({
    ...tipo,
    resultado: simularInvestimento(inicial, aporte, meses, tipo)
  }));

  // Ordenar por valor líquido desc
  simResultados.sort((a, b) => b.resultado.valorLiquido - a.resultado.valorLiquido);

  // Melhor
  const melhor = simResultados[0];

  // Summary
  document.getElementById('sim-summary').style.display = 'flex';
  document.getElementById('sim-total-inv').textContent = fmt(totalInvestido);
  document.getElementById('sim-melhor-nome').textContent = melhor.nome;
  document.getElementById('sim-melhor-ganho').textContent = '+' + fmt(melhor.resultado.ganhoLiquido);

  // Ranking
  renderizarRanking();
  document.getElementById('sim-ranking-wrap').style.display = 'block';
}

function renderizarRanking() {
  const list = document.getElementById('sim-ranking-list');
  if (!list) return;
  const maxVal = simResultados[0].resultado.valorLiquido;
  const minVal = simResultados[simResultados.length-1].resultado.valorLiquido;
  const range  = maxVal - minVal || 1;

  list.innerHTML = simResultados.map((inv, i) => {
    const r = inv.resultado;
    const pct = 55 + ((r.valorLiquido - minVal) / range) * 45; // 55% a 100%
    const isMelhor = i === 0;
    return `
      <div class="sim-rank-item ${isMelhor ? 'melhor' : ''}">
        <div class="sim-rank-nome">
          ${isMelhor ? '<span class="sim-badge-melhor">⭐ Melhor</span>' : ''}
          <span>${inv.nome}</span>
          ${inv.isentoIR ? '<span class="sim-badge-ir">Isento IR</span>' : ''}
        </div>
        <div class="sim-rank-bar-wrap">
          <div class="sim-rank-bar" style="width:${pct}%;background:${isMelhor ? 'var(--grad)' : inv.cor}"></div>
        </div>
        <span class="sim-rank-val ${isMelhor ? 'green' : ''}">${fmt(r.valorLiquido)}</span>
      </div>
    `;
  }).join('');
}

function abrirModalSimulacao() {
  document.getElementById('modal-simulacao').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderizarModalSubheader();
  renderizarModalChart();
  renderizarModalTabela();
}

function fecharModalSimulacao() {
  document.getElementById('modal-simulacao').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderizarModalSubheader() {
  const el = document.getElementById('sim-modal-subheader');
  const { inicial, aporte, meses, totalInvestido } = simParams;
  el.innerHTML = `
    <div class="sim-sh-item"><span class="sim-sh-label">Valor inicial investido</span><span class="sim-sh-val">${fmt(inicial)}</span></div>
    <div class="sim-sh-item"><span class="sim-sh-label">Aportes Mensais</span><span class="sim-sh-val">${fmt(aporte)}</span></div>
    <div class="sim-sh-item"><span class="sim-sh-label">Período da aplicação</span><span class="sim-sh-val">${meses} ${meses===1?'mês':'meses'}</span></div>
    <div class="sim-sh-item"><span class="sim-sh-label">Soma dos valores investidos</span><span class="sim-sh-val green">${fmt(totalInvestido)}</span></div>
  `;
}

function renderizarModalChart() {
  const canvas = document.getElementById('sim-chart');
  if (!canvas) return;
  if (simChartInstance) simChartInstance.destroy();

  const { meses, totalInvestido, inicial, aporte } = simParams;
  const labels = Array.from({length: meses+1}, (_, i) => i === 0 ? 'Início' : 'M'+i);

  // Top 4 investimentos + linha de total investido
  const top4 = simResultados.slice(0, 4);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';

  const datasets = top4.map(inv => ({
    label: inv.nome,
    data: inv.resultado.historico,
    borderColor: inv === simResultados[0] ? '#22C55E' : inv.cor,
    backgroundColor: 'transparent',
    tension: 0.4,
    borderWidth: inv === simResultados[0] ? 2.5 : 1.5,
    pointRadius: 0,
    pointHoverRadius: 4,
  }));

  // Linha tracejada: total investido acumulado
  const totalLine = Array.from({length: meses+1}, (_, i) => inicial + aporte * i);
  datasets.push({
    label: 'Total investido',
    data: totalLine,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    borderDash: [6, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0,
  });

  simChartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: textColor, boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, maxTicksLimit: 8 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: textColor, callback: v => 'R$'+Math.round(v).toLocaleString('pt-BR') } }
      }
    }
  });
}

function renderizarModalTabela() {
  const head = document.getElementById('sim-tabela-head');
  const body = document.getElementById('sim-tabela-body');
  if (!head || !body) return;

  // Cabeçalho
  head.innerHTML = '<th>Critério</th>' + simResultados.map((inv, i) =>
    `<th style="color:${i===0?'#22C55E':inv.cor}">${inv.nome}${i===0?' ⭐':''}</th>`
  ).join('');

  // Linhas
  const linhas = [
    { label: 'Valor bruto acumulado', key: 'valorBruto', fmt: fmt },
    { label: 'Rentabilidade bruta',   key: 'rentBruta',  fmt: v => v.toFixed(2).replace('.',',') + '%' },
    { label: 'Custos',                key: 'custos',     fmt: fmt },
    { label: 'Valor pago em IR',      key: 'ir',         fmt: fmt },
    { label: 'Valor líquido acumulado', key: 'valorLiquido', fmt: fmt, destaque: true },
    { label: 'Rentabilidade líquida', key: 'rentLiquida', fmt: v => v.toFixed(2).replace('.',',') + '%' },
    { label: 'Ganho líquido',         key: 'ganhoLiquido', fmt: v => '+'+fmt(v), green: true },
  ];

  body.innerHTML = linhas.map(linha => `
    <tr${linha.destaque ? ' style="font-weight:700"' : ''}>
      <td style="color:var(--gray-2);font-size:.82rem">${linha.label}</td>
      ${simResultados.map((inv, i) => {
        const val = inv.resultado[linha.key];
        const isFirst = i === 0;
        const color = linha.green ? '#22C55E' : linha.destaque && isFirst ? '#22C55E' : '';
        return `<td style="${color ? 'color:'+color : ''}">${linha.fmt(val)}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

// RELATÓRIO MENSAL
let chartRelatorio = null;

function mudarMesRelatorio(delta) { relatorioMesOffset+=delta; atualizarRelatorio(); }

// Modo do período: 'mes' ou 'custom'
let periodoModo = 'mes';
let periodoCustomInicio = null, periodoCustomFim = null;

function setPeriodoModo(modo) {
  periodoModo = modo;
  document.getElementById('tab-mes').classList.toggle('active', modo === 'mes');
  document.getElementById('tab-custom').classList.toggle('active', modo === 'custom');
  document.getElementById('periodo-mes-nav').style.display = modo === 'mes' ? 'flex' : 'none';
  document.getElementById('periodo-custom-nav').style.display = modo === 'custom' ? 'block' : 'none';
  if (modo === 'custom' && !periodoCustomInicio) {
    // Pré-preencher com o mês atual
    const agora = new Date();
    const primeiro = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0);
    document.getElementById('periodo-inicio').value = primeiro.toISOString().split('T')[0];
    document.getElementById('periodo-fim').value = ultimo.toISOString().split('T')[0];
    periodoCustomInicio = primeiro.toISOString().split('T')[0];
    periodoCustomFim = ultimo.toISOString().split('T')[0];
  }
  atualizarRelatorio();
}

function aplicarPeriodoCustom() {
  periodoCustomInicio = document.getElementById('periodo-inicio').value;
  periodoCustomFim = document.getElementById('periodo-fim').value;
  if (periodoCustomInicio && periodoCustomFim) atualizarRelatorio();
}

function atalhoUltimos(dias) {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  const fmt2 = d => d.toISOString().split('T')[0];
  document.getElementById('periodo-inicio').value = fmt2(inicio);
  document.getElementById('periodo-fim').value = fmt2(fim);
  periodoCustomInicio = fmt2(inicio);
  periodoCustomFim = fmt2(fim);
  atualizarRelatorio();
}

function getMovimentacoesPeriodo() {
  if (periodoModo === 'mes') {
    const agora = new Date(), alvo = new Date(agora.getFullYear(), agora.getMonth() + relatorioMesOffset, 1);
    return {
      movs: movimentacoes.filter(m => {
        if (!m.data) return false;
        const d = new Date(m.data + 'T00:00:00');
        return d.getMonth() === alvo.getMonth() && d.getFullYear() === alvo.getFullYear();
      }),
      alvo
    };
  } else {
    const ini = periodoCustomInicio ? new Date(periodoCustomInicio + 'T00:00:00') : null;
    const fim = periodoCustomFim ? new Date(periodoCustomFim + 'T23:59:59') : null;
    return {
      movs: movimentacoes.filter(m => {
        if (!m.data) return false;
        const d = new Date(m.data + 'T00:00:00');
        return (!ini || d >= ini) && (!fim || d <= fim);
      }),
      alvo: ini || new Date()
    };
  }
}

async function atualizarRelatorio() {
  const { movs: doMes, alvo: alvoReal } = getMovimentacoesPeriodo();
  document.getElementById('relatorio-mes-label').textContent = periodoModo === 'mes'
    ? MESES[alvoReal.getMonth()] + ' ' + alvoReal.getFullYear()
    : (periodoCustomInicio || '') + ' — ' + (periodoCustomFim || '');

  // Label período custom
  const labelEl = document.getElementById('periodo-custom-label');
  if (labelEl && periodoModo === 'custom' && periodoCustomInicio && periodoCustomFim) {
    const ini = periodoCustomInicio.split('-').reverse().join('/');
    const fim = periodoCustomFim.split('-').reverse().join('/');
    labelEl.textContent = ini === fim ? 'Dia ' + ini : 'De ' + ini + ' até ' + fim;
  } else if (labelEl) {
    labelEl.textContent = '';
  }

  let movsFinal = doMes;
  let entradas, saidas, saldoMes;

  // Se não tem movimentações ativas e é modo mês, busca do histórico arquivado
  if (periodoModo === 'mes' && doMes.length === 0 && typeof currentUser !== 'undefined' && currentUser) {
    try {
      const mesKey = `${alvoReal.getFullYear()}-${String(alvoReal.getMonth() + 1).padStart(2, '0')}`;
      const { getHistorico } = await import('./firebase.js');
      const historico = await getHistorico(currentUser.uid);
      const hMes = historico.find(h => h.mes === mesKey);
      if (hMes) {
        entradas = hMes.entradas || 0;
        saidas = hMes.saidas || 0;
        saldoMes = hMes.saldo || 0;
        movsFinal = (hMes.movimentacoes || []).map(m => ({ ...m, tipo: m.tipo === 'ganho' ? 'ganho' : 'gasto' }));
        const labelMesEl = document.getElementById('relatorio-mes-label');
        if (labelMesEl) labelMesEl.innerHTML += ' <span style="font-size:.7rem;color:var(--primary);opacity:.8">(arquivado)</span>';
      }
    } catch(e) { console.warn('Erro ao buscar histórico:', e); }
  }

  if (entradas === undefined) {
    entradas = movsFinal.filter(m => m.tipo === 'ganho').reduce((a, m) => a + m.valor, 0);
    saidas = movsFinal.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.valor, 0);
    saldoMes = entradas - saidas;
  }

  document.getElementById('rel-entradas').textContent = fmt(entradas);
  document.getElementById('rel-saidas').textContent = fmt(saidas);
  const saldoEl = document.getElementById('rel-saldo');
  saldoEl.textContent = fmt(saldoMes);
  saldoEl.className = 'kpi-value ' + (saldoMes >= 0 ? 'green' : 'red');
  document.getElementById('rel-total').textContent = movsFinal.length;

  const topEl = document.getElementById('relatorio-top-gastos');
  const gastosMes = movsFinal.filter(m => m.tipo === 'gasto').sort((a, b) => b.valor - a.valor).slice(0, 5);
  topEl.innerHTML = gastosMes.length === 0
    ? '<div class="vazio">Nenhum gasto no período.</div>'
    : gastosMes.map(m => `<div class="mov-item"><div class="mov-left"><div class="mov-dot r"></div><div class="mov-info"><span class="mov-desc">${m.descricao}</span><span class="mov-cat">${m.categoria} · ${fmtData(m.data)}</span></div></div><span class="mov-valor negativo">-${fmt(m.valor)}</span></div>`).join('');

  atualizarChartRelatorio(alvoReal);
  atualizarListaRecorrentes();
}

function atualizarChartRelatorio(alvo) {
  const canvas=document.getElementById('chart-relatorio'), emptyEl=document.getElementById('relatorio-chart-empty');
  if (!canvas) return;
  const dados=[];
  for (let i=5;i>=0;i--) {
    const d=new Date(alvo.getFullYear(),alvo.getMonth()-i,1);
    const mv=movimentacoes.filter(m=>{ if(!m.data)return false; const md=new Date(m.data+'T00:00:00'); return md.getMonth()===d.getMonth()&&md.getFullYear()===d.getFullYear(); });
    dados.push({ label:MESES[d.getMonth()].slice(0,3), entradas:mv.filter(m=>m.tipo==='ganho').reduce((a,m)=>a+m.valor,0), saidas:mv.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0) });
  }
  if (!dados.some(d=>d.entradas>0||d.saidas>0)) { canvas.style.display='none'; if(emptyEl)emptyEl.style.display='flex'; return; }
  canvas.style.display='block'; if(emptyEl)emptyEl.style.display='none';
  if (chartRelatorio) chartRelatorio.destroy();
  chartRelatorio=new Chart(canvas.getContext('2d'),{ type:'bar', data:{ labels:dados.map(d=>d.label), datasets:[
    {label:'Entradas',data:dados.map(d=>d.entradas),backgroundColor:'rgba(34,197,94,0.7)',borderRadius:6},
    {label:'Saídas',data:dados.map(d=>d.saidas),backgroundColor:'rgba(239,68,68,0.7)',borderRadius:6}
  ]}, options:{ responsive:true, maintainAspectRatio:true,
    plugins:{legend:{labels:{color:'#64748B',font:{size:11}}},tooltip:{backgroundColor:'#1A2235',borderColor:'rgba(255,255,255,0.08)',borderWidth:1,titleColor:'#94A3B8',bodyColor:'#fff',callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.raw)}}},
    scales:{x:{grid:{display:false},ticks:{color:'#64748B',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748B',font:{size:11},callback:v=>'R$'+v.toFixed(0)}}}
  }});
}

// RECORRENTES
function atualizarListaRecorrentes() {
  const lista=document.getElementById('lista-recorrentes');
  if (!lista) return;
  const visto=new Set(), unicos=[];
  movimentacoes.filter(m=>m.recorrente).forEach(m=>{ const k=m.descricao+'|'+m.categoria+'|'+m.tipo; if(!visto.has(k)){visto.add(k);unicos.push(m);} });
  lista.innerHTML=unicos.length===0?'<div class="vazio" style="padding:16px 20px">Nenhum lançamento recorrente cadastrado.<br><span style="font-size:.8rem;opacity:.6">Marque "recorrente" ao registrar uma entrada ou saída.</span></div>':
    unicos.map(m=>`<div class="mov-item" style="padding:12px 20px"><div class="mov-left"><div class="mov-dot ${m.tipo==='ganho'?'g':'r'}"></div><div class="mov-info"><span class="mov-desc">${m.descricao} <span style="font-size:.7rem;background:rgba(57,255,121,0.15);color:var(--primary);padding:1px 6px;border-radius:4px">mensal</span></span><span class="mov-cat">${m.tipo==='ganho'?'Entrada':m.categoria}</span></div></div><span class="mov-valor ${m.tipo==='ganho'?'positivo':'negativo'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</span></div>`).join('');
}

function processarRecorrentes() {
  const agora=new Date(), visto=new Set(), unicos=[];
  movimentacoes.filter(m=>m.recorrente).forEach(m=>{ const k=m.descricao+'|'+m.categoria+'|'+m.tipo; if(!visto.has(k)){visto.add(k);unicos.push(m);} });
  if (unicos.length===0) { alert('Nenhum lançamento recorrente cadastrado.'); return; }
  const jaSet=new Set(movimentacoes.filter(m=>{ if(!m.data||!m.recorrente)return false; const d=new Date(m.data+'T00:00:00'); return d.getMonth()===agora.getMonth()&&d.getFullYear()===agora.getFullYear(); }).map(m=>m.descricao+'|'+m.categoria+'|'+m.tipo));
  const pendentes=unicos.filter(m=>!jaSet.has(m.descricao+'|'+m.categoria+'|'+m.tipo));
  if (pendentes.length===0) { alert('Todos os recorrentes já foram lançados neste mês!'); return; }
  if (!confirm('Lançar '+pendentes.length+' recorrente(s) para '+MESES[agora.getMonth()]+'?')) return;
  if (currentUser) {
    Promise.all(pendentes.map(m => {
      const novaM = { tipo: m.tipo, valor: m.valor, descricao: m.descricao, categoria: m.categoria||'', data: hojeISO(), recorrente: true, resposta: '' };
      return adicionarMovimentacao(currentUser.uid, novaM);
    })).then(() => {
      alert(pendentes.length+' lançamento(s) adicionado(s)!');
    }).catch(e => { console.error('Erro ao lançar recorrentes:', e); alert('Erro ao salvar alguns lançamentos.'); });
  } else {
    pendentes.forEach(m=>{ tipoAtual=m.tipo; movimentacoes.push({...m,data:hojeISO(),resposta:''}); });
    recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart(); atualizarRelatorio();
    alert(pendentes.length+' lançamento(s) adicionado(s)!');
  }
}

// ARTIGOS
const artigos=[
  {titulo:'Reserva de emergência',conteudo:`<h2>O que é reserva de emergência?</h2><p>Reserva de emergência é um dinheiro guardado exclusivamente para imprevistos: perder o emprego, um problema de saúde, um conserto urgente.</p><p><strong>Quanto guardar?</strong> O ideal é ter de 3 a 6 meses dos seus gastos mensais guardados.</p><p><strong>Onde guardar?</strong></p><ul><li>Tesouro Selic (recomendado)</li><li>CDB com liquidez diária</li><li>Conta remunerada</li></ul>`},
  {titulo:'Cartão de crédito',conteudo:`<h2>Por que evitar o cartão de crédito?</h2><p>O cartão de crédito não é dinheiro extra. É dinheiro adiantado que você vai ter que devolver.</p><p><strong>O perigo do rotativo:</strong> Juros de 15% a 20% ao mês.</p><p><strong>Regra de ouro:</strong> Se você precisa parcelar, provavelmente não pode comprar.</p>`},
  {titulo:'Sair das dívidas',conteudo:`<h2>Como sair das dívidas?</h2><p><strong>Passo 1:</strong> Liste todas as suas dívidas.</p><p><strong>Passo 2:</strong> Priorize as com maior juros.</p><p><strong>Passo 3:</strong> Negocie desconto para quitar à vista.</p><p><strong>Passo 4:</strong> Corte gastos desnecessários.</p>`},
  {titulo:'Necessidade vs Desejo',conteudo:`<h2>Necessidade vs Desejo</h2><p><strong>Necessidade</strong> é o que você precisa para viver: alimentação, moradia, saúde, transporte.</p><p><strong>Desejo</strong> é o que você quer: roupas de marca, restaurante caro, o celular mais novo.</p><p><strong>A regra das 24 horas:</strong> Esperou um dia e ainda quer? Talvez valha.</p>`},
  {titulo:'Regra 50-30-20',conteudo:`<h2>Regra dos 50-30-20</h2><p><strong>50%</strong> — Necessidades: Aluguel, mercado, contas, transporte.</p><p><strong>30%</strong> — Desejos: Lazer, roupas, restaurante, streaming.</p><p><strong>20%</strong> — Futuro: Reserva de emergência, investimentos.</p>`},
  {titulo:'Como começar a investir',conteudo:`<h2>Como começar a investir?</h2><p>Você não precisa ser rico para investir. Pode começar com R$ 30.</p><p><strong>Antes de investir:</strong> Quite suas dívidas de alto juros e monte sua reserva primeiro.</p><p><strong>O segredo:</strong> Consistência. Investir R$ 100 por mês todo mês é melhor que R$ 1.200 uma vez por ano.</p>`}
];

function abrirArtigo(index) { document.getElementById('artigo-conteudo').innerHTML=artigos[index].conteudo; document.getElementById('modal-artigo').classList.remove('hidden'); }
function fecharArtigo() { document.getElementById('modal-artigo').classList.add('hidden'); }

// FECHAR FORA
['modal','modal-artigo','modal-meta','modal-editar'].forEach(id=>{ const el=document.getElementById(id); if(el)el.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden');}); });

// AUTH & TEMA
async function logout() {
  if(confirm('Deseja sair da sua conta?')) {
    if (unsubMovimentacoes) unsubMovimentacoes();
    await fbLogout();
    localStorage.removeItem('monvy_theme');
    window.location.href = 'auth.html';
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme',theme);
  const moon=document.getElementById('theme-icon-moon'), sun=document.getElementById('theme-icon-sun');
  if(theme==='light'){if(moon)moon.style.display='none';if(sun)sun.style.display='block';}
  else{if(moon)moon.style.display='block';if(sun)sun.style.display='none';}
}

function toggleTheme() { const c=document.documentElement.getAttribute('data-theme')||'dark', n=c==='dark'?'light':'dark'; localStorage.setItem('monvy_theme',n); applyTheme(n); }

// ===== BUSCA =====
function _renderBuscaResultados(termo, header, lista) {
  const q = termo.trim().toLowerCase();
  const resultados = [...movimentacoes].filter(m => {
    return (
      (m.descricao && m.descricao.toLowerCase().includes(q)) ||
      (m.categoria && m.categoria.toLowerCase().includes(q)) ||
      (m.tipo === 'ganho' && 'entrada'.includes(q)) ||
      (m.tipo === 'gasto' && 'saída'.includes(q)) ||
      (m.data && fmtData(m.data).includes(q))
    );
  }).sort((a,b) => (b.data||'').localeCompare(a.data||''));

  header.textContent = resultados.length === 0
    ? 'Nenhum resultado para "' + termo + '"'
    : resultados.length + ' resultado' + (resultados.length > 1 ? 's' : '') + ' para "' + termo + '"';

  if (resultados.length === 0) {
    lista.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--gray);font-size:.85rem">Nenhuma movimentação encontrada.</div>';
  } else {
    lista.innerHTML = resultados.map(m => {
      const idx = movimentacoes.indexOf(m);
      const isGanho = m.tipo === 'ganho';
      function highlight(txt) {
        if (!txt) return '';
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
        return txt.replace(re, '<mark style="background:rgba(57,255,121,0.25);color:inherit;border-radius:3px;padding:0 2px">$1</mark>');
      }
      const closeCmd = 'fecharDropdownBusca()';
      return `<div class="mov-item" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:default">
        <div class="mov-left">
          <div class="mov-dot ${isGanho?'g':'r'}"></div>
          <div class="mov-info">
            <span class="mov-desc">${highlight(m.descricao||(isGanho?'Entrada':'Saída'))}</span>
            <span class="mov-cat">${m.data?fmtData(m.data)+' · ':''}${highlight(isGanho?'Entrada':m.categoria)}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="mov-valor ${isGanho?'positivo':'negativo'}">${isGanho?'+':'-'}${fmt(m.valor)}</span>
          <button onclick="abrirModalEditar(${idx});${closeCmd}" style="background:none;border:none;cursor:pointer;color:var(--gray);padding:4px;border-radius:6px;font-size:.85rem" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        </div>
      </div>`;
    }).join('');
  }
}

function buscarMovimentacoes(termo) {
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = termo.trim() ? 'inline-block' : 'none';
  if (!termo.trim()) { fecharDropdownBusca(); return; }
  mostrarDropdownBusca(termo);
}

function mostrarDropdownBusca(termo) {
  const dropdown = document.getElementById('search-dropdown');
  const header = document.getElementById('search-results-header');
  const lista = document.getElementById('search-results-list');
  if (!dropdown || !header || !lista) return;
  _renderBuscaResultados(termo, header, lista);
  dropdown.style.display = 'block';
}

function fecharDropdownBusca() {
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function limparBusca() {
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const inputM = document.getElementById('search-input-mobile');
  if (inputM) inputM.value = '';
  const clearBtnM = document.getElementById('search-clear-mobile');
  if (clearBtnM) clearBtnM.style.display = 'none';
  fecharDropdownBusca();
}

function abrirBuscaMobile() {
  const overlay = document.getElementById('search-mobile-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.add('open');
    setTimeout(() => {
      const input = document.getElementById('search-input-mobile');
      if (input) input.focus();
    }, 50);
  }
}

function fecharBuscaMobile() {
  const overlay = document.getElementById('search-mobile-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.style.display = 'none';
  }
  limparBusca();
}

document.addEventListener('click', function(e) {
  const center = document.querySelector('.topbar-center');
  if (center && !center.contains(e.target)) fecharDropdownBusca();
});

// INIT
// ===== INIT FIREBASE =====
applyTheme(localStorage.getItem('monvy_theme')||'dark');

// Carregar Chart.js — arquivo local (sem dependência de CDN externo)
// Evita erros de "Tracking Prevention blocked access to storage"
const script = document.createElement('script');
script.src = 'chart.min.js';
script.onload = () => atualizarChart();
script.onerror = () => {
  // Fallback: tenta CDN apenas se o arquivo local falhar
  const fallback = document.createElement('script');
  fallback.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  fallback.onload = () => atualizarChart();
  document.head.appendChild(fallback);
};
document.head.appendChild(script);

onAuth(async (user) => {
  if (!user) {
    // Aguarda um tick para garantir que a persistência foi verificada
    setTimeout(() => {
      if (!currentUser) window.location.href = 'auth.html';
    }, 800); // Reduzido de 1500ms → 800ms para resposta mais rápida
    return;
  }
  currentUser = user;

  // Preencher avatar e nome
  const nome = user.displayName || '';
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (user.photoURL) {
      avatarEl.innerHTML = '<img src="'+user.photoURL+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else if (nome) {
      avatarEl.textContent = nome.charAt(0).toUpperCase();
    }
    avatarEl.title = nome;
  }
  const greetEl = document.getElementById('topbar-greeting');
  if (greetEl && nome) greetEl.textContent = 'Olá, ' + nome.split(' ')[0];
  const dataInput = document.getElementById('modal-data');
  if (dataInput) dataInput.value = hojeISO();

  // Verificar onboarding
  try {
    const perfil = await getPerfil(user.uid);
    // Checar onboarding: Firestore é a fonte principal, localStorage é o fallback
    const onboardingLocal = localStorage.getItem('monvy_onboarding_done') === '1';
    if (!perfil.onboardingDone && !onboardingLocal) {
      window.location.href = 'onboarding.html';
      return;
    }
    // Se localStorage indica feito mas Firestore não, sincronizar
    if (!perfil.onboardingDone && onboardingLocal) {
      try {
        const { marcarOnboardingFeito } = await import('./firebase.js');
        await marcarOnboardingFeito(user.uid);
      } catch(e) { console.warn('Erro ao sincronizar onboarding:', e); }
    }

    // Carregar perfil de vida para categorias
    if (perfil.perfilVida) {
      localStorage.setItem('monvy_perfil_vida', JSON.stringify(perfil.perfilVida));
    }

    // Sincronizar nome e foto do Firebase com localStorage e UI
    const nomeFirebase = perfil.nome || user.displayName || '';
    const fotoFirebase = perfil.foto || user.photoURL || null;
    if (nomeFirebase) {
      let userData = {};
      const raw = localStorage.getItem('monvy_logado') || localStorage.getItem('monvy_logged');
      if (raw) { try { userData = JSON.parse(raw); } catch(e){} }
      userData.nome = nomeFirebase; userData.name = nomeFirebase;
      const key = localStorage.getItem('monvy_logado') ? 'monvy_logado' : 'monvy_logged';
      localStorage.setItem(key, JSON.stringify(userData));
    }
    if (fotoFirebase && fotoFirebase.startsWith('data:')) {
      localStorage.setItem('monvy_avatar_foto', fotoFirebase);
    }
    if (typeof aplicarPerfilUI === 'function') {
      const fotoLocal = localStorage.getItem('monvy_avatar_foto');
      aplicarPerfilUI(nomeFirebase, fotoLocal || fotoFirebase || null);
    }

    // Carregar dados em paralelo para reduzir tempo de espera
    const [metasData, dividasData, contasData] = await Promise.all([
      getMetas(user.uid).catch(e => { console.warn('metas:', e); return []; }),
      getDividas(user.uid).catch(e => { console.warn('dividas:', e); return []; }),
      getContas(user.uid).catch(e => { console.warn('contas:', e); return []; }),
    ]);

    metas = metasData;
    atualizarListaMetas();

    dividasCadastradas = dividasData;
    if (typeof renderizarDividas === 'function') renderizarDividas();
    try { await carregarDividasOnboarding(); } catch(e) {}

    contasCadastradas = contasData;
    renderizarContas();
    verificarAlertasContas();

    // Verificar reset mensal automático (não bloqueia o carregamento inicial)
    verificarEResetarMes(user.uid).then(houveFechamento => {
      if (houveFechamento) mostrarToastResetMes();
    }).catch(e => console.warn('Erro no reset mensal:', e));

    // Ouvir movimentações em tempo real
    if (unsubMovimentacoes) unsubMovimentacoes();
    unsubMovimentacoes = ouvirMovimentacoes(user.uid, (movs) => {
      movimentacoes = movs;
      recalcular();
      renderizarMovimentacoes();
      atualizarTelaCategorias();
    });

    // Inicializar a tela de categorias imediatamente após carregar o perfil
    // (garante que os ícones aparecem mesmo sem movimentações)
    try { sincronizarSelects(); } catch(e) {}
    try { renderizarGridCategorias(); } catch(e) {}
    try { atualizarBannerPerfil(); } catch(e) {}
    try { renderizarSugestaoOrcamento(); } catch(e) {}
  } catch(e) {
    console.error('Erro ao carregar dados:', e);
  }
});

// ==============================
// NOVOS MÓDULOS v17
// ==============================

// ===== DÍVIDAS CADASTRADAS =====
let dividasCadastradas = [];

const DIVIDA_ICONS = {
  cartao: '<img src="icone-cartao-01.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle">',
  emprestimo: '<img src="icone-emprestimo.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle">',
  financiamento: '<img src="icone-banco.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle">',
  terceiros: '<img src="icone-terceiros.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle">',
  outros: '<img src="icone-outros.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle">'
};
const DIVIDA_LABELS = {
  cartao: 'Cartão de crédito', emprestimo: 'Empréstimo', financiamento: 'Financiamento', terceiros: 'Terceiros', outros: 'Outros'
};

function atualizarFormDivida() {
  const tipo = document.getElementById('div-tipo').value;
  const terceiroArea = document.getElementById('div-terceiro-area');
  const jurosArea = document.getElementById('div-juros-area');
  if (terceiroArea) terceiroArea.style.display = tipo === 'terceiros' ? 'block' : 'none';
  if (jurosArea) jurosArea.style.display = tipo === 'terceiros' ? 'none' : 'block';
}

async function cadastrarDivida() {
  const tipo = document.getElementById('div-tipo').value;
  const descricao = document.getElementById('div-descricao').value.trim();
  const valor = parseFloat(document.getElementById('div-valor').value);
  const jurosEl = document.getElementById('div-juros');
  const parcelasEl = document.getElementById('div-parcelas');
  const credorEl = document.getElementById('div-credor');

  if (!descricao || !valor || valor <= 0) {
    alert('Preencha a descrição e o valor da dívida.');
    return;
  }

  const divida = {
    id: Date.now(),
    tipo,
    descricao,
    valor,
    juros: jurosEl ? parseFloat(jurosEl.value) || 0 : 0,
    parcelas: parcelasEl ? parseInt(parcelasEl.value) || 0 : 0,
    credor: credorEl ? credorEl.value.trim() : '',
    dataCriacao: new Date().toISOString().slice(0,10)
  };

  if (currentUser) {
    try {
      const fbId = await adicionarDivida(currentUser.uid, divida);
      divida.id = fbId;
    } catch(e) { console.error('Erro ao salvar dívida:', e); }
  }
  dividasCadastradas.push(divida);
  renderizarDividas();
  atualizarKPIsDividas();

  // Limpar form
  document.getElementById('div-descricao').value = '';
  document.getElementById('div-valor').value = '';
  if (jurosEl) jurosEl.value = '';
  if (parcelasEl) parcelasEl.value = '';
  if (credorEl) credorEl.value = '';

  const sucesso = document.getElementById('div-form-sucesso');
  if (sucesso) { sucesso.style.display = 'block'; setTimeout(() => sucesso.style.display = 'none', 2000); }
}

async function quitarDivida(id) {
  if (!currentUser) return;
  const d = dividasCadastradas.find(d => d.id === id);
  if (!d) return;

  try {
    await atualizarDivida(currentUser.uid, id, { quitada: true });
    const idx = dividasCadastradas.findIndex(d => d.id === id);
    if (idx >= 0) dividasCadastradas[idx].quitada = true;

    renderizarDividas();
    atualizarKPIsDividas();
    setTimeout(() => { if (typeof executarManualEngine === 'function') executarManualEngine(); }, 300);

    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1a2236;border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:12px 20px;color:#22c55e;font-size:.85rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:9999;white-space:nowrap';
    t.textContent = `✓ "${d.descricao}" marcada como quitada!`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  } catch(e) { console.error(e); alert('Erro ao quitar dívida.'); }
}

async function excluirDivida(id) {
  if (!confirm('Remover esta dívida?')) return;
  if (currentUser) {
    try { await deletarDivida(currentUser.uid, id); } catch(e) { console.error(e); }
  }
  dividasCadastradas = dividasCadastradas.filter(d => d.id !== id);
  renderizarDividas();
  atualizarKPIsDividas();
}

async function salvarDividas() {
  // Dados já salvos individualmente no Firestore — sem ação necessária
}

function renderizarDividas() {
  const lista = document.getElementById('lista-dividas-cadastradas');
  const countEl = document.getElementById('div-lista-count');
  const estrategiaCard = document.getElementById('estrategia-card');
  if (!lista) return;

  if (countEl) countEl.textContent = dividasCadastradas.length + ' cadastrada' + (dividasCadastradas.length !== 1 ? 's' : '');

  if (dividasCadastradas.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhuma dívida cadastrada ainda.<br><span style="font-size:.8rem">Use o formulário ao lado para registrar.</span></div>';
    if (estrategiaCard) estrategiaCard.style.display = 'none';
    return;
  }

  lista.innerHTML = dividasCadastradas.map(d => {
    const badgeClass = 'badge-' + d.tipo;
    const label = DIVIDA_LABELS[d.tipo] || d.tipo;
    const icon = DIVIDA_ICONS[d.tipo] || '<img src="icone-conta.png" style="width:24px;height:24px;object-fit:contain;">';
    const sub = d.juros > 0 ? `${d.juros}% a.m.` : (d.credor ? `Deve para: ${d.credor}` : label);
    const parcSub = d.parcelas > 0 ? ` · ${d.parcelas} parc. restantes` : '';
    const quitada = d.quitada === true;
    const bordaColor = quitada ? 'rgba(34,197,94,0.25)' : 'var(--border)';
    const valorColor = quitada ? '#22c55e' : 'var(--white)';
    return `<div class="divida-item" style="border:1px solid ${bordaColor};border-radius:12px;padding:12px;margin-bottom:8px;background:var(--card-bg);opacity:${quitada?'0.75':'1'}">
      <div class="divida-item-icon">${icon}</div>
      <div class="divida-item-info">
        <div class="divida-item-nome">${d.descricao} <span class="divida-badge ${badgeClass}">${label}</span>${quitada ? ' <span style="font-size:.72rem;color:#22c55e;font-weight:600;background:rgba(34,197,94,0.12);padding:2px 7px;border-radius:20px;">✓ Quitada</span>' : ''}</div>
        <div class="divida-item-sub">${sub}${parcSub}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="divida-item-valor" style="color:${valorColor}">${fmt(d.valor)}</div>
          <button class="divida-btn-del" onclick="excluirDivida('${d.id}')">✕</button>
        </div>
        ${!quitada
          ? `<button onclick="quitarDivida('${d.id}')" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:5px 12px;font-size:.75rem;color:#22c55e;cursor:pointer;font-family:inherit;white-space:nowrap">✓ Marcar como quitada</button>`
          : `<span style="font-size:.75rem;color:#22c55e;font-weight:600">✓ Quitada</span>`
        }
      </div>
    </div>`;
  }).join('');

  // Estratégia
  if (estrategiaCard) {
    estrategiaCard.style.display = 'block';
    gerarEstrategia();
  }
}

function atualizarKPIsDividas() {
  const ativas = dividasCadastradas.filter(d => !d.quitada);
  const total = ativas.reduce((s, d) => s + d.valor, 0);
  const cartao = ativas.filter(d => d.tipo === 'cartao').reduce((s, d) => s + d.valor, 0);
  const emprest = ativas.filter(d => d.tipo === 'emprestimo' || d.tipo === 'financiamento').reduce((s, d) => s + d.valor, 0);
  const terceiros = ativas.filter(d => d.tipo === 'terceiros').reduce((s, d) => s + d.valor, 0);

  const totalEl = document.getElementById('div-kpi-total');
  const qtdEl = document.getElementById('div-kpi-qtd');
  const cartaoEl = document.getElementById('div-kpi-cartao');
  const emprestEl = document.getElementById('div-kpi-emprest');
  const terceirosEl = document.getElementById('div-kpi-terceiros');

  if (totalEl) totalEl.textContent = fmt(total);
  if (qtdEl) qtdEl.textContent = dividasCadastradas.length > 0 ? dividasCadastradas.length + ' dívida(s) ativa(s)' : 'Nenhuma dívida cadastrada';
  if (cartaoEl) cartaoEl.textContent = fmt(cartao);
  if (emprestEl) emprestEl.textContent = fmt(emprest);
  if (terceirosEl) terceirosEl.textContent = fmt(terceiros);
}

function gerarEstrategia() {
  const textoEl = document.getElementById('estrategia-texto');
  if (!textoEl || dividasCadastradas.length === 0) return;

  const temAltoJuros = dividasCadastradas.some(d => d.juros >= 5);
  const total = dividasCadastradas.reduce((s, d) => s + d.valor, 0);

  let texto = '';
  if (temAltoJuros) {
    const maiorJuros = [...dividasCadastradas].sort((a,b) => b.juros - a.juros)[0];
    texto = `<strong>🔥 Método Avalanche recomendado</strong><br>Você tem dívidas com juros altos. Concentre pagamentos extras na <strong>${maiorJuros.descricao}</strong> (${maiorJuros.juros}% a.m.) primeiro — ela cresce mais rápido. Depois pague as demais em ordem de juros.`;
  } else if (dividasCadastradas.length > 2) {
    const menorValor = [...dividasCadastradas].sort((a,b) => a.valor - b.valor)[0];
    texto = `<strong>⛄ Método Bola de Neve recomendado</strong><br>Você tem várias dívidas de valores similares. Quite a <strong>${menorValor.descricao}</strong> (${fmt(menorValor.valor)}) primeiro para ganhar motivação. A sensação de "dívida zerada" ajuda a manter o foco!`;
  } else {
    texto = `<strong>📋 Plano de quitação</strong><br>Total de ${fmt(total)} em dívidas. Separe um percentual fixo da renda todo mês para quitação — mesmo que seja R$ 200, a consistência faz diferença. Evite novas dívidas enquanto quita as atuais.`;
  }
  textoEl.innerHTML = texto;
}

// Carregar dívidas do onboarding inicial — só executa se Firebase não retornou nada
async function carregarDividasOnboarding() {
  const perfil = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  if (!perfil.dividas) return;
  if (dividasCadastradas.length > 0) return; // Firebase já tem dívidas
  const tipos = { cartao: 'Cartão de crédito (onboarding)', emprestimo: 'Empréstimo (onboarding)', terceiros: 'Dívida com terceiros (onboarding)', financiamento: 'Financiamento (onboarding)' };
  const novas = [];
  for (const [tipo, valor] of Object.entries(perfil.dividas)) {
    if (valor > 0) novas.push({ tipo, descricao: tipos[tipo] || tipo, valor, juros: 0, parcelas: 0, dataCriacao: new Date().toISOString().slice(0,10) });
  }
  if (novas.length > 0 && currentUser) {
    for (const d of novas) {
      try {
        const fbId = await adicionarDivida(currentUser.uid, d);
        dividasCadastradas.push({ id: fbId, ...d });
      } catch(e) { console.error('Erro ao salvar dívida do onboarding:', e); }
    }
    renderizarDividas();
    atualizarKPIsDividas();
  }
}

// ===== PERFIL DE VIDA (modal) =====
function abrirTabPerfil(tab) {
  ['conta','vida','financas'].forEach(t => {
    document.getElementById('perfil-tab-' + t).style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'vida') carregarEstadoVida();
  if (tab === 'financas') carregarEstadoFinancas();
}

function carregarEstadoVida() {
  const perfil = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  // Moradia
  document.querySelectorAll('#vida-moradia-opts .vida-opt').forEach(el => {
    const val = el.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1];
    el.classList.toggle('selected', val === perfil.moradia);
  });
  // Transporte
  document.querySelectorAll('#vida-transporte-opts .vida-opt').forEach(el => {
    const val = el.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1];
    el.classList.toggle('selected', (perfil.transporte || []).includes(val));
  });
  // Filhos
  const filhosSim = document.getElementById('vida-filhos-sim');
  const filhosNao = document.getElementById('vida-filhos-nao');
  if (filhosSim) filhosSim.classList.toggle('selected', perfil.filhos === 'sim');
  if (filhosNao) filhosNao.classList.toggle('selected', perfil.filhos === 'nao');
}

function carregarEstadoFinancas() {
  const perfil = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  const rendaEl = document.getElementById('perfil-renda');
  if (rendaEl && perfil.renda) rendaEl.value = perfil.renda;
}

function selecionarVida(el, campo, valor) {
  const parent = el.closest('[id$="-opts"]') || el.parentElement;
  parent.querySelectorAll('.vida-opt:not(.multi)').forEach(o => {
    const v = o.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1];
    if (v) o.classList.toggle('selected', v === valor);
  });
  // Salvar no estado temporário
  if (!window._perfilVidaTemp) window._perfilVidaTemp = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  window._perfilVidaTemp[campo] = valor;
}

function selecionarVidaMulti(el, campo, valor) {
  el.classList.toggle('selected');
  if (!window._perfilVidaTemp) window._perfilVidaTemp = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  if (!window._perfilVidaTemp[campo]) window._perfilVidaTemp[campo] = [];
  if (el.classList.contains('selected')) {
    if (!window._perfilVidaTemp[campo].includes(valor)) window._perfilVidaTemp[campo].push(valor);
  } else {
    window._perfilVidaTemp[campo] = window._perfilVidaTemp[campo].filter(v => v !== valor);
  }
}

function setMetaEco(el, pct) {
  document.querySelectorAll('#meta-eco-opts .vida-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  if (!window._perfilVidaTemp) window._perfilVidaTemp = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  window._perfilVidaTemp.metaEconomia = pct;
}

function salvarPerfilVida() {
  const perfil = window._perfilVidaTemp || JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  localStorage.setItem('monvy_perfil_vida', JSON.stringify(perfil));
  window._perfilVidaTemp = null;
  // Sincronizar com Firebase
  if (currentUser) {
    fbSalvarPerfilVida(currentUser.uid, perfil).catch(e => console.error('Erro ao salvar perfil de vida no Firebase:', e));
  }
  const suc = document.getElementById('vida-sucesso');
  if (suc) { suc.style.display = 'block'; setTimeout(() => suc.style.display = 'none', 2000); }
}

function salvarPerfilFinancas() {
  const perfil = JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
  const renda = parseFloat(document.getElementById('perfil-renda')?.value) || perfil.renda || 0;
  if (window._perfilVidaTemp?.metaEconomia !== undefined) perfil.metaEconomia = window._perfilVidaTemp.metaEconomia;
  perfil.renda = renda;
  localStorage.setItem('monvy_perfil_vida', JSON.stringify(perfil));
  // Sincronizar com Firebase
  if (currentUser) {
    fbSalvarPerfilVida(currentUser.uid, perfil).catch(e => console.error('Erro ao salvar finanças no Firebase:', e));
  }
  const suc = document.getElementById('financas-sucesso');
  if (suc) { suc.style.display = 'block'; setTimeout(() => suc.style.display = 'none', 2000); }
}

// Inicializar dívidas ao carregar
try {
  (function initDividas() {
    renderizarDividas();
    atualizarKPIsDividas();
    atualizarFormDivida();
  })();
} catch(e) { console.error('[Monvay] Erro no initDividas:', e); }

// Módulo de dívidas: hooks integrados ao irPara consolidado no final do arquivo

// ==============================
// MÓDULO 2 — GASTOS ADAPTATIVOS
// ==============================

// Mapa completo de categorias com ícone, label, id e perfis que a ativam
const CATEGORIAS_CONFIG = [
  {
    id: 'cat-moradia',
    label: 'Moradia',         // aluguel
    labelAlt: 'Financiamento',// financiada
    icon: 'icone-casa-aluguel.png',
    iconFn: (p) => p.moradia === 'financiada' ? 'icone-financiamento.png' : 'icone-casa-aluguel.png',
    ativo: (p) => ['aluguel','financiada'].includes(p.moradia),
    labelFn: (p) => p.moradia === 'financiada' ? 'Financiamento' : 'Aluguel',
    cat: (p) => p.moradia === 'financiada' ? 'Financiamento' : 'Aluguel',
    metaPct: 0.30,   // sugestão: 30% da renda
    novo: false,
  },
  {
    id: 'cat-alimentacao',
    label: 'Alimentação',
    icon: 'icone-alimentacao.png',
    ativo: () => true,       // sempre ativo
    cat: () => 'Alimentação',
    metaPct: 0.15,
    novo: false,
  },
  {
    id: 'cat-carro',
    label: 'Carro',
    icon: 'icone-carro.png',
    ativo: (p) => (p.transporte || []).includes('carro'),
    cat: () => 'Carro',
    metaPct: 0.10,
    novo: false,
  },
  {
    id: 'cat-moto',
    label: 'Moto',
    icon: 'icone-moto.png',
    ativo: (p) => (p.transporte || []).includes('moto'),
    cat: () => 'Moto',
    metaPct: 0.07,
    novo: false,
  },
  {
    id: 'cat-transporte',
    label: 'Transporte',
    icon: 'icone-onibus.png',
    iconFn: (p) => {
      const t = p.transporte || [];
      if (t.includes('app') && !t.includes('publico') && !t.includes('bike')) return 'icone-app.png';
      if (t.includes('bike')) return 'icone-bicicleta.png';
      return 'icone-onibus.png';
    },
    ativo: (p) => {
      const t = p.transporte || [];
      return t.some(x => ['app','publico','bike'].includes(x));
    },
    cat: () => 'Transporte',
    metaPct: 0.05,
    novo: false,
  },
  {
    id: 'cat-educacao',
    label: 'Educação',
    icon: 'icone-bebe.png',
    ativo: (p) => p.filhos === 'sim',
    cat: () => 'Educação',
    metaPct: 0.08,
    novo: true,
  },
  {
    id: 'cat-saude',
    label: 'Saúde',
    icon: 'icone-saude.png',
    ativo: () => true,
    cat: () => 'Saúde',
    metaPct: 0.08,
    novo: false,
  },
  {
    id: 'cat-pets',
    label: 'Pets',
    icon: 'icone-pets.png',
    ativo: (p) => (p.familia || []).includes('pets'),
    cat: () => 'Pets',
    metaPct: 0.05,
    novo: true,
  },
  {
    id: 'cat-lazer',
    label: 'Lazer',
    icon: 'icone-lazer.png',
    ativo: () => true,
    cat: () => 'Lazer',
    metaPct: 0.10,
    novo: false,
  },
  {
    id: 'cat-outros',
    label: 'Outros',
    icon: 'icone-outros.png',
    ativo: () => true,
    cat: () => 'Outros',
    metaPct: 0.05,
    novo: false,
  },
];

function obterPerfilVida() {
  return JSON.parse(localStorage.getItem('monvy_perfil_vida') || '{}');
}

function obterCategoriasAtivas() {
  const p = obterPerfilVida();
  return CATEGORIAS_CONFIG.filter(c => c.ativo(p));
}

function obterTodasCategorias() {
  // Retorna lista de strings para usar nos selects
  const p = obterPerfilVida();
  return CATEGORIAS_CONFIG
    .filter(c => c.ativo(p))
    .map(c => c.labelFn ? c.labelFn(p) : c.label);
}

function sincronizarSelects() {
  // Atualiza os <select> de categoria nos modais conforme perfil
  const cats = obterTodasCategorias();
  ['modal-categoria','edit-categoria'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = cats.map(c =>
      `<option value="${c}"${c === atual ? ' selected' : ''}>${c}</option>`
    ).join('');
  });
}

function renderizarGridCategorias() {
  const grid = document.getElementById('categorias-grid-dinamico');
  if (!grid) return;

  const p = obterPerfilVida();
  // Se não há perfil configurado, mostra TODAS as categorias (ativo sem filtro)
  let lista = obterCategoriasAtivas();
  if (!lista || lista.length === 0) {
    // Fallback: mostrar categorias com ativo=true (padrão universal)
    lista = CATEGORIAS_CONFIG.filter(c => {
      try { return c.ativo({}); } catch(e) { return false; }
    });
  }
  // Garantia mínima: se ainda vazio, mostra todas sem filtro
  if (!lista || lista.length === 0) {
    lista = [...CATEGORIAS_CONFIG];
  }
  const movs = movsFiltradas();

  // Calcular totais por categoria
  const totais = {};
  movs.filter(m => m.tipo === 'gasto').forEach(m => {
    totais[m.categoria] = (totais[m.categoria] || 0) + m.valor;
  });

  const renda = p.renda || 0;

  grid.innerHTML = lista.map(c => {
    const catNome = c.labelFn ? c.labelFn(p) : c.label;
    const icon = c.iconFn ? c.iconFn(p) : c.icon;
    const gasto = totais[catNome] || 0;
    const meta = renda > 0 ? renda * c.metaPct : 0;
    const pct = meta > 0 ? Math.min(100, Math.round((gasto / meta) * 100)) : 0;
    const warnClass = pct >= 100 ? 'danger' : pct >= 75 ? 'warn' : '';
    const idEl = c.id;
    const isNovo = c.novo && p && Object.keys(p).length > 0;

    let metaHtml = '';
    if (meta > 0) {
      metaHtml = `
        <div class="cat-meta-bar">
          <div class="cat-meta-fill ${warnClass}" style="width:${pct}%"></div>
        </div>
        <div class="cat-meta-label ${warnClass}" style="margin-top:5px">${pct}% do limite</div>`;
    }

    return `<div class="cat-card${isNovo ? ' cat-novo' : ''}" style="position:relative;padding-bottom:${meta > 0 ? '18px' : ''}">
      <div class="cat-icon"><img src="${icon}" alt="${catNome}" style="width:56px;height:56px;object-fit:contain;"></div>
      <div class="cat-nome">${catNome}</div>
      <div class="cat-valor" id="${idEl}">${fmt(gasto)}</div>
      ${metaHtml}
    </div>`;
  }).join('');
}

function atualizarBannerPerfil() {
  const banner = document.getElementById('gastos-perfil-banner');
  const desc = document.getElementById('gastos-perfil-desc');
  if (!banner || !desc) return;

  const p = obterPerfilVida();
  // Banner sempre visível; sem perfil mostra texto genérico
  banner.style.display = 'flex';
  if (!p || Object.keys(p).length === 0) {
    if (desc) desc.textContent = 'Configure seu perfil para categorias personalizadas';
    return;
  }
  const partes = [];
  if (p.moradia === 'aluguel') partes.push('aluguel');
  else if (p.moradia === 'financiada') partes.push('financiamento');
  else if (p.moradia === 'propria') partes.push('casa própria');
  const t = p.transporte || [];
  if (t.includes('carro') && t.includes('moto')) partes.push('carro + moto');
  else if (t.includes('carro')) partes.push('carro');
  else if (t.includes('moto')) partes.push('moto');
  if (p.filhos === 'sim') partes.push('filhos');
  if ((p.familia || []).includes('pets')) partes.push('pets');
  desc.textContent = partes.length > 0 ? partes.join(' · ') : 'Perfil configurado';
}

function renderizarSugestaoOrcamento() {
  const el = document.getElementById('sugestao-orcamento');
  if (!el) return;
  const p = obterPerfilVida();
  const renda = p.renda || 0;
  if (renda <= 0) { el.style.display = 'none'; return; }

  const necessidades = Math.round(renda * 0.50);
  const desejos = Math.round(renda * 0.30);
  const futuro = Math.round(renda * 0.20);

  // Calcular o que já foi gasto este mês
  const agora = new Date();
  const gastosMes = movimentacoes
    .filter(m => m.tipo === 'gasto' && m.data && new Date(m.data + 'T00:00:00').getMonth() === agora.getMonth() && new Date(m.data + 'T00:00:00').getFullYear() === agora.getFullYear())
    .reduce((s, m) => s + m.valor, 0);

  const pctGasto = Math.min(100, Math.round((gastosMes / (renda * 0.80)) * 100));
  const fillClass = pctGasto >= 100 ? 'danger' : pctGasto >= 75 ? 'warn' : '';

  el.style.display = 'block';
  el.innerHTML = `<div class="orcamento-sugestao">
    <div class="orcamento-sugestao-titulo">
      <span><img src="icone-grafico-01.png" style="width:28px;height:28px;object-fit:contain;vertical-align:middle"></span>
      Sugestão 50·30·20 — baseada na sua renda de ${fmt(renda)}/mês
      <div style="margin-left:auto;font-size:.72rem;color:var(--gray);font-weight:400">Gastos este mês: <strong style="color:${pctGasto>=100?'#ef4444':pctGasto>=75?'#f59e0b':'var(--primary)'}">${fmt(gastosMes)}</strong></div>
    </div>
    <div class="orcamento-regras">
      <div class="orcamento-regra">
        <div class="orcamento-regra-pct or-verde">50%</div>
        <div class="orcamento-regra-label">Necessidades<br>moradia, alimentação...</div>
        <div class="orcamento-regra-val or-verde">${fmt(necessidades)}</div>
      </div>
      <div class="orcamento-regra">
        <div class="orcamento-regra-pct or-azul">30%</div>
        <div class="orcamento-regra-label">Desejos<br>lazer, roupas...</div>
        <div class="orcamento-regra-val or-azul">${fmt(desejos)}</div>
      </div>
      <div class="orcamento-regra">
        <div class="orcamento-regra-pct or-amarelo">20%</div>
        <div class="orcamento-regra-label">Futuro<br>reserva, investimento</div>
        <div class="orcamento-regra-val or-amarelo">${fmt(futuro)}</div>
      </div>
    </div>
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--gray);margin-bottom:4px">
        <span>Progresso de gastos este mês</span>
        <span>${pctGasto}% do orçamento</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden">
        <div style="height:100%;width:${pctGasto}%;border-radius:6px;background:${pctGasto>=100?'#ef4444':pctGasto>=75?'#f59e0b':'#22c55e'};transition:width .5s ease"></div>
      </div>
    </div>
  </div>`;
}

// Sobrescreve atualizarTelaCategorias para versão adaptativa
function atualizarTelaCategorias() {
  renderizarGridCategorias();
  atualizarBannerPerfil();
  renderizarSugestaoOrcamento();
  sincronizarSelects();

  // Recalcular totais para o gráfico pizza (usando categorias ativas)
  const lista = movsFiltradas();
  const p = obterPerfilVida();
  const cats = {};
  obterCategoriasAtivas().forEach(c => {
    const nome = c.labelFn ? c.labelFn(p) : c.label;
    cats[nome] = 0;
  });
  lista.filter(m => m.tipo === 'gasto').forEach(m => {
    if (cats[m.categoria] !== undefined) cats[m.categoria] += m.valor;
    else cats['Outros'] = (cats['Outros'] || 0) + m.valor;
  });
  atualizarChartPizza(cats);

  // Tabela
  const tbody = document.getElementById('tabela-gastos');
  const count = document.getElementById('table-count');
  count.textContent = lista.length + ' registros';
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="vazio">Nenhuma movimentação no período.</td></tr>';
    return;
  }
  tbody.innerHTML = [...lista].sort((a,b) => (b.data||'').localeCompare(a.data||'')).map(m => {
    const idx = movimentacoes.indexOf(m);
    return `<tr>
      <td>${m.descricao}${m.recorrente ? ' <span style="font-size:.7rem;background:rgba(57,255,121,0.15);color:var(--primary);padding:1px 6px;border-radius:4px">recorrente</span>' : ''}</td>
      <td style="color:var(--gray);font-size:.82rem">${m.data ? fmtData(m.data) : '—'}</td>
      <td>${m.tipo === 'ganho' ? '—' : m.categoria}</td>
      <td><span class="badge ${m.tipo}">${m.tipo === 'ganho' ? '↑ Entrada' : '↓ Saída'}</span></td>
      <td class="mov-valor ${m.tipo === 'ganho' ? 'positivo' : 'negativo'}">${m.tipo === 'ganho' ? '+' : '-'}${fmt(m.valor)}</td>
      <td><button onclick="abrirModalEditar(${idx})" style="background:none;border:none;cursor:pointer;color:var(--gray);padding:4px;border-radius:6px" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
}

// FIX: salvarPerfilVida wrapper — recalibra categorias após salvar perfil de vida
const _salvarPerfilVidaBase = salvarPerfilVida;
window.salvarPerfilVida = function(...args) {
  const result = _salvarPerfilVidaBase(...args);
  // Recalibrar categorias, banner e selects com pequeno delay para DOM atualizar
  setTimeout(() => {
    try { atualizarTelaCategorias(); } catch(e) {}
    try { atualizarBannerPerfil(); }    catch(e) {}
    try { sincronizarSelects(); }       catch(e) {}
    try { atualizarKPIs(); }            catch(e) {}
  }, 120);
  return result;
};

// Inicializar selects ao carregar (garante sincronia mesmo sem entrar na tela)
window.addEventListener('load', () => {
  try { sincronizarSelects(); } catch(e) { console.error('[Monvay] sincronizarSelects:', e); }
  try { renderizarGridCategorias(); } catch(e) { console.error('[Monvay] renderizarGridCategorias:', e); }
  try { atualizarBannerPerfil(); } catch(e) { console.error('[Monvay] atualizarBannerPerfil:', e); }

  // Dica do dia — rotação aleatória (apenas texto, ícone é sempre a lâmpada PNG)
  const dicasDoDia = [
    'Antes de investir, tenha uma reserva de emergência de pelo menos 3 meses de gastos. LCI/LCA são isentos de IR para pessoa física.',
    'Reserva de emergência ideal: 3 a 6 meses de despesas guardadas em investimentos com liquidez diária, como Tesouro Selic ou CDB.',
    'Regra 50-30-20: destine 50% da renda para necessidades, 30% para desejos e 20% para poupança e investimentos.',
    'Dívidas com juros altos (cartão, cheque especial) devem ser quitadas antes de começar a investir. Os juros corroem seu patrimônio.',
    'Defina metas financeiras específicas com prazo e valor. Isso aumenta muito as chances de você alcançá-las.',
    'O poder dos juros compostos: investindo R$200/mês por 20 anos a 10% a.a., você acumula mais de R$150 mil.',
    'Cartão de crédito não é extensão de renda. Use-o apenas para o que você já tem dinheiro guardado para pagar.',
    'Diversifique seus investimentos entre renda fixa e variável de acordo com seu perfil de risco e objetivos.',
  ];
  const textoEl = document.getElementById('dica-dia-texto');
  if (textoEl) textoEl.textContent = dicasDoDia[new Date().getDate() % dicasDoDia.length];
});

// (Exposição global de funções consolidada ao final do arquivo)

// ==============================
// RESET MENSAL + HISTÓRICO
// ==============================

function mostrarToastResetMes() {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%);
    background:#1a2236;border:1px solid rgba(0,200,83,0.3);border-radius:14px;
    padding:16px 24px;color:#fff;font-size:.88rem;font-weight:500;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:9999;
    display:flex;align-items:center;gap:12px;max-width:340px;text-align:center;
    animation:slideUp .3s ease;
  `;
  toast.innerHTML = `
    <img src="icone-grafico-01.png" style="width:28px;height:28px;object-fit:contain;flex-shrink:0">
    <div>
      <div style="font-weight:700;color:var(--primary);margin-bottom:2px">Novo mês, novo começo! 🎯</div>
      <div style="color:#94a3b8;font-size:.8rem">O mês anterior foi arquivado no Relatório.</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

async function carregarHistorico() {
  if (!currentUser) return;
  const el = document.getElementById('historico-lista');
  if (!el) return;
  el.innerHTML = '<div class="vazio">Carregando...</div>';
  try {
    const historico = await getHistorico(currentUser.uid);
    if (historico.length === 0) {
      el.innerHTML = '<div class="vazio">Nenhum histórico ainda.<br><span style="font-size:.8rem;opacity:.6">O primeiro fechamento acontece automaticamente no início do próximo mês.</span></div>';
      return;
    }
    const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    el.innerHTML = historico.map(h => {
      const [ano, mes] = h.mes.split('-');
      const nomeMes = MESES_NOMES[parseInt(mes) - 1] + ' ' + ano;
      const saldoPos = (h.saldo || 0) >= 0;
      return `
        <div class="historico-card" onclick="toggleHistoricoDetalhes('${h.mes}')" style="cursor:pointer">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-weight:700;font-size:.95rem;color:var(--white)">${nomeMes}</div>
            <div style="font-size:.82rem;font-weight:700;color:${saldoPos?'#22c55e':'#ef4444'}">${saldoPos?'+':''}${fmt(h.saldo||0)}</div>
          </div>
          <div style="display:flex;gap:20px;font-size:.8rem;color:var(--gray)">
            <span>↑ <strong style="color:#22c55e">${fmt(h.entradas||0)}</strong></span>
            <span>↓ <strong style="color:#ef4444">${fmt(h.saidas||0)}</strong></span>
            <span>${h.totalMovimentacoes||0} movimentações</span>
          </div>
          <div id="hist-det-${h.mes}" style="display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
            ${(h.movimentacoes||[]).map(m => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.82rem;border-bottom:1px solid rgba(255,255,255,0.04)">
                <span style="color:var(--white)">${m.descricao}</span>
                <span style="color:${m.tipo==='ganho'?'#22c55e':'#ef4444'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</span>
              </div>
            `).join('')}
          </div>
          <div style="text-align:right;font-size:.72rem;color:var(--primary);margin-top:6px">Ver movimentações ▾</div>
        </div>
      `;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="vazio">Erro ao carregar histórico.</div>';
    console.error(e);
  }
}

window.toggleHistoricoDetalhes = function(mes) {
  const el = document.getElementById('hist-det-' + mes);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ==============================
// MÓDULO: CONTAS A PAGAR
// ==============================

let contasCadastradas = [];
let contasFiltro = 'todas';
let contasMesOffset = 0;
// Expose para o manual_engine
Object.defineProperty(window, '_contasCadastradas', { get: () => contasCadastradas });
let editandoContaId = null;

const CONTA_CAT_ICONS = {
  'Moradia':     '🏠', 'Assinatura': '📱', 'Educação': '📚',
  'Saúde':       '❤️', 'Transporte': '🚌', 'Alimentação': '🍽️', 'Outros': '📋'
};

function diasParaVencimento(dataStr) {
  if (!dataStr) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataStr + 'T00:00:00');
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24));
}

function statusConta(conta) {
  if (conta.paga) return 'paga';
  const dias = diasParaVencimento(conta.vencimento);
  if (dias === null) return 'pendente';
  if (dias < 0) return 'vencida';
  if (dias <= 3) return 'proxima';
  return 'pendente';
}

function renderizarContas() {
  // KPIs
  const total = contasCadastradas.filter(c => !c.paga).reduce((s,c) => s + (c.valor||0), 0);
  const vencidas = contasCadastradas.filter(c => statusConta(c) === 'vencida').length;
  const proximas = contasCadastradas.filter(c => statusConta(c) === 'proxima').length;
  const pagas = contasCadastradas.filter(c => c.paga).length;

  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  el('contas-kpi-total', fmt(total));
  el('contas-kpi-qtd', contasCadastradas.filter(c=>!c.paga).length + ' pendente(s)');
  el('contas-kpi-vencidas', vencidas);
  el('contas-kpi-proximas', proximas);
  el('contas-kpi-pagas', pagas);
  el('contas-lista-count', contasCadastradas.length + ' conta(s)');

  // Calendário
  renderizarCalendarioContas();

  // Lista filtrada
  let lista = [...contasCadastradas];
  if (contasFiltro === 'pendentes') lista = lista.filter(c => !c.paga && statusConta(c) !== 'vencida');
  if (contasFiltro === 'vencidas')  lista = lista.filter(c => statusConta(c) === 'vencida');
  if (contasFiltro === 'pagas')     lista = lista.filter(c => c.paga);

  // Ordenar: vencidas primeiro, depois por data
  lista.sort((a,b) => {
    if (a.paga && !b.paga) return 1;
    if (!a.paga && b.paga) return -1;
    return (a.vencimento||'').localeCompare(b.vencimento||'');
  });

  const listaEl = document.getElementById('lista-contas');
  if (!listaEl) return;
  if (lista.length === 0) {
    listaEl.innerHTML = '<div class="vazio">Nenhuma conta nessa categoria.</div>';
    return;
  }

  listaEl.innerHTML = lista.map(c => {
    const st = statusConta(c);
    const dias = diasParaVencimento(c.vencimento);
    const diasLabel = c.paga ? 'Paga' :
      dias === null ? '' :
      dias < 0 ? `Venceu há ${Math.abs(dias)} dia(s)` :
      dias === 0 ? 'Vence hoje!' :
      dias <= 3 ? `Vence em ${dias} dia(s)` :
      `Vence em ${dias} dias`;

    const statusColor = c.paga ? '#22c55e' : st === 'vencida' ? '#ef4444' : st === 'proxima' ? '#f59e0b' : 'var(--gray)';
    const bordaColor  = c.paga ? 'rgba(34,197,94,0.2)' : st === 'vencida' ? 'rgba(239,68,68,0.3)' : st === 'proxima' ? 'rgba(245,158,11,0.3)' : 'var(--border)';

    return `
      <div class="conta-card" style="border-color:${bordaColor}">
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="font-size:1.4rem;flex-shrink:0;margin-top:2px"><img src="icone-conta.png" style="width:28px;height:28px;object-fit:contain;"></div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <span style="font-weight:600;color:var(--white);font-size:.92rem">${c.descricao}</span>
              <span style="font-weight:700;font-size:.95rem;color:${c.paga?'#22c55e':'var(--white)'}">${fmt(c.valor||0)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px;flex-wrap:wrap">
              <span style="font-size:.75rem;color:var(--gray)">${c.categoria}${c.recorrente?' · recorrente':''}</span>
              <span style="font-size:.75rem;font-weight:600;color:${statusColor}">${diasLabel}</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              ${!c.paga ? `<button onclick="pagarConta('${c.id}')" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:5px 12px;font-size:.75rem;color:#22c55e;cursor:pointer;font-family:inherit">✓ Marcar como paga</button>` : `<span style="font-size:.75rem;color:#22c55e;font-weight:600">✓ Paga</span>`}
              <button onclick="editarConta('${c.id}')" style="background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;padding:5px 12px;font-size:.75rem;color:var(--gray);cursor:pointer;font-family:inherit">Editar</button>
              <button onclick="excluirConta('${c.id}')" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:5px 12px;font-size:.75rem;color:#ef4444;cursor:pointer;font-family:inherit">Excluir</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderizarCalendarioContas() {
  const agora = new Date();
  const alvo = new Date(agora.getFullYear(), agora.getMonth() + contasMesOffset, 1);
  const label = document.getElementById('contas-mes-label');
  if (label) label.textContent = MESES[alvo.getMonth()] + ' ' + alvo.getFullYear();

  const grid = document.getElementById('contas-grid-dias');
  if (!grid) return;

  // Remover dias antigos, manter cabeçalho (7 primeiros)
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  const primeiroDia = new Date(alvo.getFullYear(), alvo.getMonth(), 1).getDay();
  const totalDias = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  // Contas do mês visualizado
  const anoMes = `${alvo.getFullYear()}-${String(alvo.getMonth()+1).padStart(2,'0')}`;
  const contasMes = contasCadastradas.filter(c => c.vencimento && c.vencimento.startsWith(anoMes));

  // Células vazias antes do 1º dia
  for (let i = 0; i < primeiroDia; i++) {
    const vazio = document.createElement('div');
    grid.appendChild(vazio);
  }

  for (let d = 1; d <= totalDias; d++) {
    const cell = document.createElement('div');
    const dataStr = `${alvo.getFullYear()}-${String(alvo.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const contasDia = contasMes.filter(c => c.vencimento === dataStr);
    const diaDate = new Date(dataStr + 'T00:00:00');
    const isHoje = diaDate.getTime() === hoje.getTime();

    let bg = 'transparent', color = 'var(--gray)', border = 'none';
    if (contasDia.length > 0) {
      const temVencida = contasDia.some(c => !c.paga && diaDate < hoje);
      const temPaga = contasDia.every(c => c.paga);
      bg = temPaga ? 'rgba(34,197,94,0.2)' : temVencida ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)';
      color = temPaga ? '#22c55e' : temVencida ? '#ef4444' : '#f59e0b';
    }
    if (isHoje) border = '1px solid var(--primary)';

    cell.style.cssText = `font-size:.7rem;padding:4px 2px;border-radius:6px;background:${bg};color:${color};border:${border};font-weight:${contasDia.length>0?'700':'400'};cursor:${contasDia.length>0?'pointer':'default'};`;
    cell.textContent = d;
    if (contasDia.length > 0) {
      cell.title = contasDia.map(c => c.descricao).join(', ');
    }
    grid.appendChild(cell);
  }
}

async function salvarConta() {
  if (!currentUser) return;
  const descricao  = document.getElementById('conta-descricao').value.trim();
  const valor      = parseFloat(document.getElementById('conta-valor').value);
  const vencimento = document.getElementById('conta-vencimento').value;
  const categoria  = document.getElementById('conta-categoria').value;
  const recorrente = document.getElementById('conta-recorrente').checked;

  if (!descricao || isNaN(valor) || !vencimento) {
    alert('Preencha descrição, valor e vencimento.'); return;
  }

  const dados = { descricao, valor, vencimento, categoria, recorrente, paga: false };

  try {
    if (editandoContaId) {
      await atualizarConta(currentUser.uid, editandoContaId, dados);
      const idx = contasCadastradas.findIndex(c => c.id === editandoContaId);
      if (idx >= 0) contasCadastradas[idx] = { ...contasCadastradas[idx], ...dados };
      cancelarEdicaoConta();
    } else {
      const id = await adicionarConta(currentUser.uid, dados);
      contasCadastradas.push({ id, ...dados });
    }
    limparFormConta();
    renderizarContas();
    verificarAlertasContas();
    const suc = document.getElementById('conta-sucesso');
    if (suc) { suc.style.display='block'; setTimeout(()=>suc.style.display='none', 2000); }
  } catch(e) { console.error(e); alert('Erro ao salvar conta.'); }
}

function limparFormConta() {
  ['conta-descricao','conta-valor','conta-vencimento'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('conta-recorrente').checked = false;
  document.getElementById('conta-categoria').value = 'Moradia';
}

function editarConta(id) {
  const c = contasCadastradas.find(c => c.id === id);
  if (!c) return;
  editandoContaId = id;
  document.getElementById('conta-descricao').value  = c.descricao || '';
  document.getElementById('conta-valor').value      = c.valor || '';
  document.getElementById('conta-vencimento').value = c.vencimento || '';
  document.getElementById('conta-categoria').value  = c.categoria || 'Outros';
  document.getElementById('conta-recorrente').checked = c.recorrente || false;
  document.getElementById('contas-form-titulo').textContent = 'Editar Conta';
  document.getElementById('btn-salvar-conta').textContent = 'Salvar alterações';
  document.getElementById('btn-cancelar-conta').style.display = 'block';
  irParaComHooks('contas');
  document.getElementById('conta-descricao').focus();
}

function cancelarEdicaoConta() {
  editandoContaId = null;
  limparFormConta();
  document.getElementById('contas-form-titulo').textContent = 'Nova Conta';
  document.getElementById('btn-salvar-conta').textContent = 'Cadastrar conta';
  document.getElementById('btn-cancelar-conta').style.display = 'none';
}

async function pagarConta(id) {
  if (!currentUser) return;
  const c = contasCadastradas.find(c => c.id === id);
  if (!c) return;

  try {
    // Marcar como paga no Firestore
    await atualizarConta(currentUser.uid, id, { paga: true });
    const idx = contasCadastradas.findIndex(c => c.id === id);
    if (idx >= 0) contasCadastradas[idx].paga = true;

    // Lançar automaticamente como saída nas movimentações
    await adicionarMovimentacao(currentUser.uid, {
      descricao: c.descricao,
      valor: c.valor,
      tipo: 'gasto',
      categoria: c.categoria || 'Outros',
      data: hojeISO(),
      recorrente: false,
      origem: 'conta_paga'
    });

    renderizarContas();
    verificarAlertasContas();
    // Atualizar insights após pagamento
    setTimeout(() => { if (typeof executarManualEngine === 'function') executarManualEngine(); }, 300);

    // Toast confirmação
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1a2236;border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:12px 20px;color:#22c55e;font-size:.85rem;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:9999;white-space:nowrap';
    t.textContent = `✓ "${c.descricao}" paga e lançada como saída`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  } catch(e) { console.error(e); alert('Erro ao marcar como paga.'); }
}

async function excluirConta(id) {
  if (!currentUser) return;
  if (!confirm('Excluir esta conta?')) return;
  try {
    await deletarConta(currentUser.uid, id);
    contasCadastradas = contasCadastradas.filter(c => c.id !== id);
    renderizarContas();
  } catch(e) { console.error(e); }
}

function filtrarContas(filtro, btn) {
  contasFiltro = filtro;
  document.querySelectorAll('.contas-filtro-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderizarContas();
}

function mudarMesContas(delta) {
  contasMesOffset += delta;
  renderizarCalendarioContas();
}

function verificarAlertasContas() {
  const vencidas = contasCadastradas.filter(c => statusConta(c) === 'vencida');
  const proximas = contasCadastradas.filter(c => statusConta(c) === 'proxima');
  const total = vencidas.length + proximas.length;
  if (total === 0) return;

  // Badge no ícone da sidebar
  const navContas = document.querySelector('[data-tela="contas"]');
  if (navContas && !navContas.querySelector('.conta-badge')) {
    const badge = document.createElement('span');
    badge.className = 'conta-badge';
    badge.textContent = total;
    badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;border-radius:50%;width:16px;height:16px;font-size:.6rem;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1';
    navContas.style.position = 'relative';
    navContas.appendChild(badge);
  }
}

// ===== MÓDULO 3: SCORE FINANCEIRO =====

let scoreHistoricoChart = null;

function calcularScore() {
  // Pontua cada critério
  const pts = { gastos: 0, dividas: 0, metas: 0, reserva: 0 };
  const labels = { gastos: '', dividas: '', metas: '', reserva: '' };
  const pcts = { gastos: 0, dividas: 0, metas: 0, reserva: 0 };

  // 1. CONTROLE DE GASTOS (0–300 pts)
  // Baseado em % da renda gasta
  if (totalEntradas > 0) {
    const pctGasto = (totalSaidas / totalEntradas) * 100;
    if (pctGasto <= 50)       { pts.gastos = 300; labels.gastos = `${pctGasto.toFixed(0)}% da renda — Excelente!`; pcts.gastos = 100; }
    else if (pctGasto <= 70)  { pts.gastos = 230; labels.gastos = `${pctGasto.toFixed(0)}% da renda — Bom controle`; pcts.gastos = Math.round(pctGasto); }
    else if (pctGasto <= 90)  { pts.gastos = 130; labels.gastos = `${pctGasto.toFixed(0)}% da renda — Atenção!`; pcts.gastos = Math.round(pctGasto); }
    else if (pctGasto <= 100) { pts.gastos = 50;  labels.gastos = `${pctGasto.toFixed(0)}% da renda — Limite!`; pcts.gastos = 95; }
    else                      { pts.gastos = 0;   labels.gastos = `${pctGasto.toFixed(0)}% da renda — Gasto além da renda!`; pcts.gastos = 100; }
  } else {
    pts.gastos = 150; pcts.gastos = 50; labels.gastos = 'Sem entradas registradas';
  }

  // 2. DÍVIDAS ATIVAS (0–250 pts)
  const todasDividas = (typeof dividasCadastradas !== 'undefined') ? dividasCadastradas : [];
  const dividasAtivas   = todasDividas.filter(d => !d.quitada);
  const dividasQuitadas = todasDividas.filter(d => d.quitada);
  const totalDividas = dividasAtivas.reduce((s, d) => s + d.valor, 0);
  const totalQuitadas = dividasQuitadas.length;

  // Bônus por dívidas quitadas: até +50 pts extras (máx 5 quitadas = +50 pts)
  const bonusQuitadas = Math.min(totalQuitadas * 10, 50);

  if (totalDividas === 0 && totalQuitadas === 0) {
    pts.dividas = 250; pcts.dividas = 100; labels.dividas = 'Sem dívidas — Parabéns! 🎉';
  } else if (totalDividas === 0 && totalQuitadas > 0) {
    pts.dividas = Math.min(250 + bonusQuitadas, 300); pcts.dividas = 100;
    labels.dividas = `Todas as dívidas quitadas! 🏆 (${totalQuitadas} quitada${totalQuitadas > 1 ? 's' : ''})`;
  } else if (totalEntradas > 0) {
    const mesesDivida = totalDividas / totalEntradas;
    if (mesesDivida <= 1)      { pts.dividas = Math.min(180 + bonusQuitadas, 250); pcts.dividas = 80; labels.dividas = fmt(totalDividas) + ` em dívidas ativas${totalQuitadas > 0 ? ` · ${totalQuitadas} quitada${totalQuitadas>1?'s':''} ✓` : ''}`; }
    else if (mesesDivida <= 3) { pts.dividas = Math.min(120 + bonusQuitadas, 250); pcts.dividas = 55; labels.dividas = fmt(totalDividas) + ` em dívidas ativas${totalQuitadas > 0 ? ` · ${totalQuitadas} quitada${totalQuitadas>1?'s':''} ✓` : ''}`; }
    else if (mesesDivida <= 6) { pts.dividas = Math.min(60  + bonusQuitadas, 250); pcts.dividas = 30; labels.dividas = fmt(totalDividas) + ` em dívidas (pesado!)${totalQuitadas > 0 ? ` · ${totalQuitadas} quitada${totalQuitadas>1?'s':''} ✓` : ''}`; }
    else                       { pts.dividas = Math.min(0   + bonusQuitadas, 250); pcts.dividas = 10; labels.dividas = fmt(totalDividas) + ` em dívidas (crítico!)${totalQuitadas > 0 ? ` · ${totalQuitadas} quitada${totalQuitadas>1?'s':''} ✓` : ''}`; }
  } else {
    pts.dividas = bonusQuitadas; pcts.dividas = 10; labels.dividas = fmt(totalDividas) + ' em dívidas';
  }

  // 3. METAS CUMPRIDAS (0–250 pts)
  if (typeof metas !== 'undefined' && metas.length > 0) {
    const totalMeta = metas.reduce((s, m) => s + m.objetivo, 0);
    const totalAtual = metas.reduce((s, m) => s + (m.atual || 0), 0);
    const pctMeta = totalMeta > 0 ? Math.min((totalAtual / totalMeta) * 100, 100) : 0;
    pts.metas = Math.round(pctMeta / 100 * 250);
    pcts.metas = Math.round(pctMeta);
    labels.metas = `${pctMeta.toFixed(0)}% das metas concluídas`;
  } else {
    pts.metas = 0; pcts.metas = 0; labels.metas = 'Nenhuma meta cadastrada';
  }

  // 4. RESERVA FINANCEIRA (0–200 pts)
  if (saldo <= 0) {
    pts.reserva = 0; pcts.reserva = 0; labels.reserva = 'Saldo negativo — emergência!';
  } else if (totalEntradas > 0) {
    const mesesReserva = saldo / totalEntradas;
    if (mesesReserva >= 6)     { pts.reserva = 200; pcts.reserva = 100; labels.reserva = `${mesesReserva.toFixed(1)} meses de reserva — Ótimo!`; }
    else if (mesesReserva >= 3){ pts.reserva = 150; pcts.reserva = 75;  labels.reserva = `${mesesReserva.toFixed(1)} meses de reserva — Bom!`; }
    else if (mesesReserva >= 1){ pts.reserva = 90;  pcts.reserva = 45;  labels.reserva = `${mesesReserva.toFixed(1)} mes(es) de reserva — Construindo`; }
    else                       { pts.reserva = 40;  pcts.reserva = 20;  labels.reserva = `Menos de 1 mês de reserva`; }
  } else {
    pts.reserva = saldo > 0 ? 80 : 0; pcts.reserva = 20; labels.reserva = fmt(saldo) + ' em caixa';
  }

  // Penalidade por contas vencidas
  const contasV = typeof window._contasCadastradas !== 'undefined'
    ? window._contasCadastradas.filter(c => {
        if (c.paga) return false;
        const v = new Date(c.vencimento + 'T12:00:00');
        return v < new Date();
      })
    : [];
  const penalidade = Math.min(contasV.length * 30, 150); // até -150 pts

  const total = Math.max(0, pts.gastos + pts.dividas + pts.metas + pts.reserva - penalidade);

  // Classificação
  let badge, cor, dica;
  const iconStyle = 'width:56px;height:56px;object-fit:contain;vertical-align:middle;margin-right:0;margin-bottom:2px';
  if (total >= 800)      { badge = `<img src="icone-score-excelente.png" style="${iconStyle}"> Excelente`; cor = '#22C55E'; dica = 'Você está no topo! Mantenha a consistência e pense em diversificar seus investimentos.'; }
  else if (total >= 600) { badge = `<img src="icone-score-bom.png" style="${iconStyle}"> Bom`; cor = '#84CC16'; dica = 'Ótima situação! Foque em aumentar sua reserva de emergência para 6 meses de renda.'; }
  else if (total >= 400) { badge = `<img src="icone-score-estavel.png" style="${iconStyle}"> Estável`; cor = '#F59E0B'; dica = 'Situação controlada. Revise seus gastos e crie ou acelere suas metas financeiras.'; }
  else if (total >= 200) { badge = `<img src="icone-score-atencao.png" style="${iconStyle}"> Atenção`; cor = '#F97316'; dica = 'Há espaço para melhorar. Reduza dívidas e controle os gastos no próximo mês.'; }
  else                   { badge = `<img src="icone-score-critico.png" style="${iconStyle}"> Crítico`; cor = '#EF4444'; dica = 'Situação crítica. Priorize quitar dívidas, corte gastos e busque aumentar a renda.'; }
  if (penalidade > 0) dica = `⚠️ ${contasV.length} conta(s) vencida(s) reduziram seu score em ${penalidade} pontos. ` + dica;

  // Animação do número
  animarScore(total);

  // Atualizar gauge
  atualizarGauge(total, cor);

  // Badge e dica principal
  document.getElementById('score-badge').innerHTML = badge;
  document.getElementById('score-tip').textContent = dica;

  // Critérios
  atualizarCriterio('gastos', pts.gastos, 300, pcts.gastos, labels.gastos);
  atualizarCriterio('dividas', pts.dividas, 250, pcts.dividas, labels.dividas);
  atualizarCriterio('metas', pts.metas, 250, pcts.metas, labels.metas);
  atualizarCriterio('reserva', pts.reserva, 200, pcts.reserva, labels.reserva);

  // Dicas personalizadas
  renderizarDicas(pts, total);

  // Mini card no dashboard
  const miniEl = document.getElementById('kpi-score-mini');
  const miniLabel = document.getElementById('kpi-score-mini-label');
  if (miniEl) miniEl.textContent = total;
  if (miniLabel) miniLabel.innerHTML = badge + ' → Ver detalhes';

  // Salvar histórico
  salvarHistoricoScore(total);
  renderizarHistoricoScore();
}

function atualizarCriterio(id, pts, max, pct, label) {
  const ptsEl = document.getElementById('sc-' + id + '-pts');
  const barEl = document.getElementById('sc-' + id + '-bar');
  const labelEl = document.getElementById('sc-' + id + '-label');
  if (ptsEl) ptsEl.textContent = pts + ' / ' + max + ' pts';
  if (barEl) {
    setTimeout(() => { barEl.style.width = Math.min(pct, 100) + '%'; }, 200);
  }
  if (labelEl) labelEl.textContent = label;
}

function animarScore(target) {
  const el = document.getElementById('score-numero');
  if (!el) return;
  const duration = 1200;
  const start = parseInt(el.textContent) || 0;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function atualizarGauge(score, cor) {
  const arc = document.getElementById('score-gauge-arc');
  if (!arc) return;
  const totalLength = 251.3; // semicircle at radius 80
  const pct = Math.min(score / 1000, 1);
  const offset = totalLength - (pct * totalLength);
  arc.style.stroke = cor;
  arc.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.5s';
  setTimeout(() => { arc.style.strokeDashoffset = offset; }, 100);
}

function renderizarDicas(pts, total) {
  const el = document.getElementById('score-dicas-lista');
  if (!el) return;
  const dicas = [];

  const img = (src) => `<img src="${src}" style="width:32px;height:32px;object-fit:contain;">`;

  if (pts.gastos < 200) dicas.push({ icon: img('icone-dinheiro-01.png'), titulo: 'Reduza os gastos', texto: 'Você está comprometendo mais de 70% da renda. Identifique as categorias que mais pesam e corte o supérfluo.' });
  if (pts.gastos >= 230) dicas.push({ icon: img('icone-grafico-01.png'), titulo: 'Gastos sob controle', texto: 'Excelente controle! Considere direcionar parte do que sobra para investimentos.' });

  if (dividasAtivas.length > 0 && pts.dividas < 120) dicas.push({ icon: img('icone-banco.png'), titulo: 'Quite dívidas primeiro', texto: 'Dívidas consomem sua renda futura. Use o método Avalanche (maior juros primeiro) para sair mais rápido.' });
  if (dividasAtivas.length === 0 && dividasQuitadas.length > 0) dicas.push({ icon: img('icone-trofeu.png'), titulo: 'Todas as dívidas quitadas! 🏆', texto: `Incrível! Você quitou ${dividasQuitadas.length} dívida${dividasQuitadas.length>1?'s':''} e ganhou pontos bônus no score. Agora redirecione esse dinheiro para investir!` });
  if (dividasAtivas.length > 0 && dividasQuitadas.length > 0) dicas.push({ icon: img('icone-trofeu.png'), titulo: `${dividasQuitadas.length} dívida${dividasQuitadas.length>1?'s':''} quitada${dividasQuitadas.length>1?'s':''}! ✓`, texto: 'Continue assim! Cada dívida quitada aumenta seu score. Foque agora nas dívidas restantes.' });

  if (pts.metas === 0) dicas.push({ icon: `<img src="icone-meta.png" style="width:44px;height:44px;object-fit:contain;">`, titulo: 'Crie suas metas', texto: 'Metas dão direção ao dinheiro. Cadastre pelo menos uma meta — viagem, reserva, ou conquista pessoal.' });
  else if (pts.metas < 150) dicas.push({ icon: img('icone-foguete.png'), titulo: 'Acelere suas metas', texto: 'Você está progredindo! Tente contribuir um valor fixo por mês para cada meta.' });

  if (pts.reserva < 90) dicas.push({ icon: img('icone-cofre.png'), titulo: 'Construa uma reserva', texto: 'Seu objetivo é ter 6 meses de despesas guardadas. Comece com um valor pequeno — o hábito é o que importa.' });
  if (pts.reserva >= 200) dicas.push({ icon: img('icone-cofre.png'), titulo: 'Reserva sólida!', texto: 'Parabéns! Com 6+ meses de reserva, explore investimentos de médio prazo para fazer o dinheiro crescer.' });

  if (total >= 800) dicas.push({ icon: img('icone-foguete.png'), titulo: 'Pense em investir', texto: 'Com score excelente, é hora de pensar em diversificação: renda fixa, ações, fundos imobiliários.' });

  if (dicas.length === 0) {
    el.innerHTML = '<div class="vazio">Continue assim! Seu score está sendo monitorado.</div>';
    return;
  }

  el.innerHTML = dicas.map(d => `
    <div class="score-dica-item">
      <span class="score-dica-icon">${d.icon}</span>
      <div>
        <div class="score-dica-titulo">${d.titulo}</div>
        <div class="score-dica-texto">${d.texto}</div>
      </div>
    </div>
  `).join('');
}

function salvarHistoricoScore(score) {
  const key = 'monvy_score_historico';
  const hist = JSON.parse(localStorage.getItem(key) || '[]');
  const mesAtual = new Date().toISOString().slice(0, 7); // YYYY-MM
  const idx = hist.findIndex(h => h.mes === mesAtual);
  if (idx >= 0) hist[idx].score = score;
  else hist.push({ mes: mesAtual, score });
  // Manter apenas os últimos 12 meses
  if (hist.length > 12) hist.splice(0, hist.length - 12);
  localStorage.setItem(key, JSON.stringify(hist));
}

function renderizarHistoricoScore() {
  const key = 'monvy_score_historico';
  const hist = JSON.parse(localStorage.getItem(key) || '[]');
  const canvas = document.getElementById('score-history-chart');
  const empty = document.getElementById('score-history-empty');
  if (!canvas) return;

  if (hist.length <= 1) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const labels = hist.map(h => {
    const [y, m] = h.mes.split('-');
    return new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'short' });
  });
  const scores = hist.map(h => h.score);

  if (scoreHistoricoChart) scoreHistoricoChart.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';

  scoreHistoricoChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: scores,
        borderColor: '#22C55E',
        backgroundColor: 'rgba(34,197,94,0.12)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#22C55E',
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => 'Score: ' + ctx.parsed.y }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: { min: 0, max: 1000, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: textColor, stepSize: 200 } }
      }
    }
  });
}

// Hook de score e investimentos integrado ao irPara central (ver final do arquivo)

// ===================================================================
// MANUAL_ENGINE — Motor de Decisão Monvay
// ===================================================================

function executarManualEngine() {
  // ---- Coletar dados ----
  const hoje = new Date();
  const _contasEngine = (typeof contasCadastradas !== 'undefined' && Array.isArray(contasCadastradas)) ? contasCadastradas : [];

  // Contas vencidas e próximas
  const vencidas = _contasEngine.filter(c => {
    if (c.paga) return false;
    const venc = new Date(c.vencimento + 'T12:00:00');
    return venc < hoje;
  });
  const proximas = _contasEngine.filter(c => {
    if (c.paga) return false;
    const venc = new Date(c.vencimento + 'T12:00:00');
    const diff = (venc - hoje) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 3;
  });

  // Score atual e anterior
  const histScore = JSON.parse(localStorage.getItem('monvy_score_historico') || '[]');
  const scoreAtual = histScore.length > 0 ? histScore[histScore.length - 1].score : 0;
  const scoreAnterior = histScore.length > 1 ? histScore[histScore.length - 2].score : scoreAtual;

  // Gastos por categoria vs média (últimos 2 meses)
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const mesAnterior = (() => { const d = new Date(hoje); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  function gastosMes(mes) {
    const movs = typeof movimentacoes !== 'undefined' ? movimentacoes : [];
    return movs.filter(m => m.tipo === 'gasto' && m.data && m.data.startsWith(mes));
  }

  const gastosPorCat = {};
  gastosMes(mesAtual).forEach(m => {
    const cat = m.categoria || 'Outros';
    gastosPorCat[cat] = (gastosPorCat[cat] || 0) + m.valor;
  });
  const gastosPorCatAnt = {};
  gastosMes(mesAnterior).forEach(m => {
    const cat = m.categoria || 'Outros';
    gastosPorCatAnt[cat] = (gastosPorCatAnt[cat] || 0) + m.valor;
  });

  // Metas com progresso >= 80%
  const metasQuaseConcluidas = (typeof metas !== 'undefined' ? metas : []).filter(m => {
    const pct = m.objetivo > 0 ? ((m.atual || 0) / m.objetivo) * 100 : 0;
    return pct >= 80 && pct < 100;
  });

  // Reserva = saldo atual
  const saldoAtual = typeof saldo !== 'undefined' ? saldo : 0;
  const entradasMes = typeof totalEntradas !== 'undefined' ? totalEntradas : 0;
  const reservaMeses = entradasMes > 0 ? saldoAtual / entradasMes : 0;

  // Dívidas total
  const totalDividas = typeof dividasCadastradas !== 'undefined'
    ? dividasCadastradas.reduce((s, d) => s + d.valor, 0) : 0;

  // ---- Gerar insights ----
  const insights = [];

  // REGRA 1: Contas vencidas — URGENTE prio 1
  if (vencidas.length > 0) {
    const totalV = vencidas.reduce((s, c) => s + c.valor, 0);
    insights.push({
      id: 'contas_vencidas',
      tipo: 'urgente',
      prioridade: 1,
      icone: 'icone-urgente.png',
      titulo: `${vencidas.length} conta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}!`,
      descricao: `Total em atraso: ${fmt(totalV)}. Juros e multas aumentam a cada dia.`,
      acao: 'Resolver agora',
      rota: 'contas',
    });
  }

  // REGRA 2: Contas próximas do vencimento — ALERTA prio 2
  if (proximas.length > 0) {
    const totalP = proximas.reduce((s, c) => s + c.valor, 0);
    insights.push({
      id: 'contas_proximas',
      tipo: 'alerta',
      prioridade: 2,
      icone: 'icone-relatorio.png',
      titulo: `${proximas.length} conta${proximas.length > 1 ? 's' : ''} vence${proximas.length === 1 ? '' : 'm'} em 3 dias`,
      descricao: `${fmt(totalP)} com vencimento próximo. Pague antes para evitar juros.`,
      acao: 'Ver contas',
      rota: 'contas',
    });
  }

  // REGRA 3: Score caiu — ALERTA prio 3
  if (scoreAtual < scoreAnterior && scoreAnterior > 0) {
    const queda = scoreAnterior - scoreAtual;
    insights.push({
      id: 'score_caiu',
      tipo: 'alerta',
      prioridade: 3,
      icone: 'icone-score.png',
      titulo: 'Seu score financeiro caiu',
      descricao: `De ${scoreAnterior} para ${scoreAtual} pontos (-${queda}). Veja o que impactou.`,
      acao: 'Analisar score',
      rota: 'score',
    });
  }

  // REGRA 4: Gastos acima da média em alguma categoria
  Object.entries(gastosPorCat).forEach(([cat, valor]) => {
    const media = gastosPorCatAnt[cat] || 0;
    if (media > 0 && valor > media * 1.3) {
      const pctAcima = Math.round(((valor - media) / media) * 100);
      insights.push({
        id: `gasto_alto_${cat}`,
        tipo: 'alerta',
        prioridade: 4,
        icone: 'icone-investimento.png',
        titulo: `${cat} ${pctAcima}% acima do mês passado`,
        descricao: `Você gastou ${fmt(valor)} em ${cat} vs ${fmt(media)} no mês anterior.`,
        acao: 'Ver gastos',
        rota: 'gastos',
      });
    }
  });

  // REGRA 5: Meta quase concluída — OPORTUNIDADE
  metasQuaseConcluidas.forEach(m => {
    const pct = Math.round(((m.atual || 0) / m.objetivo) * 100);
    const falta = m.objetivo - (m.atual || 0);
    insights.push({
      id: `meta_quase_${m.id}`,
      tipo: 'oportunidade',
      prioridade: 5,
      icone: 'icone-trofeu.png',
      titulo: `Falta pouco para "${m.nome}"!`,
      descricao: `${pct}% concluída. Apenas ${fmt(falta)} para atingir sua meta.`,
      acao: 'Adicionar valor',
      rota: 'metas',
    });
  });

  // REGRA 6: Saldo positivo — OPORTUNIDADE
  if (saldoAtual > 0 && totalDividas === 0) {
    insights.push({
      id: 'saldo_disponivel',
      tipo: 'oportunidade',
      prioridade: 6,
      icone: 'icone-foguete.png',
      titulo: `${fmt(saldoAtual)} disponível para investir`,
      descricao: `Você tem saldo livre. Compare as melhores opções de investimento.`,
      acao: 'Simular investimento',
      rota: 'investimentos',
    });
  }

  // REGRA 7: Sem reserva ou reserva baixa — EDUCATIVO
  if (reservaMeses < 1 && entradasMes > 0) {
    insights.push({
      id: 'sem_reserva',
      tipo: 'educativo',
      prioridade: 7,
      icone: 'icone-dinheiro-01.png',
      titulo: 'Construa sua reserva de emergência',
      descricao: `O ideal é ter 3–6 meses de despesas guardados. Sua reserva atual é ${reservaMeses < 0.1 ? 'inexistente' : 'muito baixa'}.`,
      acao: 'Criar meta de reserva',
      rota: 'metas',
    });
  }

  // REGRA 8: Tem dívidas — ALERTA
  if (totalDividas > 0 && !insights.find(i => i.id === 'contas_vencidas')) {
    insights.push({
      id: 'tem_dividas',
      tipo: 'alerta',
      prioridade: 3,
      icone: 'icone-cadeado.png',
      titulo: `${fmt(totalDividas)} em dívidas ativas`,
      descricao: 'Priorize quitar as dívidas com maiores juros primeiro.',
      acao: 'Ver dívidas',
      rota: 'dividas',
    });
  }

  // Sem insights mínimo 1
  if (insights.length === 0 && entradasMes === 0) {
    insights.push({
      id: 'comece_registrando',
      tipo: 'educativo',
      prioridade: 10,
      icone: 'icone-investimento.png',
      titulo: 'Comece registrando suas entradas',
      descricao: 'Adicione sua renda e gastos para receber insights personalizados.',
      acao: 'Adicionar entrada',
      rota: 'gastos',
    });
  }

  // ---- Ordenar e limitar ----
  const prioTipo = { urgente: 0, alerta: 1, oportunidade: 2, educativo: 3 };
  insights.sort((a, b) => a.prioridade - b.prioridade || prioTipo[a.tipo] - prioTipo[b.tipo]);
  const top5 = insights.slice(0, 5);

  // ---- Renderizar no Dashboard ----
  renderizarInsights(top5);
  return top5;
}

function renderizarInsights(insights) {
  const panel = document.getElementById('insights-panel');
  const list = document.getElementById('insights-list');
  const count = document.getElementById('insights-count');
  if (!panel || !list) return;

  if (insights.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  if (count) count.textContent = `${insights.length} insight${insights.length > 1 ? 's' : ''}`;

  const cores = {
    urgente:     { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   label: '#EF4444', tag: '🚨 Urgente' },
    alerta:      { bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',  label: '#F59E0B', tag: '⚠️ Atenção' },
    oportunidade:{ bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',  label: '#22C55E', tag: '💡 Oportunidade' },
    educativo:   { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.25)', label: '#8B5CF6', tag: '📚 Saiba mais' },
  };

  list.innerHTML = insights.map(ins => {
    const c = cores[ins.tipo] || cores.educativo;
    return `
      <div class="insight-card" style="background:${c.bg};border:1px solid ${c.border}"
           onclick="(window.irPara||irPara)('${ins.rota}')">
        <img src="${ins.icone}" alt="" class="insight-icon" onerror="this.style.display='none'">
        <div class="insight-body">
          <div class="insight-tag" style="color:${c.label}">${c.tag}</div>
          <div class="insight-titulo">${ins.titulo}</div>
          <div class="insight-desc">${ins.descricao}</div>
        </div>
        <button class="insight-acao" style="border-color:${c.border};color:${c.label}"
                onclick="event.stopPropagation();(window.irPara||irPara)('${ins.rota}')">
          ${ins.acao} →
        </button>
      </div>
    `;
  }).join('');
}

// window.irPara já está definido logo após a função irPara (início do arquivo)
// com todos os hooks de navegação por tela. Não é necessário redefinir aqui.

// ==============================
// atualizarKPIs CONSOLIDADO FINAL
// Atualiza KPIs + mini card score + insights
// ==============================
// FIX: atualizarKPIs wrapper limpo — sem reatribuição direta
function _atualizarMiniCardScore() {
  try {
    const pts = { gastos: 0, dividas: 0, metas: 0, reserva: 0 };
    if (totalEntradas > 0) {
      const p = (totalSaidas / totalEntradas) * 100;
      pts.gastos = p <= 50 ? 300 : p <= 70 ? 230 : p <= 90 ? 130 : p <= 100 ? 50 : 0;
    } else { pts.gastos = 150; }
    const totalDiv = (typeof dividasCadastradas !== 'undefined')
      ? dividasCadastradas.reduce((s, d) => s + d.valor, 0) : 0;
    const _divAtivas = (typeof dividasCadastradas!=='undefined') ? dividasCadastradas.filter(d=>!d.quitada) : [];
    const _bonusQ = Math.min(((typeof dividasCadastradas!=='undefined')?dividasCadastradas.filter(d=>d.quitada).length:0)*10,50);
    pts.dividas = totalDiv === 0 ? Math.min(250+_bonusQ,300)
      : totalEntradas > 0 ? (totalDiv / totalEntradas <= 1 ? 180
        : totalDiv / totalEntradas <= 3 ? 120
        : totalDiv / totalEntradas <= 6 ? 60 : 0) : 0;
    pts.metas = (typeof metas !== 'undefined' && metas.length > 0)
      ? Math.round(Math.min(
          metas.reduce((s, m) => s + (m.atual || 0), 0) /
          Math.max(metas.reduce((s, m) => s + m.objetivo, 0), 1), 1) * 250)
      : 0;
    pts.reserva = saldo <= 0 ? 0
      : totalEntradas > 0
        ? (saldo / totalEntradas >= 6 ? 200
          : saldo / totalEntradas >= 3 ? 150
          : saldo / totalEntradas >= 1 ? 90 : 40)
        : 40;
    const total = pts.gastos + pts.dividas + pts.metas + pts.reserva;
    const iconStyle = 'width:32px;height:32px;object-fit:contain;vertical-align:middle;flex-shrink:0';
    const iconSrc = total >= 800 ? 'icone-score-excelente.png'
      : total >= 600 ? 'icone-score-bom.png'
      : total >= 400 ? 'icone-score-estavel.png'
      : total >= 200 ? 'icone-score-atencao.png'
      : 'icone-score-critico.png';
    const labelText = total >= 800 ? 'Excelente' : total >= 600 ? 'Bom' : total >= 400 ? 'Estável' : total >= 200 ? 'Atenção' : 'Crítico';
    const miniEl    = document.getElementById('kpi-score-mini');
    const miniBadge = document.getElementById('kpi-score-mini-badge');
    const miniLabel = document.getElementById('kpi-score-mini-label');
    if (miniEl)    miniEl.textContent = total;
    if (miniBadge) miniBadge.innerHTML = `<div class="kpi-icon" style="background:rgba(255,255,255,0.06);margin-bottom:0"><img src="${iconSrc}" style="${iconStyle}"></div>`;
    if (miniLabel) miniLabel.innerHTML = `<span style="font-weight:700;color:var(--white)">${labelText}</span> · Ver detalhes →`;
  } catch(e) {}
}

const _kpisBase = atualizarKPIs;
const _atualizarKPIsWrap = function(...args) {
  try { _kpisBase(...args); } catch(e) { console.error('[Monvay] atualizarKPIs base:', e); }
  setTimeout(_atualizarMiniCardScore, 300);
  setTimeout(() => { try { executarManualEngine(); } catch(e) {} }, 400);
};
window.atualizarKPIs = _atualizarKPIsWrap;

// ==============================
// EXPOR TODAS AS FUNÇÕES GLOBALMENTE
// (necessário porque script.js usa type="module")
// ==============================
// window.irPara already set above — no reassignment needed
window.abrirModal               = abrirModal;
window.fecharModal              = fecharModal;
window.confirmarModal           = confirmarModal;
window.responderPergunta        = responderPergunta;
window.abrirModalEditar         = abrirModalEditar;
window.fecharModalEditar        = fecharModalEditar;
window.salvarEdicao             = salvarEdicao;
window.excluirMovimentacao      = excluirMovimentacao;
window.setFiltro                = setFiltro;
window.setTipoGrafico           = setTipoGrafico;
window.criarMeta                = criarMeta;
window.abrirModalMeta           = abrirModalMeta;
window.excluirMeta              = excluirMeta;
window.abrirModalMetaPorId      = abrirModalMetaPorId;
window.fecharModalMeta          = fecharModalMeta;
window.adicionarValorMeta       = adicionarValorMeta;
window.calcularDivida           = calcularDivida;
window.calcularInvestimentos    = calcularInvestimentos;
window.abrirModalSimulacao      = abrirModalSimulacao;
window.fecharModalSimulacao     = fecharModalSimulacao;
window.abrirArtigo              = abrirArtigo;
window.fecharArtigo             = fecharArtigo;
window.logout                   = logout;
window.toggleTheme              = toggleTheme;
window.applyTheme               = applyTheme;
window.mudarMesRelatorio        = mudarMesRelatorio;
window.setPeriodoModo           = setPeriodoModo;
window.aplicarPeriodoCustom     = aplicarPeriodoCustom;
window.atalhoUltimos            = atalhoUltimos;
window.processarRecorrentes     = processarRecorrentes;
window.buscarMovimentacoes      = buscarMovimentacoes;
window.limparBusca              = limparBusca;
window.abrirBuscaMobile         = abrirBuscaMobile;
window.fecharBuscaMobile        = fecharBuscaMobile;
window.fecharDropdownBusca      = fecharDropdownBusca;
window.mostrarDropdownBusca     = mostrarDropdownBusca;
window.atualizarFormDivida      = atualizarFormDivida;
window.cadastrarDivida          = cadastrarDivida;
window.excluirDivida            = excluirDivida;
window.abrirTabPerfil           = abrirTabPerfil;
window.selecionarVida           = selecionarVida;
window.selecionarVidaMulti      = selecionarVidaMulti;
window.setMetaEco               = setMetaEco;
// window.salvarPerfilVida already set to wrapped version above (line 1853) — keep it
// window.salvarPerfilVida = salvarPerfilVida; // REMOVED: would overwrite the wrapper
window.salvarPerfilFinancas     = salvarPerfilFinancas;
window.salvarConta              = salvarConta;
window.editarConta              = editarConta;
window.cancelarEdicaoConta      = cancelarEdicaoConta;
window.pagarConta               = pagarConta;
window.excluirConta             = excluirConta;
window.filtrarContas            = filtrarContas;
window.mudarMesContas           = mudarMesContas;
window.renderizarContas         = renderizarContas;
window.carregarHistorico        = carregarHistorico;
// Módulos internos úteis
window.executarManualEngine     = executarManualEngine;
window.renderizarInsights       = renderizarInsights;
window.calcularScore            = calcularScore;
window.buscarTaxasBCB           = buscarTaxasBCB;
window.atualizarTelaCategorias  = atualizarTelaCategorias;
window.renderizarGridCategorias = renderizarGridCategorias;
window.sincronizarSelects       = sincronizarSelects;
window.atualizarBannerPerfil    = atualizarBannerPerfil;
window.renderizarSugestaoOrcamento = renderizarSugestaoOrcamento;
window.obterCategoriasAtivas    = obterCategoriasAtivas;
window.obterPerfilVida          = obterPerfilVida;
window.renderizarDividas        = renderizarDividas;
window.atualizarKPIsDividas     = atualizarKPIsDividas;
window.carregarDividasOnboarding = carregarDividasOnboarding;
window.mostrarToastResetMes     = mostrarToastResetMes;
window.recalcular               = recalcular;
window.recalcularTotais         = recalcularTotais;
window.atualizarListaInicio     = atualizarListaInicio;
window.atualizarChart           = atualizarChart;
window.setFluxoModo             = setFluxoModo;
window.atualizarChartPizza      = atualizarChartPizza;
window.atualizarRelatorio       = atualizarRelatorio;
window.fmt                      = fmt;
window.fmtData                  = fmtData;
window.hojeISO                  = hojeISO;
