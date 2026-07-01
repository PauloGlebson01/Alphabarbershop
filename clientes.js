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

let clientes = [];
let unsubscribeClientes = null;
let unsubscribeAgendamentos = null;

const clientesGrid = document.getElementById('clientesGrid');
const searchInput = document.getElementById('searchCliente');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovoCliente = document.getElementById('btnNovoCliente');
const modalCliente = document.getElementById('modalCliente');
const modalExcluir = document.getElementById('modalExcluir');
const formCliente = document.getElementById('formCliente');
const modalTitle = document.getElementById('modalTitle');
const clienteId = document.getElementById('clienteId');
const btnConfirmarExcluir = document.getElementById('confirmarExcluir');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Elementos das estatísticas
const totalClientesEl = document.getElementById('totalClientes');
const clientesAtivosEl = document.getElementById('clientesAtivos');
const clientesFieisEl = document.getElementById('clientesFieis');

let clienteParaExcluir = null;

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

function formatarTelefone(telefone) {
    if (!telefone) return '-';
    return telefone;
}

function formatarData(data) {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getIniciais(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(' ');
    if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
    return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

function renderizarClientes() {
    if (!clientesGrid) return;
    
    let filtered = [...clientes];
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(p => 
            p.nome?.toLowerCase().includes(searchTerm) ||
            p.telefone?.toLowerCase().includes(searchTerm) ||
            p.email?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        clientesGrid.innerHTML = `
            <div class="empty-clientes">
                <i class="fa-solid fa-users"></i>
                <p>Nenhum cliente encontrado</p>
                <button class="btn-primary" onclick="document.getElementById('btnNovoCliente').click()">
                    <i class="fa-solid fa-user-plus"></i> Adicionar Cliente
                </button>
            </div>
        `;
        return;
    }
    
    clientesGrid.innerHTML = filtered.map(cliente => {
        const iniciais = getIniciais(cliente.nome);
        
        return `
            <div class="cliente-card" data-id="${cliente.id}">
                <div class="cliente-header">
                    <div class="cliente-avatar">
                        ${escapeHtml(iniciais)}
                    </div>
                    <div class="cliente-info">
                        <h3>${escapeHtml(cliente.nome || 'Sem nome')}</h3>
                        <span class="cliente-telefone">
                            <i class="fa-brands fa-whatsapp"></i> ${escapeHtml(cliente.telefone || '-')}
                        </span>
                    </div>
                </div>
                <div class="cliente-body">
                    ${cliente.email ? `
                        <div class="cliente-detalhe">
                            <span class="label"><i class="fa-solid fa-envelope"></i> E-mail</span>
                            <span class="value">${escapeHtml(cliente.email)}</span>
                        </div>
                    ` : ''}
                    ${cliente.nascimento ? `
                        <div class="cliente-detalhe">
                            <span class="label"><i class="fa-solid fa-cake-candles"></i> Nascimento</span>
                            <span class="value">${formatarData(cliente.nascimento)}</span>
                        </div>
                    ` : ''}
                    ${cliente.endereco ? `
                        <div class="cliente-detalhe">
                            <span class="label"><i class="fa-solid fa-location-dot"></i> Endereço</span>
                            <span class="value" style="font-size: 0.7rem;">${escapeHtml(cliente.endereco.substring(0, 35))}${cliente.endereco.length > 35 ? '...' : ''}</span>
                        </div>
                    ` : ''}
                    ${cliente.observacoes ? `
                        <div class="cliente-detalhe">
                            <span class="label"><i class="fa-solid fa-note-sticky"></i> Observações</span>
                            <span class="value" style="font-size: 0.7rem;">${escapeHtml(cliente.observacoes.substring(0, 35))}${cliente.observacoes.length > 35 ? '...' : ''}</span>
                        </div>
                    ` : ''}
                    <div class="cliente-detalhe">
                        <span class="label"><i class="fa-solid fa-calendar-check"></i> Total Agendamentos</span>
                        <span class="value"><strong style="color: #2199EF; font-size: 1rem;">${cliente.totalAgendamentos || 0}</strong></span>
                    </div>
                </div>
                <div class="cliente-actions">
                    <button class="btn-edit" onclick="window.editarCliente('${cliente.id}')">
                        <i class="fa-regular fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn-delete" onclick="window.excluirCliente('${cliente.id}', '${escapeHtml(cliente.nome).replace(/'/g, "\\'")}')">
                        <i class="fa-regular fa-trash-can"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');
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

async function atualizarEstatisticas() {
    console.log("📊 Atualizando estatísticas...");
    
    try {
        // 1. Total de Clientes
        const totalClientes = clientes.length;
        if (totalClientesEl) {
            totalClientesEl.textContent = totalClientes;
            console.log(`✅ Total de clientes: ${totalClientes}`);
        }
        
        // 2. TOTAL DE ATENDIMENTOS REALIZADOS (TODOS OS MESES - HISTÓRICO COMPLETO)
        const agendamentosRef = collection(db, "agendamentos");
        const qAgendamentos = query(agendamentosRef, where("status", "==", "concluido"));
        
        const snapshot = await getDocs(qAgendamentos);
        
        let totalAtendimentosGeral = 0;
        let clientesAtendidosSet = new Set();
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            totalAtendimentosGeral++;
            
            const clienteNome = agendamento.cliente || agendamento.nome;
            if (clienteNome) {
                clientesAtendidosSet.add(clienteNome);
            }
        });
        
        // Atualizar o card com TOTAL GERAL de atendimentos
        if (clientesAtivosEl) {
            clientesAtivosEl.textContent = totalAtendimentosGeral;
            console.log(`✅ TOTAL de atendimentos (todos os tempos): ${totalAtendimentosGeral}`);
            console.log(`📊 Clientes únicos atendidos (todos os tempos): ${clientesAtendidosSet.size}`);
        }
        
        // 3. Clientes Fiéis (3 ou mais agendamentos no TOTAL - histórico completo)
        const contagemPorCliente = {};
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            const clienteNome = agendamento.cliente || agendamento.nome;
            if (clienteNome) {
                contagemPorCliente[clienteNome] = (contagemPorCliente[clienteNome] || 0) + 1;
            }
        });
        
        const clientesFieis = Object.values(contagemPorCliente).filter(count => count >= 3).length;
        
        if (clientesFieisEl) {
            clientesFieisEl.textContent = clientesFieis;
            console.log(`✅ Clientes fiéis (3+ atendimentos no total): ${clientesFieis}`);
        }
        
    } catch (error) {
        console.error("Erro ao atualizar estatísticas:", error);
    }
}

// Função para buscar contagem de agendamentos por cliente (histórico completo)
async function buscarTotalAgendamentosPorCliente() {
    try {
        const agendamentosRef = collection(db, "agendamentos");
        const snapshot = await getDocs(agendamentosRef);
        
        const contagemPorCliente = {};
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            // Contar apenas agendamentos CONCLUÍDOS ou CONFIRMADOS
            if (agendamento.status === 'concluido' || agendamento.status === 'confirmado') {
                const clienteNome = agendamento.cliente || agendamento.nome;
                if (clienteNome) {
                    contagemPorCliente[clienteNome] = (contagemPorCliente[clienteNome] || 0) + 1;
                }
            }
        });
        
        console.log("📊 Contagem de agendamentos por cliente:", contagemPorCliente);
        return contagemPorCliente;
    } catch (error) {
        console.error("Erro ao buscar agendamentos por cliente:", error);
        return {};
    }
}

// Função para atualizar totalAgendamentos nos clientes
async function atualizarTotaisAgendamentos() {
    const contagem = await buscarTotalAgendamentosPorCliente();
    
    // Atualizar o array clientes com os totais
    clientes = clientes.map(cliente => {
        const total = contagem[cliente.nome] || 0;
        return { ...cliente, totalAgendamentos: total };
    });
    
    // Renderizar novamente
    renderizarClientes();
    console.log("✅ Totais de agendamentos atualizados nos cards");
}

function carregarClientes() {
    const q = query(collection(db, "clientes"), orderBy("nome", "asc"));
    
    unsubscribeClientes = onSnapshot(q, async (snapshot) => {
        clientes = [];
        snapshot.forEach(doc => {
            clientes.push({ id: doc.id, ...doc.data() });
        });
        
        // Atualizar totais de agendamentos
        await atualizarTotaisAgendamentos();
        
        // Atualizar estatísticas
        await atualizarEstatisticas();
        
        console.log("✅ Clientes carregados:", clientes.length);
    }, (error) => {
        console.error("Erro ao carregar clientes:", error);
        if (clientesGrid) {
            clientesGrid.innerHTML = `
                <div class="empty-clientes">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar clientes: ${error.message}</p>
                </div>
            `;
        }
    });
    
    // Listener para atualizar em tempo real quando houver mudanças nos agendamentos
    if (unsubscribeAgendamentos) unsubscribeAgendamentos();
    unsubscribeAgendamentos = onSnapshot(collection(db, "agendamentos"), () => {
        console.log("🔄 Mudança detectada nos agendamentos, atualizando totais...");
        atualizarTotaisAgendamentos();
        atualizarEstatisticas();
    });
}

async function salvarCliente(dados) {
    try {
        if (dados.id) {
            const docRef = doc(db, "clientes", dados.id);
            await updateDoc(docRef, {
                nome: dados.nome,
                telefone: dados.telefone,
                telefoneNumerico: dados.telefone?.replace(/\D/g, ""),
                email: dados.email,
                nascimento: dados.nascimento,
                endereco: dados.endereco,
                observacoes: dados.observacoes,
                atualizadoEm: new Date().toISOString()
            });
            mostrarToast("Cliente atualizado com sucesso!");
        } else {
            await addDoc(collection(db, "clientes"), {
                nome: dados.nome,
                telefone: dados.telefone,
                telefoneNumerico: dados.telefone?.replace(/\D/g, ""),
                email: dados.email,
                nascimento: dados.nascimento,
                endereco: dados.endereco,
                observacoes: dados.observacoes,
                totalAgendamentos: 0,
                createdAt: new Date().toISOString(),
                atualizadoEm: new Date().toISOString(),
                status: "ativo"
            });
            mostrarToast("Cliente adicionado com sucesso!");
        }
        fecharModalCliente();
        
        // Aguardar e atualizar
        setTimeout(async () => {
            await atualizarTotaisAgendamentos();
            await atualizarEstatisticas();
        }, 1000);
        
    } catch (error) {
        console.error("Erro ao salvar cliente:", error);
        mostrarToast("Erro ao salvar cliente.", "erro");
    }
}

async function deletarCliente(id) {
    try {
        await deleteDoc(doc(db, "clientes", id));
        mostrarToast("Cliente excluído com sucesso!");
        fecharModalExcluir();
        
        setTimeout(async () => {
            await atualizarTotaisAgendamentos();
            await atualizarEstatisticas();
        }, 500);
        
    } catch (error) {
        console.error("Erro ao excluir cliente:", error);
        mostrarToast("Erro ao excluir cliente.", "erro");
    }
}

function abrirModalCliente(cliente = null) {
    if (cliente) {
        modalTitle.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Editar Cliente';
        clienteId.value = cliente.id;
        document.getElementById('clienteNome').value = cliente.nome || '';
        document.getElementById('clienteTelefone').value = cliente.telefone || '';
        document.getElementById('clienteEmail').value = cliente.email || '';
        document.getElementById('clienteNascimento').value = cliente.nascimento || '';
        document.getElementById('clienteEndereco').value = cliente.endereco || '';
        document.getElementById('clienteObservacoes').value = cliente.observacoes || '';
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> Novo Cliente';
        clienteId.value = '';
        formCliente.reset();
    }
    modalCliente.classList.add('active');
}

function fecharModalCliente() {
    modalCliente.classList.remove('active');
}

function abrirModalExcluir(id, nome) {
    clienteParaExcluir = id;
    document.getElementById('excluirNome').textContent = nome;
    modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    modalExcluir.classList.remove('active');
    clienteParaExcluir = null;
}

if (formCliente) {
    formCliente.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('clienteNome').value.trim();
        if (!nome) {
            mostrarToast("Informe o nome do cliente.", "erro");
            return;
        }
        
        const telefone = document.getElementById('clienteTelefone').value.trim();
        if (!telefone) {
            mostrarToast("Informe o telefone do cliente.", "erro");
            return;
        }
        
        const dados = {
            id: clienteId.value,
            nome: nome,
            telefone: telefone,
            email: document.getElementById('clienteEmail').value,
            nascimento: document.getElementById('clienteNascimento').value,
            endereco: document.getElementById('clienteEndereco').value,
            observacoes: document.getElementById('clienteObservacoes').value
        };
        
        salvarCliente(dados);
    });
}

if (btnNovoCliente) {
    btnNovoCliente.addEventListener('click', () => abrirModalCliente());
}

if (btnConfirmarExcluir) {
    btnConfirmarExcluir.addEventListener('click', () => {
        if (clienteParaExcluir) deletarCliente(clienteParaExcluir);
    });
}

if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        renderizarClientes();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', renderizarClientes);
}

document.querySelectorAll('.modal-close, .modal-close-excluir, .btn-cancel, .btn-cancel-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalCliente();
        fecharModalExcluir();
    });
});

window.addEventListener('click', (e) => {
    if (e.target === modalCliente) fecharModalCliente();
    if (e.target === modalExcluir) fecharModalExcluir();
});

window.editarCliente = (id) => {
    const cliente = clientes.find(p => p.id === id);
    if (cliente) abrirModalCliente(cliente);
};

window.excluirCliente = (id, nome) => {
    abrirModalExcluir(id, nome);
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Usuário autenticado:", user.email);
        carregarClientes();
    } else {
        console.log("Usuário não autenticado, redirecionando para login...");
        window.location.href = 'login.html';
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            if (unsubscribeClientes) unsubscribeClientes();
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

console.log("✅ clientes.js carregado - Agora contabiliza agendamentos corretamente");