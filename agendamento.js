// agendamento.js - Versão com divisão de turnos estilo App Barber e intervalo configurável
// 🔥 CORREÇÃO: Agendamentos com status CONCLUIDO ou FINALIZADO NÃO liberam o horário
// Apenas CANCELADO e AUSENTE liberam o horário
// 🆕 Horários baseados nas configurações do admin (08:00 - 20:00)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs,
    Timestamp,
    doc,
    updateDoc,
    getDoc,
    orderBy,
    and
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// CONFIGURAÇÕES DE DADOS
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
const form = document.getElementById("formAgendamento");
const nomeInput = document.getElementById("nome");
const telefoneInput = document.getElementById("telefone");
const emailInput = document.getElementById("email");
const dataNascimentoInput = document.getElementById("dataNascimento");
const profissionalSelect = document.getElementById("profissional");
const dataInput = document.getElementById("data");
const horariosDiv = document.getElementById("horarios");
const horarioHidden = document.getElementById("horario");
const mensagemDiv = document.getElementById("mensagem");
const loadingDiv = document.getElementById("loading");
const observacaoGeral = document.getElementById("observacaoGeral");
const servicosContainer = document.getElementById("servicosContainer");
const btnAdicionarServico = document.getElementById("btnAdicionarServico");
const valorTotalServicosSpan = document.getElementById("valorTotalServicos");

// Elementos do Modal
const modalSelecionarCliente = document.getElementById("modalSelecionarCliente");
const listaClientesModal = document.getElementById("listaClientesModal");
const btnFecharModal = document.getElementById("btnFecharModal");

// Elementos da Lista de Espera
const modalListaEspera = document.getElementById("modalListaEspera");
const modalListaConfirmada = document.getElementById("modalListaConfirmada");
const btnCancelarLista = document.getElementById("btnCancelarLista");
const btnConfirmarLista = document.getElementById("btnConfirmarLista");
const btnFecharListaConfirmada = document.getElementById("btnFecharListaConfirmada");
const listaDataDisplay = document.getElementById("listaDataDisplay");
const listaProfissionalDisplay = document.getElementById("listaProfissionalDisplay");
const listaServicosDisplay = document.getElementById("listaServicosDisplay");
const listaClienteDisplay = document.getElementById("listaClienteDisplay");

// Variáveis de controle
let clienteSelecionadoParaAgendamento = null;
let agendamentoEmAndamento = false;

// ==================== HORÁRIOS DINÂMICOS BASEADOS NAS CONFIGURAÇÕES DO ADMIN ====================

let intervaloConfigurado = 10; // padrão
let horarioAbertura = "08:00"; // padrão
let horarioFechamento = "20:00"; // padrão
let horariosManha = [];
let horariosTarde = [];
let horariosNoite = [];
let horariosAtendimento = [];

// Função para validar formato de horário HH:MM
function validarHorario(horario) {
    const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(horario);
}

// Função para carregar as configurações de horário do Firebase
async function carregarConfiguracoesHorarios() {
    try {
        const configRef = doc(db, "configuracoes", "horarios");
        const configSnap = await getDoc(configRef);
        
        if (configSnap.exists()) {
            const data = configSnap.data();
            
            // Carregar horário de abertura e fechamento
            if (data.semana) {
                // Formato esperado: "08:00 - 20:00"
                const partes = data.semana.split('-').map(s => s.trim());
                if (partes.length === 2) {
                    const abertura = partes[0];
                    const fechamento = partes[1];
                    
                    // Validar formato HH:MM
                    if (validarHorario(abertura) && validarHorario(fechamento)) {
                        horarioAbertura = abertura;
                        horarioFechamento = fechamento;
                        console.log(`📋 Horário de funcionamento carregado: ${horarioAbertura} - ${horarioFechamento}`);
                    }
                }
            }
            
            // Carregar intervalo
            if (data.intervalo) {
                intervaloConfigurado = data.intervalo;
                console.log(`📋 Intervalo carregado: ${intervaloConfigurado} minutos`);
            }
            
            // Regenerar horários com as novas configurações
            atualizarHorariosGlobais(intervaloConfigurado);
            return;
        }
        
        // Se não houver configuração, usar padrões
        console.log(`📋 Usando horários padrão: ${horarioAbertura} - ${horarioFechamento}`);
        atualizarHorariosGlobais(intervaloConfigurado);
        
    } catch (error) {
        console.error("Erro ao carregar configurações de horário:", error);
        atualizarHorariosGlobais(intervaloConfigurado);
    }
}

// Função para gerar horários baseado nas configurações
function gerarHorariosDinamicos(intervalo) {
    const abertura = horarioAbertura;
    const fechamento = horarioFechamento;
    
    const horarios = [];
    const inicio = horarioParaMinutos(abertura);
    const fim = horarioParaMinutos(fechamento);
    
    if (inicio >= fim) {
        console.warn(`⚠️ Horário de abertura (${abertura}) deve ser menor que fechamento (${fechamento})`);
        return [];
    }
    
    for (let i = inicio; i < fim; i += intervalo) {
        horarios.push(minutosParaHorario(i));
    }
    
    console.log(`📋 ${horarios.length} horários gerados (${abertura} - ${fechamento}) com intervalo de ${intervalo} minutos`);
    
    return horarios;
}

// Função para distribuir horários por turnos
function distribuirPorTurnos(horarios) {
    const manha = [];
    const tarde = [];
    const noite = [];
    
    const limiteManha = horarioParaMinutos("12:00");
    const limiteTarde = horarioParaMinutos("19:00");
    
    horarios.forEach(h => {
        const minutos = horarioParaMinutos(h);
        if (minutos < limiteManha) {
            manha.push(h);
        } else if (minutos < limiteTarde) {
            tarde.push(h);
        } else {
            noite.push(h);
        }
    });
    
    return { manha, tarde, noite };
}

// Função para atualizar os arrays globais
function atualizarHorariosGlobais(intervalo) {
    const horarios = gerarHorariosDinamicos(intervalo);
    const turnos = distribuirPorTurnos(horarios);
    
    horariosManha = turnos.manha;
    horariosTarde = turnos.tarde;
    horariosNoite = turnos.noite;
    horariosAtendimento = horarios;
    
    console.log(`   🌅 Manhã (${horarioAbertura}-12:00): ${horariosManha.length} horários`);
    console.log(`   ☀️ Tarde (12:00-19:00): ${horariosTarde.length} horários`);
    console.log(`   🌙 Noite (19:00-${horarioFechamento}): ${horariosNoite.length} horários`);
    
    return horarios;
}

// Escutar mudanças nas configurações
window.addEventListener('configuracoesHorariosAlteradas', (event) => {
    console.log(`🔄 Configurações de horário alteradas:`, event.detail);
    if (event.detail.abertura) horarioAbertura = event.detail.abertura;
    if (event.detail.fechamento) horarioFechamento = event.detail.fechamento;
    if (event.detail.intervalo) intervaloConfigurado = event.detail.intervalo;
    
    atualizarHorariosGlobais(intervaloConfigurado);
    
    // Recarregar horários se estiver na página de agendamento
    if (typeof atualizarHorarios === 'function') {
        setTimeout(() => atualizarHorarios(), 300);
    }
});

// Escutar mudanças no intervalo (mantido para compatibilidade)
window.addEventListener('intervaloAlterado', (event) => {
    console.log(`🔄 Intervalo alterado para: ${event.detail.intervalo} minutos`);
    intervaloConfigurado = event.detail.intervalo;
    atualizarHorariosGlobais(intervaloConfigurado);
    
    if (typeof atualizarHorarios === 'function') {
        setTimeout(() => atualizarHorarios(), 300);
    }
});

let camposPreenchidos = { nome: false, telefone: false, profissional: false, data: false, servicos: false };
let usuarioAutenticado = false;
let servicosDisponiveis = [];
let pacoteAtual = null;

// ==================== FUNÇÕES DE UTILIDADE ====================

function horarioParaMinutos(horario) {
    if (!horario) return 0;
    const [horas, minutos] = horario.split(':').map(Number);
    return horas * 60 + minutos;
}

function minutosParaHorario(minutos) {
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function calcularDuracaoTotal() {
    if (pacoteAtual && pacoteAtual.duracaoTotal) {
        return pacoteAtual.duracaoTotal;
    }
    
    let duracaoTotal = 0;
    document.querySelectorAll('.servico-select').forEach(select => {
        const selectedOption = select.options[select.selectedIndex];
        const servicoId = selectedOption?.getAttribute('data-id');
        const servico = servicosDisponiveis.find(s => s.id === servicoId);
        if (servico && servico.duracao) {
            duracaoTotal += servico.duracao;
        }
    });
    return duracaoTotal > 0 ? duracaoTotal : 60;
}

function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u0301]/g, '').trim();
}

function formatarTelefone(valor) {
    let v = valor.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length >= 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length >= 8) v = v.replace(/(\(\d{2}\) \d{5})(\d)/, "$1-$2");
    return v.slice(0, 16);
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

function getTurno(horario) {
    const minutos = horarioParaMinutos(horario);
    const manhaFim = horarioParaMinutos("12:00");
    const tardeFim = horarioParaMinutos("19:00");
    
    if (minutos < manhaFim) return "manha";
    if (minutos < tardeFim) return "tarde";
    return "noite";
}

function getNomeTurno(turno) {
    const nomes = {
        manha: "🌅 Manhã",
        tarde: "☀️ Tarde",
        noite: "🌙 Noite"
    };
    return nomes[turno] || turno;
}

function getCorTurno(turno) {
    const cores = {
        manha: { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' },
        tarde: { bg: '#fffbeb', border: '#f59e0b', text: '#d97706' },
        noite: { bg: '#f3e8ff', border: '#8b5cf6', text: '#7c3aed' }
    };
    return cores[turno] || cores.manha;
}

// ==================== FUNÇÕES DO MODAL ====================

function abrirModalSelecionarCliente(clientes, telefone) {
    if (!modalSelecionarCliente || !listaClientesModal) return;
    
    listaClientesModal.innerHTML = "";
    
    clientes.forEach(cliente => {
        const card = document.createElement("div");
        card.className = "cliente-card-modal";
        
        const inicial = cliente.nome ? cliente.nome.charAt(0).toUpperCase() : "?";
        
        let dataCriacao = "";
        if (cliente.createdAt) {
            const date = cliente.createdAt.toDate ? cliente.createdAt.toDate() : new Date(cliente.createdAt);
            dataCriacao = date.toLocaleDateString('pt-BR');
        }
        
        card.innerHTML = `
            <div class="cliente-avatar-modal">${inicial}</div>
            <div class="cliente-info-modal">
                <h4>${cliente.nome}</h4>
                <p>📅 Cliente desde: ${dataCriacao || "N/A"}</p>
                <p>📊 ${cliente.totalAgendamentos || 0} agendamento(s)</p>
                ${cliente.nascimento ? `<p>🎂 Nascimento: ${cliente.nascimento}</p>` : ""}
                ${cliente.email ? `<p>✉️ ${cliente.email}</p>` : ""}
            </div>
            <i class="fa-solid fa-chevron-right" style="color: #2199EF;"></i>
        `;
        
        card.addEventListener("click", () => {
            clienteSelecionadoParaAgendamento = {
                id: cliente.id,
                nome: cliente.nome,
                email: cliente.email || "",
                nascimento: cliente.nascimento || "",
                telefone: telefone,
                totalAgendamentos: cliente.totalAgendamentos || 0
            };
            
            if (nomeInput) nomeInput.value = cliente.nome;
            if (emailInput && cliente.email) emailInput.value = cliente.email;
            if (dataNascimentoInput && cliente.nascimento) dataNascimentoInput.value = cliente.nascimento;
            
            fecharModal();
            
            if (cliente.nascimento) {
                verificarAniversario(cliente.nascimento, cliente.nome);
            }
            
            mostrarMensagem(`✅ Cliente ${cliente.nome} selecionado!`, "sucesso");
            verificarCamposPreenchidos();
        });
        
        listaClientesModal.appendChild(card);
    });
    
    modalSelecionarCliente.style.display = "flex";
}

function fecharModal() {
    if (modalSelecionarCliente) {
        modalSelecionarCliente.style.display = "none";
    }
}

function verificarAniversario(dataNascimento, nome) {
    if (!dataNascimento) return false;
    
    const hoje = new Date();
    const nascimento = new Date(dataNascimento);
    
    if (nascimento.getMonth() === hoje.getMonth() && nascimento.getDate() === hoje.getDate()) {
        mostrarMensagem(`🎂🎉 FELIZ ANIVERSÁRIO, ${nome.toUpperCase()}! 🎉🎂 Você ganha 10% de desconto hoje!`, "sucesso");
        
        setTimeout(() => {
            aplicarDescontoAniversario();
        }, 500);
        return true;
    }
    return false;
}

function aplicarDescontoAniversario() {
    if (!pacoteAtual) {
        let totalAtual = 0;
        document.querySelectorAll('.servico-select').forEach(select => {
            const selectedOption = select.options[select.selectedIndex];
            const preco = parseFloat(selectedOption?.getAttribute('data-preco') || 0);
            totalAtual += preco;
        });
        
        if (totalAtual > 0) {
            const desconto = totalAtual * 0.10;
            const novoTotal = totalAtual - desconto;
            
            if (valorTotalServicosSpan) {
                valorTotalServicosSpan.innerHTML = `${formatarMoeda(novoTotal)} <span style="font-size: 0.65rem; color: #10b981; margin-left: 8px;">(10% OFF - Aniversário!)</span>`;
                valorTotalServicosSpan.style.color = '#10b981';
                setTimeout(() => {
                    valorTotalServicosSpan.style.color = '';
                }, 5000);
            }
        }
    }
}

// ==================== FUNÇÃO PARA BUSCAR CLIENTES POR TELEFONE ====================
async function buscarTodosClientesPorTelefone(telefone) {
    if (!telefone) return [];
    
    const telefoneNumerico = telefone.replace(/\D/g, "");
    if (telefoneNumerico.length < 10) return [];
    
    try {
        console.log(`🔍 Buscando TODOS clientes com telefone: ${telefoneNumerico}`);
        
        const clientesRef = collection(db, "clientes");
        const qNumerico = query(clientesRef, where("telefoneNumerico", "==", telefoneNumerico));
        const snapshotNumerico = await getDocs(qNumerico);
        
        const clientes = [];
        snapshotNumerico.forEach(doc => {
            clientes.push({ id: doc.id, ...doc.data() });
        });
        
        if (clientes.length === 0) {
            const qTelefone = query(clientesRef, where("telefone", "==", telefone));
            const snapshotTelefone = await getDocs(qTelefone);
            snapshotTelefone.forEach(doc => {
                clientes.push({ id: doc.id, ...doc.data() });
            });
        }
        
        console.log(`📋 Encontrados ${clientes.length} clientes com este telefone`);
        return clientes;
        
    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
        return [];
    }
}

async function buscarClientePorTelefoneENome(telefone, nome) {
    if (!telefone) return null;
    
    const telefoneNumerico = telefone.replace(/\D/g, "");
    if (telefoneNumerico.length < 10) return null;
    
    const nomeNormalizado = nome ? normalizarTexto(nome) : "";
    
    try {
        console.log(`🔍 Buscando cliente com telefone: ${telefoneNumerico} e nome: ${nome}`);
        
        const clientesRef = collection(db, "clientes");
        
        const qExato = query(
            clientesRef, 
            where("telefoneNumerico", "==", telefoneNumerico),
            where("nome", "==", nome)
        );
        const snapshotExato = await getDocs(qExato);
        
        if (!snapshotExato.empty) {
            const clienteDoc = snapshotExato.docs[0];
            const cliente = { id: clienteDoc.id, ...clienteDoc.data() };
            console.log("✅ Cliente encontrado por telefone+nome exato:", cliente.nome);
            return cliente;
        }
        
        const todosClientes = await getDocs(clientesRef);
        for (const doc of todosClientes.docs) {
            const cliente = doc.data();
            const telefoneCliente = cliente.telefoneNumerico || cliente.telefone?.replace(/\D/g, "");
            const nomeClienteNormalizado = normalizarTexto(cliente.nome || "");
            
            if (telefoneCliente === telefoneNumerico && nomeClienteNormalizado === nomeNormalizado) {
                console.log("✅ Cliente encontrado por telefone+nome normalizado:", cliente.nome);
                return { id: doc.id, ...cliente };
            }
        }
        
        console.log("❌ Nenhum cliente encontrado com este telefone e nome");
        return null;
        
    } catch (error) {
        console.error("Erro ao buscar cliente:", error);
        return null;
    }
}

// ==================== FUNÇÃO PARA PROCESSAR CLIENTE ====================
let debounceTimeout = null;

async function processarTelefoneCliente(telefone) {
    if (!telefone || telefone.replace(/\D/g, "").length < 10) {
        clienteSelecionadoParaAgendamento = null;
        return;
    }
    
    const clientes = await buscarTodosClientesPorTelefone(telefone);
    
    if (clientes.length === 0) {
        clienteSelecionadoParaAgendamento = null;
    } 
    else if (clientes.length === 1) {
        const cliente = clientes[0];
        clienteSelecionadoParaAgendamento = {
            id: cliente.id,
            nome: cliente.nome,
            email: cliente.email || "",
            nascimento: cliente.nascimento || "",
            telefone: telefone,
            totalAgendamentos: cliente.totalAgendamentos || 0
        };
        
        if (nomeInput) nomeInput.value = cliente.nome;
        if (emailInput && cliente.email) emailInput.value = cliente.email;
        if (dataNascimentoInput && cliente.nascimento) dataNascimentoInput.value = cliente.nascimento;
        
        if (cliente.nascimento) {
            verificarAniversario(cliente.nascimento, cliente.nome);
        }
        
        console.log(`✅ Cliente único encontrado: ${cliente.nome}`);
    }
    else if (clientes.length > 1) {
        console.log(`⚠️ Múltiplos clientes (${clientes.length}) encontrados com este telefone`);
        
        const nomeDigitado = nomeInput?.value.trim() || "";
        if (nomeDigitado) {
            const matchExato = clientes.find(c => c.nome.toLowerCase() === nomeDigitado.toLowerCase());
            if (matchExato) {
                clienteSelecionadoParaAgendamento = {
                    id: matchExato.id,
                    nome: matchExato.nome,
                    email: matchExato.email || "",
                    nascimento: matchExato.nascimento || "",
                    telefone: telefone,
                    totalAgendamentos: matchExato.totalAgendamentos || 0
                };
                
                if (nomeInput) nomeInput.value = matchExato.nome;
                if (emailInput && matchExato.email) emailInput.value = matchExato.email;
                if (dataNascimentoInput && matchExato.nascimento) dataNascimentoInput.value = matchExato.nascimento;
                
                if (matchExato.nascimento) {
                    verificarAniversario(matchExato.nascimento, matchExato.nome);
                }
                
                console.log(`✅ Match exato encontrado: ${matchExato.nome}`);
                return;
            }
        }
        
        abrirModalSelecionarCliente(clientes, telefone);
    }
}

// ==================== FUNÇÃO PARA BUSCAR BLOQUEIOS ====================
async function buscarBloqueios(data, profissionalId = null) {
    if (!data) return [];
    
    try {
        console.log(`🔍 Buscando bloqueios para data: ${data}, profissional: ${profissionalId || "todos"}`);
        
        const bloqueiosRef = collection(db, "bloqueios");
        const q = query(bloqueiosRef, where("ativo", "==", true));
        const snapshot = await getDocs(q);
        
        const bloqueios = [];
        
        snapshot.forEach(doc => {
            const bloqueio = { id: doc.id, ...doc.data() };
            
            let dataInicio = null;
            let dataFim = null;
            
            if (bloqueio.dataInicio) {
                if (bloqueio.dataInicio.toDate) {
                    const date = bloqueio.dataInicio.toDate();
                    dataInicio = formatarDataComparacao(date);
                } else if (typeof bloqueio.dataInicio === 'string') {
                    dataInicio = bloqueio.dataInicio.split('T')[0];
                } else if (bloqueio.dataInicio.seconds) {
                    const date = new Date(bloqueio.dataInicio.seconds * 1000);
                    dataInicio = formatarDataComparacao(date);
                }
            }
            
            if (bloqueio.dataFim) {
                if (bloqueio.dataFim.toDate) {
                    const date = bloqueio.dataFim.toDate();
                    dataFim = formatarDataComparacao(date);
                } else if (typeof bloqueio.dataFim === 'string') {
                    dataFim = bloqueio.dataFim.split('T')[0];
                } else if (bloqueio.dataFim.seconds) {
                    const date = new Date(bloqueio.dataFim.seconds * 1000);
                    dataFim = formatarDataComparacao(date);
                }
            }
            
            let aplica = false;
            
            if (dataInicio && dataFim && dataInicio <= data && dataFim >= data) {
                aplica = true;
            }
            
            const temHorariosEspecificos = bloqueio.horarios && Array.isArray(bloqueio.horarios) && bloqueio.horarios.length > 0;
            
            if (aplica) {
                if (bloqueio.profissionalId && profissionalId && bloqueio.profissionalId !== profissionalId) {
                    return;
                }
                bloqueios.push(bloqueio);
                console.log(`   ✅ BLOQUEIO ADICIONADO: ${bloqueio.titulo}`);
            }
        });
        
        console.log(`📋 Encontrados ${bloqueios.length} bloqueios para esta data`);
        
        return bloqueios;
        
    } catch (error) {
        console.error("Erro ao buscar bloqueios:", error);
        return [];
    }
}

function formatarDataComparacao(data) {
    if (!data) return '';
    
    try {
        if (data instanceof Date) {
            const ano = data.getFullYear();
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const dia = String(data.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }
        if (data.toDate) {
            const date = data.toDate();
            const ano = date.getFullYear();
            const mes = String(date.getMonth() + 1).padStart(2, '0');
            const dia = String(date.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }
        if (typeof data === 'string') {
            if (data.includes('-')) {
                return data.split('T')[0];
            }
            if (data.includes('/')) {
                const [dia, mes, ano] = data.split('/');
                return `${ano}-${mes}-${dia}`;
            }
        }
        return data;
    } catch (error) {
        console.error("Erro ao formatar data:", error);
        return data;
    }
}

async function isHorarioBloqueado(data, horario, profissionalId) {
    const bloqueios = await buscarBloqueios(data, profissionalId);
    
    for (const bloqueio of bloqueios) {
        const isDiaInteiro = !bloqueio.horarios || bloqueio.horarios.length === 0;
        if (isDiaInteiro) {
            console.log(`🔒 Horário ${horario} bloqueado - dia inteiro: ${bloqueio.titulo}`);
            return true;
        }
        
        if (bloqueio.horarios && Array.isArray(bloqueio.horarios)) {
            if (bloqueio.horarios.includes(horario)) {
                console.log(`🔒 Horário ${horario} bloqueado especificamente: ${bloqueio.titulo}`);
                return true;
            }
        }
    }
    
    return false;
}

// ==================== FUNÇÃO PARA PROCESSAR SERVIÇO DA URL ====================
async function processarServicoUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const servicoNome = urlParams.get('servico');
    const servicoPreco = urlParams.get('servicoPreco');
    const servicoId = urlParams.get('servicoId');
    const servicoDuracao = urlParams.get('servicoDuracao');
    
    if (!servicoNome) return false;
    
    console.log("🎯 Serviço recebido da URL:", servicoNome);
    
    let tentativas = 0;
    const maxTentativas = 30;
    
    return new Promise((resolve) => {
        const tentarSelecionarServico = setInterval(() => {
            tentativas++;
            
            if (servicosDisponiveis.length > 0) {
                const servicoEncontrado = servicosDisponiveis.find(s => 
                    s.nome === servicoNome || 
                    s.id === servicoId ||
                    s.nome.toLowerCase() === servicoNome.toLowerCase()
                );
                
                if (servicoEncontrado) {
                    console.log("✅ Serviço encontrado:", servicoEncontrado);
                    
                    const primeiroSelect = document.querySelector('.servico-select');
                    if (primeiroSelect) {
                        for (let i = 0; i < primeiroSelect.options.length; i++) {
                            if (primeiroSelect.options[i].value === servicoEncontrado.nome) {
                                primeiroSelect.selectedIndex = i;
                                const event = new Event('change');
                                primeiroSelect.dispatchEvent(event);
                                calcularValorTotal();
                                verificarCamposPreenchidos();
                                mostrarMensagem(`✅ Serviço "${servicoEncontrado.nome}" selecionado automaticamente!`, "sucesso");
                                break;
                            }
                        }
                    }
                    clearInterval(tentarSelecionarServico);
                    resolve(true);
                    return;
                }
            }
            
            if (tentativas >= maxTentativas) {
                const primeiroSelect = document.querySelector('.servico-select');
                if (primeiroSelect && primeiroSelect.options.length > 1) {
                    for (let i = 0; i < primeiroSelect.options.length; i++) {
                        const optionText = primeiroSelect.options[i].textContent;
                        if (optionText.includes(servicoNome) || 
                            normalizarTexto(optionText) === normalizarTexto(servicoNome)) {
                            primeiroSelect.selectedIndex = i;
                            const event = new Event('change');
                            primeiroSelect.dispatchEvent(event);
                            calcularValorTotal();
                            verificarCamposPreenchidos();
                            mostrarMensagem(`✅ Serviço "${servicoNome}" selecionado!`, "sucesso");
                            break;
                        }
                    }
                }
                clearInterval(tentarSelecionarServico);
                resolve(false);
            }
        }, 200);
    });
}

// ==================== EXIBIR INFORMAÇÕES DO PACOTE ====================
function exibirInfoPacote(pacote) {
    const infoPacoteDiv = document.getElementById('infoPacote');
    if (!infoPacoteDiv) return;
    
    if (pacote && pacote.preco && pacote.precoOriginal) {
        const economia = pacote.precoOriginal - pacote.preco;
        const descontoPercentual = pacote.desconto || ((economia / pacote.precoOriginal) * 100).toFixed(1);
        
        document.getElementById('pacoteNomeDisplay').textContent = pacote.nome;
        document.getElementById('precoOriginalDisplay').textContent = formatarMoeda(pacote.precoOriginal);
        document.getElementById('precoDescontoDisplay').textContent = formatarMoeda(pacote.preco);
        document.getElementById('descontoBadgeDisplay').innerHTML = `<i class="fa-solid fa-percent"></i> ${descontoPercentual}% OFF`;
        document.getElementById('economiaValorDisplay').textContent = formatarMoeda(economia);
        
        infoPacoteDiv.style.display = 'block';
        
        const totalSpan = document.getElementById('valorTotalServicos');
        if (totalSpan) {
            totalSpan.style.color = '#10b981';
            totalSpan.style.fontSize = '1.3rem';
        }
    } else {
        infoPacoteDiv.style.display = 'none';
        const totalSpan = document.getElementById('valorTotalServicos');
        if (totalSpan) {
            totalSpan.style.color = '';
            totalSpan.style.fontSize = '';
        }
    }
}

// ==================== RECEBER PARÂMETROS DA URL ====================
function getUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        profissionalId: urlParams.get('profissionalId'),
        profissionalNome: urlParams.get('profissionalNome'),
        pacoteNome: urlParams.get('pacote'),
        servicosParam: urlParams.get('servicos'),
        precoTotal: urlParams.get('precoTotal'),
        pacoteId: urlParams.get('pacoteId'),
        servico: urlParams.get('servico'),
        servicoPreco: urlParams.get('servicoPreco'),
        servicoId: urlParams.get('servicoId')
    };
}

async function buscarPacoteCompleto(pacoteNome, pacoteId) {
    try {
        if (pacoteId) {
            const pacoteRef = doc(db, "pacotes", pacoteId);
            const pacoteSnap = await getDoc(pacoteRef);
            if (pacoteSnap.exists()) {
                return { id: pacoteSnap.id, ...pacoteSnap.data() };
            }
        }
        
        if (pacoteNome) {
            const pacotesRef = collection(db, "pacotes");
            const q = query(pacotesRef, where("nome", "==", pacoteNome));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar pacote:", error);
        return null;
    }
}

async function processarPacoteUrl() {
    const params = getUrlParams();
    const pacoteNome = params.pacoteNome;
    const pacoteId = params.pacoteId;
    const precoTotal = params.precoTotal;
    
    if (!pacoteNome && !pacoteId) return false;
    
    pacoteAtual = await buscarPacoteCompleto(pacoteNome, pacoteId);
    
    if (pacoteAtual) {
        console.log("🎁 Pacote carregado:", pacoteAtual);
        
        pacoteAtual = {
            id: pacoteAtual.id,
            nome: pacoteAtual.nome,
            precoOriginal: pacoteAtual.precoOriginal || pacoteAtual.preco,
            preco: precoTotal ? parseFloat(precoTotal) : pacoteAtual.preco,
            desconto: pacoteAtual.desconto || 0,
            servicos: pacoteAtual.servicos || [],
            duracaoTotal: pacoteAtual.duracaoTotal || 60
        };
        
        if (pacoteAtual.desconto === 0 && pacoteAtual.precoOriginal > pacoteAtual.preco) {
            pacoteAtual.desconto = Math.round((1 - pacoteAtual.preco / pacoteAtual.precoOriginal) * 100);
        }
        
        exibirInfoPacote(pacoteAtual);
        mostrarMensagem(`🎁 Pacote "${pacoteAtual.nome}" aplicado! Desconto de ${pacoteAtual.desconto}% OFF.`, "sucesso");
        
        if (valorTotalServicosSpan) {
            valorTotalServicosSpan.textContent = formatarMoeda(pacoteAtual.preco);
            valorTotalServicosSpan.style.animation = 'pulse 0.5s ease';
            setTimeout(() => valorTotalServicosSpan.style.animation = '', 500);
        }
        
        if (btnAdicionarServico) {
            btnAdicionarServico.disabled = true;
            btnAdicionarServico.style.opacity = '0.5';
            btnAdicionarServico.style.cursor = 'not-allowed';
        }
        
        document.querySelectorAll('.btn-remover-servico').forEach(btn => {
            btn.style.display = 'none';
        });
        
        if (pacoteAtual.servicos && pacoteAtual.servicos.length > 0) {
            while (document.querySelectorAll('.servico-item').length > 1) {
                document.querySelector('.servico-item:last-child')?.remove();
            }
            
            for (let i = 0; i < pacoteAtual.servicos.length; i++) {
                const servico = pacoteAtual.servicos[i];
                const servicoNome = servico.nome;
                
                if (i === 0) {
                    const primeiroSelect = document.querySelector('.servico-select');
                    if (primeiroSelect) {
                        for (let j = 0; j < primeiroSelect.options.length; j++) {
                            if (primeiroSelect.options[j].value === servicoNome) {
                                primeiroSelect.selectedIndex = j;
                                primeiroSelect.disabled = true;
                                break;
                            }
                        }
                    }
                } else {
                    const index = document.querySelectorAll('.servico-item').length;
                    const novoServico = document.createElement('div');
                    novoServico.className = 'servico-item';
                    novoServico.setAttribute('data-index', index);
                    novoServico.innerHTML = `
                        <div class="servico-row">
                            <select name="servico[]" class="servico-select" required disabled>
                                <option value="">Selecione um serviço</option>
                            </select>
                            <button type="button" class="btn-remover-servico" data-index="${index}" style="display: none;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    `;
                    servicosContainer.appendChild(novoServico);
                    
                    const novoServicoSelect = novoServico.querySelector('.servico-select');
                    popularSelectServico(novoServicoSelect);
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    for (let j = 0; j < novoServicoSelect.options.length; j++) {
                        if (novoServicoSelect.options[j].value === servicoNome) {
                            novoServicoSelect.selectedIndex = j;
                            novoServicoSelect.disabled = true;
                            break;
                        }
                    }
                }
            }
        }
        
        verificarCamposPreenchidos();
        return true;
    }
    
    return false;
}

function processarParametrosProfissional() {
    const params = getUrlParams();
    
    if (params.profissionalId || params.profissionalNome) {
        let tentativas = 0;
        const maxTentativas = 30;
        
        const tentarSelecionar = setInterval(() => {
            tentativas++;
            
            if (!profissionalSelect || profissionalSelect.options.length === 0) {
                if (tentativas >= maxTentativas) clearInterval(tentarSelecionar);
                return;
            }
            
            for (let i = 0; i < profissionalSelect.options.length; i++) {
                const option = profissionalSelect.options[i];
                if ((params.profissionalId && option.value === params.profissionalId) ||
                    (params.profissionalNome && option.textContent === params.profissionalNome)) {
                    profissionalSelect.value = option.value;
                    mostrarMensagem(`✅ Barbeiro ${option.textContent} selecionado!`, "sucesso");
                    verificarCamposPreenchidos();
                    clearInterval(tentarSelecionar);
                    return;
                }
            }
            
            if (tentativas >= maxTentativas) clearInterval(tentarSelecionar);
        }, 500);
    }
}

// ==================== CARREGAR SERVIÇOS ====================
async function carregarServicosFirebase() {
    try {
        const servicosRef = collection(db, "servicos");
        const snapshot = await getDocs(servicosRef);
        
        servicosDisponiveis = [];
        snapshot.forEach(doc => {
            const servico = doc.data();
            servicosDisponiveis.push({
                id: doc.id,
                nome: servico.nome,
                preco: servico.preco || 0,
                duracao: servico.duracao || 60
            });
        });
        
        recriarSelectsServicos();
        
        const pacoteProcessado = await processarPacoteUrl();
        
        if (!pacoteProcessado) {
            await processarServicoUrl();
        }
        
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
    }
}

async function carregarProfissionais() {
    if (!profissionalSelect) return;
    
    profissionalSelect.innerHTML = '<option value="">Carregando especialistas...</option>';
    profissionalSelect.disabled = true;
    
    try {
        const profissionaisRef = collection(db, "profissionais");
        const snapshot = await getDocs(profissionaisRef);
        
        if (snapshot.empty) {
            profissionalSelect.innerHTML = '<option value="">Nenhum especialista disponível</option>';
            profissionalSelect.disabled = false;
            return;
        }
        
        profissionalSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
        
        snapshot.forEach(doc => {
            const profissional = doc.data();
            const nome = profissional.nome || profissional.name || 'Sem nome';
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = nome;
            option.setAttribute('data-nome', nome);
            profissionalSelect.appendChild(option);
        });
        
        profissionalSelect.disabled = false;
        processarParametrosProfissional();
        
    } catch (error) {
        console.error("Erro ao carregar profissionais:", error);
        profissionalSelect.innerHTML = '<option value="">Erro ao carregar especialistas</option>';
        profissionalSelect.disabled = false;
    }
}

// ==================== FUNÇÕES DE SERVIÇOS ====================
function recriarSelectsServicos() {
    document.querySelectorAll('.servico-item .servico-select').forEach(select => {
        popularSelectServico(select);
    });
}

function popularSelectServico(selectElement) {
    const valorAtual = selectElement.value;
    selectElement.innerHTML = '<option value="">Selecione um serviço</option>';
    
    servicosDisponiveis.forEach(servico => {
        const option = document.createElement('option');
        option.value = servico.nome;
        option.setAttribute('data-preco', servico.preco);
        option.setAttribute('data-id', servico.id);
        option.setAttribute('data-duracao', servico.duracao);
        option.textContent = `${servico.nome} - ${formatarMoeda(servico.preco)} (${Math.floor(servico.duracao / 60)}h${servico.duracao % 60}min)`;
        selectElement.appendChild(option);
    });
    
    if (valorAtual && servicosDisponiveis.some(s => s.nome === valorAtual)) {
        selectElement.value = valorAtual;
    }
}

function calcularValorTotalReal() {
    let total = 0;
    document.querySelectorAll('.servico-select').forEach(select => {
        const selectedOption = select.options[select.selectedIndex];
        const preco = parseFloat(selectedOption?.getAttribute('data-preco') || 0);
        total += preco;
    });
    return total;
}

function calcularValorTotal() {
    if (pacoteAtual && pacoteAtual.preco) {
        valorTotalServicosSpan.textContent = formatarMoeda(pacoteAtual.preco);
        exibirInfoPacote(pacoteAtual);
        return pacoteAtual.preco;
    }
    
    let total = 0;
    document.querySelectorAll('.servico-select').forEach(select => {
        const selectedOption = select.options[select.selectedIndex];
        const preco = parseFloat(selectedOption?.getAttribute('data-preco') || 0);
        total += preco;
    });
    valorTotalServicosSpan.textContent = formatarMoeda(total);
    
    if (!pacoteAtual) {
        exibirInfoPacote(null);
    }
    
    return total;
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function adicionarServico() {
    if (pacoteAtual) {
        mostrarMensagem("⚠️ Não é possível adicionar serviços avulsos a um pacote. Finalize ou cancele o pacote.", "erro");
        return;
    }
    
    const index = document.querySelectorAll('.servico-item').length;
    const novoServico = document.createElement('div');
    novoServico.className = 'servico-item';
    novoServico.setAttribute('data-index', index);
    novoServico.innerHTML = `
        <div class="servico-row">
            <select name="servico[]" class="servico-select" required>
                <option value="">Carregando serviços...</option>
            </select>
            <button type="button" class="btn-remover-servico" data-index="${index}">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;
    servicosContainer.appendChild(novoServico);
    
    const novoServicoSelect = novoServico.querySelector('.servico-select');
    popularSelectServico(novoServicoSelect);
    
    novoServicoSelect.addEventListener('change', () => {
        calcularValorTotal();
        verificarCamposPreenchidos();
        if (verificarCamposPreenchidos()) {
            atualizarHorarios();
        }
    });
    
    const btnRemover = novoServico.querySelector('.btn-remover-servico');
    btnRemover.addEventListener('click', () => {
        if (document.querySelectorAll('.servico-item').length > 1) {
            novoServico.remove();
            calcularValorTotal();
            verificarCamposPreenchidos();
            if (verificarCamposPreenchidos()) {
                atualizarHorarios();
            }
        } else {
            mostrarMensagem("Você precisa manter pelo menos um serviço.", "erro");
        }
    });
    
    document.querySelectorAll('.btn-remover-servico').forEach(btn => btn.style.display = 'flex');
    calcularValorTotal();
}

if (btnAdicionarServico) btnAdicionarServico.addEventListener('click', adicionarServico);

function configurarEventosServicos() {
    if (pacoteAtual) return;
    
    document.querySelectorAll('.servico-select').forEach(select => {
        select.removeEventListener('change', () => {});
        select.addEventListener('change', () => { 
            calcularValorTotal(); 
            verificarCamposPreenchidos();
            if (verificarCamposPreenchidos()) {
                atualizarHorarios();
            }
        });
    });
}

// ==================== FUNÇÃO DE CLIENTE ====================
async function salvarOuAtualizarCliente(dadosCliente) {
    try {
        const { nome, telefone, email, dataNascimento } = dadosCliente;
        
        if (!nome || nome.length < 2) {
            console.error("❌ Nome inválido:", nome);
            mostrarMensagem("Nome inválido. Digite seu nome completo.", "erro");
            return null;
        }
        
        if (!telefone || telefone.replace(/\D/g, "").length < 10) {
            console.error("❌ Telefone inválido:", telefone);
            mostrarMensagem("Telefone inválido. Use um número válido com DDD.", "erro");
            return null;
        }
        
        const telefoneNumerico = telefone.replace(/\D/g, "");
        console.log("📱 Processando cliente - Nome:", nome, "| Telefone:", telefoneNumerico);
        
        let clienteId = null;
        const now = Timestamp.now();
        
        if (clienteSelecionadoParaAgendamento && clienteSelecionadoParaAgendamento.id) {
            console.log("✅ Usando cliente pré-selecionado:", clienteSelecionadoParaAgendamento.nome);
            clienteId = clienteSelecionadoParaAgendamento.id;
            
            const clienteRef = doc(db, "clientes", clienteId);
            const clienteSnap = await getDoc(clienteRef);
            
            if (clienteSnap.exists()) {
                const dadosAtuais = clienteSnap.data();
                await updateDoc(clienteRef, {
                    totalAgendamentos: (dadosAtuais.totalAgendamentos || 0) + 1,
                    ultimoAtendimento: now,
                    atualizadoEm: now,
                    email: email || dadosAtuais.email || "",
                    nascimento: dataNascimento || dadosAtuais.nascimento || ""
                });
                
                console.log("✅ Cliente atualizado! Total de agendamentos agora:", (dadosAtuais.totalAgendamentos || 0) + 1);
                mostrarMensagem(`✅ Bem-vindo de volta, ${dadosAtuais.nome}! Seu agendamento foi confirmado.`, "sucesso");
                
                return clienteId;
            }
        }
        
        const clienteExistente = await buscarClientePorTelefoneENome(telefone, nome);
        
        if (clienteExistente) {
            console.log("✅ Cliente encontrado, atualizando...", clienteExistente.id);
            clienteId = clienteExistente.id;
            const clienteRef = doc(db, "clientes", clienteId);
            
            await updateDoc(clienteRef, {
                totalAgendamentos: (clienteExistente.totalAgendamentos || 0) + 1,
                ultimoAtendimento: now,
                atualizadoEm: now,
                email: email || clienteExistente.email || "",
                nascimento: dataNascimento || clienteExistente.nascimento || ""
            });
            
            console.log("✅ Cliente atualizado! Total de agendamentos agora:", (clienteExistente.totalAgendamentos || 0) + 1);
            mostrarMensagem(`✅ Bem-vindo de volta, ${clienteExistente.nome}! Seu agendamento foi confirmado.`, "sucesso");
            
        } else {
            console.log("🆕 Cliente não encontrado. Criando novo cliente...");
            
            const novoCliente = {
                nome: nome,
                telefone: telefone,
                telefoneNumerico: telefoneNumerico,
                email: email || "",
                nascimento: dataNascimento || "",
                totalAgendamentos: 1,
                primeiroAtendimento: now,
                ultimoAtendimento: now,
                createdAt: now,
                atualizadoEm: now,
                status: "ativo"
            };
            
            console.log("📝 Dados do novo cliente:", novoCliente);
            
            const docRef = await addDoc(collection(db, "clientes"), novoCliente);
            clienteId = docRef.id;
            console.log("✅ Novo cliente criado com ID:", clienteId);
            mostrarMensagem(`✅ Cliente ${nome} cadastrado com sucesso!`, "sucesso");
        }
        
        return clienteId;
        
    } catch (error) {
        console.error("❌ Erro em salvarOuAtualizarCliente:", error);
        mostrarMensagem(`Erro ao processar cliente. Tente novamente.`, "erro");
        return null;
    }
}

// ==================== FUNÇÕES DE AGENDAMENTO ====================
function mostrarMensagem(texto, tipo = 'sucesso') {
    if (!mensagemDiv) return;
    mensagemDiv.textContent = texto;
    mensagemDiv.className = tipo === 'sucesso' ? 'sucesso' : 'erro';
    setTimeout(() => { mensagemDiv.textContent = ''; mensagemDiv.className = ''; }, 5000);
}

function getDiaSemana(dataStr) {
    if (!dataStr) return null;
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    const dataUTC = new Date(Date.UTC(ano, mes - 1, dia));
    return dataUTC.getUTCDay();
}

function getNomeDiaSemana(dataStr) {
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return dias[getDiaSemana(dataStr)];
}

function getHorariosPorDia(dataStr) {
    const diaSemana = getDiaSemana(dataStr);
    
    // Atendimento de SEGUNDA à SÁBADO com horários dinâmicos baseados na configuração
    if (diaSemana >= 1 && diaSemana <= 6) {
        // Usar os horários gerados dinamicamente baseados na configuração do admin
        return { 
            horarios: horariosAtendimento,
            descricao: `Segunda à Sábado (${horarioAbertura} - ${horarioFechamento})`,
            turnos: {
                manha: { horarios: horariosManha, label: "🌅 Manhã", total: horariosManha.length },
                tarde: { horarios: horariosTarde, label: "☀️ Tarde", total: horariosTarde.length },
                noite: { horarios: horariosNoite, label: "🌙 Noite", total: horariosNoite.length }
            }
        };
    }
    else {
        return { 
            horarios: [],
            descricao: "Domingo - Fechado",
            turnos: null
        };
    }
}

function getInfoAtendimentoPorDia(dataStr) {
    const diaSemana = getDiaSemana(dataStr);
    
    if (diaSemana === 0) {
        return { 
            temAtendimento: false, 
            mensagem: "❌ Não atendemos aos domingos." 
        };
    }
    
    const horariosInfo = getHorariosPorDia(dataStr);
    
    return { 
        temAtendimento: true, 
        horarios: horariosInfo.horarios,
        turnos: horariosInfo.turnos,
        mensagem: `Horários - ${horariosInfo.descricao}`
    };
}

function verificarCamposPreenchidos() {
    const nome = nomeInput?.value.trim();
    const telefone = telefoneInput?.value.trim();
    const profissional = profissionalSelect?.value;
    const data = dataInput?.value;
    let servicoSelecionado = false;
    
    if (pacoteAtual) {
        servicoSelecionado = true;
    } else {
        document.querySelectorAll('.servico-select').forEach(select => { 
            if (select.value && select.value !== "") servicoSelecionado = true; 
        });
    }
    
    camposPreenchidos.nome = nome && nome.length >= 3;
    camposPreenchidos.telefone = telefone && telefone.replace(/\D/g, "").length >= 10;
    camposPreenchidos.profissional = profissional && profissional !== "" && !profissional.includes("Carregando") && !profissional.includes("Nenhum") && !profissional.includes("Erro");
    camposPreenchidos.data = data && data !== "";
    camposPreenchidos.servicos = servicoSelecionado;
    
    const todosPreenchidos = Object.values(camposPreenchidos).every(v => v === true);
    if (todosPreenchidos && data && usuarioAutenticado) atualizarHorarios();
    else if (horariosDiv && !todosPreenchidos) mostrarMensagemCampos();
    return todosPreenchidos;
}

function mostrarMensagemCampos() {
    if (!horariosDiv) return;
    let mensagem = "";
    if (!camposPreenchidos.nome) mensagem = "Preencha seu nome";
    else if (!camposPreenchidos.telefone) mensagem = "Preencha seu WhatsApp";
    else if (!camposPreenchidos.servicos) mensagem = "Selecione um serviço";
    else if (!camposPreenchidos.profissional) mensagem = "Selecione um barbeiro";
    else if (!camposPreenchidos.data) mensagem = "Selecione uma data";
    if (mensagem) horariosDiv.innerHTML = `<div class="aviso-campos"><i class="fa-solid fa-info-circle"></i><p>${mensagem}</p></div>`;
}

function configurarDataMinima() {
    if (!dataInput) return;
    const hoje = new Date();
    dataInput.min = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

// ==================== FUNÇÕES DA LISTA DE ESPERA ====================

async function adicionarListaEspera(dados) {
    try {
        const listaRef = collection(db, "lista_espera");
        
        const q = query(
            listaRef,
            where("clienteId", "==", dados.clienteId || ""),
            where("dataDesejada", "==", dados.dataDesejada),
            where("profissionalId", "==", dados.profissionalId),
            where("status", "==", "pendente")
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            mostrarMensagem("⚠️ Você já está na lista de espera para este dia e barbeiro.", "erro");
            return false;
        }
        
        const docRef = await addDoc(listaRef, {
            clienteId: dados.clienteId || null,
            clienteNome: dados.clienteNome,
            telefone: dados.telefone,
            servicos: dados.servicos || [],
            profissionalId: dados.profissionalId,
            profissionalNome: dados.profissionalNome,
            dataDesejada: dados.dataDesejada,
            horarioPreferido: dados.horarioPreferido || null,
            status: "pendente",
            dataEntrada: Timestamp.now(),
            tentativasNotificacao: 0,
            prioridade: 0,
            observacao: dados.observacao || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        
        console.log(`✅ Cliente adicionado à lista de espera: ${docRef.id}`);
        return true;
        
    } catch (error) {
        console.error("❌ Erro ao adicionar à lista de espera:", error);
        mostrarMensagem("Erro ao adicionar à lista de espera: " + error.message, "erro");
        return false;
    }
}

function abrirModalListaEspera() {
    const data = dataInput?.value;
    const profissional = profissionalSelect?.options[profissionalSelect.selectedIndex];
    const profissionalNome = profissional?.getAttribute('data-nome') || profissional?.textContent || "Selecionado";
    const nome = nomeInput?.value.trim() || "Cliente";
    
    let servicosNomes = [];
    document.querySelectorAll('.servico-select').forEach(select => {
        if (select.value) servicosNomes.push(select.value);
    });
    
    if (listaDataDisplay) listaDataDisplay.textContent = formatarData(data);
    if (listaProfissionalDisplay) listaProfissionalDisplay.textContent = profissionalNome;
    if (listaServicosDisplay) listaServicosDisplay.textContent = servicosNomes.join(", ") || "Não informado";
    if (listaClienteDisplay) listaClienteDisplay.textContent = nome;
    
    if (modalListaEspera) {
        modalListaEspera.style.display = "flex";
        console.log("📋 Modal da lista de espera aberto");
    } else {
        console.error("❌ Modal da lista de espera não encontrado");
        mostrarMensagem("Erro ao abrir a lista de espera. Tente novamente.", "erro");
    }
}

function fecharModalListaEspera() {
    if (modalListaEspera) modalListaEspera.style.display = "none";
}

function abrirModalListaConfirmada() {
    if (modalListaConfirmada) modalListaConfirmada.style.display = "flex";
}

function fecharModalListaConfirmada() {
    if (modalListaConfirmada) modalListaConfirmada.style.display = "none";
}

function adicionarEventoBotaoListaEspera() {
    setTimeout(() => {
        const btn = document.getElementById("btnEntrarListaEspera");
        if (btn) {
            const novoBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(novoBtn, btn);
            
            novoBtn.addEventListener("click", function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log("🔘 Botão da lista de espera clicado!");
                abrirModalListaEspera();
            });
            console.log("✅ Evento do botão lista de espera adicionado com sucesso!");
        } else {
            console.log("⏳ Botão da lista de espera ainda não existe, tentando novamente...");
            setTimeout(adicionarEventoBotaoListaEspera, 500);
        }
    }, 100);
}

// ==================== ATUALIZAR HORÁRIOS (CORRIGIDO) ====================
async function atualizarHorarios() {
    const data = dataInput.value;
    const profissionalId = profissionalSelect?.value;
    const profissionalNome = profissionalSelect?.options[profissionalSelect.selectedIndex]?.getAttribute('data-nome');
    
    console.log("=== INICIANDO VERIFICAÇÃO DE HORÁRIOS ===");
    console.log(`📅 Data: ${data}`);
    console.log(`👨‍🦱 Profissional ID: ${profissionalId}`);
    
    if (!data || !profissionalId) {
        console.log("❌ Data ou profissional não selecionado");
        return;
    }
    
    const duracaoTotal = calcularDuracaoTotal();
    console.log(`⏱️ Duração total do serviço: ${duracaoTotal} minutos`);
    
    if (duracaoTotal === 0) {
        horariosDiv.innerHTML = `<div class="aviso-campos"><i class="fa-solid fa-clock"></i><p>Selecione os serviços primeiro</p></div>`;
        return;
    }
    
    const infoAtendimento = getInfoAtendimentoPorDia(data);
    
    if (!infoAtendimento.temAtendimento) {
        horariosDiv.innerHTML = `<div class="aviso-campos"><i class="fa-solid fa-calendar-xmark"></i><p>${infoAtendimento.mensagem}</p></div>`;
        return;
    }
    
    horariosDiv.innerHTML = '<div class="loading-horarios"><i class="fas fa-spinner fa-spin"></i> Verificando horários disponíveis...</div>';
    
    try {
        const bloqueios = await buscarBloqueios(data, profissionalId);
        console.log(`🔒 Bloqueios encontrados para ${data}:`, bloqueios.length);
        
        const temBloqueioDiaInteiro = bloqueios.some(b => {
            const isDiaInteiro = !b.horarios || b.horarios.length === 0;
            return isDiaInteiro;
        });
        
        if (temBloqueioDiaInteiro) {
            const motivoBloqueio = bloqueios.find(b => !b.horarios || b.horarios.length === 0)?.motivo || "Estabelecimento fechado";
            horariosDiv.innerHTML = `
                <div class="aviso-campos erro">
                    <i class="fa-solid fa-store-slash"></i>
                    <p><strong>⚠️ Estabelecimento fechado neste dia</strong></p>
                    <p style="font-size: 0.8rem; margin-top: 8px;">${motivoBloqueio}</p>
                    <button id="btnEntrarListaEspera" class="btn-primary" 
                            style="background: linear-gradient(135deg, #f59e0b, #d97706); margin-top: 16px; width: 100%;">
                        <i class="fa-solid fa-clock"></i> Entrar na Lista de Espera
                    </button>
                    <p style="font-size: 0.7rem; color: #64748b; margin-top: 8px;">
                        🔔 Você será avisado automaticamente quando surgir uma vaga!
                    </p>
                </div>
            `;
            adicionarEventoBotaoListaEspera();
            return;
        }
        
        const horariosBloqueadosManualmente = new Set();
        for (const bloqueio of bloqueios) {
            if (bloqueio.horarios && Array.isArray(bloqueio.horarios)) {
                bloqueio.horarios.forEach(h => {
                    horariosBloqueadosManualmente.add(h);
                    console.log(`   🔒 Horário bloqueado manualmente: ${h} (${bloqueio.titulo})`);
                });
            }
        }
        console.log(`🔒 Total de horários bloqueados manualmente: ${horariosBloqueadosManualmente.size}`);
        
        const agendamentosRef = collection(db, "agendamentos");
        
        const q = query(
            agendamentosRef, 
            where("data", "==", data), 
            where("profissionalId", "==", profissionalId)
        );
        
        const snapshot = await getDocs(q);
        
        // 🔥 CORREÇÃO: Agora TODOS os status ocupam o horário, EXCETO cancelado, ausente e horarioLiberado
        const statusLiberados = ["cancelado", "ausente"];
        const horariosOcupados = [];
        
        console.log(`📊 TOTAL de agendamentos encontrados: ${snapshot.size}`);
        console.log(`📋 Status que LIBERAM o horário: ${statusLiberados.join(', ')}`);
        console.log(`📋 TODOS OS DEMAIS status OCUPAM o horário (incluindo concluido, finalizado, confirmado, aguardando_pagamento, pendente)`);
        console.log(`🔓 Agendamentos com horarioLiberado=true são IGNORADOS (liberam o horário)`);
        
        snapshot.forEach(doc => {
            const agendamento = doc.data();
            const status = agendamento.status;
            const horario = agendamento.horario;
            const horarioLiberado = agendamento.horarioLiberado === true;
            
            // 🔥 CORREÇÃO: Se horarioLiberado for true, o horário está disponível
            if (horarioLiberado) {
                console.log(`   🟢 HORÁRIO LIBERADO (IGNORADO): ${horario} (status: ${status}, horarioLiberado: true)`);
                return;
            }
            
            // 🔥 CORREÇÃO: Apenas cancelado e ausente liberam o horário
            if (status === "cancelado" || status === "ausente") {
                console.log(`   🟢 IGNORADO/LIBERADO: ${horario} (status: ${status})`);
                return;
            }
            
            // 🔥 CORREÇÃO: TODOS OS DEMAIS status ocupam o horário
            if (horario) {
                horariosOcupados.push({
                    horario: horario,
                    duracaoTotal: agendamento.duracaoTotal || 60,
                    status: status
                });
                console.log(`   🔴 OCUPADO: ${horario} (status: ${status})`);
            }
        });
        
        console.log(`📊 Horários efetivamente ocupados: ${horariosOcupados.length}`);
        
        const limiteMinutos = horarioParaMinutos(horarioFechamento);
        const horariosDisponiveis = [];
        const horariosIndisponiveis = [];
        
        for (const horarioBase of infoAtendimento.horarios) {
            if (horariosBloqueadosManualmente.has(horarioBase)) {
                console.log(`   🔒 BLOQUEADO (manual): ${horarioBase}`);
                horariosIndisponiveis.push(horarioBase);
                continue;
            }
            
            const inicioMinutos = horarioParaMinutos(horarioBase);
            const fimMinutos = inicioMinutos + duracaoTotal;
            
            if (fimMinutos > limiteMinutos) {
                horariosIndisponiveis.push(horarioBase);
                continue;
            }
            
            let conflito = false;
            for (const ocupado of horariosOcupados) {
                const ocupadoInicio = horarioParaMinutos(ocupado.horario);
                const ocupadoFim = ocupadoInicio + (ocupado.duracaoTotal || 60);
                if (inicioMinutos < ocupadoFim && fimMinutos > ocupadoInicio) {
                    conflito = true;
                    break;
                }
            }
            
            if (conflito) {
                horariosIndisponiveis.push(horarioBase);
            } else {
                horariosDisponiveis.push(horarioBase);
            }
        }
        
        console.log(`✅ Horários disponíveis: ${horariosDisponiveis.length}`);
        console.log(`   Disponíveis: ${horariosDisponiveis.join(', ')}`);
        console.log(`   Indisponíveis: ${horariosIndisponiveis.join(', ')}`);
        
        renderizarHorarios(horariosDisponiveis, horariosIndisponiveis, infoAtendimento, duracaoTotal);
        
    } catch (error) {
        console.error("❌ Erro ao buscar horários:", error);
        horariosDiv.innerHTML = `<div class="aviso-campos erro"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar horários: ${error.message}</p></div>`;
    }
}

// ==================== RENDERIZAR HORÁRIOS COM DIVISÃO DE TURNOS (ESTILO APP BARBER) ====================
function renderizarHorarios(horariosDisponiveis = [], horariosIndisponiveis = [], infoAtendimento, duracaoTotal) {
    const nomeDia = getNomeDiaSemana(dataInput.value);
    
    horariosDiv.innerHTML = '';
    
    const duracaoFormatada = `${Math.floor(duracaoTotal / 60)}h ${duracaoTotal % 60}min`;
    
    // HEADER PRINCIPAL - SEM INFORMAÇÃO DE INTERVALO PARA O CLIENTE
    const infoHeader = document.createElement('div');
    infoHeader.style.cssText = `
        background: linear-gradient(135deg, #e8f4fd, #dbeafe);
        padding: 16px 20px;
        border-radius: 16px;
        margin-bottom: 20px;
        text-align: center;
        border-left: 4px solid #2199EF;
        box-shadow: 0 2px 8px rgba(33, 153, 239, 0.15);
    `;
    infoHeader.innerHTML = `
        <div>
            <h3 style="margin:0;color:#1a365d;font-size:1.1rem;">
                📅 ${nomeDia} - Horários Disponíveis
            </h3>
            <p style="margin:4px 0 0;font-size:0.75rem;color:#10b981;">
                <i class="fa-regular fa-clock"></i> Duração total: ${duracaoFormatada}
            </p>
        </div>
    `;
    horariosDiv.appendChild(infoHeader);
    
    // Se não houver horários disponíveis
    if (horariosDisponiveis.length === 0) {
        const avisoDiv = document.createElement('div');
        avisoDiv.className = 'aviso-campos';
        avisoDiv.style.cssText = `
            padding: 30px 20px;
            text-align: center;
            background: #f8fafc;
            border-radius: 16px;
            border: 2px dashed #e2e8f0;
        `;
        avisoDiv.innerHTML = `
            <i class="fa-solid fa-clock" style="font-size:2rem;color:#94a3b8;display:block;margin-bottom:12px;"></i>
            <p style="font-weight:500;color:#475569;">Nenhum horário disponível para esta data</p>
            <p style="font-size: 0.7rem; color: #94a3b8; margin-top: 4px;">Tente outra data ou horário</p>
            <button id="btnEntrarListaEspera" class="btn-primary" 
                    style="background: linear-gradient(135deg, #f59e0b, #d97706); margin-top: 16px; padding: 10px 24px; border: none; border-radius: 12px; color: white; font-weight: 600; cursor: pointer; width: 100%;">
                <i class="fa-solid fa-clock"></i> Entrar na Lista de Espera
            </button>
            <p style="font-size: 0.65rem; color: #94a3b8; margin-top: 8px;">
                🔔 Você será avisado automaticamente quando surgir uma vaga!
            </p>
            ${horariosIndisponiveis.length > 0 ? 
                `<p style="font-size: 0.6rem; margin-top: 8px; color:#c2410c;">⛔ Horários ocupados: ${horariosIndisponiveis.join(', ')}</p>` : ''}
        `;
        horariosDiv.appendChild(avisoDiv);
        adicionarEventoBotaoListaEspera();
        return;
    }
    
    // Organiza os horários disponíveis por turno
    const turnosAgrupados = {
        manha: { label: '🌅 Manhã', horarios: [], total: horariosManha.length },
        tarde: { label: '☀️ Tarde', horarios: [], total: horariosTarde.length },
        noite: { label: '🌙 Noite', horarios: [], total: horariosNoite.length }
    };
    
    horariosDisponiveis.forEach(h => {
        const turno = getTurno(h);
        if (turno === 'manha') turnosAgrupados.manha.horarios.push(h);
        else if (turno === 'tarde') turnosAgrupados.tarde.horarios.push(h);
        else if (turno === 'noite') turnosAgrupados.noite.horarios.push(h);
    });
    
    // Renderiza cada turno (ESTILO APP BARBER)
    for (const [key, turno] of Object.entries(turnosAgrupados)) {
        // Se o turno não tiver horários disponíveis, pula
        if (turno.horarios.length === 0) continue;
        
        const cor = getCorTurno(key);
        
        // Container do turno
        const turnoContainer = document.createElement('div');
        turnoContainer.style.cssText = `
            margin-bottom: 20px;
            background: ${cor.bg};
            border-radius: 14px;
            padding: 16px 18px;
            border-left: 5px solid ${cor.border};
            box-shadow: 0 1px 4px rgba(0,0,0,0.04);
            transition: all 0.2s;
        `;
        
        // Cabeçalho do turno (estilo App Barber)
        const headerTurno = document.createElement('div');
        headerTurno.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 2px solid ${cor.border}40;
        `;
        headerTurno.innerHTML = `
            <span style="font-weight: 700; font-size: 1rem; color: ${cor.text}; display: flex; align-items: center; gap: 8px;">
                ${turno.label}
            </span>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="
                    background: ${cor.border};
                    color: white;
                    padding: 2px 12px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 600;
                ">
                    ${turno.horarios.length} disponíveis
                </span>
                <span style="
                    background: white;
                    color: #94a3b8;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.6rem;
                    font-weight: 500;
                ">
                    ${turno.total} horários
                </span>
            </div>
        `;
        turnoContainer.appendChild(headerTurno);
        
        // Grade de botões (5 por linha - estilo App Barber)
        const gridContainer = document.createElement('div');
        gridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        `;
        
        turno.horarios.forEach(hora => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "horario-btn";
            btn.textContent = hora;
            btn.style.cssText = `
                padding: 8px 4px;
                border: 2px solid ${cor.border}60;
                border-radius: 10px;
                background: white;
                color: ${cor.text};
                font-weight: 600;
                font-size: 0.8rem;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            `;
            btn.title = `Duração do serviço: ${duracaoFormatada}`;
            
            btn.onmouseenter = () => {
                if (!btn.classList.contains('selecionado')) {
                    btn.style.borderColor = cor.border;
                    btn.style.transform = 'scale(1.03)';
                    btn.style.boxShadow = `0 4px 12px ${cor.border}30`;
                }
            };
            btn.onmouseleave = () => {
                if (!btn.classList.contains('selecionado')) {
                    btn.style.borderColor = `${cor.border}60`;
                    btn.style.transform = 'scale(1)';
                    btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                }
            };
            
            btn.onclick = () => {
                document.querySelectorAll(".horario-btn").forEach(b => {
                    b.classList.remove("selecionado");
                    b.style.borderColor = `${cor.border}60`;
                    b.style.background = 'white';
                    b.style.transform = 'scale(1)';
                    b.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                });
                btn.classList.add("selecionado");
                btn.style.borderColor = cor.border;
                btn.style.background = cor.bg;
                btn.style.transform = 'scale(1.02)';
                btn.style.boxShadow = `0 4px 16px ${cor.border}40`;
                horarioHidden.value = hora;
            };
            
            gridContainer.appendChild(btn);
        });
        
        turnoContainer.appendChild(gridContainer);
        horariosDiv.appendChild(turnoContainer);
    }
    
    // Horários indisponíveis (rodapé)
    if (horariosIndisponiveis.length > 0) {
        const infoOcupados = document.createElement('div');
        infoOcupados.style.cssText = `
            margin-top: 12px;
            padding: 10px 14px;
            background: #fef2e8;
            border-radius: 12px;
            font-size: 0.7rem;
            color: #c2410c;
            text-align: center;
            border: 1px solid #fecaca;
        `;
        infoOcupados.innerHTML = `
            <i class="fa-solid fa-clock" style="margin-right: 6px;"></i>
            Horários indisponíveis: ${horariosIndisponiveis.join(', ')}
        `;
        horariosDiv.appendChild(infoOcupados);
    }
}

function redirecionarParaPagamento(agendamentoId) {
    window.location.href = `pagamento-cliente.html?agendamento=${agendamentoId}`;
}

async function criarComanda(agendamentoId, dadosAgendamento) {
    try {
        const comandaData = {
            agendamentoId: agendamentoId,
            clienteNome: dadosAgendamento.nome,
            barbeiroNome: dadosAgendamento.profissional,
            servicos: dadosAgendamento.servicos || [],
            pacotes: dadosAgendamento.pacoteInfo ? [dadosAgendamento.pacoteInfo] : [],
            total: dadosAgendamento.valorTotal,
            status: "aguardando_pagamento",
            dataAgendamento: dadosAgendamento.data,
            horarioAgendamento: dadosAgendamento.horario,
            dataCriacao: Timestamp.now(),
            origem: "agendamento",
            pacoteId: dadosAgendamento.pacoteId || null,
            pacoteNome: dadosAgendamento.pacoteNome || null,
            descontoAplicado: dadosAgendamento.descontoAplicado || 0
        };
        
        const comandaRef = await addDoc(collection(db, "comandas"), comandaData);
        await updateDoc(doc(db, "agendamentos", agendamentoId), { comandaId: comandaRef.id });
        return comandaRef.id;
    } catch (error) {
        console.error("Erro ao criar comanda:", error);
        return null;
    }
}

// ==================== AUTENTICAÇÃO ====================
function autenticar(tentativa = 1) {
    signInAnonymously(auth).then(async () => {
        usuarioAutenticado = true;
        await carregarProfissionais();
        await carregarServicosFirebase();
        await carregarConfiguracoesHorarios(); // 🆕 Carregar configurações de horário
        verificarCamposPreenchidos();
    }).catch((error) => {
        console.error(`Erro autenticação (${tentativa}/3):`, error);
        if (tentativa < 3) setTimeout(() => autenticar(tentativa + 1), 1000);
    });
}

autenticar();

onAuthStateChanged(auth, async (user) => {
    if (user && !usuarioAutenticado) {
        usuarioAutenticado = true;
        await carregarProfissionais();
        await carregarServicosFirebase();
        await carregarConfiguracoesHorarios(); // 🆕 Carregar configurações de horário
        verificarCamposPreenchidos();
    }
});

// ==================== EVENTOS DA LISTA DE ESPERA ====================

if (btnCancelarLista) {
    btnCancelarLista.addEventListener("click", fecharModalListaEspera);
}

if (btnConfirmarLista) {
    btnConfirmarLista.addEventListener("click", async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log("🔘 Botão confirmar lista de espera clicado!");
        
        const nome = nomeInput?.value.trim();
        const telefone = telefoneInput?.value.trim();
        const data = dataInput?.value;
        const profissionalId = profissionalSelect?.value;
        const profissionalNome = profissionalSelect?.options[profissionalSelect.selectedIndex]?.getAttribute('data-nome') || "";
        
        if (!nome) {
            mostrarMensagem("❌ Preencha seu nome antes de entrar na lista de espera.", "erro");
            return;
        }
        
        if (!telefone || telefone.replace(/\D/g, "").length < 10) {
            mostrarMensagem("❌ Preencha um telefone válido antes de entrar na lista de espera.", "erro");
            return;
        }
        
        if (!data) {
            mostrarMensagem("❌ Selecione uma data antes de entrar na lista de espera.", "erro");
            return;
        }
        
        if (!profissionalId) {
            mostrarMensagem("❌ Selecione um barbeiro antes de entrar na lista de espera.", "erro");
            return;
        }
        
        let servicosLista = [];
        document.querySelectorAll('.servico-select').forEach(select => {
            if (select.value) {
                const option = select.options[select.selectedIndex];
                servicosLista.push({
                    nome: select.value,
                    preco: parseFloat(option?.getAttribute('data-preco') || 0)
                });
            }
        });
        
        if (servicosLista.length === 0) {
            mostrarMensagem("❌ Selecione pelo menos um serviço.", "erro");
            return;
        }
        
        let clienteId = null;
        try {
            const clienteExistente = await buscarClientePorTelefoneENome(telefone, nome);
            clienteId = clienteExistente?.id || null;
        } catch (error) {
            console.error("Erro ao buscar cliente:", error);
        }
        
        const dados = {
            clienteId: clienteId,
            clienteNome: nome,
            telefone: telefone,
            servicos: servicosLista,
            profissionalId: profissionalId,
            profissionalNome: profissionalNome,
            dataDesejada: data,
            horarioPreferido: null,
            observacao: observacaoGeral?.value || ""
        };
        
        console.log("📝 Dados para lista de espera:", dados);
        
        const sucesso = await adicionarListaEspera(dados);
        
        fecharModalListaEspera();
        
        if (sucesso) {
            abrirModalListaConfirmada();
            setTimeout(() => {
                const btn = document.getElementById("btnEntrarListaEspera");
                if (btn) btn.style.display = "none";
            }, 100);
        } else {
            mostrarMensagem("❌ Erro ao adicionar à lista de espera. Tente novamente.", "erro");
        }
    });
}

if (btnFecharListaConfirmada) {
    btnFecharListaConfirmada.addEventListener("click", fecharModalListaConfirmada);
}

window.addEventListener("click", (e) => {
    if (e.target === modalListaEspera) fecharModalListaEspera();
    if (e.target === modalListaConfirmada) fecharModalListaConfirmada();
});

// ==================== SUBMIT DO FORMULÁRIO ====================
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const nome = nomeInput?.value.trim();
        const telefone = telefoneInput?.value.trim();
        const email = emailInput?.value.trim();
        const dataNascimento = dataNascimentoInput?.value || "";
        const profissionalId = profissionalSelect?.value;
        const profissionalNome = profissionalSelect?.options[profissionalSelect.selectedIndex]?.getAttribute('data-nome');
        const data = dataInput?.value;
        const horario = horarioHidden?.value;
        const obsGeral = observacaoGeral?.value || '';
        
        console.log("📝 Dados do formulário:");
        console.log("  Nome:", nome);
        console.log("  Telefone:", telefone);
        console.log("  Data:", data);
        console.log("  Horário:", horario);
        
        const duracaoTotal = calcularDuracaoTotal();
        
        if (data && horario && profissionalId) {
            const agendamentosRef = collection(db, "agendamentos");
            
            const q = query(
                agendamentosRef, 
                where("data", "==", data), 
                where("horario", "==", horario),
                where("profissionalId", "==", profissionalId)
            );
            const existingSnap = await getDocs(q);
            
            let horarioOcupado = false;
            let motivoOcupado = "";
            
            for (const doc of existingSnap.docs) {
                const agendamento = doc.data();
                const status = agendamento.status;
                const horarioLiberado = agendamento.horarioLiberado === true;
                
                console.log(`📋 Verificando agendamento: status=${status}, horarioLiberado=${horarioLiberado}`);
                
                if (horarioLiberado) {
                    console.log(`🟢 Horário ${horario} foi LIBERADO (horarioLiberado=true)`);
                    continue;
                }
                
                if (status === "cancelado" || status === "ausente") {
                    console.log(`🟢 Horário ${horario} está ${status}, NÃO ocupa`);
                    continue;
                }
                
                // 🔥 CORREÇÃO: Qualquer outro status ocupa o horário
                console.log(`🔴 Horário ${horario} está OCUPADO (status: ${status})`);
                horarioOcupado = true;
                motivoOcupado = `status: ${status}`;
                break;
            }
            
            if (horarioOcupado) {
                mostrarMensagem(`❌ Este horário não está mais disponível (${motivoOcupado}). Por favor, selecione outro horário.`, "erro");
                await atualizarHorarios();
                return;
            }
            
            const isBloqueado = await isHorarioBloqueado(data, horario, profissionalId);
            if (isBloqueado) {
                mostrarMensagem("❌ Este horário está bloqueado. Por favor, selecione outro horário.", "erro");
                await atualizarHorarios();
                return;
            }
        }
        
        let servicosLista = [];
        let valorTotal = 0;
        let pacoteInfo = null;
        
        if (pacoteAtual) {
            pacoteInfo = {
                id: pacoteAtual.id,
                nome: pacoteAtual.nome,
                precoOriginal: pacoteAtual.precoOriginal,
                preco: pacoteAtual.preco,
                descontoPercentual: pacoteAtual.desconto,
                descontoValor: pacoteAtual.precoOriginal - pacoteAtual.preco,
                servicos: pacoteAtual.servicos || [],
                duracaoTotal: pacoteAtual.duracaoTotal || duracaoTotal,
                tipo: "pacote",
                isPacote: true
            };
            valorTotal = pacoteAtual.preco;
        } else {
            const servicosSelects = document.querySelectorAll('.servico-select');
            servicosSelects.forEach(select => {
                if (select.value && select.value !== "") {
                    const selectedOption = select.options[select.selectedIndex];
                    const preco = parseFloat(selectedOption?.getAttribute('data-preco') || 0);
                    const servicoId = selectedOption?.getAttribute('data-id');
                    const duracao = parseInt(selectedOption?.getAttribute('data-duracao') || 60);
                    servicosLista.push({ 
                        id: servicoId, 
                        nome: select.value, 
                        preco: preco,
                        duracao: duracao,
                        tipo: "servico"
                    });
                    valorTotal += preco;
                }
            });
        }
        
        if (!pacoteAtual && servicosLista.length === 0) { 
            mostrarMensagem("Selecione pelo menos um serviço.", "erro"); 
            return; 
        }
        if (!nome) { mostrarMensagem("Preencha seu nome.", "erro"); return; }
        if (!telefone) { mostrarMensagem("Preencha seu WhatsApp.", "erro"); return; }
        if (!profissionalId) { mostrarMensagem("Selecione um barbeiro.", "erro"); return; }
        if (!data) { mostrarMensagem("Selecione uma data.", "erro"); return; }
        if (!horario) { mostrarMensagem("Selecione um horário.", "erro"); return; }
        
        const inicioMinutos = horarioParaMinutos(horario);
        const fimMinutos = inicioMinutos + duracaoTotal;
        const horarioFim = minutosParaHorario(fimMinutos);
        
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
        loadingDiv.style.display = "block";
        
        const clienteId = await salvarOuAtualizarCliente({ nome, telefone, email, dataNascimento });
        
        if (!clienteId) {
            mostrarMensagem("Erro ao processar cliente. Tente novamente.", "erro");
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Agendamento';
            loadingDiv.style.display = "none";
            return;
        }
        
        const dadosAgendamento = {
            nome, 
            cliente: nome, 
            clienteId, 
            telefone, 
            whatsapp: telefone, 
            email: email || null,
            profissional: profissionalNome, 
            profissionalId, 
            tipoAtendimento: "Presencial",
            valor: valorTotal, 
            valorTotal: valorTotal, 
            data, 
            horario,
            horarioFim: horarioFim,
            duracaoTotal: duracaoTotal,
            observacaoGeral: obsGeral,
            status: "aguardando_pagamento", 
            pagamentoStatus: "pendente",
            createdAt: Timestamp.now(), 
            atualizadoEm: Timestamp.now()
        };
        
        if (pacoteInfo) {
            dadosAgendamento.pacoteInfo = pacoteInfo;
            dadosAgendamento.pacoteId = pacoteAtual.id;
            dadosAgendamento.pacoteNome = pacoteAtual.nome;
            dadosAgendamento.descontoAplicado = pacoteAtual.desconto;
            dadosAgendamento.servicos = [];
        } else {
            dadosAgendamento.servicos = servicosLista;
            dadosAgendamento.servicosNomes = servicosLista.map(s => s.nome).join(', ');
        }
        
        try {
            const docRef = await addDoc(collection(db, "agendamentos"), dadosAgendamento);
            const agendamentoId = docRef.id;
            
            if (clienteId) await updateDoc(doc(db, "agendamentos", agendamentoId), { clienteId });
            await criarComanda(agendamentoId, dadosAgendamento);
            
            mostrarMensagem("✅ Agendamento criado! Redirecionando para pagamento...", "sucesso");
            setTimeout(() => redirecionarParaPagamento(agendamentoId), 1500);
            
            clienteSelecionadoParaAgendamento = null;
            
        } catch (error) {
            console.error("Erro ao processar:", error);
            mostrarMensagem("Erro ao processar seu agendamento. Tente novamente.", "erro");
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Agendamento';
            loadingDiv.style.display = "none";
        }
    });
}

// ==================== EVENT LISTENERS ====================
if (nomeInput) nomeInput.addEventListener('input', verificarCamposPreenchidos);
if (profissionalSelect) profissionalSelect.addEventListener('change', () => {
    horarioHidden.value = '';
    verificarCamposPreenchidos();
});
if (dataInput) dataInput.addEventListener('change', () => { 
    horarioHidden.value = ''; 
    verificarCamposPreenchidos(); 
});

if (telefoneInput) {
    telefoneInput.addEventListener('input', (e) => {
        e.target.value = formatarTelefone(e.target.value);
        verificarCamposPreenchidos();
        
        clearTimeout(debounceTimeout);
        const telefone = e.target.value;
        if (telefone.replace(/\D/g, "").length >= 10) {
            debounceTimeout = setTimeout(() => {
                processarTelefoneCliente(telefone);
            }, 800);
        } else {
            clienteSelecionadoParaAgendamento = null;
        }
    });
    
    telefoneInput.addEventListener('blur', () => {
        const telefone = telefoneInput.value;
        if (telefone.replace(/\D/g, "").length >= 10) {
            processarTelefoneCliente(telefone);
        }
    });
}

if (btnFecharModal) {
    btnFecharModal.addEventListener('click', fecharModal);
}

window.addEventListener('click', (e) => {
    if (modalSelecionarCliente && e.target === modalSelecionarCliente) {
        fecharModal();
    }
});

if (servicosContainer && !pacoteAtual) {
    const observer = new MutationObserver(() => { 
        configurarEventosServicos(); 
        verificarCamposPreenchidos();
        if (verificarCamposPreenchidos()) {
            atualizarHorarios();
        }
    });
    observer.observe(servicosContainer, { childList: true, subtree: true });
}

configurarDataMinima();
configurarEventosServicos();
calcularValorTotal();

// ==================== LISTENERS PARA HORÁRIOS LIBERADOS ====================
window.recarregarHorariosDisponiveis = function(data, profissionalId) {
    console.log("🔄 Agenda: Recarregando horários para:", data, profissionalId);
    
    const dataInput = document.getElementById("data");
    const profissionalSelect = document.getElementById("profissional");
    
    if (dataInput && dataInput.value === data) {
        console.log("✅ Data corresponde, recarregando horários...");
        if (typeof atualizarHorarios === 'function') {
            setTimeout(() => atualizarHorarios(), 300);
        }
    }
};

window.addEventListener('horarioLiberado', (event) => {
    console.log("🔔 Agenda: Horário liberado recebido!", event.detail);
    console.log(`   Data: ${event.detail.data}, Horário: ${event.detail.horario}, Ação: ${event.detail.acao}`);
    
    if (typeof mostrarMensagem === 'function') {
        mostrarMensagem(`🔓 Horário ${event.detail.horario} do dia ${event.detail.data} foi liberado e está disponível!`, "sucesso");
    }
    
    const dataInput = document.getElementById("data");
    if (dataInput && dataInput.value === event.detail.data) {
        if (typeof atualizarHorarios === 'function') {
            setTimeout(() => atualizarHorarios(), 300);
        }
    }
});

window.addEventListener('storage', (e) => {
    if (e.key === 'forcarAtualizacaoAgenda' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            console.log("🔔 Forçando atualização da agenda via localStorage:", data);
            
            if (typeof atualizarHorarios === 'function') {
                const dataInput = document.getElementById("data");
                if (dataInput && dataInput.value === data.data) {
                    setTimeout(() => atualizarHorarios(), 200);
                }
            }
        } catch(e) {}
    }
    
    if (e.key === 'horarioLiberado' && e.newValue) {
        try {
            const data = JSON.parse(e.newValue);
            console.log("🔔 Horário liberado detectado em outra aba:", data);
            
            if (typeof mostrarMensagem === 'function') {
                mostrarMensagem(`🔓 Horário ${data.horario} foi liberado e está disponível!`, "sucesso");
            }
            
            if (typeof atualizarHorarios === 'function') {
                const dataInput = document.getElementById("data");
                if (dataInput && dataInput.value === data.data) {
                    setTimeout(() => atualizarHorarios(), 200);
                }
            }
        } catch(e) {}
    }
});

window.forcarRecarregamentoHorarios = function() {
    console.log("🔄 Forçando recarregamento dos horários...");
    if (typeof atualizarHorarios === 'function') {
        localStorage.removeItem('horariosCache');
        localStorage.removeItem('ultimaAtualizacaoHorarios');
        setTimeout(() => atualizarHorarios(), 200);
    }
};

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log("👁️ Página ficou visível, recarregando horários...");
        if (verificarCamposPreenchidos()) {
            setTimeout(() => atualizarHorarios(), 300);
        }
    }
});

console.log("✅ agendamento.js carregado com sucesso!");
console.log(`📋 Horários de atendimento: SEGUNDA à SÁBADO das ${horarioAbertura} às ${horarioFechamento}`);
console.log(`📋 Total de horários: ${horariosAtendimento.length} (intervalo de ${intervaloConfigurado} minutos)`);
console.log(`   🌅 Manhã (${horarioAbertura}-12:00): ${horariosManha.length} horários`);
console.log(`   ☀️ Tarde (12:00-19:00): ${horariosTarde.length} horários`);
console.log(`   🌙 Noite (19:00-${horarioFechamento}): ${horariosNoite.length} horários`);
console.log("🔒 Sistema de bloqueios integrado!");
console.log("👨‍👦 MODAL para seleção de múltiplos clientes com mesmo telefone!");
console.log("🔓 HORÁRIOS LIBERADOS: Agendamentos com horarioLiberado=true NÃO bloqueiam mais!");
console.log("✅ AGENDAMENTOS FINALIZADOS/CONCLUÍDOS NÃO LIBERAM O HORÁRIO!");
console.log("✅ Apenas CANCELADO, AUSENTE e horarioLiberado=true liberam o horário!");
console.log("⏳ LISTA DE ESPERA: Funcionalidade integrada com botão e modais!");
console.log("🔄 Função forcarRecarregamentoHorarios() disponível para debug!");