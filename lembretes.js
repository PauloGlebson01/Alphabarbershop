// lembretes.js - Sistema de lembretes automáticos para agendamentos
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

// Função para buscar telefone do cliente
async function buscarTelefoneCliente(clienteId, clienteNome) {
    if (clienteId) {
        try {
            const clienteDoc = await getDoc(doc(db, "clientes", clienteId));
            if (clienteDoc.exists()) {
                const dados = clienteDoc.data();
                return dados.telefone || dados.whatsapp || dados.celular || null;
            }
        } catch (error) {
            console.error("Erro ao buscar telefone do cliente:", error);
        }
    }
    
    // Buscar por nome se não tiver ID
    if (clienteNome) {
        try {
            const clientesQuery = query(collection(db, "clientes"), where("nome", "==", clienteNome));
            const clientesSnap = await getDocs(clientesQuery);
            if (!clientesSnap.empty) {
                const dados = clientesSnap.docs[0].data();
                return dados.telefone || dados.whatsapp || dados.celular || null;
            }
        } catch (error) {
            console.error("Erro ao buscar telefone por nome:", error);
        }
    }
    return null;
}

// Função para formatar data (dd/mm/yyyy)
function formatarData(dataStr) {
    if (!dataStr) return 'Data não informada';
    if (dataStr.toDate) {
        const date = dataStr.toDate();
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }
    if (typeof dataStr === 'string' && dataStr.includes('-')) {
        const [ano, mes, dia] = dataStr.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    return dataStr;
}

// Função para formatar horário
function formatarHorario(horario) {
    return horario || '--:00';
}

// Função para formatar moeda
function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

// Função para limpar telefone
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

// ==================== MENSAGENS DE LEMBRETE ====================

// Mensagem de lembrete para véspera (24h antes)
function gerarMensagemVespera(nomeCliente, data, horario, profissional, servicos, valorTotal) {
    const servicosTexto = servicos && servicos.length > 0 
        ? servicos.map(s => `✂️ ${s.nome || s}`).join('\n')
        : 'Atendimento na barbearia';
    
    return `*🏢 ALPHA BARBERSHOP* - *LEMBRETE DE AGENDAMENTO* ⏰

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
Entre em contato conosco:
(83) 9 9653-3486

*Alpha BarberShop* - Mais que corte. Ritual do Reflexo! ✂️💈

_Esta é uma mensagem automática. Por favor, não responda._`;
}

// Mensagem de lembrete para o dia do agendamento (manhã)
function gerarMensagemDia(nomeCliente, data, horario, profissional, servicos, valorTotal) {
    const servicosTexto = servicos && servicos.length > 0 
        ? servicos.map(s => `✂️ ${s.nome || s}`).join('\n')
        : 'Atendimento na barbearia';
    
    return `*🏢 ALPHA BARBERSHOP* - *LEMBRETE DO DIA!* 🔔

Olá, *${nomeCliente}*! ✂️💈

Seu agendamento é HOJE! Não se esqueça:

📅 *Data:* ${data}
⏰ *Horário:* ${horario}
👨‍🦱 *Barbeiro:* ${profissional}

📋 *Serviços agendados:*
${servicosTexto}

💰 *Valor total:* ${formatarMoeda(valorTotal)}

✨ *Preparado para transformar seu visual?*
Estamos te aguardando!

📍 *Endereço:* Av. Presidente Epitácio Pessoa 5102, João Pessoa - PB

*Alpha BarberShop* - Mais que corte. Ritual do Reflexo! ✂️💈

_Esta é uma mensagem automática. Por favor, não responda._`;
}

// Mensagem de confirmação de lembrete enviado
function gerarMensagemConfirmacao(nomeCliente, data, horario, profissional) {
    return `*🏢 ALPHA BARBERSHOP* - *CONFIRMAÇÃO DE LEMBRETE* ✅

Olá, *${nomeCliente}*!

Enviamos um lembrete sobre seu agendamento:

📅 *Data:* ${data}
⏰ *Horário:* ${horario}
👨‍🦱 *Barbeiro:* ${profissional}

📱 *Você receberá uma mensagem de lembrete.*

*Alpha BarberShop* - Mais que corte. Ritual do Reflexo! ✂️💈`;
}

// ==================== FUNÇÃO PRINCIPAL PARA ENVIAR LEMBRETE ====================

async function enviarLembrete(agendamento, tipo = 'dia') {
    try {
        console.log(`📨 Enviando lembrete ${tipo} para agendamento:`, agendamento.id);
        
        // Buscar telefone do cliente
        let telefone = agendamento.telefone || 
                       agendamento.whatsapp || 
                       agendamento.celular ||
                       agendamento.contato;
        
        if (!telefone && (agendamento.clienteId || agendamento.cliente)) {
            telefone = await buscarTelefoneCliente(agendamento.clienteId, agendamento.cliente);
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
        
        // Preparar dados para mensagem
        const nomeCliente = agendamento.cliente || agendamento.nome || agendamento.clienteNome || 'Cliente';
        const data = formatarData(agendamento.data);
        const horario = formatarHorario(agendamento.horario);
        const profissional = agendamento.profissional || agendamento.barbeiroNome || 'Barbeiro Alpha BarberShop';
        
        // Extrair serviços
        let servicos = [];
        let valorTotal = agendamento.valor || agendamento.valorTotal || 0;
        
        if (agendamento.servicos && Array.isArray(agendamento.servicos)) {
            servicos = agendamento.servicos.map(s => ({ nome: s.nome || s.servicoNome }));
        } else if (agendamento.servico) {
            servicos = [{ nome: agendamento.servico }];
        } else if (agendamento.servicoNome) {
            servicos = [{ nome: agendamento.servicoNome }];
        }
        
        // Gerar mensagem conforme o tipo
        let mensagem = '';
        if (tipo === 'vespera') {
            mensagem = gerarMensagemVespera(nomeCliente, data, horario, profissional, servicos, valorTotal);
        } else if (tipo === 'confirmacao') {
            mensagem = gerarMensagemConfirmacao(nomeCliente, data, horario, profissional);
        } else {
            mensagem = gerarMensagemDia(nomeCliente, data, horario, profissional, servicos, valorTotal);
        }
        
        // Abrir WhatsApp
        const url = `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, '_blank');
        
        // Registrar envio do lembrete no banco
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
        
        // Atualizar agendamento com flag de lembrete enviado
        const agendamentoRef = doc(db, "agendamentos", agendamento.id);
        const campoAtualizar = tipo === 'vespera' ? 'lembreteVesperaEnviado' : 'lembreteDiaEnviado';
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

// ==================== VERIFICAR AGENDAMENTOS DO DIA SEGUINTE ====================

function getDataAmanha() {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const ano = amanha.getFullYear();
    const mes = String(amanha.getMonth() + 1).padStart(2, '0');
    const dia = String(amanha.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function getDataHoje() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

async function verificarELembrarVespera() {
    const dataAmanha = getDataAmanha();
    console.log(`🔍 Verificando agendamentos para amanhã (${dataAmanha})...`);
    
    try {
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(
            agendamentosRef,
            where("data", "==", dataAmanha),
            where("status", "in", ["confirmado", "aguardando_pagamento"])
        );
        
        const snapshot = await getDocs(q);
        console.log(`📊 Encontrados ${snapshot.size} agendamentos para amanhã`);
        
        let enviados = 0;
        let erros = 0;
        
        for (const doc of snapshot.docs) {
            const agendamento = { id: doc.id, ...doc.data() };
            
            // Verificar se já enviou lembrete de véspera
            if (!agendamento.lembreteVesperaEnviado) {
                console.log(`📨 Enviando lembrete de véspera para: ${agendamento.cliente || agendamento.nome}`);
                const resultado = await enviarLembrete(agendamento, 'vespera');
                if (resultado.sucesso) {
                    enviados++;
                } else {
                    erros++;
                }
                // Aguardar 2 segundos entre envios para não sobrecarregar
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`✅ Lembretes de véspera enviados: ${enviados}, erros: ${erros}`);
        return { enviados, erros };
        
    } catch (error) {
        console.error("❌ Erro ao verificar lembretes de véspera:", error);
        return { enviados: 0, erros: 0, erro: error.message };
    }
}

async function verificarELembrarDia() {
    const dataHoje = getDataHoje();
    console.log(`🔍 Verificando agendamentos para hoje (${dataHoje})...`);
    
    try {
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(
            agendamentosRef,
            where("data", "==", dataHoje),
            where("status", "in", ["confirmado", "aguardando_pagamento"])
        );
        
        const snapshot = await getDocs(q);
        console.log(`📊 Encontrados ${snapshot.size} agendamentos para hoje`);
        
        let enviados = 0;
        let erros = 0;
        
        for (const doc of snapshot.docs) {
            const agendamento = { id: doc.id, ...doc.data() };
            
            // Verificar se já enviou lembrete do dia
            if (!agendamento.lembreteDiaEnviado) {
                console.log(`📨 Enviando lembrete do dia para: ${agendamento.cliente || agendamento.nome}`);
                const resultado = await enviarLembrete(agendamento, 'dia');
                if (resultado.sucesso) {
                    enviados++;
                } else {
                    erros++;
                }
                // Aguardar 2 segundos entre envios
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`✅ Lembretes do dia enviados: ${enviados}, erros: ${erros}`);
        return { enviados, erros };
        
    } catch (error) {
        console.error("❌ Erro ao verificar lembretes do dia:", error);
        return { enviados: 0, erros: 0, erro: error.message };
    }
}

// ==================== AGENDAR LEMBRETES AUTOMÁTICOS ====================

let intervaloVespera = null;
let intervaloDia = null;

function iniciarLembretesAutomaticos() {
    // Parar intervalos existentes
    if (intervaloVespera) clearInterval(intervaloVespera);
    if (intervaloDia) clearInterval(intervaloDia);
    
    // Executar verificação a cada hora
    intervaloVespera = setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours();
        // Verificar lembretes de véspera entre 20h e 23h (8pm - 11pm)
        if (hora >= 20 && hora <= 23) {
            verificarELembrarVespera();
        }
    }, 60 * 60 * 1000); // A cada hora
    
    intervaloDia = setInterval(() => {
        const agora = new Date();
        const hora = agora.getHours();
        // Verificar lembretes do dia entre 8h e 11h (8am - 11am)
        if (hora >= 8 && hora <= 11) {
            verificarELembrarDia();
        }
    }, 60 * 60 * 1000); // A cada hora
    
    // Executar uma verificação inicial
    setTimeout(() => {
        verificarELembrarVespera();
        verificarELembrarDia();
    }, 5000);
    
    console.log("🕐 Sistema de lembretes automáticos iniciado!");
}

function pararLembretesAutomaticos() {
    if (intervaloVespera) clearInterval(intervaloVespera);
    if (intervaloDia) clearInterval(intervaloDia);
    console.log("🛑 Sistema de lembretes automáticos parado!");
}

// ==================== FUNÇÕES PARA USO NO AGENDA.JS ====================

// Função para enviar lembrete manualmente da agenda
window.enviarLembreteAgendamento = async function(agendamentoId, tipo = 'dia') {
    try {
        const agendamentoDoc = await getDoc(doc(db, "agendamentos", agendamentoId));
        if (!agendamentoDoc.exists()) {
            return { sucesso: false, motivo: "Agendamento não encontrado" };
        }
        
        const agendamento = { id: agendamentoId, ...agendamentoDoc.data() };
        return await enviarLembrete(agendamento, tipo);
        
    } catch (error) {
        console.error("Erro ao enviar lembrete manual:", error);
        return { sucesso: false, motivo: error.message };
    }
};

// Função para enviar lembrete de confirmação após agendamento
window.enviarLembreteConfirmacao = async function(agendamentoId) {
    try {
        const agendamentoDoc = await getDoc(doc(db, "agendamentos", agendamentoId));
        if (!agendamentoDoc.exists()) {
            return { sucesso: false, motivo: "Agendamento não encontrado" };
        }
        
        const agendamento = { id: agendamentoId, ...agendamentoDoc.data() };
        return await enviarLembrete(agendamento, 'confirmacao');
        
    } catch (error) {
        console.error("Erro ao enviar confirmação:", error);
        return { sucesso: false, motivo: error.message };
    }
};

// Função para enviar lembretes em massa
window.enviarLembretesMassa = async function(data, tipo = 'dia') {
    try {
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(
            agendamentosRef,
            where("data", "==", data),
            where("status", "in", ["confirmado", "aguardando_pagamento"])
        );
        
        const snapshot = await getDocs(q);
        console.log(`📊 Enviando lembretes para ${snapshot.size} agendamentos na data ${data}`);
        
        let enviados = 0;
        let erros = 0;
        
        for (const doc of snapshot.docs) {
            const agendamento = { id: doc.id, ...doc.data() };
            const resultado = await enviarLembrete(agendamento, tipo);
            if (resultado.sucesso) {
                enviados++;
            } else {
                erros++;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        return { enviados, erros };
        
    } catch (error) {
        console.error("Erro ao enviar lembretes em massa:", error);
        return { enviados: 0, erros: 0, erro: error.message };
    }
};

// Função para verificar status dos lembretes
window.verificarStatusLembretes = async function(agendamentoId) {
    try {
        const historicoQuery = query(
            collection(db, "historico_lembretes"),
            where("agendamentoId", "==", agendamentoId)
        );
        const snapshot = await getDocs(historicoQuery);
        
        const lembretes = [];
        snapshot.forEach(doc => {
            lembretes.push({ id: doc.id, ...doc.data() });
        });
        
        return lembretes;
        
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        return [];
    }
};

// Exportar funções para uso global
window.iniciarLembretesAutomaticos = iniciarLembretesAutomaticos;
window.pararLembretesAutomaticos = pararLembretesAutomaticos;
window.verificarELembrarVespera = verificarELembrarVespera;
window.verificarELembrarDia = verificarELembrarDia;

// Inicializar sistema de lembretes quando usuário estiver autenticado
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("👤 Usuário autenticado, iniciando sistema de lembretes...");
        iniciarLembretesAutomaticos();
    } else {
        console.log("⚠️ Usuário não autenticado, sistema de lembretes desativado");
    }
});

console.log("✅ lembretes.js carregado - Sistema de lembretes automáticos ativo!");