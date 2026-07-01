// fidelidade.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    getDocs, 
    getDoc, 
    query, 
    where, 
    orderBy, 
    Timestamp,
    onSnapshot,
    deleteDoc,
    writeBatch,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

console.log("🚀 Firebase inicializado com sucesso!");

// Estado global
let clientesFidelidade = [];
let todosClientes = [];
let recompensas = [];
let servicosDisponiveis = [];
let produtosDisponiveis = [];
let configuracoes = {
    pontosPorRealServico: 1,
    pontosPorRealProduto: 0.5,
    pontosAniversario: 100,
    pontosIndicacao: 50,
    pontosAvaliacao: 20,
    niveis: {
        bronze: 0,
        prata: 500,
        ouro: 1500,
        diamante: 5000
    }
};
let clienteSelecionado = null;
let recompensaSelecionada = null;
let currentFilter = "";
let currentNivel = "";
let unsubscribeComandas = null;
let unsubscribeClientes = null;
let isUpdating = false;

// Elementos DOM
const clientesFidelidadeGrid = document.getElementById("clientesFidelidadeGrid");
const searchInput = document.getElementById("searchCliente");
const filterNivel = document.getElementById("filterNivel");
const btnLimparFiltros = document.getElementById("btnLimparFiltros");
const btnConfigurarPontos = document.getElementById("btnConfigurarPontos");
const modalPontosCliente = document.getElementById("modalPontosCliente");
const modalAdicionarPontos = document.getElementById("modalAdicionarPontos");
const modalConfiguracoes = document.getElementById("modalConfiguracoes");
const modalGerenciarRecompensas = document.getElementById("modalGerenciarRecompensas");
const modalResgatarRecompensa = document.getElementById("modalResgatarRecompensa");
const formAdicionarPontos = document.getElementById("formAdicionarPontos");
const formConfiguracoes = document.getElementById("formConfiguracoes");

// Métricas
const totalPontosAtivosEl = document.getElementById("totalPontosAtivos");
const totalClientesFidelidadeEl = document.getElementById("totalClientesFidelidade");
const totalRecompensasEl = document.getElementById("totalRecompensas");
const totalPontosGanhosEl = document.getElementById("totalPontosGanhos");

// Ranking
const rankingList = document.getElementById("rankingList");

function mostrarToast(mensagem, tipo = "sucesso") {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        toast.innerHTML = '<i class="fa-solid fa-circle-check"></i><span id="toastMsg"></span>';
        document.body.appendChild(toast);
    }
    const toastMsg = document.getElementById("toastMsg");
    if (toastMsg) toastMsg.textContent = mensagem;
    toast.style.background = tipo === "sucesso" 
        ? "linear-gradient(135deg, #2199EF, #1a7fcc)"
        : "linear-gradient(135deg, #ef4444, #dc2626)";
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function formatarMoeda(valor) {
    if (!valor && valor !== 0) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Função para determinar nível baseado nos pontos
function getNivel(pontos) {
    const pontosNum = pontos || 0;
    if (pontosNum >= configuracoes.niveis.diamante) return { nome: "Diamante", icone: "💎", classe: "diamante" };
    if (pontosNum >= configuracoes.niveis.ouro) return { nome: "Ouro", icone: "🥇", classe: "ouro" };
    if (pontosNum >= configuracoes.niveis.prata) return { nome: "Prata", icone: "🥈", classe: "prata" };
    return { nome: "Bronze", icone: "🥉", classe: "bronze" };
}

// Função para calcular progresso para próximo nível
function getProgressoProximoNivel(pontos) {
    const pontosNum = pontos || 0;
    const niveis = [
        { limite: configuracoes.niveis.prata, nome: "Prata", icone: "🥈" },
        { limite: configuracoes.niveis.ouro, nome: "Ouro", icone: "🥇" },
        { limite: configuracoes.niveis.diamante, nome: "Diamante", icone: "💎" }
    ];
    
    for (const nivel of niveis) {
        if (pontosNum < nivel.limite) {
            const anterior = nivel === niveis[0] ? 0 : niveis[niveis.indexOf(nivel) - 1].limite;
            const progresso = ((pontosNum - anterior) / (nivel.limite - anterior)) * 100;
            return { 
                proximoNivel: nivel.nome, 
                iconeProximo: nivel.icone,
                pontosFaltando: nivel.limite - pontosNum,
                percentual: Math.min(progresso, 100)
            };
        }
    }
    return { proximoNivel: "Máximo", iconeProximo: "🏆", pontosFaltando: 0, percentual: 100 };
}

// Carregar configurações
async function carregarConfiguracoes() {
    try {
        const configDoc = await getDoc(doc(db, "configuracoes", "fidelidade"));
        if (configDoc.exists()) {
            configuracoes = { ...configuracoes, ...configDoc.data() };
        } else {
            await setDoc(doc(db, "configuracoes", "fidelidade"), {
                ...configuracoes,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
            console.log("✅ Configurações padrão criadas");
        }
        
        const inputs = {
            pontosPorRealServico: configuracoes.pontosPorRealServico,
            pontosPorRealProduto: configuracoes.pontosPorRealProduto,
            pontosAniversario: configuracoes.pontosAniversario,
            pontosIndicacao: configuracoes.pontosIndicacao,
            pontosAvaliacao: configuracoes.pontosAvaliacao,
            nivelPrata: configuracoes.niveis.prata,
            nivelOuro: configuracoes.niveis.ouro,
            nivelDiamante: configuracoes.niveis.diamante
        };
        
        for (const [id, value] of Object.entries(inputs)) {
            const el = document.getElementById(id);
            if (el) el.value = value;
        }
        
        console.log("✅ Configurações carregadas");
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
    }
}

// Salvar configurações
async function salvarConfiguracoes() {
    try {
        const novasConfigs = {
            pontosPorRealServico: parseFloat(document.getElementById("pontosPorRealServico")?.value || 1),
            pontosPorRealProduto: parseFloat(document.getElementById("pontosPorRealProduto")?.value || 0.5),
            pontosAniversario: parseInt(document.getElementById("pontosAniversario")?.value || 100),
            pontosIndicacao: parseInt(document.getElementById("pontosIndicacao")?.value || 50),
            pontosAvaliacao: parseInt(document.getElementById("pontosAvaliacao")?.value || 20),
            niveis: {
                bronze: 0,
                prata: parseInt(document.getElementById("nivelPrata")?.value || 500),
                ouro: parseInt(document.getElementById("nivelOuro")?.value || 1500),
                diamante: parseInt(document.getElementById("nivelDiamante")?.value || 5000)
            },
            updatedAt: Timestamp.now()
        };
        
        await setDoc(doc(db, "configuracoes", "fidelidade"), novasConfigs, { merge: true });
        configuracoes = novasConfigs;
        mostrarToast("Configurações salvas com sucesso!");
        fecharModalConfiguracoes();
        
        // Recalcular pontos com as novas configurações
        await calcularPontosTodosClientes();
        
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        mostrarToast("Erro ao salvar configurações", "erro");
    }
}

// Calcular pontos reais do cliente baseado APENAS em comandas finalizadas
async function calcularPontosReaisCliente(clienteId, clienteNome) {
    try {
        let totalPontos = 0;
        let totalGasto = 0;
        
        // Buscar SOMENTE comandas finalizadas (FONTE OFICIAL)
        const comandasQuery = query(
            collection(db, "comandas"),
            where("clienteId", "==", clienteId),
            where("status", "==", "finalizada")
        );
        const comandasSnap = await getDocs(comandasQuery);
        
        comandasSnap.forEach(doc => {
            const comanda = doc.data();
            const valorTotal = comanda.total || 0;
            totalGasto += valorTotal;
            // Usa a configuração de pontos (serviços + produtos)
            totalPontos += Math.floor(valorTotal * (configuracoes.pontosPorRealServico || 1));
        });
        
        console.log(`📊 Cliente: ${clienteNome} | Total gasto: R$ ${totalGasto} | Pontos: ${totalPontos}`);
        
        return {
            pontos: totalPontos,
            pontosGanhos: totalPontos,
            totalGasto: totalGasto
        };
        
    } catch (error) {
        console.error(`Erro ao calcular pontos para cliente ${clienteNome}:`, error);
        return { pontos: 0, pontosGanhos: 0, totalGasto: 0 };
    }
}

// Calcular pontos para todos os clientes
async function calcularPontosTodosClientes() {
    if (isUpdating) return;
    isUpdating = true;
    
    console.log("🔄 Calculando pontos de todos os clientes baseado em comandas...");
    
    const clientesAtualizados = [];
    
    for (const cliente of todosClientes) {
        try {
            const pontosReais = await calcularPontosReaisCliente(cliente.id, cliente.nome);
            clientesAtualizados.push({
                id: cliente.id,
                clienteId: cliente.id,
                nome: cliente.nome || "Cliente",
                telefone: cliente.telefone || "",
                email: cliente.email || "",
                pontos: pontosReais.pontos,
                pontosGanhos: pontosReais.pontosGanhos,
                totalGasto: pontosReais.totalGasto,
                totalResgatados: 0
            });
        } catch (error) {
            console.error(`Erro ao processar cliente ${cliente.nome}:`, error);
        }
    }
    
    // Ordenar por pontos (decrescente)
    clientesAtualizados.sort((a, b) => b.pontos - a.pontos);
    clientesFidelidade = clientesAtualizados;
    
    isUpdating = false;
    console.log(`✅ ${clientesFidelidade.length} clientes processados (apenas comandas)`);
    
    // Renderizar
    renderizarClientesFidelidade(clientesFidelidade);
    atualizarRanking();
    atualizarMetricas();
}

// Carregar clientes diretamente da coleção clientes
function carregarClientesDireto() {
    console.log("🔄 Carregando clientes diretamente da coleção...");
    const q = query(collection(db, "clientes"), orderBy("nome", "asc"));
    
    onSnapshot(q, (snapshot) => {
        todosClientes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            todosClientes.push({ 
                id: doc.id, 
                nome: data.nome || "Cliente",
                telefone: data.telefone || "",
                email: data.email || "",
                totalAgendamentos: data.totalAgendamentos || 0
            });
        });
        console.log(`✅ ${todosClientes.length} clientes carregados da coleção clientes`);
        
        // Calcular pontos para todos os clientes
        calcularPontosTodosClientes();
    }, (error) => {
        console.error("Erro ao carregar clientes:", error);
        if (clientesFidelidadeGrid) {
            clientesFidelidadeGrid.innerHTML = `
                <div class="empty-comandas">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar clientes. Verifique sua conexão.</p>
                    <button class="btn-primary" onclick="location.reload()">Tentar Novamente</button>
                </div>
            `;
        }
    });
}

// Escutar mudanças APENAS em comandas (fonte oficial)
function iniciarListenersTempoReal() {
    if (unsubscribeComandas) unsubscribeComandas();
    unsubscribeComandas = onSnapshot(
        query(collection(db, "comandas")),
        async () => {
            console.log("🔄 Mudança detectada em comandas, recalculando pontos...");
            await calcularPontosTodosClientes();
        },
        (error) => console.error("Erro no listener de comandas:", error)
    );
}

// Carregar serviços e produtos para seleção
async function carregarItensParaRecompensa() {
    try {
        const servicosSnap = await getDocs(collection(db, "servicos"));
        servicosDisponiveis = servicosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const produtosSnap = await getDocs(collection(db, "produtos"));
        produtosDisponiveis = produtosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log(`✅ ${servicosDisponiveis.length} serviços e ${produtosDisponiveis.length} produtos carregados`);
    } catch (error) {
        console.error("Erro ao carregar itens:", error);
        servicosDisponiveis = [];
        produtosDisponiveis = [];
    }
}

// Abrir modal de seleção de item (serviço/produto)
function abrirModalSelecionarItem(tipo, callback) {
    const items = tipo === 'servico' ? servicosDisponiveis : produtosDisponiveis;
    const titulo = tipo === 'servico' ? 'Selecione um Serviço' : 'Selecione um Produto';
    
    if (items.length === 0) {
        mostrarToast(`Nenhum ${tipo} cadastrado.`, "erro");
        return;
    }
    
    let modalSelecao = document.getElementById('modalSelecionarItem');
    if (modalSelecao) modalSelecao.remove();
    
    modalSelecao = document.createElement('div');
    modalSelecao.id = 'modalSelecionarItem';
    modalSelecao.className = 'modal';
    modalSelecao.innerHTML = `
        <div class="modal-content modal-small">
            <div class="modal-header">
                <h2><i class="fa-solid fa-list"></i> ${titulo}</h2>
                <button class="modal-close-item modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="items-lista" style="max-height: 400px; overflow-y: auto;">
                    ${items.map(item => `
                        <div class="item-checkbox" data-id="${item.id}" data-nome="${escapeHtml(item.nome)}" data-preco="${item.preco || 0}">
                            <label style="flex: 1; cursor: pointer;">${escapeHtml(item.nome)} - ${formatarMoeda(item.preco || 0)}</label>
                        </div>
                    `).join('')}
                </div>
                <div class="form-actions">
                    <button class="btn-cancel-item btn-cancel">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalSelecao);
    
    modalSelecao.classList.add('active');
    
    modalSelecao.querySelectorAll('.item-checkbox').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            const nome = item.getAttribute('data-nome');
            modalSelecao.classList.remove('active');
            setTimeout(() => modalSelecao.remove(), 300);
            callback({ id, nome });
        });
    });
    
    modalSelecao.querySelectorAll('.modal-close-item, .btn-cancel-item').forEach(btn => {
        btn.addEventListener('click', () => {
            modalSelecao.classList.remove('active');
            setTimeout(() => modalSelecao.remove(), 300);
        });
    });
}

// Aplicar filtros
function aplicarFiltros() {
    let filtrados = [...clientesFidelidade];
    
    if (currentFilter) {
        filtrados = filtrados.filter(c => 
            c.nome?.toLowerCase().includes(currentFilter.toLowerCase()) ||
            c.telefone?.includes(currentFilter)
        );
    }
    
    if (currentNivel) {
        filtrados = filtrados.filter(c => {
            const nivel = getNivel(c.pontos || 0);
            return nivel.classe === currentNivel;
        });
    }
    
    renderizarClientesFidelidade(filtrados);
}

// Renderizar clientes
function renderizarClientesFidelidade(clientes) {
    if (!clientesFidelidadeGrid) return;
    
    if (clientes.length === 0) {
        clientesFidelidadeGrid.innerHTML = `
            <div class="empty-comandas">
                <i class="fa-solid fa-star-of-life"></i>
                <p>Nenhum cliente encontrado</p>
            </div>
        `;
        return;
    }
    
    clientesFidelidadeGrid.innerHTML = clientes.map(cliente => {
        const nivel = getNivel(cliente.pontos || 0);
        const progresso = getProgressoProximoNivel(cliente.pontos || 0);
        
        return `
            <div class="cliente-fidelidade-card" data-id="${cliente.id}" data-clienteid="${cliente.clienteId || cliente.id}">
                <div class="cliente-header">
                    <div>
                        <h3>${escapeHtml(cliente.nome || 'Cliente')}</h3>
                        <div class="cliente-telefone"><i class="fa-solid fa-phone"></i> ${escapeHtml(cliente.telefone || '-')}</div>
                        <div class="cliente-telefone" style="font-size: 0.6rem; color: #10b981;">💰 Total gasto: ${formatarMoeda(cliente.totalGasto || 0)}</div>
                    </div>
                    <div class="cliente-nivel nivel-${nivel.classe}">${nivel.icone} ${nivel.nome}</div>
                </div>
                <div class="cliente-body">
                    <div class="pontos-info">
                        <span class="pontos-atual">${cliente.pontos || 0}</span>
                        <span class="pontos-label">pontos acumulados</span>
                    </div>
                    <div class="progresso-nivel">
                        <div class="label">Próximo nível: ${progresso.iconeProximo} ${progresso.proximoNivel}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${progresso.percentual}%"></div>
                        </div>
                        <div class="label" style="font-size: 0.6rem;">Faltam ${progresso.pontosFaltando} pontos</div>
                    </div>
                </div>
                <div class="cliente-footer">
                    <button class="btn-ver-pontos" data-id="${cliente.id}" data-clienteid="${cliente.clienteId || cliente.id}" data-nome="${escapeHtml(cliente.nome)}">
                        <i class="fa-solid fa-star"></i> Ver Pontos
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Adicionar eventos aos botões dos cards
    setTimeout(() => {
        document.querySelectorAll('.btn-ver-pontos').forEach(btn => {
            btn.removeEventListener('click', window.handleCardButtonClick);
            
            window.handleCardButtonClick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                const cliente = clientesFidelidade.find(c => c.id === id);
                if (cliente) {
                    abrirModalPontosCliente(cliente);
                } else {
                    mostrarToast("Erro ao carregar dados do cliente", "erro");
                }
            };
            btn.addEventListener('click', window.handleCardButtonClick);
        });
        
        document.querySelectorAll('.cliente-fidelidade-card').forEach(card => {
            card.removeEventListener('click', window.handleCardClick);
            
            window.handleCardClick = function(e) {
                if (!e.target.closest('.btn-ver-pontos')) {
                    const id = this.getAttribute('data-id');
                    const cliente = clientesFidelidade.find(c => c.id === id);
                    if (cliente) {
                        abrirModalPontosCliente(cliente);
                    }
                }
            };
            card.addEventListener('click', window.handleCardClick);
        });
    }, 100);
}

// Atualizar ranking
function atualizarRanking() {
    if (!rankingList) return;
    
    const topClientes = [...clientesFidelidade]
        .sort((a, b) => (b.pontos || 0) - (a.pontos || 0))
        .slice(0, 10);
    
    if (topClientes.length === 0) {
        rankingList.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum cliente no ranking</td></tr>';
        return;
    }
    
    rankingList.innerHTML = topClientes.map((cliente, index) => {
        const nivel = getNivel(cliente.pontos || 0);
        let medalha = "";
        if (index === 0) medalha = "🥇";
        else if (index === 1) medalha = "🥈";
        else if (index === 2) medalha = "🥉";
        else medalha = `${index + 1}º`;
        
        return `
            <tr data-id="${cliente.id}" data-clienteid="${cliente.clienteId || cliente.id}">
                <td class="posicao-medalha">${medalha}</td>
                <td>
                    <strong>${escapeHtml(cliente.nome || 'Cliente')}</strong>
                    <div style="font-size: 0.6rem; color: #10b981; margin-top: 4px;">💰 Total gasto: ${formatarMoeda(cliente.totalGasto || 0)}</div>
                </td>
                <td><strong style="font-size: 1.1rem; color: #2199EF;">${cliente.pontos || 0}</strong> pts</td>
                <td><span class="nivel-badge nivel-${nivel.classe}">${nivel.icone} ${nivel.nome}</span></td>
                <td>
                    <button class="btn-ver-pontos-ranking" data-id="${cliente.id}" data-clienteid="${cliente.clienteId || cliente.id}" data-nome="${escapeHtml(cliente.nome)}" title="Ver detalhes">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Adicionar eventos aos botões do ranking
    setTimeout(() => {
        document.querySelectorAll('.btn-ver-pontos-ranking').forEach(btn => {
            btn.removeEventListener('click', window.handleRankingClick);
            
            window.handleRankingClick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const id = this.getAttribute('data-id');
                const cliente = clientesFidelidade.find(c => c.id === id);
                if (cliente) {
                    abrirModalPontosCliente(cliente);
                }
            };
            btn.addEventListener('click', window.handleRankingClick);
        });
        
        document.querySelectorAll('#rankingList tr').forEach(row => {
            row.removeEventListener('click', window.handleRowClick);
            
            window.handleRowClick = function(e) {
                if (!e.target.closest('.btn-ver-pontos-ranking')) {
                    const id = this.getAttribute('data-id');
                    const cliente = clientesFidelidade.find(c => c.id === id);
                    if (cliente) {
                        abrirModalPontosCliente(cliente);
                    }
                }
            };
            row.addEventListener('click', window.handleRowClick);
        });
    }, 100);
}

// Atualizar métricas
function atualizarMetricas() {
    const totalPontos = clientesFidelidade.reduce((sum, c) => sum + (c.pontos || 0), 0);
    const totalClientes = clientesFidelidade.length;
    const totalPontosGanhos = clientesFidelidade.reduce((sum, c) => sum + (c.pontosGanhos || 0), 0);
    
    if (totalPontosAtivosEl) totalPontosAtivosEl.textContent = totalPontos;
    if (totalClientesFidelidadeEl) totalClientesFidelidadeEl.textContent = totalClientes;
    if (totalPontosGanhosEl) totalPontosGanhosEl.textContent = totalPontosGanhos;
}

// Carregar recompensas
async function carregarRecompensas() {
    try {
        const recompensasSnap = await getDocs(query(collection(db, "recompensas"), orderBy("custo", "asc")));
        recompensas = recompensasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✅ ${recompensas.length} recompensas carregadas`);
        return recompensas;
    } catch (error) {
        console.error("Erro ao carregar recompensas:", error);
        return [];
    }
}

// Renderizar recompensas no admin
function renderizarRecompensasAdmin() {
    const grid = document.getElementById("recompensasAdminGrid");
    if (!grid) return;
    
    if (recompensas.length === 0) {
        grid.innerHTML = '<div class="empty-comandas">Nenhuma recompensa cadastrada</div>';
        return;
    }
    
    grid.innerHTML = recompensas.map(recompensa => {
        const categoriaIcone = {
            servico: "✂️",
            produto: "📦",
            desconto: "🏷️",
            brinde: "🎁"
        }[recompensa.categoria] || "🎁";
        
        let itemInfo = '';
        if (recompensa.itemId && recompensa.itemTipo === 'servico') {
            const servico = servicosDisponiveis.find(s => s.id === recompensa.itemId);
            if (servico) {
                itemInfo = `<div class="recompensa-item-link"><i class="fa-solid fa-cut"></i> Serviço: ${escapeHtml(servico.nome)}</div>`;
            }
        } else if (recompensa.itemId && recompensa.itemTipo === 'produto') {
            const produto = produtosDisponiveis.find(p => p.id === recompensa.itemId);
            if (produto) {
                itemInfo = `<div class="recompensa-item-link"><i class="fa-solid fa-box"></i> Produto: ${escapeHtml(produto.nome)}</div>`;
            }
        }
        
        return `
            <div class="recompensa-admin-card" style="background: var(--bg-dark); border-radius: 14px; padding: 14px; border: 1px solid var(--border-color); transition: all 0.3s ease; position: relative;">
                <div style="font-size: 1.8rem; margin-bottom: 10px;">${categoriaIcone}</div>
                <div style="font-weight: 700; font-size: 0.9rem; color: #fff; margin-bottom: 6px;">${escapeHtml(recompensa.nome)}</div>
                <div style="font-size: 0.75rem; color: #2199EF; font-weight: 600; margin-bottom: 8px;">${recompensa.custo} pontos</div>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 10px;">${escapeHtml(recompensa.descricao || '')}</div>
                ${itemInfo}
                <button class="btn-delete-recompensa" data-id="${recompensa.id}" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #ef4444; cursor: pointer;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-delete-recompensa').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (confirm("Excluir esta recompensa?")) {
                await deleteDoc(doc(db, "recompensas", id));
                await carregarRecompensas();
                renderizarRecompensasAdmin();
                mostrarToast("Recompensa excluída!");
            }
        });
    });
}

// Adicionar recompensa
async function adicionarRecompensa() {
    const nome = document.getElementById("novaRecompensaNome")?.value;
    const custo = parseInt(document.getElementById("novaRecompensaCusto")?.value);
    const categoria = document.getElementById("novaRecompensaCategoria")?.value;
    const descricao = document.getElementById("novaRecompensaDescricao")?.value;
    
    if (!nome || !custo || custo <= 0) {
        mostrarToast("Preencha nome e custo da recompensa", "erro");
        return;
    }
    
    if (categoria === 'servico' || categoria === 'produto') {
        const tipo = categoria === 'servico' ? 'servico' : 'produto';
        abrirModalSelecionarItem(tipo, async (item) => {
            if (!item) {
                mostrarToast("Selecione um item para a recompensa", "erro");
                return;
            }
            
            try {
                await addDoc(collection(db, "recompensas"), {
                    nome: nome,
                    custo: custo,
                    categoria: categoria,
                    descricao: descricao,
                    itemId: item.id,
                    itemNome: item.nome,
                    itemTipo: tipo,
                    ativo: true,
                    createdAt: Timestamp.now()
                });
                
                mostrarToast("Recompensa adicionada com sucesso!");
                
                document.getElementById("novaRecompensaNome").value = "";
                document.getElementById("novaRecompensaCusto").value = "";
                document.getElementById("novaRecompensaCategoria").value = "servico";
                document.getElementById("novaRecompensaDescricao").value = "";
                
                await carregarRecompensas();
                renderizarRecompensasAdmin();
                
            } catch (error) {
                console.error("Erro ao adicionar recompensa:", error);
                mostrarToast("Erro ao adicionar recompensa", "erro");
            }
        });
    } else {
        try {
            await addDoc(collection(db, "recompensas"), {
                nome: nome,
                custo: custo,
                categoria: categoria,
                descricao: descricao,
                ativo: true,
                createdAt: Timestamp.now()
            });
            
            mostrarToast("Recompensa adicionada com sucesso!");
            
            document.getElementById("novaRecompensaNome").value = "";
            document.getElementById("novaRecompensaCusto").value = "";
            document.getElementById("novaRecompensaCategoria").value = "servico";
            document.getElementById("novaRecompensaDescricao").value = "";
            
            await carregarRecompensas();
            renderizarRecompensasAdmin();
            
        } catch (error) {
            console.error("Erro ao adicionar recompensa:", error);
            mostrarToast("Erro ao adicionar recompensa", "erro");
        }
    }
}

// Renderizar recompensas disponíveis para o cliente
function renderizarRecompensasDisponiveis(recompensas, pontosCliente) {
    const container = document.getElementById("recompensasGrid");
    if (!container) return;
    
    const recompensasDisponiveis = recompensas.filter(r => r.ativo !== false);
    
    if (recompensasDisponiveis.length === 0) {
        container.innerHTML = '<div class="empty-comandas">Nenhuma recompensa disponível</div>';
        return;
    }
    
    container.innerHTML = recompensasDisponiveis.map(recompensa => {
        const podeResgatar = (pontosCliente || 0) >= recompensa.custo;
        const categoriaIcone = {
            servico: "✂️",
            produto: "📦",
            desconto: "🏷️",
            brinde: "🎁"
        }[recompensa.categoria] || "🎁";
        
        let itemInfo = '';
        if (recompensa.itemId && recompensa.itemTipo === 'servico') {
            const servico = servicosDisponiveis.find(s => s.id === recompensa.itemId);
            if (servico) {
                itemInfo = `<div style="font-size: 0.65rem; color: #f59e0b; margin-top: 4px;">🎯 ${escapeHtml(servico.nome)}</div>`;
            }
        } else if (recompensa.itemId && recompensa.itemTipo === 'produto') {
            const produto = produtosDisponiveis.find(p => p.id === recompensa.itemId);
            if (produto) {
                itemInfo = `<div style="font-size: 0.65rem; color: #f59e0b; margin-top: 4px;">📦 ${escapeHtml(produto.nome)}</div>`;
            }
        }
        
        return `
            <div class="recompensa-card" style="background: var(--bg-dark); border-radius: 12px; padding: 12px; text-align: center; border: 1px solid var(--border-color); transition: all 0.3s ease;">
                <div style="font-size: 1.5rem; margin-bottom: 8px;">${categoriaIcone}</div>
                <div style="font-weight: 700; font-size: 0.8rem; color: #fff; margin-bottom: 6px;">${escapeHtml(recompensa.nome)}</div>
                <div style="font-size: 0.7rem; color: #2199EF; font-weight: 600; margin: 6px 0;">${recompensa.custo} pontos</div>
                <div style="font-size: 0.7rem; color: #94a3b8;">${escapeHtml(recompensa.descricao || '')}</div>
                ${itemInfo}
                <button class="btn-resgatar" data-id="${recompensa.id}" data-nome="${escapeHtml(recompensa.nome)}" data-custo="${recompensa.custo}" ${!podeResgatar ? 'disabled' : ''} style="width: 100%; padding: 6px; background: linear-gradient(135deg, #2199EF, #1a7fcc); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: 600; font-size: 0.7rem; margin-top: 10px;">
                    ${podeResgatar ? 'Resgatar' : 'Pontos insuficientes'}
                </button>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-resgatar').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            const custo = parseInt(btn.getAttribute('data-custo'));
            recompensaSelecionada = { id, nome, custo };
            abrirModalResgatarRecompensa();
        });
    });
}

// Abrir modal de pontos do cliente
async function abrirModalPontosCliente(cliente) {
    if (!cliente) {
        console.error("Cliente não encontrado");
        mostrarToast("Erro ao carregar dados do cliente", "erro");
        return;
    }
    
    console.log("📱 Abrindo modal para cliente:", cliente.nome);
    clienteSelecionado = cliente;
    
    try {
        const clienteIdParaBusca = cliente.clienteId || cliente.id;
        
        const historicoQuery = query(
            collection(db, "historico_pontos"),
            where("clienteId", "==", clienteIdParaBusca),
            orderBy("data", "desc")
        );
        const historicoSnap = await getDocs(historicoQuery);
        const historico = historicoSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const resgatadasQuery = query(
            collection(db, "recompensas_resgatadas"),
            where("clienteId", "==", clienteIdParaBusca),
            orderBy("dataResgate", "desc")
        );
        const resgatadasSnap = await getDocs(resgatadasQuery);
        const resgatadas = resgatadasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const nivel = getNivel(cliente.pontos || 0);
        const progresso = getProgressoProximoNivel(cliente.pontos || 0);
        
        const modalTitle = document.getElementById("modalPontosTitle");
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-star"></i> ${escapeHtml(cliente.nome)} - Programa Fidelidade`;
        
        const clienteInfoCard = document.getElementById("clienteInfoCard");
        if (clienteInfoCard) {
            clienteInfoCard.innerHTML = `
                <div class="info">
                    <h4>${escapeHtml(cliente.nome)}</h4>
                    <p><i class="fa-solid fa-phone"></i> ${escapeHtml(cliente.telefone || '-')}</p>
                    <p><i class="fa-solid fa-envelope"></i> ${escapeHtml(cliente.email || '-')}</p>
                    <p><i class="fa-solid fa-dollar-sign"></i> Total gasto: ${formatarMoeda(cliente.totalGasto || 0)}</p>
                </div>
                <div class="nivel-grande nivel-${nivel.classe}">${nivel.icone} ${nivel.nome}</div>
            `;
        }
        
        const pontosAtuais = document.getElementById("pontosAtuais");
        if (pontosAtuais) pontosAtuais.textContent = cliente.pontos || 0;
        
        const pontosGanhos = document.getElementById("pontosGanhos");
        if (pontosGanhos) pontosGanhos.textContent = cliente.pontosGanhos || 0;
        
        const proximoNivel = document.getElementById("proximoNivel");
        if (proximoNivel) proximoNivel.textContent = `${progresso.iconeProximo} ${progresso.proximoNivel}`;
        
        const pontosProximoNivel = document.getElementById("pontosProximoNivel");
        if (pontosProximoNivel) pontosProximoNivel.textContent = progresso.pontosFaltando;
        
        const nivelAtualIcone = document.getElementById("nivelAtualIcone");
        if (nivelAtualIcone) nivelAtualIcone.textContent = nivel.icone;
        
        const nivelAtualTexto = document.getElementById("nivelAtualTexto");
        if (nivelAtualTexto) nivelAtualTexto.textContent = nivel.nome;
        
        const nivelProximoIcone = document.getElementById("nivelProximoIcone");
        if (nivelProximoIcone) nivelProximoIcone.textContent = progresso.iconeProximo;
        
        const nivelProximoTexto = document.getElementById("nivelProximoTexto");
        if (nivelProximoTexto) nivelProximoTexto.textContent = progresso.proximoNivel;
        
        const progressoNivel = document.getElementById("progressoNivel");
        if (progressoNivel) progressoNivel.style.width = `${progresso.percentual}%`;
        
        renderizarHistoricoPontos(historico);
        
        await carregarRecompensas();
        renderizarRecompensasDisponiveis(recompensas, cliente.pontos || 0);
        renderizarRecompensasResgatadas(resgatadas);
        
        if (modalPontosCliente) modalPontosCliente.classList.add("active");
        
    } catch (error) {
        console.error("Erro ao abrir modal:", error);
        mostrarToast("Erro ao carregar dados", "erro");
    }
}

function renderizarHistoricoPontos(historico) {
    const container = document.getElementById("historicoPontosLista");
    if (!container) return;
    
    if (historico.length === 0) {
        container.innerHTML = '<div class="empty-comandas">Nenhum registro de pontos</div>';
        return;
    }
    
    container.innerHTML = historico.map(item => {
        let data = item.data;
        if (data?.toDate) data = data.toDate();
        else if (data?.seconds) data = new Date(data.seconds * 1000);
        else if (typeof data === 'string') data = new Date(data);
        
        const dataFormatada = data instanceof Date && !isNaN(data) ? data.toLocaleDateString('pt-BR') : 'Data inválida';
        const classePontos = item.quantidade >= 0 ? 'positivo' : 'negativo';
        const sinal = item.quantidade >= 0 ? '+' : '';
        
        return `
            <div class="historico-item">
                <div class="historico-header">
                    <span class="historico-tipo">${escapeHtml(item.motivo || 'Motivo não informado')}</span>
                    <span class="historico-data">${dataFormatada}</span>
                </div>
                <div class="historico-pontos ${classePontos}">${sinal}${item.quantidade} pontos</div>
                ${item.observacao ? `<div class="historico-motivo">${escapeHtml(item.observacao)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderizarRecompensasResgatadas(resgatadas) {
    const container = document.getElementById("recompensasResgatadasLista");
    if (!container) return;
    
    if (resgatadas.length === 0) {
        container.innerHTML = '<div class="empty-comandas">Nenhuma recompensa resgatada</div>';
        return;
    }
    
    container.innerHTML = resgatadas.map(item => {
        let data = item.dataResgate;
        if (data?.toDate) data = data.toDate();
        else if (data?.seconds) data = new Date(data.seconds * 1000);
        else if (typeof data === 'string') data = new Date(data);
        
        const dataFormatada = data instanceof Date && !isNaN(data) ? data.toLocaleDateString('pt-BR') : 'Data inválida';
        
        const statusClass = item.status === "utilizado" ? "status-utilizado" : "status-resgatado";
        const statusText = item.status === "utilizado" ? "Utilizado" : "Resgatado";
        
        return `
            <div class="recompensa-resgatada-item">
                <div>
                    <h4>${escapeHtml(item.recompensaNome)}</h4>
                    <p>Resgatado em: ${dataFormatada}</p>
                    ${item.codigo ? `<p>Código: <strong>${item.codigo}</strong></p>` : ''}
                </div>
                <div>
                    <span class="recompensa-resgatada-status ${statusClass}">${statusText}</span>
                    ${item.status !== "utilizado" ? `<button class="btn-marcar-utilizado" data-id="${item.id}" style="margin-left: 8px; padding: 4px 8px; background: #2199EF; border: none; border-radius: 8px; color: white; cursor: pointer;">Utilizar</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-marcar-utilizado').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            await updateDoc(doc(db, "recompensas_resgatadas", id), {
                status: "utilizado",
                dataUtilizacao: Timestamp.now()
            });
            mostrarToast("Recompensa marcada como utilizada!");
            if (clienteSelecionado) {
                const resgatadasQuery = query(
                    collection(db, "recompensas_resgatadas"),
                    where("clienteId", "==", clienteSelecionado.clienteId || clienteSelecionado.id),
                    orderBy("dataResgate", "desc")
                );
                const resgatadasSnap = await getDocs(resgatadasQuery);
                renderizarRecompensasResgatadas(resgatadasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
        });
    });
}

// Adicionar pontos
async function adicionarPontos(event) {
    event.preventDefault();
    
    if (!clienteSelecionado) {
        mostrarToast("Nenhum cliente selecionado", "erro");
        return;
    }
    
    const motivo = document.getElementById("motivoPontos")?.value;
    const quantidade = parseInt(document.getElementById("quantidadePontos")?.value);
    const observacao = document.getElementById("observacaoPontos")?.value;
    
    if (!motivo || !quantidade || quantidade <= 0) {
        mostrarToast("Preencha todos os campos", "erro");
        return;
    }
    
    try {
        const novosPontos = (clienteSelecionado.pontos || 0) + quantidade;
        const novosPontosGanhos = (clienteSelecionado.pontosGanhos || 0) + quantidade;
        
        // Atualizar no array local
        clienteSelecionado.pontos = novosPontos;
        clienteSelecionado.pontosGanhos = novosPontosGanhos;
        
        // Registrar no histórico
        await addDoc(collection(db, "historico_pontos"), {
            clienteId: clienteSelecionado.clienteId || clienteSelecionado.id,
            clienteNome: clienteSelecionado.nome,
            quantidade: quantidade,
            motivo: motivo,
            observacao: observacao,
            data: Timestamp.now()
        });
        
        mostrarToast(`${quantidade} pontos adicionados com sucesso!`);
        fecharModalAdicionarPontos();
        
        // Atualizar UI do modal
        const pontosAtuais = document.getElementById("pontosAtuais");
        if (pontosAtuais) pontosAtuais.textContent = novosPontos;
        
        const pontosGanhos = document.getElementById("pontosGanhos");
        if (pontosGanhos) pontosGanhos.textContent = novosPontosGanhos;
        
        const progresso = getProgressoProximoNivel(novosPontos);
        const pontosProximoNivel = document.getElementById("pontosProximoNivel");
        if (pontosProximoNivel) pontosProximoNivel.textContent = progresso.pontosFaltando;
        
        const progressoNivel = document.getElementById("progressoNivel");
        if (progressoNivel) progressoNivel.style.width = `${progresso.percentual}%`;
        
        // Recarregar histórico
        const historicoQuery = query(
            collection(db, "historico_pontos"),
            where("clienteId", "==", clienteSelecionado.clienteId || clienteSelecionado.id),
            orderBy("data", "desc")
        );
        const historicoSnap = await getDocs(historicoQuery);
        renderizarHistoricoPontos(historicoSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        // Atualizar ranking e lista
        await calcularPontosTodosClientes();
        
    } catch (error) {
        console.error("Erro ao adicionar pontos:", error);
        mostrarToast("Erro ao adicionar pontos", "erro");
    }
}

// Resgatar recompensa
async function confirmarResgate() {
    if (!clienteSelecionado || !recompensaSelecionada) return;
    
    if ((clienteSelecionado.pontos || 0) < recompensaSelecionada.custo) {
        mostrarToast("Pontos insuficientes para resgatar esta recompensa", "erro");
        fecharModalResgatarRecompensa();
        return;
    }
    
    try {
        const novosPontos = (clienteSelecionado.pontos || 0) - recompensaSelecionada.custo;
        const novosResgatados = (clienteSelecionado.totalResgatados || 0) + 1;
        
        clienteSelecionado.pontos = novosPontos;
        clienteSelecionado.totalResgatados = novosResgatados;
        
        await addDoc(collection(db, "historico_pontos"), {
            clienteId: clienteSelecionado.clienteId || clienteSelecionado.id,
            clienteNome: clienteSelecionado.nome,
            quantidade: -recompensaSelecionada.custo,
            motivo: `Resgate: ${recompensaSelecionada.nome}`,
            data: Timestamp.now()
        });
        
        const codigoResgate = `SC-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        
        await addDoc(collection(db, "recompensas_resgatadas"), {
            clienteId: clienteSelecionado.clienteId || clienteSelecionado.id,
            clienteNome: clienteSelecionado.nome,
            recompensaId: recompensaSelecionada.id,
            recompensaNome: recompensaSelecionada.nome,
            custo: recompensaSelecionada.custo,
            codigo: codigoResgate,
            status: "resgatado",
            dataResgate: Timestamp.now()
        });
        
        mostrarToast(`Recompensa "${recompensaSelecionada.nome}" resgatada com sucesso! Código: ${codigoResgate}`, "sucesso");
        
        const pontosAtuais = document.getElementById("pontosAtuais");
        if (pontosAtuais) pontosAtuais.textContent = novosPontos;
        
        await carregarRecompensas();
        renderizarRecompensasDisponiveis(recompensas, novosPontos);
        
        const resgatadasQuery = query(
            collection(db, "recompensas_resgatadas"),
            where("clienteId", "==", clienteSelecionado.clienteId || clienteSelecionado.id),
            orderBy("dataResgate", "desc")
        );
        const resgatadasSnap = await getDocs(resgatadasQuery);
        renderizarRecompensasResgatadas(resgatadasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        // Atualizar ranking e lista
        await calcularPontosTodosClientes();
        
        fecharModalResgatarRecompensa();
        
    } catch (error) {
        console.error("Erro ao resgatar recompensa:", error);
        mostrarToast("Erro ao resgatar recompensa", "erro");
    }
}

// Funções de modal
function abrirModalAdicionarPontos() {
    const motivoPontos = document.getElementById("motivoPontos");
    const quantidadePontos = document.getElementById("quantidadePontos");
    const observacaoPontos = document.getElementById("observacaoPontos");
    
    if (motivoPontos) motivoPontos.value = "";
    if (quantidadePontos) quantidadePontos.value = "";
    if (observacaoPontos) observacaoPontos.value = "";
    
    if (modalAdicionarPontos) modalAdicionarPontos.classList.add("active");
}

function fecharModalAdicionarPontos() {
    if (modalAdicionarPontos) modalAdicionarPontos.classList.remove("active");
}

function abrirModalResgatarRecompensa() {
    if (recompensaSelecionada) {
        const resgateRecompensaNome = document.getElementById("resgateRecompensaNome");
        const resgateRecompensaCusto = document.getElementById("resgateRecompensaCusto");
        
        if (resgateRecompensaNome) resgateRecompensaNome.textContent = recompensaSelecionada.nome;
        if (resgateRecompensaCusto) resgateRecompensaCusto.textContent = recompensaSelecionada.custo;
        
        if (modalResgatarRecompensa) modalResgatarRecompensa.classList.add("active");
    }
}

function fecharModalResgatarRecompensa() {
    if (modalResgatarRecompensa) modalResgatarRecompensa.classList.remove("active");
    recompensaSelecionada = null;
}

function abrirModalConfiguracoes() {
    if (modalConfiguracoes) modalConfiguracoes.classList.add("active");
}

function fecharModalConfiguracoes() {
    if (modalConfiguracoes) modalConfiguracoes.classList.remove("active");
}

function abrirModalGerenciarRecompensas() {
    carregarItensParaRecompensa();
    renderizarRecompensasAdmin();
    if (modalGerenciarRecompensas) modalGerenciarRecompensas.classList.add("active");
}

function fecharModalGerenciarRecompensas() {
    if (modalGerenciarRecompensas) modalGerenciarRecompensas.classList.remove("active");
}

function fecharModalPontosCliente() {
    if (modalPontosCliente) modalPontosCliente.classList.remove("active");
    clienteSelecionado = null;
}

// Configurar event listeners
function setupEventListeners() {
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentFilter = e.target.value;
            aplicarFiltros();
        });
    }
    
    if (filterNivel) {
        filterNivel.addEventListener("change", (e) => {
            currentNivel = e.target.value;
            aplicarFiltros();
        });
    }
    
    if (btnLimparFiltros) {
        btnLimparFiltros.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (filterNivel) filterNivel.value = "";
            currentFilter = "";
            currentNivel = "";
            aplicarFiltros();
        });
    }
    
    if (btnConfigurarPontos) {
        btnConfigurarPontos.addEventListener("click", () => {
            abrirModalGerenciarRecompensas();
        });
    }
    
    if (formAdicionarPontos) {
        formAdicionarPontos.addEventListener("submit", adicionarPontos);
    }
    
    if (formConfiguracoes) {
        formConfiguracoes.addEventListener("submit", (e) => {
            e.preventDefault();
            salvarConfiguracoes();
        });
    }
    
    const btnAdicionarPontosEl = document.getElementById("btnAdicionarPontos");
    if (btnAdicionarPontosEl) btnAdicionarPontosEl.addEventListener("click", abrirModalAdicionarPontos);
    
    const btnSalvarRecompensaEl = document.getElementById("btnSalvarRecompensa");
    if (btnSalvarRecompensaEl) btnSalvarRecompensaEl.addEventListener("click", adicionarRecompensa);
    
    const confirmarResgateEl = document.getElementById("confirmarResgate");
    if (confirmarResgateEl) confirmarResgateEl.addEventListener("click", confirmarResgate);
    
    // Fechar modais
    document.querySelectorAll(".modal-close-pontos, .btn-cancel-pontos").forEach(btn => {
        btn.addEventListener("click", fecharModalPontosCliente);
    });
    
    document.querySelectorAll(".modal-close-add-pontos, .btn-cancel-add-pontos").forEach(btn => {
        btn.addEventListener("click", fecharModalAdicionarPontos);
    });
    
    document.querySelectorAll(".modal-close-config, .btn-cancel-config").forEach(btn => {
        btn.addEventListener("click", fecharModalConfiguracoes);
    });
    
    document.querySelectorAll(".modal-close-recompensas").forEach(btn => {
        btn.addEventListener("click", fecharModalGerenciarRecompensas);
    });
    
    document.querySelectorAll(".modal-close-resgate, .btn-cancel-resgate").forEach(btn => {
        btn.addEventListener("click", fecharModalResgatarRecompensa);
    });
    
    window.addEventListener("click", (e) => {
        if (e.target === modalPontosCliente) fecharModalPontosCliente();
        if (e.target === modalAdicionarPontos) fecharModalAdicionarPontos();
        if (e.target === modalConfiguracoes) fecharModalConfiguracoes();
        if (e.target === modalGerenciarRecompensas) fecharModalGerenciarRecompensas();
        if (e.target === modalResgatarRecompensa) fecharModalResgatarRecompensa();
    });
    
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabId = `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
            const tabElement = document.getElementById(tabId);
            if (tabElement) tabElement.classList.add('active');
        });
    });
}

// Inicializar
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        console.log("✅ Usuário logado:", user.email);
        setupEventListeners();
        await carregarConfiguracoes();
        await carregarRecompensas();
        await carregarItensParaRecompensa();
        
        // Carregar clientes diretamente da coleção clientes
        carregarClientesDireto();
        
        // Iniciar listeners em tempo real (apenas comandas)
        iniciarListenersTempoReal();
    }
});

const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = "login.html";
    };
}

console.log("✅ fidelidade.js carregado com sucesso - usando apenas comandas para contabilizar pontos!");