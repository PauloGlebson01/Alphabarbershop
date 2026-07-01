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
  
// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elementos DOM
const clienteNomeEl = document.getElementById('clienteNome');
const servicoNomeEl = document.getElementById('servicoNome');
const estrelasContainer = document.getElementById('estrelasContainer');
const notaSelecionadaEl = document.getElementById('notaSelecionada');
const btnEnviar = document.getElementById('btnEnviar');
const mensajeEl = document.getElementById('mensagem');
const comentarioEl = document.getElementById('comentario');

let notaSelecionada = 0;
let avaliacaoDocId = null;
let agendamentoIdAtual = null;
let carregamentoConcluido = false;

function mostrarMensagem(texto, tipo = 'info') {
    mensajeEl.textContent = texto;
    mensajeEl.className = `mensagem ${tipo}`;
    setTimeout(() => {
        mensajeEl.className = 'mensagem';
        mensajeEl.textContent = '';
    }, 5000);
}

function atualizarEstrelas(nota) {
    const estrelas = document.querySelectorAll('.estrela');
    estrelas.forEach((estrela, index) => {
        const estrelaNota = parseInt(estrela.dataset.nota);
        if (estrelaNota <= nota) {
            estrela.className = 'fa-solid fa-star estrela ativa';
        } else {
            estrela.className = 'fa-regular fa-star estrela';
        }
    });
    
    const textos = {
        1: 'Muito Ruim - Vamos melhorar! 😔',
        2: 'Ruim - Precisamos melhorar 😐',
        3: 'Bom - Ficamos felizes! 🙂',
        4: 'Muito Bom - Obrigado! 😊',
        5: 'Excelente! Ficamos muito felizes! 🎉✨'
    };
    
    if (nota > 0) {
        const estrelasTexto = '⭐'.repeat(nota);
        notaSelecionadaEl.innerHTML = `<i class="fa-solid fa-star" style="color: #fbbf24;"></i> Nota: ${estrelasTexto} (${nota}/5) - ${textos[nota]}`;
    } else {
        notaSelecionadaEl.innerHTML = `<i class="fa-regular fa-star"></i> Clique nas estrelas para avaliar`;
    }
}

function getUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        agendamentoId: urlParams.get('agendamentoId'),
        cliente: decodeURIComponent(urlParams.get('cliente') || ''),
        servico: decodeURIComponent(urlParams.get('servico') || '')
    };
}

async function buscarAgendamento(agendamentoId) {
    try {
        console.log("🔍 Buscando agendamento ID:", agendamentoId);
        
        if (!agendamentoId || !db) {
            return null;
        }
        
        const agendamentoRef = doc(db, "agendamentos", agendamentoId);
        const agendamentoDoc = await getDoc(agendamentoRef);
        
        if (agendamentoDoc.exists()) {
            console.log("✅ Agendamento encontrado!");
            return { id: agendamentoDoc.id, ...agendamentoDoc.data() };
        } else {
            console.log("❌ Agendamento NÃO encontrado!");
            return null;
        }
    } catch (error) {
        console.error("❌ Erro ao buscar agendamento:", error);
        return null;
    }
}

async function buscarOuCriarAvaliacao(agendamentoId, clienteNome, servicoNome) {
    try {
        console.log("🔍 Buscando/criando avaliação para agendamento:", agendamentoId);
        
        if (!db) return null;
        
        const avaliacoesRef = collection(db, "avaliacoes");
        const q = query(avaliacoesRef, where("agendamentoId", "==", agendamentoId));
        const snapshot = await getDocs(q);
        
        // Se já existe, retorna
        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            avaliacaoDocId = docSnap.id;
            console.log("✅ Avaliação encontrada! ID:", avaliacaoDocId);
            return docSnap.data();
        }
        
        // Criar nova avaliação
        console.log("📝 Criando nova avaliação...");
        const novaAvaliacao = {
            agendamentoId: agendamentoId,
            clienteNome: clienteNome || 'Cliente',
            servicoNome: servicoNome || 'Atendimento',
            nota: 0,
            comentario: '',
            status: "pendente",
            dataCriacao: Timestamp.now()
        };
        
        const docRef = await addDoc(avaliacoesRef, novaAvaliacao);
        avaliacaoDocId = docRef.id;
        console.log("✅ Avaliação criada com ID:", avaliacaoDocId);
        return novaAvaliacao;
        
    } catch (error) {
        console.error("❌ Erro ao buscar/criar avaliação:", error);
        mostrarMensagem("Erro ao conectar com o banco de dados. Tente novamente.", "erro");
        return null;
    }
}

async function salvarAvaliacao(nota, comentario) {
    console.log("💾 Salvando avaliação...");
    console.log("📌 avaliacaoDocId:", avaliacaoDocId);
    
    if (!avaliacaoDocId) {
        throw new Error("ID da avaliação não encontrado. A avaliação não foi carregada corretamente.");
    }
    
    const avaliacaoRef = doc(db, "avaliacoes", avaliacaoDocId);
    await updateDoc(avaliacaoRef, {
        nota: nota,
        comentario: comentario,
        status: "concluida",
        dataAvaliacao: Timestamp.now()
    });
    console.log(`✅ Avaliação salva! Nota: ${nota}`);
}

// Evento das estrelas
if (estrelasContainer) {
    estrelasContainer.addEventListener('click', (e) => {
        const estrela = e.target.closest('.estrela');
        if (!estrela) return;
        
        notaSelecionada = parseInt(estrela.dataset.nota);
        atualizarEstrelas(notaSelecionada);
        
        estrela.classList.add('selecionada');
        setTimeout(() => estrela.classList.remove('selecionada'), 300);
    });
}

// Evento do botão enviar
if (btnEnviar) {
    btnEnviar.addEventListener('click', async () => {
        if (!carregamentoConcluido) {
            mostrarMensagem('⚠️ Aguarde o carregamento da página antes de enviar.', 'erro');
            return;
        }
        
        if (notaSelecionada === 0) {
            mostrarMensagem('⚠️ Por favor, selecione uma nota antes de enviar.', 'erro');
            return;
        }
        
        if (!avaliacaoDocId) {
            mostrarMensagem('⚠️ Erro ao identificar a avaliação. Recarregue a página e tente novamente.', 'erro');
            return;
        }
        
        const comentario = comentarioEl?.value.trim() || '';
        
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<span class="loading"></span> Enviando avaliação...';
        
        try {
            await salvarAvaliacao(notaSelecionada, comentario);
            mostrarMensagem('✅ Avaliação enviada com sucesso! Muito obrigado pelo seu feedback! 💖', 'sucesso');
            
            if (estrelasContainer) estrelasContainer.style.pointerEvents = 'none';
            if (comentarioEl) comentarioEl.disabled = true;
            
            btnEnviar.innerHTML = '<i class="fa-regular fa-circle-check"></i> Avaliação Enviada';
            
            setTimeout(() => { 
                window.location.href = 'agenda.html'; 
            }, 3000);
            
        } catch (error) {
            console.error('❌ Erro ao enviar:', error);
            mostrarMensagem('❌ Erro ao enviar avaliação. Tente novamente.', 'erro');
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fa-regular fa-paper-plane"></i> Enviar Avaliação';
        }
    });
}

// Inicialização
async function inicializar() {
    console.log("🔄 Inicializando página de avaliação...");
    console.log("📍 URL atual:", window.location.href);
    
    const params = getUrlParams();
    const agendamentoId = params.agendamentoId;
    const clienteNome = params.cliente;
    const servicoNome = params.servico;
    
    console.log("📋 Parâmetros recebidos:", { agendamentoId, clienteNome, servicoNome });
    
    if (!agendamentoId) {
        mostrarMensagem('❌ Link de avaliação inválido. Agendamento não identificado.', 'erro');
        if (clienteNomeEl) clienteNomeEl.textContent = 'Erro ao carregar';
        if (servicoNomeEl) servicoNomeEl.textContent = 'Link inválido';
        carregamentoConcluido = true;
        return;
    }
    
    agendamentoIdAtual = agendamentoId;
    
    if (clienteNomeEl) clienteNomeEl.textContent = 'Carregando...';
    if (servicoNomeEl) servicoNomeEl.textContent = 'Buscando informações...';
    
    // Buscar o agendamento para obter informações
    const agendamento = await buscarAgendamento(agendamentoId);
    
    if (!agendamento) {
        mostrarMensagem('❌ Agendamento não encontrado. Verifique o link e tente novamente.', 'erro');
        if (clienteNomeEl) clienteNomeEl.textContent = 'Agendamento não encontrado';
        if (servicoNomeEl) servicoNomeEl.textContent = 'ID inválido';
        carregamentoConcluido = true;
        return;
    }
    
    const nomeClienteFinal = clienteNome || agendamento.cliente || agendamento.nome || 'Cliente';
    let servicoNomeFinal = servicoNome || 'Atendimento';
    
    if (agendamento.servicos && agendamento.servicos.length > 0) {
        servicoNomeFinal = agendamento.servicos[0].nome || servicoNomeFinal;
    } else if (agendamento.servico) {
        servicoNomeFinal = agendamento.servico;
    }
    
    if (clienteNomeEl) clienteNomeEl.textContent = nomeClienteFinal;
    if (servicoNomeEl) servicoNomeEl.textContent = `Serviço: ${servicoNomeFinal}`;
    
    // Buscar ou criar avaliação (isso vai preencher avaliacaoDocId)
    const avaliacao = await buscarOuCriarAvaliacao(agendamentoId, nomeClienteFinal, servicoNomeFinal);
    
    if (!avaliacao) {
        mostrarMensagem('❌ Erro ao carregar avaliação. Tente novamente.', 'erro');
        carregamentoConcluido = true;
        return;
    }
    
    console.log("📌 avaliacaoDocId definido:", avaliacaoDocId);
    
    // Verificar se já foi avaliada
    if (avaliacao.nota > 0 && avaliacao.status === 'concluida') {
        notaSelecionada = avaliacao.nota;
        atualizarEstrelas(notaSelecionada);
        
        if (comentarioEl) {
            comentarioEl.value = avaliacao.comentario || '';
            comentarioEl.disabled = true;
        }
        
        if (estrelasContainer) estrelasContainer.style.pointerEvents = 'none';
        if (btnEnviar) {
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fa-regular fa-circle-check"></i> Avaliação já realizada';
        }
        
        mostrarMensagem('✅ Você já avaliou este atendimento. Muito obrigado!', 'info');
    } else {
        atualizarEstrelas(0);
        mostrarMensagem('⭐ Avalie sua experiência clicando nas estrelas acima!', 'info');
    }
    
    carregamentoConcluido = true;
    console.log("✅ Página de avaliação carregada com sucesso!");
    console.log("📌 Agendamento ID:", agendamentoId);
    console.log("📌 Avaliação ID:", avaliacaoDocId);
}

// Iniciar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}