import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    doc, 
    onSnapshot, 
    query, 
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

let clientes = [];
let aniversariantesOfertas = {};
let configOferta = null;
let unsubscribeClientes = null;

// Elementos DOM
const aniversariantesGrid = document.getElementById('aniversariantesGrid');
const searchInput = document.getElementById('searchAniversariante');
const filterPeriodo = document.getElementById('filterPeriodo');
const filterStatus = document.getElementById('filterStatus');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnEnviarLembretes = document.getElementById('btnEnviarLembretes');
const btnConfigOferta = document.getElementById('btnConfigOferta');
const modalOferta = document.getElementById('modalOferta');
const modalEnviarLembretes = document.getElementById('modalEnviarLembretes');
const modalOfertaCliente = document.getElementById('modalOfertaCliente');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let clienteSelecionado = null;

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

function formatarDataNascimentoDisplay(dataStr) {
    if (!dataStr) return '-';
    const partes = dataStr.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}`;
    }
    return dataStr;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function calcularDiasAteAniversario(dataNascimento) {
    if (!dataNascimento) return null;
    const partes = dataNascimento.split('-');
    if (partes.length !== 3) return null;
    
    const hoje = new Date();
    const diaNasc = parseInt(partes[2]);
    const mesNasc = parseInt(partes[1]);
    
    let proximoAniversario = new Date(hoje.getFullYear(), mesNasc - 1, diaNasc);
    
    if (proximoAniversario < hoje) {
        proximoAniversario = new Date(hoje.getFullYear() + 1, mesNasc - 1, diaNasc);
    }
    
    const diffTime = proximoAniversario - hoje;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function isAniversarianteHoje(dataNascimento) {
    if (!dataNascimento) return false;
    const hoje = new Date();
    const partes = dataNascimento.split('-');
    if (partes.length !== 3) return false;
    return hoje.getDate() === parseInt(partes[2]) && (hoje.getMonth() + 1) === parseInt(partes[1]);
}

function getPeriodoTitulo(dias) {
    if (dias === 0) return '🎂 Hoje!';
    if (dias === 1) return '🎉 Amanhã!';
    if (dias <= 7) return `📅 Em ${dias} dias`;
    if (dias <= 15) return `📅 Em ${dias} dias`;
    return `📅 Em ${dias} dias`;
}

function getStatusBadge(status) {
    const classes = {
        'pendente': 'status-pendente',
        'enviado': 'status-enviado',
        'agendado': 'status-agendado',
        'utilizado': 'status-utilizado'
    };
    const textos = {
        'pendente': '⏳ Pendente',
        'enviado': '✅ Enviado',
        'agendado': '📅 Agendado',
        'utilizado': '🎁 Utilizado'
    };
    return `<span class="status-badge ${classes[status] || 'status-pendente'}">${textos[status] || 'Pendente'}</span>`;
}

// Carregar clientes
function carregarClientes() {
    const q = query(collection(db, "clientes"));
    
    unsubscribeClientes = onSnapshot(q, (snapshot) => {
        clientes = [];
        snapshot.forEach(doc => {
            const cliente = { id: doc.id, ...doc.data() };
            if (cliente.nascimento) {
                clientes.push(cliente);
            }
        });
        carregarOfertas();
    });
}

// Carregar ofertas
async function carregarOfertas() {
    try {
        const snapshot = await getDocs(collection(db, "aniversariantes_ofertas"));
        aniversariantesOfertas = {};
        snapshot.forEach(doc => {
            aniversariantesOfertas[doc.data().clienteId] = { id: doc.id, ...doc.data() };
        });
        renderizarAniversariantes();
        atualizarEstatisticas();
    } catch (error) {
        console.error("Erro ao carregar ofertas:", error);
        renderizarAniversariantes();
        atualizarEstatisticas();
    }
}

// Carregar configuração padrão
async function carregarConfigOferta() {
    try {
        const snapshot = await getDocs(query(collection(db, "configuracoes"), where("__name__", "==", "oferta_aniversario")));
        if (!snapshot.empty) {
            configOferta = snapshot.docs[0].data();
            configOferta.id = snapshot.docs[0].id;
        } else {
            configOferta = {
                titulo: "🎂 Feliz Aniversário!",
                desconto: 15,
                validade: 7,
                mensagem: "Parabéns! Em seu aniversário, você ganha [DESCONTO]% de desconto em qualquer serviço. Válido por [VALIDADE] dias. Agende seu horário! ✂️💈",
                ativa: "sim"
            };
        }
    } catch (error) {
        console.error("Erro ao carregar config:", error);
        configOferta = { desconto: 15, validade: 7, ativa: "sim", mensagem: "" };
    }
}

function renderizarAniversariantes() {
    if (!aniversariantesGrid) return;
    
    let filtered = [...clientes];
    
    const periodo = filterPeriodo?.value || "semana";
    filtered = filtered.filter(cliente => {
        const dias = calcularDiasAteAniversario(cliente.nascimento);
        if (dias === null) return false;
        
        if (periodo === "hoje") return dias === 0;
        if (periodo === "semana") return dias >= 0 && dias <= 7;
        if (periodo === "mes") return dias >= 0 && dias <= 30;
        return true;
    });
    
    filtered.sort((a, b) => {
        const diasA = calcularDiasAteAniversario(a.nascimento) || 999;
        const diasB = calcularDiasAteAniversario(b.nascimento) || 999;
        return diasA - diasB;
    });
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(c => c.nome?.toLowerCase().includes(searchTerm));
    }
    
    const statusFilter = filterStatus?.value;
    if (statusFilter) {
        filtered = filtered.filter(c => {
            const oferta = aniversariantesOfertas[c.id];
            return oferta?.status === statusFilter;
        });
    }
    
    if (filtered.length === 0) {
        aniversariantesGrid.innerHTML = `
            <div class="empty-aniversariantes">
                <i class="fa-solid fa-gift"></i>
                <p>Nenhum aniversariante encontrado no período selecionado</p>
            </div>
        `;
        return;
    }
    
    aniversariantesGrid.innerHTML = filtered.map(cliente => {
        const dias = calcularDiasAteAniversario(cliente.nascimento);
        const oferta = aniversariantesOfertas[cliente.id];
        const desconto = oferta?.desconto || configOferta?.desconto || 15;
        const validade = oferta?.validade || configOferta?.validade || 7;
        const status = oferta?.status || "pendente";
        
        return `
            <div class="aniversariante-card" data-id="${cliente.id}">
                <div class="aniversariante-header">
                    <div class="aniversariante-info">
                        <h3>${escapeHtml(cliente.nome)}</h3>
                        <span class="aniversariante-dias">${getPeriodoTitulo(dias)}</span>
                    </div>
                    <div class="aniversariante-data">
                        <i class="fa-regular fa-calendar"></i> ${formatarDataNascimentoDisplay(cliente.nascimento)}
                    </div>
                </div>
                <div class="aniversariante-body">
                    <div class="aniversariante-info-row">
                        <span class="label"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>
                        <span class="value">${escapeHtml(cliente.telefone || '-')}</span>
                    </div>
                    <div class="aniversariante-info-row">
                        <span class="label"><i class="fa-regular fa-envelope"></i> E-mail</span>
                        <span class="value">${escapeHtml(cliente.email || '-')}</span>
                    </div>
                    <div class="oferta-badge">
                        <div class="desconto">🎁 ${desconto}% OFF</div>
                        <div class="validade">⏱️ Válido por ${validade} dias</div>
                        <div style="margin-top: 6px;">${getStatusBadge(status)}</div>
                    </div>
                </div>
                <div class="aniversariante-footer">
                    <button class="btn-enviar-oferta" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome).replace(/'/g, "\\'")}" data-telefone="${cliente.telefone || ''}">
                        <i class="fa-brands fa-whatsapp"></i> Enviar Oferta
                    </button>
                    <button class="btn-editar-oferta" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome).replace(/'/g, "\\'")}">
                        <i class="fa-regular fa-pen-to-square"></i> Editar
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-enviar-oferta').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            const telefone = btn.getAttribute('data-telefone');
            if (telefone) enviarOfertaWhatsApp(id, nome, telefone);
            else mostrarToast("Cliente não possui telefone cadastrado.", "erro");
        });
    });
    
    document.querySelectorAll('.btn-editar-oferta').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            abrirModalOfertaCliente(id, nome);
        });
    });
}

function atualizarEstatisticas() {
    const hoje = clientes.filter(c => isAniversarianteHoje(c.nascimento)).length;
    const semana = clientes.filter(c => {
        const dias = calcularDiasAteAniversario(c.nascimento);
        return dias !== null && dias >= 0 && dias <= 7;
    }).length;
    const mes = clientes.filter(c => {
        const dias = calcularDiasAteAniversario(c.nascimento);
        return dias !== null && dias >= 0 && dias <= 30;
    }).length;
    const enviados = Object.values(aniversariantesOfertas).filter(o => o.status === 'enviado').length;
    
    document.getElementById('hojeCount').textContent = hoje;
    document.getElementById('semanaCount').textContent = semana;
    document.getElementById('mesCount').textContent = mes;
    document.getElementById('enviadosCount').textContent = enviados;
}

function enviarOfertaWhatsApp(clienteId, nome, telefone) {
    const oferta = aniversariantesOfertas[clienteId];
    const desconto = oferta?.desconto || configOferta?.desconto || 15;
    const validade = oferta?.validade || configOferta?.validade || 7;
    
    let mensagem = configOferta?.mensagem || "Parabéns! Em seu aniversário, você ganha [DESCONTO]% de desconto. Válido por [VALIDADE] dias. ✂️💈";
    mensagem = mensagem.replace(/\[DESCONTO\]/g, desconto);
    mensagem = mensagem.replace(/\[VALIDADE\]/g, validade);
    
    const mensagemFinal = `🎂 *Feliz Aniversário, ${nome}!* 🎂\n\n${mensagem}\n\n📍 *Alpha BarberShop*`;
    
    const numeroLimpo = telefone.replace(/\D/g, "");
    let numeroFormatado = numeroLimpo;
    if (numeroFormatado.length === 10) {
        numeroFormatado = numeroFormatado.substring(0, 2) + '9' + numeroFormatado.substring(2);
    }
    
    const url = `https://wa.me/55${numeroFormatado}?text=${encodeURIComponent(mensagemFinal)}`;
    window.open(url, '_blank');
    
    salvarStatusEnvio(clienteId, 'enviado');
    mostrarToast(`Oferta enviada para ${nome}!`, "sucesso");
}

async function salvarStatusEnvio(clienteId, status) {
    try {
        if (aniversariantesOfertas[clienteId]) {
            await updateDoc(doc(db, "aniversariantes_ofertas", aniversariantesOfertas[clienteId].id), {
                status: status,
                dataEnvio: new Date().toISOString().split('T')[0],
                atualizadoEm: Timestamp.now()
            });
        } else {
            await addDoc(collection(db, "aniversariantes_ofertas"), {
                clienteId: clienteId,
                desconto: configOferta?.desconto || 15,
                validade: configOferta?.validade || 7,
                status: status,
                dataEnvio: new Date().toISOString().split('T')[0],
                createdAt: Timestamp.now(),
                atualizadoEm: Timestamp.now()
            });
        }
        carregarOfertas();
    } catch (error) {
        console.error("Erro ao salvar status:", error);
    }
}

async function salvarConfigOferta(dados) {
    try {
        const configRef = doc(db, "configuracoes", "oferta_aniversario");
        await updateDoc(configRef, {
            titulo: dados.titulo,
            desconto: Number(dados.desconto),
            validade: Number(dados.validade),
            mensagem: dados.mensagem,
            ativa: dados.ativa,
            atualizadoEm: Timestamp.now()
        });
        mostrarToast("Configuração salva com sucesso!");
        fecharModalOferta();
        carregarConfigOferta();
    } catch (error) {
        console.error("Erro ao salvar config:", error);
        mostrarToast("Erro ao salvar configuração.", "erro");
    }
}

async function salvarOfertaCliente(clienteId, dados) {
    try {
        if (aniversariantesOfertas[clienteId]) {
            await updateDoc(doc(db, "aniversariantes_ofertas", aniversariantesOfertas[clienteId].id), {
                desconto: Number(dados.desconto),
                validade: Number(dados.validade),
                status: dados.status,
                atualizadoEm: Timestamp.now()
            });
        } else {
            await addDoc(collection(db, "aniversariantes_ofertas"), {
                clienteId: clienteId,
                desconto: Number(dados.desconto),
                validade: Number(dados.validade),
                status: dados.status,
                createdAt: Timestamp.now(),
                atualizadoEm: Timestamp.now()
            });
        }
        mostrarToast("Oferta do cliente atualizada com sucesso!");
        fecharModalOfertaCliente();
        carregarOfertas();
    } catch (error) {
        console.error("Erro ao salvar oferta do cliente:", error);
        mostrarToast("Erro ao salvar oferta.", "erro");
    }
}

async function enviarLembretesEmMassa(antecedencia) {
    const clientesFiltrados = clientes.filter(cliente => {
        const dias = calcularDiasAteAniversario(cliente.nascimento);
        return dias !== null && dias === antecedencia && cliente.telefone;
    });
    
    let enviados = 0;
    for (const cliente of clientesFiltrados) {
        await enviarOfertaWhatsApp(cliente.id, cliente.nome, cliente.telefone);
        enviados++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    mostrarToast(`${enviados} lembretes enviados com sucesso!`, "sucesso");
}

function abrirModalOferta() {
    if (configOferta) {
        document.getElementById('ofertaTitulo').value = configOferta.titulo || '';
        document.getElementById('ofertaDesconto').value = configOferta.desconto || 15;
        document.getElementById('ofertaValidade').value = configOferta.validade || 7;
        document.getElementById('ofertaMensagem').value = configOferta.mensagem || '';
        document.getElementById('ofertaAtiva').value = configOferta.ativa || 'sim';
    }
    modalOferta.classList.add('active');
}

function fecharModalOferta() {
    modalOferta.classList.remove('active');
}

function abrirModalEnviarLembretes() {
    const antecedencia = parseInt(document.getElementById('lembreteAntecedencia').value);
    const qtd = clientes.filter(c => {
        const dias = calcularDiasAteAniversario(c.nascimento);
        return dias !== null && dias === antecedencia && c.telefone;
    }).length;
    document.getElementById('qtdLembretes').textContent = qtd;
    modalEnviarLembretes.classList.add('active');
}

function fecharModalEnviarLembretes() {
    modalEnviarLembretes.classList.remove('active');
}

function abrirModalOfertaCliente(id, nome) {
    clienteSelecionado = id;
    const oferta = aniversariantesOfertas[id];
    
    document.getElementById('clienteOfertaNome').textContent = nome;
    document.getElementById('clienteOfertaDesconto').value = oferta?.desconto || configOferta?.desconto || 15;
    document.getElementById('clienteOfertaValidade').value = oferta?.validade || configOferta?.validade || 7;
    document.getElementById('clienteOfertaStatus').value = oferta?.status || 'pendente';
    
    modalOfertaCliente.classList.add('active');
}

function fecharModalOfertaCliente() {
    modalOfertaCliente.classList.remove('active');
    clienteSelecionado = null;
}

// Event Listeners
if (btnConfigOferta) btnConfigOferta.addEventListener('click', abrirModalOferta);
if (btnEnviarLembretes) btnEnviarLembretes.addEventListener('click', abrirModalEnviarLembretes);
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (filterPeriodo) filterPeriodo.value = 'semana';
        if (filterStatus) filterStatus.value = '';
        renderizarAniversariantes();
    });
}
if (searchInput) searchInput.addEventListener('input', renderizarAniversariantes);
if (filterPeriodo) filterPeriodo.addEventListener('change', renderizarAniversariantes);
if (filterStatus) filterStatus.addEventListener('change', renderizarAniversariantes);

document.getElementById('btnSalvarOferta')?.addEventListener('click', () => {
    salvarConfigOferta({
        titulo: document.getElementById('ofertaTitulo').value,
        desconto: document.getElementById('ofertaDesconto').value,
        validade: document.getElementById('ofertaValidade').value,
        mensagem: document.getElementById('ofertaMensagem').value,
        ativa: document.getElementById('ofertaAtiva').value
    });
});

document.getElementById('btnConfirmarEnvio')?.addEventListener('click', () => {
    const antecedencia = parseInt(document.getElementById('lembreteAntecedencia').value);
    enviarLembretesEmMassa(antecedencia);
    fecharModalEnviarLembretes();
});

document.getElementById('btnSalvarOfertaCliente')?.addEventListener('click', () => {
    if (clienteSelecionado) {
        salvarOfertaCliente(clienteSelecionado, {
            desconto: document.getElementById('clienteOfertaDesconto').value,
            validade: document.getElementById('clienteOfertaValidade').value,
            status: document.getElementById('clienteOfertaStatus').value
        });
    }
});

document.getElementById('btnEnviarIndividual')?.addEventListener('click', () => {
    if (clienteSelecionado) {
        const cliente = clientes.find(c => c.id === clienteSelecionado);
        if (cliente && cliente.telefone) {
            enviarOfertaWhatsApp(cliente.id, cliente.nome, cliente.telefone);
            fecharModalOfertaCliente();
        } else {
            mostrarToast("Cliente não possui telefone cadastrado.", "erro");
        }
    }
});

document.getElementById('lembreteAntecedencia')?.addEventListener('change', () => {
    const antecedencia = parseInt(document.getElementById('lembreteAntecedencia').value);
    const qtd = clientes.filter(c => {
        const dias = calcularDiasAteAniversario(c.nascimento);
        return dias !== null && dias === antecedencia && c.telefone;
    }).length;
    document.getElementById('qtdLembretes').textContent = qtd;
});

document.querySelectorAll('.modal-close-oferta, .btn-cancel-oferta').forEach(btn => {
    if (btn) btn.addEventListener('click', fecharModalOferta);
});
document.querySelectorAll('.modal-close-enviar, .btn-cancel-enviar').forEach(btn => {
    if (btn) btn.addEventListener('click', fecharModalEnviarLembretes);
});
document.querySelectorAll('.modal-close-cliente, .btn-cancel-cliente').forEach(btn => {
    if (btn) btn.addEventListener('click', fecharModalOfertaCliente);
});

window.addEventListener('click', (e) => {
    if (e.target === modalOferta) fecharModalOferta();
    if (e.target === modalEnviarLembretes) fecharModalEnviarLembretes();
    if (e.target === modalOfertaCliente) fecharModalOfertaCliente();
});

// Inicialização
carregarClientes();
carregarConfigOferta();

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