import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    updateDoc,
    setDoc,
    getDoc,
    doc,
    getDocs,
    query,
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

let servicos = [];
let produtos = [];
let configMargens = {
    margemMinima: 30,
    margemMeta: 50,
    custosFixos: 0
};
let margensChart = null;

// Elementos DOM
const servicosBody = document.getElementById('servicosMargensBody');
const produtosBody = document.getElementById('produtosMargensBody');
const filterTipo = document.getElementById('filterTipo');
const filterMargem = document.getElementById('filterMargem');
const searchInput = document.getElementById('searchMargem');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnConfigMargens = document.getElementById('btnConfigMargens');
const modalConfigMargens = document.getElementById('modalConfigMargens');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let servicosFiltrados = [];
let produtosFiltrados = [];

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

function calcularMargem(preco, custo) {
    if (!preco || preco <= 0) return 0;
    return ((preco - custo) / preco) * 100;
}

function getMargemStatus(margem, config) {
    if (margem >= config.margemMeta) return { status: 'alta', texto: 'Excelente', class: 'alta' };
    if (margem >= config.margemMinima) return { status: 'media', texto: 'OK', class: 'media' };
    return { status: 'baixa', texto: 'Atenção', class: 'baixa' };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Carregar configurações
async function carregarConfiguracoes() {
    try {
        const configRef = doc(db, "configuracoes", "margens_config");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const data = configSnap.data();
            configMargens = {
                margemMinima: data.margemMinima || 30,
                margemMeta: data.margemMeta || 50,
                custosFixos: data.custosFixos || 0
            };
        } else {
            configMargens = {
                margemMinima: 30,
                margemMeta: 50,
                custosFixos: 0
            };
        }
        
        document.getElementById('configMargemMinima').value = configMargens.margemMinima;
        document.getElementById('configMargemMeta').value = configMargens.margemMeta;
        document.getElementById('configCustosFixos').value = configMargens.custosFixos;
        
    } catch (error) {
        console.error("Erro ao carregar config:", error);
        configMargens = { margemMinima: 30, margemMeta: 50, custosFixos: 0 };
    }
}

// Salvar configurações
async function salvarConfiguracoes() {
    try {
        const margemMinima = Number(document.getElementById('configMargemMinima').value);
        const margemMeta = Number(document.getElementById('configMargemMeta').value);
        const custosFixos = Number(document.getElementById('configCustosFixos').value);
        
        if (isNaN(margemMinima) || isNaN(margemMeta) || isNaN(custosFixos)) {
            mostrarToast("Preencha valores válidos.", "erro");
            return;
        }
        
        const configRef = doc(db, "configuracoes", "margens_config");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            await updateDoc(configRef, {
                margemMinima: margemMinima,
                margemMeta: margemMeta,
                custosFixos: custosFixos,
                atualizadoEm: new Date().toISOString()
            });
        } else {
            await setDoc(configRef, {
                margemMinima: margemMinima,
                margemMeta: margemMeta,
                custosFixos: custosFixos,
                createdAt: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });
        }
        
        configMargens = {
            margemMinima: margemMinima,
            margemMeta: margemMeta,
            custosFixos: custosFixos
        };
        
        mostrarToast("Configurações salvas com sucesso!");
        fecharModalConfig();
        
        setTimeout(() => {
            renderizarTudo();
        }, 500);
        
    } catch (error) {
        console.error("Erro ao salvar config:", error);
        mostrarToast(`Erro ao salvar: ${error.message}`, "erro");
    }
}

// Carregar serviços
function carregarServicos() {
    const q = query(collection(db, "servicos"), orderBy("nome", "asc"));
    onSnapshot(q, (snapshot) => {
        servicos = [];
        snapshot.forEach(doc => {
            servicos.push({ id: doc.id, ...doc.data() });
        });
        renderizarTudo();
    });
}

// Carregar produtos
function carregarProdutos() {
    const q = query(collection(db, "produtos"), orderBy("nome", "asc"));
    onSnapshot(q, (snapshot) => {
        produtos = [];
        snapshot.forEach(doc => {
            produtos.push({ id: doc.id, ...doc.data() });
        });
        renderizarTudo();
    });
}

// Atualizar estatísticas
function atualizarEstatisticas() {
    let totalMargemServicos = 0;
    let countServicos = 0;
    let maiorMargemServico = { nome: '-', margem: 0 };
    
    servicos.forEach(servico => {
        const custo = servico.custo || 0;
        const preco = servico.preco || 0;
        const margem = calcularMargem(preco, custo);
        if (preco > 0) {
            totalMargemServicos += margem;
            countServicos++;
        }
        if (margem > maiorMargemServico.margem) {
            maiorMargemServico = { nome: servico.nome, margem: margem };
        }
    });
    
    let totalMargemProdutos = 0;
    let countProdutos = 0;
    
    produtos.forEach(produto => {
        const custo = produto.custo || 0;
        const preco = produto.preco || 0;
        const margem = calcularMargem(preco, custo);
        if (preco > 0) {
            totalMargemProdutos += margem;
            countProdutos++;
        }
        if (margem > maiorMargemServico.margem) {
            maiorMargemServico = { nome: produto.nome, margem: margem };
        }
    });
    
    const margemMediaServicos = countServicos > 0 ? (totalMargemServicos / countServicos).toFixed(1) : 0;
    const margemMediaProdutos = countProdutos > 0 ? (totalMargemProdutos / countProdutos).toFixed(1) : 0;
    const margemMediaGeral = (countServicos + countProdutos) > 0 ? 
        ((totalMargemServicos + totalMargemProdutos) / (countServicos + countProdutos)).toFixed(1) : 0;
    
    document.getElementById('margemMediaGeral').textContent = margemMediaGeral + '%';
    document.getElementById('margemMediaServicos').textContent = margemMediaServicos + '%';
    document.getElementById('margemMediaProdutos').textContent = margemMediaProdutos + '%';
    document.getElementById('servicoMaiorMargem').textContent = maiorMargemServico.nome;
    
    return { margemMediaGeral, margemMediaServicos, margemMediaProdutos };
}

// Renderizar tabelas
function renderizarTudo() {
    aplicarFiltros();
    atualizarEstatisticas();
    atualizarGrafico();
    atualizarRecomendacoes();
}

function aplicarFiltros() {
    const tipo = filterTipo?.value || 'todos';
    const margemFilter = filterMargem?.value;
    const searchTerm = searchInput?.value.toLowerCase() || '';
    
    servicosFiltrados = [...servicos];
    if (searchTerm) {
        servicosFiltrados = servicosFiltrados.filter(s => s.nome?.toLowerCase().includes(searchTerm));
    }
    if (margemFilter) {
        servicosFiltrados = servicosFiltrados.filter(s => {
            const margem = calcularMargem(s.preco || 0, s.custo || 0);
            if (margemFilter === 'alta') return margem >= 50;
            if (margemFilter === 'media') return margem >= 30 && margem < 50;
            if (margemFilter === 'baixa') return margem < 30;
            return true;
        });
    }
    
    produtosFiltrados = [...produtos];
    if (searchTerm) {
        produtosFiltrados = produtosFiltrados.filter(p => p.nome?.toLowerCase().includes(searchTerm));
    }
    if (margemFilter) {
        produtosFiltrados = produtosFiltrados.filter(p => {
            const margem = calcularMargem(p.preco || 0, p.custo || 0);
            if (margemFilter === 'alta') return margem >= 50;
            if (margemFilter === 'media') return margem >= 30 && margem < 50;
            if (margemFilter === 'baixa') return margem < 30;
            return true;
        });
    }
    
    renderizarServicos();
    renderizarProdutos();
}

function renderizarServicos() {
    if (!servicosBody) return;
    
    if (servicosFiltrados.length === 0 && (filterTipo?.value === 'servicos' || filterTipo?.value === 'todos')) {
        servicosBody.innerHTML = '<tr><td colspan="7" class="loading-margens">Nenhum serviço encontrado</td>';
        return;
    }
    
    if (filterTipo?.value === 'produtos') {
        servicosBody.innerHTML = '<tr><td colspan="7" class="loading-margens">-</td>';
        return;
    }
    
    servicosBody.innerHTML = servicosFiltrados.map(servico => {
        const preco = servico.preco || 0;
        const custo = servico.custo || 0;
        const lucro = preco - custo;
        const margem = calcularMargem(preco, custo);
        const status = getMargemStatus(margem, configMargens);
        
        return `
            <tr>
                <td><strong>${escapeHtml(servico.nome)}</strong></td>
                <td>${formatarMoeda(preco)}</td>
                <td>${formatarMoeda(custo)}</td>
                <td>${formatarMoeda(lucro)}</td>
                <td>${margem.toFixed(1)}%</td>
                <td><span class="margem-status ${status.class}">${status.texto}</span></td>
                <td><button class="btn-edit-custo" onclick="editarCustoServico('${servico.id}')"><i class="fa-solid fa-pen"></i> Editar</button></td>
            </tr>
        `;
    }).join('');
}

function renderizarProdutos() {
    if (!produtosBody) return;
    
    if (produtosFiltrados.length === 0 && (filterTipo?.value === 'produtos' || filterTipo?.value === 'todos')) {
        produtosBody.innerHTML = '<tr><td colspan="7" class="loading-margens">Nenhum produto encontrado</td>';
        return;
    }
    
    if (filterTipo?.value === 'servicos') {
        produtosBody.innerHTML = '<tr><td colspan="7" class="loading-margens">-</td>';
        return;
    }
    
    produtosBody.innerHTML = produtosFiltrados.map(produto => {
        const preco = produto.preco || 0;
        const custo = produto.custo || 0;
        const lucro = preco - custo;
        const margem = calcularMargem(preco, custo);
        const status = getMargemStatus(margem, configMargens);
        
        return `
            <tr>
                <td><strong>${escapeHtml(produto.nome)}</strong></td>
                <td>${formatarMoeda(preco)}</td>
                <td>${formatarMoeda(custo)}</td>
                <td>${formatarMoeda(lucro)}</td>
                <td>${margem.toFixed(1)}%</td>
                <td><span class="margem-status ${status.class}">${status.texto}</span></td>
                <td><button class="btn-edit-custo" onclick="editarCustoProduto('${produto.id}')"><i class="fa-solid fa-pen"></i> Editar</button></td>
            </tr>
        `;
    }).join('');
}

function atualizarGrafico() {
    const ctx = document.getElementById('margensChart')?.getContext('2d');
    if (!ctx) return;
    
    const labels = [];
    const margins = [];
    const colors = [];
    
    const topItens = [...servicosFiltrados, ...produtosFiltrados]
        .sort((a, b) => (b.preco || 0) - (a.preco || 0))
        .slice(0, 8);
    
    topItens.forEach(item => {
        labels.push((item.nome || 'Item').substring(0, 20));
        const margem = calcularMargem(item.preco || 0, item.custo || 0);
        margins.push(margem);
        colors.push(margem >= 50 ? '#10b981' : margem >= 30 ? '#f59e0b' : '#ef4444');
    });
    
    if (margensChart) margensChart.destroy();
    
    margensChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Margem de Lucro (%)',
                data: margins,
                backgroundColor: colors,
                borderRadius: 8,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.toFixed(1)}%` } }
            },
            scales: {
                y: { 
                    ticks: { color: '#94a3b8', callback: (v) => `${v}%` }, 
                    grid: { color: 'rgba(148,163,184,0.1)' },
                    max: 100
                },
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
            }
        }
    });
}

function atualizarRecomendacoes() {
    const recomendacoesDiv = document.getElementById('recomendacoesMargens');
    if (!recomendacoesDiv) return;
    
    const servicosBaixaMargem = servicos.filter(s => calcularMargem(s.preco || 0, s.custo || 0) < configMargens.margemMinima);
    const produtosBaixaMargem = produtos.filter(p => calcularMargem(p.preco || 0, p.custo || 0) < configMargens.margemMinima);
    
    let recomendacoesHtml = `
        <div class="recomendacao-item">
            <i class="fa-solid fa-chart-line"></i>
            <span>💰 Margem média atual: ${document.getElementById('margemMediaGeral')?.textContent || '0%'}</span>
        </div>
        <div class="recomendacao-item">
            <i class="fa-solid fa-bullseye"></i>
            <span>🎯 Meta de margem configurada: ${configMargens.margemMeta}%</span>
        </div>
    `;
    
    if (servicosBaixaMargem.length > 0) {
        recomendacoesHtml += `
            <div class="recomendacao-item">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>⚠️ ${servicosBaixaMargem.length} serviço(s) com margem abaixo do recomendado</span>
            </div>
        `;
    }
    
    if (produtosBaixaMargem.length > 0) {
        recomendacoesHtml += `
            <div class="recomendacao-item">
                <i class="fa-solid fa-box"></i>
                <span>📦 ${produtosBaixaMargem.length} produto(s) com margem abaixo do recomendado</span>
            </div>
        `;
    }
    
    recomendacoesHtml += `
        <div class="recomendacao-item">
            <i class="fa-solid fa-lightbulb"></i>
            <span>💡 Sugestão: Revisar preços dos itens com margem baixa</span>
        </div>
        <div class="recomendacao-item">
            <i class="fa-solid fa-handshake"></i>
            <span>🤝 Negocie melhores preços com fornecedores</span>
        </div>
    `;
    
    recomendacoesDiv.innerHTML = recomendacoesHtml;
}

// Editar custos - Serviço
window.editarCustoServico = async (id) => {
    const servico = servicos.find(s => s.id === id);
    if (!servico) {
        mostrarToast("Serviço não encontrado.", "erro");
        return;
    }
    
    document.getElementById('editServicoNome').value = servico.nome;
    document.getElementById('editServicoPreco').value = servico.preco || 0;
    document.getElementById('editServicoCusto').value = servico.custo || 0;
    
    const preco = servico.preco || 0;
    const custo = servico.custo || 0;
    const margem = calcularMargem(preco, custo);
    const previewDiv = document.getElementById('previewMargemServico');
    previewDiv.textContent = `Margem: ${margem.toFixed(1)}%`;
    previewDiv.className = `preview-margem ${margem >= 50 ? 'alta' : margem >= 30 ? 'media' : 'baixa'}`;
    
    const modal = document.getElementById('modalEditarCustoServico');
    modal.classList.add('active');
    
    const btnSalvar = document.getElementById('btnSalvarCustoServico');
    const newBtn = btnSalvar.cloneNode(true);
    btnSalvar.parentNode.replaceChild(newBtn, btnSalvar);
    
    newBtn.addEventListener('click', async () => {
        const novoPreco = Number(document.getElementById('editServicoPreco').value);
        const novoCusto = Number(document.getElementById('editServicoCusto').value);
        
        if (isNaN(novoPreco) || isNaN(novoCusto)) {
            mostrarToast("Preencha valores válidos.", "erro");
            return;
        }
        
        try {
            const servicoRef = doc(db, "servicos", id);
            await updateDoc(servicoRef, {
                preco: novoPreco,
                custo: novoCusto,
                atualizadoEm: new Date().toISOString()
            });
            mostrarToast("Custo do serviço atualizado com sucesso!");
            fecharModalCustoServico();
            setTimeout(() => {
                carregarServicos();
                carregarProdutos();
            }, 500);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            mostrarToast(`Erro ao salvar: ${error.message}`, "erro");
        }
    });
    
    const precoInput = document.getElementById('editServicoPreco');
    const custoInput = document.getElementById('editServicoCusto');
    
    const updatePreview = () => {
        const p = Number(precoInput.value) || 0;
        const c = Number(custoInput.value) || 0;
        const m = calcularMargem(p, c);
        previewDiv.textContent = `Margem: ${m.toFixed(1)}%`;
        previewDiv.className = `preview-margem ${m >= 50 ? 'alta' : m >= 30 ? 'media' : 'baixa'}`;
    };
    
    precoInput.removeEventListener('input', updatePreview);
    custoInput.removeEventListener('input', updatePreview);
    precoInput.addEventListener('input', updatePreview);
    custoInput.addEventListener('input', updatePreview);
};

// Editar custos - Produto
window.editarCustoProduto = async (id) => {
    const produto = produtos.find(p => p.id === id);
    if (!produto) {
        mostrarToast("Produto não encontrado.", "erro");
        return;
    }
    
    document.getElementById('editProdutoNome').value = produto.nome;
    document.getElementById('editProdutoPreco').value = produto.preco || 0;
    document.getElementById('editProdutoCusto').value = produto.custo || 0;
    
    const preco = produto.preco || 0;
    const custo = produto.custo || 0;
    const margem = calcularMargem(preco, custo);
    const previewDiv = document.getElementById('previewMargemProduto');
    previewDiv.textContent = `Margem: ${margem.toFixed(1)}%`;
    previewDiv.className = `preview-margem ${margem >= 50 ? 'alta' : margem >= 30 ? 'media' : 'baixa'}`;
    
    const modal = document.getElementById('modalEditarCustoProduto');
    modal.classList.add('active');
    
    const btnSalvar = document.getElementById('btnSalvarCustoProduto');
    const newBtn = btnSalvar.cloneNode(true);
    btnSalvar.parentNode.replaceChild(newBtn, btnSalvar);
    
    newBtn.addEventListener('click', async () => {
        const novoPreco = Number(document.getElementById('editProdutoPreco').value);
        const novoCusto = Number(document.getElementById('editProdutoCusto').value);
        
        if (isNaN(novoPreco) || isNaN(novoCusto)) {
            mostrarToast("Preencha valores válidos.", "erro");
            return;
        }
        
        try {
            const produtoRef = doc(db, "produtos", id);
            await updateDoc(produtoRef, {
                preco: novoPreco,
                custo: novoCusto,
                atualizadoEm: new Date().toISOString()
            });
            mostrarToast("Custo do produto atualizado com sucesso!");
            fecharModalCustoProduto();
            setTimeout(() => {
                carregarServicos();
                carregarProdutos();
            }, 500);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            mostrarToast(`Erro ao salvar: ${error.message}`, "erro");
        }
    });
    
    const precoInput = document.getElementById('editProdutoPreco');
    const custoInput = document.getElementById('editProdutoCusto');
    
    const updatePreview = () => {
        const p = Number(precoInput.value) || 0;
        const c = Number(custoInput.value) || 0;
        const m = calcularMargem(p, c);
        previewDiv.textContent = `Margem: ${m.toFixed(1)}%`;
        previewDiv.className = `preview-margem ${m >= 50 ? 'alta' : m >= 30 ? 'media' : 'baixa'}`;
    };
    
    precoInput.removeEventListener('input', updatePreview);
    custoInput.removeEventListener('input', updatePreview);
    precoInput.addEventListener('input', updatePreview);
    custoInput.addEventListener('input', updatePreview);
};

function fecharModalCustoServico() {
    document.getElementById('modalEditarCustoServico').classList.remove('active');
}

function fecharModalCustoProduto() {
    document.getElementById('modalEditarCustoProduto').classList.remove('active');
}

function abrirModalConfig() {
    document.getElementById('configMargemMinima').value = configMargens.margemMinima;
    document.getElementById('configMargemMeta').value = configMargens.margemMeta;
    document.getElementById('configCustosFixos').value = configMargens.custosFixos || 0;
    modalConfigMargens.classList.add('active');
}

function fecharModalConfig() {
    modalConfigMargens.classList.remove('active');
}

// Event Listeners
if (filterTipo) filterTipo.addEventListener('change', renderizarTudo);
if (filterMargem) filterMargem.addEventListener('change', renderizarTudo);
if (searchInput) searchInput.addEventListener('input', renderizarTudo);
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (filterTipo) filterTipo.value = 'todos';
        if (filterMargem) filterMargem.value = '';
        if (searchInput) searchInput.value = '';
        renderizarTudo();
    });
}
if (btnConfigMargens) btnConfigMargens.addEventListener('click', abrirModalConfig);

document.getElementById('btnSalvarConfig')?.addEventListener('click', salvarConfiguracoes);

document.querySelectorAll('.modal-close-custo, .btn-cancel-custo').forEach(btn => {
    btn.addEventListener('click', fecharModalCustoServico);
});
document.querySelectorAll('.modal-close-custo-produto, .btn-cancel-custo-produto').forEach(btn => {
    btn.addEventListener('click', fecharModalCustoProduto);
});
document.querySelectorAll('.modal-close-config, .btn-cancel-config').forEach(btn => {
    btn.addEventListener('click', fecharModalConfig);
});

window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalEditarCustoServico')) fecharModalCustoServico();
    if (e.target === document.getElementById('modalEditarCustoProduto')) fecharModalCustoProduto();
    if (e.target === modalConfigMargens) fecharModalConfig();
});

// Inicialização
carregarConfiguracoes();
carregarServicos();
carregarProdutos();

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = 'login.html';
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}