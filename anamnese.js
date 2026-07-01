// anamnese.js - Versão Corrigida
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
    getDocs,
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

let anamneses = [];
let clientes = [];
let servicos = [];
let profissionais = [];
let unsubscribeAnamneses = null;
let dadosCarregados = {
    clientes: false,
    servicos: false,
    profissionais: false,
    anamneses: false
};

// Elementos DOM
const anamneseGrid = document.getElementById('anamneseGrid');
const searchInput = document.getElementById('searchCliente');
const filterPeriodo = document.getElementById('filterPeriodo');
const filterFrequencia = document.getElementById('filterFrequencia');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovaAnamnese = document.getElementById('btnNovaAnamnese');
const btnProjecao = document.getElementById('btnProjecao');
const modalAnamnese = document.getElementById('modalAnamnese');
const modalProjecao = document.getElementById('modalProjecao');
const modalDetalhes = document.getElementById('modalDetalhes');
const modalExcluir = document.getElementById('modalExcluir');
const formAnamnese = document.getElementById('formAnamnese');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Variáveis de controle
let anamneseParaEditar = null;
let anamneseParaExcluir = null;
let ratingSelecionado = 0;
let projecaoClientesChart = null;
let projecaoFaturamentoChart = null;
let projecaoPeriodoAtual = 12;

// Helper Functions
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
    if (!valor || valor === 0) return 'R$ 0,00';
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

function getSatisfacaoEstrelas(nota) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= nota) {
            html += '<i class="fa-solid fa-star" style="color: #fbbf24;"></i>';
        } else {
            html += '<i class="fa-regular fa-star" style="color: #4b5563;"></i>';
        }
    }
    return html;
}

// Carregar dados básicos
function carregarDadosBasicos() {
    console.log("🔄 Carregando dados básicos...");
    
    // Carregar clientes
    const clientesRef = collection(db, "clientes");
    onSnapshot(clientesRef, (snapshot) => {
        clientes = [];
        snapshot.forEach(doc => {
            clientes.push({ id: doc.id, ...doc.data() });
        });
        dadosCarregados.clientes = true;
        console.log(`✅ Clientes carregados: ${clientes.length}`);
        atualizarSelectClientes();
        verificarRenderizacao();
    }, (error) => {
        console.error("❌ Erro ao carregar clientes:", error);
        mostrarToast("Erro ao carregar clientes: " + error.message, "erro");
    });

    // Carregar serviços
    const servicosRef = collection(db, "servicos");
    onSnapshot(servicosRef, (snapshot) => {
        servicos = [];
        snapshot.forEach(doc => {
            servicos.push({ id: doc.id, ...doc.data() });
        });
        dadosCarregados.servicos = true;
        console.log(`✅ Serviços carregados: ${servicos.length}`);
        atualizarSelectServicos();
        verificarRenderizacao();
    }, (error) => {
        console.error("❌ Erro ao carregar serviços:", error);
        mostrarToast("Erro ao carregar serviços: " + error.message, "erro");
    });

    // Carregar profissionais
    const profissionaisRef = collection(db, "profissionais");
    onSnapshot(profissionaisRef, (snapshot) => {
        profissionais = [];
        snapshot.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        dadosCarregados.profissionais = true;
        console.log(`✅ Profissionais carregados: ${profissionais.length}`);
        atualizarSelectProfissionais();
        verificarRenderizacao();
    }, (error) => {
        console.error("❌ Erro ao carregar profissionais:", error);
        mostrarToast("Erro ao carregar profissionais: " + error.message, "erro");
    });
}

function verificarRenderizacao() {
    if (dadosCarregados.clientes && dadosCarregados.servicos && dadosCarregados.profissionais) {
        // Se os dados básicos estão carregados, mostrar mensagem aguardando anamneses
        if (anamneseGrid && (!dadosCarregados.anamneses || anamneses.length === 0)) {
            // Aguardar anamneses
            setTimeout(() => {
                if (anamneses.length === 0 && anamneseGrid) {
                    anamneseGrid.innerHTML = `
                        <div class="empty-anamnese">
                            <i class="fa-solid fa-clipboard-list"></i>
                            <p>Nenhuma anamnese encontrada</p>
                            <p style="font-size: 0.8rem; margin-top: 8px;">Clique no botão "Nova Anamnese" para registrar a primeira avaliação.</p>
                            <button class="btn-primary" onclick="document.getElementById('btnNovaAnamnese').click()">
                                <i class="fa-solid fa-plus"></i> Registrar Primeira Anamnese
                            </button>
                        </div>
                    `;
                }
            }, 1000);
        }
    }
}

function atualizarSelectClientes() {
    const select = document.getElementById('anamneseCliente');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um cliente</option>';
    clientes.forEach(cliente => {
        select.innerHTML += `<option value="${cliente.id}">${escapeHtml(cliente.nome)}</option>`;
    });
}

function atualizarSelectServicos() {
    const select = document.getElementById('anamneseServico');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um serviço</option>';
    servicos.forEach(servico => {
        select.innerHTML += `<option value="${servico.id}">${escapeHtml(servico.nome)} - ${formatarMoeda(servico.preco || 0)}</option>`;
    });
}

function atualizarSelectProfissionais() {
    const select = document.getElementById('anamneseProfissional');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um barbeiro</option>';
    profissionais.forEach(prof => {
        select.innerHTML += `<option value="${prof.id}">${escapeHtml(prof.nome)}</option>`;
    });
}

// Carregar Anamneses
function carregarAnamneses() {
    console.log("🔄 Carregando anamneses...");
    
    try {
        const q = query(collection(db, "anamneses"), orderBy("data", "desc"));
        
        if (unsubscribeAnamneses) unsubscribeAnamneses();
        
        unsubscribeAnamneses = onSnapshot(q, (snapshot) => {
            anamneses = [];
            snapshot.forEach(doc => {
                anamneses.push({ id: doc.id, ...doc.data() });
            });
            dadosCarregados.anamneses = true;
            console.log(`✅ Anamneses carregadas: ${anamneses.length}`);
            renderizarAnamneses();
            atualizarEstatisticas();
            
            // Se o modal de projeção estiver aberto, atualizar em tempo real
            if (modalProjecao && modalProjecao.classList.contains('active')) {
                atualizarProjecaoPeriodo(projecaoPeriodoAtual);
            }
        }, (error) => {
            console.error("❌ Erro ao carregar anamneses:", error);
            
            let mensagemErro = error.message;
            if (error.code === 'permission-denied') {
                mensagemErro = "Permissão negada. Verifique as regras de segurança do Firebase.";
            } else if (error.code === 'not-found') {
                mensagemErro = "Coleção 'anamneses' não encontrada. Crie a primeira anamnese para iniciar.";
            }
            
            if (anamneseGrid) {
                anamneseGrid.innerHTML = `
                    <div class="empty-anamnese" style="color: #ef4444;">
                        <i class="fa-solid fa-circle-exclamation"></i>
                        <p>Erro ao carregar anamneses: ${escapeHtml(mensagemErro)}</p>
                        <p style="font-size: 0.8rem; margin-top: 8px;">Verifique sua conexão e as regras de segurança do Firestore.</p>
                        <button class="btn-primary" id="btnRecarregarAnamnese" style="margin-top: 15px;">
                            <i class="fa-solid fa-rotate-right"></i> Tentar Novamente
                        </button>
                    </div>
                `;
                const btnRecarregar = document.getElementById('btnRecarregarAnamnese');
                if (btnRecarregar) {
                    btnRecarregar.addEventListener('click', () => {
                        carregarAnamneses();
                    });
                }
            }
            
            mostrarToast("Erro ao carregar anamneses: " + mensagemErro, "erro");
        });
    } catch (error) {
        console.error("❌ Erro crítico ao carregar anamneses:", error);
        if (anamneseGrid) {
            anamneseGrid.innerHTML = `
                <div class="empty-anamnese" style="color: #ef4444;">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar anamneses: ${error.message}</p>
                    <p style="font-size: 0.8rem; margin-top: 8px;">Verifique se a coleção 'anamneses' existe no Firestore.</p>
                    <button class="btn-primary" onclick="location.reload()" style="margin-top: 15px;">
                        <i class="fa-solid fa-rotate-right"></i> Recarregar Página
                    </button>
                </div>
            `;
        }
    }
}

function renderizarAnamneses() {
    if (!anamneseGrid) return;
    
    // Verificar se os dados básicos estão carregados
    if (!dadosCarregados.clientes || !dadosCarregados.servicos || !dadosCarregados.profissionais) {
        anamneseGrid.innerHTML = '<div class="loading-anamnese"><i class="fa-solid fa-spinner fa-spin"></i> Carregando dados...</div>';
        return;
    }
    
    let filtered = [...anamneses];
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(a => {
            const cliente = clientes.find(c => c.id === a.clienteId);
            return cliente?.nome?.toLowerCase().includes(searchTerm);
        });
    }
    
    const periodoDias = parseInt(filterPeriodo?.value || '0');
    if (periodoDias > 0) {
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - periodoDias);
        filtered = filtered.filter(a => {
            const dataAnamnese = a.data?.toDate ? a.data.toDate() : new Date(a.data);
            return dataAnamnese >= dataLimite;
        });
    }
    
    const freqFilter = filterFrequencia?.value;
    if (freqFilter) {
        filtered = filtered.filter(a => {
            const frequencia = a.frequencia || '';
            if (freqFilter === 'alta') return ['semanal', 'quinzenal'].includes(frequencia);
            if (freqFilter === 'media') return ['mensal'].includes(frequencia);
            if (freqFilter === 'baixa') return ['bimestral', 'eventual'].includes(frequencia);
            return true;
        });
    }
    
    if (filtered.length === 0) {
        if (anamneses.length === 0) {
            anamneseGrid.innerHTML = `
                <div class="empty-anamnese">
                    <i class="fa-solid fa-clipboard-list"></i>
                    <p>Nenhuma anamnese encontrada</p>
                    <p style="font-size: 0.8rem; margin-top: 8px;">Clique no botão "Nova Anamnese" para registrar a primeira avaliação.</p>
                    <button class="btn-primary" onclick="document.getElementById('btnNovaAnamnese').click()">
                        <i class="fa-solid fa-plus"></i> Registrar Primeira Anamnese
                    </button>
                </div>
            `;
        } else {
            anamneseGrid.innerHTML = `
                <div class="empty-anamnese">
                    <i class="fa-solid fa-filter"></i>
                    <p>Nenhuma anamnese encontrada com os filtros aplicados</p>
                    <button class="btn-primary" id="limparFiltrosBtn">
                        <i class="fa-solid fa-eraser"></i> Limpar Filtros
                    </button>
                </div>
            `;
            const limparBtn = document.getElementById('limparFiltrosBtn');
            if (limparBtn) {
                limparBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (filterPeriodo) filterPeriodo.value = 'todos';
                    if (filterFrequencia) filterFrequencia.value = '';
                    renderizarAnamneses();
                });
            }
        }
        return;
    }
    
    anamneseGrid.innerHTML = filtered.map(anamnese => {
        const cliente = clientes.find(c => c.id === anamnese.clienteId);
        const servico = servicos.find(s => s.id === anamnese.servicoId);
        const profissional = profissionais.find(p => p.id === anamnese.profissionalId);
        const estrelas = getSatisfacaoEstrelas(anamnese.satisfacao || 0);
        
        return `
            <div class="anamnese-card" data-id="${anamnese.id}">
                <div class="anamnese-header">
                    <div class="anamnese-cliente">
                        <h3>${escapeHtml(cliente?.nome || 'Cliente não encontrado')}</h3>
                        <span class="anamnese-data"><i class="fa-regular fa-calendar"></i> ${formatarData(anamnese.data)}</span>
                    </div>
                    <div class="anamnese-satisfacao">${estrelas}</div>
                </div>
                <div class="anamnese-body">
                    <div class="anamnese-info-row">
                        <span class="label"><i class="fa-solid fa-cut"></i> Serviço</span>
                        <span class="value">${escapeHtml(servico?.nome || '-')}</span>
                    </div>
                    <div class="anamnese-info-row">
                        <span class="label"><i class="fa-solid fa-user-nurse"></i> Barbeiro</span>
                        <span class="value">${escapeHtml(profissional?.nome || '-')}</span>
                    </div>
                    <div class="anamnese-info-row">
                        <span class="label"><i class="fa-regular fa-clock"></i> Frequência</span>
                        <span class="value">${getFrequenciaTexto(anamnese.frequencia)}</span>
                    </div>
                    <div class="anamnese-info-row">
                        <span class="label"><i class="fa-solid fa-star"></i> Estilo Preferido</span>
                        <span class="value">${escapeHtml(anamnese.estiloPreferido || '-')}</span>
                    </div>
                    ${anamnese.observacoes ? `
                        <div class="anamnese-observacoes">
                            <i class="fa-solid fa-note-sticky"></i> ${escapeHtml(anamnese.observacoes.substring(0, 60))}${anamnese.observacoes.length > 60 ? '...' : ''}
                        </div>
                    ` : ''}
                </div>
                <div class="anamnese-footer">
                    <span class="anamnese-valor">${formatarMoeda(anamnese.valor || 0)}</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-editar-anamnese" onclick="window.editarAnamnese('${anamnese.id}')" title="Editar">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="btn-excluir-anamnese" onclick="window.excluirAnamnese('${anamnese.id}')" title="Excluir">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                        <button class="btn-ver-detalhes" onclick="window.verDetalhes('${anamnese.id}')" title="Ver detalhes">
                            <i class="fa-regular fa-eye"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getFrequenciaTexto(frequencia) {
    const textos = {
        'semanal': 'Semanal (1-2x/semana)',
        'quinzenal': 'Quinzenal (2-3x/mês)',
        'mensal': 'Mensal (1x/mês)',
        'bimestral': 'Bimestral (a cada 2 meses)',
        'eventual': 'Eventual (sem periodicidade)'
    };
    return textos[frequencia] || frequencia || '-';
}

// Estatísticas
function atualizarEstatisticas() {
    const total = anamneses.length;
    document.getElementById('totalAnamneses').textContent = total;
    
    let totalDias = 0;
    let contagemFreq = 0;
    anamneses.forEach(a => {
        if (a.diasUltimoCorte && a.diasUltimoCorte > 0) {
            totalDias += a.diasUltimoCorte;
            contagemFreq++;
        }
    });
    const mediaFrequencia = contagemFreq > 0 ? Math.round(totalDias / contagemFreq) : 0;
    document.getElementById('mediaFrequencia').textContent = mediaFrequencia;
    
    let totalSatisfacao = 0;
    anamneses.forEach(a => {
        totalSatisfacao += a.satisfacao || 0;
    });
    const satisfacaoMedia = total > 0 ? (totalSatisfacao / total).toFixed(1) : 0;
    document.getElementById('satisfacaoMedia').textContent = satisfacaoMedia;
    
    // Calcular crescimento real baseado nos dados
    const crescimento = calcularCrescimentoReal();
    document.getElementById('crescimentoProjetado').textContent = crescimento + '%';
}

function calcularCrescimentoReal() {
    if (anamneses.length < 2) return 0;
    
    // Agrupar por mês
    const meses = {};
    anamneses.forEach(a => {
        const data = a.data?.toDate ? a.data.toDate() : new Date(a.data);
        const mesKey = `${data.getFullYear()}-${data.getMonth() + 1}`;
        if (!meses[mesKey]) {
            meses[mesKey] = { count: 0, valor: 0 };
        }
        meses[mesKey].count++;
        meses[mesKey].valor += a.valor || 0;
    });
    
    const mesesArray = Object.keys(meses).sort();
    if (mesesArray.length < 2) return 0;
    
    // Calcular crescimento médio entre meses
    let crescimentoTotal = 0;
    for (let i = 1; i < mesesArray.length; i++) {
        const anterior = meses[mesesArray[i - 1]].count;
        const atual = meses[mesesArray[i]].count;
        if (anterior > 0) {
            crescimentoTotal += ((atual - anterior) / anterior) * 100;
        }
    }
    
    return Math.round((crescimentoTotal / (mesesArray.length - 1)) * 100) / 100;
}

// Salvar Anamnese
async function salvarAnamnese(dados) {
    try {
        const produtosCasa = Array.from(document.querySelectorAll('#formAnamnese .checkbox-group:first-child input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        const produtosInteresse = Array.from(document.querySelectorAll('#formAnamnese .checkbox-group:last-child input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        
        const anamneseData = {
            clienteId: dados.clienteId,
            servicoId: dados.servicoId,
            profissionalId: dados.profissionalId,
            data: Timestamp.fromDate(new Date(dados.data)),
            satisfacao: Number(dados.satisfacao),
            valor: Number(dados.valor) || 0,
            frequencia: dados.frequencia,
            diasUltimoCorte: Number(dados.diasUltimoCorte) || 0,
            produtosCasa: produtosCasa,
            estiloPreferido: dados.estiloPreferido,
            usaBarba: dados.usaBarba,
            produtosInteresse: produtosInteresse,
            observacoes: dados.observacoes || '',
            atualizadoEm: Timestamp.now()
        };
        
        if (dados.id) {
            await updateDoc(doc(db, "anamneses", dados.id), anamneseData);
            mostrarToast("Anamnese atualizada com sucesso!");
        } else {
            anamneseData.createdAt = Timestamp.now();
            await addDoc(collection(db, "anamneses"), anamneseData);
            mostrarToast("Anamnese registrada com sucesso!");
        }
        fecharModalAnamnese();
    } catch (error) {
        console.error("Erro ao salvar anamnese:", error);
        mostrarToast("Erro ao salvar anamnese: " + error.message, "erro");
    }
}

// Editar Anamnese
window.editarAnamnese = (id) => {
    const anamnese = anamneses.find(a => a.id === id);
    if (!anamnese) {
        mostrarToast("Anamnese não encontrada.", "erro");
        return;
    }
    
    anamneseParaEditar = anamnese;
    const modalTitle = document.getElementById('modalAnamneseTitle');
    modalTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Anamnese';
    
    document.getElementById('anamneseId').value = anamnese.id;
    document.getElementById('anamneseCliente').value = anamnese.clienteId || '';
    document.getElementById('anamneseServico').value = anamnese.servicoId || '';
    document.getElementById('anamneseProfissional').value = anamnese.profissionalId || '';
    document.getElementById('anamneseData').value = anamnese.data?.toDate ? anamnese.data.toDate().toISOString().split('T')[0] : '';
    document.getElementById('anamneseValor').value = anamnese.valor || '';
    document.getElementById('anamneseFrequencia').value = anamnese.frequencia || '';
    document.getElementById('anamneseDiasUltimoCorte').value = anamnese.diasUltimoCorte || '';
    document.getElementById('anamneseEstiloPreferido').value = anamnese.estiloPreferido || '';
    document.getElementById('anamneseUsaBarba').value = anamnese.usaBarba || 'sim';
    document.getElementById('anamneseObservacoes').value = anamnese.observacoes || '';
    
    const produtosCasa = anamnese.produtosCasa || [];
    document.querySelectorAll('#formAnamnese .checkbox-group:first-child input[type="checkbox"]').forEach(cb => {
        cb.checked = produtosCasa.includes(cb.value);
    });
    
    const produtosInteresse = anamnese.produtosInteresse || [];
    document.querySelectorAll('#formAnamnese .checkbox-group:last-child input[type="checkbox"]').forEach(cb => {
        cb.checked = produtosInteresse.includes(cb.value);
    });
    
    ratingSelecionado = anamnese.satisfacao || 0;
    atualizarRatingStars(ratingSelecionado);
    
    modalAnamnese.classList.add('active');
};

// Excluir Anamnese
window.excluirAnamnese = (id) => {
    const anamnese = anamneses.find(a => a.id === id);
    if (!anamnese) {
        mostrarToast("Anamnese não encontrada.", "erro");
        return;
    }
    
    anamneseParaExcluir = id;
    const cliente = clientes.find(c => c.id === anamnese.clienteId);
    document.getElementById('excluirNome').textContent = cliente?.nome || 'este registro';
    modalExcluir.classList.add('active');
};

async function deletarAnamnese() {
    if (!anamneseParaExcluir) return;
    
    try {
        await deleteDoc(doc(db, "anamneses", anamneseParaExcluir));
        mostrarToast("Anamnese excluída com sucesso!");
        fecharModalExcluir();
    } catch (error) {
        console.error("Erro ao excluir anamnese:", error);
        mostrarToast("Erro ao excluir anamnese.", "erro");
    }
}

function fecharModalExcluir() {
    modalExcluir.classList.remove('active');
    anamneseParaExcluir = null;
}

// ==================== PROJEÇÃO DE CRESCIMENTO ====================

function calcularDadosHistoricos() {
    if (anamneses.length === 0) {
        return {
            meses: [],
            valores: [],
            labels: [],
            ticketMedio: 0,
            totalClientes: 0,
            faturamentoTotal: 0,
            temDados: false
        };
    }
    
    // Agrupar por mês
    const mesesMap = new Map();
    anamneses.forEach(a => {
        const data = a.data?.toDate ? a.data.toDate() : new Date(a.data);
        const mesKey = `${data.getFullYear()}-${data.getMonth() + 1}`;
        const mesLabel = `${data.getFullYear()}/${String(data.getMonth() + 1).padStart(2, '0')}`;
        if (!mesesMap.has(mesKey)) {
            mesesMap.set(mesKey, { total: 0, count: 0, label: mesLabel });
        }
        const mes = mesesMap.get(mesKey);
        mes.total += a.valor || 0;
        mes.count++;
    });
    
    const meses = Array.from(mesesMap.keys()).sort();
    const valores = meses.map(m => mesesMap.get(m).total);
    const labels = meses.map(m => mesesMap.get(m).label);
    
    // Calcular ticket médio geral
    const totalValor = anamneses.reduce((sum, a) => sum + (a.valor || 0), 0);
    const ticketMedio = anamneses.length > 0 ? totalValor / anamneses.length : 0;
    
    return {
        meses,
        valores,
        labels,
        ticketMedio,
        totalClientes: anamneses.length,
        faturamentoTotal: totalValor,
        temDados: true
    };
}

function calcularProjecaoCrescimento(periodoMeses) {
    const { valores, ticketMedio, totalClientes, faturamentoTotal, temDados } = calcularDadosHistoricos();
    
    // Se não há dados históricos
    if (!temDados || anamneses.length === 0) {
        const projecao = [];
        for (let i = 1; i <= periodoMeses; i++) {
            projecao.push({
                mes: i,
                valor: 0,
                label: `${i}º mês`
            });
        }
        
        return {
            projecao,
            taxaCrescimento: 0,
            ticketMedioAtual: 0,
            clientesAtuais: 0,
            faturamentoAtual: 0,
            temDadosReais: false
        };
    }
    
    // Se há apenas uma anamnese
    if (valores.length === 1) {
        const projecao = [];
        let valorAtual = faturamentoTotal;
        
        for (let i = 1; i <= periodoMeses; i++) {
            projecao.push({
                mes: i,
                valor: valorAtual,
                label: `${i}º mês`
            });
        }
        
        return {
            projecao,
            taxaCrescimento: 0,
            ticketMedioAtual: ticketMedio,
            clientesAtuais: totalClientes,
            faturamentoAtual: faturamentoTotal,
            temDadosReais: true,
            dadosInsuficientes: true
        };
    }
    
    // Calcular tendência linear
    let somaX = 0, somaY = 0, somaXY = 0, somaX2 = 0;
    const n = valores.length;
    for (let i = 0; i < n; i++) {
        somaX += i;
        somaY += valores[i];
        somaXY += i * valores[i];
        somaX2 += i * i;
    }
    
    const denominador = (n * somaX2 - somaX * somaX);
    const inclinacao = denominador !== 0 ? (n * somaXY - somaX * somaY) / denominador : 0;
    const interceptacao = (somaY - inclinacao * somaX) / n;
    
    // Calcular taxa de crescimento real
    const primeiroValor = valores[0];
    const ultimoValor = valores[valores.length - 1];
    const taxaCrescimentoReal = primeiroValor > 0 ? ((ultimoValor - primeiroValor) / primeiroValor) * 100 : 0;
    
    // Projetar para o futuro
    const projecao = [];
    for (let i = 1; i <= periodoMeses; i++) {
        let valorProjetado = interceptacao + inclinacao * (n - 1 + i);
        valorProjetado = Math.max(0, valorProjetado);
        projecao.push({
            mes: i,
            valor: valorProjetado,
            label: `${i}º mês`
        });
    }
    
    return {
        projecao,
        taxaCrescimento: taxaCrescimentoReal,
        ticketMedioAtual: ticketMedio,
        clientesAtuais: totalClientes,
        faturamentoAtual: ultimoValor,
        temDadosReais: true,
        dadosInsuficientes: false
    };
}

function atualizarProjecaoPeriodo(periodo) {
    projecaoPeriodoAtual = periodo;
    const resultado = calcularProjecaoCrescimento(periodo);
    const { projecao, taxaCrescimento, ticketMedioAtual, temDadosReais } = resultado;
    
    const temDados = anamneses.length > 0;
    
    if (!temDados) {
        document.getElementById('projClientes').textContent = '0';
        document.getElementById('varClientes').innerHTML = '<span style="color: #64748b;">0%</span>';
        document.getElementById('projFaturamento').textContent = formatarMoeda(0);
        document.getElementById('varFaturamento').innerHTML = '<span style="color: #64748b;">0%</span>';
        document.getElementById('projTicket').textContent = formatarMoeda(0);
        document.getElementById('varTicket').innerHTML = '<span style="color: #64748b;">0%</span>';
        document.getElementById('projCrescimento').innerHTML = '<span style="color: #64748b;">0%</span>';
        
        // Gráficos vazios
        const ctxFaturamento = document.getElementById('projecaoFaturamentoChart')?.getContext('2d');
        if (ctxFaturamento) {
            if (projecaoFaturamentoChart) projecaoFaturamentoChart.destroy();
            
            projecaoFaturamentoChart = new Chart(ctxFaturamento, {
                type: 'line',
                data: {
                    labels: projecao.map(p => p.label),
                    datasets: [{
                        label: 'Faturamento Projetado (R$)',
                        data: projecao.map(() => 0),
                        borderColor: '#2199EF',
                        backgroundColor: 'rgba(33, 153, 239, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1' } },
                        tooltip: { callbacks: { label: () => 'Nenhum dado disponível' } }
                    },
                    scales: {
                        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, min: 0, max: 100 },
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
                    }
                }
            });
        }
        
        const ctxClientes = document.getElementById('projecaoClientesChart')?.getContext('2d');
        if (ctxClientes) {
            if (projecaoClientesChart) projecaoClientesChart.destroy();
            
            projecaoClientesChart = new Chart(ctxClientes, {
                type: 'bar',
                data: {
                    labels: projecao.map(p => p.label),
                    datasets: [{
                        label: 'Clientes Projetados',
                        data: projecao.map(() => 0),
                        backgroundColor: '#2199EF',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1' } },
                        tooltip: { callbacks: { label: () => 'Nenhum dado disponível' } }
                    },
                    scales: {
                        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, min: 0, max: 10 },
                        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
                    }
                }
            });
        }
        return;
    }
    
    if (projecao.length === 0) return;
    
    const ultimoMes = projecao[projecao.length - 1];
    const crescimentoPercentual = taxaCrescimento;
    
    let clientesProjetados = 0;
    let ticketProjetado = 0;
    
    if (ticketMedioAtual > 0) {
        clientesProjetados = Math.round(ultimoMes.valor / ticketMedioAtual);
        ticketProjetado = ticketMedioAtual * (1 + crescimentoPercentual / 100);
    }
    
    const getColor = (valor) => valor > 0 ? '#10b981' : (valor < 0 ? '#ef4444' : '#64748b');
    
    document.getElementById('projClientes').textContent = clientesProjetados;
    document.getElementById('varClientes').innerHTML = `<span style="color: ${getColor(crescimentoPercentual)}">${crescimentoPercentual >= 0 ? '+' : ''}${crescimentoPercentual.toFixed(1)}%</span>`;
    document.getElementById('projFaturamento').textContent = formatarMoeda(ultimoMes.valor);
    document.getElementById('varFaturamento').innerHTML = `<span style="color: ${getColor(crescimentoPercentual)}">${crescimentoPercentual >= 0 ? '+' : ''}${crescimentoPercentual.toFixed(1)}%</span>`;
    document.getElementById('projTicket').textContent = formatarMoeda(ticketProjetado);
    document.getElementById('varTicket').innerHTML = `<span style="color: ${getColor(crescimentoPercentual)}">${crescimentoPercentual >= 0 ? '+' : ''}${crescimentoPercentual.toFixed(1)}%</span>`;
    document.getElementById('projCrescimento').innerHTML = `<span style="color: ${getColor(crescimentoPercentual)}">${crescimentoPercentual >= 0 ? '+' : ''}${crescimentoPercentual.toFixed(1)}%</span>`;
    
    // Gráfico de faturamento
    const ctxFaturamento = document.getElementById('projecaoFaturamentoChart')?.getContext('2d');
    if (ctxFaturamento) {
        if (projecaoFaturamentoChart) projecaoFaturamentoChart.destroy();
        
        const maxFaturamento = Math.max(...projecao.map(p => p.valor), 100);
        
        projecaoFaturamentoChart = new Chart(ctxFaturamento, {
            type: 'line',
            data: {
                labels: projecao.map(p => p.label),
                datasets: [{
                    label: 'Faturamento Projetado (R$)',
                    data: projecao.map(p => p.valor),
                    borderColor: '#2199EF',
                    backgroundColor: 'rgba(33, 153, 239, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, min: 0, max: maxFaturamento * 1.1 },
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
                }
            }
        });
    }
    
    // Gráfico de clientes
    const ctxClientes = document.getElementById('projecaoClientesChart')?.getContext('2d');
    if (ctxClientes) {
        if (projecaoClientesChart) projecaoClientesChart.destroy();
        
        let clientesProjetadosArray = [];
        if (ticketMedioAtual > 0) {
            clientesProjetadosArray = projecao.map(p => Math.round(p.valor / ticketMedioAtual));
        } else {
            clientesProjetadosArray = projecao.map(() => 0);
        }
        
        const maxClientes = Math.max(...clientesProjetadosArray, 10);
        
        projecaoClientesChart = new Chart(ctxClientes, {
            type: 'bar',
            data: {
                labels: projecao.map(p => p.label),
                datasets: [{
                    label: 'Clientes Projetados',
                    data: clientesProjetadosArray,
                    backgroundColor: '#2199EF',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#cbd5e1' } } },
                scales: {
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' }, min: 0, max: maxClientes * 1.1 },
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } }
                }
            }
        });
    }
}

function abrirProjecao() {
    modalProjecao.classList.add('active');
    atualizarProjecaoPeriodo(12);
}

// ==================== DETALHES DA ANAMNESE ====================

function verDetalhes(id) {
    const anamnese = anamneses.find(a => a.id === id);
    if (!anamnese) return;
    
    const cliente = clientes.find(c => c.id === anamnese.clienteId);
    const servico = servicos.find(s => s.id === anamnese.servicoId);
    const profissional = profissionais.find(p => p.id === anamnese.profissionalId);
    const estrelas = getSatisfacaoEstrelas(anamnese.satisfacao || 0);
    
    const produtosCasa = anamnese.produtosCasa || [];
    const produtosInteresse = anamnese.produtosInteresse || [];
    
    const detalhesBody = document.getElementById('detalhesBody');
    detalhesBody.innerHTML = `
        <div class="detalhes-container">
            <div class="detalhes-section">
                <h4><i class="fa-solid fa-user"></i> Dados do Cliente</h4>
                <div class="detalhes-row"><span class="label">Nome:</span><span class="value">${escapeHtml(cliente?.nome || '-')}</span></div>
                <div class="detalhes-row"><span class="label">Data da Avaliação:</span><span class="value">${formatarData(anamnese.data)}</span></div>
            </div>
            <div class="detalhes-section">
                <h4><i class="fa-solid fa-cut"></i> Atendimento</h4>
                <div class="detalhes-row"><span class="label">Serviço:</span><span class="value">${escapeHtml(servico?.nome || '-')}</span></div>
                <div class="detalhes-row"><span class="label">Barbeiro:</span><span class="value">${escapeHtml(profissional?.nome || '-')}</span></div>
                <div class="detalhes-row"><span class="label">Valor Gasto:</span><span class="value">${formatarMoeda(anamnese.valor || 0)}</span></div>
                <div class="detalhes-row"><span class="label">Satisfação:</span><span class="value">${estrelas}</span></div>
            </div>
            <div class="detalhes-section">
                <h4><i class="fa-solid fa-calendar-check"></i> Hábitos</h4>
                <div class="detalhes-row"><span class="label">Frequência:</span><span class="value">${getFrequenciaTexto(anamnese.frequencia)}</span></div>
                <div class="detalhes-row"><span class="label">Dias desde último corte:</span><span class="value">${anamnese.diasUltimoCorte || '-'} dias</span></div>
                <div class="detalhes-row"><span class="label">Produtos em casa:</span><span class="value">${produtosCasa.map(p => getProdutoTexto(p)).join(', ') || '-'}</span></div>
            </div>
            <div class="detalhes-section">
                <h4><i class="fa-solid fa-star"></i> Preferências</h4>
                <div class="detalhes-row"><span class="label">Estilo Preferido:</span><span class="value">${escapeHtml(anamnese.estiloPreferido || '-')}</span></div>
                <div class="detalhes-row"><span class="label">Usa barba?</span><span class="value">${anamnese.usaBarba === 'sim' ? 'Sim' : anamnese.usaBarba === 'nao' ? 'Não' : 'Às vezes'}</span></div>
                <div class="detalhes-row"><span class="label">Produtos de interesse:</span><span class="value">${produtosInteresse.map(p => getProdutoInteresseTexto(p)).join(', ') || '-'}</span></div>
            </div>
            ${anamnese.observacoes ? `
                <div class="detalhes-section">
                    <h4><i class="fa-solid fa-notes-medical"></i> Observações</h4>
                    <div class="observacoes-texto">${escapeHtml(anamnese.observacoes)}</div>
                </div>
            ` : ''}
        </div>
    `;
    
    modalDetalhes.classList.add('active');
}

function getProdutoTexto(produto) {
    const textos = {
        'pomada': 'Pomada modeladora',
        'oleo': 'Óleo pós-barba',
        'shampoo': 'Shampoo específico',
        'condicionador': 'Condicionador',
        'finalizador': 'Finalizador'
    };
    return textos[produto] || produto;
}

function getProdutoInteresseTexto(produto) {
    const textos = {
        'kit_cabelo': 'Kit cabelo completo',
        'kit_barba': 'Kit barba',
        'perfume': 'Perfume importado',
        'acessorios': 'Acessórios'
    };
    return textos[produto] || produto;
}

// Modal functions
function abrirModalAnamnese(anamnese = null) {
    anamneseParaEditar = anamnese;
    const modalTitle = document.getElementById('modalAnamneseTitle');
    
    if (anamnese) {
        modalTitle.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Anamnese';
        document.getElementById('anamneseId').value = anamnese.id;
        document.getElementById('anamneseCliente').value = anamnese.clienteId || '';
        document.getElementById('anamneseServico').value = anamnese.servicoId || '';
        document.getElementById('anamneseProfissional').value = anamnese.profissionalId || '';
        document.getElementById('anamneseData').value = anamnese.data?.toDate ? anamnese.data.toDate().toISOString().split('T')[0] : '';
        document.getElementById('anamneseValor').value = anamnese.valor || '';
        document.getElementById('anamneseFrequencia').value = anamnese.frequencia || '';
        document.getElementById('anamneseDiasUltimoCorte').value = anamnese.diasUltimoCorte || '';
        document.getElementById('anamneseEstiloPreferido').value = anamnese.estiloPreferido || '';
        document.getElementById('anamneseUsaBarba').value = anamnese.usaBarba || 'sim';
        document.getElementById('anamneseObservacoes').value = anamnese.observacoes || '';
        
        const produtosCasa = anamnese.produtosCasa || [];
        document.querySelectorAll('#formAnamnese .checkbox-group:first-child input[type="checkbox"]').forEach(cb => {
            cb.checked = produtosCasa.includes(cb.value);
        });
        
        const produtosInteresse = anamnese.produtosInteresse || [];
        document.querySelectorAll('#formAnamnese .checkbox-group:last-child input[type="checkbox"]').forEach(cb => {
            cb.checked = produtosInteresse.includes(cb.value);
        });
        
        ratingSelecionado = anamnese.satisfacao || 0;
        atualizarRatingStars(ratingSelecionado);
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Nova Anamnese';
        document.getElementById('anamneseId').value = '';
        formAnamnese.reset();
        document.getElementById('anamneseData').value = new Date().toISOString().split('T')[0];
        ratingSelecionado = 0;
        atualizarRatingStars(0);
    }
    
    modalAnamnese.classList.add('active');
}

function fecharModalAnamnese() {
    modalAnamnese.classList.remove('active');
    anamneseParaEditar = null;
}

function fecharModalProjecao() {
    modalProjecao.classList.remove('active');
}

function fecharModalDetalhes() {
    modalDetalhes.classList.remove('active');
}

function atualizarRatingStars(rating) {
    const stars = document.querySelectorAll('#ratingStars i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.className = 'fa-solid fa-star ativo';
        } else {
            star.className = 'fa-regular fa-star';
        }
    });
    document.getElementById('anamneseSatisfacao').value = rating;
}

// Event Listeners
if (formAnamnese) {
    formAnamnese.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const clienteId = document.getElementById('anamneseCliente').value;
        if (!clienteId) {
            mostrarToast("Selecione um cliente.", "erro");
            return;
        }
        
        const dados = {
            id: document.getElementById('anamneseId').value,
            clienteId: clienteId,
            servicoId: document.getElementById('anamneseServico').value,
            profissionalId: document.getElementById('anamneseProfissional').value,
            data: document.getElementById('anamneseData').value,
            satisfacao: ratingSelecionado,
            valor: document.getElementById('anamneseValor').value,
            frequencia: document.getElementById('anamneseFrequencia').value,
            diasUltimoCorte: document.getElementById('anamneseDiasUltimoCorte').value,
            estiloPreferido: document.getElementById('anamneseEstiloPreferido').value,
            usaBarba: document.getElementById('anamneseUsaBarba').value,
            observacoes: document.getElementById('anamneseObservacoes').value
        };
        
        salvarAnamnese(dados);
    });
}

// Rating stars event
const ratingStars = document.querySelectorAll('#ratingStars i');
ratingStars.forEach(star => {
    star.addEventListener('click', () => {
        ratingSelecionado = parseInt(star.getAttribute('data-rating'));
        atualizarRatingStars(ratingSelecionado);
    });
});

// Period selector for projection
document.querySelectorAll('.periodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const periodo = parseInt(btn.getAttribute('data-periodo'));
        atualizarProjecaoPeriodo(periodo);
    });
});

// Botões
if (btnNovaAnamnese) btnNovaAnamnese.addEventListener('click', () => abrirModalAnamnese());
if (btnProjecao) btnProjecao.addEventListener('click', abrirProjecao);
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (filterPeriodo) filterPeriodo.value = 'todos';
        if (filterFrequencia) filterFrequencia.value = '';
        renderizarAnamneses();
    });
}

if (searchInput) searchInput.addEventListener('input', renderizarAnamneses);
if (filterPeriodo) filterPeriodo.addEventListener('change', renderizarAnamneses);
if (filterFrequencia) filterFrequencia.addEventListener('change', renderizarAnamneses);

// Close buttons
document.querySelectorAll('.modal-close-anamnese, .btn-cancel-anamnese').forEach(btn => {
    btn.addEventListener('click', fecharModalAnamnese);
});
document.querySelectorAll('.modal-close-projecao').forEach(btn => {
    btn.addEventListener('click', fecharModalProjecao);
});
document.querySelectorAll('.modal-close-detalhes').forEach(btn => {
    btn.addEventListener('click', fecharModalDetalhes);
});
document.querySelectorAll('.modal-close-excluir, .btn-cancel-excluir').forEach(btn => {
    btn.addEventListener('click', fecharModalExcluir);
});

window.addEventListener('click', (e) => {
    if (e.target === modalAnamnese) fecharModalAnamnese();
    if (e.target === modalProjecao) fecharModalProjecao();
    if (e.target === modalDetalhes) fecharModalDetalhes();
    if (e.target === modalExcluir) fecharModalExcluir();
});

// Botão confirmar exclusão
const confirmarExcluir = document.getElementById('confirmarExcluir');
if (confirmarExcluir) {
    confirmarExcluir.addEventListener('click', deletarAnamnese);
}

window.verDetalhes = verDetalhes;
window.editarAnamnese = editarAnamnese;
window.excluirAnamnese = excluirAnamnese;

// Inicialização
console.log("🚀 Inicializando módulo de Anamnese...");
carregarDadosBasicos();
carregarAnamneses();

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