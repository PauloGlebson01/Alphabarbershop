// agenda.js - Versão Corrigida com suporte a PRÉ-LANÇAMENTOS E LEMBRETES WHATSAPP
// Com sincronização em tempo real com comandas e atualização de estoque ao concluir
// CORREÇÃO: URL de avaliação corrigida (sem duplicação)
// VERSÃO: Layout Horizontal em Tabela com Dia da Semana Corrigido
// CORREÇÃO v2: Removidos botões "Ausente" e "Cancelar" - gestão feita apenas na comanda
// NOVIDADE: Lista de Espera integrada com notificação automática - SEM ÍNDICES COMPOSTOS

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
    onSnapshot,
    addDoc,
    getDoc,
    setDoc,
    orderBy,
    deleteDoc
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
const auth = getAuth(app);
const db = getFirestore(app);

// Elementos DOM
const confirmadosDiv = document.getElementById('confirmados');
const concluidosDiv = document.getElementById('concluidos');
const ausentesDiv = document.getElementById('ausentes');
const canceladosDiv = document.getElementById('cancelados');
const countConfirmado = document.getElementById('countConfirmado');
const countConcluido = document.getElementById('countConcluido');
const countAusente = document.getElementById('countAusente');
const countCancelado = document.getElementById('countCancelado');
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const btnFiltrarPeriodo = document.getElementById('btnFiltrarPeriodo');
const btnLimparPeriodo = document.getElementById('btnLimparPeriodo');
const btnSincronizarComandas = document.getElementById('btnSincronizarComandas');

let unsubscribe = null;
let unsubscribeComandas = null;

// ==================== FUNÇÕES AUXILIARES DE FORMATAÇÃO ====================

function getDataAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function formatarData(dataStr) {
    if (!dataStr) return 'Data não informada';
    if (dataStr.toDate) {
        const date = dataStr.toDate();
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }
    if (typeof dataStr === 'string') {
        if (dataStr.includes('-')) {
            const [ano, mes, dia] = dataStr.split('-');
            return `${dia}/${mes}/${ano}`;
        }
        if (dataStr.includes('/')) {
            return dataStr;
        }
    }
    return 'Data inválida';
}

function obterDiaSemana(dataStr) {
    if (!dataStr) return '';
    
    try {
        let dia = null, mes = null, ano = null;
        let data;
        
        if (dataStr.toDate) {
            data = dataStr.toDate();
        }
        else if (typeof dataStr === 'string' && dataStr.includes('/')) {
            const partes = dataStr.split('/');
            if (partes.length >= 3) {
                dia = parseInt(partes[0], 10);
                mes = parseInt(partes[1], 10);
                ano = parseInt(partes[2], 10);
                data = new Date(ano, mes - 1, dia);
            }
        }
        else if (typeof dataStr === 'string' && dataStr.includes('-')) {
            const partes = dataStr.split('-');
            if (partes.length >= 3) {
                ano = parseInt(partes[0], 10);
                mes = parseInt(partes[1], 10);
                dia = parseInt(partes[2], 10);
                data = new Date(ano, mes - 1, dia);
            }
        }
        
        if (data && !isNaN(data.getTime())) {
            const diasSemana = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
            return diasSemana[data.getDay()];
        }
        
        return '';
    } catch (error) {
        console.error("Erro ao calcular dia da semana:", error);
        return '';
    }
}

function formatarHorario(horario) {
    return horario || '--:00';
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function mostrarToast(mensagem, tipo = 'sucesso') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        toast.innerHTML = '<i class="fa-solid fa-circle-check"></i><span id="toastMsg"></span>';
        document.body.appendChild(toast);
    }
    const toastMsg = document.getElementById('toastMsg');
    if (toastMsg) toastMsg.textContent = mensagem;
    toast.style.background = tipo === 'sucesso'
        ? 'linear-gradient(135deg, #2199EF, #1a7fcc)'
        : 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.style.display = 'flex';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
        toast.style.display = 'none';
    }, 3000);
}

// ==================== FUNÇÕES DE LEMBRETES WHATSAPP ====================

function limparTelefone(telefone) {
    if (!telefone) return null;
    let num = telefone.toString().replace(/\D/g, "");
    if (num.length < 10 || num.length > 11) return null;
    if (num.length === 10) {
        num = num.substring(0, 2) + '9' + num.substring(2);
    }
    if (!num.startsWith('55')) {
        num = '55' + num;
    }
    return num;
}

function gerarMensagemLembrete(nomeCliente, data, horario, profissional, servicos, valorTotal, tipo = 'dia') {
    const servicosTexto = servicos && servicos.length > 0 
        ? servicos.map(s => `✂️ ${s.nome || s}`).join('\n')
        : 'Atendimento na barbearia';
    
    if (tipo === 'vespera') {
        return `*🏢 STUDIO NOGUEIRA* - *LEMBRETE DE AGENDAMENTO* ⏰

Olá, *${nomeCliente}*! ✂️💈

Lembramos que você tem um agendamento marcado para amanhã:

📅 *Data:* ${data}
⏰ *Horário:* ${horario}
👨‍🦱 *Barbeiro:* ${profissional}

📋 *Serviços agendados:*
${servicosTexto}

💰 *Valor total:* ${formatarMoeda(valorTotal)}

✨ *IMPORTANTE:*
• Chegue com 10 minutos de antecedência
• Caso precise remarcar, entre em contato com antecedência

📞 *Dúvidas ou alterações?*
Entre em contato conosco: (83) 9 8661-7303

*Studio Nogueira* - Mais de 10 anos transformando estilos. ✂️💈

_Esta é uma mensagem automática. Por favor, não responda._`;
    } else {
        return `*🏢 STUDIO NOGUEIRA* - *LEMBRETE DO DIA!* 🔔

Olá, *${nomeCliente}*! ✂️💈

 Passando para confirmar seu agendamento para hoje:

📅 *Data:* ${data}
⏰ *Horário:* ${horario}
👨‍🦱 *Barbeiro:* ${profissional}

📋 *Serviços agendados:*
${servicosTexto}

💰 *Valor total:* ${formatarMoeda(valorTotal)}

está confirmado?`;
    }
}

function gerarMensagemConfirmacao(nomeCliente, data, horario, profissional) {
    return `*🏢 STUDIO NOGUEIRA* - *CONFIRMAÇÃO DE AGENDAMENTO* ✅

Olá, *${nomeCliente}*!

Seu agendamento foi confirmado com sucesso!

📅 *Data:* ${data}
⏰ *Horário:* ${horario}
👨‍🦱 *Barbeiro:* ${profissional}

📱 *Você receberá um lembrete um dia antes do seu horário.*

*Studio Nogueira* - Mais de 10 anos transformando estilos. ✂️💈

_Esta é uma mensagem automática._`;
}

async function enviarLembreteWhatsApp(agendamento, tipo = 'dia') {
    try {
        console.log(`📨 Enviando lembrete ${tipo} para agendamento:`, agendamento.id);
        
        let telefone = agendamento.telefone || agendamento.whatsapp || agendamento.celular;
        
        if (!telefone && agendamento.clienteId) {
            try {
                const clienteDoc = await getDoc(doc(db, "clientes", agendamento.clienteId));
                if (clienteDoc.exists()) {
                    telefone = clienteDoc.data().telefone || clienteDoc.data().whatsapp || null;
                }
            } catch (error) {
                console.error("Erro ao buscar telefone do cliente:", error);
            }
        }
        
        if (!telefone && (agendamento.cliente || agendamento.nome)) {
            try {
                const clientesQuery = query(collection(db, "clientes"), where("nome", "==", agendamento.cliente || agendamento.nome));
                const clientesSnap = await getDocs(clientesQuery);
                if (!clientesSnap.empty) {
                    telefone = clientesSnap.docs[0].data().telefone || null;
                }
            } catch (error) {
                console.error("Erro ao buscar telefone por nome:", error);
            }
        }
        
        if (!telefone) {
            console.log(`❌ Telefone não encontrado para agendamento ${agendamento.id}`);
            return { sucesso: false, motivo: "Telefone não encontrado" };
        }
        
        const telefoneLimpo = limparTelefone(telefone);
        if (!telefoneLimpo) {
            console.log(`❌ Telefone inválido para agendamento ${agendamento.id}: ${telefone}`);
            return { sucesso: false, motivo: "Telefone inválido" };
        }
        
        const nomeCliente = agendamento.cliente || agendamento.nome || agendamento.clienteNome || 'Cliente';
        const data = formatarData(agendamento.data);
        const horario = formatarHorario(agendamento.horario);
        const profissional = agendamento.profissional || agendamento.barbeiroNome || 'Barbeiro Studio Nogueira';
        
        let servicos = [];
        let valorTotal = agendamento.valor || agendamento.valorTotal || 0;
        
        if (agendamento.servicos && Array.isArray(agendamento.servicos)) {
            servicos = agendamento.servicos.map(s => ({ nome: s.nome || s.servicoNome }));
        } else if (agendamento.servico) {
            servicos = [{ nome: agendamento.servico }];
        } else if (agendamento.servicoNome) {
            servicos = [{ nome: agendamento.servicoNome }];
        }
        
        let mensagem = '';
        if (tipo === 'vespera') {
            mensagem = gerarMensagemLembrete(nomeCliente, data, horario, profissional, servicos, valorTotal, 'vespera');
        } else if (tipo === 'confirmacao') {
            mensagem = gerarMensagemConfirmacao(nomeCliente, data, horario, profissional);
        } else {
            mensagem = gerarMensagemLembrete(nomeCliente, data, horario, profissional, servicos, valorTotal, 'dia');
        }
        
        const url = `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, '_blank');
        
        await addDoc(collection(db, "historico_lembretes"), {
            agendamentoId: agendamento.id,
            clienteId: agendamento.clienteId,
            clienteNome: nomeCliente,
            tipo: tipo,
            telefone: telefone,
            dataAgendamento: agendamento.data,
            horarioAgendamento: agendamento.horario,
            enviadoEm: Timestamp.now(),
            status: "enviado"
        });
        
        const agendamentoRef = doc(db, "agendamentos", agendamento.id);
        const campoAtualizar = tipo === 'vespera' ? 'lembreteVesperaEnviado' : (tipo === 'confirmacao' ? 'lembreteConfirmacaoEnviado' : 'lembreteDiaEnviado');
        await updateDoc(agendamentoRef, {
            [campoAtualizar]: true,
            ultimoLembreteEnviado: Timestamp.now()
        });
        
        console.log(`✅ Lembrete ${tipo} enviado com sucesso para ${nomeCliente}`);
        return { sucesso: true, mensagem: "Lembrete enviado com sucesso!" };
        
    } catch (error) {
        console.error("❌ Erro ao enviar lembrete:", error);
        return { sucesso: false, motivo: error.message };
    }
}

async function verificarLembretesAutomaticos() {
    const dataHoje = getDataAtual();
    const dataAmanha = (() => {
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        const ano = amanha.getFullYear();
        const mes = String(amanha.getMonth() + 1).padStart(2, '0');
        const dia = String(amanha.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    })();
    
    console.log(`🔍 Verificando lembretes para hoje (${dataHoje}) e amanhã (${dataAmanha})...`);
    
    try {
        const agora = new Date();
        const horaAtual = agora.getHours();
        
        const agendamentosRef = collection(db, "agendamentos");
        const statusAceitos = ["confirmado", "aguardando_pagamento"];
        
        if (horaAtual >= 8 && horaAtual <= 11) {
            const qDia = query(agendamentosRef, where("data", "==", dataHoje), where("status", "in", statusAceitos));
            const snapshotDia = await getDocs(qDia);
            
            for (const doc of snapshotDia.docs) {
                const agendamento = { id: doc.id, ...doc.data() };
                if (!agendamento.lembreteDiaEnviado) {
                    console.log(`📨 Enviando lembrete do dia para: ${agendamento.cliente || agendamento.nome}`);
                    await enviarLembreteWhatsApp(agendamento, 'dia');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        if (horaAtual >= 20 && horaAtual <= 23) {
            const qVespera = query(agendamentosRef, where("data", "==", dataAmanha), where("status", "in", statusAceitos));
            const snapshotVespera = await getDocs(qVespera);
            
            for (const doc of snapshotVespera.docs) {
                const agendamento = { id: doc.id, ...doc.data() };
                if (!agendamento.lembreteVesperaEnviado) {
                    console.log(`📨 Enviando lembrete de véspera para: ${agendamento.cliente || agendamento.nome}`);
                    await enviarLembreteWhatsApp(agendamento, 'vespera');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
    } catch (error) {
        console.error("❌ Erro ao verificar lembretes automáticos:", error);
    }
}

// ==================== FUNÇÕES AUXILIARES PARA BUSCAR TELEFONE ====================

async function buscarTelefoneCliente(clienteId) {
    if (!clienteId) return null;
    try {
        const clienteDoc = await getDoc(doc(db, "clientes", clienteId));
        if (clienteDoc.exists()) {
            const dados = clienteDoc.data();
            return dados.telefone || dados.whatsapp || dados.celular || null;
        }
    } catch (error) {
        console.error("Erro ao buscar telefone do cliente:", error);
    }
    return null;
}

async function buscarTelefonePorNome(nomeCliente) {
    if (!nomeCliente) return null;
    try {
        const clientesQuery = query(collection(db, "clientes"), where("nome", "==", nomeCliente));
        const clientesSnap = await getDocs(clientesQuery);
        if (!clientesSnap.empty) {
            const dados = clientesSnap.docs[0].data();
            return dados.telefone || dados.whatsapp || dados.celular || null;
        }
    } catch (error) {
        console.error("Erro ao buscar telefone por nome:", error);
    }
    return null;
}

// ==================== FUNÇÕES DE FIDELIDADE ====================

async function getConfigFidelidade() {
    try {
        const configDoc = await getDoc(doc(db, "configuracoes", "fidelidade"));
        if (configDoc.exists()) {
            return configDoc.data();
        }
        return {
            pontosPorRealServico: 1,
            pontosPorRealProduto: 0.5,
            pontosAniversario: 100,
            pontosIndicacao: 50,
            pontosAvaliacao: 20,
            niveis: { bronze: 0, prata: 500, ouro: 1500, diamante: 5000 }
        };
    } catch (error) {
        console.error("Erro ao buscar configurações de fidelidade:", error);
        return {
            pontosPorRealServico: 1,
            pontosPorRealProduto: 0.5,
            niveis: { bronze: 0, prata: 500, ouro: 1500, diamante: 5000 }
        };
    }
}

async function adicionarPontosFidelidade(clienteId, clienteNome, valorTotal, tipo = "servico") {
    try {
        if (!clienteId) {
            console.log("❌ Cliente ID não fornecido, não é possível adicionar pontos");
            return false;
        }

        const config = await getConfigFidelidade();

        let pontos = 0;
        if (tipo === "servico") {
            pontos = Math.floor(valorTotal * (config.pontosPorRealServico || 1));
        } else {
            pontos = Math.floor(valorTotal * (config.pontosPorRealProduto || 0.5));
        }

        if (pontos === 0) return false;

        console.log(`🎯 Adicionando ${pontos} pontos para ${clienteNome} (${tipo})`);

        const fidelidadeQuery = query(collection(db, "clientes_fidelidade"), where("clienteId", "==", clienteId));
        const fidelidadeSnap = await getDocs(fidelidadeQuery);

        if (!fidelidadeSnap.empty) {
            const fidelidadeDoc = fidelidadeSnap.docs[0];
            const pontosAtuais = fidelidadeDoc.data().pontos || 0;
            const pontosGanhos = fidelidadeDoc.data().pontosGanhos || 0;

            await updateDoc(doc(db, "clientes_fidelidade", fidelidadeDoc.id), {
                pontos: pontosAtuais + pontos,
                pontosGanhos: pontosGanhos + pontos,
                ultimaCompra: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
            console.log(`✅ Pontos atualizados: ${pontosAtuais} → ${pontosAtuais + pontos}`);
        } else {
            await addDoc(collection(db, "clientes_fidelidade"), {
                clienteId: clienteId,
                nome: clienteNome,
                pontos: pontos,
                pontosGanhos: pontos,
                totalResgatados: 0,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
            console.log(`✅ Novo cliente criado no fidelidade com ${pontos} pontos`);
        }

        await addDoc(collection(db, "historico_pontos"), {
            clienteId: clienteId,
            clienteNome: clienteNome,
            quantidade: pontos,
            motivo: `Atendimento concluído - ${tipo === "servico" ? "Serviço" : "Produto"} no valor de ${formatarMoeda(valorTotal)}`,
            data: Timestamp.now()
        });

        mostrarToast(`🎉 +${pontos} pontos no programa de fidelidade!`, "sucesso");
        return true;

    } catch (error) {
        console.error("Erro ao adicionar pontos de fidelidade:", error);
        return false;
    }
}

// ==================== FUNÇÃO PARA IDENTIFICAR SE É PACOTE PELO NOME ====================

function isPacotePeloNome(nome) {
    if (!nome) return false;
    const nomeLower = nome.toLowerCase();
    const termosPacote = ['combo', 'pacote', 'kit', 'promoção', 'promocao', 'especial', 'premium pack', 'bundle'];
    return termosPacote.some(termo => nomeLower.includes(termo));
}

// ==================== FUNÇÃO PARA EXTRAIR ITENS E AGRUPAR PACOTES ====================

function extrairItensDoAgendamento(agendamento) {
    let itens = [];
    let valorTotal = 0;

    if (agendamento.pacoteInfo || agendamento.pacote) {
        const pacote = agendamento.pacoteInfo || agendamento.pacote;

        let precoOriginal = pacote.precoOriginal || pacote.precoTotalOriginal || pacote.preco || 0;
        let precoFinal = pacote.precoComDesconto || pacote.preco || 0;
        let descontoPercentual = pacote.descontoPercentual || 0;

        if (descontoPercentual === 0 && precoOriginal > precoFinal) {
            descontoPercentual = Math.round((1 - precoFinal / precoOriginal) * 100);
        }

        const servicosPacote = pacote.servicos || [];
        valorTotal = precoFinal;

        itens.push({
            id: pacote.id || pacote.pacoteId,
            nome: pacote.nome || "Pacote",
            quantidade: 1,
            precoOriginal: precoOriginal,
            precoFinal: precoFinal,
            descontoPercentual: descontoPercentual,
            descontoValor: precoOriginal - precoFinal,
            ehPacote: true,
            servicos: servicosPacote
        });

        return { itens, valorTotal };
    }

    if (agendamento.servicos && Array.isArray(agendamento.servicos) && agendamento.servicos.length > 0) {
        const primeiroItem = agendamento.servicos[0];

        if (agendamento.pacoteId || agendamento.pacote_nome || agendamento.pacoteNome) {
            const nomePacote = agendamento.pacote_nome || agendamento.pacoteNome || "Pacote";
            const precoOriginal = agendamento.valorOriginal || (agendamento.servicos.reduce((sum, s) => sum + (s.preco || 0), 0));
            const precoFinal = agendamento.valor || agendamento.precoTotal || precoOriginal;
            const descontoPercentual = agendamento.descontoPercentual || (precoOriginal > precoFinal ? Math.round((1 - precoFinal / precoOriginal) * 100) : 0);

            if (precoOriginal > precoFinal || descontoPercentual > 0) {
                itens.push({
                    id: agendamento.pacoteId,
                    nome: nomePacote,
                    quantidade: 1,
                    precoOriginal: precoOriginal,
                    precoFinal: precoFinal,
                    descontoPercentual: descontoPercentual,
                    descontoValor: precoOriginal - precoFinal,
                    ehPacote: true,
                    servicos: agendamento.servicos.map(s => ({ nome: s.nome, preco: s.preco }))
                });
                valorTotal = precoFinal;
                return { itens, valorTotal };
            }
        }

        if (primeiroItem && isPacotePeloNome(primeiroItem.nome)) {
            const precoOriginal = agendamento.servicos.reduce((sum, s) => sum + (s.precoOriginal || s.preco || 0), 0);
            const precoFinal = primeiroItem.preco || agendamento.valor || precoOriginal;
            const descontoPercentual = primeiroItem.descontoPercentual || (precoOriginal > precoFinal ? Math.round((1 - precoFinal / precoOriginal) * 100) : 0);

            itens.push({
                id: primeiroItem.id || primeiroItem.pacoteId,
                nome: primeiroItem.nome,
                quantidade: 1,
                precoOriginal: precoOriginal,
                precoFinal: precoFinal,
                descontoPercentual: descontoPercentual,
                descontoValor: precoOriginal - precoFinal,
                ehPacote: true,
                servicos: agendamento.servicos.map(s => ({ nome: s.nome, preco: s.precoOriginal || s.preco }))
            });
            valorTotal = precoFinal;
            return { itens, valorTotal };
        }

        const temDescontoGlobal = agendamento.servicos.some(s => (s.precoOriginal || 0) > (s.preco || 0));
        if (temDescontoGlobal && agendamento.servicos.length > 1) {
            const nomePacote = agendamento.pacoteNome || "Pacote Promocional";
            const precoOriginal = agendamento.servicos.reduce((sum, s) => sum + (s.precoOriginal || s.preco || 0), 0);
            const precoFinal = agendamento.servicos.reduce((sum, s) => sum + (s.preco || 0), 0);
            const descontoPercentual = Math.round((1 - precoFinal / precoOriginal) * 100);

            if (descontoPercentual > 0) {
                itens.push({
                    id: null,
                    nome: nomePacote,
                    quantidade: 1,
                    precoOriginal: precoOriginal,
                    precoFinal: precoFinal,
                    descontoPercentual: descontoPercentual,
                    descontoValor: precoOriginal - precoFinal,
                    ehPacote: true,
                    servicos: agendamento.servicos.map(s => ({ nome: s.nome, preco: s.precoOriginal || s.preco }))
                });
                valorTotal = precoFinal;
                return { itens, valorTotal };
            }
        }

        agendamento.servicos.forEach(item => {
            let precoOriginal = item.precoOriginal || item.preco || 0;
            let precoFinal = item.precoComDesconto || item.preco || 0;
            let descontoPercentual = item.descontoAplicado || item.descontoPercentual || 0;

            if (descontoPercentual === 0 && precoOriginal > precoFinal) {
                descontoPercentual = Math.round((1 - precoFinal / precoOriginal) * 100);
            }

            let quantidade = item.quantidade || 1;
            const valorItem = precoFinal * quantidade;
            valorTotal += valorItem;

            itens.push({
                id: item.id || item.servicoId,
                nome: item.nome || item.descricao || "Serviço",
                quantidade: quantidade,
                precoOriginal: precoOriginal,
                precoFinal: precoFinal,
                descontoPercentual: descontoPercentual,
                descontoValor: precoOriginal - precoFinal,
                ehPacote: false,
                servicos: []
            });
        });
    }

    if (itens.length === 0 && agendamento.valor) {
        itens.push({
            id: null,
            nome: agendamento.servicoNome || agendamento.servico || 'Atendimento',
            quantidade: 1,
            precoOriginal: agendamento.valor,
            precoFinal: agendamento.valor,
            descontoPercentual: 0,
            descontoValor: 0,
            ehPacote: false,
            servicos: []
        });
        valorTotal = agendamento.valor;
    }

    return { itens, valorTotal };
}

// ==================== SINCRONIZAR COMANDA COM AGENDAMENTO ====================

async function sincronizarComandaComAgendamento(comandaId, comandaData) {
    if (!comandaData.agendamentoId) return;

    try {
        const agendamentoRef = doc(db, "agendamentos", comandaData.agendamentoId);
        const agendamentoDoc = await getDoc(agendamentoRef);

        if (agendamentoDoc.exists()) {
            const agendamentoAtual = agendamentoDoc.data();

            const precisaAtualizar = JSON.stringify(agendamentoAtual.servicos) !== JSON.stringify(comandaData.servicos) ||
                JSON.stringify(agendamentoAtual.pacotes) !== JSON.stringify(comandaData.pacotes) ||
                agendamentoAtual.total !== comandaData.total;

            if (precisaAtualizar) {
                await updateDoc(agendamentoRef, {
                    servicos: comandaData.servicos || [],
                    pacotes: comandaData.pacotes || [],
                    valor: comandaData.total,
                    total: comandaData.total,
                    atualizadoEm: Timestamp.now()
                });
                console.log(`✅ Agendamento ${comandaData.agendamentoId} atualizado via comanda`);
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error("Erro ao sincronizar comanda com agendamento:", error);
        return false;
    }
}

// ==================== LISTENER DE COMANDAS ====================

function iniciarListenerComandas() {
    if (unsubscribeComandas) unsubscribeComandas();

    unsubscribeComandas = onSnapshot(collection(db, "comandas"), async (snapshot) => {
        let precisaAtualizar = false;

        for (const change of snapshot.docChanges()) {
            const comandaData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === "modified") {
                const atualizado = await sincronizarComandaComAgendamento(change.doc.id, comandaData);
                if (atualizado) precisaAtualizar = true;
            }
        }

        if (precisaAtualizar && typeof aplicarFiltro === 'function') {
            console.log("🔄 Atualizando agenda devido a mudanças na comanda...");
            aplicarFiltro();
        }
    }, (error) => {
        console.error("Erro no listener de comandas:", error);
    });
}

// ==================== FUNÇÃO PARA CRIAR COMANDA COM PRÉ-LANÇAMENTOS ====================

async function criarComandaDoAgendamento(agendamento) {
    try {
        console.log("🚀 Criando comanda para agendamento:", agendamento.id);

        const comandaExistenteQuery = query(
            collection(db, "comandas"),
            where("agendamentoId", "==", agendamento.id)
        );
        const comandaExistente = await getDocs(comandaExistenteQuery);

        if (!comandaExistente.empty) {
            console.log("📝 Comanda já existe, retornando ID:", comandaExistente.docs[0].id);
            return comandaExistente.docs[0].id;
        }

        let clienteId = agendamento.clienteId;
        let clienteNome = agendamento.cliente || agendamento.nome || 'Cliente';

        if (!clienteId && (agendamento.cliente || agendamento.nome)) {
            const clientesQuery = query(collection(db, "clientes"), where("nome", "==", clienteNome));
            const clientesSnap = await getDocs(clientesQuery);
            if (!clientesSnap.empty) {
                clienteId = clientesSnap.docs[0].id;
                console.log(`🔍 Cliente encontrado pelo nome: ${clienteId}`);
            }
        }

        let profissionalId = agendamento.profissionalId || agendamento.profissional_id;
        let profissionalNome = agendamento.profissional || 'Barbeiro';

        if (!profissionalId && profissionalNome) {
            const profQuery = query(collection(db, "profissionais"), where("nome", "==", profissionalNome));
            const profSnap = await getDocs(profQuery);
            if (!profSnap.empty) {
                profissionalId = profSnap.docs[0].id;
            }
        }

        const { itens, valorTotal } = extrairItensDoAgendamento(agendamento);

        let servicosComanda = itens.filter(i => !i.ehPacote).map(i => ({
            servicoId: i.id,
            nome: i.nome,
            preco: i.precoFinal,
            quantidade: i.quantidade,
            tipo: "servico"
        }));

        let pacotesComanda = itens.filter(i => i.ehPacote).map(i => ({
            pacoteId: i.id,
            nome: i.nome,
            quantidade: i.quantidade,
            precoOriginal: i.precoOriginal,
            preco: i.precoFinal,
            descontoPercentual: i.descontoPercentual,
            descontoValor: i.descontoValor,
            tipo: "pacote",
            servicos: i.servicos
        }));

        let produtosPreLancamento = [];
        let lembretesIds = [];
        
        if (clienteId) {
            console.log(`🔍 Buscando pré-lançamentos pendentes para o cliente: ${clienteId}`);
            
            try {
                const lembretesQuery = query(
                    collection(db, "lembretes_comanda"), 
                    where("clienteId", "==", clienteId),
                    where("status", "==", "pendente")
                );
                const lembretesSnapshot = await getDocs(lembretesQuery);
                
                console.log(`📦 Encontrados ${lembretesSnapshot.size} pré-lançamentos pendentes para o cliente ${clienteId}`);
                
                for (const lembreteDoc of lembretesSnapshot.docs) {
                    const pre = lembreteDoc.data();
                    produtosPreLancamento.push({
                        produtoId: pre.produtoId,
                        nome: pre.produtoNome,
                        preco: pre.preco || 0,
                        quantidade: pre.quantidade || 1,
                        isPreLancamento: true,
                        afetaEstoque: false,
                        observacaoPreLancamento: pre.observacao || "",
                        lembreteId: lembreteDoc.id,
                        comandaOrigemId: pre.comandaOrigemId
                    });
                    lembretesIds.push(lembreteDoc.id);
                    console.log(`📦 Adicionado pré-lançamento pendente à nova comanda: ${pre.produtoNome} (x${pre.quantidade || 1})`);
                }
                
                if (produtosPreLancamento.length > 0) {
                    mostrarToast(`📦 ${produtosPreLancamento.length} produto(s) em pré-lançamento serão incluídos na comanda!`, "sucesso");
                }
            } catch (error) {
                console.error("Erro ao buscar pré-lançamentos do cliente:", error);
            }
        } else {
            console.log("⚠️ Cliente sem ID, não é possível buscar pré-lançamentos");
        }

        let statusComanda = "aberta";
        if (agendamento.status === 'concluido') statusComanda = "finalizada";
        else if (agendamento.status === 'cancelado') statusComanda = "cancelada";
        else if (agendamento.status === 'ausente') statusComanda = "cancelada";

        const dataAgendamento = agendamento.data || new Date().toISOString().split('T')[0];

        const comandaData = {
            agendamentoId: agendamento.id,
            clienteId: clienteId,
            clienteNome: clienteNome,
            barbeiroId: profissionalId,
            barbeiroNome: profissionalNome,
            servicos: servicosComanda,
            pacotes: pacotesComanda,
            produtos: produtosPreLancamento,
            total: valorTotal,
            status: statusComanda,
            observacoes: agendamento.observacaoGeral || `Agendamento para ${formatarData(agendamento.data)} às ${agendamento.horario}`,
            formaPagamento: "pendente",
            dataAgendamento: dataAgendamento,
            horarioAgendamento: agendamento.horario,
            dataCriacao: Timestamp.now(),
            updatedAt: Timestamp.now(),
            origem: "agendamento"
        };

        const comandaRef = await addDoc(collection(db, "comandas"), comandaData);
        console.log(`✅ Comanda criada com ID: ${comandaRef.id} - ${produtosPreLancamento.length} produtos em pré-lançamento incluídos`);

        await updateDoc(doc(db, "agendamentos", agendamento.id), {
            comandaId: comandaRef.id,
            atualizadoEm: Timestamp.now()
        });

        return comandaRef.id;

    } catch (error) {
        console.error("❌ Erro ao criar comanda:", error);
        return null;
    }
}

// ==================== FUNÇÃO PARA ABRIR COMANDA ====================

async function abrirComandaDoAgendamento(agendamentoId) {
    try {
        mostrarToast("Abrindo comanda...", "sucesso");

        const comandaQuery = query(collection(db, "comandas"), where("agendamentoId", "==", agendamentoId));
        let comandaSnap = await getDocs(comandaQuery);

        if (comandaSnap.empty) {
            mostrarToast("Criando comanda com pré-lançamentos...", "sucesso");
            const agendamentoDoc = await getDoc(doc(db, "agendamentos", agendamentoId));
            if (agendamentoDoc.exists()) {
                const comandaId = await criarComandaDoAgendamento({ id: agendamentoId, ...agendamentoDoc.data() });
                if (comandaId) {
                    window.location.href = `comanda.html?id=${comandaId}`;
                    return;
                }
            }
            mostrarToast("Erro ao criar comanda", "erro");
            return;
        }

        window.location.href = `comanda.html?id=${comandaSnap.docs[0].id}`;

    } catch (error) {
        console.error("Erro ao abrir comanda:", error);
        mostrarToast("Erro ao abrir comanda", "erro");
    }
}

// ==================== FUNÇÃO CONCLUIR AGENDAMENTO ====================

async function concluirAgendamento(id, agendamento) {
    try {
        console.log("🔵 ========== INICIANDO CONCLUSÃO DO AGENDAMENTO ==========");
        console.log("📋 Agendamento ID:", id);
        console.log("👤 Cliente:", agendamento.cliente || agendamento.nome);
        console.log("🆔 Cliente ID:", agendamento.clienteId);
        
        const comandaQuery = query(collection(db, "comandas"), where("agendamentoId", "==", id));
        const comandaSnap = await getDocs(comandaQuery);
        
        let comandaData = null;
        let comandaId = null;
        
        if (!comandaSnap.empty) {
            comandaId = comandaSnap.docs[0].id;
            comandaData = { id: comandaId, ...comandaSnap.docs[0].data() };
            console.log("📦 Comanda encontrada:", comandaId);
            console.log("📦 Produtos na comanda:", comandaData.produtos?.length || 0);
            
            if (comandaData.produtos && comandaData.produtos.length > 0) {
                console.log("📦 Processando produtos da comanda:", comandaData.produtos.length);
                
                for (const item of comandaData.produtos) {
                    if (item.isPreLancamento) {
                        console.log(`⏭️ Produto ${item.nome} é pré-lançamento - estoque não afetado agora`);
                        continue;
                    }
                    
                    if (!item.produtoId) {
                        console.log(`⚠️ Produto ${item.nome} não tem produtoId, pulando...`);
                        continue;
                    }
                    
                    try {
                        const produtoRef = doc(db, "produtos", item.produtoId);
                        const produtoDoc = await getDoc(produtoRef);
                        
                        if (produtoDoc.exists()) {
                            const produtoData = produtoDoc.data();
                            const quantidadeSolicitada = item.quantidade || 1;
                            const quantidadeAtual = produtoData.quantidade || 0;
                            
                            if (quantidadeAtual >= quantidadeSolicitada) {
                                const novaQuantidade = quantidadeAtual - quantidadeSolicitada;
                                
                                await updateDoc(produtoRef, {
                                    quantidade: novaQuantidade,
                                    updatedAt: Timestamp.now()
                                });
                                
                                console.log(`✅ Estoque atualizado: ${item.nome} - ${quantidadeAtual} → ${novaQuantidade}`);
                                
                                await addDoc(collection(db, "movimentacoes"), {
                                    produtoId: item.produtoId,
                                    produtoNome: item.nome,
                                    tipo: "saida",
                                    quantidade: quantidadeSolicitada,
                                    quantidadeAnterior: quantidadeAtual,
                                    quantidadeNova: novaQuantidade,
                                    observacao: `Venda via comanda #${comandaData.numeroComanda || comandaId.slice(-6)} - Agendamento concluído`,
                                    data: Timestamp.now(),
                                    usuario: "Sistema (Agenda)"
                                });
                            } else {
                                console.warn(`⚠️ Estoque insuficiente para ${item.nome}: tem ${quantidadeAtual}, precisa ${quantidadeSolicitada}`);
                                mostrarToast(`⚠️ Estoque insuficiente para ${item.nome}!`, "erro");
                            }
                        }
                    } catch (err) {
                        console.error(`❌ Erro ao processar produto ${item.nome}:`, err);
                    }
                }
            }
            
            const produtosPreLancamento = (comandaData.produtos || []).filter(p => p.isPreLancamento === true);
            console.log(`📦 Encontrados ${produtosPreLancamento.length} produtos de pré-lançamento na comanda para salvar como lembretes`);
            
            for (const item of produtosPreLancamento) {
                console.log(`📦 Processando pré-lançamento: ${item.nome}`, item);
                
                const clienteIdParaLembrete = comandaData.clienteId || agendamento.clienteId;
                
                if (!clienteIdParaLembrete) {
                    console.error(`❌ Não é possível salvar pré-lançamento - Cliente ID não encontrado para: ${item.nome}`);
                    continue;
                }
                
                const lembretesExistentesQuery = query(
                    collection(db, "lembretes_comanda"),
                    where("clienteId", "==", clienteIdParaLembrete),
                    where("produtoId", "==", item.produtoId),
                    where("status", "==", "pendente")
                );
                const lembretesExistentes = await getDocs(lembretesExistentesQuery);
                
                if (lembretesExistentes.empty) {
                    const lembreteData = {
                        comandaOrigemId: comandaId,
                        clienteId: clienteIdParaLembrete,
                        produtoId: item.produtoId,
                        produtoNome: item.nome,
                        preco: item.preco || 0,
                        quantidade: item.quantidade || 1,
                        observacao: item.observacaoPreLancamento || `Pré-lançamento adicionado em ${new Date().toLocaleDateString('pt-BR')}`,
                        status: "pendente",
                        dataCriacao: Timestamp.now()
                    };
                    
                    const lembreteRef = await addDoc(collection(db, "lembretes_comanda"), lembreteData);
                    console.log(`✅ PRÉ-LANÇAMENTO SALVO! ID: ${lembreteRef.id} - Produto: ${item.nome} - Cliente: ${clienteIdParaLembrete}`);
                } else {
                    console.log(`⏭️ Pré-lançamento já existe: ${item.nome}`);
                }
            }
            
            await updateDoc(doc(db, "comandas", comandaId), {
                status: "finalizada",
                dataFinalizacao: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
            console.log(`✅ Comanda ${comandaId} atualizada para status "finalizada"`);
        } else {
            console.log("⚠️ Nenhuma comanda encontrada para este agendamento");
        }
        
        await updateDoc(doc(db, "agendamentos", id), {
            status: "concluido",
            dataConclusao: Timestamp.now(),
            atualizadoEm: Timestamp.now()
        });
        
        if (agendamento.clienteId || agendamento.cliente) {
            let clienteId = agendamento.clienteId;
            let clienteNome = agendamento.cliente || agendamento.nome;
            
            if (!clienteId && clienteNome) {
                const clientesQuery = query(collection(db, "clientes"), where("nome", "==", clienteNome));
                const clientesSnap = await getDocs(clientesQuery);
                if (!clientesSnap.empty) {
                    clienteId = clientesSnap.docs[0].id;
                }
            }
            
            if (clienteId) {
                const { valorTotal } = extrairItensDoAgendamento(agendamento);
                if (valorTotal > 0) {
                    await adicionarPontosFidelidade(clienteId, clienteNome, valorTotal, "servico");
                }
            }
        }
        
        const nomeCliente = agendamento.cliente || agendamento.nome || 'Cliente';
        const profissionalNome = agendamento.profissional || 'Barbeiro';
        
        let servicoNome = 'Atendimento';
        if (agendamento.servicos && Array.isArray(agendamento.servicos) && agendamento.servicos.length > 0) {
            servicoNome = agendamento.servicos[0].nome || agendamento.servicos[0].servicoNome || 'Atendimento';
        } else if (agendamento.servico) {
            servicoNome = agendamento.servico;
        } else if (agendamento.servicoNome) {
            servicoNome = agendamento.servicoNome;
        }
        
        try {
            const avaliacoesRef = collection(db, "avaliacoes");
            const existingQuery = query(avaliacoesRef, where("agendamentoId", "==", id));
            const existingSnapshot = await getDocs(existingQuery);
            
            if (existingSnapshot.empty) {
                const novaAvaliacao = {
                    agendamentoId: id,
                    clienteNome: nomeCliente,
                    servicoNome: servicoNome,
                    profissionalId: agendamento.profissionalId || null,
                    profissionalNome: profissionalNome,
                    nota: 0,
                    comentario: '',
                    status: "pendente",
                    dataCriacao: Timestamp.now()
                };
                await addDoc(avaliacoesRef, novaAvaliacao);
                console.log("✅ Nova avaliação criada!");
            }
        } catch (error) {
            console.error("❌ Erro ao criar avaliação:", error);
        }
        
        const baseUrl = "https://studionogueira.vercel.app";
        const clienteEncoded = encodeURIComponent(nomeCliente);
        const servicoEncoded = encodeURIComponent(servicoNome);
        const avaliacaoUrl = `${baseUrl}/avaliacao.html?agendamentoId=${id}&cliente=${clienteEncoded}&servico=${servicoEncoded}`;
        
        console.log("🔗 Link de avaliação gerado:", avaliacaoUrl);
        
        let telefone = agendamento.telefone ||
            agendamento.whatsapp ||
            agendamento.celular ||
            agendamento.contato ||
            (agendamento.clienteId ? await buscarTelefoneCliente(agendamento.clienteId) : null);
        
        if (!telefone && (agendamento.cliente || agendamento.nome)) {
            telefone = await buscarTelefonePorNome(agendamento.cliente || agendamento.nome);
        }
        
        const { valorTotal } = extrairItensDoAgendamento(agendamento);
        
        if (telefone) {
            const telefoneLimpo = telefone.toString().replace(/\D/g, "");
            if (telefoneLimpo.length >= 10 && telefoneLimpo.length <= 11) {
                const mensagem = `*🏢 STUDIO NOGUEIRA* - *ATENDIMENTO REALIZADO!* ✅\n\nOlá, *${nomeCliente}*!\n\nSeu atendimento foi *REALIZADO COM SUCESSO*! ✂️💈\n\n👨‍🦱 *Barbeiro:* ${profissionalNome}\n✂️ *Serviço:* ${servicoNome}\n💰 *Valor:* ${formatarMoeda(valorTotal)}\n\n⭐ *AVALIE NOSSO ATENDIMENTO!* ⭐\nSua opinião é muito importante para nós!\n🔗 ${avaliacaoUrl}\n\n💝 *Programa Fidelidade:* Acumule pontos e ganhe recompensas!\n\n*Studio Nogueira* - Mais de 10 anos transformando estilos. ✂️💈`;
                
                window.open(`https://wa.me/55${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`, '_blank');
                mostrarToast(`🎉 Atendimento concluído! Link de avaliação enviado para o cliente.`, "sucesso");
            } else {
                mostrarToast(`🎉 Atendimento concluído! Link: ${avaliacaoUrl}`, "sucesso");
            }
        } else {
            mostrarToast(`🎉 Atendimento concluído! Link de avaliação: ${avaliacaoUrl}`, "sucesso");
        }
        
        if (comandaId) {
            window.dispatchEvent(new CustomEvent('pagamentoAtualizado', { 
                detail: { 
                    comandaId: comandaId, 
                    action: 'agendamento_concluido',
                    timestamp: Date.now(),
                    source: 'agenda.js'
                }
            }));
        }
        
        setTimeout(() => aplicarFiltro(), 1000);
        console.log("🔵 ========== CONCLUSÃO DO AGENDAMENTO FINALIZADA ==========");
        
    } catch (error) {
        console.error("❌ Erro ao concluir agendamento:", error);
        mostrarToast("Erro ao concluir agendamento: " + error.message, "erro");
    }
}

// ==================== CRIAR LINHA DA TABELA (SEM BOTÕES AUSENTE E CANCELAR) ====================

function criarLinhaAgendamento(agendamento) {
    const tr = document.createElement('tr');
    tr.className = 'appointment-row';
    tr.setAttribute('data-id', agendamento.id);
    tr.setAttribute('data-status', agendamento.status || '');

    const dataFormatada = formatarData(agendamento.data);
    const diaSemana = obterDiaSemana(agendamento.data);
    const horario = agendamento.horario || '--:00';
    const cliente = agendamento.cliente || agendamento.nome || 'Cliente';
    const telefone = agendamento.telefone || agendamento.whatsapp || '';
    const profissional = agendamento.profissional || 'Barbeiro';
    const profissionalInicial = profissional.charAt(0).toUpperCase();

    const { itens, valorTotal } = extrairItensDoAgendamento(agendamento);
    const temPacote = itens.some(i => i.ehPacote);
    const totalEconomia = itens.reduce((sum, i) => sum + (i.descontoValor || 0), 0);

    let servicosHtml = '';
    let servicosDetalheHtml = '';

    if (itens.length > 0) {
        const servicosPrincipais = itens.slice(0, 2);
        const servicosRestantes = itens.length - 2;
        
        servicosHtml = `
            <div class="servicos-list">
                ${servicosPrincipais.map(item => {
                    if (item.ehPacote) {
                        return `<span class="pacote-tag"><i class="fa-solid fa-gift"></i> ${escapeHtml(item.nome)}</span>`;
                    }
                    return `<span class="servico-tag"><i class="fa-solid fa-cut"></i> ${escapeHtml(item.nome)}</span>`;
                }).join('')}
                ${servicosRestantes > 0 ? `<span class="servico-tag">+${servicosRestantes} outro(s)</span>` : ''}
            </div>
        `;
        
        if (itens.length > 2 || temPacote) {
            servicosDetalheHtml = `
                <div class="servicos-detalhe">
                    ${itens.map(item => {
                        if (item.ehPacote) {
                            const qtdServicos = item.servicos?.length || 0;
                            return `<span><i class="fa-solid fa-box"></i> ${escapeHtml(item.nome)} (${qtdServicos} serviços)</span>`;
                        }
                        return `<span><i class="fa-solid fa-cut"></i> ${escapeHtml(item.nome)}</span>`;
                    }).join(' · ')}
                </div>
            `;
        }
    } else {
        servicosHtml = '<span class="servico-tag">Atendimento</span>';
    }

    let valorHtml = '';
    if (temPacote && totalEconomia > 0) {
        valorHtml = `
            <div class="valor-info">
                <span class="valor-total">${formatarMoeda(valorTotal)}</span>
                <span class="valor-desconto"><i class="fa-solid fa-tag"></i> Economia: ${formatarMoeda(totalEconomia)}</span>
                ${itens.some(i => i.precoOriginal > i.precoFinal) ? 
                    `<span class="valor-original">De: ${formatarMoeda(itens.reduce((s,i) => s + i.precoOriginal, 0))}</span>` : ''}
            </div>
        `;
    } else {
        valorHtml = `<div class="valor-info"><span class="valor-total">${formatarMoeda(valorTotal)}</span></div>`;
    }

    // ===== BOTÕES DE AÇÃO - APENAS CONCLUIR, LEMBRETES E VER COMANDA =====
    let botoesAcao = '';
    if (agendamento.status === 'confirmado') {
        botoesAcao = `
            <div class="appointment-actions">
                <button class="btn-status concluir" data-id="${agendamento.id}" title="Concluir atendimento">
                    <i class="fa-regular fa-circle-check"></i> Concluir
                </button>
                <button class="btn-status lembrete-dia" data-id="${agendamento.id}" data-tipo="dia" title="Enviar lembrete do dia">
                    <i class="fa-regular fa-bell"></i> Hoje
                </button>
                <button class="btn-status lembrete-vespera" data-id="${agendamento.id}" data-tipo="vespera" title="Enviar lembrete de véspera">
                    <i class="fa-regular fa-clock"></i> Véspera
                </button>
                <button class="btn-status ver-comanda" data-id="${agendamento.id}" title="Abrir comanda">
                    <i class="fa-solid fa-receipt"></i> Comanda
                </button>
            </div>
        `;
    } else {
        botoesAcao = `
            <div class="appointment-actions">
                <button class="btn-status ver-comanda" data-id="${agendamento.id}" title="Ver comanda">
                    <i class="fa-solid fa-receipt"></i> Ver Comanda
                </button>
            </div>
        `;
    }

    tr.innerHTML = `
        <td class="col-cliente">
            <div class="cliente-info">
                <span class="cliente-nome">${escapeHtml(cliente)}</span>
                ${telefone ? `<span class="cliente-telefone"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(telefone)}</span>` : ''}
            </div>
        </td>
        <td class="col-data-hora">
            <div class="data-info">
                <span class="data">${dataFormatada}</span>
                ${diaSemana ? `<span class="dia-semana"><i class="fa-regular fa-calendar-alt"></i> ${diaSemana}</span>` : ''}
                <span class="hora"><i class="fa-regular fa-clock"></i> ${escapeHtml(horario)}</span>
            </div>
        </td>
        <td class="col-profissional">
            <div class="profissional-info">
                <div class="profissional-avatar">${escapeHtml(profissionalInicial)}</div>
                <span class="profissional-nome">${escapeHtml(profissional)}</span>
            </div>
        </td>
        <td class="col-servicos">
            ${servicosHtml}
            ${servicosDetalheHtml}
        </td>
        <td class="col-valor">
            ${valorHtml}
        </td>
        <td class="col-acoes">
            ${botoesAcao}
        </td>
    `;

    // Event Listeners
    tr.querySelector('.concluir')?.addEventListener('click', (e) => {
        e.stopPropagation();
        concluirAgendamento(agendamento.id, agendamento);
    });
    tr.querySelector('.lembrete-dia')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const resultado = await enviarLembreteWhatsApp(agendamento, 'dia');
        if (resultado.sucesso) {
            mostrarToast(resultado.mensagem, 'sucesso');
        } else {
            mostrarToast(`Erro: ${resultado.motivo}`, 'erro');
        }
    });
    tr.querySelector('.lembrete-vespera')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const resultado = await enviarLembreteWhatsApp(agendamento, 'vespera');
        if (resultado.sucesso) {
            mostrarToast(resultado.mensagem, 'sucesso');
        } else {
            mostrarToast(`Erro: ${resultado.motivo}`, 'erro');
        }
    });
    tr.querySelector('.ver-comanda')?.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirComandaDoAgendamento(agendamento.id);
    });

    return tr;
}

// ==================== FUNÇÕES AUXILIARES ====================

function isDataNoPeriodo(dataAgendamento, inicio, fim) {
    if (!dataAgendamento) return false;
    
    let dataStr;
    if (typeof dataAgendamento === 'string') {
        dataStr = dataAgendamento;
    } else if (dataAgendamento.toDate) {
        dataStr = dataAgendamento.toDate().toISOString().split('T')[0];
    } else {
        return false;
    }
    
    if (dataStr.includes('/')) {
        const [dia, mes, ano] = dataStr.split('/');
        dataStr = `${ano}-${mes}-${dia}`;
    }
    
    return dataStr >= inicio && dataStr <= fim;
}

// ==================== FUNÇÃO PARA APLICAR FILTRO (VERSÃO TABELA) ====================

function aplicarFiltro() {
    if (unsubscribe) unsubscribe();

    let dInicio = dataInicio ? dataInicio.value : '';
    let dFim = dataFim ? dataFim.value : '';

    const filtroPersonalizado = (dInicio && dInicio !== '') || (dFim && dFim !== '');
    
    if (!filtroPersonalizado) {
        const dataAtual = getDataAtual();
        dInicio = dataAtual;
        dFim = dataAtual;
        console.log(`📅 Exibindo apenas agendamentos do dia atual: ${dataAtual}`);
    } else {
        if (dInicio && !dFim) dFim = dInicio;
        if (!dInicio && dFim) dInicio = dFim;
        console.log(`📅 Aplicando filtro personalizado: ${dInicio} até ${dFim}`);
    }

    const q = query(collection(db, "agendamentos"));

    unsubscribe = onSnapshot(q, (snapshot) => {
        const containers = {
            confirmado: { div: confirmadosDiv, rows: [], count: 0 },
            concluido: { div: concluidosDiv, rows: [], count: 0 },
            ausente: { div: ausentesDiv, rows: [], count: 0 },
            cancelado: { div: canceladosDiv, rows: [], count: 0 }
        };

        const agendamentosList = [];

        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data() };
            const dataAgendamento = data.data;
            
            let dataValida = false;
            if (dInicio && dFim && dataAgendamento) {
                dataValida = isDataNoPeriodo(dataAgendamento, dInicio, dFim);
            }

            if (dataValida) {
                agendamentosList.push(data);
            }
        });

        agendamentosList.sort((a, b) => {
            const dateA = a.data ? (typeof a.data === 'string' ? a.data : (a.data.toDate ? a.data.toDate().toISOString().split('T')[0] : '')) : '';
            const dateB = b.data ? (typeof b.data === 'string' ? b.data : (b.data.toDate ? b.data.toDate().toISOString().split('T')[0] : '')) : '';
            if (dateA !== dateB) {
                return dateA.localeCompare(dateB);
            }
            const horarioA = a.horario || '00:00';
            const horarioB = b.horario || '00:00';
            return horarioA.localeCompare(horarioB);
        });

        console.log(`📊 Agendamentos carregados - Total no período: ${agendamentosList.length}`);

        for (const [statusKey, container] of Object.entries(containers)) {
            if (container.div) {
                const table = document.createElement('table');
                table.className = 'appointments-table';
                
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th class="col-cliente">Cliente</th>
                            <th class="col-data-hora">Data/Horário</th>
                            <th class="col-profissional">Profissional</th>
                            <th class="col-servicos">Serviços</th>
                            <th class="col-valor">Valor</th>
                            <th class="col-acoes">Ações</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                
                const tbody = table.querySelector('tbody');
                
                for (const data of agendamentosList) {
                    let statusMatch = false;
                    
                    if (statusKey === 'confirmado' && (data.status === 'confirmado' || !data.status)) statusMatch = true;
                    else if (statusKey === 'concluido' && data.status === 'concluido') statusMatch = true;
                    else if (statusKey === 'ausente' && data.status === 'ausente') statusMatch = true;
                    else if (statusKey === 'cancelado' && data.status === 'cancelado') statusMatch = true;
                    
                    if (statusMatch) {
                        const row = criarLinhaAgendamento(data);
                        tbody.appendChild(row);
                        container.count++;
                    }
                }
                
                container.div.innerHTML = '';
                if (container.count > 0) {
                    container.div.appendChild(table);
                } else {
                    const emptyMessage = document.createElement('div');
                    emptyMessage.className = 'empty-agenda';
                    let mensagemVazio = '';
                    const dataInicioFormatada = formatarData(dInicio);
                    const dataFimFormatada = formatarData(dFim);
                    if (filtroPersonalizado && dInicio !== dFim) {
                        mensagemVazio = `<i class="fa-regular fa-calendar"></i><p>Nenhum agendamento encontrado no período de ${dataInicioFormatada} até ${dataFimFormatada}</p>`;
                    } else if (filtroPersonalizado) {
                        mensagemVazio = `<i class="fa-regular fa-calendar"></i><p>Nenhum agendamento encontrado para ${dataInicioFormatada}</p>`;
                    } else {
                        mensagemVazio = `<i class="fa-regular fa-calendar"></i><p>Nenhum agendamento para hoje (${dataInicioFormatada})</p>`;
                    }
                    emptyMessage.innerHTML = mensagemVazio;
                    container.div.appendChild(emptyMessage);
                }
            }
        }

        if (countConfirmado) countConfirmado.textContent = containers.confirmado.count;
        if (countConcluido) countConcluido.textContent = containers.concluido.count;
        if (countAusente) countAusente.textContent = containers.ausente.count;
        if (countCancelado) countCancelado.textContent = containers.cancelado.count;
    });
}

// ==================== FUNÇÃO PARA FORÇAR ATUALIZAÇÃO DA AGENDA ====================

window.atualizarAgenda = function () {
    console.log("🔄 Forçando atualização da agenda...");
    aplicarFiltro();
};

// ==================== FUNÇÃO PARA ENVIAR LEMBRETE MANUALMENTE ====================

window.enviarLembreteManual = async function(agendamentoId, tipo = 'dia') {
    try {
        const agendamentoDoc = await getDoc(doc(db, "agendamentos", agendamentoId));
        if (!agendamentoDoc.exists()) {
            return { sucesso: false, motivo: "Agendamento não encontrado" };
        }
        const agendamento = { id: agendamentoId, ...agendamentoDoc.data() };
        return await enviarLembreteWhatsApp(agendamento, tipo);
    } catch (error) {
        console.error("Erro ao enviar lembrete manual:", error);
        return { sucesso: false, motivo: error.message };
    }
};

// ==================== FUNÇÃO PARA MIGRAR PRÉ-LANÇAMENTOS EXISTENTES ====================

window.migrarPreLancamentosExistentes = async function() {
    console.log("🔄 Migrando pré-lançamentos existentes para coleção lembretes_comanda...");
    mostrarToast("Iniciando migração de pré-lançamentos...", "sucesso");
    
    const comandasSnapshot = await getDocs(collection(db, "comandas"));
    let countMigrados = 0;
    let countIgnorados = 0;
    
    for (const comandaDoc of comandasSnapshot.docs) {
        const comanda = comandaDoc.data();
        const produtosPreLancamento = (comanda.produtos || []).filter(p => p.isPreLancamento === true);
        
        if (produtosPreLancamento.length === 0) continue;
        
        console.log(`📦 Comanda ${comandaDoc.id} tem ${produtosPreLancamento.length} pré-lançamentos`);
        
        for (const item of produtosPreLancamento) {
            const lembreteExistente = await getDocs(query(
                collection(db, "lembretes_comanda"),
                where("comandaOrigemId", "==", comandaDoc.id),
                where("produtoId", "==", item.produtoId),
                where("status", "==", "pendente")
            ));
            
            if (lembreteExistente.empty && comanda.clienteId) {
                await addDoc(collection(db, "lembretes_comanda"), {
                    comandaOrigemId: comandaDoc.id,
                    clienteId: comanda.clienteId,
                    produtoId: item.produtoId,
                    produtoNome: item.nome,
                    preco: item.preco,
                    quantidade: item.quantidade || 1,
                    observacao: item.observacaoPreLancamento || "",
                    status: "pendente",
                    dataCriacao: Timestamp.now()
                });
                countMigrados++;
                console.log(`✅ Migrado: ${item.nome} para o cliente ${comanda.clienteId}`);
            } else {
                countIgnorados++;
                console.log(`⏭️ Ignorado: ${item.nome} (já existe ou sem clienteId)`);
            }
        }
    }
    
    console.log(`✅ Migração concluída! ${countMigrados} pré-lançamentos migrados, ${countIgnorados} ignorados.`);
    mostrarToast(`Migração concluída! ${countMigrados} pré-lançamentos migrados.`, "sucesso");
    return { migrados: countMigrados, ignorados: countIgnorados };
};

// ==================== FUNÇÃO PARA VERIFICAR LEMBRETES AUTOMATICAMENTE ====================

let intervaloLembretes = null;

function iniciarVerificacaoLembretes() {
    if (intervaloLembretes) clearInterval(intervaloLembretes);
    
    intervaloLembretes = setInterval(() => {
        verificarLembretesAutomaticos();
    }, 30 * 60 * 1000);
    
    setTimeout(() => {
        verificarLembretesAutomaticos();
    }, 60000);
    
    console.log("🕐 Sistema de verificação de lembretes iniciado (a cada 30 minutos)");
}

function pararVerificacaoLembretes() {
    if (intervaloLembretes) clearInterval(intervaloLembretes);
    console.log("🛑 Sistema de verificação de lembretes parado");
}

// ==================== FUNÇÕES DA LISTA DE ESPERA (SEM ÍNDICES COMPOSTOS) ====================

/**
 * Renderiza a lista de espera na agenda - Versão SEM ÍNDICES COMPOSTOS
 */
function renderizarListaEspera() {
    const container = document.getElementById("listaEsperaContainer");
    if (!container) {
        console.log("⚠️ Container da lista de espera não encontrado");
        return;
    }
    
    // Usar apenas um filtro por vez para evitar necessidade de índices compostos
    const q = query(
        collection(db, "lista_espera"),
        where("status", "==", "pendente")
    );
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        
        const countBadge = document.getElementById("countListaEspera");
        
        // Filtrar e ordenar em memória
        const itens = [];
        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            // Garantir que só mostra pendentes (já filtrado pelo where)
            if (data.status === "pendente") {
                itens.push(data);
            }
        });
        
        // Ordenar por dataEntrada (mais antigo primeiro)
        itens.sort((a, b) => {
            const dateA = a.dataEntrada?.toDate?.() || new Date(0);
            const dateB = b.dataEntrada?.toDate?.() || new Date(0);
            return dateA - dateB;
        });
        
        if (countBadge) countBadge.textContent = itens.length;
        
        if (itens.length === 0) {
            container.innerHTML = `
                <div class="empty-agenda">
                    <i class="fa-regular fa-clock"></i>
                    <p>Nenhum cliente na lista de espera</p>
                </div>
            `;
            return;
        }
        
        const table = document.createElement("table");
        table.className = "appointments-table";
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Cliente</th>
                    <th>Data Desejada</th>
                    <th>Serviços</th>
                    <th>Barbeiro</th>
                    <th>Entrada</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector("tbody");
        
        itens.forEach(item => {
            const tr = document.createElement("tr");
            
            const dataEntrada = item.dataEntrada?.toDate?.() || new Date();
            const dataFormatada = dataEntrada.toLocaleDateString('pt-BR');
            const horaFormatada = dataEntrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            const servicosNomes = item.servicos?.map(s => s.nome).join(', ') || 'Não informado';
            const telefone = item.telefone || '';
            
            let statusBadge = '';
            if (item.status === 'pendente') {
                statusBadge = '<span class="status-badge-pendente">⏳ Pendente</span>';
            } else if (item.status === 'notificado') {
                statusBadge = '<span class="status-badge-notificado">📨 Notificado</span>';
            } else if (item.status === 'removido') {
                statusBadge = '<span class="status-badge-removido">🗑️ Removido</span>';
            } else {
                statusBadge = `<span class="status-badge-pendente">${item.status}</span>`;
            }
            
            tr.innerHTML = `
                <td>
                    <strong>${escapeHtml(item.clienteNome)}</strong>
                    ${telefone ? `<div class="cliente-telefone-lista"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(telefone)}</div>` : ''}
                </td>
                <td>${formatarData(item.dataDesejada)}</td>
                <td style="font-size: 0.8rem;">${escapeHtml(servicosNomes)}</td>
                <td>${escapeHtml(item.profissionalNome)}</td>
                <td><small>${dataFormatada} ${horaFormatada}</small></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="appointment-actions">
                        <button class="btn-notificar" data-id="${item.id}" data-telefone="${telefone}" 
                                data-nome="${item.clienteNome}" data-data="${item.dataDesejada}"
                                data-profissional="${item.profissionalNome}">
                            <i class="fa-brands fa-whatsapp"></i> Notificar
                        </button>
                        <button class="btn-remover-lista" data-id="${item.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            
            // Evento Notificar
            tr.querySelector(".btn-notificar")?.addEventListener("click", async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const id = btn.dataset.id;
                const telefone = btn.dataset.telefone;
                const nome = btn.dataset.nome;
                const data = btn.dataset.data;
                const profissional = btn.dataset.profissional;
                
                if (!telefone) {
                    mostrarToast("❌ Telefone não cadastrado para este cliente", "erro");
                    return;
                }
                
                const telefoneLimpo = limparTelefone(telefone);
                if (!telefoneLimpo) {
                    mostrarToast("❌ Telefone inválido", "erro");
                    return;
                }
                
                const mensagem = `🏢 STUDIO NOGUEIRA\n\nOlá, *${nome}*! 🎉\n\nUma vaga foi liberada para *${formatarData(data)}* com o barbeiro *${profissional}*!\n\n🔗 Agende agora: https://studionogueira.vercel.app/agendamento.html\n\n⏱️ Você tem 15 minutos para confirmar a vaga.\n\n*Studio Nogueira* - Mais de 10 anos transformando estilos. ✂️💈`;
                
                window.open(`https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`, '_blank');
                
                try {
                    await updateDoc(doc(db, "lista_espera", id), {
                        status: "notificado",
                        dataNotificacao: Timestamp.now(),
                        tentativasNotificacao: (item.tentativasNotificacao || 0) + 1,
                        updatedAt: Timestamp.now()
                    });
                    
                    mostrarToast(`✅ Cliente ${nome} notificado!`, "sucesso");
                } catch (error) {
                    console.error("Erro ao atualizar status:", error);
                    mostrarToast("Cliente notificado, mas erro ao atualizar status", "erro");
                }
            });
            
            // Evento Remover
            tr.querySelector(".btn-remover-lista")?.addEventListener("click", async (e) => {
                e.stopPropagation();
                const id = e.currentTarget.dataset.id;
                if (confirm("Deseja remover este cliente da lista de espera?")) {
                    try {
                        await updateDoc(doc(db, "lista_espera", id), {
                            status: "removido",
                            updatedAt: Timestamp.now()
                        });
                        mostrarToast("✅ Cliente removido da lista de espera", "sucesso");
                    } catch (error) {
                        console.error("Erro ao remover:", error);
                        mostrarToast("❌ Erro ao remover cliente", "erro");
                    }
                }
            });
            
            tbody.appendChild(tr);
        });
        
        container.appendChild(table);
    }, (error) => {
        console.error("Erro ao carregar lista de espera:", error);
        container.innerHTML = `
            <div class="error-agenda">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>Erro ao carregar lista de espera: ${error.message}</p>
                <p style="font-size: 0.8rem; margin-top: 8px; color: #f59e0b;">
                    <i class="fa-solid fa-lightbulb"></i>
                    Crie o índice necessário clicando no link abaixo:
                </p>
                <a href="https://console.firebase.google.com/v1/r/project/studio-nogueira-e07bb/firestore/indexes?create_composite=Clhwcm9qZWN0cy9zdHVkaW8tbm9ndWVpcmEtZTA3YmIvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL2xpc3RhX2VzcGVyYS9pbmRleGVzL18QARoKCgZzdGF0dXMQA RoPCgtkYXRhRW50cmFkYREBGgwKCF9fbmFtZV9fEAE" 
                   target="_blank" style="color: #2199EF; text-decoration: underline;">
                    🔗 Criar índice para lista_espera
                </a>
            </div>
        `;
    });
}

/**
 * Inicia o detector de horários liberados para notificar a lista de espera
 * Versão SEM ÍNDICES COMPOSTOS
 */
function iniciarDetectorHorariosLiberados() {
    console.log("🔍 Iniciando detector de horários liberados para lista de espera...");
    
    const q = query(collection(db, "agendamentos"));
    
    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type === "modified") {
                const newData = change.doc.data();
                
                // Verificar se o status mudou para cancelado ou ausente
                const statusNovo = newData.status;
                
                if (statusNovo === "cancelado" || statusNovo === "ausente") {
                    console.log(`🔓 Horário liberado: ${newData.data} às ${newData.horario} - ${newData.profissional}`);
                    
                    // Buscar TODOS os pendentes e filtrar em memória
                    try {
                        const listaQuery = query(
                            collection(db, "lista_espera"),
                            where("status", "==", "pendente")
                        );
                        
                        const listaSnap = await getDocs(listaQuery);
                        
                        // Filtrar em memória por data e profissional
                        const candidatos = [];
                        listaSnap.forEach(doc => {
                            const dados = { id: doc.id, ...doc.data() };
                            if (dados.dataDesejada === newData.data && 
                                dados.profissionalId === newData.profissionalId) {
                                candidatos.push(dados);
                            }
                        });
                        
                        // Ordenar por dataEntrada
                        candidatos.sort((a, b) => {
                            const dateA = a.dataEntrada?.toDate?.() || new Date(0);
                            const dateB = b.dataEntrada?.toDate?.() || new Date(0);
                            return dateA - dateB;
                        });
                        
                        if (candidatos.length > 0) {
                            const primeiro = candidatos[0];
                            
                            console.log(`📨 Notificando ${primeiro.clienteNome} sobre vaga disponível`);
                            
                            const telefoneLimpo = limparTelefone(primeiro.telefone);
                            if (telefoneLimpo) {
                                const mensagem = `🏢 STUDIO NOGUEIRA\n\nOlá, *${primeiro.clienteNome}*! 🎉\n\nUma vaga foi liberada para *${formatarData(newData.data)}* às *${newData.horario}* com o barbeiro *${newData.profissional}*!\n\n🔗 Agende agora: https://studionogueira.vercel.app/agendamento.html?profissionalId=${newData.profissionalId}&data=${newData.data}\n\n⏱️ Você tem 15 minutos para confirmar a vaga.\n\n*Studio Nogueira* - Mais de 10 anos transformando estilos. ✂️💈`;
                                
                                window.open(`https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`, '_blank');
                                
                                await updateDoc(doc(db, "lista_espera", primeiro.id), {
                                    status: "notificado",
                                    dataNotificacao: Timestamp.now(),
                                    tentativasNotificacao: (primeiro.tentativasNotificacao || 0) + 1,
                                    updatedAt: Timestamp.now()
                                });
                                
                                await addDoc(collection(db, "historico_notificacoes_lista"), {
                                    listaId: primeiro.id,
                                    clienteId: primeiro.clienteId,
                                    clienteNome: primeiro.clienteNome,
                                    dataAgendamento: newData.data,
                                    horarioAgendamento: newData.horario,
                                    profissionalId: newData.profissionalId,
                                    profissionalNome: newData.profissional,
                                    dataNotificacao: Timestamp.now(),
                                    metodo: "whatsapp",
                                    status: "enviado"
                                });
                                
                                mostrarToast(`📨 ${primeiro.clienteNome} foi notificado sobre a vaga!`, "sucesso");
                            }
                        }
                    } catch (error) {
                        console.error("Erro ao processar lista de espera:", error);
                    }
                }
            }
        }
    }, (error) => {
        console.error("Erro no detector de horários liberados:", error);
    });
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log("📅 Agenda.js iniciado - Versão com LEMBRETES WHATSAPP, LAYOUT HORIZONTAL E DIA DA SEMANA CORRIGIDO");
    console.log("ℹ️ Botões 'Ausente' e 'Cancelar' removidos - gestão apenas na comanda");
    console.log("⏳ LISTA DE ESPERA integrada - SEM ÍNDICES COMPOSTOS!");
    
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
    aplicarFiltro();
    iniciarListenerComandas();
    iniciarVerificacaoLembretes();
    
    // Iniciar listener da lista de espera
    renderizarListaEspera();
    
    // Iniciar detector de horários liberados
    iniciarDetectorHorariosLiberados();
});

if (btnFiltrarPeriodo) btnFiltrarPeriodo.onclick = () => aplicarFiltro();
if (btnLimparPeriodo) btnLimparPeriodo.onclick = () => {
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    aplicarFiltro();
};

if (btnSincronizarComandas) {
    btnSincronizarComandas.onclick = async () => {
        mostrarToast("Sincronizando comandas com pré-lançamentos...", "sucesso");
        const agendamentosQuery = query(collection(db, "agendamentos"), where("status", "==", "confirmado"));
        const snapshot = await getDocs(agendamentosQuery);
        let count = 0;
        for (const doc of snapshot.docs) {
            const agendamento = { id: doc.id, ...doc.data() };
            const comandaId = await criarComandaDoAgendamento(agendamento);
            if (comandaId) count++;
        }
        mostrarToast(`Sincronização concluída! ${count} comandas criadas.`, "sucesso");
    };
}

onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = 'login.html';
    else console.log("👤 Usuário autenticado:", user.email);
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) logoutBtn.onclick = async () => { await signOut(auth); window.location.href = 'login.html'; };

console.log("✅ Agenda.js carregado - Layout horizontal em tabela com dia da semana corrigido!");
console.log("✅ Lista de Espera integrada com notificação automática - SEM ÍNDICES COMPOSTOS!");