// floating-caixa.js - Botão Flutuante do Caixa para todas as páginas
// CORRIGIDO: Agora usa createdAt corretamente e sincroniza em tempo real

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

let caixaAberto = false;
let saldoAtual = 0;
let totalEntradasHoje = 0;
let totalSaidasHoje = 0;
let dadosCarregados = false;
let unsubscribeMovimentacoes = null;
let unsubscribeCaixa = null;

// Função para obter data atual no formato YYYY-MM-DD
function getDataHoje() {
    return new Date().toISOString().split('T')[0];
}

// Função para verificar se uma movimentação é de hoje
function isMovimentacaoDeHoje(mov) {
    if (mov.createdAt) {
        if (mov.createdAt.toDate) {
            const dataMov = mov.createdAt.toDate().toISOString().split('T')[0];
            return dataMov === getDataHoje();
        } else if (mov.createdAt.seconds) {
            const dataMov = new Date(mov.createdAt.seconds * 1000).toISOString().split('T')[0];
            return dataMov === getDataHoje();
        }
    }
    return false;
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function atualizarUI() {
    const floatingBtn = document.getElementById('floatingCaixaBtn');
    const caixaBadge = document.getElementById('caixaBadge');
    const floatingSaldo = document.getElementById('floatingCaixaSaldo');
    const previewSaldo = document.getElementById('previewSaldo');
    const previewEntradas = document.getElementById('previewEntradas');
    const previewSaidas = document.getElementById('previewSaidas');
    const previewStatus = document.getElementById('previewStatus');
    
    if (!floatingBtn) return;
    
    if (caixaAberto) {
        floatingBtn.classList.add('has-caixa-aberto');
        floatingBtn.classList.remove('has-caixa-fechado');
        if (caixaBadge) {
            caixaBadge.style.background = '#10b981';
            caixaBadge.title = 'Caixa Aberto';
        }
        if (previewStatus) {
            previewStatus.innerHTML = '<span class="status-aberto"><i class="fa-solid fa-circle"></i> Caixa Aberto</span>';
        }
    } else {
        floatingBtn.classList.add('has-caixa-fechado');
        floatingBtn.classList.remove('has-caixa-aberto');
        if (caixaBadge) {
            caixaBadge.style.background = '#ef4444';
            caixaBadge.title = 'Caixa Fechado';
        }
        if (previewStatus) {
            previewStatus.innerHTML = '<span class="status-fechado"><i class="fa-solid fa-circle"></i> Caixa Fechado</span>';
        }
    }
    
    if (floatingSaldo) floatingSaldo.textContent = formatarMoeda(saldoAtual);
    if (previewSaldo) previewSaldo.textContent = formatarMoeda(saldoAtual);
    if (previewEntradas) previewEntradas.textContent = formatarMoeda(totalEntradasHoje);
    if (previewSaidas) previewSaidas.textContent = formatarMoeda(totalSaidasHoje);
    
    console.log(`📊 UI Atualizada - Saldo: ${formatarMoeda(saldoAtual)}, Entradas: ${formatarMoeda(totalEntradasHoje)}, Saídas: ${formatarMoeda(totalSaidasHoje)}`);
}

async function carregarStatusCaixa() {
    try {
        const hoje = getDataHoje();
        const caixaQuery = query(
            collection(db, "caixa"),
            where("data", "==", hoje),
            where("status", "==", "aberto")
        );
        const caixaSnap = await getDocs(caixaQuery);
        caixaAberto = !caixaSnap.empty;
        console.log(`📊 Status do caixa: ${caixaAberto ? 'ABERTO' : 'FECHADO'}`);
        atualizarUI();
    } catch (error) {
        console.error("Erro ao carregar status do caixa:", error);
    }
}

// Função para processar movimentações e calcular totais
function processarMovimentacoes(movimentacoesList) {
    totalEntradasHoje = 0;
    totalSaidasHoje = 0;
    
    movimentacoesList.forEach(mov => {
        if (isMovimentacaoDeHoje(mov)) {
            if (mov.tipo === 'entrada') {
                totalEntradasHoje += (mov.valor || 0);
            } else if (mov.tipo === 'saida') {
                totalSaidasHoje += (mov.valor || 0);
            }
        }
    });
    
    saldoAtual = totalEntradasHoje - totalSaidasHoje;
    dadosCarregados = true;
    console.log(`📊 Movimentações processadas - Entradas: ${formatarMoeda(totalEntradasHoje)}, Saídas: ${formatarMoeda(totalSaidasHoje)}, Saldo: ${formatarMoeda(saldoAtual)}`);
    atualizarUI();
}

// Função para carregar movimentações em tempo real
function carregarMovimentacoesRealtime() {
    console.log("🔄 Iniciando listener de movimentações em tempo real...");
    
    if (unsubscribeMovimentacoes) {
        unsubscribeMovimentacoes();
    }
    
    try {
        const movQuery = query(collection(db, "movimentacoes_caixa"), orderBy("createdAt", "desc"));
        
        unsubscribeMovimentacoes = onSnapshot(movQuery, (snapshot) => {
            const movimentacoes = [];
            snapshot.forEach(doc => {
                movimentacoes.push({ id: doc.id, ...doc.data() });
            });
            console.log(`📊 Recebidas ${movimentacoes.length} movimentações do Firebase`);
            processarMovimentacoes(movimentacoes);
        }, (error) => {
            console.error("Erro no listener de movimentações:", error);
        });
    } catch (error) {
        console.error("Erro ao configurar listener:", error);
    }
}

// Função para carregar status do caixa em tempo real
function carregarStatusCaixaRealtime() {
    console.log("🔄 Iniciando listener de status do caixa em tempo real...");
    
    if (unsubscribeCaixa) {
        unsubscribeCaixa();
    }
    
    try {
        const hoje = getDataHoje();
        const caixaQuery = query(collection(db, "caixa"), where("data", "==", hoje));
        
        unsubscribeCaixa = onSnapshot(caixaQuery, (snapshot) => {
            let aberto = false;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status === "aberto") {
                    aberto = true;
                }
            });
            caixaAberto = aberto;
            console.log(`📊 Status do caixa atualizado: ${caixaAberto ? 'ABERTO' : 'FECHADO'}`);
            atualizarUI();
        }, (error) => {
            console.error("Erro no listener do caixa:", error);
        });
    } catch (error) {
        console.error("Erro ao configurar listener do caixa:", error);
    }
}

function configurarEventos() {
    const floatingBtn = document.getElementById('floatingCaixaBtn');
    const preview = document.getElementById('floatingCaixaPreview');
    const closePreview = document.getElementById('closeCaixaPreview');
    const previewAtendimento = document.getElementById('previewAtendimento');
    const previewAbrirCaixa = document.getElementById('previewAbrirCaixa');
    const previewIrCaixa = document.getElementById('previewIrCaixa');
    
    let timeoutId;
    
    if (floatingBtn && preview) {
        floatingBtn.addEventListener('mouseenter', () => {
            if (timeoutId) clearTimeout(timeoutId);
            preview.classList.add('show');
            // Atualizar dados ao abrir preview
            atualizarUI();
        });
        
        floatingBtn.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                preview.classList.remove('show');
            }, 300);
        });
        
        floatingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'caixa.html';
        });
        
        preview.addEventListener('mouseenter', () => {
            if (timeoutId) clearTimeout(timeoutId);
        });
        
        preview.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                preview.classList.remove('show');
            }, 300);
        });
    }
    
    if (closePreview) {
        closePreview.addEventListener('click', (e) => {
            e.stopPropagation();
            if (preview) preview.classList.remove('show');
        });
    }
    
    if (previewAtendimento) {
        previewAtendimento.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'caixa.html';
        });
    }
    
    if (previewAbrirCaixa) {
        previewAbrirCaixa.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'caixa.html';
        });
    }
    
    if (previewIrCaixa) {
        previewIrCaixa.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = 'caixa.html';
        });
    }
}

function criarBotaoSeNecessario() {
    if (document.getElementById('floatingCaixaBtn')) return;
    
    const btnHTML = `
        <div class="floating-caixa-container">
            <button id="floatingCaixaBtn" class="floating-caixa-btn">
                <i class="fa-solid fa-cash-register"></i>
                <span class="caixa-badge" id="caixaBadge">●</span>
                <span class="floating-caixa-saldo" id="floatingCaixaSaldo">R$ 0,00</span>
            </button>
            <div id="floatingCaixaPreview" class="floating-caixa-preview">
                <div class="floating-caixa-preview-header">
                    <h4><i class="fa-solid fa-cash-register"></i> Resumo do Caixa</h4>
                    <button class="close-preview" id="closeCaixaPreview">&times;</button>
                </div>
                <div class="floating-caixa-preview-body">
                    <div id="previewStatus" class="preview-status">
                        <span class="status-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</span>
                    </div>
                    <div class="preview-saldo">
                        <span>Saldo Atual</span>
                        <strong id="previewSaldo">R$ 0,00</strong>
                    </div>
                    <div class="preview-movimentacao">
                        <span><i class="fa-solid fa-arrow-up"></i> Entradas hoje</span>
                        <span id="previewEntradas">R$ 0,00</span>
                    </div>
                    <div class="preview-movimentacao">
                        <span><i class="fa-solid fa-arrow-down"></i> Saídas hoje</span>
                        <span id="previewSaidas">R$ 0,00</span>
                    </div>
                    <div class="preview-actions">
                        <button id="previewAtendimento" class="btn-preview-atendimento">
                            <i class="fa-solid fa-scissors"></i> Atender
                        </button>
                        <button id="previewIrCaixa" class="btn-preview-caixa">
                            <i class="fa-solid fa-cash-register"></i> Caixa
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', btnHTML);
    console.log("✅ Botão flutuante do caixa criado");
    
    // Adicionar estilos CSS se não existirem
    adicionarEstilosCSS();
}

function adicionarEstilosCSS() {
    if (document.getElementById('floating-caixa-styles')) return;
    
    const styles = `
        <style id="floating-caixa-styles">
            .floating-caixa-container {
                position: fixed;
                bottom: 30px;
                right: 30px;
                z-index: 10000;
            }
            
            .floating-caixa-btn {
                width: 65px;
                height: 65px;
                border-radius: 50%;
                background: linear-gradient(135deg, #1e293b, #0f172a);
                border: 2px solid #2199EF;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
                transition: all 0.3s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                position: relative;
            }
            
            .floating-caixa-btn.has-caixa-aberto {
                border-color: #10b981;
                background: linear-gradient(135deg, #10b981, #059669);
            }
            
            .floating-caixa-btn.has-caixa-fechado {
                border-color: #ef4444;
                background: linear-gradient(135deg, #ef4444, #dc2626);
            }
            
            .floating-caixa-btn:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
            }
            
            .floating-caixa-btn i {
                font-size: 1.3rem;
                margin-bottom: 2px;
            }
            
            .caixa-badge {
                position: absolute;
                top: 5px;
                right: 8px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #94a3b8;
                font-size: 0;
            }
            
            .floating-caixa-saldo {
                font-size: 0.7rem;
                font-weight: 700;
                margin-top: 2px;
            }
            
            .floating-caixa-preview {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 280px;
                background: var(--bg-card, #1e1e2f);
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                border: 1px solid var(--border-color, rgba(255,255,255,0.1));
                opacity: 0;
                visibility: hidden;
                transform: translateY(20px);
                transition: all 0.3s ease;
            }
            
            .floating-caixa-preview.show {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .floating-caixa-preview-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));
            }
            
            .floating-caixa-preview-header h4 {
                margin: 0;
                font-size: 0.85rem;
                font-weight: 600;
                color: #2199EF;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .close-preview {
                background: none;
                border: none;
                color: var(--text-muted, #94a3b8);
                font-size: 1.2rem;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 8px;
                transition: all 0.2s;
            }
            
            .close-preview:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }
            
            .floating-caixa-preview-body {
                padding: 12px 16px;
            }
            
            .preview-status {
                text-align: center;
                padding: 6px;
                margin-bottom: 12px;
                border-radius: 12px;
                font-size: 0.7rem;
                font-weight: 600;
            }
            
            .status-aberto {
                color: #10b981;
                background: rgba(16, 185, 129, 0.1);
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
            }
            
            .status-fechado {
                color: #ef4444;
                background: rgba(239, 68, 68, 0.1);
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
            }
            
            .preview-saldo {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                padding: 10px 0;
                margin-bottom: 8px;
                border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.05));
            }
            
            .preview-saldo span {
                font-size: 0.8rem;
                color: var(--text-muted, #94a3b8);
            }
            
            .preview-saldo strong {
                font-size: 1.1rem;
                font-weight: 700;
                color: #2199EF;
            }
            
            .preview-movimentacao {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                font-size: 0.75rem;
            }
            
            .preview-movimentacao i {
                width: 20px;
            }
            
            .preview-movimentacao span:first-child {
                color: var(--text-muted, #94a3b8);
            }
            
            .preview-movimentacao span:last-child {
                font-weight: 600;
            }
            
            .preview-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid var(--border-color, rgba(255,255,255,0.1));
            }
            
            .btn-preview-atendimento,
            .btn-preview-caixa {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 10px;
                font-size: 0.7rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }
            
            .btn-preview-atendimento {
                background: linear-gradient(135deg, #2199EF, #1a7fcc);
                color: white;
            }
            
            .btn-preview-atendimento:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(33, 153, 239, 0.4);
            }
            
            .btn-preview-caixa {
                background: var(--bg-dark, #2d2d3f);
                color: var(--text-main, #fff);
                border: 1px solid var(--border-color, rgba(255,255,255,0.1));
            }
            
            .btn-preview-caixa:hover {
                background: #2199EF;
                color: white;
                transform: translateY(-2px);
            }
            
            @media (max-width: 768px) {
                .floating-caixa-container {
                    bottom: 20px;
                    right: 20px;
                }
                
                .floating-caixa-btn {
                    width: 55px;
                    height: 55px;
                }
                
                .floating-caixa-btn i {
                    font-size: 1.1rem;
                }
                
                .floating-caixa-preview {
                    width: 260px;
                    bottom: 70px;
                }
            }
        </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
}

// Função para escutar eventos globais de atualização
function configurarEventosGlobais() {
    // Escutar evento de agenda atualizada
    window.addEventListener('agendaAtualizada', () => {
        console.log("📢 Evento agendaAtualizada recebido - atualizando preview");
        setTimeout(() => atualizarUI(), 500);
    });
    
    // Escutar evento de pagamento atualizado
    window.addEventListener('pagamentoAtualizado', () => {
        console.log("💰 Evento pagamentoAtualizado recebido - atualizando preview");
        setTimeout(() => atualizarUI(), 500);
    });
    
    // Escutar mudanças no localStorage (comunicação entre abas)
    window.addEventListener('storage', (e) => {
        if (e.key === 'agendaAtualizada' || e.key === 'pagamentoAtualizado') {
            console.log(`📢 Mudança detectada no localStorage: ${e.key}`);
            setTimeout(() => atualizarUI(), 500);
        }
    });
}

async function inicializar() {
    console.log("🔧 Inicializando botão flutuante do caixa...");
    criarBotaoSeNecessario();
    configurarEventos();
    configurarEventosGlobais();
    await carregarStatusCaixa();
    carregarMovimentacoesRealtime();
    carregarStatusCaixaRealtime();
    console.log("✅ Botão flutuante do caixa inicializado!");
}

// Aguardar o DOM carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        onAuthStateChanged(auth, (user) => {
            if (user) inicializar();
        });
    });
} else {
    onAuthStateChanged(auth, (user) => {
        if (user) inicializar();
    });
}