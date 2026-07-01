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
    Timestamp,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword
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
const db = getFirestore(app);
const auth = getAuth(app);

let profissionais = [];
let unsubscribeProfissionais = null;
let configLimites = null;

// Elementos DOM
const profissionaisGrid = document.getElementById('profissionaisGrid');
const searchInput = document.getElementById('searchProfissional');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovoProfissional = document.getElementById('btnNovoProfissional');
const modalProfissional = document.getElementById('modalProfissional');
const modalExcluir = document.getElementById('modalExcluir');
const modalAlterarSenha = document.getElementById('modalAlterarSenha');
const modalLimiteBarbeiros = document.getElementById('modalLimiteBarbeiros');
const formProfissional = document.getElementById('formProfissional');
const modalTitle = document.getElementById('modalTitle');
const profissionalId = document.getElementById('profissionalId');
const btnConfirmarExcluir = document.getElementById('confirmarExcluir');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let profissionalParaExcluir = null;

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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// ==================== FUNÇÕES DE LIMITE ====================

async function carregarConfiguracoesLimites() {
    try {
        const configRef = doc(db, "configuracoes", "limites");
        const configDoc = await getDoc(configRef);
        
        if (configDoc.exists()) {
            configLimites = configDoc.data();
            console.log("✅ Limite carregado:", configLimites?.maxBarbeiros);
        } else {
            configLimites = { maxBarbeiros: 3 };
            await setDoc(configRef, configLimites);
            console.log("✅ Config padrão criada: 3");
        }
        
        // Atualizar texto na tela
        const limiteMaximoEl = document.getElementById('limiteMaximoInfo');
        if (limiteMaximoEl) limiteMaximoEl.textContent = configLimites?.maxBarbeiros || 3;
        
        const limiteStatusEl = document.getElementById('limiteStatusInfo');
        const totalAtual = profissionais.length;
        const limite = configLimites?.maxBarbeiros || 3;
        
        if (limiteStatusEl) {
            if (totalAtual < limite) {
                limiteStatusEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> Você pode cadastrar mais ${limite - totalAtual} barbeiro(s).`;
                limiteStatusEl.style.color = "#10b981";
            } else {
                limiteStatusEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Limite atingido! Entre em contato com o suporte.`;
                limiteStatusEl.style.color = "#f59e0b";
            }
        }
        
        return configLimites;
    } catch (error) {
        console.error("Erro:", error);
        configLimites = { maxBarbeiros: 3 };
        return configLimites;
    }
}

function podeCadastrar() {
    const total = profissionais.length;
    const limite = configLimites?.maxBarbeiros || 3;
    return total < limite;
}

// Função para mostrar modal de limite (PADRONIZADA)
window.mostrarModalLimite = function() {
    console.log("📢 Abrindo modal de limite");
    const modal = document.getElementById('modalLimiteBarbeiros');
    if (modal) {
        const limiteMaximo = configLimites?.maxBarbeiros || 3;
        const totalAtual = profissionais.length;
        const limiteMaximoModal = document.getElementById('limiteMaximoModal');
        const limiteMensagem = document.querySelector('#modalLimiteBarbeiros .modal-message p:first-child');
        const limiteEmailSuporte = document.getElementById('limiteEmailSuporte');
        
        if (limiteMaximoModal) {
            limiteMaximoModal.textContent = limiteMaximo;
        }
        if (limiteMensagem) {
            limiteMensagem.innerHTML = `⚠️ Seu plano atual permite no máximo <strong style="color: #2199EF;">${limiteMaximo}</strong> barbeiros.`;
        }
        if (limiteEmailSuporte) {
            limiteEmailSuporte.textContent = configLimites?.emailSuporte || 'softpowersolucoesdigitais@gmail.com';
        }
        modal.classList.add('active');
    } else {
        mostrarToast(`Limite máximo de ${configLimites?.maxBarbeiros || 3} barbeiros atingido.`, "erro");
    }
};

window.fecharModalLimite = function() {
    const modal = document.getElementById('modalLimiteBarbeiros');
    if (modal) modal.classList.remove('active');
};

function atualizarBotaoNovoProfissional() {
    if (btnNovoProfissional) {
        const totalAtual = profissionais.length;
        const limiteMaximo = configLimites?.maxBarbeiros || 3;
        const podeCadastrar = totalAtual < limiteMaximo;
        
        btnNovoProfissional.disabled = false;
        
        if (!podeCadastrar) {
            btnNovoProfissional.title = `⚠️ Limite máximo de ${limiteMaximo} profissionais atingido. Clique para mais informações.`;
            btnNovoProfissional.style.opacity = "0.85";
        } else {
            btnNovoProfissional.title = `✓ Cadastrar novo profissional (${limiteMaximo - totalAtual} vagas restantes)`;
            btnNovoProfissional.style.opacity = "1";
        }
    }
}

// ==================== FIM LIMITE ====================

function carregarDados() {
    const q = query(collection(db, "profissionais"), orderBy("nome", "asc"));
    
    unsubscribeProfissionais = onSnapshot(q, async (snapshot) => {
        profissionais = [];
        snapshot.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        renderizarProfissionais();
        atualizarEstatisticas();
        await carregarConfiguracoesLimites();
        console.log("✅ Profissionais:", profissionais.length);
    }, (error) => {
        console.error("Erro ao carregar profissionais:", error);
    });
}

function renderizarProfissionais() {
    if (!profissionaisGrid) return;
    
    let filtered = [...profissionais];
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.nome?.toLowerCase().includes(searchTerm) ||
            p.especialidade?.toLowerCase().includes(searchTerm) ||
            p.email?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        profissionaisGrid.innerHTML = `
            <div class="empty-profissionais">
                <i class="fa-solid fa-users"></i>
                <p>Nenhum profissional encontrado</p>
                <button class="btn-primary" id="emptyBtnNovoProfissional">
                    <i class="fa-solid fa-plus"></i> Adicionar Profissional
                </button>
            </div>
        `;
        const emptyBtn = document.getElementById('emptyBtnNovoProfissional');
        if (emptyBtn) emptyBtn.addEventListener('click', () => abrirModalProfissional());
        return;
    }
    
    profissionaisGrid.innerHTML = filtered.map(prof => {
        const statusClass = prof.status === 'ativo' ? 'status-ativo' : 'status-inativo';
        const statusText = prof.status === 'ativo' ? 'Ativo' : 'Inativo';
        
        return `
            <div class="profissional-card" data-id="${prof.id}">
                <div class="profissional-header">
                    <div class="profissional-avatar">
                        <i class="fa-solid fa-user-md"></i>
                    </div>
                    <div class="profissional-info">
                        <h3>${escapeHtml(prof.nome)}</h3>
                        <span class="profissional-especialidade">${escapeHtml(prof.especialidade || 'Geral')}</span>
                    </div>
                    <div class="profissional-status ${statusClass}">${statusText}</div>
                </div>
                <div class="profissional-body">
                    <div class="profissional-detalhe">
                        <span class="label"><i class="fa-solid fa-envelope"></i> E-mail</span>
                        <span class="value">${escapeHtml(prof.email || 'Não informado')}</span>
                    </div>
                    <div class="profissional-detalhe">
                        <span class="label"><i class="fa-solid fa-phone"></i> Telefone</span>
                        <span class="value">${escapeHtml(prof.telefone || '-')}</span>
                    </div>
                    <div class="profissional-detalhe">
                        <span class="label"><i class="fa-solid fa-bullseye"></i> Meta Mensal</span>
                        <span class="value">${formatarMoeda(prof.metaMensal || 5000)}</span>
                    </div>
                    <div class="profissional-detalhe">
                        <span class="label"><i class="fa-solid fa-percent"></i> Comissão</span>
                        <span class="value">${prof.comissao || 30}%</span>
                    </div>
                    <div class="profissional-detalhe">
                        <span class="label"><i class="fa-solid fa-clock"></i> Horário</span>
                        <span class="value">${prof.horarioInicio || '09:00'} - ${prof.horarioFim || '18:00'}</span>
                    </div>
                </div>
                <div class="profissional-actions">
                    <button class="btn-edit-profissional" data-id="${prof.id}">
                        <i class="fa-regular fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn-password-profissional" data-id="${prof.id}" data-nome="${escapeHtml(prof.nome).replace(/'/g, "\\'")}" data-email="${escapeHtml(prof.email || '')}">
                        <i class="fa-solid fa-key"></i> Senha
                    </button>
                    <button class="btn-delete-profissional" data-id="${prof.id}" data-nome="${escapeHtml(prof.nome).replace(/'/g, "\\'")}">
                        <i class="fa-regular fa-trash-can"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-edit-profissional').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const profissional = profissionais.find(p => p.id === id);
            if (profissional) abrirModalProfissional(profissional);
        });
    });
    
    document.querySelectorAll('.btn-password-profissional').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            const email = btn.getAttribute('data-email');
            abrirModalAlterarSenha(id, nome, email);
        });
    });
    
    document.querySelectorAll('.btn-delete-profissional').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            abrirModalExcluir(id, nome);
        });
    });
}

function atualizarEstatisticas() {
    const total = profissionais.length;
    const ativos = profissionais.filter(p => p.status === 'ativo').length;
    
    const totalEl = document.getElementById('totalProfissionais');
    const ativosEl = document.getElementById('profissionaisAtivos');
    
    if (totalEl) totalEl.textContent = total;
    if (ativosEl) ativosEl.textContent = ativos;
}

async function salvarProfissional(dados) {
    try {
        await carregarConfiguracoesLimites();
        
        if (!dados.id && !podeCadastrar()) {
            window.mostrarModalLimite();
            return;
        }
        
        const profissionalData = {
            nome: dados.nome,
            telefone: dados.telefone,
            email: dados.email || null,
            especialidade: dados.especialidade || 'Geral',
            comissao: Number(dados.comissao) || 30,
            horarioInicio: dados.horarioInicio || '09:00',
            horarioFim: dados.horarioFim || '18:00',
            status: dados.status || 'ativo',
            metaMensal: Number(dados.metaMensal) || 5000,
            updatedAt: Timestamp.now()
        };
        
        if (dados.id) {
            await updateDoc(doc(db, "profissionais", dados.id), profissionalData);
            mostrarToast("Profissional atualizado com sucesso!");
        } else {
            profissionalData.createdAt = Timestamp.now();
            await addDoc(collection(db, "profissionais"), profissionalData);
            mostrarToast("Profissional adicionado com sucesso!");
        }
        
        fecharModalProfissional();
        await carregarConfiguracoesLimites();
        
    } catch (error) {
        console.error("Erro ao salvar:", error);
        mostrarToast("Erro ao salvar profissional.", "erro");
    }
}

async function deletarProfissional(id) {
    try {
        await deleteDoc(doc(db, "profissionais", id));
        mostrarToast("Profissional excluído com sucesso!");
        fecharModalExcluir();
        await carregarConfiguracoesLimites();
    } catch (error) {
        console.error("Erro ao excluir:", error);
        mostrarToast("Erro ao excluir profissional.", "erro");
    }
}

// Função para abrir modal
async function abrirModalProfissional(profissional = null) {
    console.log("🚀 Abrindo modal profissional...");
    
    if (!modalProfissional) {
        console.error("❌ Modal não encontrado!");
        mostrarToast("Erro ao abrir formulário.", "erro");
        return;
    }
    
    await carregarConfiguracoesLimites();
    
    const nomeInput = document.getElementById('profissionalNome');
    const telefoneInput = document.getElementById('profissionalTelefone');
    const emailInput = document.getElementById('profissionalEmail');
    const senhaInput = document.getElementById('profissionalSenha');
    const especialidadeSelect = document.getElementById('profissionalEspecialidade');
    const horarioInicioInput = document.getElementById('profissionalHorarioInicio');
    const horarioFimInput = document.getElementById('profissionalHorarioFim');
    const statusSelect = document.getElementById('profissionalStatus');
    const metaMensalInput = document.getElementById('profissionalMetaMensal');
    const comissaoInput = document.getElementById('profissionalComissao');
    
    if (profissional) {
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Editar Profissional';
        if (profissionalId) profissionalId.value = profissional.id;
        if (nomeInput) nomeInput.value = profissional.nome || '';
        if (telefoneInput) telefoneInput.value = profissional.telefone || '';
        if (emailInput) emailInput.value = profissional.email || '';
        if (senhaInput) senhaInput.value = '';
        if (especialidadeSelect) especialidadeSelect.value = profissional.especialidade || 'Geral';
        if (horarioInicioInput) horarioInicioInput.value = profissional.horarioInicio || '09:00';
        if (horarioFimInput) horarioFimInput.value = profissional.horarioFim || '18:00';
        if (statusSelect) statusSelect.value = profissional.status || 'ativo';
        if (metaMensalInput) metaMensalInput.value = profissional.metaMensal || 5000;
        if (comissaoInput) comissaoInput.value = profissional.comissao || 30;
        
        modalProfissional.classList.add('active');
    } else {
        if (!podeCadastrar()) {
            console.log("❌ Limite atingido, não pode cadastrar");
            window.mostrarModalLimite();
            return;
        }
        
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Profissional';
        if (profissionalId) profissionalId.value = '';
        if (formProfissional) formProfissional.reset();
        if (horarioInicioInput) horarioInicioInput.value = '09:00';
        if (horarioFimInput) horarioFimInput.value = '18:00';
        if (statusSelect) statusSelect.value = 'ativo';
        if (metaMensalInput) metaMensalInput.value = 5000;
        if (comissaoInput) comissaoInput.value = 30;
        if (especialidadeSelect) especialidadeSelect.value = 'Geral';
        
        modalProfissional.classList.add('active');
    }
}

function fecharModalProfissional() {
    if (modalProfissional) modalProfissional.classList.remove('active');
}

function abrirModalExcluir(id, nome) {
    profissionalParaExcluir = id;
    const excluirNome = document.getElementById('excluirNome');
    if (excluirNome) excluirNome.textContent = nome;
    if (modalExcluir) modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    if (modalExcluir) modalExcluir.classList.remove('active');
    profissionalParaExcluir = null;
}

function abrirModalAlterarSenha(id, nome, email) {
    const senhaProfissionalId = document.getElementById('senhaProfissionalId');
    const senhaProfissionalNome = document.getElementById('senhaProfissionalNome');
    const novoEmail = document.getElementById('novoEmail');
    const novaSenha = document.getElementById('novaSenha');
    const confirmarSenha = document.getElementById('confirmarSenha');
    
    if (senhaProfissionalId) senhaProfissionalId.value = id;
    if (senhaProfissionalNome) senhaProfissionalNome.value = nome;
    if (novoEmail) novoEmail.value = email || '';
    if (novaSenha) novaSenha.value = '';
    if (confirmarSenha) confirmarSenha.value = '';
    
    if (modalAlterarSenha) modalAlterarSenha.classList.add('active');
}

function fecharModalAlterarSenha() {
    if (modalAlterarSenha) modalAlterarSenha.classList.remove('active');
}

async function processarAlterarSenha() {
    const profissionalId = document.getElementById('senhaProfissionalId')?.value;
    const email = document.getElementById('novoEmail')?.value;
    const novaSenha = document.getElementById('novaSenha')?.value;
    const confirmarSenha = document.getElementById('confirmarSenha')?.value;
    
    if (!email) {
        mostrarToast("Informe o e-mail", "erro");
        return;
    }
    
    if (!novaSenha || novaSenha.length < 6) {
        mostrarToast("Senha deve ter no mínimo 6 caracteres", "erro");
        return;
    }
    
    if (novaSenha !== confirmarSenha) {
        mostrarToast("Senhas não coincidem", "erro");
        return;
    }
    
    try {
        await updateDoc(doc(db, "profissionais", profissionalId), { email: email });
        
        try {
            await createUserWithEmailAndPassword(auth, email, novaSenha);
            mostrarToast("Usuário criado com sucesso!", "sucesso");
        } catch (userError) {
            if (userError.code === 'auth/email-already-in-use') {
                mostrarToast("E-mail já cadastrado no sistema", "sucesso");
            } else {
                mostrarToast("Erro ao criar usuário: " + userError.message, "erro");
            }
        }
        
        fecharModalAlterarSenha();
        renderizarProfissionais();
    } catch (error) {
        console.error("Erro:", error);
        mostrarToast("Erro ao processar", "erro");
    }
}

function limparFiltros() {
    if (searchInput) searchInput.value = '';
    renderizarProfissionais();
}

// ==================== EVENT LISTENERS ====================

if (formProfissional) {
    formProfissional.addEventListener('submit', (e) => {
        e.preventDefault();
        const nome = document.getElementById('profissionalNome')?.value.trim();
        if (!nome) {
            mostrarToast("Informe o nome do profissional.", "erro");
            return;
        }
        
        salvarProfissional({
            id: profissionalId?.value,
            nome: nome,
            telefone: document.getElementById('profissionalTelefone')?.value,
            email: document.getElementById('profissionalEmail')?.value,
            senha: document.getElementById('profissionalSenha')?.value,
            metaMensal: document.getElementById('profissionalMetaMensal')?.value,
            comissao: document.getElementById('profissionalComissao')?.value,
            especialidade: document.getElementById('profissionalEspecialidade')?.value,
            horarioInicio: document.getElementById('profissionalHorarioInicio')?.value,
            horarioFim: document.getElementById('profissionalHorarioFim')?.value,
            status: document.getElementById('profissionalStatus')?.value
        });
    });
}

if (btnNovoProfissional) {
    const novoBtn = btnNovoProfissional.cloneNode(true);
    btnNovoProfissional.parentNode.replaceChild(novoBtn, btnNovoProfissional);
    
    novoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔘 Botão Novo Barbeiro clicado!");
        await abrirModalProfissional();
    });
}

if (btnConfirmarExcluir) {
    btnConfirmarExcluir.addEventListener('click', () => {
        if (profissionalParaExcluir) deletarProfissional(profissionalParaExcluir);
    });
}

if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', limparFiltros);
}

if (searchInput) {
    searchInput.addEventListener('input', renderizarProfissionais);
}

const formAlterarSenha = document.getElementById('formAlterarSenha');
if (formAlterarSenha) {
    formAlterarSenha.addEventListener('submit', (e) => {
        e.preventDefault();
        processarAlterarSenha();
    });
}

document.querySelectorAll('.modal-close, .modal-close-excluir, .btn-cancel, .btn-cancel-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalProfissional();
        fecharModalExcluir();
    });
});

document.querySelectorAll('.modal-close-senha, .btn-cancel-senha').forEach(btn => {
    btn.addEventListener('click', fecharModalAlterarSenha);
});

document.querySelectorAll('.modal-close-limite, .btn-cancel-limite').forEach(btn => {
    if (btn) {
        btn.addEventListener('click', window.fecharModalLimite);
    }
});

window.addEventListener('click', (e) => {
    if (e.target === modalProfissional) fecharModalProfissional();
    if (e.target === modalExcluir) fecharModalExcluir();
    if (e.target === modalAlterarSenha) fecharModalAlterarSenha();
    if (e.target === modalLimiteBarbeiros) window.fecharModalLimite();
});

// Expor funções globalmente
window.fecharModalLimite = window.fecharModalLimite;
window.mostrarModalLimite = window.mostrarModalLimite;

// Inicialização
(async function inicializar() {
    console.log("🔄 Inicializando sistema...");
    await carregarConfiguracoesLimites();
    carregarDados();
})();

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