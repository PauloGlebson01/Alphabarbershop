// dashboard.js - Versão UNIFICADA (mesma lógica do pagamentos.js)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot,
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

let faturamentoChart = null;
let servicosChart = null;
let unsubscribeComandas = null;

// MESMA função de cálculo usada no pagamentos.js
function calcularValorComanda(comanda) {
    let subtotal = 0;
    
    (comanda.servicos || []).forEach(s => {
        const preco = s.preco || 0;
        const quantidade = s.quantidade || 1;
        subtotal += preco * quantidade;
    });
    
    (comanda.pacotes || []).forEach(p => {
        subtotal += (p.preco || 0);
    });
    
    (comanda.produtos || []).forEach(p => {
        if (!p.isPreLancamento) {
            const preco = p.preco || 0;
            const quantidade = p.quantidade || 1;
            subtotal += preco * quantidade;
        }
    });
    
    let descontoValor = 0;
    if (comanda.desconto?.valor > 0) {
        if (comanda.desconto.tipo === "percentual") {
            descontoValor = (subtotal * comanda.desconto.valor) / 100;
        } else {
            descontoValor = comanda.desconto.valor;
        }
    }
    
    return Math.max(0, subtotal - descontoValor);
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

// ==================== FUNÇÕES DE TENDÊNCIA ====================

function calcularTendenciaMensal(faturamentoPorMes) {
    const meses = Object.keys(faturamentoPorMes).sort();
    
    if (meses.length < 2) {
        return { percentual: 0, tipo: 'estavel', texto: 'Aguardando mais dados' };
    }
    
    const ultimoMes = meses[meses.length - 1];
    const mesAnterior = meses[meses.length - 2];
    
    const faturamentoUltimo = faturamentoPorMes[ultimoMes] || 0;
    const faturamentoAnterior = faturamentoPorMes[mesAnterior] || 0;
    
    let percentual = 0;
    let tipo = 'estavel';
    let texto = 'Estável em relação ao mês anterior';
    
    if (faturamentoAnterior > 0) {
        percentual = ((faturamentoUltimo - faturamentoAnterior) / faturamentoAnterior) * 100;
        
        if (percentual > 5) {
            tipo = 'positivo';
            texto = '📈 Crescimento no último mês';
        } else if (percentual < -5) {
            tipo = 'negativo';
            texto = '📉 Queda no último mês';
        } else {
            texto = '➡️ Estável no último mês';
        }
    } else if (faturamentoUltimo > 0) {
        percentual = 100;
        tipo = 'positivo';
        texto = '🎉 Primeiro mês com faturamento';
    }
    
    return {
        percentual: Math.abs(percentual).toFixed(1),
        tipo: tipo,
        texto: texto,
        valor: percentual
    };
}

function encontrarMelhorMes(faturamentoPorMes) {
    const meses = Object.keys(faturamentoPorMes);
    
    if (meses.length === 0) {
        return { mes: null, faturamento: 0, nome: 'Nenhum registro' };
    }
    
    let melhorMes = meses[0];
    let melhorFaturamento = faturamentoPorMes[melhorMes] || 0;
    
    meses.forEach(mes => {
        const faturamento = faturamentoPorMes[mes] || 0;
        if (faturamento > melhorFaturamento) {
            melhorFaturamento = faturamento;
            melhorMes = mes;
        }
    });
    
    const [ano, mesNum] = melhorMes.split('-');
    const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const nomeMes = mesesNomes[parseInt(mesNum) - 1];
    
    return {
        mes: melhorMes,
        faturamento: melhorFaturamento,
        nome: `${nomeMes}/${ano}`
    };
}

// ==================== LISTENER PRINCIPAL - COLEÇÃO "comandas" ====================
function iniciarListenerComandas() {
    console.log("🔄 Iniciando listener na coleção 'comandas'...");
    
    const comandasRef = collection(db, "comandas");
    const q = query(comandasRef, orderBy("dataCriacao", "desc"));
    
    if (unsubscribeComandas) unsubscribeComandas();
    
    unsubscribeComandas = onSnapshot(q, (snapshot) => {
        console.log(`📊 Processando ${snapshot.size} comandas...`);
        
        // Acumuladores
        let faturamentoTotal = 0;
        let totalFinalizadas = 0;
        let totalComandasAbertas = 0;
        let receitaPrevista = 0;
        const faturamentoPorMes = {};
        const servicosContagem = {};
        const pagamentosPorMetodo = {
            dinheiro: 0,
            pix: 0,
            cartao_credito: 0,
            cartao_debito: 0
        };
        
        // Processar cada comanda
        snapshot.forEach(doc => {
            const comanda = doc.data();
            const valor = calcularValorComanda(comanda);
            const status = comanda.status;
            const metodo = comanda.formaPagamento || 'pendente';
            
            // Data para estatísticas mensais
            let dataReferencia = comanda.dataFinalizacao || comanda.dataCriacao;
            let mesChave = '';
            if (dataReferencia?.toDate) {
                const date = dataReferencia.toDate();
                mesChave = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }
            
            // Contabilizar por método de pagamento (apenas para finalizadas)
            if (status === 'finalizada' && metodo && pagamentosPorMetodo[metodo] !== undefined) {
                pagamentosPorMetodo[metodo] += valor;
            }
            
            // COMANDAS FINALIZADAS -> Faturamento Realizado
            if (status === 'finalizada' && valor > 0) {
                faturamentoTotal += valor;
                totalFinalizadas++;
                
                if (mesChave) {
                    faturamentoPorMes[mesChave] = (faturamentoPorMes[mesChave] || 0) + valor;
                }
                
                // Contabilizar serviços (primeiro serviço da comanda)
                const primeiroServico = comanda.servicos?.[0];
                if (primeiroServico) {
                    const servicoNome = primeiroServico.nome || 'Serviço';
                    servicosContagem[servicoNome] = (servicosContagem[servicoNome] || 0) + 1;
                } else if (comanda.pacotes && comanda.pacotes.length > 0) {
                    servicosContagem['Pacote'] = (servicosContagem['Pacote'] || 0) + 1;
                }
            }
            
            // COMANDAS ABERTAS ou AUSENTES -> Receita Prevista
            if (status === 'aberta' || status === 'ausente') {
                totalComandasAbertas++;
                receitaPrevista += valor;
            }
        });
        
        // Calcular ticket médio
        const ticketMedio = totalFinalizadas > 0 ? faturamentoTotal / totalFinalizadas : 0;
        
        // Atualizar elementos do DOM
        const faturamentoTotalEl = document.getElementById('faturamentoTotal');
        const ticketMedioEl = document.getElementById('ticketMedio');
        const qtdConcluidosEl = document.getElementById('qtdConcluidos');
        const projecaoPendenteEl = document.getElementById('projecaoPendente');
        
        if (faturamentoTotalEl) faturamentoTotalEl.textContent = formatarMoeda(faturamentoTotal);
        if (ticketMedioEl) ticketMedioEl.textContent = formatarMoeda(ticketMedio);
        if (qtdConcluidosEl) qtdConcluidosEl.textContent = totalFinalizadas;
        if (projecaoPendenteEl) projecaoPendenteEl.textContent = formatarMoeda(receitaPrevista);
        
        // Atualizar indicadores de tendência
        atualizarIndicadoresTendencia(faturamentoPorMes);
        
        // Atualizar gráficos
        atualizarGraficoMensal(faturamentoPorMes);
        atualizarGraficoServicos(servicosContagem);
        
        console.log(`✅ Dashboard atualizado:`);
        console.log(`   - Faturamento Total: ${formatarMoeda(faturamentoTotal)}`);
        console.log(`   - Atendimentos Finalizados: ${totalFinalizadas}`);
        console.log(`   - Ticket Médio: ${formatarMoeda(ticketMedio)}`);
        console.log(`   - Receita Prevista: ${formatarMoeda(receitaPrevista)}`);
        console.log(`   - Comandas Abertas: ${totalComandasAbertas}`);
        console.log(`💰 Pagamentos por método:`, pagamentosPorMetodo);
        
    }, (error) => {
        console.error("❌ Erro no listener de comandas:", error);
    });
}

function atualizarIndicadoresTendencia(faturamentoPorMes) {
    const tendencia = calcularTendenciaMensal(faturamentoPorMes);
    
    const tendenciaElement = document.getElementById('tendenciaMensal');
    const tendenciaIcone = document.getElementById('tendenciaIcone');
    const tendenciaTexto = document.getElementById('tendenciaTexto');
    
    if (tendenciaElement) {
        tendenciaElement.textContent = `${tendencia.percentual}%`;
        
        if (tendencia.tipo === 'positivo') {
            tendenciaElement.style.color = '#10b981';
            if (tendenciaIcone) tendenciaIcone.innerHTML = '<i class="fa-solid fa-arrow-up" style="color: #10b981;"></i>';
        } else if (tendencia.tipo === 'negativo') {
            tendenciaElement.style.color = '#ef4444';
            if (tendenciaIcone) tendenciaIcone.innerHTML = '<i class="fa-solid fa-arrow-down" style="color: #ef4444;"></i>';
        } else {
            tendenciaElement.style.color = '#f59e0b';
            if (tendenciaIcone) tendenciaIcone.innerHTML = '<i class="fa-solid fa-minus" style="color: #f59e0b;"></i>';
        }
    }
    
    if (tendenciaTexto) {
        tendenciaTexto.textContent = tendencia.texto;
    }
    
    const melhorMes = encontrarMelhorMes(faturamentoPorMes);
    
    const melhorMesFaturamentoElement = document.getElementById('melhorMesFaturamento');
    const melhorMesNomeElement = document.getElementById('melhorMesNome');
    
    if (melhorMesFaturamentoElement) {
        melhorMesFaturamentoElement.textContent = formatarMoeda(melhorMes.faturamento);
    }
    
    if (melhorMesNomeElement) {
        melhorMesNomeElement.textContent = melhorMes.nome;
    }
}

// ==================== GRÁFICOS ====================

function obterUltimosMeses(quantidade = 12) {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const hoje = new Date();
    const resultado = [];
    
    for (let i = quantidade - 1; i >= 0; i--) {
        const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        resultado.push(meses[data.getMonth()]);
    }
    
    return resultado;
}

function atualizarGraficoMensal(faturamentoPorMes) {
    const canvas = document.getElementById('faturamentoChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const mesesLabels = obterUltimosMeses(12);
    
    const valoresMensais = mesesLabels.map((_, index) => {
        const data = new Date();
        data.setMonth(data.getMonth() - (11 - index));
        const mesChave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        return faturamentoPorMes[mesChave] || 0;
    });
    
    if (faturamentoChart) {
        faturamentoChart.destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(33, 153, 239, 0.4)');
    gradient.addColorStop(0.5, 'rgba(33, 153, 239, 0.15)');
    gradient.addColorStop(1, 'rgba(33, 153, 239, 0.02)');
    
    faturamentoChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: mesesLabels,
            datasets: [{
                label: 'Faturamento (R$)',
                data: valoresMensais,
                borderColor: '#2199EF',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#2199EF',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: '#3aadff',
                pointHoverBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: {
                    backgroundColor: '#151823',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    borderColor: '#2199EF',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const valor = context.raw;
                            if (valor === 0) return `💰 Nenhum pagamento registrado`;
                            return `💰 ${formatarMoeda(valor)}`;
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        callback: function(value) {
                            if (value === 0) return 'R$ 0';
                            if (value >= 1000) return `R$ ${(value / 1000).toFixed(1)}k`;
                            return `R$ ${value}`;
                        },
                        color: '#9ca3af'
                    },
                    title: {
                        display: true,
                        text: '💰 FATURAMENTO',
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 11 } },
                    title: {
                        display: true,
                        text: '📅 PERÍODO',
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' }
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function atualizarGraficoServicos(servicosContagem) {
    const canvas = document.getElementById('servicosChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (servicosChart) {
        servicosChart.destroy();
    }
    
    let servicosArray = Object.entries(servicosContagem).map(([nome, qtd]) => ({ nome, qtd }));
    servicosArray.sort((a, b) => b.qtd - a.qtd);
    
    if (servicosArray.length > 8) {
        const outros = servicosArray.slice(8).reduce((sum, s) => sum + s.qtd, 0);
        servicosArray = servicosArray.slice(0, 8);
        if (outros > 0) {
            servicosArray.push({ nome: 'Outros', qtd: outros });
        }
    }
    
    const labels = servicosArray.map(s => s.nome);
    const valores = servicosArray.map(s => s.qtd);
    
    const cores = ['#2199EF', '#3aadff', '#60c0ff', '#1a7fcc', '#0f6bb0', '#4a9eff', '#72c8ff', '#2980e0', '#888'];
    
    servicosChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Atendimentos Realizados',
                data: valores,
                backgroundColor: cores.slice(0, labels.length),
                borderRadius: 8,
                barPercentage: 0.7,
                categoryPercentage: 0.8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: {
                    backgroundColor: '#151823',
                    titleColor: '#fff',
                    bodyColor: '#9ca3af',
                    borderColor: '#2199EF',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const qtd = context.raw;
                            return `✂️ ${qtd} atendimento${qtd !== 1 ? 's' : ''}`;
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9ca3af', stepSize: 1 },
                    title: {
                        display: true,
                        text: '✂️ QUANTIDADE DE ATENDIMENTOS',
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 11 } },
                    title: {
                        display: true,
                        text: '✂️ SERVIÇOS',
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' }
                    }
                }
            }
        }
    });
}

// ==================== NOTIFICAÇÃO ====================
function mostrarNotificacao(mensagem, tipo = 'info') {
    const notificacao = document.getElementById('notificacao');
    if (!notificacao) return;
    
    const icon = tipo === 'success' ? 'fa-circle-check' : 'fa-bell';
    notificacao.innerHTML = `<i class="fa-solid ${icon}"></i><span>${mensagem}</span>`;
    notificacao.style.display = 'flex';
    notificacao.style.background = tipo === 'success' 
        ? 'linear-gradient(135deg, #10b981, #059669)' 
        : 'linear-gradient(135deg, #2199EF, #0a0a0a)';
    
    const audio = document.getElementById('notificationSound');
    if (audio) {
        audio.play().catch(e => console.log("Som não pode ser reproduzido"));
    }
    
    setTimeout(() => {
        notificacao.style.display = 'none';
    }, 4000);
}

// ==================== ESTILOS ====================
function adicionarEstilos() {
    const style = document.createElement('style');
    style.textContent = `
        .chart-card {
            background: var(--bg-card);
            border-radius: 20px;
            padding: 20px;
            transition: all 0.3s ease;
            min-height: 380px;
            display: flex;
            flex-direction: column;
        }
        
        .chart-card:hover {
            transform: translateY(-3px);
            border-color: #2199EF;
            box-shadow: 0 10px 25px rgba(33, 153, 239, 0.15);
        }
        
        .chart-card h3 {
            margin-bottom: 20px;
            font-size: 1rem;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
            border-left: 3px solid #2199EF;
            padding-left: 14px;
        }
        
        .chart-card canvas {
            flex: 1;
            min-height: 280px;
            max-height: 320px;
            width: 100% !important;
        }
        
        .notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            animation: slideInRight 0.3s ease;
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @media (max-width: 768px) {
            .chart-card {
                padding: 16px;
                min-height: 300px;
            }
            .chart-card canvas {
                min-height: 220px;
                max-height: 260px;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Inicializando Dashboard UNIFICADO...");
    adicionarEstilos();
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("👤 Usuário autenticado:", user.email);
        iniciarListenerComandas();
    } else {
        console.log("⚠️ Nenhum usuário autenticado");
        window.location.href = 'login.html';
    }
});

// Logout
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        try {
            if (unsubscribeComandas) unsubscribeComandas();
            await signOut(auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
        }
    };
}

// Debug
window.dashboardDebug = {
    getDados: () => {
        console.log("=== DEBUG DASHBOARD ===");
        console.log("Use 'dashboardDebug.forcarAtualizacao()' para forçar atualização");
        return { status: "disponível" };
    },
    forcarAtualizacao: () => {
        if (unsubscribeComandas) unsubscribeComandas();
        iniciarListenerComandas();
        console.log("✅ Forçando atualização do dashboard...");
    }
};

console.log("✅ Dashboard UNIFICADO pronto!");