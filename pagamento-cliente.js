// pagamento-cliente.js - Versão com suporte a PACOTES e parcelas
// Versão modificada: Envia mensagem APENAS para o WhatsApp do estabelecimento com ID da comanda
// 🆕 Exibe duração do serviço no resumo do pagamento

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    updateDoc,
    doc,
    Timestamp,
    addDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ==================== CONFIGURAÇÃO DO WHATSAPP DO ESTABELECIMENTO ====================
// ⚠️ ATENÇÃO: Substitua este número pelo WhatsApp da sua barbearia
// Formato: 55 + DDD + número (sem espaços, sem caracteres especiais)
// Exemplo: 5583996533486 (55 + 83 + 996533486)
const TELEFONE_ESTABELECIMENTO = "5583996533486"; // <-- COLOQUE O NÚMERO DA BARBEARIA AQUI

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

const urlParams = new URLSearchParams(window.location.search);
const agendamentoId = urlParams.get('agendamento');

console.log("ID do agendamento recebido:", agendamentoId);

let dadosAgendamento = null;
let metodoSelecionado = null;
let autenticado = false;
let clientesCache = [];
let servicosCache = [];
let comandaIdAtual = null;

const clienteNome = document.getElementById('clienteNome');
const servicoNome = document.getElementById('servicoNome');
const servicosDetalhes = document.getElementById('servicosDetalhes');
const servicosListaDiv = document.getElementById('servicosLista');
const observacaoRow = document.getElementById('observacaoRow');
const observacaoGeralSpan = document.getElementById('observacaoGeral');
const profissionalNome = document.getElementById('profissionalNome');
const agendamentoData = document.getElementById('agendamentoData');
const agendamentoHorario = document.getElementById('agendamentoHorario');
const duracaoRow = document.getElementById('duracaoRow');
const duracaoServico = document.getElementById('duracaoServico');
const valorTotal = document.getElementById('valorTotal');
const btnConfirmar = document.getElementById('btnConfirmarPagamento');
const statusMessage = document.getElementById('statusMessage');
const parcelamentoSection = document.getElementById('parcelamentoSection');
const parcelasSelect = document.getElementById('parcelasSelect');

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// 🆕 Função para formatar duração
function formatarDuracao(minutos) {
    if (!minutos || minutos <= 0) return null;
    
    if (minutos >= 60) {
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;
        if (mins > 0) {
            return `${horas}h ${mins}min`;
        }
        return `${horas}h`;
    }
    return `${minutos}min`;
}

function showMessage(msg, type) {
    if (!statusMessage) return;
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
        if (statusMessage) statusMessage.style.display = 'none';
    }, 5000);
}

// ==================== FUNÇÃO PARA ATUALIZAR PARCELAS (APENAS QUANTIDADES) ====================
function atualizarParcelas() {
    if (!parcelasSelect) return;
    
    parcelasSelect.innerHTML = '';
    const maxParcelas = 12;
    
    for (let i = 1; i <= maxParcelas; i++) {
        parcelasSelect.innerHTML += `<option value="${i}">${i}x</option>`;
    }
}

function formatarListaServicos(servicos) {
    if (!servicos || servicos.length === 0) return '-';
    
    let html = '';
    servicos.forEach((servico, index) => {
        const valor = servico.preco || 0;
        const valorFormatado = formatarMoeda(valor);
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>${index + 1}. ${escapeHtml(servico.nome)}</span>
                    <span style="color: #2199EF;">${valorFormatado}</span>
                 </div>`;
        if (servico.observacao) {
            html += `<div style="font-size: 0.7rem; color: #94a3b8; margin-left: 20px; margin-bottom: 8px;">
                        <i class="fa-solid fa-comment"></i> ${escapeHtml(servico.observacao)}
                    </div>`;
        }
    });
    return html;
}

// ==================== FUNÇÃO PARA FORMATAR PACOTE ====================
function formatarPacote(pacoteInfo) {
    if (!pacoteInfo) return null;
    
    const economia = (pacoteInfo.precoOriginal || 0) - (pacoteInfo.preco || 0);
    const descontoPercentual = pacoteInfo.descontoPercentual || 
        (economia > 0 ? Math.round((economia / pacoteInfo.precoOriginal) * 100) : 0);
    
    let html = `
        <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05)); 
                    border-radius: 16px; 
                    padding: 16px; 
                    margin-bottom: 12px;
                    border: 1px solid rgba(245, 158, 11, 0.3);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="background: rgba(245, 158, 11, 0.2); 
                            border-radius: 12px; 
                            padding: 8px 12px;">
                    <i class="fa-solid fa-gift" style="color: #f59e0b; font-size: 1.2rem;"></i>
                </div>
                <div>
                    <strong style="color: #f59e0b; font-size: 1rem;">${escapeHtml(pacoteInfo.nome)}</strong>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <span style="font-size: 0.65rem; background: #f59e0b; color: #fff; padding: 2px 10px; border-radius: 20px;">
                            <i class="fa-solid fa-tag"></i> PACOTE
                        </span>
                        ${descontoPercentual > 0 ? `
                            <span style="font-size: 0.65rem; background: #10b98120; color: #10b981; padding: 2px 10px; border-radius: 20px;">
                                ${descontoPercentual}% OFF
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 12px;">
                <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.8rem;">
                    De: ${formatarMoeda(pacoteInfo.precoOriginal)}
                </span>
                <strong style="color: #10b981; font-size: 1.1rem; margin-left: 12px;">
                    Por: ${formatarMoeda(pacoteInfo.preco)}
                </strong>
                ${economia > 0 ? `
                    <div style="margin-top: 6px; font-size: 0.7rem; color: #10b981;">
                        <i class="fa-solid fa-coins"></i> Você economiza ${formatarMoeda(economia)}!
                    </div>
                ` : ''}
            </div>
            
            <div style="border-top: 1px dashed rgba(245, 158, 11, 0.2); padding-top: 10px;">
                <div style="font-size: 0.7rem; color: #f59e0b; margin-bottom: 8px;">
                    <i class="fa-solid fa-list-ul"></i> Serviços inclusos no pacote:
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${pacoteInfo.servicos.map((servico, idx) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; 
                                    background: rgba(245, 158, 11, 0.05); 
                                    border-radius: 10px; 
                                    padding: 8px 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.7rem; color: #f59e0b;">${idx + 1}.</span>
                                <i class="fa-solid fa-cut" style="color: #f59e0b; font-size: 0.7rem;"></i>
                                <span style="font-size: 0.75rem;">${escapeHtml(servico.nome)}</span>
                            </div>
                            <span style="color: #94a3b8; font-size: 0.7rem;">${formatarMoeda(servico.preco || 0)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    return html;
}

function formatarListaCompleta() {
    if (!dadosAgendamento) return '';
    
    let html = '';
    
    if (dadosAgendamento.pacoteInfo) {
        html += formatarPacote(dadosAgendamento.pacoteInfo);
    } else if (dadosAgendamento.servicos && dadosAgendamento.servicos.length > 0) {
        html += formatarListaServicos(dadosAgendamento.servicos);
    } else if (dadosAgendamento.servicoNome) {
        html += `<div style="display: flex; justify-content: space-between; padding: 8px 0;">
                    <span>${escapeHtml(dadosAgendamento.servicoNome)}</span>
                    <span style="color: #2199EF;">${formatarMoeda(dadosAgendamento.valor || 0)}</span>
                 </div>`;
    }
    
    return html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.querySelectorAll('.method-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.method-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        metodoSelecionado = card.dataset.method;
        
        if (parcelamentoSection) {
            if (metodoSelecionado === 'cartao_credito') {
                parcelamentoSection.style.display = 'block';
                atualizarParcelas();
            } else {
                parcelamentoSection.style.display = 'none';
            }
        }
        
        if (btnConfirmar) btnConfirmar.disabled = false;
    });
});

function formatarData(dataStr) {
    if (!dataStr) return '-';
    if (dataStr.includes('/')) return dataStr;
    const partes = dataStr.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
}

// ==================== FUNÇÃO CORRIGIDA: Envia mensagem APENAS para o estabelecimento com ID da comanda ====================
function enviarWhatsAppEstabelecimento(comandaId) {
    const telefone = TELEFONE_ESTABELECIMENTO;
    
    if (!telefone) {
        console.error("Telefone do estabelecimento não configurado");
        return false;
    }
    
    const numeroLimpo = telefone.toString().replace(/\D/g, "");
    if (numeroLimpo.length < 10) return false;

    let num = numeroLimpo;
    if (num.length === 10) {
        num = num.substring(0, 2) + '9' + num.substring(2);
    }
    if (!num.startsWith('55')) {
        num = '55' + num;
    }

    let textoPagamento = '';
    let metodoNome = '';
    
    switch(metodoSelecionado) {
        case 'pix':
            metodoNome = 'PIX';
            textoPagamento = '💳 *Forma de Pagamento:* PIX\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento';
            break;
        case 'cartao_credito':
            metodoNome = 'Cartão de Crédito';
            const parcelas = (parcelasSelect && metodoSelecionado === 'cartao_credito') ? parseInt(parcelasSelect.value) : 1;
            if (parcelas > 1) {
                textoPagamento = `💳 *Forma de Pagamento:* Cartão de Crédito (${parcelas}x)\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento`;
            } else {
                textoPagamento = `💳 *Forma de Pagamento:* Cartão de Crédito (à vista)\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento`;
            }
            break;
        case 'cartao_debito':
            metodoNome = 'Cartão de Débito';
            textoPagamento = '💳 *Forma de Pagamento:* Cartão de Débito\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento';
            break;
        case 'dinheiro':
            metodoNome = 'Dinheiro';
            textoPagamento = '💵 *Forma de Pagamento:* Dinheiro\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento';
            break;
        default:
            metodoNome = metodoSelecionado;
            textoPagamento = `💳 *Forma de Pagamento:* ${metodoNome}\n💰 *Pagamento:* Será realizado na barbearia no momento do atendimento`;
    }

    let listaServicos = '';
    
    if (dadosAgendamento.pacoteInfo) {
        const pacote = dadosAgendamento.pacoteInfo;
        listaServicos = `📦 *PACOTE: ${pacote.nome}*\n`;
        listaServicos += `   Serviços inclusos:\n`;
        pacote.servicos.forEach((s, i) => {
            const qtd = s.quantidade || 1;
            const nomeServico = s.nome || (s.servico && s.servico.nome) || 'Serviço';
            listaServicos += `   ${i + 1}. ${qtd}x ${nomeServico}\n`;
        });
        listaServicos += `   💰 *Valor Original:* ${formatarMoeda(pacote.precoOriginal)}\n`;
        listaServicos += `   🎯 *Preço com Desconto:* ${formatarMoeda(pacote.preco)}`;
        if (pacote.descontoPercentual) {
            listaServicos += ` (${pacote.descontoPercentual}% OFF)`;
        }
        listaServicos += `\n`;
    } else if (dadosAgendamento.servicos && dadosAgendamento.servicos.length > 0) {
        dadosAgendamento.servicos.forEach((s, i) => {
            listaServicos += `${i + 1}. ${s.nome}\n`;
        });
    } else if (dadosAgendamento.servicoNome) {
        listaServicos = `• ${dadosAgendamento.servicoNome}\n`;
    }
    
    const valorFormatado = formatarMoeda(dadosAgendamento.valor || 0);
    const observacao = dadosAgendamento.observacaoGeral ? `\n📝 *Observação:* ${dadosAgendamento.observacaoGeral}\n` : '';
    
    // 🆕 Adicionar duração na mensagem
    let duracaoTexto = '';
    if (dadosAgendamento.duracaoTotal) {
        duracaoTexto = `⏱️ *Duração:* ${formatarDuracao(dadosAgendamento.duracaoTotal)}\n`;
    }

    const mensagem = `🪒 *NOVO AGENDAMENTO CONFIRMADO!* 🪒

━━━━━━━━━━━━━━━━━━━━
👤 *DADOS DO CLIENTE*
━━━━━━━━━━━━━━━━━━━━
👤 *Nome:* ${dadosAgendamento.cliente || dadosAgendamento.nome}
📞 *WhatsApp:* ${dadosAgendamento.telefone || dadosAgendamento.whatsapp || 'Não informado'}
📧 *E-mail:* ${dadosAgendamento.email || 'Não informado'}

━━━━━━━━━━━━━━━━━━━━
📅 *DETALHES DO AGENDAMENTO*
━━━━━━━━━━━━━━━━━━━━
📅 *Data:* ${formatarData(dadosAgendamento.data)}
⏰ *Horário:* ${dadosAgendamento.horario}
${duracaoTexto}👨‍💼 *Barbeiro:* ${dadosAgendamento.profissional || 'Alpha BarberShop'}

━━━━━━━━━━━━━━━━━━━━
✂️ *SERVIÇOS CONTRATADOS*
━━━━━━━━━━━━━━━━━━━━
${listaServicos}
━━━━━━━━━━━━━━━━━━━━
💳 *PAGAMENTO*
━━━━━━━━━━━━━━━━━━━━
${textoPagamento}
💰 *Valor Total:* ${valorFormatado}
${observacao}
━━━━━━━━━━━━━━━━━━━━
📍 *Local do Atendimento:*
Alpha BarberShop
Av. Presidente Epitácio Pessoa, 5102
João Pessoa - PB

---
⚡ *Mensagem automática - Alpha BarberShop*`;

    const url = `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`;
    
    setTimeout(() => {
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
    }, 500);
    
    return true;
}

async function carregarClientesCache() {
    try {
        const clientesRef = collection(db, "clientes");
        const snapshot = await getDocs(clientesRef);
        clientesCache = [];
        snapshot.forEach(doc => {
            clientesCache.push({ id: doc.id, ...doc.data() });
        });
        console.log("Clientes carregados em cache:", clientesCache.length);
    } catch (error) {
        console.error("Erro ao carregar clientes:", error);
    }
}

async function carregarServicosCache() {
    try {
        const servicosRef = collection(db, "servicos");
        const snapshot = await getDocs(servicosRef);
        servicosCache = [];
        snapshot.forEach(doc => {
            servicosCache.push({ id: doc.id, ...doc.data() });
        });
        console.log("Serviços carregados em cache:", servicosCache.length);
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
    }
}

function buscarClienteIdPorNome(nomeCliente) {
    if (!nomeCliente) return null;
    const cliente = clientesCache.find(c => c.nome === nomeCliente);
    return cliente ? { id: cliente.id, data: cliente } : null;
}

function buscarServicoIdPorNome(nomeServico) {
    if (!nomeServico) return null;
    const servico = servicosCache.find(s => s.nome === nomeServico);
    return servico ? { id: servico.id, data: servico } : null;
}

async function confirmarPagamento() {
    if (!metodoSelecionado) {
        showMessage("Selecione uma forma de pagamento.", "error");
        return;
    }
    
    if (!dadosAgendamento) {
        showMessage("Dados do agendamento não encontrados.", "error");
        return;
    }
    
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
    }
    
    try {
        const parcelas = (parcelasSelect && metodoSelecionado === 'cartao_credito') ? parseInt(parcelasSelect.value) : 1;
        
        const metodoNome = {
            'pix': 'PIX',
            'cartao_credito': 'Cartão de Crédito',
            'cartao_debito': 'Cartão de Débito',
            'dinheiro': 'Dinheiro'
        }[metodoSelecionado] || metodoSelecionado;
        
        let clienteId = dadosAgendamento.clienteId;
        
        if (!clienteId && dadosAgendamento.cliente) {
            const clienteEncontrado = buscarClienteIdPorNome(dadosAgendamento.cliente);
            if (clienteEncontrado) {
                clienteId = clienteEncontrado.id;
                console.log("Cliente ID encontrado no cache:", clienteId);
            }
        }
        
        const parcelasTexto = parcelas > 1 && metodoSelecionado === 'cartao_credito' 
            ? ` em ${parcelas}x` 
            : '';
        
        const agendamentoRef = doc(db, "agendamentos", dadosAgendamento.id);
        await updateDoc(agendamentoRef, {
            status: "confirmado",
            pagamentoStatus: "confirmado",
            metodoPagamento: metodoSelecionado,
            metodoPagamentoNome: metodoNome,
            parcelas: parcelas,
            clienteId: clienteId,
            dataPagamentoConfirmacao: Timestamp.now(),
            atualizadoEm: Timestamp.now()
        });
        
        const pagamentoData = {
            agendamentoId: dadosAgendamento.id,
            clienteId: clienteId,
            clienteNome: dadosAgendamento.cliente || dadosAgendamento.nome,
            profissionalId: dadosAgendamento.profissionalId,
            profissionalNome: dadosAgendamento.profissional,
            valor: dadosAgendamento.valor,
            metodo: metodoSelecionado,
            metodoNome: metodoNome,
            parcelas: parcelas,
            data: dadosAgendamento.data,
            dataAgendamento: dadosAgendamento.data,
            horarioAgendamento: dadosAgendamento.horario,
            duracao: dadosAgendamento.duracaoTotal,
            status: 'pago',
            observacao: `Forma de pagamento confirmada pelo cliente: ${metodoNome}${parcelasTexto}. Pagamento será realizado no local do atendimento.`,
            createdAt: Timestamp.now(),
            atualizadoEm: Timestamp.now()
        };
        
        if (dadosAgendamento.pacoteInfo) {
            pagamentoData.pacoteId = dadosAgendamento.pacoteInfo.id;
            pagamentoData.pacoteNome = dadosAgendamento.pacoteInfo.nome;
            pagamentoData.pacoteInfo = dadosAgendamento.pacoteInfo;
            pagamentoData.descontoAplicado = dadosAgendamento.pacoteInfo.descontoPercentual || 0;
            pagamentoData.servicos = dadosAgendamento.pacoteInfo.servicos;
        } else if (dadosAgendamento.servicos) {
            pagamentoData.servicos = dadosAgendamento.servicos;
        } else if (dadosAgendamento.servicoNome) {
            pagamentoData.servicoNome = dadosAgendamento.servicoNome;
            pagamentoData.servicoId = dadosAgendamento.servicoId;
        }
        
        console.log("💾 Salvando pagamento com dados:", pagamentoData);
        
        const pagamentosRef = collection(db, "pagamentos");
        await addDoc(pagamentosRef, pagamentoData);
        
        const comandaQuery = query(collection(db, "comandas"), where("agendamentoId", "==", dadosAgendamento.id));
        const comandaSnap = await getDocs(comandaQuery);
        
        let comandaId = null;
        
        for (const docSnap of comandaSnap.docs) {
            comandaId = docSnap.id;
            const comandaUpdateData = {
                status: "aberta",
                formaPagamento: metodoSelecionado,
                formaPagamentoNome: metodoNome,
                parcelas: parcelas,
                clienteId: clienteId,
                duracaoTotal: dadosAgendamento.duracaoTotal,
                updatedAt: Timestamp.now()
            };
            
            if (dadosAgendamento.pacoteInfo) {
                comandaUpdateData.pacotes = [dadosAgendamento.pacoteInfo];
                comandaUpdateData.total = dadosAgendamento.pacoteInfo.preco;
                comandaUpdateData.descontoAplicado = dadosAgendamento.pacoteInfo.descontoPercentual || 0;
            }
            
            await updateDoc(doc(db, "comandas", docSnap.id), comandaUpdateData);
            console.log("✅ Comanda atualizada com parcelas:", parcelas);
            console.log("📋 ID da Comanda:", comandaId);
        }
        
        showMessage(`✅ Forma de pagamento confirmada! Pagamento será realizado na barbearia.`, "success");
        
        if (comandaId) {
            enviarWhatsAppEstabelecimento(comandaId);
        } else {
            console.warn("⚠️ Comanda ID não encontrado para enviar mensagem");
        }
        
        setTimeout(() => {
            window.location.href = 'agendamento-confirmado.html';
        }, 3000);
        
    } catch (error) {
        console.error("❌ Erro ao confirmar:", error);
        showMessage("Erro ao confirmar forma de pagamento. Tente novamente.", "error");
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Forma de Pagamento';
        }
    }
}

if (btnConfirmar) {
    btnConfirmar.addEventListener('click', confirmarPagamento);
}

async function carregarDados() {
    console.log("Carregando dados do agendamento. ID:", agendamentoId);
    
    if (!agendamentoId) {
        showMessage("Nenhum agendamento encontrado. ID não informado.", "error");
        return;
    }
    
    if (!autenticado) {
        showMessage("Aguardando autenticação...", "info");
        return;
    }
    
    try {
        await Promise.all([
            carregarClientesCache(),
            carregarServicosCache()
        ]);
        
        const agendamentoRef = doc(db, "agendamentos", agendamentoId);
        const agendamentoDoc = await getDoc(agendamentoRef);
        
        if (agendamentoDoc.exists()) {
            dadosAgendamento = { id: agendamentoDoc.id, ...agendamentoDoc.data() };
            console.log("✅ Agendamento encontrado:", dadosAgendamento);
            
            const comandaQuery = query(collection(db, "comandas"), where("agendamentoId", "==", dadosAgendamento.id));
            const comandaSnap = await getDocs(comandaQuery);
            if (!comandaSnap.empty) {
                comandaIdAtual = comandaSnap.docs[0].id;
                console.log("📋 Comanda existente encontrada:", comandaIdAtual);
            }
            
            if (clienteNome) clienteNome.textContent = dadosAgendamento.cliente || dadosAgendamento.nome || '-';
            
            // 🆕 EXIBIR DURAÇÃO DO SERVIÇO
            if (dadosAgendamento.duracaoTotal) {
                const duracaoFormatada = formatarDuracao(dadosAgendamento.duracaoTotal);
                if (duracaoServico) {
                    duracaoServico.textContent = duracaoFormatada;
                    duracaoServico.style.color = '#f59e0b';
                    duracaoServico.style.fontWeight = '600';
                }
                if (duracaoRow) duracaoRow.style.display = 'flex';
                console.log(`⏱️ Duração do serviço: ${duracaoFormatada}`);
            } else {
                if (duracaoRow) duracaoRow.style.display = 'none';
            }
            
            if (dadosAgendamento.cliente && !dadosAgendamento.clienteId) {
                const clienteEncontrado = buscarClienteIdPorNome(dadosAgendamento.cliente);
                if (clienteEncontrado) {
                    dadosAgendamento.clienteId = clienteEncontrado.id;
                }
            }
            
            if (dadosAgendamento.pacoteInfo) {
                console.log("🎁 PACOTE detectado:", dadosAgendamento.pacoteInfo);
                
                const pacoteHtml = formatarPacote(dadosAgendamento.pacoteInfo);
                if (servicosDetalhes) servicosDetalhes.innerHTML = pacoteHtml;
                if (servicosListaDiv) servicosListaDiv.style.display = 'block';
                if (servicoNome) {
                    servicoNome.innerHTML = `<span style="color: #f59e0b;"><i class="fa-solid fa-gift"></i> ${escapeHtml(dadosAgendamento.pacoteInfo.nome)}</span>`;
                }
                
                if (valorTotal) {
                    valorTotal.textContent = formatarMoeda(dadosAgendamento.pacoteInfo.preco);
                    valorTotal.style.color = '#10b981';
                }
            } 
            else if (dadosAgendamento.servicos && dadosAgendamento.servicos.length > 0) {
                const servicosHtml = formatarListaServicos(dadosAgendamento.servicos);
                if (servicosDetalhes) servicosDetalhes.innerHTML = servicosHtml;
                if (servicosListaDiv) servicosListaDiv.style.display = 'block';
                
                const nomesServicos = dadosAgendamento.servicos.map(s => s.nome).join(', ');
                if (servicoNome) servicoNome.textContent = nomesServicos;
                if (valorTotal) valorTotal.style.color = '';
            } 
            else if (dadosAgendamento.servicoNome) {
                if (servicoNome) servicoNome.textContent = dadosAgendamento.servicoNome;
                if (servicosListaDiv) servicosListaDiv.style.display = 'none';
                if (valorTotal) valorTotal.style.color = '';
            } 
            else {
                if (servicoNome) servicoNome.textContent = '-';
                if (servicosListaDiv) servicosListaDiv.style.display = 'none';
            }
            
            if (dadosAgendamento.observacaoGeral && dadosAgendamento.observacaoGeral.trim() !== '') {
                if (observacaoRow) observacaoRow.style.display = 'flex';
                if (observacaoGeralSpan) observacaoGeralSpan.textContent = dadosAgendamento.observacaoGeral;
            } else {
                if (observacaoRow) observacaoRow.style.display = 'none';
            }
            
            if (profissionalNome) profissionalNome.textContent = dadosAgendamento.profissional || 'Alpha BarberShop';
            if (agendamentoData) agendamentoData.textContent = formatarData(dadosAgendamento.data) || '-';
            if (agendamentoHorario) agendamentoHorario.textContent = dadosAgendamento.horario || '-';
            
            if (!dadosAgendamento.pacoteInfo && valorTotal) {
                valorTotal.textContent = formatarMoeda(dadosAgendamento.valor || 0);
            }
            
            if (dadosAgendamento.pagamentoStatus === 'confirmado' || dadosAgendamento.status === 'confirmado') {
                showMessage("⚠️ Este agendamento já foi confirmado anteriormente.", "info");
                if (btnConfirmar) btnConfirmar.disabled = true;
            }
            
        } else {
            console.log("❌ Agendamento não encontrado para o ID:", agendamentoId);
            showMessage("Agendamento não encontrado.", "error");
        }
    } catch (error) {
        console.error("❌ Erro ao carregar dados:", error);
        showMessage("Erro ao carregar dados do agendamento: " + error.message, "error");
    }
}

signInAnonymously(auth).then(() => {
    autenticado = true;
    carregarDados();
}).catch((error) => {
    console.error("❌ Erro na autenticação:", error);
    showMessage("Erro de autenticação.", "error");
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        autenticado = true;
        carregarDados();
    }
});