import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    updateDoc,
    doc,
    getDocs,
    getDoc,
    setDoc,
    query,
    orderBy,
    where,
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

let profissionais = [];
let servicos = [];
let produtos = [];
let agendamentos = [];
let comandas = [];
let configComissoes = {
    comissaoPadrao: 30,
    comissoesPorServico: {},
    comissoesPorProduto: {},
    comissoesPorProfissional: {}
};
let comissoesChart = null;

// Elementos DOM
const comissoesBody = document.getElementById('comissoesBody');
const rankingContainer = document.getElementById('rankingContainer');
const filterPeriodo = document.getElementById('filterPeriodo');
const filterBarbeiro = document.getElementById('filterBarbeiro');
const searchInput = document.getElementById('searchServico');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnConfigComissoes = document.getElementById('btnConfigComissoes');
const modalConfigComissoes = document.getElementById('modalConfigComissoes');
const modalEditarComissao = document.getElementById('modalEditarComissao');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let atendimentoEditando = null;

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

function formatarData(data) {
    if (!data) return '-';
    if (data.toDate) data = data.toDate();
    if (data.seconds) data = new Date(data.seconds * 1000);
    if (typeof data === 'string') data = new Date(data);
    if (isNaN(data.getTime())) return '-';
    return data.toLocaleDateString('pt-BR');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getPeriodoData() {
    const hoje = new Date();
    const periodo = filterPeriodo?.value || 'mes';
    let dataInicio, dataFim;
    
    switch(periodo) {
        case 'mes':
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
            break;
        case 'mes_passado':
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
            break;
        case 'trimestre':
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
            dataFim = hoje;
            break;
        case 'semestre':
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1);
            dataFim = hoje;
            break;
        case 'ano':
            dataInicio = new Date(hoje.getFullYear(), 0, 1);
            dataFim = new Date(hoje.getFullYear(), 11, 31);
            break;
        case 'todos':
            dataInicio = new Date(2000, 0, 1);
            dataFim = new Date(2100, 11, 31);
            break;
        default:
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    }
    
    dataInicio.setHours(0, 0, 0, 0);
    dataFim.setHours(23, 59, 59, 999);
    
    return { dataInicio, dataFim };
}

function calcularComissao(valor, percentual) {
    return (valor * percentual) / 100;
}

function obterPercentualComissao(item) {
    const itemId = item.servicoId || item.produtoId;
    const tipo = item.tipo || (item.servicoId ? 'servico' : (item.produtoId ? 'produto' : null));
    const profissionalId = item.profissionalId;
    
    if (item.comissaoPercentual) {
        return item.comissaoPercentual;
    }
    
    if (tipo === 'servico' && configComissoes.comissoesPorServico && configComissoes.comissoesPorServico[itemId]) {
        return configComissoes.comissoesPorServico[itemId];
    }
    
    if (tipo === 'produto' && configComissoes.comissoesPorProduto && configComissoes.comissoesPorProduto[itemId]) {
        return configComissoes.comissoesPorProduto[itemId];
    }
    
    if (configComissoes.comissoesPorProfissional && configComissoes.comissoesPorProfissional[profissionalId]) {
        return configComissoes.comissoesPorProfissional[profissionalId];
    }
    
    return configComissoes.comissaoPadrao || 30;
}

function carregarDados() {
    console.log("🔄 Carregando dados de comissões...");
    
    // Carregar profissionais
    const profissionaisRef = collection(db, "profissionais");
    onSnapshot(profissionaisRef, (snapshot) => {
        profissionais = [];
        snapshot.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        console.log(`✅ Profissionais carregados: ${profissionais.length}`);
        atualizarSelectBarbeiros();
        renderizarTudo();
    }, (error) => {
        console.error("❌ Erro ao carregar profissionais:", error);
        profissionais = [];
        renderizarTudo();
    });
    
    // Carregar serviços
    const servicosRef = collection(db, "servicos");
    onSnapshot(servicosRef, (snapshot) => {
        servicos = [];
        snapshot.forEach(doc => {
            servicos.push({ id: doc.id, ...doc.data() });
        });
        console.log(`✅ Serviços carregados: ${servicos.length}`);
        renderizarTudo();
    }, (error) => {
        console.error("❌ Erro ao carregar serviços:", error);
        servicos = [];
        renderizarTudo();
    });
    
    // Carregar produtos
    const produtosRef = collection(db, "produtos");
    onSnapshot(produtosRef, (snapshot) => {
        produtos = [];
        snapshot.forEach(doc => {
            produtos.push({ id: doc.id, ...doc.data() });
        });
        console.log(`✅ Produtos carregados: ${produtos.length}`);
        renderizarTudo();
    }, (error) => {
        console.error("❌ Erro ao carregar produtos:", error);
        produtos = [];
        renderizarTudo();
    });
    
    // Carregar agendamentos concluídos
    const agendamentosRef = collection(db, "agendamentos");
    const q = query(agendamentosRef, where("status", "==", "concluido"));
    onSnapshot(q, (snapshot) => {
        agendamentos = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            agendamentos.push({ id: doc.id, ...data });
        });
        console.log(`✅ Agendamentos concluídos: ${agendamentos.length}`);
        renderizarTudo();
    }, (error) => {
        console.error("❌ Erro ao carregar agendamentos:", error);
        agendamentos = [];
        renderizarTudo();
    });
    
    // Carregar comandas
    const comandasRef = collection(db, "comandas");
    const qComandas = query(comandasRef, where("status", "==", "finalizada"));
    onSnapshot(qComandas, (snapshot) => {
        comandas = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            comandas.push({ id: doc.id, ...data });
        });
        console.log(`✅ Comandas finalizadas: ${comandas.length}`);
        renderizarTudo();
    }, (error) => {
        console.error("❌ Erro ao carregar comandas:", error);
        comandas = [];
        renderizarTudo();
    });
}

function atualizarSelectBarbeiros() {
    const select = document.getElementById('filterBarbeiro');
    if (!select) return;
    
    select.innerHTML = '<option value="">Todos os barbeiros</option>';
    
    if (profissionais.length === 0) {
        select.innerHTML = '<option value="">Nenhum barbeiro cadastrado</option>';
        return;
    }
    
    profissionais.forEach(prof => {
        const nome = prof.nome || prof.name || 'Sem nome';
        select.innerHTML += `<option value="${prof.id}">${escapeHtml(nome)}</option>`;
    });
}

function renderizarTudo() {
    console.log("🔄 Renderizando tudo...");
    
    const { dataInicio, dataFim } = getPeriodoData();
    const barbeiroFilter = filterBarbeiro?.value;
    const searchTerm = searchInput?.value.toLowerCase() || '';
    
    let todosItens = [];
    
    // Processar agendamentos
    agendamentos.forEach(atendimento => {
        let dataAtendimento = atendimento.data || atendimento.dataAgendamento;
        if (dataAtendimento && typeof dataAtendimento === 'string') {
            dataAtendimento = new Date(dataAtendimento);
        }
        if (dataAtendimento && dataAtendimento.toDate) {
            dataAtendimento = dataAtendimento.toDate();
        }
        
        if (!dataAtendimento || isNaN(dataAtendimento.getTime())) {
            console.warn("Data inválida no agendamento:", atendimento.id);
            return;
        }
        
        if (dataAtendimento >= dataInicio && dataAtendimento <= dataFim) {
            const profissional = profissionais.find(p => p.id === atendimento.profissionalId);
            
            if (barbeiroFilter && profissional?.id !== barbeiroFilter) {
                return;
            }
            
            const servicosLista = atendimento.servicos || [];
            if (servicosLista.length > 0) {
                servicosLista.forEach(servicoItem => {
                    const servicoNome = servicoItem.nome || servicoItem;
                    const servicoEncontrado = servicos.find(s => s.nome === servicoNome);
                    const valor = servicoItem.preco || servicoItem.valor || 0;
                    const percentual = obterPercentualComissao({ 
                        servicoId: servicoEncontrado?.id, 
                        profissionalId: profissional?.id, 
                        tipo: 'servico' 
                    });
                    const comissao = calcularComissao(valor, percentual);
                    
                    if (!searchTerm || servicoNome.toLowerCase().includes(searchTerm)) {
                        todosItens.push({
                            id: atendimento.id,
                            data: dataAtendimento,
                            cliente: atendimento.clienteNome || atendimento.cliente || 'Cliente',
                            nome: servicoNome,
                            tipo: 'serviço',
                            profissionalNome: profissional?.nome || atendimento.profissionalNome || 'Não definido',
                            profissionalId: profissional?.id,
                            valor: valor,
                            percentual: percentual,
                            comissao: comissao
                        });
                    }
                });
            } else if (atendimento.servico) {
                const servicoNome = atendimento.servico;
                const servicoEncontrado = servicos.find(s => s.nome === servicoNome);
                const valor = atendimento.valor || 0;
                const percentual = obterPercentualComissao({ 
                    servicoId: servicoEncontrado?.id, 
                    profissionalId: profissional?.id, 
                    tipo: 'servico' 
                });
                const comissao = calcularComissao(valor, percentual);
                
                if (!searchTerm || servicoNome.toLowerCase().includes(searchTerm)) {
                    todosItens.push({
                        id: atendimento.id,
                        data: dataAtendimento,
                        cliente: atendimento.clienteNome || atendimento.cliente || 'Cliente',
                        nome: servicoNome,
                        tipo: 'serviço',
                        profissionalNome: profissional?.nome || atendimento.profissionalNome || 'Não definido',
                        profissionalId: profissional?.id,
                        valor: valor,
                        percentual: percentual,
                        comissao: comissao
                    });
                }
            }
        }
    });
    
    // Processar comandas
    comandas.forEach(comanda => {
        let dataComanda = comanda.dataCriacao || comanda.data;
        if (dataComanda && dataComanda.toDate) {
            dataComanda = dataComanda.toDate();
        }
        if (dataComanda && typeof dataComanda === 'string') {
            dataComanda = new Date(dataComanda);
        }
        
        if (!dataComanda || isNaN(dataComanda.getTime())) {
            console.warn("Data inválida na comanda:", comanda.id);
            return;
        }
        
        if (dataComanda >= dataInicio && dataComanda <= dataFim) {
            const profissional = profissionais.find(p => p.id === comanda.barbeiroId);
            
            if (barbeiroFilter && profissional?.id !== barbeiroFilter) {
                return;
            }
            
            const produtosLista = comanda.produtos || [];
            produtosLista.forEach(produtoItem => {
                const produtoNome = produtoItem.nome;
                const produtoEncontrado = produtos.find(p => p.nome === produtoNome);
                const valor = (produtoItem.preco || 0) * (produtoItem.quantidade || 1);
                const percentual = obterPercentualComissao({ 
                    produtoId: produtoEncontrado?.id, 
                    profissionalId: profissional?.id, 
                    tipo: 'produto' 
                });
                const comissao = calcularComissao(valor, percentual);
                
                if (!searchTerm || produtoNome.toLowerCase().includes(searchTerm)) {
                    todosItens.push({
                        id: comanda.id,
                        data: dataComanda,
                        cliente: comanda.clienteNome || 'Cliente',
                        nome: `${produtoNome} ${(produtoItem.quantidade || 1) > 1 ? `(x${produtoItem.quantidade})` : ''}`,
                        tipo: 'produto',
                        profissionalNome: profissional?.nome || comanda.barbeiroNome || 'Não definido',
                        profissionalId: profissional?.id,
                        valor: valor,
                        percentual: percentual,
                        comissao: comissao
                    });
                }
            });
        }
    });
    
    console.log(`📊 Itens processados: ${todosItens.length}`);
    
    if (todosItens.length === 0) {
        console.log("⚠️ Nenhum item encontrado. Verifique se há dados no Firestore.");
    }
    
    atualizarEstatisticas(todosItens);
    atualizarRanking(todosItens);
    atualizarGrafico(todosItens);
    renderizarTabela(todosItens);
}

function atualizarEstatisticas(itens) {
    const totalComissoes = itens.reduce((sum, i) => sum + i.comissao, 0);
    const totalAtendimentos = itens.length;
    const mediaComissao = totalAtendimentos > 0 ? totalComissoes / totalAtendimentos : 0;
    
    const comissoesPorBarbeiro = {};
    itens.forEach(i => {
        const nome = i.profissionalNome;
        if (!comissoesPorBarbeiro[nome]) {
            comissoesPorBarbeiro[nome] = { comissao: 0, atendimentos: 0 };
        }
        comissoesPorBarbeiro[nome].comissao += i.comissao;
        comissoesPorBarbeiro[nome].atendimentos++;
    });
    
    let melhorBarbeiro = '-';
    let maiorComissao = 0;
    for (const [nome, dados] of Object.entries(comissoesPorBarbeiro)) {
        if (dados.comissao > maiorComissao) {
            maiorComissao = dados.comissao;
            melhorBarbeiro = nome;
        }
    }
    
    const totalComissoesEl = document.getElementById('totalComissoes');
    const mediaComissaoEl = document.getElementById('mediaComissao');
    const melhorBarbeiroEl = document.getElementById('melhorBarbeiro');
    const totalAtendimentosEl = document.getElementById('totalAtendimentos');
    
    if (totalComissoesEl) totalComissoesEl.textContent = formatarMoeda(totalComissoes);
    if (mediaComissaoEl) mediaComissaoEl.textContent = formatarMoeda(mediaComissao);
    if (melhorBarbeiroEl) melhorBarbeiroEl.textContent = melhorBarbeiro;
    if (totalAtendimentosEl) totalAtendimentosEl.textContent = totalAtendimentos;
}

function atualizarRanking(itens) {
    if (!rankingContainer) return;
    
    const comissoesPorBarbeiro = {};
    itens.forEach(i => {
        const nome = i.profissionalNome;
        if (!comissoesPorBarbeiro[nome]) {
            comissoesPorBarbeiro[nome] = { comissao: 0, atendimentos: 0 };
        }
        comissoesPorBarbeiro[nome].comissao += i.comissao;
        comissoesPorBarbeiro[nome].atendimentos++;
    });
    
    const ranking = Object.entries(comissoesPorBarbeiro)
        .map(([nome, dados]) => ({ nome, ...dados }))
        .sort((a, b) => b.comissao - a.comissao);
    
    if (ranking.length === 0) {
        rankingContainer.innerHTML = '<div class="loading-ranking">📭 Nenhum dado encontrado no período selecionado</div>';
        return;
    }
    
    rankingContainer.innerHTML = ranking.map((item, index) => {
        let positionClass = '';
        let medalIcon = '';
        if (index === 0) {
            positionClass = 'ouro';
            medalIcon = '🥇';
        } else if (index === 1) {
            positionClass = 'prata';
            medalIcon = '🥈';
        } else if (index === 2) {
            positionClass = 'bronze';
            medalIcon = '🥉';
        }
        
        return `
            <div class="ranking-item">
                <div class="ranking-position ${positionClass}">
                    ${medalIcon || (index + 1)}
                </div>
                <div class="ranking-info">
                    <div class="ranking-nome">${escapeHtml(item.nome)}</div>
                    <div class="ranking-meta">${item.atendimentos} atendimento(s)</div>
                </div>
                <div class="ranking-valores">
                    <div class="ranking-comissao">${formatarMoeda(item.comissao)}</div>
                    <div class="ranking-atendimentos">média: ${formatarMoeda(item.comissao / item.atendimentos)}</div>
                </div>
            </div>
        `;
    }).join('');
}

function atualizarGrafico(itens) {
    const ctx = document.getElementById('comissoesChart')?.getContext('2d');
    if (!ctx) return;
    
    const comissoesPorBarbeiro = {};
    itens.forEach(i => {
        const nome = i.profissionalNome;
        if (!comissoesPorBarbeiro[nome]) {
            comissoesPorBarbeiro[nome] = 0;
        }
        comissoesPorBarbeiro[nome] += i.comissao;
    });
    
    const labels = Object.keys(comissoesPorBarbeiro);
    const data = Object.values(comissoesPorBarbeiro);
    const cores = ['#2199EF', '#10b981', '#8b5cf6', '#3b82f6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
    
    if (comissoesChart) comissoesChart.destroy();
    
    if (labels.length === 0) {
        comissoesChart = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: ['📭 Nenhum dado'], 
                datasets: [{ 
                    label: 'Comissão (R$)', 
                    data: [0], 
                    backgroundColor: '#64748b',
                    borderRadius: 8
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                    tooltip: { callbacks: { label: () => 'Nenhum dado disponível' } }
                }
            }
        });
        return;
    }
    
    comissoesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Comissão (R$)',
                data: data,
                backgroundColor: cores.slice(0, labels.length),
                borderRadius: 8,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatarMoeda(ctx.raw) } }
            },
            scales: {
                y: { 
                    ticks: { color: '#94a3b8', callback: (v) => formatarMoeda(v) }, 
                    grid: { color: 'rgba(148,163,184,0.1)' }
                },
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function renderizarTabela(itens) {
    if (!comissoesBody) return;
    
    if (itens.length === 0) {
        comissoesBody.innerHTML = '<tr><td colspan="8" class="loading-comissoes">📭 Nenhuma comissão encontrada para o período selecionado</td></tr>';
        return;
    }
    
    comissoesBody.innerHTML = itens.map(item => `
        <tr>
            <td>${formatarData(item.data)}</td>
            <td>${escapeHtml(item.cliente)}</td>
            <td>${escapeHtml(item.nome)} <small style="color:#2199EF;">(${item.tipo})</small></td>
            <td><strong>${escapeHtml(item.profissionalNome)}</strong></td>
            <td>${formatarMoeda(item.valor)}</td>
            <td>${item.percentual}%</td>
            <td><span style="color: #2199EF; font-weight: bold;">${formatarMoeda(item.comissao)}</span></td>
            <td><button class="btn-edit-comissao" data-id="${item.id}" data-nome="${escapeHtml(item.nome)}" data-tipo="${item.tipo}" data-barbeiro="${escapeHtml(item.profissionalNome)}" data-valor="${item.valor}" data-percentual="${item.percentual}">
                <i class="fa-solid fa-pen"></i> Editar
            </button></td>
        </tr>
    `).join('');
    
    document.querySelectorAll('.btn-edit-comissao').forEach(btn => {
        btn.removeEventListener('click', handleEditClick);
        btn.addEventListener('click', handleEditClick);
    });
}

function handleEditClick(e) {
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-id');
    const nome = btn.getAttribute('data-nome');
    const tipo = btn.getAttribute('data-tipo');
    const barbeiro = btn.getAttribute('data-barbeiro');
    const valor = parseFloat(btn.getAttribute('data-valor'));
    const percentual = parseFloat(btn.getAttribute('data-percentual'));
    
    editarComissao(id, nome, tipo, barbeiro, valor, percentual);
}

async function carregarConfigComissoes() {
    try {
        const configRef = doc(db, "configuracoes", "comissoes_config");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const data = configSnap.data();
            configComissoes = {
                comissaoPadrao: data.comissaoPadrao || 30,
                comissoesPorServico: data.comissoesPorServico || {},
                comissoesPorProduto: data.comissoesPorProduto || {},
                comissoesPorProfissional: data.comissoesPorProfissional || {}
            };
            console.log("✅ Configurações carregadas:", configComissoes);
        } else {
            console.log("⚠️ Nenhuma configuração encontrada, usando padrão");
            // Criar configuração padrão
            await setDoc(configRef, {
                comissaoPadrao: 30,
                comissoesPorServico: {},
                comissoesPorProduto: {},
                comissoesPorProfissional: {},
                criadoEm: Timestamp.now()
            });
        }
        
        const comissaoPadraoInput = document.getElementById('comissaoPadrao');
        if (comissaoPadraoInput) {
            comissaoPadraoInput.value = configComissoes.comissaoPadrao;
        }
        
        await carregarListasConfig();
        
    } catch (error) {
        console.error("❌ Erro ao carregar config:", error);
        mostrarToast("Erro ao carregar configurações", "erro");
    }
}

async function carregarListasConfig() {
    // Carregar serviços
    const servicosLista = document.getElementById('servicosComissaoLista');
    if (servicosLista) {
        try {
            const servicosSnap = await getDocs(collection(db, "servicos"));
            if (servicosSnap.empty) {
                servicosLista.innerHTML = '<div class="loading-servicos">📭 Nenhum serviço cadastrado</div>';
            } else {
                servicosLista.innerHTML = '';
                servicosSnap.forEach(doc => {
                    const servico = doc.data();
                    const percentual = configComissoes.comissoesPorServico[doc.id] || '';
                    servicosLista.innerHTML += `
                        <div class="comissao-item">
                            <span class="comissao-item-nome">✂️ ${escapeHtml(servico.nome)}</span>
                            <div>
                                <input type="number" id="servico_${doc.id}" class="comissao-item-input" 
                                       value="${percentual}" placeholder="Padrão" min="0" max="100" step="1">
                                <span style="font-size: 0.7rem; color: #64748b;">%</span>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            console.error("❌ Erro ao carregar serviços:", error);
            servicosLista.innerHTML = '<div class="loading-servicos">❌ Erro ao carregar serviços</div>';
        }
    }
    
    // Carregar produtos
    const produtosLista = document.getElementById('produtosComissaoLista');
    if (produtosLista) {
        try {
            const produtosSnap = await getDocs(collection(db, "produtos"));
            if (produtosSnap.empty) {
                produtosLista.innerHTML = '<div class="loading-produtos">📭 Nenhum produto cadastrado</div>';
            } else {
                produtosLista.innerHTML = '';
                produtosSnap.forEach(doc => {
                    const produto = doc.data();
                    const percentual = configComissoes.comissoesPorProduto[doc.id] || '';
                    produtosLista.innerHTML += `
                        <div class="comissao-item">
                            <span class="comissao-item-nome">📦 ${escapeHtml(produto.nome)}</span>
                            <div>
                                <input type="number" id="produto_${doc.id}" class="comissao-item-input" 
                                       value="${percentual}" placeholder="Padrão" min="0" max="100" step="1">
                                <span style="font-size: 0.7rem; color: #64748b;">%</span>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            console.error("❌ Erro ao carregar produtos:", error);
            produtosLista.innerHTML = '<div class="loading-produtos">❌ Erro ao carregar produtos</div>';
        }
    }
    
    // Carregar barbeiros
    const barbeirosLista = document.getElementById('barbeirosComissaoLista');
    if (barbeirosLista) {
        try {
            const barbeirosSnap = await getDocs(collection(db, "profissionais"));
            if (barbeirosSnap.empty) {
                barbeirosLista.innerHTML = '<div class="loading-barbeiros">📭 Nenhum barbeiro cadastrado</div>';
            } else {
                barbeirosLista.innerHTML = '';
                barbeirosSnap.forEach(doc => {
                    const barbeiro = doc.data();
                    const percentual = configComissoes.comissoesPorProfissional[doc.id] || '';
                    barbeirosLista.innerHTML += `
                        <div class="comissao-item">
                            <span class="comissao-item-nome">👨‍🦱 ${escapeHtml(barbeiro.nome)}</span>
                            <div>
                                <input type="number" id="barbeiro_${doc.id}" class="comissao-item-input" 
                                       value="${percentual}" placeholder="Padrão" min="0" max="100" step="1">
                                <span style="font-size: 0.7rem; color: #64748b;">%</span>
                            </div>
                        </div>
                    `;
                });
            }
        } catch (error) {
            console.error("❌ Erro ao carregar barbeiros:", error);
            barbeirosLista.innerHTML = '<div class="loading-barbeiros">❌ Erro ao carregar barbeiros</div>';
        }
    }
}

async function salvarConfigComissoes() {
    try {
        const comissaoPadrao = Number(document.getElementById('comissaoPadrao').value);
        
        const comissoesPorServico = {};
        const servicosSnap = await getDocs(collection(db, "servicos"));
        servicosSnap.forEach(doc => {
            const input = document.getElementById(`servico_${doc.id}`);
            if (input && input.value) {
                comissoesPorServico[doc.id] = Number(input.value);
            }
        });
        
        const comissoesPorProduto = {};
        const produtosSnap = await getDocs(collection(db, "produtos"));
        produtosSnap.forEach(doc => {
            const input = document.getElementById(`produto_${doc.id}`);
            if (input && input.value) {
                comissoesPorProduto[doc.id] = Number(input.value);
            }
        });
        
        const comissoesPorProfissional = {};
        const barbeirosSnap = await getDocs(collection(db, "profissionais"));
        barbeirosSnap.forEach(doc => {
            const input = document.getElementById(`barbeiro_${doc.id}`);
            if (input && input.value) {
                comissoesPorProfissional[doc.id] = Number(input.value);
            }
        });
        
        const configRef = doc(db, "configuracoes", "comissoes_config");
        await setDoc(configRef, {
            comissaoPadrao: comissaoPadrao,
            comissoesPorServico: comissoesPorServico,
            comissoesPorProduto: comissoesPorProduto,
            comissoesPorProfissional: comissoesPorProfissional,
            atualizadoEm: Timestamp.now()
        });
        
        configComissoes = {
            comissaoPadrao: comissaoPadrao,
            comissoesPorServico: comissoesPorServico,
            comissoesPorProduto: comissoesPorProduto,
            comissoesPorProfissional: comissoesPorProfissional
        };
        
        mostrarToast("✅ Configurações de comissão salvas com sucesso!");
        fecharModalConfig();
        renderizarTudo();
        
    } catch (error) {
        console.error("❌ Erro ao salvar config:", error);
        mostrarToast("Erro ao salvar configurações.", "erro");
    }
}

function editarComissao(id, nome, tipo, barbeiroNome, valor, percentual) {
    atendimentoEditando = { id, tipo };
    document.getElementById('editServicoNome').value = `${nome} (${tipo})`;
    document.getElementById('editBarbeiroNome').value = barbeiroNome;
    document.getElementById('editValorServico').value = formatarMoeda(valor);
    document.getElementById('editPercentualComissao').value = percentual;
    
    const previewDiv = document.getElementById('previewComissao');
    const novaComissao = (valor * percentual) / 100;
    previewDiv.textContent = formatarMoeda(novaComissao);
    previewDiv.style.color = '#2199EF';
    
    modalEditarComissao.classList.add('active');
    
    const percInput = document.getElementById('editPercentualComissao');
    const updatePreview = () => {
        const perc = Number(percInput.value) || 0;
        const novaComissaoCalc = (valor * perc) / 100;
        previewDiv.textContent = formatarMoeda(novaComissaoCalc);
    };
    percInput.removeEventListener('input', updatePreview);
    percInput.addEventListener('input', updatePreview);
}

async function salvarComissaoEditada() {
    if (!atendimentoEditando) return;
    
    const novoPercentual = Number(document.getElementById('editPercentualComissao').value);
    
    if (isNaN(novoPercentual)) {
        mostrarToast("Percentual inválido.", "erro");
        return;
    }
    
    try {
        if (atendimentoEditando.tipo === 'serviço') {
            const referencia = doc(db, "agendamentos", atendimentoEditando.id);
            await updateDoc(referencia, {
                comissaoPercentual: novoPercentual,
                atualizadoEm: Timestamp.now()
            });
        } else {
            const referencia = doc(db, "comandas", atendimentoEditando.id);
            await updateDoc(referencia, {
                comissaoPercentual: novoPercentual,
                atualizadoEm: Timestamp.now()
            });
        }
        
        mostrarToast("✅ Comissão atualizada com sucesso!");
        fecharModalEditar();
        setTimeout(() => renderizarTudo(), 500);
    } catch (error) {
        console.error("❌ Erro ao salvar:", error);
        mostrarToast("Erro ao salvar comissão.", "erro");
    }
}

function fecharModalEditar() {
    modalEditarComissao.classList.remove('active');
    atendimentoEditando = null;
}

function abrirModalConfig() {
    modalConfigComissoes.classList.add('active');
    carregarListasConfig();
}

function fecharModalConfig() {
    modalConfigComissoes.classList.remove('active');
}

// Event Listeners
if (filterPeriodo) filterPeriodo.addEventListener('change', renderizarTudo);
if (filterBarbeiro) filterBarbeiro.addEventListener('change', renderizarTudo);
if (searchInput) searchInput.addEventListener('input', renderizarTudo);
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (filterPeriodo) filterPeriodo.value = 'mes';
        if (filterBarbeiro) filterBarbeiro.value = '';
        if (searchInput) searchInput.value = '';
        renderizarTudo();
    });
}
if (btnConfigComissoes) btnConfigComissoes.addEventListener('click', abrirModalConfig);

document.getElementById('btnSalvarConfigComissoes')?.addEventListener('click', salvarConfigComissoes);
document.getElementById('btnSalvarComissao')?.addEventListener('click', salvarComissaoEditada);

document.querySelectorAll('.modal-close-config, .btn-cancel-config').forEach(btn => {
    btn.addEventListener('click', fecharModalConfig);
});
document.querySelectorAll('.modal-close-editar, .btn-cancel-editar').forEach(btn => {
    btn.addEventListener('click', fecharModalEditar);
});

window.addEventListener('click', (e) => {
    if (e.target === modalConfigComissoes) fecharModalConfig();
    if (e.target === modalEditarComissao) fecharModalEditar();
});

// Inicialização
async function inicializar() {
    console.log("🚀 Inicializando sistema de comissões...");
    await carregarConfigComissoes();
    carregarDados();
}

inicializar();

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    } else {
        console.log("✅ Usuário autenticado:", user.email);
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}