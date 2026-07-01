// metas.js - Sistema completo de Metas Profissionais
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    getDoc,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

//CONFIGURAÇÕES DE DADOS
const firebaseConfig = {
  apiKey: "AIzaSyDytXqhW1JKVoUu_mmfgdk7pcwSKi8Htgw",
  authDomain: "alpha-barbershop.firebaseapp.com",
  projectId: "alpha-barbershop",
  storageBucket: "alpha-barbershop.firebasestorage.app",
  messagingSenderId: "266404296878",
  appId: "1:266404296878:web:2a6a872a846226e919153f",
  measurementId: "G-4DS4J1WGCS"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Estado global
let profissionais = [];
let equipes = [];
let metas = [];
let agendamentos = [];
let historicoMetas = [];
let usuarioAutenticado = false;
let usuarioId = null;

// Estado dos filtros
let currentNivelMeta = "empresa";
let currentEquipeFilter = "";
let currentProfissionalFilter = "";
let currentPeriodoMeta = "todas";
let currentOrdenacao = "percentual_desc";
let currentSearchTable = "";
let dataInicioMeta = null;
let dataFimMeta = null;

// Meta sendo editada/excluída
let metaEditando = null;
let metaParaExcluir = null;

// Gráficos
let metasChart = null;
let atingimentoChart = null;

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function formatarPercentual(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(valor / 100);
}

function mostrarToast(msg, tipo = "sucesso") {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        toast.innerHTML = '<i class="fa-solid fa-circle-check"></i><span id="toastMsg"></span>';
        document.body.appendChild(toast);
    }
    const toastMsg = document.getElementById("toastMsg");
    if (toastMsg) toastMsg.textContent = msg;
    toast.style.background = tipo === "sucesso" ? "linear-gradient(135deg, #2199EF, #1a7fcc)" : "linear-gradient(135deg, #ef4444, #dc2626)";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function converterParaDate(data) {
    if (!data) return null;
    if (data.toDate && typeof data.toDate === 'function') return data.toDate();
    if (data.seconds !== undefined) return new Date(data.seconds * 1000);
    if (typeof data === 'string') return new Date(data);
    return null;
}

function getPeriodoDatas() {
    const hoje = new Date();
    let inicio = null, fim = null;
    
    switch(currentPeriodoMeta) {
        case "mes_atual":
            inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        case "mes_anterior":
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
            break;
        case "trimestre":
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        case "semestre":
            inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
            fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        case "ano":
            inicio = new Date(hoje.getFullYear(), 0, 1);
            fim = new Date(hoje.getFullYear(), 11, 31);
            break;
        case "personalizado":
            if (dataInicioMeta && dataFimMeta) {
                inicio = new Date(dataInicioMeta);
                fim = new Date(dataFimMeta);
            }
            break;
        case "todas":
        default:
            return { inicio: null, fim: null };
    }
    
    if (inicio) inicio.setHours(0, 0, 0, 0);
    if (fim) fim.setHours(23, 59, 59, 999);
    
    return { inicio, fim };
}

async function carregarDados() {
    const container = document.getElementById("metasCardsGrid");
    
    try {
        // Verificar autenticação
        const user = auth.currentUser;
        if (!user) {
            console.log("⏳ Usuário não autenticado, redirecionando para login...");
            window.location.href = 'login.html';
            return;
        }
        
        usuarioAutenticado = true;
        usuarioId = user.uid;
        console.log("✅ Usuário autenticado:", user.email);
        
        if (container) {
            container.innerHTML = `<div class="loading-metas"><i class="fa-solid fa-spinner fa-spin"></i> Carregando dados...</div>`;
        }
        
        // Carregar profissionais
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionais = profissionaisSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`✅ Profissionais: ${profissionais.length}`);
        
        // Carregar equipes
        const equipesSnap = await getDocs(collection(db, "equipes"));
        equipes = equipesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`✅ Equipes: ${equipes.length}`);
        
        // Carregar metas
        const metasSnap = await getDocs(collection(db, "metas"));
        metas = metasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log(`✅ Metas: ${metas.length}`);
        
        // Carregar agendamentos confirmados/finalizados
        const agendamentosSnap = await getDocs(collection(db, "agendamentos"));
        agendamentos = [];
        agendamentosSnap.forEach(doc => {
            const data = doc.data();
            if ((data.status === 'confirmado' || data.status === 'finalizado' || data.status === 'concluido') && data.valor && data.valor > 0) {
                agendamentos.push({ id: doc.id, ...data });
            }
        });
        console.log(`✅ Agendamentos com valor: ${agendamentos.length}`);
        
        // Carregar histórico (opcional)
        try {
            const historicoSnap = await getDocs(query(collection(db, "historico_metas"), orderBy("dataCriacao", "desc")));
            historicoMetas = historicoSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            historicoMetas = [];
        }
        
        popularFiltros();
        await carregarMetas();
        mostrarToast("Dados carregados com sucesso!");
        
    } catch (error) {
        console.error("❌ Erro ao carregar dados:", error);
        
        let mensagem = error.message;
        if (error.code === 'permission-denied') {
            mensagem = "Permissão negada! Verifique as regras de segurança do Firebase no console.";
        }
        
        if (container) {
            container.innerHTML = `
                <div class="loading-metas" style="color:#ef4444; text-align: center;">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem;"></i>
                    <p style="margin-top: 15px;">${escapeHtml(mensagem)}</p>
                    <p style="font-size: 0.8rem; color: #f59e0b; margin-top: 10px;">
                        ⚠️ Verifique as regras de segurança do Firestore no Firebase Console.
                    </p>
                    <button class="btn-primary" id="btnTentarNovamente" style="margin-top: 20px;">
                        <i class="fa-solid fa-rotate-right"></i> Tentar Novamente
                    </button>
                </div>
            `;
            const btnTentar = document.getElementById("btnTentarNovamente");
            if (btnTentar) btnTentar.addEventListener("click", () => carregarDados());
        }
        
        mostrarToast("Erro ao carregar dados: " + mensagem, "erro");
    }
}

function popularFiltros() {
    const filtroEquipe = document.getElementById("filtroEquipeMeta");
    const filtroProfissional = document.getElementById("filtroProfissionalMeta");
    const metaProfissionalSelect = document.getElementById("metaProfissional");
    
    if (filtroEquipe) {
        filtroEquipe.innerHTML = '<option value="">Todas as equipes</option>';
        equipes.forEach(equipe => {
            filtroEquipe.innerHTML += `<option value="${equipe.id}">${escapeHtml(equipe.nome)}</option>`;
        });
    }
    
    if (filtroProfissional || metaProfissionalSelect) {
        const options = profissionais.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
        if (filtroProfissional) filtroProfissional.innerHTML = '<option value="">Todos os profissionais</option>' + options;
        if (metaProfissionalSelect) metaProfissionalSelect.innerHTML = '<option value="">Selecione um profissional</option>' + options;
    }
}

function calcularRealizadoPorProfissional(profissionalId, inicio, fim) {
    let total = 0;
    let atendimentos = 0;
    
    if (!inicio || !fim) {
        agendamentos.forEach(agendamento => {
            if (agendamento.profissionalId === profissionalId || agendamento.profissional === profissionalId) {
                total += agendamento.valor || 0;
                atendimentos++;
            }
        });
        return { total, atendimentos };
    }
    
    agendamentos.forEach(agendamento => {
        if (agendamento.profissionalId === profissionalId || agendamento.profissional === profissionalId) {
            let dataAgendamento = null;
            if (agendamento.dataAgendamento) dataAgendamento = converterParaDate(agendamento.dataAgendamento);
            else if (agendamento.data) dataAgendamento = converterParaDate(agendamento.data);
            else if (agendamento.dataFinalizacao) dataAgendamento = converterParaDate(agendamento.dataFinalizacao);
            
            if (dataAgendamento && dataAgendamento >= inicio && dataAgendamento <= fim) {
                total += agendamento.valor || 0;
                atendimentos++;
            }
        }
    });
    
    return { total, atendimentos };
}

function getMetaAtivaParaProfissional(profissionalId, inicio, fim) {
    const metasProfissional = metas.filter(m => m.profissionalId === profissionalId);
    if (metasProfissional.length === 0) return null;
    
    if (!inicio || !fim) {
        metasProfissional.sort((a, b) => {
            const dateA = a.createdAt?.seconds || a.dataCriacao?.seconds || 0;
            const dateB = b.createdAt?.seconds || b.dataCriacao?.seconds || 0;
            return dateB - dateA;
        });
        return metasProfissional[0]?.valor || null;
    }
    
    for (const meta of metasProfissional) {
        let metaInicio = meta.dataInicio ? converterParaDate(meta.dataInicio) : null;
        let metaFim = meta.dataFim ? converterParaDate(meta.dataFim) : null;
        
        if (metaInicio && metaFim && metaInicio <= fim && metaFim >= inicio) {
            return meta.valor;
        }
    }
    
    metasProfissional.sort((a, b) => {
        const dateA = a.createdAt?.seconds || a.dataCriacao?.seconds || 0;
        const dateB = b.createdAt?.seconds || b.dataCriacao?.seconds || 0;
        return dateB - dateA;
    });
    
    return metasProfissional[0]?.valor || null;
}

async function carregarMetas() {
    if (!usuarioAutenticado) return;
    
    const { inicio, fim } = getPeriodoDatas();
    
    const periodoDiv = document.getElementById("periodoPersonalizadoMeta");
    if (periodoDiv) periodoDiv.style.display = currentPeriodoMeta === "personalizado" ? "flex" : "none";
    
    let profissionaisFiltrados = [...profissionais];
    
    if (currentNivelMeta === "equipe" && currentEquipeFilter) {
        profissionaisFiltrados = profissionais.filter(p => p.equipeId === currentEquipeFilter);
    } else if (currentNivelMeta === "individual" && currentProfissionalFilter) {
        profissionaisFiltrados = profissionais.filter(p => p.id === currentProfissionalFilter);
    }
    
    const resultados = [];
    let totalMeta = 0;
    let totalRealizado = 0;
    
    for (const profissional of profissionaisFiltrados) {
        const realizado = calcularRealizadoPorProfissional(profissional.id, inicio, fim);
        const metaValor = getMetaAtivaParaProfissional(profissional.id, inicio, fim);
        
        if (metaValor !== null && metaValor > 0) {
            totalMeta += metaValor;
            totalRealizado += realizado.total;
        }
        
        resultados.push({
            profissional: profissional,
            equipe: equipes.find(e => e.id === profissional.equipeId),
            meta: metaValor || 0,
            realizado: realizado.total,
            atendimentos: realizado.atendimentos,
            ticketMedio: realizado.atendimentos > 0 ? realizado.total / realizado.atendimentos : 0,
            percentual: metaValor && metaValor > 0 ? (realizado.total / metaValor) * 100 : 0,
            projecao: metaValor && metaValor > 0 ? Math.max(0, metaValor - realizado.total) : 0,
            comissao: profissional.comissao || 30,
            temMeta: metaValor !== null && metaValor > 0
        });
    }
    
    const profissionaisComMeta = resultados.filter(r => r.temMeta);
    
    profissionaisComMeta.sort((a, b) => {
        switch(currentOrdenacao) {
            case "percentual_desc": return b.percentual - a.percentual;
            case "percentual_asc": return a.percentual - b.percentual;
            case "realizado_desc": return b.realizado - a.realizado;
            case "realizado_asc": return a.realizado - b.realizado;
            case "nome_asc": return a.profissional.nome.localeCompare(b.profissional.nome);
            case "nome_desc": return b.profissional.nome.localeCompare(a.profissional.nome);
            default: return b.percentual - a.percentual;
        }
    });
    
    const percentualGeral = totalMeta > 0 ? (totalRealizado / totalMeta) * 100 : 0;
    
    const metaTotalEl = document.getElementById("metaTotalEmpresa");
    const realizadoTotalEl = document.getElementById("realizadoTotalEmpresa");
    const percentualGeralEl = document.getElementById("percentualGeral");
    const faltanteMetaEl = document.getElementById("faltanteMeta");
    const totalProfissionaisEl = document.getElementById("totalProfissionaisMeta");
    
    if (metaTotalEl) metaTotalEl.textContent = formatarMoeda(totalMeta);
    if (realizadoTotalEl) realizadoTotalEl.textContent = formatarMoeda(totalRealizado);
    if (percentualGeralEl) percentualGeralEl.textContent = percentualGeral.toFixed(1) + "%";
    if (faltanteMetaEl) faltanteMetaEl.textContent = formatarMoeda(Math.max(0, totalMeta - totalRealizado));
    if (totalProfissionaisEl) totalProfissionaisEl.textContent = profissionaisComMeta.length + " profissionais";
    
    renderizarCardsMetas(profissionaisComMeta);
    renderizarGraficos(profissionaisComMeta);
    renderizarTabelaMetas(profissionaisComMeta);
    renderizarHistorico();
}

function renderizarCardsMetas(resultados) {
    const container = document.getElementById("metasCardsGrid");
    if (!container) return;
    
    if (resultados.length === 0) {
        container.innerHTML = '<div class="loading-metas">Nenhuma meta definida para o período selecionado.<br><br><button class="btn-primary" id="btnNovaMetaEmpty" style="background: linear-gradient(135deg, #2199EF, #1a7fcc);">+ Definir Nova Meta</button></div>';
        const btnNova = document.getElementById("btnNovaMetaEmpty");
        if (btnNova) btnNova.addEventListener("click", () => abrirModalMeta());
        return;
    }
    
    container.innerHTML = resultados.map(prof => {
        let statusClass = "", statusText = "";
        if (prof.percentual >= 100) { statusClass = "meta-atingida"; statusText = "✅ Atingida"; }
        else if (prof.percentual >= 75) { statusClass = ""; statusText = "📈 Em Progresso"; }
        else if (prof.percentual >= 50) { statusClass = "meta-alerta"; statusText = "⚠️ Em Alerta"; }
        else { statusClass = "meta-critica"; statusText = "🔴 Crítica"; }
        
        let fillClass = "progress";
        if (prof.percentual >= 100) fillClass = "success";
        else if (prof.percentual >= 75) fillClass = "progress";
        else if (prof.percentual >= 50) fillClass = "warning";
        else fillClass = "danger";
        
        return `
            <div class="meta-card ${statusClass}" data-profissional-id="${prof.profissional.id}">
                <div class="meta-card-header">
                    <div class="meta-card-title">
                        <i class="fa-solid fa-user-md"></i>
                        <div>
                            <h4>${escapeHtml(prof.profissional.nome)}</h4>
                            <small>${escapeHtml(prof.equipe?.nome || "Sem equipe")}</small>
                        </div>
                    </div>
                    <span class="meta-status-badge">${statusText}</span>
                </div>
                <div class="meta-card-body">
                    <div class="meta-row"><span class="label">Meta:</span><span class="value">${formatarMoeda(prof.meta)}</span></div>
                    <div class="meta-row"><span class="label">Realizado:</span><span class="value">${formatarMoeda(prof.realizado)}</span></div>
                    <div class="progress-meta">
                        <div class="progress-bar-meta"><div class="progress-fill-meta ${fillClass}" style="width: ${Math.min(prof.percentual, 100)}%"></div></div>
                        <div class="meta-percent-value">${prof.percentual.toFixed(1)}%</div>
                    </div>
                </div>
                <div class="meta-card-footer">
                    <span><i class="fa-solid fa-cut"></i> ${prof.atendimentos} atend.</span>
                    <span><i class="fa-solid fa-ticket"></i> ${formatarMoeda(prof.ticketMedio)}</span>
                    <span><i class="fa-solid fa-percent"></i> ${prof.comissao}% comissão</span>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.meta-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const profissional = resultados.find(r => r.profissional.id === card.dataset.profissionalId);
            if (profissional) abrirModalVisualizarMeta(profissional);
        });
    });
}

function renderizarGraficos(resultados) {
    if (resultados.length === 0) return;
    
    const ctxBar = document.getElementById('metasChart')?.getContext('2d');
    if (ctxBar) {
        if (metasChart) metasChart.destroy();
        metasChart = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: resultados.map(r => r.profissional.nome),
                datasets: [
                    { label: 'Meta (R$)', data: resultados.map(r => r.meta), backgroundColor: 'rgba(33, 153, 239, 0.6)', borderColor: '#2199EF', borderWidth: 1, borderRadius: 8 },
                    { label: 'Realizado (R$)', data: resultados.map(r => r.realizado), backgroundColor: 'rgba(16, 185, 129, 0.6)', borderColor: '#10b981', borderWidth: 1, borderRadius: 8 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
                scales: { y: { ticks: { color: '#94a3b8', callback: v => formatarMoeda(v) }, grid: { color: 'rgba(148,163,184,0.1)' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } }
            }
        });
    }
    
    const ctxPie = document.getElementById('atingimentoChart')?.getContext('2d');
    if (ctxPie) {
        if (atingimentoChart) atingimentoChart.destroy();
        const atingidas = resultados.filter(r => r.percentual >= 100).length;
        const progresso = resultados.filter(r => r.percentual >= 75 && r.percentual < 100).length;
        const alerta = resultados.filter(r => r.percentual >= 50 && r.percentual < 75).length;
        const critica = resultados.filter(r => r.percentual < 50).length;
        
        atingimentoChart = new Chart(ctxPie, {
            type: 'pie',
            data: {
                labels: ['Meta Atingida', 'Em Progresso (75-99%)', 'Em Alerta (50-74%)', 'Crítica (<50%)'],
                datasets: [{ data: [atingidas, progresso, alerta, critica], backgroundColor: ['#10b981', '#2199EF', '#f59e0b', '#ef4444'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 10 } } } }
            }
        });
    }
}

function renderizarTabelaMetas(resultados) {
    const tbody = document.getElementById("metasTableBody");
    if (!tbody) return;
    
    let filtrados = [...resultados];
    if (currentSearchTable) {
        const search = currentSearchTable.toLowerCase();
        filtrados = filtrados.filter(r => r.profissional.nome.toLowerCase().includes(search) || (r.equipe?.nome || "").toLowerCase().includes(search));
    }
    
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center;">Nenhum resultado encontrado</td</tr>';
        return;
    }
    
    tbody.innerHTML = filtrados.map(r => {
        let statusClass = "", statusText = "";
        if (r.percentual >= 100) { statusClass = "status-atingida"; statusText = "✓ Atingida"; }
        else if (r.percentual >= 75) { statusClass = "status-progresso"; statusText = "📈 Em Progresso"; }
        else if (r.percentual >= 50) { statusClass = "status-alerta"; statusText = "⚠️ Em Alerta"; }
        else { statusClass = "status-critica"; statusText = "🔴 Crítica"; }
        
        const metaCorrespondente = metas.find(m => m.profissionalId === r.profissional.id);
        const metaId = metaCorrespondente?.id || '';
        
        return `
            <tr>
                <td><strong>${escapeHtml(r.profissional.nome)}</strong></td>
                <td>${escapeHtml(r.equipe?.nome || "—")}</td>
                <td>${formatarMoeda(r.meta)}</td>
                <td>${formatarMoeda(r.realizado)}</td>
                <td>${r.atendimentos}</td>
                <td>${r.atendimentos > 0 ? formatarMoeda(r.ticketMedio) : "—"}</td>
                <td>${r.percentual.toFixed(1)}%</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${r.projecao > 0 ? formatarMoeda(r.projecao) : "✅ Meta Atingida"}</td>
                <td>${r.comissao}%</td>
                <td>
                    <button class="btn-edit-meta" data-meta-id="${metaId}" data-profissional-id="${r.profissional.id}" data-profissional-nome="${escapeHtml(r.profissional.nome)}" data-meta-valor="${r.meta}" data-comissao="${r.comissao}" title="Editar Meta"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-delete-meta" data-meta-id="${metaId}" data-profissional-nome="${escapeHtml(r.profissional.nome)}" data-meta-valor="${r.meta}" title="Excluir Meta"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-edit-meta').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const metaId = btn.getAttribute('data-meta-id');
            if (metaId && metaId !== '') {
                abrirModalEditarMeta(metaId, btn.getAttribute('data-profissional-id'), btn.getAttribute('data-profissional-nome'), parseFloat(btn.getAttribute('data-meta-valor')), parseFloat(btn.getAttribute('data-comissao')));
            } else {
                mostrarToast("Esta meta não pode ser editada diretamente. Crie uma nova meta.", "info");
            }
        });
    });
    
    document.querySelectorAll('.btn-delete-meta').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const metaId = btn.getAttribute('data-meta-id');
            if (metaId && metaId !== '') {
                abrirModalExcluirMeta(metaId, btn.getAttribute('data-profissional-nome'), btn.getAttribute('data-meta-valor'));
            } else {
                mostrarToast("Esta meta não pode ser excluída diretamente.", "info");
            }
        });
    });
}

function renderizarHistorico() {
    const tbody = document.getElementById("historicoMetasBody");
    if (!tbody) return;
    
    if (historicoMetas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum histórico encontrado</td</tr>';
        return;
    }
    
    tbody.innerHTML = historicoMetas.slice(0, 20).map(h => {
        const profissional = profissionais.find(p => p.id === h.profissionalId);
        return `
            <tr>
                <td>${h.dataCriacao ? new Date(h.dataCriacao.seconds * 1000).toLocaleDateString('pt-BR') : "—"}</td>
                <td>${escapeHtml(profissional?.nome || h.profissionalNome || "N/A")}</td>
                <td>${formatarMoeda(h.valor)}</td>
                <td>${h.periodo || "—"}</td>
                <td>${formatarMoeda(h.realizado || 0)}</td>
                <td>${h.percentual ? h.percentual.toFixed(1) + "%" : "—"}</td>
            </tr>
        `;
    }).join('');
}

async function atualizarMetaMensalProfissional(profissionalId, novoValorMeta) {
    try {
        const profissionalRef = doc(db, "profissionais", profissionalId);
        await updateDoc(profissionalRef, { metaMensal: novoValorMeta, updatedAt: Timestamp.now() });
        return true;
    } catch (error) { return false; }
}

async function atualizarComissaoProfissional(profissionalId, novaComissao) {
    try {
        const profissionalRef = doc(db, "profissionais", profissionalId);
        await updateDoc(profissionalRef, { comissao: novaComissao, updatedAt: Timestamp.now() });
        return true;
    } catch (error) { return false; }
}

async function salvarMeta() {
    const profissionalId = document.getElementById("metaProfissional")?.value;
    const periodo = document.getElementById("metaPeriodo")?.value;
    const valor = parseFloat(document.getElementById("metaValor")?.value);
    const comissao = parseFloat(document.getElementById("metaComissao")?.value);
    const observacoes = document.getElementById("metaObservacoes")?.value || "";
    
    if (!profissionalId) { mostrarToast("Selecione um profissional", "erro"); return; }
    if (!valor || valor <= 0) { mostrarToast("Informe um valor de meta válido", "erro"); return; }
    if (!comissao || comissao < 0 || comissao > 100) { mostrarToast("Informe uma comissão válida (0-100%)", "erro"); return; }
    
    let dataInicio, dataFim;
    const hoje = new Date();
    
    if (periodo === "personalizado") {
        const dataInicioStr = document.getElementById("metaDataInicio")?.value;
        const dataFimStr = document.getElementById("metaDataFim")?.value;
        if (!dataInicioStr || !dataFimStr) { mostrarToast("Selecione as datas para o período personalizado", "erro"); return; }
        dataInicio = new Date(dataInicioStr);
        dataFim = new Date(dataFimStr);
    } else if (periodo === "mes_atual") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    } else if (periodo === "proximo_mes") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
    } else if (periodo === "trimestre") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 4, 0);
    } else if (periodo === "semestre") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 7, 0);
    } else if (periodo === "ano") {
        dataInicio = new Date(hoje.getFullYear() + 1, 0, 1);
        dataFim = new Date(hoje.getFullYear() + 1, 11, 31);
    } else {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    }
    
    try {
        await addDoc(collection(db, "metas"), {
            profissionalId, valor, comissao, periodo,
            dataInicio: Timestamp.fromDate(dataInicio), dataFim: Timestamp.fromDate(dataFim),
            observacoes, createdAt: Timestamp.now(), updatedAt: Timestamp.now()
        });
        
        await atualizarMetaMensalProfissional(profissionalId, valor);
        await atualizarComissaoProfissional(profissionalId, comissao);
        
        mostrarToast("Meta definida com sucesso!");
        fecharModalMeta();
        await carregarDados();
        
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionais = profissionaisSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        popularFiltros();
        
    } catch (error) {
        mostrarToast("Erro ao salvar meta: " + error.message, "erro");
    }
}

async function editarMeta() {
    if (!metaEditando) return;
    
    const periodo = document.getElementById("editMetaPeriodo")?.value;
    const valor = parseFloat(document.getElementById("editMetaValor")?.value);
    const comissao = parseFloat(document.getElementById("editMetaComissao")?.value);
    const observacoes = document.getElementById("editMetaObservacoes")?.value || "";
    
    if (!valor || valor <= 0) { mostrarToast("Informe um valor de meta válido", "erro"); return; }
    if (!comissao || comissao < 0 || comissao > 100) { mostrarToast("Informe uma comissão válida (0-100%)", "erro"); return; }
    
    let dataInicio, dataFim;
    const hoje = new Date();
    
    if (periodo === "personalizado") {
        const dataInicioStr = document.getElementById("editMetaDataInicio")?.value;
        const dataFimStr = document.getElementById("editMetaDataFim")?.value;
        if (!dataInicioStr || !dataFimStr) { mostrarToast("Selecione as datas para o período personalizado", "erro"); return; }
        dataInicio = new Date(dataInicioStr);
        dataFim = new Date(dataFimStr);
    } else if (periodo === "mes_atual") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    } else if (periodo === "proximo_mes") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
    } else if (periodo === "trimestre") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 4, 0);
    } else if (periodo === "semestre") {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 7, 0);
    } else if (periodo === "ano") {
        dataInicio = new Date(hoje.getFullYear() + 1, 0, 1);
        dataFim = new Date(hoje.getFullYear() + 1, 11, 31);
    } else {
        dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    }
    
    try {
        const metaAtual = metas.find(m => m.id === metaEditando);
        await updateDoc(doc(db, "metas", metaEditando), {
            valor, comissao, periodo,
            dataInicio: Timestamp.fromDate(dataInicio), dataFim: Timestamp.fromDate(dataFim),
            observacoes, updatedAt: Timestamp.now()
        });
        
        if (metaAtual && metaAtual.profissionalId) {
            await atualizarMetaMensalProfissional(metaAtual.profissionalId, valor);
            await atualizarComissaoProfissional(metaAtual.profissionalId, comissao);
        }
        
        mostrarToast("Meta atualizada com sucesso!");
        fecharModalEditarMeta();
        await carregarDados();
        
    } catch (error) {
        mostrarToast("Erro ao editar meta: " + error.message, "erro");
    }
}

async function excluirMeta() {
    if (!metaParaExcluir) return;
    
    try {
        await deleteDoc(doc(db, "metas", metaParaExcluir));
        mostrarToast("Meta excluída com sucesso!");
        fecharModalExcluirMeta();
        await carregarDados();
    } catch (error) {
        mostrarToast("Erro ao excluir meta: " + error.message, "erro");
    }
}

function abrirModalMeta() {
    const modal = document.getElementById("modalDefinirMeta");
    if (modal) modal.classList.add("active");
    document.getElementById("metaPeriodo").value = "mes_atual";
    document.getElementById("metaComissao").value = 30;
    document.getElementById("periodoPersonalizadoModal").style.display = "none";
}

function fecharModalMeta() {
    document.getElementById("modalDefinirMeta")?.classList.remove("active");
}

function abrirModalEditarMeta(metaId, profissionalId, profissionalNome, metaValor, comissao) {
    metaEditando = metaId;
    const modal = document.getElementById("modalEditarMeta");
    if (!modal) return;
    
    document.getElementById("editMetaId").value = metaId;
    document.getElementById("editMetaProfissionalNome").value = profissionalNome;
    document.getElementById("editMetaValor").value = metaValor;
    document.getElementById("editMetaComissao").value = comissao;
    
    const meta = metas.find(m => m.id === metaId);
    if (meta) {
        document.getElementById("editMetaPeriodo").value = meta.periodo || "mes_atual";
        document.getElementById("editMetaObservacoes").value = meta.observacoes || "";
        const div = document.getElementById("editPeriodoPersonalizadoModal");
        if (div) div.style.display = meta.periodo === "personalizado" ? "block" : "none";
    }
    
    modal.classList.add("active");
}

function fecharModalEditarMeta() {
    document.getElementById("modalEditarMeta")?.classList.remove("active");
    metaEditando = null;
}

function abrirModalExcluirMeta(metaId, profissionalNome, metaValor) {
    metaParaExcluir = metaId;
    const modal = document.getElementById("modalExcluirMeta");
    if (!modal) return;
    
    document.getElementById("excluirMetaProfissional").textContent = profissionalNome;
    document.getElementById("excluirMetaValor").textContent = formatarMoeda(parseFloat(metaValor));
    modal.classList.add("active");
}

function fecharModalExcluirMeta() {
    document.getElementById("modalExcluirMeta")?.classList.remove("active");
    metaParaExcluir = null;
}

function abrirModalVisualizarMeta(profissional) {
    const modal = document.getElementById("modalVisualizarMeta");
    const body = document.getElementById("visualizarMetaBody");
    if (!modal || !body) return;
    
    let statusClass = "progresso", statusText = "Em Progresso";
    if (profissional.percentual >= 100) { statusClass = "atingida"; statusText = "Meta Atingida"; }
    else if (profissional.percentual >= 75) { statusClass = "progresso"; statusText = "Em Progresso"; }
    else if (profissional.percentual >= 50) { statusClass = "alerta"; statusText = "Em Alerta"; }
    else { statusClass = "critica"; statusText = "Crítica"; }
    
    body.innerHTML = `
        <div class="detalhes-meta">
            <div class="meta-detalhe-header">
                <i class="fa-solid fa-user-md"></i>
                <h3>${escapeHtml(profissional.profissional.nome)}</h3>
                <span class="status-badge status-${statusClass}">${statusText}</span>
            </div>
            <div class="meta-detalhe-info">
                <div class="info-row"><span class="label">Equipe:</span><span class="value">${escapeHtml(profissional.equipe?.nome || "Sem equipe")}</span></div>
                <div class="info-row"><span class="label">Meta Definida:</span><span class="value">${formatarMoeda(profissional.meta)}</span></div>
                <div class="info-row"><span class="label">Realizado:</span><span class="value">${formatarMoeda(profissional.realizado)}</span></div>
                <div class="info-row"><span class="label">Atendimentos:</span><span class="value">${profissional.atendimentos}</span></div>
                <div class="info-row"><span class="label">Ticket Médio:</span><span class="value">${formatarMoeda(profissional.ticketMedio)}</span></div>
                <div class="info-row"><span class="label">Percentual Atingido:</span><span class="value">${profissional.percentual.toFixed(1)}%</span></div>
                <div class="info-row"><span class="label">Comissão:</span><span class="value">${profissional.comissao}%</span></div>
                <div class="info-row"><span class="label">Falta para Meta:</span><span class="value">${formatarMoeda(Math.max(0, profissional.projecao))}</span></div>
            </div>
            <div class="progress-meta">
                <div class="progress-bar-meta"><div class="progress-fill-meta ${statusClass}" style="width: ${Math.min(profissional.percentual, 100)}%"></div></div>
                <div class="meta-percent-value">${profissional.percentual.toFixed(1)}%</div>
            </div>
        </div>
    `;
    
    modal.classList.add("active");
}

function fecharModalVisualizar() {
    document.getElementById("modalVisualizarMeta")?.classList.remove("active");
}

function configurarEventos() {
    const filtroNivel = document.getElementById("filtroNivelMeta");
    const filtroEquipe = document.getElementById("filtroEquipeMeta");
    const filtroProfissional = document.getElementById("filtroProfissionalMeta");
    const filtroPeriodo = document.getElementById("filtroPeriodoMeta");
    const filtroOrdenacao = document.getElementById("filtroOrdenacao");
    const btnLimpar = document.getElementById("btnLimparFiltrosMeta");
    const btnSalvarMeta = document.getElementById("btnSalvarMeta");
    const btnDefinirMeta = document.getElementById("btnDefinirMeta");
    const btnSalvarEdicaoMeta = document.getElementById("btnSalvarEdicaoMeta");
    const btnConfirmarExcluirMeta = document.getElementById("confirmarExcluirMeta");
    const metaPeriodo = document.getElementById("metaPeriodo");
    const editMetaPeriodo = document.getElementById("editMetaPeriodo");
    const btnAplicarPeriodo = document.getElementById("btnAplicarPeriodoMeta");
    const buscaTabela = document.getElementById("searchTabelaMeta");
    const toggleHistorico = document.getElementById("toggleHistorico");
    const dataInicio = document.getElementById("dataInicioMeta");
    const dataFim = document.getElementById("dataFimMeta");
    
    if (filtroNivel) {
        filtroNivel.addEventListener("change", (e) => {
            currentNivelMeta = e.target.value;
            document.getElementById("grupoFiltroEquipe").style.display = currentNivelMeta === "equipe" ? "flex" : "none";
            document.getElementById("grupoFiltroProfissional").style.display = currentNivelMeta === "individual" ? "flex" : "none";
            carregarMetas();
        });
    }
    
    if (filtroEquipe) filtroEquipe.addEventListener("change", (e) => { currentEquipeFilter = e.target.value; carregarMetas(); });
    if (filtroProfissional) filtroProfissional.addEventListener("change", (e) => { currentProfissionalFilter = e.target.value; carregarMetas(); });
    if (filtroPeriodo) filtroPeriodo.addEventListener("change", (e) => { currentPeriodoMeta = e.target.value; carregarMetas(); });
    if (filtroOrdenacao) filtroOrdenacao.addEventListener("change", (e) => { currentOrdenacao = e.target.value; carregarMetas(); });
    
    if (btnLimpar) {
        btnLimpar.addEventListener("click", () => {
            if (filtroNivel) filtroNivel.value = "empresa";
            if (filtroEquipe) filtroEquipe.value = "";
            if (filtroProfissional) filtroProfissional.value = "";
            if (filtroPeriodo) filtroPeriodo.value = "todas";
            if (filtroOrdenacao) filtroOrdenacao.value = "percentual_desc";
            if (buscaTabela) buscaTabela.value = "";
            currentNivelMeta = "empresa";
            currentEquipeFilter = "";
            currentProfissionalFilter = "";
            currentPeriodoMeta = "todas";
            currentOrdenacao = "percentual_desc";
            currentSearchTable = "";
            document.getElementById("grupoFiltroEquipe").style.display = "none";
            document.getElementById("grupoFiltroProfissional").style.display = "none";
            carregarMetas();
        });
    }
    
    if (btnSalvarMeta) btnSalvarMeta.addEventListener("click", salvarMeta);
    if (btnSalvarEdicaoMeta) btnSalvarEdicaoMeta.addEventListener("click", editarMeta);
    if (btnConfirmarExcluirMeta) btnConfirmarExcluirMeta.addEventListener("click", excluirMeta);
    if (btnDefinirMeta) btnDefinirMeta.addEventListener("click", abrirModalMeta);
    
    if (metaPeriodo) metaPeriodo.addEventListener("change", (e) => {
        document.getElementById("periodoPersonalizadoModal").style.display = e.target.value === "personalizado" ? "block" : "none";
    });
    
    if (editMetaPeriodo) editMetaPeriodo.addEventListener("change", (e) => {
        document.getElementById("editPeriodoPersonalizadoModal").style.display = e.target.value === "personalizado" ? "block" : "none";
    });
    
    if (btnAplicarPeriodo && dataInicio && dataFim) {
        btnAplicarPeriodo.addEventListener("click", () => {
            dataInicioMeta = dataInicio.value;
            dataFimMeta = dataFim.value;
            carregarMetas();
        });
    }
    
    if (buscaTabela) buscaTabela.addEventListener("input", (e) => { currentSearchTable = e.target.value; carregarMetas(); });
    
    if (toggleHistorico) {
        toggleHistorico.addEventListener("click", () => {
            const historicoDiv = document.getElementById("historicoMetas");
            const isVisible = historicoDiv?.style.display === "block";
            if (historicoDiv) {
                historicoDiv.style.display = isVisible ? "none" : "block";
                toggleHistorico.innerHTML = isVisible ? '<i class="fa-solid fa-chevron-down"></i> Mostrar Histórico' : '<i class="fa-solid fa-chevron-up"></i> Ocultar Histórico';
            }
        });
    }
    
    document.querySelectorAll(".modal-close-meta, .btn-cancel-meta").forEach(btn => btn.addEventListener("click", fecharModalMeta));
    document.querySelectorAll(".modal-close-editar-meta, .btn-cancel-editar-meta").forEach(btn => btn.addEventListener("click", fecharModalEditarMeta));
    document.querySelectorAll(".modal-close-excluir-meta, .btn-cancel-excluir-meta").forEach(btn => btn.addEventListener("click", fecharModalExcluirMeta));
    document.querySelectorAll(".modal-close-visualizar, .btn-cancel-visualizar").forEach(btn => btn.addEventListener("click", fecharModalVisualizar));
    
    window.addEventListener("click", (e) => {
        if (e.target === document.getElementById("modalDefinirMeta")) fecharModalMeta();
        if (e.target === document.getElementById("modalEditarMeta")) fecharModalEditarMeta();
        if (e.target === document.getElementById("modalExcluirMeta")) fecharModalExcluirMeta();
        if (e.target === document.getElementById("modalVisualizarMeta")) fecharModalVisualizar();
    });
}

// Inicialização
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ Usuário autenticado:", user.email);
        usuarioAutenticado = true;
        configurarEventos();
        carregarDados();
    } else {
        console.log("⏳ Usuário não autenticado, redirecionando...");
        window.location.href = 'login.html';
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}

console.log("metas.js carregado com sucesso!");