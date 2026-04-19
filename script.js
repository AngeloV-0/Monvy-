// ==============================
// MONVY — LÓGICA COMPLETA
// ==============================

let saldo = 0, totalEntradas = 0, totalSaidas = 0;
let movimentacoes = [], metas = [];
let tipoAtual = '', metaAtualIndex = -1, respostaPergunta = '';
let editandoIndex = -1, filtroAtual = 'mes', relatorioMesOffset = 0;

const pageTitles = { inicio:'Dashboard', gastos:'Gastos', metas:'Metas', dividas:'Simulador de Dívidas', investimentos:'Investimentos', aprender:'Aprender', relatorio:'Relatório Mensal' };
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// NAVEGAÇÃO
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', function(e) { e.preventDefault(); irPara(this.dataset.tela); });
});

function irPara(tela) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[data-tela="'+tela+'"]').forEach(el => el.classList.add('active'));
  const telaEl = document.getElementById('tela-'+tela);
  if (telaEl) telaEl.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[tela] || 'Monvy';
  if (tela === 'gastos') atualizarTelaCategorias();
  if (tela === 'relatorio') atualizarRelatorio();
}

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
function atualizarChart() {
  const canvas = document.getElementById('chart-fluxo');
  const emptyEl = document.getElementById('chart-empty');
  if (!canvas) return;
  if (movimentacoes.length === 0) { canvas.style.display='none'; emptyEl.style.display='flex'; return; }
  canvas.style.display='block'; emptyEl.style.display='none';
  const ultimas = movimentacoes.slice(-8);
  const labels = ultimas.map((m,i) => '#'+(movimentacoes.indexOf(m)+1));
  if (chartInstance) chartInstance.destroy();
  const ctx = canvas.getContext('2d');
  const gG = ctx.createLinearGradient(0,0,0,180); gG.addColorStop(0,'rgba(34,197,94,0.3)'); gG.addColorStop(1,'rgba(34,197,94,0)');
  const gR = ctx.createLinearGradient(0,0,0,180); gR.addColorStop(0,'rgba(239,68,68,0.25)'); gR.addColorStop(1,'rgba(239,68,68,0)');
  chartInstance = new Chart(ctx, { type:'line', data:{ labels, datasets:[
    { label:'Entradas', data:ultimas.map(m=>m.tipo==='ganho'?m.valor:0), borderColor:'#22C55E', backgroundColor:gG, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#22C55E', pointRadius:4 },
    { label:'Saídas', data:ultimas.map(m=>m.tipo==='gasto'?m.valor:0), borderColor:'#EF4444', backgroundColor:gR, borderWidth:2, tension:0.4, fill:true, pointBackgroundColor:'#EF4444', pointRadius:4 }
  ]}, options:{ responsive:true, maintainAspectRatio:true, interaction:{intersect:false,mode:'index'},
    plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#1A2235',borderColor:'rgba(255,255,255,0.08)',borderWidth:1,titleColor:'#94A3B8',bodyColor:'#fff',padding:10, callbacks:{label:c=>' '+c.dataset.label+': R$ '+c.raw.toFixed(2).replace('.',',')}}},
    scales:{ x:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748B',font:{size:11}}}, y:{grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#64748B',font:{size:11},callback:v=>'R$'+v.toFixed(0)}} }
  }});
}

// CHART PIZZA
let chartPizza = null;
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
  chartPizza = new Chart(canvas.getContext('2d'), { type:'doughnut', data:{ labels, datasets:[{data, backgroundColor:cores.slice(0,labels.length), borderWidth:0, hoverOffset:6}]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.raw)+' ('+((c.raw/total)*100).toFixed(0)+'%)'}}}, cutout:'60%' }
  });
  if (legendaEl) {
    legendaEl.innerHTML = labels.map((l,i)=>`<div class="pizza-leg-item"><span style="width:10px;height:10px;border-radius:50%;background:${cores[i]};flex-shrink:0;display:inline-block"></span><span style="font-size:.78rem;color:var(--gray)">${l}</span><span style="font-size:.78rem;font-weight:600;color:var(--white);margin-left:auto">${((data[i]/total)*100).toFixed(0)}%</span></div>`).join('');
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
  lista.innerHTML = [...movimentacoes].reverse().slice(0,8).map(m=>`
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

function confirmarModal() {
  const valor = parseFloat(document.getElementById('modal-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  if (tipoAtual==='gasto'&&respostaPergunta==='') { document.getElementById('modal-pergunta').classList.remove('hidden'); document.getElementById('btn-confirmar').classList.add('hidden'); return; }
  registrar(valor, document.getElementById('modal-descricao').value||(tipoAtual==='ganho'?'Entrada':'Saída'), document.getElementById('modal-categoria').value, document.getElementById('modal-data').value||hojeISO(), document.getElementById('modal-recorrente').checked);
  fecharModal();
}

function responderPergunta(resposta) {
  respostaPergunta = resposta;
  const valor = parseFloat(document.getElementById('modal-valor').value);
  if (resposta==='desejo') { if (!confirm('🛍️ Isso é um desejo!\n\nVocê tem certeza que quer gastar?\n\nPense bem antes de confirmar 💭')) { fecharModal(); return; } }
  registrar(valor, document.getElementById('modal-descricao').value||'Saída', document.getElementById('modal-categoria').value, document.getElementById('modal-data').value||hojeISO(), document.getElementById('modal-recorrente').checked);
  fecharModal();
}

function registrar(valor, descricao, categoria, data, recorrente) {
  movimentacoes.push({ tipo:tipoAtual, valor, descricao, categoria, data:data||hojeISO(), recorrente:!!recorrente, resposta:respostaPergunta });
  recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart();
}

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

function salvarEdicao() {
  const valor = parseFloat(document.getElementById('edit-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  const m = movimentacoes[editandoIndex];
  m.valor=valor; m.descricao=document.getElementById('edit-descricao').value||(m.tipo==='ganho'?'Entrada':'Saída');
  m.data=document.getElementById('edit-data').value||hojeISO();
  if (m.tipo==='gasto') m.categoria=document.getElementById('edit-categoria').value;
  recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart(); atualizarTelaCategorias(); fecharModalEditar();
}

function excluirMovimentacao() {
  if (!confirm('Excluir esta movimentação?')) return;
  movimentacoes.splice(editandoIndex,1);
  recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart(); atualizarTelaCategorias(); fecharModalEditar();
}

// GASTOS
function atualizarTelaCategorias() {
  const lista = movsFiltradas();
  const cats = {Casa:0,'Alimentação':0,Transporte:0,Lazer:0,'Saúde':0,Outros:0};
  lista.filter(m=>m.tipo==='gasto').forEach(m=>{ if(cats[m.categoria]!==undefined) cats[m.categoria]+=m.valor; });
  document.getElementById('cat-casa').textContent=fmt(cats['Casa']);
  document.getElementById('cat-alimentacao').textContent=fmt(cats['Alimentação']);
  document.getElementById('cat-transporte').textContent=fmt(cats['Transporte']);
  document.getElementById('cat-lazer').textContent=fmt(cats['Lazer']);
  document.getElementById('cat-saude').textContent=fmt(cats['Saúde']);
  document.getElementById('cat-outros').textContent=fmt(cats['Outros']);
  atualizarChartPizza(cats);
  const tbody=document.getElementById('tabela-gastos');
  const count=document.getElementById('table-count');
  count.textContent=lista.length+' registros';
  if (lista.length===0) { tbody.innerHTML='<tr><td colspan="6" class="vazio">Nenhuma movimentação no período.</td></tr>'; return; }
  tbody.innerHTML=[...lista].sort((a,b)=>(b.data||'').localeCompare(a.data||'')).map(m=>{
    const idx=movimentacoes.indexOf(m);
    return `<tr>
      <td>${m.descricao}${m.recorrente?' <span style="font-size:.7rem;background:rgba(57,255,121,0.15);color:var(--primary);padding:1px 6px;border-radius:4px">recorrente</span>':''}</td>
      <td style="color:var(--gray);font-size:.82rem">${m.data?fmtData(m.data):'—'}</td>
      <td>${m.tipo==='ganho'?'—':m.categoria}</td>
      <td><span class="badge ${m.tipo}">${m.tipo==='ganho'?'↑ Entrada':'↓ Saída'}</span></td>
      <td class="mov-valor ${m.tipo==='ganho'?'positivo':'negativo'}">${m.tipo==='ganho'?'+':'-'}${fmt(m.valor)}</td>
      <td><button onclick="abrirModalEditar(${idx})" style="background:none;border:none;cursor:pointer;color:var(--gray);padding:4px;border-radius:6px;font-size:.85rem" title="Editar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>
    </tr>`;
  }).join('');
}

// METAS
function criarMeta() {
  const nome=document.getElementById('meta-nome').value.trim(), valor=parseFloat(document.getElementById('meta-valor').value);
  if (!nome||!valor||valor<=0) { alert('Preencha nome e valor!'); return; }
  metas.push({nome,objetivo:valor,atual:0});
  document.getElementById('meta-nome').value=''; document.getElementById('meta-valor').value='';
  renderizarMetas();
}

function renderizarMetas() {
  const lista=document.getElementById('lista-metas');
  if (metas.length===0) { lista.innerHTML='<div class="vazio">Nenhuma meta ainda.</div>'; return; }
  lista.innerHTML=metas.map((m,i)=>{
    const pct=Math.min(100,Math.round((m.atual/m.objetivo)*100));
    return `<div class="meta-card"><div class="meta-topo"><span class="meta-nome">${m.nome}</span><span class="meta-valores">${fmt(m.atual)} / ${fmt(m.objetivo)}</span></div><div class="meta-barra-bg"><div class="meta-barra-fill" style="width:${pct}%"></div></div><div class="meta-rodape"><span class="meta-pct">${pct}% concluído</span><button class="btn-meta" onclick="abrirModalMeta(${i})">+ Adicionar</button></div></div>`;
  }).join('');
}

function abrirModalMeta(index) {
  metaAtualIndex=index;
  document.getElementById('modal-meta-nome-display').textContent=metas[index].nome;
  document.getElementById('modal-meta-valor').value='';
  document.getElementById('modal-meta').classList.remove('hidden');
}

function fecharModalMeta() { document.getElementById('modal-meta').classList.add('hidden'); }

function adicionarMeta() {
  const valor=parseFloat(document.getElementById('modal-meta-valor').value);
  if (!valor||valor<=0) { alert('Digite um valor válido!'); return; }
  metas[metaAtualIndex].atual+=valor; fecharModalMeta(); renderizarMetas();
}

// DÍVIDAS
function calcularDivida() {
  const valor=parseFloat(document.getElementById('div-valor').value), juros=parseFloat(document.getElementById('div-juros').value)/100, parcelas=parseInt(document.getElementById('div-parcelas').value);
  if (!valor||!juros||!parcelas) { alert('Preencha todos os campos!'); return; }
  const parcela=valor*(juros*Math.pow(1+juros,parcelas))/(Math.pow(1+juros,parcelas)-1), total=parcela*parcelas, jurosTotal=total-valor, pct=((jurosTotal/valor)*100).toFixed(0);
  document.getElementById('div-original').textContent=fmt(valor); document.getElementById('div-juros-total').textContent=fmt(jurosTotal);
  document.getElementById('div-total').textContent=fmt(total); document.getElementById('div-parcela').textContent=fmt(parcela)+'/mês';
  document.getElementById('div-alerta').textContent='Você vai pagar '+pct+'% a mais do valor original! Em '+parcelas+' meses, '+fmt(jurosTotal)+' vai direto para o banco.';
  document.getElementById('resultado-divida').classList.remove('hidden');
}

// INVESTIMENTOS
function calcularInvestimentos() {
  const valor=parseFloat(document.getElementById('inv-valor').value), meses=parseInt(document.getElementById('inv-meses').value);
  if (!valor||!meses) { alert('Preencha todos os campos!'); return; }
  const calc=t=>valor*Math.pow(1+t,meses), tp=calc(0.005), ts=calc(0.009), tc=calc(0.01);
  document.getElementById('inv-poupanca').textContent=fmt(tp); document.getElementById('inv-poupanca-ganho').textContent='+'+fmt(tp-valor)+' de rendimento';
  document.getElementById('inv-selic').textContent=fmt(ts); document.getElementById('inv-selic-ganho').textContent='+'+fmt(ts-valor)+' de rendimento';
  document.getElementById('inv-cdb').textContent=fmt(tc); document.getElementById('inv-cdb-ganho').textContent='+'+fmt(tc-valor)+' de rendimento';
  document.getElementById('resultado-inv').classList.remove('hidden');
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

function atualizarRelatorio() {
  const agora = new Date(), alvo = new Date(agora.getFullYear(), agora.getMonth() + relatorioMesOffset, 1);
  document.getElementById('relatorio-mes-label').textContent = MESES[alvo.getMonth()] + ' ' + alvo.getFullYear();

  const { movs: doMes, alvo: alvoReal } = getMovimentacoesPeriodo();

  // Label período custom
  const labelEl = document.getElementById('periodo-custom-label');
  if (labelEl && periodoModo === 'custom' && periodoCustomInicio && periodoCustomFim) {
    const ini = periodoCustomInicio.split('-').reverse().join('/');
    const fim = periodoCustomFim.split('-').reverse().join('/');
    labelEl.textContent = ini === fim ? 'Dia ' + ini : 'De ' + ini + ' até ' + fim;
  } else if (labelEl) {
    labelEl.textContent = '';
  }

  const entradas = doMes.filter(m => m.tipo === 'ganho').reduce((a, m) => a + m.valor, 0);
  const saidas = doMes.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.valor, 0);
  const saldoMes = entradas - saidas;
  document.getElementById('rel-entradas').textContent = fmt(entradas);
  document.getElementById('rel-saidas').textContent = fmt(saidas);
  const saldoEl = document.getElementById('rel-saldo');
  saldoEl.textContent = fmt(saldoMes);
  saldoEl.className = 'kpi-value ' + (saldoMes >= 0 ? 'green' : 'red');
  document.getElementById('rel-total').textContent = doMes.length;

  const topEl = document.getElementById('relatorio-top-gastos');
  const gastosMes = doMes.filter(m => m.tipo === 'gasto').sort((a, b) => b.valor - a.valor).slice(0, 5);
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
  if (pendentes.length===0) { alert('Todos os recorrentes já foram lançados neste mês! ✅'); return; }
  if (!confirm('Lançar '+pendentes.length+' recorrente(s) para '+MESES[agora.getMonth()]+'?')) return;
  pendentes.forEach(m=>{ tipoAtual=m.tipo; movimentacoes.push({...m,data:hojeISO(),resposta:''}); });
  recalcularTotais(); atualizarKPIs(); atualizarListaInicio(); atualizarChart(); atualizarRelatorio();
  alert('✅ '+pendentes.length+' lançamento(s) adicionado(s)!');
}

// ARTIGOS
const artigos=[
  {titulo:'🛡️ Reserva de emergência',conteudo:`<h2>🛡️ O que é reserva de emergência?</h2><p>Reserva de emergência é um dinheiro guardado exclusivamente para imprevistos: perder o emprego, um problema de saúde, um conserto urgente.</p><p><strong>Quanto guardar?</strong> O ideal é ter de 3 a 6 meses dos seus gastos mensais guardados.</p><p><strong>Onde guardar?</strong></p><ul><li>Tesouro Selic (recomendado)</li><li>CDB com liquidez diária</li><li>Conta remunerada</li></ul>`},
  {titulo:'💳 Cartão de crédito',conteudo:`<h2>💳 Por que evitar o cartão de crédito?</h2><p>O cartão de crédito não é dinheiro extra. É dinheiro adiantado que você vai ter que devolver.</p><p><strong>O perigo do rotativo:</strong> Juros de 15% a 20% ao mês.</p><p><strong>Regra de ouro:</strong> Se você precisa parcelar, provavelmente não pode comprar.</p>`},
  {titulo:'🔓 Sair das dívidas',conteudo:`<h2>🔓 Como sair das dívidas?</h2><p><strong>Passo 1:</strong> Liste todas as suas dívidas.</p><p><strong>Passo 2:</strong> Priorize as com maior juros.</p><p><strong>Passo 3:</strong> Negocie desconto para quitar à vista.</p><p><strong>Passo 4:</strong> Corte gastos desnecessários.</p>`},
  {titulo:'🧠 Necessidade vs Desejo',conteudo:`<h2>🧠 Necessidade vs Desejo</h2><p><strong>Necessidade</strong> é o que você precisa para viver: alimentação, moradia, saúde, transporte.</p><p><strong>Desejo</strong> é o que você quer: roupas de marca, restaurante caro, o celular mais novo.</p><p><strong>A regra das 24 horas:</strong> Esperou um dia e ainda quer? Talvez valha.</p>`},
  {titulo:'📊 Regra 50-30-20',conteudo:`<h2>📊 Regra dos 50-30-20</h2><p><strong>50%</strong> — Necessidades: Aluguel, mercado, contas, transporte.</p><p><strong>30%</strong> — Desejos: Lazer, roupas, restaurante, streaming.</p><p><strong>20%</strong> — Futuro: Reserva de emergência, investimentos.</p>`},
  {titulo:'🌱 Como começar a investir',conteudo:`<h2>🌱 Como começar a investir?</h2><p>Você não precisa ser rico para investir. Pode começar com R$ 30.</p><p><strong>Antes de investir:</strong> Quite suas dívidas de alto juros e monte sua reserva primeiro.</p><p><strong>O segredo:</strong> Consistência. Investir R$ 100 por mês todo mês é melhor que R$ 1.200 uma vez por ano.</p>`}
];

function abrirArtigo(index) { document.getElementById('artigo-conteudo').innerHTML=artigos[index].conteudo; document.getElementById('modal-artigo').classList.remove('hidden'); }
function fecharArtigo() { document.getElementById('modal-artigo').classList.add('hidden'); }

// FECHAR FORA
['modal','modal-artigo','modal-meta','modal-editar'].forEach(id=>{ const el=document.getElementById(id); if(el)el.addEventListener('click',function(e){if(e.target===this)this.classList.add('hidden');}); });

// AUTH & TEMA
function logout() { if(confirm('Deseja sair da sua conta?')){localStorage.removeItem('monvy_logado');localStorage.removeItem('monvy_logged');window.location.href='auth.html';} }

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
  fecharDropdownBusca();
}

document.addEventListener('click', function(e) {
  const center = document.querySelector('.topbar-center');
  if (center && !center.contains(e.target)) fecharDropdownBusca();
});

// INIT
(function init(){
  applyTheme(localStorage.getItem('monvy_theme')||'dark');
  const raw=localStorage.getItem('monvy_logado')||localStorage.getItem('monvy_logged');
  if(!raw){window.location.href='auth.html';return;}
  let user; try{user=JSON.parse(raw);}catch(e){window.location.href='auth.html';return;}
  const nome=user.nome||user.name||'';
  const avatarEl=document.getElementById('user-avatar');
  const fotoSalva=localStorage.getItem('monvy_avatar_foto');
  if(avatarEl){
    if(fotoSalva)avatarEl.innerHTML='<img src="'+fotoSalva+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    else if(nome)avatarEl.textContent=nome.charAt(0).toUpperCase();
    avatarEl.title=nome;
  }
  const greetEl=document.getElementById('topbar-greeting');
  if(greetEl&&nome)greetEl.textContent='Olá, '+nome.split(' ')[0];
  const dataInput=document.getElementById('modal-data');
  if(dataInput)dataInput.value=hojeISO();
})();

const script=document.createElement('script');
script.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
script.onload=()=>atualizarChart();
document.head.appendChild(script);
