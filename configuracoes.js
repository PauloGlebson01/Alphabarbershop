import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

let produtos = [];
let profissionais = [];
let precosEspeciais = [];

// ==================== FUNÇÕES DE COR PRIMÁRIA ====================
function aplicarCorPrimaria(cor) {
    console.log("🎨 Aplicando cor primária:", cor);
    
    document.documentElement.style.setProperty('--primary', cor);
    
    const corEscura = cor === '#2199EF' ? '#1a7fcc' : `${cor}cc`;
    const gradiente = `linear-gradient(45deg, ${cor}, ${corEscura})`;
    document.documentElement.style.setProperty('--primary-gradient', gradiente);
    
    const elementos = {
        buttons: [
            '.btn-primary', '.btn-save', '.btn-primary-pacote', 
            '.btn-vender-pacote', '.btn-primary-small', '.btn-criar-pacote', 
            '.btn-definir-meta', '.floating-cart-btn', '.btn-agendar-detalhe',
            '.btn-agendar-profissional-card', '.carrinho-actions .btn-primary',
            '.btn-salvar', '.btn-vender'
        ],
        backgrounds: [
            '.horario-btn.selecionado', '.toggle input:checked + .toggle-slider',
            '.pacote-card::before', '.meta-card::before', '.desconto-badge',
            '.notification', '.toast'
        ],
        borders: [
            '.pacote-card:hover', '.meta-card:hover', '.config-card:hover',
            '.equipe-card:hover', '.servico-card:hover', '.produto-card:hover'
        ]
    };
    
    elementos.buttons.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el) el.style.background = gradiente;
        });
    });
    
    document.querySelectorAll('.stat-icon, .config-header i, .modal-header h2 i, .detalhe-row i, .servico-card-icon, .produto-card-icon').forEach(el => {
        if (el) el.style.color = cor;
    });
    
    document.querySelectorAll('.nav-item.active a, .nav-item a:hover').forEach(el => {
        if (el) el.style.borderLeftColor = cor;
    });
    
    localStorage.setItem('primaryColor', cor);
    mostrarToast(`Cor alterada para ${cor}`, 'success');
}

async function salvarCorPrimaria() {
    const corInput = document.getElementById('corPrimaria');
    if (!corInput) return;
    
    const cor = corInput.value;
    console.log("💾 Salvando cor primária:", cor);
    
    try {
        const configRef = doc(db, "configuracoes", "aparencia");
        await setDoc(configRef, { 
            corPrimaria: cor,
            updatedAt: Timestamp.now() 
        });
        
        aplicarCorPrimaria(cor);
        
        const style = document.createElement('style');
        style.textContent = `
            .stat-card.highlight {
                background: linear-gradient(135deg, ${cor}, ${cor}cc) !important;
            }
            .btn-primary, .btn-save, .floating-cart-btn {
                background: linear-gradient(135deg, ${cor}, ${cor}cc) !important;
            }
            .stat-icon {
                background: ${cor}20 !important;
                color: ${cor} !important;
            }
        `;
        document.head.appendChild(style);
        
    } catch (error) {
        console.error("Erro ao salvar cor:", error);
        mostrarToast("Erro ao salvar cor primária.", "erro");
    }
}

async function carregarCorPrimaria() {
    try {
        const configRef = doc(db, "configuracoes", "aparencia");
        const docSnap = await getDoc(configRef);
        
        let cor = '#2199EF';
        
        if (docSnap.exists()) {
            cor = docSnap.data().corPrimaria || '#2199EF';
        } else {
            const savedCor = localStorage.getItem('primaryColor');
            if (savedCor) cor = savedCor;
        }
        
        console.log("📥 Carregando cor primária:", cor);
        
        const corInput = document.getElementById('corPrimaria');
        if (corInput) {
            corInput.value = cor;
            aplicarCorPrimaria(cor);
        }
        
    } catch (error) {
        console.error("Erro ao carregar cor primária:", error);
        aplicarCorPrimaria('#2199EF');
    }
}

// ==================== FUNÇÕES DE INTERVALO ====================

function atualizarInfoIntervalo(intervalo) {
    const infoSpan = document.getElementById('infoIntervalo');
    if (!infoSpan) return;
    
    const horarios = {
        10: { total: 54, descricao: '54 horários por dia (Máxima flexibilidade)' },
        15: { total: 36, descricao: '36 horários por dia (Bom equilíbrio)' },
        20: { total: 27, descricao: '27 horários por dia (Mais tempo entre atendimentos)' },
        30: { total: 18, descricao: '18 horários por dia (Máximo conforto)' },
        60: { total: 9, descricao: '9 horários por dia (Mínimo de horários)' }
    };
    
    const info = horarios[intervalo] || horarios[10];
    infoSpan.textContent = `Com ${intervalo} minutos você terá ${info.descricao}`;
}

async function salvarIntervalo() {
    const intervalo = document.getElementById('intervaloHorarios');
    if (!intervalo) return;
    
    const valor = parseInt(intervalo.value);
    
    try {
        const configRef = doc(db, "configuracoes", "horarios");
        await setDoc(configRef, { 
            intervalo: valor,
            updatedAt: Timestamp.now()
        }, { merge: true });
        
        mostrarToast(`Intervalo de ${valor} minutos salvo com sucesso!`, "sucesso");
        atualizarInfoIntervalo(valor);
        
        window.dispatchEvent(new CustomEvent('intervaloAlterado', { 
            detail: { intervalo: valor } 
        }));
        
    } catch (error) {
        console.error("Erro ao salvar intervalo:", error);
        mostrarToast("Erro ao salvar intervalo.", "erro");
    }
}

async function carregarIntervalo() {
    try {
        const configRef = doc(db, "configuracoes", "horarios");
        const configSnap = await getDoc(configRef);
        
        const select = document.getElementById('intervaloHorarios');
        if (!select) return;
        
        if (configSnap.exists()) {
            const data = configSnap.data();
            if (data.intervalo) {
                select.value = data.intervalo;
                atualizarInfoIntervalo(data.intervalo);
                return;
            }
        }
        
        select.value = '10';
        atualizarInfoIntervalo(10);
        
    } catch (error) {
        console.error("Erro ao carregar intervalo:", error);
    }
}

// ==================== CARREGAR DADOS ====================
async function carregarDados() {
    try {
        console.log("🔄 Carregando dados...");
        
        const produtosSnap = await getDocs(collection(db, "produtos"));
        produtos = [];
        produtosSnap.forEach(doc => {
            produtos.push({ id: doc.id, ...doc.data() });
        });
        console.log(`✅ ${produtos.length} produtos carregados`);
        
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionais = [];
        profissionaisSnap.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        console.log(`✅ ${profissionais.length} profissionais carregados`);
        
        await carregarPrecosEspeciais();
        await carregarConfiguracoesGerais();
        
        preencherSelects();
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados", "erro");
    }
}

async function carregarPrecosEspeciais() {
    try {
        const precosSnap = await getDocs(collection(db, "produtos_precos_especiais"));
        precosEspeciais = [];
        precosSnap.forEach(doc => {
            precosEspeciais.push({ id: doc.id, ...doc.data() });
        });
        renderizarTabelaPrecosEspeciais();
        console.log(`✅ ${precosEspeciais.length} preços especiais carregados`);
    } catch (error) {
        console.error("Erro ao carregar preços especiais:", error);
    }
}

async function carregarConfiguracoesGerais() {
    try {
        const configRef = doc(db, "configuracoes", "precos_especiais");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const data = configSnap.data();
            const descontoInput = document.getElementById('descontoPadraoProfissional');
            const habilitarSelect = document.getElementById('habilitarPrecosEspeciais');
            const revendaSelect = document.getElementById('permitirRevenda');
            const limiteInput = document.getElementById('limiteProdutosProfissional');
            
            if (descontoInput) descontoInput.value = data.descontoPadrao || 15;
            if (habilitarSelect) habilitarSelect.value = data.habilitado ? 'true' : 'false';
            if (revendaSelect) revendaSelect.value = data.permitirRevenda ? 'true' : 'false';
            if (limiteInput) limiteInput.value = data.limiteProdutos || 10;
        }
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
    }
}

function preencherSelects() {
    const selectProduto = document.getElementById('precoProduto');
    const selectProfissional = document.getElementById('precoProfissional');
    
    if (selectProduto) {
        selectProduto.innerHTML = '<option value="">Selecione um produto</option>';
        produtos.forEach(produto => {
            selectProduto.innerHTML += `<option value="${produto.id}" data-preco="${produto.preco || 0}">${escapeHtml(produto.nome)} - ${formatarMoeda(produto.preco || 0)}</option>`;
        });
    }
    
    if (selectProfissional) {
        selectProfissional.innerHTML = '<option value="">Selecione um profissional</option>';
        profissionais.forEach(prof => {
            selectProfissional.innerHTML += `<option value="${prof.id}">${escapeHtml(prof.nome)}</option>`;
        });
    }
}

// ==================== FUNÇÕES AUXILIARES ====================
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
    if (!data) return '-';
    if (data.toDate) data = data.toDate();
    if (data.seconds) data = new Date(data.seconds * 1000);
    return data.toLocaleDateString('pt-BR');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarToast(mensagem, tipo = 'sucesso') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    
    toastMsg.textContent = mensagem;
    toast.style.background = tipo === 'sucesso' 
        ? 'linear-gradient(135deg, #2199EF, #1a7fcc)'
        : 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function calcularPrecoEspecial(produtoPreco, tipoDesconto, valorDesconto) {
    if (tipoDesconto === 'porcentagem') {
        return produtoPreco - (produtoPreco * valorDesconto / 100);
    } else {
        return Math.max(0, produtoPreco - valorDesconto);
    }
}

// ==================== RENDERIZAR TABELA ====================
function renderizarTabelaPrecosEspeciais() {
    const container = document.getElementById('precosEspeciaisTabela');
    if (!container) return;
    
    if (precosEspeciais.length === 0) {
        container.innerHTML = '<div class="empty-precos"><i class="fa-solid fa-tag"></i><p>Nenhum preço especial cadastrado</p></div>';
        return;
    }
    
    const html = `
        <table class="precos-especiais-table">
            <thead>
                <tr>
                    <th>Produto</th>
                    <th>Profissional</th>
                    <th>Preço Original</th>
                    <th>Preço Especial</th>
                    <th>Desconto</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${precosEspeciais.map(preco => {
                    const produto = produtos.find(p => p.id === preco.produtoId);
                    const profissional = profissionais.find(p => p.id === preco.profissionalId);
                    const precoOriginal = produto?.preco || 0;
                    const desconto = precoOriginal > 0 ? ((precoOriginal - preco.precoEspecial) / precoOriginal * 100).toFixed(1) : 0;
                    const ativo = preco.ativo !== false;
                    
                    return `
                        <tr>
                            <td><strong>${escapeHtml(produto?.nome || 'Produto não encontrado')}</strong></td>
                            <td>${escapeHtml(profissional?.nome || 'Profissional não encontrado')}</td>
                            <td>${formatarMoeda(precoOriginal)}</td>
                            <td><strong style="color: #10b981;">${formatarMoeda(preco.precoEspecial)}</strong></td>
                            <td><span class="desconto-badge">-${desconto}%</span></td>
                            <td>${preco.dataFim ? `Até ${formatarData(preco.dataFim)}` : 'Indeterminado'}</td>
                            <td>${ativo ? '<span style="color: #10b981;">Ativo</span>' : '<span style="color: #ef4444;">Inativo</span>'}</td>
                            <td class="preco-especial-actions">
                                <button class="btn-view-preco" data-id="${preco.id}" title="Visualizar"><i class="fa-regular fa-eye"></i></button>
                                <button class="btn-edit-preco" data-id="${preco.id}" title="Editar"><i class="fa-regular fa-pen-to-square"></i></button>
                                <button class="btn-delete-preco" data-id="${preco.id}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
    
    document.querySelectorAll('.btn-view-preco').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const preco = precosEspeciais.find(p => p.id === id);
            if (preco) abrirModalVisualizarPreco(preco);
        });
    });
    
    document.querySelectorAll('.btn-edit-preco').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const preco = precosEspeciais.find(p => p.id === id);
            if (preco) abrirModalPrecoEspecial(preco);
        });
    });
    
    document.querySelectorAll('.btn-delete-preco').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const preco = precosEspeciais.find(p => p.id === id);
            if (preco) abrirModalExcluirPreco(preco);
        });
    });
}

// ==================== CRUD PREÇOS ESPECIAIS ====================
async function salvarPrecoEspecial(dados) {
    try {
        const produto = produtos.find(p => p.id === dados.produtoId);
        if (!produto) {
            mostrarToast("Produto não encontrado", "erro");
            return;
        }
        
        const precoEspecial = calcularPrecoEspecial(produto.preco, dados.tipoDesconto, dados.valorDesconto);
        
        const precoData = {
            produtoId: dados.produtoId,
            profissionalId: dados.profissionalId,
            precoEspecial: precoEspecial,
            tipoDesconto: dados.tipoDesconto,
            valorDesconto: dados.valorDesconto,
            ativo: dados.ativo === 'true',
            observacoes: dados.observacoes || '',
            updatedAt: Timestamp.now()
        };
        
        if (dados.dataInicio) {
            precoData.dataInicio = Timestamp.fromDate(new Date(dados.dataInicio));
        }
        if (dados.dataFim) {
            precoData.dataFim = Timestamp.fromDate(new Date(dados.dataFim));
        }
        
        if (dados.id) {
            await updateDoc(doc(db, "produtos_precos_especiais", dados.id), precoData);
            mostrarToast("Preço especial atualizado com sucesso!");
        } else {
            precoData.createdAt = Timestamp.now();
            await addDoc(collection(db, "produtos_precos_especiais"), precoData);
            mostrarToast("Preço especial criado com sucesso!");
        }
        
        fecharModalPrecoEspecial();
        await carregarPrecosEspeciais();
        
    } catch (error) {
        console.error("Erro ao salvar preço especial:", error);
        mostrarToast("Erro ao salvar preço especial.", "erro");
    }
}

async function deletarPrecoEspecial(id) {
    try {
        await deleteDoc(doc(db, "produtos_precos_especiais", id));
        mostrarToast("Preço especial excluído com sucesso!");
        fecharModalExcluirPreco();
        await carregarPrecosEspeciais();
    } catch (error) {
        console.error("Erro ao excluir preço especial:", error);
        mostrarToast("Erro ao excluir preço especial.", "erro");
    }
}

async function salvarConfiguracoesGlobais() {
    try {
        const configData = {
            descontoPadrao: Number(document.getElementById('descontoPadraoProfissional').value),
            habilitado: document.getElementById('habilitarPrecosEspeciais').value === 'true',
            permitirRevenda: document.getElementById('permitirRevenda').value === 'true',
            limiteProdutos: Number(document.getElementById('limiteProdutosProfissional').value),
            updatedAt: Timestamp.now()
        };
        
        const configRef = doc(db, "configuracoes", "precos_especiais");
        await setDoc(configRef, configData);
        mostrarToast("Configurações salvas com sucesso!");
        
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        mostrarToast("Erro ao salvar configurações.", "erro");
    }
}

// ==================== MODAIS PREÇOS ESPECIAIS ====================
let precoParaExcluir = null;

function abrirModalPrecoEspecial(preco = null) {
    const modal = document.getElementById('modalPrecoEspecial');
    const title = document.getElementById('modalPrecoEspecialTitle');
    const precoEspecialId = document.getElementById('precoEspecialId');
    const precoProduto = document.getElementById('precoProduto');
    const precoProfissional = document.getElementById('precoProfissional');
    const precoTipoDesconto = document.getElementById('precoTipoDesconto');
    const precoValorDesconto = document.getElementById('precoValorDesconto');
    const precoEspecialValor = document.getElementById('precoEspecialValor');
    const precoDataInicio = document.getElementById('precoDataInicio');
    const precoDataFim = document.getElementById('precoDataFim');
    const precoAtivo = document.getElementById('precoAtivo');
    const precoObservacoes = document.getElementById('precoObservacoes');
    
    if (!modal) return;
    
    if (preco) {
        title.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Preço Especial';
        precoEspecialId.value = preco.id;
        precoProduto.value = preco.produtoId || '';
        precoProfissional.value = preco.profissionalId || '';
        precoTipoDesconto.value = preco.tipoDesconto || 'porcentagem';
        precoValorDesconto.value = preco.valorDesconto || '';
        precoEspecialValor.value = preco.precoEspecial || '';
        if (preco.dataInicio) {
            const dataInicio = preco.dataInicio.toDate();
            precoDataInicio.value = dataInicio.toISOString().split('T')[0];
        } else {
            precoDataInicio.value = '';
        }
        if (preco.dataFim) {
            const dataFim = preco.dataFim.toDate();
            precoDataFim.value = dataFim.toISOString().split('T')[0];
        } else {
            precoDataFim.value = '';
        }
        precoAtivo.value = preco.ativo !== false ? 'true' : 'false';
        precoObservacoes.value = preco.observacoes || '';
    } else {
        title.innerHTML = '<i class="fa-solid fa-tag"></i> Adicionar Preço Especial';
        precoEspecialId.value = '';
        if (precoProduto) precoProduto.value = '';
        if (precoProfissional) precoProfissional.value = '';
        if (precoTipoDesconto) precoTipoDesconto.value = 'porcentagem';
        if (precoValorDesconto) precoValorDesconto.value = '';
        if (precoEspecialValor) precoEspecialValor.value = '';
        if (precoDataInicio) precoDataInicio.value = '';
        if (precoDataFim) precoDataFim.value = '';
        if (precoAtivo) precoAtivo.value = 'true';
        if (precoObservacoes) precoObservacoes.value = '';
    }
    
    const updatePrecoEspecial = () => {
        const produtoId = precoProduto.value;
        const tipoDesconto = precoTipoDesconto.value;
        const valorDesconto = parseFloat(precoValorDesconto.value) || 0;
        
        if (produtoId && valorDesconto > 0) {
            const produto = produtos.find(p => p.id === produtoId);
            if (produto) {
                const precoCalculado = calcularPrecoEspecial(produto.preco, tipoDesconto, valorDesconto);
                precoEspecialValor.value = precoCalculado.toFixed(2);
                precoEspecialValor.style.color = '#10b981';
            } else {
                precoEspecialValor.value = '';
            }
        } else {
            precoEspecialValor.value = '';
        }
    };
    
    precoProduto.removeEventListener('change', updatePrecoEspecial);
    precoValorDesconto.removeEventListener('input', updatePrecoEspecial);
    precoTipoDesconto.removeEventListener('change', updatePrecoEspecial);
    
    precoProduto.addEventListener('change', updatePrecoEspecial);
    precoValorDesconto.addEventListener('input', updatePrecoEspecial);
    precoTipoDesconto.addEventListener('change', updatePrecoEspecial);
    
    modal.classList.add('active');
}

function fecharModalPrecoEspecial() {
    const modal = document.getElementById('modalPrecoEspecial');
    if (modal) modal.classList.remove('active');
}

function abrirModalVisualizarPreco(preco) {
    const modal = document.getElementById('modalVisualizarPreco');
    const body = document.getElementById('visualizarPrecoBody');
    const btnEditar = document.getElementById('btnEditarPreco');
    
    if (!modal || !body) return;
    
    const produto = produtos.find(p => p.id === preco.produtoId);
    const profissional = profissionais.find(p => p.id === preco.profissionalId);
    const precoOriginal = produto?.preco || 0;
    const desconto = precoOriginal > 0 ? ((precoOriginal - preco.precoEspecial) / precoOriginal * 100).toFixed(1) : 0;
    const ativo = preco.ativo !== false;
    const tipoDescontoNome = preco.tipoDesconto === 'porcentagem' ? 'Percentual (%)' : 'Valor Fixo (R$)';
    
    body.innerHTML = `
        <div class="visualizar-preco-detalhes">
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-box"></i> Produto:</span>
                <span class="value">${escapeHtml(produto?.nome || 'N/A')}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-user-md"></i> Profissional:</span>
                <span class="value">${escapeHtml(profissional?.nome || 'N/A')}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-tag"></i> Preço Original:</span>
                <span class="value">${formatarMoeda(precoOriginal)}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-percent"></i> Tipo Desconto:</span>
                <span class="value">${tipoDescontoNome}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-dollar-sign"></i> Valor Desconto:</span>
                <span class="value">${preco.tipoDesconto === 'porcentagem' ? preco.valorDesconto + '%' : formatarMoeda(preco.valorDesconto)}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-coins"></i> Preço Especial:</span>
                <span class="value" style="color: #10b981; font-size: 1.2rem;">${formatarMoeda(preco.precoEspecial)}</span>
                <span class="desconto-badge">-${desconto}%</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-regular fa-calendar"></i> Data Início:</span>
                <span class="value">${formatarData(preco.dataInicio)}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-regular fa-calendar"></i> Data Fim:</span>
                <span class="value">${formatarData(preco.dataFim) || 'Indeterminado'}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-toggle-on"></i> Status:</span>
                <span class="value" style="color: ${ativo ? '#10b981' : '#ef4444'};">${ativo ? 'Ativo' : 'Inativo'}</span>
            </div>
            ${preco.observacoes ? `
                <div class="detalhe-item">
                    <span class="label"><i class="fa-solid fa-note-sticky"></i> Observações:</span>
                    <span class="value">${escapeHtml(preco.observacoes)}</span>
                </div>
            ` : ''}
        </div>
    `;
    
    if (btnEditar) {
        btnEditar.style.display = 'flex';
        const newBtn = btnEditar.cloneNode(true);
        btnEditar.parentNode.replaceChild(newBtn, btnEditar);
        newBtn.addEventListener('click', () => {
            fecharModalVisualizarPreco();
            abrirModalPrecoEspecial(preco);
        });
    }
    
    modal.classList.add('active');
}

function fecharModalVisualizarPreco() {
    const modal = document.getElementById('modalVisualizarPreco');
    if (modal) modal.classList.remove('active');
}

function abrirModalExcluirPreco(preco) {
    precoParaExcluir = preco.id;
    const descricao = document.getElementById('excluirPrecoDescricao');
    if (descricao) {
        const produto = produtos.find(p => p.id === preco.produtoId);
        const profissional = profissionais.find(p => p.id === preco.profissionalId);
        descricao.textContent = `${produto?.nome || 'Produto'} - ${profissional?.nome || 'Profissional'}`;
    }
    const modal = document.getElementById('modalExcluirPreco');
    if (modal) modal.classList.add('active');
}

function fecharModalExcluirPreco() {
    const modal = document.getElementById('modalExcluirPreco');
    if (modal) modal.classList.remove('active');
    precoParaExcluir = null;
}

// ==================== CONFIGURAÇÕES GERAIS ====================
async function salvarDadosStudio() {
    const dados = {
        nome: document.getElementById('studioNome').value,
        telefone: document.getElementById('studioTelefone').value,
        email: document.getElementById('studioEmail').value,
        endereco: document.getElementById('studioEndereco').value,
        updatedAt: Timestamp.now()
    };
    
    try {
        const configRef = doc(db, "configuracoes", "studio");
        await setDoc(configRef, dados);
        mostrarToast("Dados da barbearia salvos com sucesso!");
    } catch (error) {
        console.error("Erro ao salvar dados:", error);
        mostrarToast("Erro ao salvar dados.", "erro");
    }
}

async function salvarHorarios() {
    const dados = {
        semana: document.getElementById('horarioSemana').value,
        sabado: document.getElementById('horarioSabado').value,
        domingo: document.getElementById('horarioDomingo').value,
        updatedAt: Timestamp.now()
    };
    
    // Salvar também o intervalo (já salvo separadamente)
    await salvarIntervalo();
    
    try {
        const configRef = doc(db, "configuracoes", "horarios");
        await setDoc(configRef, dados, { merge: true });
        mostrarToast("Horários salvos com sucesso!");
    } catch (error) {
        console.error("Erro ao salvar horários:", error);
        mostrarToast("Erro ao salvar horários.", "erro");
    }
}

async function alterarSenha() {
    const novaSenha = document.getElementById('novaSenha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;
    
    if (!novaSenha) {
        mostrarToast("Digite a nova senha", "erro");
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        mostrarToast("As senhas não coincidem", "erro");
        return;
    }
    
    if (novaSenha.length < 6) {
        mostrarToast("A senha deve ter pelo menos 6 caracteres", "erro");
        return;
    }
    
    try {
        const user = auth.currentUser;
        if (user) {
            await updatePassword(user, novaSenha);
            mostrarToast("Senha alterada com sucesso!");
            document.getElementById('novaSenha').value = '';
            document.getElementById('confirmarSenha').value = '';
        } else {
            mostrarToast("Usuário não autenticado", "erro");
        }
    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        mostrarToast("Erro ao alterar senha.", "erro");
    }
}

// ==================== CONFIGURAR EVENT LISTENERS ====================
function configurarEventListeners() {
    console.log("🔧 Configurando event listeners...");
    
    const btnSalvarStudio = document.getElementById('btnSalvarStudio');
    const btnSalvarHorario = document.getElementById('btnSalvarHorario');
    const btnAlterarSenha = document.getElementById('btnAlterarSenha');
    const btnAdicionarPreco = document.getElementById('btnAdicionarPrecoEspecial');
    const btnSalvarConfigPrecos = document.getElementById('btnSalvarConfigPrecos');
    const corPrimaria = document.getElementById('corPrimaria');
    
    if (btnSalvarStudio) btnSalvarStudio.addEventListener('click', salvarDadosStudio);
    if (btnSalvarHorario) btnSalvarHorario.addEventListener('click', salvarHorarios);
    if (btnAlterarSenha) btnAlterarSenha.addEventListener('click', alterarSenha);
    if (btnAdicionarPreco) btnAdicionarPreco.addEventListener('click', () => abrirModalPrecoEspecial());
    if (btnSalvarConfigPrecos) btnSalvarConfigPrecos.addEventListener('click', salvarConfiguracoesGlobais);
    if (corPrimaria) corPrimaria.addEventListener('change', salvarCorPrimaria);
    
    // 🆕 Event listener para intervalo
    const intervaloSelect = document.getElementById('intervaloHorarios');
    if (intervaloSelect) {
        intervaloSelect.addEventListener('change', (e) => {
            const valor = parseInt(e.target.value);
            atualizarInfoIntervalo(valor);
            salvarIntervalo();
        });
    }
    
    const formPreco = document.getElementById('formPrecoEspecial');
    if (formPreco) {
        formPreco.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const produtoId = document.getElementById('precoProduto').value;
            const profissionalId = document.getElementById('precoProfissional').value;
            const tipoDesconto = document.getElementById('precoTipoDesconto').value;
            const valorDesconto = parseFloat(document.getElementById('precoValorDesconto').value);
            
            if (!produtoId) {
                mostrarToast("Selecione um produto", "erro");
                return;
            }
            
            if (!profissionalId) {
                mostrarToast("Selecione um profissional", "erro");
                return;
            }
            
            if (!valorDesconto || valorDesconto <= 0) {
                mostrarToast("Informe um valor de desconto válido", "erro");
                return;
            }
            
            await salvarPrecoEspecial({
                id: document.getElementById('precoEspecialId').value,
                produtoId: produtoId,
                profissionalId: profissionalId,
                tipoDesconto: tipoDesconto,
                valorDesconto: valorDesconto,
                dataInicio: document.getElementById('precoDataInicio').value,
                dataFim: document.getElementById('precoDataFim').value,
                ativo: document.getElementById('precoAtivo').value,
                observacoes: document.getElementById('precoObservacoes').value
            });
        });
    }
    
    const confirmarExcluir = document.getElementById('confirmarExcluirPreco');
    if (confirmarExcluir) {
        confirmarExcluir.addEventListener('click', async () => {
            if (precoParaExcluir) {
                await deletarPrecoEspecial(precoParaExcluir);
            }
        });
    }
    
    document.querySelectorAll('.modal-close-preco, .btn-cancel-preco').forEach(btn => {
        btn.addEventListener('click', fecharModalPrecoEspecial);
    });
    
    document.querySelectorAll('.modal-close-excluir-preco, .btn-cancel-excluir-preco').forEach(btn => {
        btn.addEventListener('click', fecharModalExcluirPreco);
    });
    
    document.querySelectorAll('.modal-close-visualizar, .btn-cancel-visualizar').forEach(btn => {
        btn.addEventListener('click', fecharModalVisualizarPreco);
    });
    
    const modoEscuro = document.getElementById('modoEscuro');
    if (modoEscuro) {
        modoEscuro.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.add('dark');
                document.body.classList.remove('light');
                localStorage.setItem('theme', 'dark');
            } else {
                document.body.classList.add('light');
                document.body.classList.remove('dark');
                localStorage.setItem('theme', 'light');
            }
        });
    }
    
    const btnBackup = document.getElementById('btnBackup');
    const btnRestaurar = document.getElementById('btnRestaurar');
    if (btnBackup) btnBackup.addEventListener('click', () => mostrarToast("Função de backup em desenvolvimento", "info"));
    if (btnRestaurar) btnRestaurar.addEventListener('click', () => mostrarToast("Função de restauração em desenvolvimento", "info"));
    
    console.log("✅ Todos os event listeners configurados!");
}

// ==================== CARREGAR CONFIGURAÇÕES SALVAS ====================
async function carregarConfiguracoesSalvas() {
    try {
        const studioRef = doc(db, "configuracoes", "studio");
        const studioSnap = await getDoc(studioRef);
        if (studioSnap.exists()) {
            const data = studioSnap.data();
            const nomeInput = document.getElementById('studioNome');
            const telefoneInput = document.getElementById('studioTelefone');
            const emailInput = document.getElementById('studioEmail');
            const enderecoInput = document.getElementById('studioEndereco');
            if (nomeInput) nomeInput.value = data.nome || '';
            if (telefoneInput) telefoneInput.value = data.telefone || '';
            if (emailInput) emailInput.value = data.email || '';
            if (enderecoInput) enderecoInput.value = data.endereco || '';
        }
        
        const horariosRef = doc(db, "configuracoes", "horarios");
        const horariosSnap = await getDoc(horariosRef);
        if (horariosSnap.exists()) {
            const data = horariosSnap.data();
            const semanaInput = document.getElementById('horarioSemana');
            const sabadoInput = document.getElementById('horarioSabado');
            const domingoInput = document.getElementById('horarioDomingo');
            if (semanaInput) semanaInput.value = data.semana || '';
            if (sabadoInput) sabadoInput.value = data.sabado || '';
            if (domingoInput) domingoInput.value = data.domingo || '';
        }
        
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
    }
}

// ==================== INICIALIZAÇÃO ====================
async function inicializar() {
    console.log("🚀 Inicializando página de configurações...");
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.add(savedTheme);
    const modoEscuro = document.getElementById('modoEscuro');
    if (modoEscuro) modoEscuro.checked = savedTheme === 'dark';
    
    await carregarDados();
    await carregarConfiguracoesSalvas();
    await carregarCorPrimaria();
    await carregarIntervalo(); // 🆕 Carregar intervalo
    configurarEventListeners();
    
    console.log("✅ Configurações inicializadas com sucesso!");
}

inicializar();

// Autenticação
onAuthStateChanged(auth, (user) => {
    if (!user) {
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