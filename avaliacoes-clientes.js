import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    updateDoc,
    doc,
    orderBy,
    onSnapshot,
    Timestamp
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

let avaliacoes = [];
let profissionais = [];
let notasChart = null;
let barbeirosChart = null;

// Elementos DOM
const avaliacoesGrid = document.getElementById('avaliacoesGrid');
const filterPeriodo = document.getElementById('filterPeriodo');
const filterNota = document.getElementById('filterNota');
const filterBarbeiro = document.getElementById('filterBarbeiro');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const modalVisualizar = document.getElementById('modalVisualizarAvaliacao');
const modalResponder = document.getElementById('modalResponderAvaliacao');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let avaliacaoRespondendo = null;

function mostrarToast(mensagem, tipo = 'sucesso') {
    toastMsg.textContent = mensagem;
    toast.style.background = tipo === 'sucesso' 
        ? 'linear-gradient(135deg, #2199EF, #1a7fcc)'
        : 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatarData(data) {
    if (!data) return '-';
    if (data.toDate) data = data.toDate();
    if (data.seconds) data = new Date(data.seconds * 1000);
    if (typeof data === 'string') data = new Date(data);
    if (isNaN(data.getTime())) return data;
    return data.toLocaleDateString('pt-BR');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getEstrelas(nota) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= nota) {
            html += '<i class="fa-solid fa-star"></i>';
        } else {
            html += '<i class="fa-regular fa-star"></i>';
        }
    }
    return html;
}

async function carregarBarbeirosFiltro() {
    try {
        const snapshot = await getDocs(collection(db, "profissionais"));
        profissionais = [];
        snapshot.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        
        filterBarbeiro.innerHTML = '<option value="">Todos os barbeiros</option>';
        profissionais.forEach(prof => {
            filterBarbeiro.innerHTML += `<option value="${prof.id}">${escapeHtml(prof.nome)}</option>`;
        });
    } catch (error) {
        console.error("Erro ao carregar barbeiros:", error);
    }
}

function carregarAvaliacoes() {
    const q = query(collection(db, "avaliacoes"), orderBy("dataAvaliacao", "desc"));
    
    onSnapshot(q, (snapshot) => {
        avaliacoes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            avaliacoes.push({ id: doc.id, ...data });
        });
        renderizarAvaliacoes();
        atualizarEstatisticas();
        atualizarGraficos();
    }, (error) => {
        console.error("Erro ao carregar avaliações:", error);
        if (avaliacoesGrid) {
            avaliacoesGrid.innerHTML = `
                <div class="empty-avaliacoes">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar avaliações: ${error.message}</p>
                </div>
            `;
        }
    });
}

function renderizarAvaliacoes() {
    if (!avaliacoesGrid) return;
    
    let filtered = [...avaliacoes];
    
    const periodoDias = parseInt(filterPeriodo?.value || '0');
    if (periodoDias > 0 && periodoDias !== 'todos') {
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - periodoDias);
        filtered = filtered.filter(a => {
            const dataAvaliacao = a.dataAvaliacao?.toDate ? a.dataAvaliacao.toDate() : new Date(a.dataAvaliacao);
            return dataAvaliacao >= dataLimite;
        });
    }
    
    const notaFilter = filterNota?.value;
    if (notaFilter) {
        filtered = filtered.filter(a => a.nota == notaFilter);
    }
    
    const barbeiroFilter = filterBarbeiro?.value;
    if (barbeiroFilter) {
        filtered = filtered.filter(a => a.profissionalId === barbeiroFilter);
    }
    
    if (filtered.length === 0) {
        avaliacoesGrid.innerHTML = `
            <div class="empty-avaliacoes">
                <i class="fa-solid fa-star"></i>
                <p>Nenhuma avaliação encontrada</p>
            </div>
        `;
        return;
    }
    
    avaliacoesGrid.innerHTML = filtered.map(avaliacao => {
        const profissional = profissionais.find(p => p.id === avaliacao.profissionalId);
        const estrelas = getEstrelas(avaliacao.nota);
        
        return `
            <div class="avaliacao-card" data-id="${avaliacao.id}">
                <div class="avaliacao-header">
                    <div class="avaliacao-cliente">
                        <h3>${escapeHtml(avaliacao.clienteNome || 'Cliente')}</h3>
                        <span class="avaliacao-data"><i class="fa-regular fa-calendar"></i> ${formatarData(avaliacao.dataAvaliacao)}</span>
                    </div>
                    <div class="avaliacao-nota">${estrelas}</div>
                </div>
                <div class="avaliacao-body">
                    ${avaliacao.comentario ? `
                        <div class="avaliacao-comentario">
                            "${escapeHtml(avaliacao.comentario)}"
                        </div>
                    ` : ''}
                    <div class="avaliacao-servico">
                        <i class="fa-solid fa-cut"></i> ${escapeHtml(avaliacao.servicoNome || 'Serviço não informado')}
                    </div>
                    <div class="avaliacao-barbeiro">
                        <i class="fa-solid fa-user-md"></i> ${escapeHtml(profissional?.nome || 'Barbeiro não informado')}
                    </div>
                    ${avaliacao.resposta ? `
                        <div class="avaliacao-resposta">
                            <i class="fa-solid fa-reply"></i> ${escapeHtml(avaliacao.resposta)}
                        </div>
                    ` : ''}
                </div>
                <div class="avaliacao-footer">
                    <button class="btn-responder" data-id="${avaliacao.id}">
                        <i class="fa-solid fa-reply"></i> ${avaliacao.resposta ? 'Editar Resposta' : 'Responder'}
                    </button>
                    <button class="btn-ver-detalhes" data-id="${avaliacao.id}">
                        <i class="fa-regular fa-eye"></i> Detalhes
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-responder').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            abrirModalResponder(id);
        });
    });
    
    document.querySelectorAll('.btn-ver-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            abrirModalVisualizar(id);
        });
    });
}

function atualizarEstatisticas() {
    const total = avaliacoes.length;
    const somaNotas = avaliacoes.reduce((sum, a) => sum + (a.nota || 0), 0);
    const notaMedia = total > 0 ? (somaNotas / total).toFixed(1) : 0;
    const respondidas = avaliacoes.filter(a => a.resposta && a.resposta.trim() !== '').length;
    const taxaResposta = total > 0 ? ((respondidas / total) * 100).toFixed(1) : 0;
    const positivas = avaliacoes.filter(a => (a.nota || 0) >= 4).length;
    const percentualPositivas = total > 0 ? ((positivas / total) * 100).toFixed(1) : 0;
    
    document.getElementById('totalAvaliacoes').textContent = total;
    document.getElementById('notaMedia').textContent = notaMedia;
    document.getElementById('taxaResposta').textContent = taxaResposta + '%';
    document.getElementById('avaliacoesPositivas').textContent = percentualPositivas + '%';
}

function atualizarGraficos() {
    const notasDistribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    avaliacoes.forEach(a => {
        const nota = a.nota || 0;
        if (notasDistribuicao[nota]) notasDistribuicao[nota]++;
    });
    
    const ctxNotas = document.getElementById('notasChart')?.getContext('2d');
    if (ctxNotas) {
        if (notasChart) notasChart.destroy();
        notasChart = new Chart(ctxNotas, {
            type: 'bar',
            data: {
                labels: ['⭐ 1', '⭐⭐ 2', '⭐⭐⭐ 3', '⭐⭐⭐⭐ 4', '⭐⭐⭐⭐⭐ 5'],
                datasets: [{
                    label: 'Quantidade de Avaliações',
                    data: [notasDistribuicao[1], notasDistribuicao[2], notasDistribuicao[3], notasDistribuicao[4], notasDistribuicao[5]],
                    backgroundColor: ['#ef4444', '#f59e0b', '#fbbf24', '#10b981', '#10b981'],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                }
            }
        });
    }
    
    const avaliacoesPorBarbeiro = {};
    avaliacoes.forEach(a => {
        const profissional = profissionais.find(p => p.id === a.profissionalId);
        const nome = profissional?.nome || 'Não informado';
        avaliacoesPorBarbeiro[nome] = (avaliacoesPorBarbeiro[nome] || 0) + 1;
    });
    
    const ctxBarbeiros = document.getElementById('barbeirosChart')?.getContext('2d');
    if (ctxBarbeiros) {
        if (barbeirosChart) barbeirosChart.destroy();
        barbeirosChart = new Chart(ctxBarbeiros, {
            type: 'pie',
            data: {
                labels: Object.keys(avaliacoesPorBarbeiro),
                datasets: [{
                    data: Object.values(avaliacoesPorBarbeiro),
                    backgroundColor: ['#2199EF', '#8b5cf6', '#10b981', '#3b82f6', '#ef4444', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 10 } } }
                }
            }
        });
    }
}

function abrirModalVisualizar(id) {
    const avaliacao = avaliacoes.find(a => a.id === id);
    if (!avaliacao) return;
    
    const profissional = profissionais.find(p => p.id === avaliacao.profissionalId);
    const estrelas = getEstrelas(avaliacao.nota);
    const modalBody = document.getElementById('vizAvaliacaoBody');
    
    modalBody.innerHTML = `
        <div class="detalhes-avaliacao">
            <div class="detalhes-row">
                <span class="label">Cliente:</span>
                <span class="value">${escapeHtml(avaliacao.clienteNome || '-')}</span>
            </div>
            <div class="detalhes-row">
                <span class="label">Serviço:</span>
                <span class="value">${escapeHtml(avaliacao.servicoNome || '-')}</span>
            </div>
            <div class="detalhes-row">
                <span class="label">Barbeiro:</span>
                <span class="value">${escapeHtml(profissional?.nome || '-')}</span>
            </div>
            <div class="detalhes-row">
                <span class="label">Data da Avaliação:</span>
                <span class="value">${formatarData(avaliacao.dataAvaliacao)}</span>
            </div>
            <div class="detalhes-row">
                <span class="label">Nota:</span>
                <span class="value">${estrelas}</span>
            </div>
            ${avaliacao.comentario ? `
                <div class="detalhes-row">
                    <span class="label">Comentário:</span>
                    <span class="value" style="text-align: left;">"${escapeHtml(avaliacao.comentario)}"</span>
                </div>
            ` : ''}
            ${avaliacao.resposta ? `
                <div class="detalhes-row">
                    <span class="label">Resposta da Barbearia:</span>
                    <span class="value" style="text-align: left; color: #10b981;">"${escapeHtml(avaliacao.resposta)}"</span>
                </div>
                <div class="detalhes-row">
                    <span class="label">Data da Resposta:</span>
                    <span class="value">${formatarData(avaliacao.dataResposta)}</span>
                </div>
            ` : ''}
        </div>
    `;
    
    modalVisualizar.classList.add('active');
}

function abrirModalResponder(id) {
    const avaliacao = avaliacoes.find(a => a.id === id);
    if (!avaliacao) return;
    
    avaliacaoRespondendo = id;
    
    const profissional = profissionais.find(p => p.id === avaliacao.profissionalId);
    const estrelas = getEstrelas(avaliacao.nota);
    
    document.getElementById('respostaCliente').value = avaliacao.clienteNome || '';
    document.getElementById('respostaEstrelas').innerHTML = estrelas;
    document.getElementById('respostaComentario').value = avaliacao.comentario || '';
    document.getElementById('respostaTexto').value = avaliacao.resposta || '';
    
    modalResponder.classList.add('active');
}

async function enviarResposta() {
    if (!avaliacaoRespondendo) return;
    
    const resposta = document.getElementById('respostaTexto').value.trim();
    
    if (!resposta) {
        mostrarToast("Digite uma resposta antes de enviar.", "erro");
        return;
    }
    
    try {
        const avaliacaoRef = doc(db, "avaliacoes", avaliacaoRespondendo);
        await updateDoc(avaliacaoRef, {
            resposta: resposta,
            dataResposta: Timestamp.now(),
            respondidoEm: new Date().toISOString()
        });
        
        mostrarToast("Resposta enviada com sucesso!", "sucesso");
        fecharModalResponder();
        carregarAvaliacoes();
        
    } catch (error) {
        console.error("Erro ao enviar resposta:", error);
        mostrarToast("Erro ao enviar resposta.", "erro");
    }
}

function fecharModalVisualizar() {
    modalVisualizar.classList.remove('active');
}

function fecharModalResponder() {
    modalResponder.classList.remove('active');
    avaliacaoRespondendo = null;
}

if (filterPeriodo) filterPeriodo.addEventListener('change', renderizarAvaliacoes);
if (filterNota) filterNota.addEventListener('change', renderizarAvaliacoes);
if (filterBarbeiro) filterBarbeiro.addEventListener('change', renderizarAvaliacoes);
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (filterPeriodo) filterPeriodo.value = 'todos';
        if (filterNota) filterNota.value = '';
        if (filterBarbeiro) filterBarbeiro.value = '';
        renderizarAvaliacoes();
    });
}

document.getElementById('btnEnviarResposta')?.addEventListener('click', enviarResposta);

document.querySelectorAll('.modal-close-viz, .btn-cancel-viz').forEach(btn => {
    btn.addEventListener('click', fecharModalVisualizar);
});
document.querySelectorAll('.modal-close-resposta, .btn-cancel-resposta').forEach(btn => {
    btn.addEventListener('click', fecharModalResponder);
});

window.addEventListener('click', (e) => {
    if (e.target === modalVisualizar) fecharModalVisualizar();
    if (e.target === modalResponder) fecharModalResponder();
});

carregarBarbeirosFiltro();
carregarAvaliacoes();

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = 'login.html';
});

const logoutBtnElement = document.getElementById('logout');
if (logoutBtnElement) {
    logoutBtnElement.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}