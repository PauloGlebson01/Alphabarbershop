import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy,
    where,
    getDocs
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

let servicos = [];
let unsubscribeServicos = null;
let unsubscribeAgendamentos = null;

const servicosGrid = document.getElementById('servicosGrid');
const searchInput = document.getElementById('searchServico');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovoServico = document.getElementById('btnNovoServico');
const modalServico = document.getElementById('modalServico');
const modalExcluir = document.getElementById('modalExcluir');
const formServico = document.getElementById('formServico');
const modalTitle = document.getElementById('modalTitle');
const servicoId = document.getElementById('servicoId');
const btnConfirmarExcluir = document.getElementById('confirmarExcluir');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let servicoParaExcluir = null;

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

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarDuracao(minutos) {
    if (!minutos) return '-';
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (horas > 0) {
        return `${horas}h ${mins > 0 ? mins + 'min' : ''}`;
    }
    return `${minutos} min`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCategoriaIcon(categoria) {
    const icons = {
        'Corte': '✂️',
        'Barba': '🪒',
        'Combos': '💈',
        'Sobrancelha': '✏️',
        'Coloração': '🎨',
        'Acabamento': '🪒',
        'Tratamento': '🧴'
    };
    return icons[categoria] || '✂️';
}

function renderizarServicos() {
    if (!servicosGrid) return;
    
    let filtered = [...servicos];
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(p => 
            p.nome?.toLowerCase().includes(searchTerm) ||
            p.categoria?.toLowerCase().includes(searchTerm) ||
            p.descricao?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        servicosGrid.innerHTML = `
            <div class="empty-servicos">
                <i class="fa-solid fa-cut"></i>
                <p>Nenhum serviço encontrado</p>
                <button class="btn-primary" onclick="document.getElementById('btnNovoServico').click()">
                    <i class="fa-solid fa-plus"></i> Adicionar Serviço
                </button>
            </div>
        `;
        return;
    }
    
    servicosGrid.innerHTML = filtered.map(servico => {
        const categoriaIcon = getCategoriaIcon(servico.categoria);
        const duracaoFormatada = formatarDuracao(servico.duracao);
        
        return `
            <div class="servico-card" data-id="${servico.id}">
                <div class="servico-header">
                    <div class="servico-info">
                        <h3>${escapeHtml(servico.nome || 'Sem nome')}</h3>
                        ${servico.categoria ? `
                            <span class="servico-categoria">
                                ${categoriaIcon} ${escapeHtml(servico.categoria)}
                            </span>
                        ` : ''}
                    </div>
                </div>
                <div class="servico-body">
                    <div class="servico-detalhe">
                        <span class="label"><i class="fa-regular fa-clock"></i> Duração</span>
                        <span class="value">${duracaoFormatada}</span>
                    </div>
                    <div class="servico-preco">
                        <span class="preco-valor">${formatarMoeda(servico.preco || 0)}</span>
                        <span class="preco-label">por sessão</span>
                    </div>
                    ${servico.descricao ? `
                        <div class="servico-descricao">
                            <i class="fa-regular fa-message"></i> ${escapeHtml(servico.descricao)}
                        </div>
                    ` : ''}
                </div>
                <div class="servico-actions">
                    <button class="btn-edit" onclick="window.editarServico('${servico.id}')">
                        <i class="fa-regular fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn-delete" onclick="window.excluirServico('${servico.id}', '${escapeHtml(servico.nome).replace(/'/g, "\\'")}')">
                        <i class="fa-regular fa-trash-can"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Função para obter a data atual no formato YYYY-MM-DD
function getDataAtual() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje.toISOString().split('T')[0];
}

// Função para obter o primeiro dia do mês atual
function getPrimeiroDiaMes() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return primeiroDia.toISOString().split('T')[0];
}

// Função para obter o último dia do mês atual
function getUltimoDiaMes() {
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return ultimoDia.toISOString().split('T')[0];
}

// Função para extrair data no formato YYYY-MM-DD de um agendamento
function extrairDataAgendamento(agendamento) {
    const dataAgendamento = agendamento.data;
    if (!dataAgendamento) return null;
    
    if (typeof dataAgendamento === 'string' && dataAgendamento.includes('-')) {
        return dataAgendamento;
    } else if (dataAgendamento && dataAgendamento.toDate) {
        return dataAgendamento.toDate().toISOString().split('T')[0];
    }
    return null;
}

// Função para atualizar estatísticas (apenas agendamentos do mês atual)
function atualizarEstatisticasEmTempoReal() {
    if (unsubscribeAgendamentos) {
        unsubscribeAgendamentos();
    }
    
    const primeiroDiaMes = getPrimeiroDiaMes();
    const ultimoDiaMes = getUltimoDiaMes();
    
    console.log(`📅 Filtrando agendamentos do mês: ${primeiroDiaMes} até ${ultimoDiaMes}`);
    
    const agendamentosRef = collection(db, "agendamentos");
    const q = query(agendamentosRef, where("status", "==", "concluido"));
    
    unsubscribeAgendamentos = onSnapshot(q, (snapshot) => {
        let totalRealizados = 0;
        let faturamentoTotal = 0;
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            const dataAgendamento = extrairDataAgendamento(agendamento);
            
            // Verificar se o agendamento é do mês atual
            if (dataAgendamento && dataAgendamento >= primeiroDiaMes && dataAgendamento <= ultimoDiaMes) {
                totalRealizados++;
                faturamentoTotal += agendamento.valor || agendamento.total || 0;
            }
        });
        
        const totalRealizadosElement = document.getElementById('totalRealizados');
        const faturamentoServicosElement = document.getElementById('faturamentoServicos');
        
        if (totalRealizadosElement) {
            totalRealizadosElement.textContent = totalRealizados;
        }
        if (faturamentoServicosElement) {
            faturamentoServicosElement.textContent = formatarMoeda(faturamentoTotal);
        }
        
        console.log(`📊 Estatísticas mensais: ${totalRealizados} atendimentos, ${formatarMoeda(faturamentoTotal)}`);
        
    }, (error) => {
        console.error("Erro ao carregar estatísticas:", error);
        carregarEstatisticasEstatico();
    });
}

// Fallback estático
async function carregarEstatisticasEstatico() {
    try {
        const primeiroDiaMes = getPrimeiroDiaMes();
        const ultimoDiaMes = getUltimoDiaMes();
        
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(agendamentosRef, where("status", "==", "concluido"));
        const snapshot = await getDocs(q);
        
        let totalRealizados = 0;
        let faturamentoTotal = 0;
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            const dataAgendamento = extrairDataAgendamento(agendamento);
            
            if (dataAgendamento && dataAgendamento >= primeiroDiaMes && dataAgendamento <= ultimoDiaMes) {
                totalRealizados++;
                faturamentoTotal += agendamento.valor || agendamento.total || 0;
            }
        });
        
        const totalRealizadosElement = document.getElementById('totalRealizados');
        const faturamentoServicosElement = document.getElementById('faturamentoServicos');
        
        if (totalRealizadosElement) totalRealizadosElement.textContent = totalRealizados;
        if (faturamentoServicosElement) faturamentoServicosElement.textContent = formatarMoeda(faturamentoTotal);
        
    } catch (error) {
        console.error("Erro no fallback:", error);
    }
}

function carregarServicos() {
    const q = query(collection(db, "servicos"), orderBy("nome", "asc"));
    
    unsubscribeServicos = onSnapshot(q, (snapshot) => {
        servicos = [];
        snapshot.forEach(doc => {
            servicos.push({ id: doc.id, ...doc.data() });
        });
        renderizarServicos();
        
        const totalServicosElement = document.getElementById('totalServicos');
        if (totalServicosElement) {
            totalServicosElement.textContent = servicos.length;
        }
    }, (error) => {
        console.error("Erro ao carregar serviços:", error);
        if (servicosGrid) {
            servicosGrid.innerHTML = `
                <div class="empty-servicos">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar serviços. Verifique sua conexão.</p>
                </div>
            `;
        }
    });
    
    atualizarEstatisticasEmTempoReal();
}

async function salvarServico(dados) {
    try {
        if (dados.id) {
            const docRef = doc(db, "servicos", dados.id);
            await updateDoc(docRef, {
                nome: dados.nome,
                duracao: Number(dados.duracao),
                preco: Number(dados.preco),
                categoria: dados.categoria,
                descricao: dados.descricao,
                atualizadoEm: new Date().toISOString()
            });
            mostrarToast("Serviço atualizado com sucesso!");
        } else {
            await addDoc(collection(db, "servicos"), {
                nome: dados.nome,
                duracao: Number(dados.duracao),
                preco: Number(dados.preco),
                categoria: dados.categoria,
                descricao: dados.descricao,
                createdAt: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });
            mostrarToast("Serviço adicionado com sucesso!");
        }
        fecharModalServico();
    } catch (error) {
        console.error("Erro ao salvar serviço:", error);
        mostrarToast("Erro ao salvar serviço.", "erro");
    }
}

async function deletarServico(id) {
    try {
        await deleteDoc(doc(db, "servicos", id));
        mostrarToast("Serviço excluído com sucesso!");
        fecharModalExcluir();
    } catch (error) {
        console.error("Erro ao excluir serviço:", error);
        mostrarToast("Erro ao excluir serviço.", "erro");
    }
}

function abrirModalServico(servico = null) {
    if (servico) {
        modalTitle.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Editar Serviço';
        servicoId.value = servico.id;
        document.getElementById('servicoNome').value = servico.nome || '';
        document.getElementById('servicoDuracao').value = servico.duracao || 60;
        document.getElementById('servicoPreco').value = servico.preco || 0;
        document.getElementById('servicoCategoria').value = servico.categoria || '';
        document.getElementById('servicoDescricao').value = servico.descricao || '';
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Serviço';
        servicoId.value = '';
        formServico.reset();
        document.getElementById('servicoDuracao').value = 60;
    }
    modalServico.classList.add('active');
}

function fecharModalServico() {
    modalServico.classList.remove('active');
}

function abrirModalExcluir(id, nome) {
    servicoParaExcluir = id;
    document.getElementById('excluirNome').textContent = nome;
    modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    modalExcluir.classList.remove('active');
    servicoParaExcluir = null;
}

if (formServico) {
    formServico.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('servicoNome').value.trim();
        if (!nome) {
            mostrarToast("Informe o nome do serviço.", "erro");
            return;
        }
        
        const duracao = document.getElementById('servicoDuracao').value;
        if (!duracao || duracao < 15) {
            mostrarToast("Informe uma duração válida (mínimo 15 minutos).", "erro");
            return;
        }
        
        const preco = document.getElementById('servicoPreco').value;
        if (!preco || preco <= 0) {
            mostrarToast("Informe um preço válido.", "erro");
            return;
        }
        
        const dados = {
            id: servicoId.value,
            nome: nome,
            duracao: duracao,
            preco: preco,
            categoria: document.getElementById('servicoCategoria').value,
            descricao: document.getElementById('servicoDescricao').value
        };
        
        salvarServico(dados);
    });
}

if (btnNovoServico) {
    btnNovoServico.addEventListener('click', () => abrirModalServico());
}

if (btnConfirmarExcluir) {
    btnConfirmarExcluir.addEventListener('click', () => {
        if (servicoParaExcluir) deletarServico(servicoParaExcluir);
    });
}

if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        renderizarServicos();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', renderizarServicos);
}

document.querySelectorAll('.modal-close, .modal-close-excluir, .btn-cancel, .btn-cancel-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalServico();
        fecharModalExcluir();
    });
});

window.addEventListener('click', (e) => {
    if (e.target === modalServico) fecharModalServico();
    if (e.target === modalExcluir) fecharModalExcluir();
});

window.editarServico = (id) => {
    const servico = servicos.find(p => p.id === id);
    if (servico) abrirModalServico(servico);
};

window.excluirServico = (id, nome) => {
    abrirModalExcluir(id, nome);
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Usuário autenticado:", user.email);
        carregarServicos();
    } else {
        console.log("Usuário não autenticado, redirecionando para login...");
        window.location.href = 'login.html';
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            if (unsubscribeServicos) unsubscribeServicos();
            if (unsubscribeAgendamentos) unsubscribeAgendamentos();
            await signOut(auth);
            console.log("Logout realizado com sucesso");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
            mostrarToast("Erro ao fazer logout.", "erro");
        }
    };
}

console.log("✅ servicos.js carregado - Estatísticas filtradas por mês atual");