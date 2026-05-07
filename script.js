
// ── Mapa de ícones por categoria ──────────────────────────────────
const ICONE_CAT={
  // Alimentação
  'Alimentação':'icone-alimentacao.png',
  // Lazer / esporte
  'Lazer':'icone-lazer.png',
  'Academia':'icone-academia.png',
  'Luta / Artes Marciais':'icone-luta.png',
  'Futebol':'icone-futebol.png',
  'Bike':'icone-bicicleta.png',
  // Saúde
  'Saúde':'icone-saude.png',
  // Moradia
  'Moradia':'icone-casa-propria.png',
  'Casa':'icone-casa-propria.png',
  'Aluguel':'icone-casa-aluguel.png',
  'Financiamento':'icone-financiamento.png',
  // Transporte
  'Transporte':'icone-onibus.png',
  'Carro':'icone-carro.png',
  'Moto':'icone-moto.png',
  // Família
  'Bebê / Criança':'icone-bebe.png',
  'Dependentes':'icone-dependentes.png',
  'Pets':'icone-pets.png',
  'Família':'icone-familia.png',
  // Educação
  'Educação':'icone-cerebro.png',
  // Streamings — usa ícone genérico de streaming nas categorias de gasto
  'Netflix':'icone-streaming.png',
  'Spotify':'icone-streaming.png',
  'YouTube Premium':'icone-streaming.png',
  'Max (HBO)':'icone-streaming.png',
  'Prime Video':'icone-streaming.png',
  'Disney+':'icone-streaming.png',
  'ChatGPT Plus':'icone-ferramenta-cognitiva.png',
  'Notion':'icone-ferramenta-cognitiva.png',
  'Canva':'icone-ferramenta-cognitiva.png',
  'CapCut':'icone-ferramenta-cognitiva.png',
  'Assinatura':'icone-streaming.png',
  'Streaming':'icone-streaming.png',
  // Tech
  'Celular':'icone-celular.png',
  'Internet':'icone-internet.png',
  // Finanças
  'Investimento':'icone-investimento.png',
  'Cartão':'icone-cartao-01.png',
  'Dívida':'icone-cadeado.png',
  'Empréstimo':'icone-emprestimo.png',
  // Outros
  'Roupas':'icone-app.png',
  'Beleza':'icone-usuario.png',
  'Outros':'icone-outros.png',
};
function getIconeCat(cat){
  if(!cat) return null;
  // busca exata
  if(ICONE_CAT[cat]) return ICONE_CAT[cat];
  // busca parcial case-insensitive
  const lower=cat.toLowerCase();
  for(const [k,v] of Object.entries(ICONE_CAT)){
    if(lower.includes(k.toLowerCase())) return v;
  }
  return null;
}
function iconeHtml(cat, tipo, size=28){
  const png=getIconeCat(cat);
  if(png) return `<img src="${png}" alt="${cat}" style="width:${size}px;height:${size}px;object-fit:contain;flex-shrink:0">`;
  // fallback: círculo colorido com seta
  const isGanho=tipo==='ganho';
  const bg=isGanho?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)';
  const color=isGanho?'#22c55e':'#ef4444';
  const arrow=isGanho?'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>':'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>';
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" style="width:${Math.round(size*0.5)}px;height:${Math.round(size*0.5)}px">${arrow}</svg></div>`;
}

// ==============================
// MONVAY — LÓGICA PRINCIPAL
// v4.0 | ES Module + Firebase
// ==============================

import {
  onAuth, fazerLogout, waitAuthReady,
  getPerfil, salvarPerfil as fbSalvarPerfil, salvarPerfilVida as fbSalvarPerfilVida,
  getMovimentacoes, adicionarMovimentacao, atualizarMovimentacao, deletarMovimentacao, ouvirMovimentacoes,
  getMetas, adicionarMeta, atualizarMeta, deletarMeta,
  getDividas, adicionarDivida, deletarDivida,
  getContas, adicionarConta, atualizarConta, deletarConta,
  verificarEResetarMes, getHistorico
} from './firebase.js';

// ── Estado global ──────────────────────────────────────────────
let uidAtual = null;
let movimentacoes = [];
let metas = [];
let dividas = [];
let contas = [];
let tipoAtual = '';
let respostaPergunta = '';
let metaEditandoId = null;
let contaEditandoId = null;
let movEditandoId = null;
let filtroAtual = 'mes';
let filtroContasAtual = 'todas';
let mesRelatorio = new Date();
let mesContas = new Date();
let periodoModo = 'mes';
let periodoCustomInicio = null;
let periodoCustomFim = null;
let perfilUsuario = {};
let chartFluxo = null;
let chartPizza = null;
let tipoGraficoPizza = 'doughnut';

window.setTipoGrafico = function(tipo) {
  tipoGraficoPizza = tipo;
  const btnPizza = document.getElementById('btn-tipo-pizza');
  const btnColuna = document.getElementById('btn-tipo-coluna');
  if(btnPizza && btnColuna) {
    if(tipo === 'doughnut') {
      btnPizza.style.background='var(--primary)'; btnPizza.style.color='#000';
      btnColuna.style.background='transparent'; btnColuna.style.color='var(--gray)';
    } else {
      btnColuna.style.background='var(--primary)'; btnColuna.style.color='#000';
      btnPizza.style.background='transparent'; btnPizza.style.color='var(--gray)';
    }
  }
  // Re-renderizar com dados atuais
  const filtradas = filtrarPorPeriodo(movimentacoes).filter(m=>m.tipo==='gasto');
  const porCat={};
  filtradas.forEach(m=>{ const c=m.categoria||'Outros'; porCat[c]=(porCat[c]||0)+m.valor; });
  atualizarGraficoPizza(porCat);
};
let chartRelatorio = null;
let taxasLive = {};
let fluxoModo = 'recentes';
let unsubMovs = null;
let tipoPizza = 'doughnut';
let bolsaDados = [];
let bolsaFiltroAtual = 'todos';
let bolsaMostrados = 10;

window.irPara = irPara;
window.setFluxoModo = setFluxoModo;

// ── Helpers ─────────────────────────────────────────────────────
function fmt(valor) {
  return 'R$ ' + Math.abs(Number(valor)||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function fmtSaldo(valor) {
  const v = Number(valor)||0;
  return (v<0?'-':'')+'R$ '+Math.abs(v).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function dataHoje() { return new Date().toISOString().split('T')[0]; }
function fmtData(str) {
  if(!str) return '—';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}

// ── Tema ────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const moon = document.getElementById('theme-icon-moon');
  const sun  = document.getElementById('theme-icon-sun');
  if (theme==='light') { if(moon)moon.style.display='none'; if(sun)sun.style.display='block'; }
  else { if(moon)moon.style.display='block'; if(sun)sun.style.display='none'; }
}
window.toggleTheme = function() {
  const cur = document.documentElement.getAttribute('data-theme')||'dark';
  const nxt = cur==='dark'?'light':'dark';
  localStorage.setItem('monvy_theme', nxt);
  applyTheme(nxt);
  if(window._syncDrawerThemeIcon) window._syncDrawerThemeIcon();
};
applyTheme(localStorage.getItem('monvy_theme')||'dark');

// ── CSS dinâmico ─────────────────────────────────────────────────
(function(){
  const s = document.createElement('style');
  s.textContent = `
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700}
    .badge-green{background:rgba(34,197,94,.15);color:#22c55e}
    .badge-red{background:rgba(239,68,68,.15);color:#ef4444}
    .badge-yellow{background:rgba(245,158,11,.15);color:#f59e0b}
    .badge-gray{background:rgba(100,116,139,.15);color:#94a3b8}
    .btn-sm-green{padding:6px 12px;border-radius:8px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.1);color:#22c55e;cursor:pointer;font-size:.78rem;font-weight:700;font-family:inherit}
    .btn-sm-red{padding:6px 12px;border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:#ef4444;cursor:pointer;font-size:.78rem;font-weight:700;font-family:inherit}
    .btn-sm-gray{padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--gray);cursor:pointer;font-size:.78rem;font-weight:600;font-family:inherit}
    .btn-icon{background:none;border:none;cursor:pointer;color:var(--gray);padding:4px;display:flex;align-items:center}
    .btn-icon:hover{color:var(--primary)}
    .green{color:#22c55e}.red{color:#ef4444}.gray{color:var(--gray)}
    .categoria-card{background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:14px}.categoria-card .cat-info{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cat-picker-item{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border-radius:12px;border:1.5px solid var(--border);background:rgba(255,255,255,0.03);cursor:pointer;transition:all .15s;text-align:center;user-select:none}.cat-picker-item:hover{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.04)}.cat-picker-item.selected{border-color:var(--primary);background:rgba(34,197,94,0.12)}.cat-picker-item img{width:26px;height:26px;object-fit:contain}.cat-picker-item .cat-pk-nome{font-size:.68rem;font-weight:600;color:var(--gray-2);line-height:1.2;word-break:break-word}.cat-picker-item.selected .cat-pk-nome{color:var(--primary)}
    .cat-info{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .cat-nome{font-weight:600;font-size:.88rem}.cat-val{font-weight:700;font-size:.9rem}
    .cat-bar-wrap{background:rgba(255,255,255,.06);border-radius:4px;height:6px;margin-bottom:4px;overflow:hidden}
    .cat-bar{height:100%;background:var(--primary);border-radius:4px;transition:width .5s}
    .cat-pct{font-size:.72rem;color:var(--gray)}
    .pizza-leg-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.78rem}
    .pizza-leg-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .pizza-leg-val{margin-left:auto;font-weight:700}
    .insights-list{display:flex;flex-direction:column;gap:10px}.insight-card{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:14px;cursor:pointer;transition:transform .15s,opacity .15s;flex-wrap:wrap}.insight-card:hover{transform:translateY(-1px);opacity:.92}.insight-icon{width:42px;height:42px;object-fit:contain;flex-shrink:0}.insight-body{flex:1;min-width:180px}.insight-tag{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}.insight-titulo{font-size:.88rem;font-weight:700;color:var(--white);margin-bottom:3px;line-height:1.3}.insight-desc{font-size:.78rem;color:var(--gray-2);line-height:1.45}.insight-acao{flex-shrink:0;padding:7px 14px;border-radius:8px;border:1.5px solid;background:transparent;font-size:.78rem;font-weight:600;cursor:pointer;font-family:var(--font-title);white-space:nowrap}@keyframes fadeInDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeOutUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-10px)}}
    .meta-card{background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px}
    .meta-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .meta-nome{font-weight:700}.meta-pct{font-size:.85rem;color:var(--primary);font-weight:700}
    .meta-bar-wrap{background:rgba(255,255,255,.06);border-radius:4px;height:8px;margin-bottom:8px;overflow:hidden}
    .meta-bar{height:100%;background:var(--primary);border-radius:4px;transition:width .5s}
    .meta-valores{display:flex;justify-content:space-between;font-size:.78rem}
    .vida-opt.selected{border-color:var(--primary)!important;background:rgba(0,200,83,.15)!important}
    .contas-filtro-btn{padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--gray);font-size:.78rem;font-weight:600;cursor:pointer;font-family:inherit}
    .contas-filtro-btn.active{background:var(--primary);color:#000;border-color:var(--primary)}
    .mov-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer}
    .mov-item:hover{opacity:.8}
    .mov-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .mov-icon.green{background:rgba(34,197,94,.15);color:#22c55e}
    .mov-icon.red{background:rgba(239,68,68,.15);color:#ef4444}
    .mov-info{flex:1;min-width:0}
    .mov-desc{font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mov-cat{font-size:.72rem;color:var(--gray)}
    .mov-valor{font-weight:700;font-size:.9rem;flex-shrink:0}
  `;
  document.head.appendChild(s);
})();

// ── Navegação ───────────────────────────────────────────────────
const pageTitles = {
  inicio:'Dashboard',gastos:'Gastos',metas:'Metas',dividas:'Dívidas',
  investimentos:'Investimentos',aprender:'Aprender',relatorio:'Relatório Mensal',
  contas:'Contas a Pagar',score:'Score Financeiro'
};
let _telaAnterior = null;
// Inicializar rascunho do perfil — usa localStorage como v1
function _inicializarRascunho() {
  if (!window._perfilVidaTemp) {
    const cached = localStorage.getItem('monvy_perfil_vida');
    window._perfilVidaTemp = cached ? JSON.parse(cached) : JSON.parse(JSON.stringify(perfilUsuario?.perfilVida || {}));
  }
}

function irPara(tela) {
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.tela').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll(`[data-tela="${tela}"]`).forEach(n=>n.classList.add('active'));
  const telaEl=document.getElementById('tela-'+tela);
  if(telaEl) telaEl.classList.add('active');
  const t=pageTitles[tela]||'Monvay';
  const pt=document.getElementById('page-title'); if(pt) pt.textContent=t;
  const mt=document.getElementById('topbar-mobile-tela'); if(mt) mt.textContent=t;
  if(tela==='gastos'){atualizarTelaCategorias();renderizarTabela();}
  if(tela==='score') calcularScore();
  if(tela==='relatorio') renderizarRelatorio();
  if(tela==='contas'){renderizarContas();popularSelectContas();}
  if(tela==='metas') renderizarMetas();
  if(tela==='dividas') renderizarDividas();
  // Mostrar insights ao VOLTAR para inicio (não na primeira vez)
  if(tela==='inicio' && _telaAnterior && _telaAnterior!=='inicio'){
    gerarInsights();
  } else if(tela==='inicio'){
    // Esconder na primeira vez
    const panel=document.getElementById('insights-panel');
    if(panel) panel.style.display='none';
  }
  _telaAnterior = tela;
  // bolsa integrada diretamente no HTML
}
document.querySelectorAll('.nav-item[data-tela]').forEach(item=>{
  item._monvayNavBound=true;
  item.addEventListener('click',function(e){e.preventDefault();irPara(this.dataset.tela);});
});

// ── Auth ─────────────────────────────────────────────────────────
window.logout = async function() {
  if(unsubMovs) unsubMovs();
  localStorage.removeItem('monvy_logado');
  localStorage.removeItem('monvy_logged');
  await fazerLogout();
  window.location.href='landing.html';
};
waitAuthReady().then(()=>{
  onAuth(async user=>{
    // Esconder overlay de loading
    const appOverlay=document.getElementById('app-loading-overlay');
    if(appOverlay) appOverlay.style.display='none';
    if(!user){
      localStorage.removeItem('monvy_onboarding_done');
      localStorage.removeItem('monvy_modo_empresa');
      window.location.href='landing.html';
      return;
    }
    localStorage.setItem('monvy_onboarding_done','1');
    uidAtual=user.uid;
    window._firebaseExports={auth:{currentUser:user}};
    const nome=user.displayName||'Usuário';
    const foto=user.photoURL||localStorage.getItem('monvy_avatar_foto');
    atualizarUIUsuario(nome,foto);
    localStorage.setItem('monvy_logado',JSON.stringify({nome,uid:user.uid}));
    try{perfilUsuario=await getPerfil(user.uid)||{};}catch(e){perfilUsuario={};}
    // Carregar perfilVida do localStorage como fallback imediato
    if(!perfilUsuario.perfilVida){
      const cached=localStorage.getItem('monvy_perfil_vida');
      if(cached) try{perfilUsuario.perfilVida=JSON.parse(cached);}catch(e){}
    } else {
      // Sincronizar localStorage com o que veio do Firebase
      localStorage.setItem('monvy_perfil_vida', JSON.stringify(perfilUsuario.perfilVida));
    }
    try{await verificarEResetarMes(user.uid);}catch(e){}
    // app pronto
    await carregarTodosDados();
    if(unsubMovs) unsubMovs();
    unsubMovs=ouvirMovimentacoes(user.uid,movs=>{
      movimentacoes=movs;
      atualizarKPIs();atualizarChart();renderizarListaInicio();renderizarTabela();calcularScore();mostrarBannerEmpresa();
    });
  });
});

async function carregarTodosDados(){
  try{
    const [movs,mts,divs,cnts]=await Promise.all([
      getMovimentacoes(uidAtual),getMetas(uidAtual),getDividas(uidAtual),getContas(uidAtual)
    ]);
    movimentacoes=movs;metas=mts;dividas=divs;contas=cnts;
    atualizarKPIs();atualizarChart();renderizarListaInicio();
    renderizarTabela();renderizarMetas();renderizarDividas();renderizarContas();popularSelectContas();
    renderizarRelatorio();calcularScore();gerarInsights();atualizarBanner();
    carregarTaxasBCB();
  }catch(e){console.error('Erro ao carregar dados:',e);}
}

function atualizarUIUsuario(nome,foto){
  const inicial=nome?nome[0].toUpperCase():'U';
  const mn=document.getElementById('topbar-mobile-name'); if(mn) mn.textContent='Olá, '+nome.split(' ')[0];
  const dn=document.getElementById('drawer-user-name'); if(dn) dn.textContent=nome;
  const da=document.getElementById('drawer-avatar');
  if(da){if(foto)da.innerHTML=`<img src="${foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;else{da.textContent=inicial;da.style.background='var(--primary)';}}
  const sa=document.getElementById('user-avatar');
  if(sa){if(foto)sa.innerHTML=`<img src="${foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;else sa.textContent=inicial;}
  const ma=document.getElementById('topbar-avatar-mobile');
  if(ma){if(foto)ma.src=foto;else{const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="%2300c853"/><text x="18" y="24" text-anchor="middle" font-size="16" font-weight="800" font-family="Arial,sans-serif" fill="%23000000">${inicial}</text></svg>`;ma.src='data:image/svg+xml,'+svg;}}
  const gr=document.getElementById('topbar-greeting');
  if(gr){const h=new Date().getHours();const s=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';gr.textContent=`${s}, ${nome.split(' ')[0]}!`;}
}

// ── KPIs ─────────────────────────────────────────────────────────
function atualizarKPIs(){
  const ent=movimentacoes.filter(m=>m.tipo==='ganho').reduce((s,m)=>s+(m.valor||0),0);
  const sai=movimentacoes.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+(m.valor||0),0);
  const sal=ent-sai;
  const sd=document.getElementById('saldo-display'); if(sd){sd.textContent=fmtSaldo(sal);sd.style.color=sal<0?'#ef4444':'';}
  const sm=document.getElementById('saldo-mes'); if(sm) sm.textContent=`Este mês: +${fmt(ent)} entrou`;
  const ke=document.getElementById('kpi-entradas'); if(ke) ke.textContent=fmt(ent);
  const ks=document.getElementById('kpi-saidas'); if(ks) ks.textContent=fmt(sai);
  const km=document.getElementById('kpi-movs'); if(km) km.textContent=movimentacoes.length;
}

// ── Chart fluxo ──────────────────────────────────────────────────
function setFluxoModo(modo){
  fluxoModo=modo;
  const br=document.getElementById('btn-fluxo-recentes');
  const bt=document.getElementById('btn-fluxo-todas');
  if(br){br.style.background=modo==='recentes'?'#22c55e':'transparent';br.style.color=modo==='recentes'?'#000':'#64748b';}
  if(bt){bt.style.background=modo==='todas'?'#22c55e':'transparent';bt.style.color=modo==='todas'?'#000':'#64748b';}
  atualizarChart();
}
function atualizarChart(){
  const canvas=document.getElementById('chart-fluxo');
  const emptyEl=document.getElementById('chart-empty');
  if(!canvas) return;
  if(movimentacoes.length===0){canvas.style.display='none';if(emptyEl)emptyEl.style.display='flex';return;}
  canvas.style.display='block';if(emptyEl)emptyEl.style.display='none';
  // Garante que o canvas tem dimensões antes de renderizar
  if(!canvas.offsetWidth){setTimeout(atualizarChart,100);return;}
  // Define tamanho explícito do canvas para o Chart.js não extrapolar
  const w=canvas.parentElement?.offsetWidth||canvas.offsetWidth||600;
  canvas.width=w;
  canvas.height=180;
  const lista=fluxoModo==='recentes'?movimentacoes.slice(0,10):movimentacoes;
  const listaRev=[...lista].reverse();
  const labels=listaRev.map((m,i)=>m.data?fmtData(m.data).slice(0,5):`#${i+1}`);
  const datas=listaRev.map(m=>m.data?fmtData(m.data):'');
  const nomes=listaRev.map(m=>m.descricao||m.categoria||'Movimentação');
  const tipos=listaRev.map(m=>m.tipo);
  const entradas=listaRev.map(m=>m.tipo==='ganho'?m.valor:0);
  const saidas=listaRev.map(m=>m.tipo==='gasto'?m.valor:0);
  if(chartFluxo){chartFluxo.destroy();chartFluxo=null;}
  const ctx=canvas.getContext('2d');
  const gG=ctx.createLinearGradient(0,0,0,180);gG.addColorStop(0,'rgba(34,197,94,0.3)');gG.addColorStop(1,'rgba(34,197,94,0)');
  const gR=ctx.createLinearGradient(0,0,0,180);gR.addColorStop(0,'rgba(239,68,68,0.25)');gR.addColorStop(1,'rgba(239,68,68,0)');
  chartFluxo=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Entradas',data:entradas,borderColor:'#22C55E',backgroundColor:gG,borderWidth:2,tension:0.4,fill:true,pointRadius:4,pointHoverRadius:7,pointBackgroundColor:'#22C55E',pointHoverBackgroundColor:'#22C55E'},
    {label:'Saídas',data:saidas,borderColor:'#EF4444',backgroundColor:gR,borderWidth:2,tension:0.4,fill:true,pointRadius:4,pointHoverRadius:7,pointBackgroundColor:'#EF4444',pointHoverBackgroundColor:'#EF4444'}
  ]},options:{
    responsive:false,
    maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:false},
      tooltip:{
        enabled:true,
        backgroundColor:'rgba(15,23,42,0.95)',
        borderColor:'rgba(255,255,255,0.1)',
        borderWidth:1,
        titleColor:'#94a3b8',
        bodyColor:'#f1f5f9',
        titleFont:{size:11},
        bodyFont:{size:13,weight:'bold'},
        padding:10,
        cornerRadius:10,
        callbacks:{
          title:function(items){
            const i=items[0].dataIndex;
            return datas[i]||labels[i]||'';
          },
          label:function(item){
            if(item.raw===0) return null;
            const i=item.dataIndex;
            const desc=nomes[i]||'';
            const isEnt=tipos[i]==='ganho';
            const val=item.raw.toLocaleString('pt-BR',{minimumFractionDigits:2});
            return ` ${desc} : ${isEnt?'+':'-'}R$ ${val}`;
          },
          labelColor:function(item){
            return {
              borderColor:'transparent',
              backgroundColor:item.datasetIndex===0?'#22c55e':'#ef4444',
              borderRadius:4
            };
          }
        }
      }
    },
    scales:{
      x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#64748b',font:{size:11}}},
      y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#64748b',font:{size:11},callback:v=>'R$'+v.toLocaleString('pt-BR')}}
    }
  }});
}

// ── Lista início ──────────────────────────────────────────────────
function renderizarListaInicio(){
  const el=document.getElementById('lista-inicio'); if(!el) return;
  const recentes=[...movimentacoes].slice(0,8);
  if(recentes.length===0){el.innerHTML='<div class="vazio">Nenhuma movimentação ainda.</div>';return;}
  el.innerHTML=recentes.map(m=>`
    <div class="mov-item" onclick="abrirModalEditar('${m.id}')">
      <div class="mov-left">
        <div class="mov-dot ${m.tipo==='ganho'?'g':'r'}"></div>
        <div class="mov-info">
          <span class="mov-desc">${m.descricao||(m.tipo==='ganho'?'Entrada':'Saída')}</span>
          <span class="mov-cat">${m.data?fmtData(m.data)+' · ':''}${m.tipo==='ganho'?'Entrada':m.categoria||'—'}</span>
        </div>
      </div>
      <span class="mov-valor ${m.tipo==='ganho'?'positivo':'negativo'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</span>
    </div>`).join('');
}

// ── Modal registrar ───────────────────────────────────────────────
window.abrirModal=function(tipo){
  tipoAtual=tipo;respostaPergunta='';
  const titulo=document.getElementById('modal-titulo');
  if(titulo) titulo.textContent=tipo==='ganho'?'+ Nova entrada':'- Novo gasto';
  const perg=document.getElementById('modal-pergunta'); if(perg) perg.classList.add('hidden');
  const mv=document.getElementById('modal-valor'); if(mv) mv.value='';
  document.getElementById('modal-descricao').value='';
  const md=document.getElementById('modal-data'); if(md) md.value=dataHoje();
  document.getElementById('modal-recorrente').checked=false;
  atualizarCategoriasModal(tipo);
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(()=>{if(mv)mv.focus();},100);
};
window.fecharModal=function(){document.getElementById('modal').classList.add('hidden');};
function atualizarCategoriasModal(tipo){
  const hidden=document.getElementById('modal-categoria'); if(!hidden) return;
  const cats=tipo==='ganho'?['Salário','Freelance','Investimento','Presente','Outros']:getCategoriasPorPerfil();
  const picker=document.getElementById('modal-categoria-picker');
  if(picker){
    const current=hidden.value||cats[0];
    picker.innerHTML=cats.map(c=>{
      const png=getIconeCat(c);
      const ico=png?`<img src="${png}" alt="${c}">`:`<div style="width:26px;height:26px;border-radius:50%;background:rgba(100,116,139,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem">💰</div>`;
      return `<div class="cat-picker-item${c===current?' selected':''}" onclick="selecionarCategoriaPicker(this,'modal-categoria','modal-categoria-picker')" data-val="${c}">${ico}<span class="cat-pk-nome">${c}</span></div>`;
    }).join('');
    if(!cats.includes(hidden.value)) hidden.value=cats[0];
  } else {
    // fallback select
    hidden.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
}
// Mapa de chaves fixas → nome de exibição
const ROTINA_NOMES={
  academia:'Academia',luta:'Luta / Artes Marciais',futebol:'Futebol',
  netflix:'Netflix',spotify:'Spotify',youtube:'YouTube Premium',
  hbo:'Max (HBO)',prime:'Prime Video',disney:'Disney+',
  chatgpt:'ChatGPT Plus',notion:'Notion',canva:'Canva',capcut:'CapCut',
  internet:'Internet',celular:'Celular',
};
function getCategoriasPorPerfil(){
  const vida=perfilUsuario?.perfilVida||{};
  const rotina=vida.rotina||[];
  const transporte=vida.transporte||[];
  const familia=vida.familia||[];
  const moradia=vida.moradia||null;
  const filhos=vida.filhos||null;

  // Apenas categorias essenciais sempre presentes
  const base=['Alimentação','Saúde','Lazer','Outros'];
  const extra=[];

  // ── Moradia — só adiciona se perfil tem moradia configurada ──
  if(moradia==='aluguel') extra.push('Aluguel');
  else if(moradia==='financiada') extra.push('Financiamento');
  else if(moradia==='propria') extra.push('Moradia');
  // sem moradia selecionada = não adiciona

  // ── Transporte — só do perfil ─────────────────
  if(transporte.includes('carro')) extra.push('Carro');
  if(transporte.includes('moto')) extra.push('Moto');
  if(transporte.includes('publico')||transporte.includes('app')) extra.push('Transporte');
  if(transporte.includes('bike')) extra.push('Bike');

  // ── Filhos / família — só do perfil ──────────
  if(filhos==='sim') extra.push('Bebê / Criança');
  if(familia.includes('dependentes')) extra.push('Dependentes');
  if(familia.includes('pets')) extra.push('Pets');

  // ── Atividade física — só do perfil ──────────
  ['academia','luta','futebol'].forEach(r=>{
    if(rotina.includes(r)) extra.push(ROTINA_NOMES[r]);
  });

  // ── Streamings e ferramentas — só do perfil ──
  ['netflix','spotify','youtube','hbo','prime','disney','chatgpt','notion','canva','capcut'].forEach(r=>{
    if(rotina.includes(r)) extra.push(ROTINA_NOMES[r]);
  });

  // ── Internet / Celular — só do perfil ────────
  if(rotina.includes('internet')) extra.push('Internet');
  if(rotina.includes('celular'))  extra.push('Celular');

  // ── Itens customizados ────────────────────────
  rotina.filter(r=>!ROTINA_NOMES[r]&&typeof r==='string'&&r.trim()).forEach(r=>{
    const nome=r.trim();
    if(!extra.includes(nome)) extra.push(nome);
  });

  // Remover duplicatas e retornar
  const todas=[...base,...extra];
  return todas.filter((v,i,a)=>a.indexOf(v)===i);
}
window.selecionarCategoriaPicker=function(el,hiddenId,pickerId){
  const hidden=document.getElementById(hiddenId);
  const picker=document.getElementById(pickerId);
  if(hidden) hidden.value=el.dataset.val;
  if(picker) picker.querySelectorAll('.cat-picker-item').forEach(i=>i.classList.toggle('selected',i===el));
};
window.responderPergunta=function(resp){
  respostaPergunta=resp;
  document.getElementById('modal-pergunta').classList.add('hidden');
  salvarMovimentacao();
};
window.confirmarModal=async function(){
  const valor=parseFloat(document.getElementById('modal-valor').value);
  if(!valor||valor<=0){alert('Informe um valor válido.');return;}
  if(tipoAtual==='gasto'){
    const perg=document.getElementById('modal-pergunta');
    if(perg&&perg.classList.contains('hidden')&&!respostaPergunta){perg.classList.remove('hidden');return;}
  }
  await salvarMovimentacao();
};
async function salvarMovimentacao(){
  const valor=parseFloat(document.getElementById('modal-valor').value);
  const descricao=document.getElementById('modal-descricao').value.trim()||'Sem descrição';
  const data=document.getElementById('modal-data').value||dataHoje();
  const categoria=document.getElementById('modal-categoria').value;
  const recorrente=document.getElementById('modal-recorrente').checked;
  try{
    await adicionarMovimentacao(uidAtual,{valor,descricao,tipo:tipoAtual,data,categoria,recorrente,classificacao:respostaPergunta||null});
    fecharModal();respostaPergunta='';
  }catch(e){alert('Erro ao salvar. Tente novamente.');console.error(e);}
}

// ── Modal editar ──────────────────────────────────────────────────
window.abrirModalEditar=function(id){
  const m=movimentacoes.find(x=>x.id===id); if(!m) return;
  movEditandoId=id;
  document.getElementById('edit-valor').value=m.valor;
  document.getElementById('edit-descricao').value=m.descricao||'';
  const ed=document.getElementById('edit-data'); if(ed) ed.value=m.data||dataHoje();
  const sel=document.getElementById('edit-categoria');
  const cats=m.tipo==='ganho'?['Salário','Freelance','Investimento','Presente','Outros']:getCategoriasPorPerfil();
  const picker=document.getElementById('edit-categoria-picker');
  if(sel) sel.value=m.categoria||cats[0];
  if(picker){
    picker.innerHTML=cats.map(c=>{
      const png=getIconeCat(c);
      const ico=png?`<img src="${png}" alt="${c}">`:`<div style="width:26px;height:26px;border-radius:50%;background:rgba(100,116,139,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem">💰</div>`;
      return `<div class="cat-picker-item${c===(m.categoria||cats[0])?' selected':''}" onclick="selecionarCategoriaPicker(this,'edit-categoria','edit-categoria-picker')" data-val="${c}">${ico}<span class="cat-pk-nome">${c}</span></div>`;
    }).join('');
  }
  document.getElementById('modal-editar').classList.remove('hidden');
};
window.fecharModalEditar=function(){document.getElementById('modal-editar').classList.add('hidden');movEditandoId=null;};
window.salvarEdicao=async function(){
  if(!movEditandoId) return;
  const valor=parseFloat(document.getElementById('edit-valor').value);
  if(!valor||valor<=0){alert('Informe um valor válido.');return;}
  const descricao=document.getElementById('edit-descricao').value.trim();
  const ed=document.getElementById('edit-data');
  const data=ed?ed.value:dataHoje();
  const categoria=document.getElementById('edit-categoria').value;
  try{await atualizarMovimentacao(uidAtual,movEditandoId,{valor,descricao,data,categoria});fecharModalEditar();}
  catch(e){alert('Erro ao salvar.');console.error(e);}
};
window.excluirMovimentacao=async function(){
  if(!movEditandoId||!confirm('Excluir esta movimentação?')) return;
  try{await deletarMovimentacao(uidAtual,movEditandoId);fecharModalEditar();}
  catch(e){alert('Erro ao excluir.');console.error(e);}
};

// ── Tabela ────────────────────────────────────────────────────────
window.setFiltro=function(filtro,btn){
  filtroAtual=filtro;
  document.querySelectorAll('.filtro-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  atualizarTelaCategorias();renderizarTabela();
};
function filtrarPorPeriodo(lista){
  const hoje=new Date();
  return lista.filter(m=>{
    if(!m.data) return true;
    const d=new Date(m.data+'T00:00:00');
    if(filtroAtual==='mes') return d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear();
    if(filtroAtual==='3meses'){const lim=new Date(hoje);lim.setMonth(lim.getMonth()-3);return d>=lim;}
    if(filtroAtual==='ano') return d.getFullYear()===hoje.getFullYear();
    return true;
  });
}
function renderizarTabela(){
  const tbody=document.getElementById('tabela-gastos');
  const cEl=document.getElementById('table-count');
  if(!tbody) return;
  const filtradas=filtrarPorPeriodo(movimentacoes);
  if(cEl) cEl.textContent=`${filtradas.length} registros`;
  if(filtradas.length===0){tbody.innerHTML='<tr><td colspan="6" class="vazio">Nenhuma movimentação no período.</td></tr>';return;}
  tbody.innerHTML=filtradas.map(m=>`
    <tr>
      <td>${m.descricao||'—'}</td>
      <td>${fmtData(m.data)}</td>
      <td>${m.categoria||'—'}</td>
      <td><span class="badge ${m.tipo==='ganho'?'badge-green':'badge-red'}">${m.tipo==='ganho'?'Entrada':'Saída'}</span></td>
      <td class="${m.tipo==='ganho'?'green':'red'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</td>
      <td><button class="btn-icon" onclick="abrirModalEditar('${m.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`).join('');
}
function atualizarTelaCategorias(){
  renderSugestaoOrcamento();
  const grid=document.getElementById('categorias-grid-dinamico'); if(!grid) return;
  const filtradas=filtrarPorPeriodo(movimentacoes).filter(m=>m.tipo==='gasto');

  // Incluir todas as categorias do perfil (mesmo com R$0)
  const cats=getCategoriasPorPerfil();
  const porCat={};
  cats.forEach(c=>{porCat[c]=0;});
  filtradas.forEach(m=>{const c=m.categoria||'Outros';porCat[c]=(porCat[c]||0)+m.valor;});
  const total=Object.values(porCat).reduce((s,v)=>s+v,0);

  if(cats.length===0&&total===0){grid.innerHTML='<div class="vazio" style="grid-column:1/-1">Sem gastos no período.</div>';atualizarGraficoPizza({});return;}

  // Ordenar: com gasto primeiro, depois sem gasto
  const sorted=Object.entries(porCat).sort((a,b)=>b[1]-a[1]);

  grid.innerHTML=sorted.map(([cat,val])=>{
    const pct=total>0?Math.round(val/total*100):0;
    const png=getIconeCat(cat);
    const iconeEl=png
      ? `<img src="${png}" alt="${cat}">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px;height:28px"><circle cx="12" cy="12" r="10"/></svg>`;
    const barColor=pct>60?'var(--red)':pct>30?'var(--yellow)':'var(--primary)';
    return `<div class="cat-card" onclick="filtrarPorCategoria('${cat}')" style="cursor:pointer;position:relative;overflow:hidden">
      <div class="cat-icon">${iconeEl}</div>
      <div class="cat-nome">${cat}</div>
      <div class="cat-valor">${fmt(val)}</div>
      <div class="cat-meta-label">${pct}% do limite</div>
      <div class="cat-meta-bar"><div class="cat-meta-fill" style="width:${pct}%;background:${barColor}"></div></div>
    </div>`;
  }).join('');
  atualizarGraficoPizza(porCat);
}
const COLORS=['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#a855f7'];
function atualizarGraficoPizza(porCat){
  const canvas=document.getElementById('chart-pizza');
  const emptyEl=document.getElementById('pizza-empty');
  const legendaEl=document.getElementById('pizza-legenda');
  if(!canvas) return;
  const labels=Object.keys(porCat).filter(k=>porCat[k]>0);
  const data=labels.map(k=>porCat[k]);
  const total=data.reduce((a,b)=>a+b,0);
  if(total===0){canvas.style.display='none';if(emptyEl)emptyEl.style.display='flex';if(legendaEl)legendaEl.innerHTML='';return;}
  canvas.style.display='block';if(emptyEl)emptyEl.style.display='none';
  const cores=['#22C55E','#3B82F6','#F59E0B','#EF4444','#A855F7','#64748B','#EC4899','#14B8A6'];
  if(chartPizza){chartPizza.destroy();chartPizza=null;}
  const ctx=canvas.getContext('2d');
  const tipo=tipoGraficoPizza||'doughnut';

  if(tipo==='bar'){
    chartPizza=new Chart(ctx,{type:'bar',
      data:{labels,datasets:[{data,backgroundColor:cores.slice(0,labels.length),borderWidth:0,borderRadius:6}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)+' ('+((c.raw/total)*100).toFixed(0)+'%)'}}},
        scales:{
          x:{grid:{display:false},ticks:{color:'rgba(255,255,255,0.5)',font:{size:10}}},
          y:{grid:{color:'rgba(255,255,255,0.06)'},ticks:{color:'rgba(255,255,255,0.5)',font:{size:10},callback:v=>'R$'+v}}
        }
      }
    });
    if(legendaEl) legendaEl.innerHTML='';
  } else {
    chartPizza=new Chart(ctx,{type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:cores.slice(0,labels.length),borderWidth:0,hoverOffset:6}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{
          title:items=>items[0].label,
          label:c=>' '+c.label+': '+fmt(c.raw)+' ('+((c.raw/total)*100).toFixed(0)+'%)'
        }}},
        cutout:'60%'
      }
    });
    if(legendaEl){
      legendaEl.innerHTML=labels.map((l,i)=>`
        <div class="pizza-leg-item">
          <span style="width:10px;height:10px;border-radius:50%;background:${cores[i]};flex-shrink:0;display:inline-block"></span>
          <span style="font-size:.78rem;color:var(--gray)">${l}</span>
          <span style="font-size:.78rem;font-weight:600;color:var(--white);margin-left:auto">${((data[i]/total)*100).toFixed(0)}%</span>
        </div>`).join('');
    }
  }
}

function _matchQ(str, q) {
  return (str||'').toLowerCase().includes(q.toLowerCase());
}

function _buscarTudo(q) {
  if (!q.trim()) return [];
  const resultados = [];

  // 1. Movimentações
  movimentacoes.filter(m =>
    _matchQ(m.descricao, q) || _matchQ(m.categoria, q) || _matchQ(m.valor+'', q)
  ).slice(0, 5).forEach(m => {
    resultados.push({
      tipo: 'mov',
      icone: m.tipo === 'ganho' ? '↑' : '↓',
      iconeBg: m.tipo === 'ganho' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      iconeColor: m.tipo === 'ganho' ? '#22c55e' : '#ef4444',
      titulo: m.descricao || '—',
      sub: (m.categoria || '') + ' · ' + fmtData(m.data),
      valor: (m.tipo === 'ganho' ? '+' : '−') + fmt(m.valor),
      valorColor: m.tipo === 'ganho' ? '#22c55e' : '#ef4444',
      secao: 'Movimentações',
      acao: () => { irPara('gastos'); setTimeout(() => abrirModalEditar(m.id), 200); }
    });
  });

  // 2. Metas
  metas.filter(m =>
    _matchQ(m.nome, q) || _matchQ(m.valor+'', q)
  ).slice(0, 3).forEach(m => {
    const pct = m.valor > 0 ? Math.min(100, Math.round((m.atual||0)/m.valor*100)) : 0;
    resultados.push({
      tipo: 'meta',
      icone: '🎯',
      iconeBg: 'rgba(139,92,246,0.15)',
      iconeColor: '#8b5cf6',
      titulo: m.nome || '—',
      sub: `Meta: ${fmt(m.valor)} · ${pct}% concluída`,
      valor: fmt(m.atual||0),
      valorColor: '#8b5cf6',
      secao: 'Metas',
      acao: () => irPara('metas')
    });
  });

  // 3. Dívidas
  dividas.filter(d =>
    _matchQ(d.descricao, q) || _matchQ(d.tipo, q) || _matchQ(d.valor+'', q)
  ).slice(0, 3).forEach(d => {
    resultados.push({
      tipo: 'divida',
      icone: '💳',
      iconeBg: 'rgba(239,68,68,0.15)',
      iconeColor: '#ef4444',
      titulo: d.descricao || '—',
      sub: `Dívida · ${d.tipo||''}`,
      valor: fmt(d.valor||0),
      valorColor: '#ef4444',
      secao: 'Dívidas',
      acao: () => irPara('dividas')
    });
  });

  // 4. Contas a pagar
  contas.filter(c =>
    _matchQ(c.descricao, q) || _matchQ(c.categoria, q) || _matchQ(c.valor+'', q)
  ).slice(0, 3).forEach(c => {
    const status = c.paga ? '✓ Paga' : 'Pendente';
    resultados.push({
      tipo: 'conta',
      icone: '📅',
      iconeBg: 'rgba(245,158,11,0.15)',
      iconeColor: '#f59e0b',
      titulo: c.descricao || '—',
      sub: `${c.categoria||''} · Vence ${fmtData(c.vencimento)} · ${status}`,
      valor: fmt(c.valor||0),
      valorColor: c.paga ? '#22c55e' : '#f59e0b',
      secao: 'Contas a Pagar',
      acao: () => irPara('contas')
    });
  });

  // 5. Navegação rápida por palavras-chave
  const navMap = [
    {keys:['investimento','bolsa','ação','fii','etf','cripto','bitcoin','selic','cdi'], tela:'investimentos', label:'Ir para Investimentos'},
    {keys:['score','pontu','classificaç'], tela:'score', label:'Ir para Score Financeiro'},
    {keys:['relatório','histórico','mês anterior'], tela:'relatorio', label:'Ir para Relatório'},
    {keys:['aprender','artigo','reserva','educaç'], tela:'aprender', label:'Ir para Aprender'},
  ];
  navMap.forEach(nav => {
    if(nav.keys.some(k => _matchQ(q, k) || _matchQ(k, q))) {
      resultados.push({
        tipo: 'nav',
        icone: '→',
        iconeBg: 'rgba(34,197,94,0.1)',
        iconeColor: '#22c55e',
        titulo: nav.label,
        sub: 'Atalho de navegação',
        valor: '',
        valorColor: '',
        secao: 'Navegação',
        acao: () => irPara(nav.tela)
      });
    }
  });

  return resultados;
}

// Agrupa resultados por seção
function _renderDropdown(q) {
  const dd = document.getElementById('search-dropdown');
  const hd = document.getElementById('search-results-header');
  const lst = document.getElementById('search-results-list');
  if (!dd) return;

  if (!q.trim()) { dd.style.display = 'none'; return; }

  const res = _buscarTudo(q);
  if (hd) hd.innerHTML = res.length > 0
    ? `<span style="color:var(--gray)">${res.length} resultado${res.length>1?'s':''} para </span><strong style="color:var(--white)">"${q}"</strong>`
    : `<span style="color:var(--gray)">Nenhum resultado para </span><strong style="color:var(--white)">"${q}"</strong>`;

  if (res.length === 0) {
    if (lst) lst.innerHTML = `<div style="padding:20px;text-align:center">
      <div style="font-size:1.8rem;margin-bottom:8px">🔍</div>
      <div style="font-size:.85rem;color:var(--gray)">Tente buscar por descrição,<br>categoria ou valor</div>
    </div>`;
    dd.style.display = 'block'; return;
  }

  // Agrupar por seção
  const secoes = {};
  res.forEach((r, idx) => {
    if (!secoes[r.secao]) secoes[r.secao] = [];
    secoes[r.secao].push({...r, idx});
  });

  let html = '';
  Object.entries(secoes).forEach(([secao, items]) => {
    html += `<div style="padding:6px 14px 2px;font-size:.68rem;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--gray)">${secao}</div>`;
    items.forEach(r => {
      html += `<div id="sr-${r.idx}" style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);transition:background .12s"
        onmouseenter="this.style.background='rgba(255,255,255,0.05)'"
        onmouseleave="this.style.background=''"
        onclick="_executarBusca(${r.idx})">
        <div style="width:34px;height:34px;border-radius:10px;background:${r.iconeBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${r.iconeColor};font-size:.9rem;font-weight:700">${r.icone}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.86rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--white)">${r.titulo}</div>
          <div style="font-size:.72rem;color:var(--gray);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.sub}</div>
        </div>
        ${r.valor ? `<div style="font-size:.86rem;font-weight:700;color:${r.valorColor};flex-shrink:0">${r.valor}</div>` : ''}
      </div>`;
    });
  });

  if (lst) lst.innerHTML = html;
  dd.style.display = 'block';

  // Guardar ações para execução
  window._buscaAcoes = res.map(r => r.acao);
}

window._executarBusca = function(idx) {
  esconderDropdown();
  window.limparBusca();
  if (window._buscaAcoes && window._buscaAcoes[idx]) {
    window._buscaAcoes[idx]();
  }
};

window.buscarMovimentacoes = function(q) {
  const c = document.getElementById('search-clear');
  const cm = document.getElementById('search-clear-mobile');
  if (c) c.style.display = q ? 'block' : 'none';
  if (cm) cm.style.display = q ? 'block' : 'none';
  _renderDropdown(q);
};

window.mostrarDropdownBusca = function(q) { _renderDropdown(q); };

function esconderDropdown() {
  const dd = document.getElementById('search-dropdown');
  if (dd) dd.style.display = 'none';
}
window.fecharDropdownBusca = esconderDropdown;

window.limparBusca = function() {
  const si = document.getElementById('search-input');
  const sm = document.getElementById('search-input-mobile');
  if (si) si.value = ''; if (sm) sm.value = '';
  esconderDropdown();
  const c = document.getElementById('search-clear');
  const cm = document.getElementById('search-clear-mobile');
  if (c) c.style.display = 'none';
  if (cm) cm.style.display = 'none';
};

document.addEventListener('click', e => {
  if (!e.target.closest('#search-dropdown') && !e.target.closest('.search-bar') && !e.target.closest('.search-mobile-overlay'))
    esconderDropdown();
});

// Fechar dropdown ao pressionar Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { esconderDropdown(); window.limparBusca(); }
});

window.abrirBuscaMobile = function() {
  const o = document.getElementById('search-mobile-overlay');
  if (o) { o.style.display = 'flex'; const si = document.getElementById('search-input-mobile'); if (si) si.focus(); }
};
window.fecharBuscaMobile = function() {
  const o = document.getElementById('search-mobile-overlay');
  if (o) o.style.display = 'none';
  window.limparBusca();
};

// ── Metas ─────────────────────────────────────────────────────────
window.criarMeta=async function(){
  const nome=document.getElementById('meta-nome').value.trim();
  const valor=parseFloat(document.getElementById('meta-valor').value);
  const atual=parseFloat(document.getElementById('meta-atual').value)||0;
  const dataAlvo=document.getElementById('meta-data-alvo').value;
  if(!nome||!valor||valor<=0){alert('Preencha nome e valor da meta.');return;}
  try{
    await adicionarMeta(uidAtual,{nome,valor,atual,dataAlvo:dataAlvo||null});
    ['meta-nome','meta-valor','meta-atual','meta-data-alvo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    metas=await getMetas(uidAtual);renderizarMetas();
  }catch(e){alert('Erro ao criar meta.');console.error(e);}
};
function renderizarMetas(){
  const el=document.getElementById('lista-metas'); if(!el) return;
  if(metas.length===0){el.innerHTML='<div class="vazio">Nenhuma meta ainda.</div>';return;}
  el.innerHTML=metas.map(m=>{
    const pct=m.valor>0?Math.min(100,((m.atual||0)/m.valor)*100):0;
    const faltam=Math.max(0,m.valor-(m.atual||0));
    return `<div class="meta-card"><div class="meta-header"><span class="meta-nome">${m.nome}</span><span class="meta-pct">${pct.toFixed(0)}%</span></div><div class="meta-bar-wrap"><div class="meta-bar" style="width:${pct}%"></div></div><div class="meta-valores"><span class="green">${fmt(m.atual||0)} guardados</span><span class="gray">Faltam ${fmt(faltam)}</span></div>${m.dataAlvo?`<div style="font-size:.75rem;color:var(--gray);margin-top:4px">🎯 Prazo: ${fmtData(m.dataAlvo)}</div>`:''}<div style="display:flex;gap:8px;margin-top:10px"><button class="btn-sm-green" onclick="abrirModalMeta('${m.id}')">+ Adicionar</button><button class="btn-sm-red" onclick="excluirMeta('${m.id}')">Excluir</button></div></div>`;
  }).join('');
}
window.abrirModalMeta=function(id){
  metaEditandoId=id;
  const m=metas.find(x=>x.id===id); if(!m) return;
  document.getElementById('modal-meta-nome-display').textContent=m.nome;
  document.getElementById('modal-meta-valor').value='';
  document.getElementById('modal-meta').classList.remove('hidden');
};
window.abrirModalMetaPorId=window.abrirModalMeta;
window.fecharModalMeta=function(){document.getElementById('modal-meta').classList.add('hidden');metaEditandoId=null;};
window.adicionarValorMeta=async function(){
  if(!metaEditandoId) return;
  const val=parseFloat(document.getElementById('modal-meta-valor').value);
  if(!val||val<=0){alert('Informe um valor válido.');return;}
  const m=metas.find(x=>x.id===metaEditandoId); if(!m) return;
  try{await atualizarMeta(uidAtual,metaEditandoId,{atual:(m.atual||0)+val});metas=await getMetas(uidAtual);renderizarMetas();fecharModalMeta();}
  catch(e){alert('Erro ao atualizar meta.');console.error(e);}
};
window.excluirMeta=async function(id){
  if(!confirm('Excluir esta meta?')) return;
  try{await deletarMeta(uidAtual,id);metas=await getMetas(uidAtual);renderizarMetas();}
  catch(e){alert('Erro ao excluir.');console.error(e);}
};

// ── Dívidas ───────────────────────────────────────────────────────
window.atualizarFormDivida=function(){
  const tipo=document.getElementById('div-tipo').value;
  const ta=document.getElementById('div-terceiro-area');
  if(ta) ta.style.display=tipo==='terceiros'?'block':'none';
};
window.cadastrarDivida=async function(){
  const tipo=document.getElementById('div-tipo').value;
  const descricao=document.getElementById('div-descricao').value.trim();
  const valor=parseFloat(document.getElementById('div-valor').value);
  const juros=parseFloat(document.getElementById('div-juros').value)||0;
  const parcelas=parseInt(document.getElementById('div-parcelas').value)||0;
  const credor=document.getElementById('div-credor').value.trim();
  if(!descricao||!valor||valor<=0){alert('Preencha descrição e valor.');return;}
  try{
    await adicionarDivida(uidAtual,{tipo,descricao,valor,juros,parcelas,credor});
    ['div-descricao','div-valor','div-juros','div-parcelas','div-credor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const suc=document.getElementById('div-form-sucesso');
    if(suc){suc.style.display='block';setTimeout(()=>suc.style.display='none',2000);}
    dividas=await getDividas(uidAtual);renderizarDividas();
  }catch(e){alert('Erro ao cadastrar dívida.');console.error(e);}
};
function renderizarDividas(){
  const el=document.getElementById('lista-dividas-cadastradas'); if(!el) return;
  const tot=dividas.reduce((s,d)=>s+(d.valor||0),0);
  const cart=dividas.filter(d=>d.tipo==='cartao').reduce((s,d)=>s+(d.valor||0),0);
  const emp=dividas.filter(d=>d.tipo==='emprestimo'||d.tipo==='financiamento').reduce((s,d)=>s+(d.valor||0),0);
  const terc=dividas.filter(d=>d.tipo==='terceiros').reduce((s,d)=>s+(d.valor||0),0);
  const kT=document.getElementById('div-kpi-total');const kQ=document.getElementById('div-kpi-qtd');
  const kC=document.getElementById('div-kpi-cartao');const kE=document.getElementById('div-kpi-emprest');const kTe=document.getElementById('div-kpi-terceiros');
  if(kT)kT.textContent=fmt(tot);if(kQ)kQ.textContent=dividas.length>0?`${dividas.length} dívida(s) ativa(s)`:'Nenhuma dívida cadastrada';
  if(kC)kC.textContent=fmt(cart);if(kE)kE.textContent=fmt(emp);if(kTe)kTe.textContent=fmt(terc);
  if(dividas.length===0){el.innerHTML='<div class="vazio">Nenhuma dívida cadastrada ainda.<br><span style="font-size:.8rem">Use o formulário ao lado para registrar.</span></div>';return;}
  const lbl={cartao:'Cartão de crédito',emprestimo:'Empréstimo',financiamento:'Financiamento',terceiros:'Terceiros',outros:'Outros'};
  el.innerHTML=dividas.map(d=>`
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div><div style="font-weight:700">${d.descricao}</div><div style="font-size:.75rem;color:var(--gray)">${lbl[d.tipo]||d.tipo}${d.credor?' · '+d.credor:''}</div></div>
        <div style="text-align:right"><div style="font-weight:800;color:#ef4444">${fmt(d.valor)}</div>${d.juros>0?`<div style="font-size:.72rem;color:var(--gray)">${d.juros}% a.m.</div>`:''}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-sm-green" onclick="quitarDivida('${d.id}')">✓ Quitar</button>
        <button class="btn-sm-red" onclick="excluirDivida('${d.id}')">Excluir</button>
      </div>
    </div>`).join('');
  const eCard=document.getElementById('estrategia-card');const eTex=document.getElementById('estrategia-texto');
  if(eCard&&eTex){eCard.style.display='block';const mj=[...dividas].sort((a,b)=>(b.juros||0)-(a.juros||0))[0];eTex.innerHTML=mj&&mj.juros>0?`Priorize quitar <strong>${mj.descricao}</strong> — tem os maiores juros (${mj.juros}% a.m.). Método avalanche economiza mais a longo prazo.`:'Use o método bola de neve: quite as menores dívidas primeiro.';}
}
window.quitarDivida=async function(id){
  if(!confirm('Marcar como quitada e remover?')) return;
  try{await deletarDivida(uidAtual,id);dividas=await getDividas(uidAtual);renderizarDividas();}
  catch(e){alert('Erro.');console.error(e);}
};
window.excluirDivida=async function(id){
  if(!confirm('Excluir esta dívida?')) return;
  try{await deletarDivida(uidAtual,id);dividas=await getDividas(uidAtual);renderizarDividas();}
  catch(e){alert('Erro.');console.error(e);}
};
window.calcularDivida=function(){
  const valor=parseFloat(document.getElementById('sim-valor').value);
  const juros=parseFloat(document.getElementById('sim-juros').value);
  const parc=parseInt(document.getElementById('sim-parcelas').value);
  if(!valor||!juros||!parc){alert('Preencha todos os campos do simulador.');return;}
  const taxa=juros/100;
  const parcela=valor*(taxa*Math.pow(1+taxa,parc))/(Math.pow(1+taxa,parc)-1);
  const totalPagar=parcela*parc;const totalJuros=totalPagar-valor;
  const dOrig=document.getElementById('div-original');const dJT=document.getElementById('div-juros-total');
  const dTot=document.getElementById('div-total');const dPar=document.getElementById('div-parcela');
  if(dOrig)dOrig.textContent=fmt(valor);if(dJT)dJT.textContent=fmt(totalJuros);
  if(dTot)dTot.textContent=fmt(totalPagar);if(dPar)dPar.textContent=fmt(parcela);
  const al=document.getElementById('div-alerta');if(al) al.innerHTML=totalJuros/valor>0.5?'⚠️ Os juros representam mais de 50% do valor original!':'';
  document.getElementById('resultado-divida').classList.remove('hidden');
};

// ── Contas ────────────────────────────────────────────────────────
window.salvarConta=async function(){
  const descricao=document.getElementById('conta-descricao').value.trim();
  const valor=parseFloat(document.getElementById('conta-valor').value);
  const vencimento=document.getElementById('conta-vencimento').value;
  const categoria=document.getElementById('conta-categoria').value;
  const recorrente=document.getElementById('conta-recorrente').checked;
  if(!descricao||!valor||!vencimento){alert('Preencha descrição, valor e vencimento.');return;}
  try{
    if(contaEditandoId){
      await atualizarConta(uidAtual,contaEditandoId,{descricao,valor,vencimento,categoria,recorrente,paga:false});
      contaEditandoId=null;
      document.getElementById('contas-form-titulo').textContent='Nova Conta';
      document.getElementById('btn-salvar-conta').textContent='Cadastrar conta';
      document.getElementById('btn-cancelar-conta').style.display='none';
    }else{await adicionarConta(uidAtual,{descricao,valor,vencimento,categoria,recorrente,paga:false});}
    ['conta-descricao','conta-valor','conta-vencimento'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('conta-recorrente').checked=false;
    const suc=document.getElementById('conta-sucesso');if(suc){suc.style.display='block';setTimeout(()=>suc.style.display='none',2000);}
    contas=await getContas(uidAtual);renderizarContas();
  }catch(e){alert('Erro ao salvar conta.');console.error(e);}
};
window.editarConta=function(id){
  const c=contas.find(x=>x.id===id); if(!c) return;
  contaEditandoId=id;
  document.getElementById('conta-descricao').value=c.descricao;
  document.getElementById('conta-valor').value=c.valor;
  document.getElementById('conta-vencimento').value=c.vencimento;
  document.getElementById('conta-categoria').value=c.categoria||'Outros';
  document.getElementById('conta-recorrente').checked=c.recorrente||false;
  document.getElementById('contas-form-titulo').textContent='Editar Conta';
  document.getElementById('btn-salvar-conta').textContent='Salvar alterações';
  document.getElementById('btn-cancelar-conta').style.display='block';
};
window.cancelarEdicaoConta=function(){
  contaEditandoId=null;
  ['conta-descricao','conta-valor','conta-vencimento'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('contas-form-titulo').textContent='Nova Conta';
  document.getElementById('btn-salvar-conta').textContent='Cadastrar conta';
  document.getElementById('btn-cancelar-conta').style.display='none';
};
window.pagarConta=async function(id){
  try{await atualizarConta(uidAtual,id,{paga:true});contas=await getContas(uidAtual);renderizarContas();}
  catch(e){alert('Erro.');console.error(e);}
};
window.excluirConta=async function(id){
  if(!confirm('Excluir esta conta?')) return;
  try{await deletarConta(uidAtual,id);contas=await getContas(uidAtual);renderizarContas();}
  catch(e){alert('Erro.');console.error(e);}
};
window.filtrarContas=function(filtro,btn){
  filtroContasAtual=filtro;
  document.querySelectorAll('.contas-filtro-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderizarContas();
};
window.mudarMesContas=function(delta){mesContas=new Date(mesContas.getFullYear(),mesContas.getMonth()+delta,1);renderizarContas();};
window.renderizarContas=renderizarContas;

// Popular select de categoria de contas com categorias do perfil
function popularSelectContas(){
  const sel=document.getElementById('conta-categoria'); if(!sel) return;
  // Reusar a mesma lógica do getCategoriasPorPerfil para consistência
  const cats=getCategoriasPorPerfil();
  const extras=[];
  // Bloco vazio para manter estrutura do código abaixo
  [].forEach(r=>{});
  [].filter(r=>false).forEach(r=>{
    const n=r.trim(); if(!extras.includes(n)) extras.push(n);
  });
  const todas=[...cats,...extras.filter(e=>!cats.includes(e))];
  const cur=sel.value;
  sel.innerHTML=todas.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(cur && todas.includes(cur)) sel.value=cur;
}

function renderizarContas(){
  const el=document.getElementById('lista-contas'); if(!el) return;
  const hoje=new Date();const em3=new Date(hoje);em3.setDate(em3.getDate()+3);
  let lista=[...contas];
  if(filtroContasAtual==='pendentes') lista=lista.filter(c=>!c.paga);
  else if(filtroContasAtual==='vencidas') lista=lista.filter(c=>!c.paga&&c.vencimento<dataHoje());
  else if(filtroContasAtual==='pagas') lista=lista.filter(c=>c.paga);
  const kT=document.getElementById('contas-kpi-total');const kQ=document.getElementById('contas-kpi-qtd');
  const kV=document.getElementById('contas-kpi-vencidas');const kP=document.getElementById('contas-kpi-proximas');const kPg=document.getElementById('contas-kpi-pagas');
  const cntEl=document.getElementById('contas-lista-count');
  const totalPend=contas.filter(c=>!c.paga).reduce((s,c)=>s+(c.valor||0),0);
  const qtdVenc=contas.filter(c=>!c.paga&&c.vencimento<dataHoje()).length;
  const qtdProx=contas.filter(c=>!c.paga&&c.vencimento>=dataHoje()&&c.vencimento<=em3.toISOString().split('T')[0]).length;
  const qtdPagas=contas.filter(c=>c.paga).length;
  if(kT)kT.textContent=fmt(totalPend);if(kQ)kQ.textContent=`${contas.filter(c=>!c.paga).length} pendente(s)`;
  if(kV)kV.textContent=qtdVenc;if(kP)kP.textContent=qtdProx;if(kPg)kPg.textContent=qtdPagas;
  if(cntEl)cntEl.textContent=`${lista.length} contas`;
  renderizarCalendarioContas();
  if(lista.length===0){el.innerHTML=`<div class="vazio">Nenhuma conta ${filtroContasAtual==='todas'?'cadastrada':'nesta categoria'}.</div>`;return;}
  lista.sort((a,b)=>(a.vencimento||'').localeCompare(b.vencimento||''));
  el.innerHTML=lista.map(c=>{
    const isVenc=!c.paga&&c.vencimento<dataHoje();
    const isProx=!c.paga&&!isVenc&&c.vencimento<=em3.toISOString().split('T')[0];
    const badge=c.paga?'badge-green':isVenc?'badge-red':isProx?'badge-yellow':'badge-gray';
    const blbl=c.paga?'Paga':isVenc?'Vencida':isProx?'Próxima':'Pendente';
    return `<div style="background:var(--card-bg);border:1px solid ${isVenc?'rgba(239,68,68,0.3)':'var(--border)'};border-radius:14px;padding:14px;margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div><div style="font-weight:700">${c.descricao}</div><div style="font-size:.75rem;color:var(--gray)">${c.categoria||''} · Vence ${fmtData(c.vencimento)}${c.recorrente?' · Recorrente':''}</div></div>
        <div style="text-align:right"><div style="font-weight:800;color:${c.paga?'#22c55e':'#f59e0b'}">${fmt(c.valor)}</div><span class="badge ${badge}" style="font-size:.7rem">${blbl}</span></div>
      </div>
      ${!c.paga?`<div style="display:flex;gap:8px"><button class="btn-sm-green" onclick="pagarConta('${c.id}')">✓ Marcar paga</button><button class="btn-sm-gray" onclick="editarConta('${c.id}')">Editar</button><button class="btn-sm-red" onclick="excluirConta('${c.id}')">Excluir</button></div>`:`<button class="btn-sm-red" onclick="excluirConta('${c.id}')">Remover</button>`}
    </div>`;
  }).join('');
}
function renderizarCalendarioContas(){
  const grid=document.getElementById('contas-grid-dias');const label=document.getElementById('contas-mes-label');
  if(!grid||!label) return;
  const mN=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  label.textContent=`${mN[mesContas.getMonth()]} ${mesContas.getFullYear()}`;
  const firstDay=new Date(mesContas.getFullYear(),mesContas.getMonth(),1).getDay();
  const daysInMonth=new Date(mesContas.getFullYear(),mesContas.getMonth()+1,0).getDate();
  const hoje=new Date();
  const cDias={};
  contas.forEach(c=>{if(c.vencimento){const d=new Date(c.vencimento+'T00:00:00');if(d.getMonth()===mesContas.getMonth()&&d.getFullYear()===mesContas.getFullYear()){const day=d.getDate();if(!cDias[day])cDias[day]=[];cDias[day].push(c);}}});
  const headers=Array.from(grid.children).slice(0,7);grid.innerHTML='';headers.forEach(h=>grid.appendChild(h));
  for(let i=0;i<firstDay;i++){const el=document.createElement('div');grid.appendChild(el);}
  for(let d=1;d<=daysInMonth;d++){
    const el=document.createElement('div');
    const isH=d===hoje.getDate()&&mesContas.getMonth()===hoje.getMonth()&&mesContas.getFullYear()===hoje.getFullYear();
    const tC=cDias[d];
    let bg='transparent',color='var(--text)',border='none';
    if(isH){bg='var(--primary)';color='#000';}
    else if(tC){const aV=tC.some(c=>!c.paga&&c.vencimento<dataHoje());bg=aV?'rgba(239,68,68,0.2)':'rgba(34,197,94,0.15)';border=`1px solid ${aV?'rgba(239,68,68,0.4)':'rgba(34,197,94,0.3)'}`;}
    el.style.cssText=`font-size:.72rem;padding:4px 2px;border-radius:6px;background:${bg};color:${color};border:${border};font-weight:${isH||tC?'700':'400'};text-align:center`;
    el.textContent=d;grid.appendChild(el);
  }
}
window.criarContasDeRotina=async function(){
  if(!uidAtual) return;
  const rotina=perfilUsuario?.perfilVida?.rotina||[];
  const nomes={
    netflix:'Netflix',spotify:'Spotify',youtube:'YouTube Premium',
    hbo:'Max (HBO)',prime:'Prime Video',disney:'Disney+',
    chatgpt:'ChatGPT Plus',notion:'Notion',canva:'Canva',capcut:'CapCut',
    internet:'Internet',celular:'Celular',academia:'Academia',
    luta:'Luta / Artes Marciais',futebol:'Futebol',
  };
  const valorPadrao={
    netflix:59.90,spotify:21.90,youtube:27.90,hbo:34.90,prime:19.90,disney:43.90,
    chatgpt:100,notion:0,canva:0,capcut:0,internet:0,celular:0,academia:0,luta:0,futebol:0,
  };
  const hoje=new Date();
  const venc=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-10`;
  const criados=[];
  const rotinasFixas=['netflix','spotify','youtube','hbo','prime','disney','chatgpt','notion','canva','capcut','internet','celular','academia','luta','futebol'];
  for(const r of rotina){
    const nome=nomes[r]||r;
    // Verifica se já existe uma conta com esse nome para não duplicar
    const jaExiste=contas.some(c=>c.descricao.toLowerCase()===nome.toLowerCase());
    if(!jaExiste){
      const val=valorPadrao[r]||0;
      await adicionarConta(uidAtual,{
        descricao:nome,
        valor:val,
        vencimento:venc,
        categoria:rotinasFixas.includes(r)?'Assinatura':'Outros',
        recorrente:true,
        paga:false
      });
      criados.push(nome);
    }
  }
  // Recarregar contas
  contas=await getContas(uidAtual);
  renderizarContas();
  // Esconder banner só após criar
  const b=document.getElementById('banner-rotina-contas');
  if(b) b.style.display='none';
  if(criados.length>0){
    const msg=criados.length===1?`Conta "${criados[0]}" criada!`:`${criados.length} contas criadas com sucesso!`;
    if(window.mostrarToastPerfil) window.mostrarToastPerfil(msg);
    else alert(msg);
  }
};

// ── Relatório ─────────────────────────────────────────────────────
window.setPeriodoModo=function(modo){
  periodoModo=modo;
  const tM=document.getElementById('tab-mes');const tC=document.getElementById('tab-custom');
  const nM=document.getElementById('periodo-mes-nav');const nC=document.getElementById('periodo-custom-nav');
  if(tM)tM.classList.toggle('active',modo==='mes');if(tC)tC.classList.toggle('active',modo==='custom');
  if(nM)nM.style.display=modo==='mes'?'flex':'none';if(nC)nC.style.display=modo==='custom'?'block':'none';
  renderizarRelatorio();
};
window.mudarMesRelatorio=function(delta){mesRelatorio=new Date(mesRelatorio.getFullYear(),mesRelatorio.getMonth()+delta,1);renderizarRelatorio();};
window.aplicarPeriodoCustom=function(){
  periodoCustomInicio=document.getElementById('periodo-inicio').value;
  periodoCustomFim=document.getElementById('periodo-fim').value;
  if(periodoCustomInicio&&periodoCustomFim){const lEl=document.getElementById('periodo-custom-label');if(lEl)lEl.textContent=`${fmtData(periodoCustomInicio)} → ${fmtData(periodoCustomFim)}`;renderizarRelatorio();}
};
window.atalhoUltimos=function(dias){
  const hoje=new Date();const ini=new Date(hoje);ini.setDate(ini.getDate()-dias);
  periodoCustomInicio=ini.toISOString().split('T')[0];periodoCustomFim=hoje.toISOString().split('T')[0];
  const pi=document.getElementById('periodo-inicio');const pf=document.getElementById('periodo-fim');
  if(pi)pi.value=periodoCustomInicio;if(pf)pf.value=periodoCustomFim;renderizarRelatorio();
};
function getMovsRelatorio(){
  if(periodoModo==='custom'&&periodoCustomInicio&&periodoCustomFim) return movimentacoes.filter(m=>m.data>=periodoCustomInicio&&m.data<=periodoCustomFim);
  return movimentacoes.filter(m=>{if(!m.data)return false;const d=new Date(m.data+'T00:00:00');return d.getMonth()===mesRelatorio.getMonth()&&d.getFullYear()===mesRelatorio.getFullYear();});
}
function renderizarRelatorio(){
  const mN=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const lEl=document.getElementById('relatorio-mes-label');if(lEl)lEl.textContent=`${mN[mesRelatorio.getMonth()]} ${mesRelatorio.getFullYear()}`;
  const movs=getMovsRelatorio();
  const ent=movs.filter(m=>m.tipo==='ganho').reduce((s,m)=>s+(m.valor||0),0);
  const sai=movs.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+(m.valor||0),0);
  const sal=ent-sai;
  const rE=document.getElementById('rel-entradas');const rS=document.getElementById('rel-saidas');const rSa=document.getElementById('rel-saldo');const rT=document.getElementById('rel-total');
  if(rE)rE.textContent=fmt(ent);if(rS)rS.textContent=fmt(sai);
  if(rSa){rSa.textContent=fmtSaldo(sal);rSa.style.color=sal<0?'#ef4444':'#22c55e';}
  if(rT)rT.textContent=movs.length;
  const topEl=document.getElementById('relatorio-top-gastos');
  if(topEl){const gastos=movs.filter(m=>m.tipo==='gasto').sort((a,b)=>b.valor-a.valor).slice(0,5);if(gastos.length===0)topEl.innerHTML='<div class="vazio">Nenhum gasto neste período.</div>';else topEl.innerHTML=gastos.map(m=>`<div class="mov-item"><div class="mov-info"><div class="mov-desc">${m.descricao}</div><div class="mov-cat">${m.categoria||''} · ${fmtData(m.data)}</div></div><div class="mov-valor red">-${fmt(m.valor)}</div></div>`).join('');}
  const rEl=document.getElementById('lista-recorrentes');
  if(rEl){const recs=movimentacoes.filter(m=>m.recorrente);if(recs.length===0)rEl.innerHTML='<div class="vazio">Nenhum lançamento recorrente cadastrado.</div>';else rEl.innerHTML=recs.map(m=>`<div class="mov-item"><div class="mov-info"><div class="mov-desc">${m.descricao}</div><div class="mov-cat">${m.tipo==='ganho'?'Entrada':'Saída'} recorrente</div></div><div class="mov-valor ${m.tipo==='ganho'?'green':'red'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</div></div>`).join('');}
  // ── Todas as movimentações ──────────────────────────────────────
  renderizarTodasMovsRelatorio(movs, window._filtroRelatorio||'todos');
  renderizarChartRelatorio();
}

let _filtroRelatorioTipo = 'todos';
window.setFiltroRelatorio = function(tipo, btn) {
  _filtroRelatorioTipo = tipo;
  // Estilo dos botões
  ['todos','ganho','gasto'].forEach(t => {
    const id = t==='todos'?'rel-filtro-todos':t==='ganho'?'rel-filtro-entradas':'rel-filtro-saidas';
    const el = document.getElementById(id);
    if(!el) return;
    if(t===tipo){ el.style.borderColor='var(--primary)';el.style.background='var(--primary-dim)';el.style.color='var(--primary)'; }
    else { el.style.borderColor='var(--border)';el.style.background='transparent';el.style.color='var(--gray)'; }
  });
  renderizarTodasMovsRelatorio(getMovsRelatorio(), tipo);
};

function renderizarTodasMovsRelatorio(movs, tipo) {
  const el = document.getElementById('relatorio-todas-movs'); if(!el) return;
  const filtradas = tipo==='todos' ? movs : movs.filter(m=>m.tipo===tipo);
  if(filtradas.length===0){
    el.innerHTML='<div class="vazio">Nenhuma movimentação no período.</div>';
    return;
  }
  // Ordenar por data decrescente
  const sorted = [...filtradas].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  el.innerHTML = sorted.map(m => {
    const isGanho = m.tipo==='ganho';
    const png = getIconeCat(m.categoria||'Outros');
    const icone = png
      ? `<img src="${png}" style="width:28px;height:28px;object-fit:contain">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="${isGanho?'#22c55e':'#ef4444'}" stroke-width="2" style="width:16px;height:16px"><polyline points="${isGanho?'23 6 13.5 15.5 8.5 10.5 1 18':'23 18 13.5 8.5 8.5 13.5 1 6'}"/></svg>`;
    return `<div class="mov-item" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="mov-icon ${isGanho?'green':'red'}" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${isGanho?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)'}">
        ${icone}
      </div>
      <div class="mov-info" style="flex:1;min-width:0">
        <div class="mov-desc" style="font-weight:600;font-size:.88rem">${m.descricao||'—'}</div>
        <div class="mov-cat" style="font-size:.75rem;color:var(--gray);margin-top:2px">${m.categoria||''} · ${fmtData(m.data)}</div>
      </div>
      <div class="mov-valor ${isGanho?'green':'red'}" style="font-weight:700;font-size:.92rem;white-space:nowrap">
        ${isGanho?'+':'-'}${fmt(m.valor)}
      </div>
    </div>`;
  }).join('');
}
function renderizarChartRelatorio(){
  const canvas=document.getElementById('chart-relatorio'); if(!canvas) return;
  if(!canvas.offsetWidth){setTimeout(renderizarChartRelatorio,100);return;}
  const agora=new Date();const labels=[];const dEnt=[];const dSai=[];
  const mShort=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  for(let i=5;i>=0;i--){
    const d=new Date(agora.getFullYear(),agora.getMonth()-i,1);
    labels.push(mShort[d.getMonth()]);
    const mm=movimentacoes.filter(m=>{if(!m.data)return false;const md=new Date(m.data+'T00:00:00');return md.getMonth()===d.getMonth()&&md.getFullYear()===d.getFullYear();});
    dEnt.push(mm.filter(m=>m.tipo==='ganho').reduce((s,m)=>s+(m.valor||0),0));
    dSai.push(mm.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+(m.valor||0),0));
  }
  const emp=document.getElementById('relatorio-chart-empty');
  if(dEnt.every(v=>v===0)&&dSai.every(v=>v===0)){canvas.style.display='none';if(emp)emp.style.display='flex';return;}
  canvas.style.display='block';if(emp)emp.style.display='none';
  const w=canvas.parentElement?.offsetWidth||canvas.offsetWidth||600;
  canvas.width=w; canvas.height=200;
  if(chartRelatorio){chartRelatorio.destroy();chartRelatorio=null;}
  chartRelatorio=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'Entradas',data:dEnt,backgroundColor:'rgba(34,197,94,0.7)',borderRadius:6},{label:'Saídas',data:dSai,backgroundColor:'rgba(239,68,68,0.7)',borderRadius:6}]},options:{responsive:false,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#64748b'}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#64748b',callback:v=>'R$'+v.toLocaleString('pt-BR')}}}}});
}
window.carregarHistorico=async function(){
  const el=document.getElementById('historico-lista'); if(!el||!uidAtual) return;
  el.innerHTML='<div style="text-align:center;padding:16px;color:var(--gray);font-size:.85rem">Carregando...</div>';
  try{
    const hist=await getHistorico(uidAtual);
    if(hist.length===0){el.innerHTML='<div class="vazio">Nenhum histórico ainda.</div>';return;}
    const mN={' 01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril','05':'Maio','06':'Junho','07':'Julho','08':'Agosto','09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro'};
    el.innerHTML=hist.map(h=>{
      const[ano,mes]=h.mes.split('-');const lbl=`${mN[mes]||mes} ${ano}`;const cor=h.saldo>=0?'#22c55e':'#ef4444';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)"><div><div style="font-weight:700">${lbl}</div><div style="font-size:.75rem;color:var(--gray)">${h.totalMovimentacoes||0} movimentações</div></div><div style="text-align:right"><div style="font-weight:800;color:${cor}">${fmtSaldo(h.saldo)}</div><div style="font-size:.72rem;color:var(--gray)">+${fmt(h.entradas)} / -${fmt(h.saidas)}</div></div></div>`;
    }).join('');
  }catch(e){el.innerHTML='<div class="vazio">Erro ao carregar histórico.</div>';}
};
window.processarRecorrentes=async function(){
  const recs=movimentacoes.filter(m=>m.recorrente);
  if(recs.length===0){alert('Nenhum lançamento recorrente cadastrado.');return;}
  if(!confirm(`Lançar ${recs.length} recorrente(s) para este mês?`)) return;
  try{for(const m of recs) await adicionarMovimentacao(uidAtual,{valor:m.valor,descricao:m.descricao,tipo:m.tipo,data:dataHoje(),categoria:m.categoria,recorrente:false});alert('Lançamentos adicionados!');}
  catch(e){alert('Erro ao processar recorrentes.');console.error(e);}
};

// ── Score ─────────────────────────────────────────────────────────
function calcularScore(){
  const ent=movimentacoes.filter(m=>m.tipo==='ganho').reduce((s,m)=>s+(m.valor||0),0);
  const sai=movimentacoes.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+(m.valor||0),0);
  const sal=ent-sai;const renda=perfilUsuario?.renda||ent||1;
  const pctGasto=ent>0?(sai/ent)*100:100;
  let pG=pctGasto<=50?300:pctGasto<=70?200:pctGasto<=90?100:30;
  const totDiv=dividas.reduce((s,d)=>s+(d.valor||0),0);const relDiv=renda>0?totDiv/renda:0;
  let pD=dividas.length===0?200:relDiv<1?150:relDiv<3?80:20;
  let pM=metas.length===0?50:Math.round((metas.reduce((s,m)=>s+(m.valor>0?(m.atual||0)/m.valor:0),0)/metas.length)*200);
  let pR=sal>renda*6?200:sal>renda*3?150:sal>renda?80:sal>0?40:0;
  const hoje=new Date();const mMes=movimentacoes.filter(m=>{if(!m.data)return false;const d=new Date(m.data+'T00:00:00');return d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear();});
  const pC=Math.min(100,mMes.length*10);
  const score=pG+pD+Math.min(200,pM)+pR+pC;
  let cls='',cor='#22c55e',emoji='⭐';
  if(score>=800){cls='Excelente';cor='#22c55e';emoji='🏆';}
  else if(score>=600){cls='Bom';cor='#3b82f6';emoji='👍';}
  else if(score>=400){cls='Estável';cor='#f59e0b';emoji='😐';}
  else if(score>=200){cls='Atenção';cor='#f97316';emoji='⚠️';}
  else{cls='Crítico';cor='#ef4444';emoji='🚨';}
  const sn=document.getElementById('score-numero');if(sn)sn.textContent=score;
  const sb=document.getElementById('score-badge');
  if(sb){
    const iconeScore=score>=800?'icone-score-excelente.png':score>=600?'icone-score-bom.png':score>=400?'icone-score-estavel.png':score>=200?'icone-score-atencao.png':'icone-score-critico.png';
    sb.innerHTML=`<img src="${iconeScore}" alt="${cls}" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;margin-right:6px;margin-bottom:2px"><span style="color:${cor};font-weight:800">${cls}</span>`;
    sb.style.color=cor;
  }
  const st=document.getElementById('score-tip');
  if(st){if(score>=800)st.textContent='Excelente! Você tem um controle financeiro muito sólido.';else if(score>=600)st.textContent='Bom trabalho! Continue registrando e economizando.';else if(score>=400)st.textContent='Você está no caminho certo. Reduza gastos para avançar.';else st.textContent='Situação crítica. Priorize quitar dívidas e cortar gastos.';}
  const arc=document.getElementById('score-gauge-arc');if(arc){const pct=score/1000;arc.style.strokeDashoffset=251.3-(251.3*pct);arc.style.stroke=cor;}
  const mini=document.getElementById('kpi-score-mini');if(mini)mini.textContent=score;
  const iconeScore2=score>=800?'icone-score-excelente.png':score>=600?'icone-score-bom.png':score>=400?'icone-score-estavel.png':score>=200?'icone-score-atencao.png':'icone-score-critico.png';
  const miniImg=document.getElementById('kpi-score-mini-img');
  const miniIcon=document.getElementById('kpi-score-mini-icon');
  if(miniImg){
    miniImg.src=iconeScore2;
    if(miniIcon){
      miniIcon.className='kpi-icon';
      if(score>=600) miniIcon.classList.add('green');
      else if(score>=400) miniIcon.classList.add('yellow');
      else miniIcon.classList.add('red');
    }
  }
  const mL=document.getElementById('kpi-score-mini-label');if(mL)mL.textContent=`${cls} →`;
  function aCrit(id,pts,max,lbl){
    const pE=document.getElementById(`${id}-pts`);const bE=document.getElementById(`${id}-bar`);const lE=document.getElementById(`${id}-label`);
    if(pE)pE.textContent=`${pts} pts`;if(bE)bE.style.width=`${(pts/max)*100}%`;if(lE)lE.textContent=lbl;
  }
  aCrit('sc-gastos',pG,300,`${pctGasto.toFixed(0)}% da renda comprometida`);
  aCrit('sc-dividas',pD,200,dividas.length===0?'Sem dívidas ativas':`${fmt(totDiv)} em dívidas`);
  aCrit('sc-metas',Math.min(200,pM),200,metas.length===0?'Nenhuma meta criada':`${metas.length} meta(s) ativa(s)`);
  aCrit('sc-reserva',pR,200,`Saldo atual: ${fmtSaldo(sal)}`);
  aCrit('sc-consistencia',pC,100,`${mMes.length} lançamentos este mês`);
  const dEl=document.getElementById('score-dicas-lista');
  if(dEl){
    const d=[];
    if(pctGasto>80)d.push('💸 Seus gastos estão acima de 80% da renda. Identifique os maiores e corte.');
    if(dividas.length>0)d.push('💳 Você tem dívidas ativas. Priorize as de maior juros.');
    if(metas.length===0)d.push('🎯 Crie metas financeiras para ter objetivos claros.');
    if(sal<=0)d.push('🛡️ Construa uma reserva de emergência de pelo menos 3 meses de gastos.');
    if(mMes.length<5)d.push('📊 Registre mais lançamentos para ter um diagnóstico mais preciso.');
    if(d.length===0)d.push('✅ Continue assim! Seu controle financeiro está ótimo.');
    dEl.innerHTML=d.map(x=>`<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:.88rem;line-height:1.5">${x}</div>`).join('');
  }
}

// ── Insights ──────────────────────────────────────────────────────
function gerarInsights(){
  const panel=document.getElementById('insights-panel');const list=document.getElementById('insights-list');const cEl=document.getElementById('insights-count');
  if(!panel||!list) return;
  const insights=[];
  const ent=movimentacoes.filter(m=>m.tipo==='ganho').reduce((s,m)=>s+(m.valor||0),0);
  const sai=movimentacoes.filter(m=>m.tipo==='gasto').reduce((s,m)=>s+(m.valor||0),0);
  const vida=perfilUsuario?.perfilVida||{};
  const rotina=vida.rotina||[];

  // ── Alertas financeiros ──────────────────────────────────
  if(sai>ent*0.9&&ent>0)
    insights.push({png:'icone-urgente.png',bg:'rgba(239,68,68,0.15)',titulo:'Gastos altos',desc:`Seus gastos representam ${((sai/ent)*100).toFixed(0)}% das entradas. Considere reduzir.`,acao:()=>irPara('gastos'),btnLabel:'Ver gastos →'});
  if(dividas.length>0)
    insights.push({png:'icone-cartao-02.png',bg:'rgba(239,68,68,0.12)',titulo:'Dívidas ativas',desc:`Você tem ${dividas.length} dívida(s). Veja a aba Dívidas.`,acao:()=>irPara('dividas'),btnLabel:'Ver dívidas →'});
  const cVenc=contas.filter(c=>!c.paga&&c.vencimento<dataHoje());
  if(cVenc.length>0)
    insights.push({png:'icone-urgente.png',bg:'rgba(239,68,68,0.15)',titulo:`${cVenc.length} contas vencidas!`,desc:`Total em atraso: ${fmt(cVenc.reduce((s,c)=>s+(c.valor||0),0))}. Juros e multas aumentam a cada dia.`,acao:()=>irPara('contas'),btnLabel:'Resolver agora →'});
  const mPerto=metas.filter(m=>m.valor>0&&(m.atual/m.valor)>=0.8);
  if(mPerto.length>0)
    insights.push({png:'icone-trofeu.png',bg:'rgba(34,197,94,0.12)',titulo:'Meta quase atingida!',desc:`${mPerto[0].nome} está em ${((mPerto[0].atual/mPerto[0].valor)*100).toFixed(0)}%. Você está perto!`,acao:()=>irPara('metas'),btnLabel:'Ver meta →'});

  // ── Insights baseados no perfil ──────────────────────────
  const ROTINA_INSIGHTS={
    academia:{png:'icone-academia.png',bg:'rgba(34,197,94,0.1)',titulo:'Academia no perfil',desc:'Você cadastrou academia na rotina. Lembre de registrar esse gasto mensalmente.'},
    luta:{png:'icone-luta.png',bg:'rgba(139,92,246,0.1)',titulo:'Luta / Artes marciais',desc:'Registre sua mensalidade de artes marciais para manter o controle.'},
    futebol:{png:'icone-futebol.png',bg:'rgba(34,197,94,0.1)',titulo:'Futebol no perfil',desc:'Não esqueça de registrar os gastos com futebol e esportes.'},
    netflix:{png:'icone-streaming.png',bg:'rgba(229,9,20,0.1)',titulo:'Netflix',desc:'Você assina Netflix. Registre como gasto recorrente para não perder o controle.'},
    spotify:{png:'icone-streaming.png',bg:'rgba(30,215,96,0.1)',titulo:'Spotify',desc:'Registre sua assinatura do Spotify mensalmente.'},
    youtube:{png:'icone-streaming.png',bg:'rgba(255,0,0,0.1)',titulo:'YouTube Premium',desc:'Sua assinatura do YouTube Premium deve ser registrada como gasto fixo.'},
    hbo:{png:'icone-streaming.png',bg:'rgba(139,92,246,0.1)',titulo:'Max (HBO)',desc:'Registre sua assinatura do Max como gasto recorrente.'},
    prime:{png:'icone-streaming.png',bg:'rgba(0,168,225,0.1)',titulo:'Prime Video',desc:'Sua assinatura Amazon Prime deve ser registrada mensalmente.'},
    disney:{png:'icone-streaming.png',bg:'rgba(17,60,207,0.1)',titulo:'Disney+',desc:'Registre sua assinatura do Disney+ como gasto fixo.'},
    chatgpt:{png:'icone-ferramenta-cognitiva.png',bg:'rgba(16,163,127,0.1)',titulo:'ChatGPT Plus',desc:'Sua assinatura do ChatGPT Plus é um gasto digital — não esqueça de registrar.'},
    canva:{png:'icone-ferramenta-cognitiva.png',bg:'rgba(0,196,204,0.1)',titulo:'Canva',desc:'Se você paga pelo Canva Pro, registre como gasto recorrente.'},
    capcut:{png:'icone-ferramenta-cognitiva.png',bg:'rgba(0,0,0,0.15)',titulo:'CapCut',desc:'Registre sua assinatura do CapCut se for paga.'},
    internet:{png:'icone-internet.png',bg:'rgba(59,130,246,0.1)',titulo:'Internet / Celular',desc:'Registre sua conta de internet ou celular para melhorar a precisão do score.',btnLabel:'Registrar gasto →'},
    celular:{png:'icone-celular.png',bg:'rgba(100,116,139,0.1)',titulo:'Celular',desc:'Registre o plano do seu celular como gasto recorrente.',btnLabel:'Registrar gasto →'},
  };

  // Mostrar no máximo 3 cards de perfil para não poluir
  let perfilCount=0;
  for(const r of rotina){
    if(perfilCount>=3) break;
    const info=ROTINA_INSIGHTS[r];
    if(info && !insights.some(i=>i.titulo===info.titulo)){
      const cat=ROTINA_NOMES[r]||info.titulo;
      insights.push({...info,acao:()=>abrirModalGastoCategoria(cat),btnLabel:'Registrar gasto →'});
      perfilCount++;
    }
  }

  // ── Insight de transporte ────────────────────────────────
  const transporte=vida.transporte||[];
  if(transporte.includes('moto')&&!insights.some(i=>i.titulo==='Moto no perfil'))
    insights.push({png:'icone-moto.png',bg:'rgba(245,158,11,0.1)',titulo:'Moto no perfil',desc:'Registre gastos com gasolina, manutenção e seguro da moto.',acao:()=>abrirModalGastoCategoria('Moto'),btnLabel:'Registrar gasto →'});
  if(transporte.includes('carro')&&!insights.some(i=>i.titulo==='Carro no perfil'))
    insights.push({png:'icone-carro.png',bg:'rgba(100,116,139,0.1)',titulo:'Carro no perfil',desc:'Não esqueça de registrar combustível, manutenção e IPVA.',acao:()=>abrirModalGastoCategoria('Carro'),btnLabel:'Registrar gasto →'});

  // ── Insight de família ───────────────────────────────────
  if(vida.filhos==='sim')
    insights.push({png:'icone-bebe.png',bg:'rgba(236,72,153,0.1)',titulo:'Bebê / Criança',desc:'Registre os gastos com bebê para acompanhar o impacto no orçamento.',acao:()=>abrirModalGastoCategoria('Bebê / Criança'),btnLabel:'Registrar gasto →'});
  const familia=vida.familia||[];
  if(familia.includes('pets'))
    insights.push({png:'icone-pets.png',bg:'rgba(245,158,11,0.1)',titulo:'Pets no perfil',desc:'Registre gastos com pets — ração, veterinário, banho e tosa.',acao:()=>abrirModalGastoCategoria('Pets'),btnLabel:'Registrar gasto →'});

  // Insight reserva emergência se saldo baixo
  const saldoAtual=ent-sai;
  const gastosMes=sai;
  if(saldoAtual<gastosMes*3&&saldoAtual>=0)
    insights.push({png:'icone-cofre.png',bg:'rgba(16,185,129,0.1)',titulo:'Construa sua reserva de emergência',desc:'O ideal é ter 3–6 meses de despesas guardados. Sua reserva atual é muito baixa.',acao:()=>irPara('metas'),btnLabel:'Criar meta de reserva →'});

  if(insights.length===0){panel.style.display='none';return;}
  panel.style.display='block';
  if(cEl)cEl.textContent=`${insights.length} insights`;
  list.innerHTML=insights.map(i=>{
    const isUrgente=i.bg.includes('239,68,68')||i.bg.includes('245,158,11');
    const tagCor=isUrgente?'#ef4444':'#3b82f6';
    const tagTxt=isUrgente?'⚠ URGENTE':'💡 SAIBA MAIS';
    const borderColor=isUrgente?'rgba(239,68,68,0.2)':'rgba(59,130,246,0.12)';
    const acaoFn=i.acao?i.acao.toString():'null';
    return `<div class="insight-card" style="background:${i.bg};border:1px solid ${borderColor}" onclick="${i.acao?'('+acaoFn+')()':'void 0'}">
      <img src="${i.png}" alt="" class="insight-icon" onerror="this.style.display='none'">
      <div class="insight-body">
        <div class="insight-tag" style="color:${tagCor}">${tagTxt}</div>
        <div class="insight-titulo">${i.titulo}</div>
        <div class="insight-desc">${i.desc}</div>
      </div>
      ${i.btnLabel?`<button class="insight-acao" style="border-color:${borderColor};color:${tagCor}" onclick="event.stopPropagation();${i.acao?'('+acaoFn+')()':'void 0'}">${i.btnLabel}</button>`:''}
    </div>`;
  }).join('');
}

// ── Abrir modal de gasto com categoria pré-selecionada ──────────────
window.abrirModalGastoCategoria = function(categoria) {
  // Abrir modal de novo gasto
  const btnGasto = document.getElementById('btn-novo-gasto') || document.querySelector('[onclick*="abrirModal"]');
  // Simular clique no botão Novo Gasto
  if(typeof abrirModal === 'function') abrirModal('gasto');
  else if(typeof window.abrirModalGasto === 'function') window.abrirModalGasto();
  // Aguardar modal abrir e pré-selecionar categoria
  setTimeout(() => {
    const selCat = document.getElementById('modal-categoria');
    if(selCat) {
      selCat.value = categoria;
      // Disparar evento para picker atualizar
      selCat.dispatchEvent(new Event('change'));
    }
    // Picker visual
    const picker = document.getElementById('modal-categoria-picker');
    if(picker) {
      picker.querySelectorAll('.cat-picker-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.val === categoria);
      });
    }
  }, 150);
};

// ── Ocultar Insights ─────────────────────────────────────────────
window.ocultarInsights = function() {
  const panel = document.getElementById('insights-panel');
  if (panel) {
    panel.style.animation = 'fadeOutUp .25s ease';
    setTimeout(() => { panel.style.display = 'none'; panel.style.animation = ''; }, 240);
  }
};

// ── Sugestão 50-30-20 ────────────────────────────────────────────
function renderSugestaoOrcamento(){
  const el=document.getElementById('sugestao-orcamento');
  if(!el) return;
  // Usar renda do perfil ou estimar pelas entradas do mês atual
  let renda=perfilUsuario?.renda||0;
  if(renda<=0){
    const agora=new Date();
    renda=movimentacoes
      .filter(m=>m.tipo==='ganho'&&m.data&&
        new Date(m.data+'T00:00:00').getMonth()===agora.getMonth()&&
        new Date(m.data+'T00:00:00').getFullYear()===agora.getFullYear())
      .reduce((s,m)=>s+(m.valor||0),0);
  }
  if(renda<=0){el.style.display='none';return;}
  const necessidades=Math.round(renda*0.50);
  const desejos=Math.round(renda*0.30);
  const futuro=Math.round(renda*0.20);
  const agora=new Date();
  const gastosMes=movimentacoes
    .filter(m=>m.tipo==='gasto'&&m.data&&new Date(m.data+'T00:00:00').getMonth()===agora.getMonth()&&new Date(m.data+'T00:00:00').getFullYear()===agora.getFullYear())
    .reduce((s,m)=>s+m.valor,0);
  const pctGasto=Math.min(100,Math.round((gastosMes/(renda*0.80))*100));
  el.style.display='block';
  el.innerHTML=`<div class="orcamento-sugestao">
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

// ── Banner Empresa ───────────────────────────────────────────────
function mostrarBannerEmpresa(){
  const resposta=localStorage.getItem('monvy_banner_empresa_resp');
  const modoEmpresa=localStorage.getItem('monvy_modo_empresa');
  // Não mostra só se já respondeu SIM ou NÃO, ou já usa modo empresa
  if(resposta==='nao'||resposta==='sim'||modoEmpresa) return;
  // X apenas fecha — volta a aparecer toda vez que abrir o app
  setTimeout(()=>{
    const el=document.getElementById('banner-empresa');
    if(el){el.style.display='block';el.style.animation='fadeInDown .4s ease';}
  },2500);
}
window.fecharBannerEmpresa=function(resposta){
  const el=document.getElementById('banner-empresa');
  if(el){
    el.style.animation='fadeOutUp .3s ease';
    setTimeout(()=>{ el.style.display='none'; },280);
  }
  if(resposta==='sim'){
    // Sim → vai para onboarding e nunca mais aparece
    localStorage.setItem('monvy_banner_empresa_resp','sim');
    setTimeout(()=>{ window.location.href='onboarding_empresa.html'; },300);
  } else if(resposta==='nao'){
    // Não → nunca mais aparece
    localStorage.setItem('monvy_banner_empresa_resp','nao');
  }
  // X → não salva nada, banner volta na próxima abertura do app
};

// ── Banner perfil ─────────────────────────────────────────────────
function atualizarBanner(){
  const banner=document.getElementById('banner-rotina-contas'); if(!banner) return;
  const rotina=perfilUsuario?.perfilVida?.rotina||[];
  const nomes={netflix:'Netflix',spotify:'Spotify',youtube:'YouTube Premium',academia:'Academia',internet:'Internet',celular:'Celular',hbo:'Max',prime:'Prime',disney:'Disney+',chatgpt:'ChatGPT Plus',notion:'Notion',canva:'Canva'};
  const gastoFixo=rotina.map(r=>nomes[r]).filter(Boolean);
  if(gastoFixo.length>0){const d=document.getElementById('banner-rotina-desc');if(d)d.textContent=`Detectado: ${gastoFixo.slice(0,3).join(', ')}${gastoFixo.length>3?` e +${gastoFixo.length-3}`:''}`;banner.style.display='flex';}
}

// ── BCB ───────────────────────────────────────────────────────────
async function carregarTaxasBCB(){
  const sEl=document.getElementById('bcb-status-text');const dEl=document.getElementById('bcb-dot');const rEl=document.getElementById('bcb-rates-row');
  try{
    const res=await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json');
    const data=await res.json();
    const selic=parseFloat(data[0]?.valor);
    taxasLive={selic,cdi:selic/12,poupanca:selic<=8.5?selic*0.7:6.17,lci:selic*0.9};
    const sE=document.getElementById('bcb-selic');const cE=document.getElementById('bcb-cdi');const pE=document.getElementById('bcb-poup');const lE=document.getElementById('bcb-lci');
    if(sE)sE.textContent=selic.toFixed(2)+'% a.a.';if(cE)cE.textContent=taxasLive.cdi.toFixed(3)+'% a.m.';
    if(pE)pE.textContent=taxasLive.poupanca.toFixed(2)+'% a.a.';if(lE)lE.textContent=taxasLive.lci.toFixed(2)+'% a.a.';
    if(dEl)dEl.style.background='#22c55e';if(sEl)sEl.textContent='Taxas atualizadas';if(rEl)rEl.style.display='flex';
    const tE=document.getElementById('bcb-update-time');if(tE)tE.textContent=`Atualizado ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
  }catch(e){if(dEl)dEl.style.background='#ef4444';if(sEl)sEl.textContent='Não foi possível buscar as taxas.';taxasLive={selic:13.75,cdi:13.75/12,poupanca:6.17,lci:12.0};}
}

// ── Investimentos ─────────────────────────────────────────────────
window.calcularInvestimentos=function(){
  const ini=parseFloat(document.getElementById('inv-inicial').value)||0;
  const apt=parseFloat(document.getElementById('inv-aporte').value)||0;
  const mes=parseInt(document.getElementById('inv-meses').value)||12;
  if(ini<=0&&apt<=0){alert('Informe um valor inicial ou aporte mensal.');return;}
  const selic=taxasLive.selic||13.75;
  const opcoes=[
    {nome:'Tesouro Selic',taxaAnual:selic*0.99-0.2,ir:true,liquidez:'D+1',risco:'Baixo'},
    {nome:'CDB 100% CDI',taxaAnual:selic,ir:true,liquidez:'No vencimento',risco:'Baixo'},
    {nome:'LCI 90% CDI',taxaAnual:selic*0.9,ir:false,liquidez:'No vencimento',risco:'Baixo'},
    {nome:'LCA 90% CDI',taxaAnual:selic*0.9,ir:false,liquidez:'No vencimento',risco:'Baixo'},
    {nome:'Poupança',taxaAnual:taxasLive.poupanca||6.17,ir:false,liquidez:'Diária',risco:'Baixo'},
    {nome:'CDB 120% CDI',taxaAnual:selic*1.2,ir:true,liquidez:'No vencimento',risco:'Baixo'},
  ];
  function calc(taxaAnual,ir,meses){
    const tm=Math.pow(1+taxaAnual/100,1/12)-1;let tot=ini;
    for(let i=0;i<meses;i++) tot=tot*(1+tm)+apt;
    const totInv=ini+apt*meses;const lucro=tot-totInv;
    if(ir&&lucro>0){let aliq=meses<=6?.225:meses<=12?.20:meses<=24?.175:.15;return tot-lucro*aliq;}
    return tot;
  }
  const totInv=ini+apt*mes;
  const res=opcoes.map(o=>({...o,final:calc(o.taxaAnual,o.ir,mes)})).sort((a,b)=>b.final-a.final);
  const melhor=res[0];
  const sEl=document.getElementById('sim-summary');const tiEl=document.getElementById('sim-total-inv');const mnEl=document.getElementById('sim-melhor-nome');const mgEl=document.getElementById('sim-melhor-ganho');
  if(sEl)sEl.style.display='flex';if(tiEl)tiEl.textContent=fmt(totInv);if(mnEl)mnEl.textContent=melhor.nome;if(mgEl)mgEl.textContent='+'+fmt(melhor.final-totInv);
  const wEl=document.getElementById('sim-ranking-wrap');const lEl=document.getElementById('sim-ranking-list');
  if(wEl)wEl.style.display='block';
  if(lEl) lEl.innerHTML=res.map((o,i)=>`<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);background:${i===0?'rgba(34,197,94,0.06)':''}"><div style="width:32px;height:32px;border-radius:50%;background:${i===0?'var(--primary)':'rgba(255,255,255,0.08)'};display:flex;align-items:center;justify-content:center;font-weight:800;color:${i===0?'#000':'var(--text)'};font-size:.9rem;flex-shrink:0">${i+1}</div><div style="flex:1"><div style="font-weight:700">${o.nome}</div><div style="font-size:.75rem;color:var(--gray)">${o.taxaAnual.toFixed(2)}% a.a. · ${o.liquidez} · ${o.ir?'c/ IR':'Isento de IR'}</div></div><div style="text-align:right"><div style="font-weight:800;color:${i===0?'#22c55e':'var(--text)'}">${fmt(o.final)}</div><div style="font-size:.75rem;color:#22c55e">+${fmt(o.final-totInv)}</div></div></div>`).join('');
};
window.abrirModalSimulacao=function(){document.getElementById('modal-simulacao')?.classList.remove('hidden');};
window.fecharModalSimulacao=function(){document.getElementById('modal-simulacao')?.classList.add('hidden');};

// ── Bolsa ─────────────────────────────────────────────────────────
const TICKERS_ACOES=['PETR4','VALE3','ITUB4','BBDC4','B3SA3','ABEV3','WEGE3','RENT3','SUZB3','LREN3'];
const TICKERS_FIIS=['MXRF11','HGLG11','KNRI11','XPML11','VISC11','BTLG11'];
const TICKERS_BDRS=['AAPL34','MSFT34','AMZO34','GOGL34','TSLA34'];
async function carregarBolsa(){
  const lE=document.getElementById('bolsa-loading');const eE=document.getElementById('bolsa-erro');const liE=document.getElementById('bolsa-lista');
  if(!liE) return;
  if(lE)lE.style.display='block';if(liE)liE.style.display='none';if(eE)eE.style.display='none';
  const todos=[...TICKERS_ACOES,...TICKERS_FIIS,...TICKERS_BDRS];
  try{
    const res=await fetch(`https://brapi.dev/api/quote/${todos.join(',')}?range=1d&interval=1d&fundamental=false`);
    const data=await res.json();
    bolsaDados=(data.results||[]).map(t=>({symbol:t.symbol,name:t.longName||t.shortName||t.symbol,price:t.regularMarketPrice,change:t.regularMarketChangePercent,tipo:TICKERS_FIIS.includes(t.symbol)?'fiis':TICKERS_BDRS.includes(t.symbol)?'bdrs':'acoes'}));
    if(lE)lE.style.display='none';renderizarBolsa();
  }catch(e){if(lE)lE.style.display='none';if(eE){eE.style.display='block';eE.textContent='Não foi possível carregar os dados da bolsa.';}}
}
window.filtrarBolsa=function(filtro){
  bolsaFiltroAtual=filtro;bolsaMostrados=10;
  document.querySelectorAll('[id^="bolsa-filtro-"]').forEach(b=>{b.style.background='transparent';b.style.color='var(--gray)';b.style.borderColor='var(--border)';});
  const btn=document.getElementById(`bolsa-filtro-${filtro}`);if(btn){btn.style.background='var(--primary)';btn.style.color='#000';btn.style.borderColor='var(--primary)';}
  renderizarBolsa();
};
function renderizarBolsa(){
  const liE=document.getElementById('bolsa-lista');const mE=document.getElementById('bolsa-carregar-mais');
  if(!liE) return;
  const filtrados=bolsaFiltroAtual==='todos'?bolsaDados:bolsaDados.filter(t=>t.tipo===bolsaFiltroAtual);
  const vis=filtrados.slice(0,bolsaMostrados);
  liE.style.display='block';
  liE.innerHTML=vis.map((t,i)=>{const cor=(t.change||0)>=0?'#22c55e':'#ef4444';const sin=(t.change||0)>=0?'+':'';return `<div onclick="abrirModalAtivo('${t.symbol}')" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:${i<vis.length-1?'1px solid var(--border)':'none'};cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background=''"><div><div style="font-weight:800;font-size:.95rem">${t.symbol}</div><div style="font-size:.72rem;color:var(--gray);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</div></div><div style="text-align:right"><div style="font-weight:700">R$ ${(t.price||0).toFixed(2).replace('.',',')}</div><div style="font-size:.82rem;font-weight:700;color:${cor}">${sin}${(t.change||0).toFixed(2).replace('.',',')}%</div></div></div>`;}).join('');
  if(mE)mE.style.display=filtrados.length>bolsaMostrados?'block':'none';
}
window.bolsaMostrarMais=function(){bolsaMostrados+=10;renderizarBolsa();};
window.buscarAtivo=async function(ticker){
  const t=(ticker||'').toUpperCase().trim(); if(!t) return;
  const lE=document.getElementById('b3-loading');const eE=document.getElementById('b3-erro');const rE=document.getElementById('b3-resultado');
  if(lE)lE.style.display='block';if(eE)eE.style.display='none';if(rE)rE.style.display='none';
  try{
    const res=await fetch(`https://brapi.dev/api/quote/${t}`);const data=await res.json();const q=data.results?.[0];
    if(!q)throw new Error('Não encontrado');
    if(lE)lE.style.display='none';
    if(rE){const cor=(q.regularMarketChangePercent||0)>=0?'#22c55e':'#ef4444';rE.style.display='block';rE.innerHTML=`<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:16px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:1.2rem;font-weight:800">${q.symbol}</div><div style="font-size:.8rem;color:var(--gray)">${q.longName||q.shortName||''}</div></div><div style="text-align:right"><div style="font-size:1.4rem;font-weight:800">R$ ${(q.regularMarketPrice||0).toFixed(2).replace('.',',')}</div><div style="color:${cor};font-weight:700">${(q.regularMarketChangePercent||0)>=0?'+':''}${(q.regularMarketChangePercent||0).toFixed(2)}%</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;text-align:center"><div><div style="font-size:.7rem;color:var(--gray)">Abertura</div><div style="font-weight:700">R$ ${(q.regularMarketOpen||0).toFixed(2).replace('.',',')}</div></div><div><div style="font-size:.7rem;color:var(--gray)">Mínimo</div><div style="font-weight:700">R$ ${(q.regularMarketDayLow||0).toFixed(2).replace('.',',')}</div></div><div><div style="font-size:.7rem;color:var(--gray)">Máximo</div><div style="font-weight:700">R$ ${(q.regularMarketDayHigh||0).toFixed(2).replace('.',',')}</div></div></div></div>`;}
  }catch(e){if(lE)lE.style.display='none';if(eE){eE.style.display='block';eE.textContent=`Ativo "${t}" não encontrado.`;}}
};
window.abrirModalAtivo=function(symbol){
  const modal=document.getElementById('modal-ativo'); if(!modal) return;
  const d=bolsaDados.find(t=>t.symbol===symbol); if(!d) return;
  modal.classList.remove('hidden');
  const mS=document.getElementById('ma-symbol');const mN=document.getElementById('ma-name');const mP=document.getElementById('ma-preco');const mV=document.getElementById('ma-variacao');
  if(mS)mS.textContent=d.symbol;if(mN)mN.textContent=d.name;
  if(mP)mP.textContent=`R$ ${(d.price||0).toFixed(2).replace('.',',')}`;
  if(mV){const cor=(d.change||0)>=0?'#22c55e':'#ef4444';mV.textContent=`${(d.change||0)>=0?'+':''}${(d.change||0).toFixed(2)}%`;mV.style.color=cor;}
  const gL=document.getElementById('ma-grafico-loading');const gC=document.getElementById('ma-canvas');
  if(gL)gL.style.display='none';if(gC)gC.style.display='none';
};
window.fecharModalAtivo=function(){document.getElementById('modal-ativo')?.classList.add('hidden');};
window.trocarPeriodoAtivo=function(){};

// ── Artigos ───────────────────────────────────────────────────────
const artigos=[
  {titulo:'Reserva de emergência',conteudo:'<h2>🛡️ Reserva de emergência</h2><p>Dinheiro guardado para imprevistos. O ideal é ter de 3 a 6 meses dos seus gastos mensais.</p><p><strong>Onde guardar?</strong> Tesouro Selic, CDB com liquidez diária ou conta remunerada.</p><p>Sem reserva, qualquer imprevisto vira dívida.</p>'},
  {titulo:'Cartão de crédito',conteudo:'<h2>💳 Cartão de crédito</h2><p>O rotativo cobra mais de 400% ao ano. Sempre pague a fatura total. O limite não é dinheiro seu.</p>'},
  {titulo:'Sair das dívidas',conteudo:'<h2>🔓 Sair das dívidas</h2><p><strong>Avalanche:</strong> Quite as dívidas de maior juros primeiro. <strong>Bola de neve:</strong> Quite as menores primeiro para ganhar motivação. Negocie — credores aceitam descontos de até 70%.</p>'},
  {titulo:'Necessidade vs Desejo',conteudo:'<h2>🧠 Necessidade vs Desejo</h2><p>Necessidade: o que você precisa para viver. Desejo: o que quer, mas pode viver sem. Antes de comprar, espere 24 horas.</p>'},
  {titulo:'Regra dos 50-30-20',conteudo:'<h2>📊 Regra dos 50-30-20</h2><ul><li><strong>50%</strong> — Necessidades</li><li><strong>30%</strong> — Desejos</li><li><strong>20%</strong> — Poupança e investimentos</li></ul>'},
  {titulo:'Como começar a investir',conteudo:'<h2>📈 Como começar a investir</h2><p>1. Construa reserva de emergência. 2. Quite dívidas caras. 3. Comece pelo Tesouro Direto ou CDB. 4. Invista todo mês, mesmo que pouco.</p>'}
];
window.abrirArtigo=function(idx){const a=artigos[idx];if(!a)return;document.getElementById('artigo-conteudo').innerHTML=a.conteudo;document.getElementById('modal-artigo').classList.remove('hidden');};
window.fecharArtigo=function(){document.getElementById('modal-artigo').classList.add('hidden');};

// ── Perfil vida ───────────────────────────────────────────────────
window.selecionarVida=function(el,categoria,valor){
  const c=el.closest('[id]')||el.parentElement;
  c.querySelectorAll('.vida-opt:not(.multi)').forEach(o=>o.classList.remove('selected'));
  el.classList.toggle('selected');
  _inicializarRascunho();
  window._perfilVidaTemp[categoria]=valor;
};
window.selecionarVidaMulti=function(el,categoria,valor){
  el.classList.toggle('selected');
  _inicializarRascunho();
  if(!window._perfilVidaTemp[categoria]) window._perfilVidaTemp[categoria]=[];
  const arr=window._perfilVidaTemp[categoria];const idx=arr.indexOf(valor);
  if(idx>=0)arr.splice(idx,1);else arr.push(valor);
};
window.adicionarCustomVida=function(tipo,inputEl){
  const val=inputEl.value.trim(); if(!val) return;
  _inicializarRascunho();
  if(!window._perfilVidaTemp.rotina) window._perfilVidaTemp.rotina=[];
  // Evitar duplicatas
  if(window._perfilVidaTemp.rotina.includes(val)) { inputEl.value=''; return; }
  window._perfilVidaTemp.rotina.push(val);
  const tE=document.getElementById(`idx-custom-${tipo}-tags`);
  if(tE) tE.innerHTML+=`<span style="background:rgba(0,200,83,0.15);border:1px solid rgba(0,200,83,0.3);border-radius:20px;padding:3px 10px;font-size:.75rem;color:var(--primary);cursor:pointer" onclick="removerCustomVida('${val}',this,'${tipo}')">${val} ×</span>`;
  inputEl.value='';
};

window.removerCustomVida=function(val,tagEl,tipo){
  _inicializarRascunho();
  if(window._perfilVidaTemp.rotina){
    const idx=window._perfilVidaTemp.rotina.indexOf(val);
    if(idx>=0) window._perfilVidaTemp.rotina.splice(idx,1);
  }
  tagEl.remove();
};
window.salvarPerfilVida=async function(){
  // Garantir que o rascunho existe
  const perfil = JSON.parse(JSON.stringify(window._perfilVidaTemp || perfilUsuario?.perfilVida || {}));

  // 1. Salvar no localStorage imediatamente (nunca falha)
  try { localStorage.setItem('monvy_perfil_vida', JSON.stringify(perfil)); } catch(e){}

  // 2. Atualizar cache em memória
  if(!perfilUsuario) perfilUsuario = {};
  perfilUsuario.perfilVida = perfil;
  window._perfilVidaTemp = JSON.parse(JSON.stringify(perfil));

  // 3. Atualizar UI imediatamente (não espera Firebase)
  const sE=document.getElementById('vida-sucesso');if(sE){sE.style.display='block';setTimeout(()=>sE.style.display='none',2000);}
  showToast('✓ Perfil salvo!','success');
  atualizarTelaCategorias();
  renderizarTabela();
  popularSelectCategorias('gasto');
  gerarInsights();
  atualizarBanner();

  // 4. Salvar no Firebase em background (não bloqueia UI)
  if(uidAtual){
    fbSalvarPerfilVida(uidAtual, perfil).catch(e => {
      console.warn('Firebase sync falhou (dados salvos localmente):', e);
    });
  }
};
window.setMetaEco=function(el,pct){
  document.querySelectorAll('#meta-eco-opts .vida-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  if(!window._perfilFinTemp) window._perfilFinTemp={};
  window._perfilFinTemp.metaEconomia=pct;
};
window.salvarPerfilFinancas=async function(){
  if(!uidAtual) return;
  const renda=parseFloat(document.getElementById('perfil-renda').value)||0;
  const extras=window._perfilFinTemp||{};
  try{
    await fbSalvarPerfil(uidAtual,{renda,...extras});perfilUsuario.renda=renda;window._perfilFinTemp=null;
    const sE=document.getElementById('financas-sucesso');if(sE){sE.style.display='block';setTimeout(()=>sE.style.display='none',2000);}
    if(window.mostrarToastPerfil) window.mostrarToastPerfil('Salvo com sucesso!');
  }catch(e){
    console.error('Erro ao salvar perfil vida:', e);
    showToast('❌ Erro: ' + (e.message||e.code||'Tente novamente'), 'error');
  }
};
window.abrirTabPerfil=function(tab){
  ['conta','vida','financas'].forEach(t=>{
    const tb=document.getElementById(`tab-${t}`);const te=document.getElementById(`perfil-tab-${t}`);
    if(tb)tb.classList.toggle('active',t===tab);if(te)te.style.display=t===tab?'block':'none';
  });
  if(tab==='financas'){const rE=document.getElementById('perfil-renda');if(rE&&perfilUsuario?.renda)rE.value=perfilUsuario.renda;}
};

// Inicializar
renderizarRelatorio();
