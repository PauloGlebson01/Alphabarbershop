// equipes.js - Versão Corrigida (Botões de Editar e Excluir funcionando)
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

let profissionais = [];
let unsubscribeProfissionais = null;
let unsubscribeConfig = null;
let configLimites = null;

const profissionaisGrid = document.getElementById('profissionaisGrid');
const searchInput = document.getElementById('searchProfissional');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovoProfissional = document.getElementById('btnNovoProfissional');
const modalProfissional = document.getElementById('modalProfissional');
const modalExcluir = document.getElementById('modalExcluir');
const modalLimiteProfissionais = document.getElementById('modalLimiteProfissionais');
const formProfissional = document.getElementById('formProfissional');
const modalTitle = document.getElementById('modalTitle');
const profissionalId = document.getElementById('profissionalId');
const btnConfirmarExcluir = document.getElementById('confirmarExcluir');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

// Upload de imagem
const fotoInput = document.getElementById('fotoInput');
const fotoPreview = document.getElementById('fotoPreview');
const btnRemoverFoto = document.getElementById('btnRemoverFoto');

let profissionalParaExcluir = null;
let imagemAtual = null;

function mostrarToast(mensagem, tipo = 'sucesso') {
    if (!toastMsg) return;
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

// ==================== FUNÇÕES DE LIMITE ====================

function iniciarListenerConfiguracoes() {
    const configRef = doc(db, "configuracoes", "limites");
    
    unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
            configLimites = docSnap.data();
            console.log("🔄 [EQUIPES] Configurações atualizadas:", configLimites);
            
            atualizarCardInfoLimite();
            atualizarBotaoNovoProfissional();
            atualizarModalLimite();
        }
    }, (error) => {
        console.error("Erro no listener de configurações:", error);
    });
}

async function carregarConfiguracoesLimites() {
    try {
        const configRef = doc(db, "configuracoes", "limites");
        const configDoc = await getDoc(configRef);
        
        if (configDoc.exists()) {
            configLimites = configDoc.data();
            console.log("✅ [EQUIPES] Configurações carregadas:", configLimites);
        } else {
            configLimites = {
                maxBarbeiros: 3,
                maxProfissionais: 3,
                notificarSuporte: true,
                emailSuporte: "softpowersolucoesdigiitais@gmailcom",
                mensagemLimite: "Seu plano permite no máximo 3 profissionais. Entre em contato com o suporte para ampliar o plano.",
                mensagemBarbeiros: "Seu plano permite no máximo 3 barbeiros com acesso ao sistema."
            };
            await setDoc(configRef, configLimites);
            console.log("✅ Configurações padrão criadas");
        }
        
        atualizarCardInfoLimite();
        atualizarBotaoNovoProfissional();
        atualizarModalLimite();
        return configLimites;
    } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        configLimites = { 
            maxBarbeiros: 3,
            maxProfissionais: 3,
            emailSuporte: "softpowersolucoesdigitais@gmail.com",
            mensagemLimite: "Limite de profissionais atingido. Entre em contato com o suporte para ampliar o plano."
        };
        return configLimites;
    }
}

function verificarLimiteProfissionais() {
    const totalAtual = profissionais.length;
    const limiteMaximo = configLimites?.maxBarbeiros || 3;
    
    console.log(`📊 [EQUIPES] Verificando limite: ${totalAtual} de ${limiteMaximo}`);
    
    return {
        podeCadastrar: totalAtual < limiteMaximo,
        totalAtual: totalAtual,
        limiteMaximo: limiteMaximo,
        restantes: Math.max(0, limiteMaximo - totalAtual)
    };
}

function atualizarCardInfoLimite() {
    const limiteInfo = verificarLimiteProfissionais();
    
    const limiteMaximoEl = document.getElementById('limiteMaximoInfo');
    const limiteStatusEl = document.getElementById('limiteStatusInfo');
    
    if (limiteMaximoEl) {
        limiteMaximoEl.textContent = limiteInfo.limiteMaximo;
    }
    
    if (limiteStatusEl) {
        if (limiteInfo.podeCadastrar) {
            limiteStatusEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> Você pode cadastrar mais ${limiteInfo.restantes} profissional(is).`;
            limiteStatusEl.style.color = "#10b981";
        } else {
            limiteStatusEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Limite atingido! Entre em contato com o suporte.`;
            limiteStatusEl.style.color = "#f59e0b";
        }
    }
}

function atualizarModalLimite() {
    const limiteInfo = verificarLimiteProfissionais();
    const limiteMaximoModal = document.getElementById('limiteMaximoModal');
    
    if (limiteMaximoModal) {
        limiteMaximoModal.textContent = limiteInfo.limiteMaximo;
    }
}

window.mostrarModalLimite = function() {
    console.log("📢 [EQUIPES] Abrindo modal de limite");
    const modal = document.getElementById('modalLimiteProfissionais');
    if (modal) {
        carregarConfiguracoesLimites().then(() => {
            const limiteMaximo = configLimites?.maxBarbeiros || 3;
            const totalAtual = profissionais.length;
            const limiteMaximoModal = document.getElementById('limiteMaximoModal');
            const limiteEmailSuporte = document.getElementById('limiteEmailSuporteProfissionais');
            
            if (limiteMaximoModal) limiteMaximoModal.textContent = limiteMaximo;
            if (limiteEmailSuporte) {
                limiteEmailSuporte.textContent = configLimites?.emailSuporte || 'softpowersolucoesdigitais@gmail.com';
            }
            modal.classList.add('active');
        });
    } else {
        mostrarToast(`⚠️ Limite de profissionais atingido! Máximo de ${configLimites?.maxBarbeiros || 3} profissionais.`, "erro");
    }
};

window.fecharModalLimite = function() {
    const modal = document.getElementById('modalLimiteProfissionais');
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
            btnNovoProfissional.title = `Cadastrar novo profissional`;
            btnNovoProfissional.style.opacity = "1";
        }
    }
}

// ==================== FUNÇÕES DE IMAGEM ====================

async function redimensionarImagem(file, maxWidth = 200, maxHeight = 200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function atualizarPreviewImagem(base64) {
    if (fotoPreview) {
        fotoPreview.innerHTML = `<img src="${base64}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        fotoPreview.style.padding = '0';
    }
    imagemAtual = base64;
    if (btnRemoverFoto) btnRemoverFoto.style.display = 'flex';
}

function resetarPreviewImagem() {
    if (fotoPreview) {
        fotoPreview.innerHTML = '<i class="fa-solid fa-camera"></i><span>Clique para adicionar foto</span>';
        fotoPreview.style.padding = '20px';
    }
    imagemAtual = null;
    if (btnRemoverFoto) btnRemoverFoto.style.display = 'none';
}

function removerImagem() {
    resetarPreviewImagem();
    if (fotoInput) fotoInput.value = '';
}

// ==================== FUNÇÕES PRINCIPAIS ====================

function carregarDados() {
    console.log("🔄 Carregando profissionais...");
    
    const q = query(collection(db, "profissionais"), orderBy("nome", "asc"));
    
    unsubscribeProfissionais = onSnapshot(q, (snapshot) => {
        profissionais = [];
        snapshot.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        console.log("✅ Profissionais carregados:", profissionais.length);
        renderizarProfissionais();
        atualizarEstatisticas();
        
        atualizarBotaoNovoProfissional();
        atualizarCardInfoLimite();
        atualizarModalLimite();
        
    }, (error) => {
        console.error("Erro ao carregar profissionais:", error);
        if (profissionaisGrid) {
            profissionaisGrid.innerHTML = `
                <div class="empty-equipes">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar profissionais: ${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #2199EF; border: none; border-radius: 8px; color: white; cursor: pointer;">
                        <i class="fa-solid fa-rotate"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    });
}

function renderizarProfissionais() {
    if (!profissionaisGrid) return;
    
    let filtered = [...profissionais];
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    if (searchTerm) {
        filtered = filtered.filter(p =>
            p.nome?.toLowerCase().includes(searchTerm) ||
            p.cargo?.toLowerCase().includes(searchTerm) ||
            p.especialidades?.toLowerCase().includes(searchTerm) ||
            p.descricao?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        profissionaisGrid.innerHTML = `
            <div class="empty-equipes">
                <i class="fa-solid fa-user-plus"></i>
                <p>Nenhum profissional encontrado</p>
                <button class="btn-primary" id="emptyBtnNovoProfissional">
                    <i class="fa-solid fa-plus"></i> Adicionar Profissional
                </button>
            </div>
        `;
        
        const emptyBtn = document.getElementById('emptyBtnNovoProfissional');
        if (emptyBtn) {
            emptyBtn.addEventListener('click', () => abrirModalProfissional());
        }
        return;
    }
    
    profissionaisGrid.innerHTML = filtered.map(profissional => {
        const avaliacao = profissional.avaliacao || 5;
        const estrelasInteiras = Math.floor(avaliacao);
        const meiaEstrela = avaliacao % 1 >= 0.5;
        const estrelasVazias = 5 - estrelasInteiras - (meiaEstrela ? 1 : 0);
        
        let estrelasHtml = '';
        for (let i = 0; i < estrelasInteiras; i++) estrelasHtml += '<i class="fa-solid fa-star" style="color: #fbbf24;"></i>';
        if (meiaEstrela) estrelasHtml += '<i class="fa-solid fa-star-half-alt" style="color: #fbbf24;"></i>';
        for (let i = 0; i < estrelasVazias; i++) estrelasHtml += '<i class="fa-regular fa-star" style="color: #fbbf24;"></i>';
        
        const especialidadesArr = profissional.especialidades 
            ? profissional.especialidades.split(',').map(e => e.trim()).filter(e => e) 
            : [];
        
        const diasTrabalho = profissional.diasTrabalho || [];
        const diasSemana = {
            'segunda': 'Segunda',
            'terca': 'Terça',
            'quarta': 'Quarta',
            'quinta': 'Quinta',
            'sexta': 'Sexta',
            'sabado': 'Sábado',
            'domingo': 'Domingo'
        };
        const diasFormatados = diasTrabalho.map(dia => diasSemana[dia] || dia).join(', ');
        
        return `
            <div class="equipe-card" data-id="${profissional.id}">
                <div class="equipe-header">
                    <div class="equipe-avatar">
                        ${profissional.foto ? 
                            `<img src="${profissional.foto}" alt="${escapeHtml(profissional.nome)}" class="equipe-foto">` : 
                            `<div class="equipe-avatar-placeholder"><i class="fa-solid fa-user"></i></div>`
                        }
                    </div>
                    <div class="equipe-info">
                        <h3>${escapeHtml(profissional.nome)}</h3>
                        <span class="equipe-lider"><i class="fa-solid fa-briefcase"></i> ${escapeHtml(profissional.cargo || 'Barbeiro')}</span>
                    </div>
                </div>
                <div class="equipe-body">
                    ${profissional.descricao ? `
                        <div class="equipe-descricao">
                            <i class="fa-regular fa-message"></i> ${escapeHtml(profissional.descricao.substring(0, 100))}${profissional.descricao.length > 100 ? '...' : ''}
                        </div>
                    ` : ''}
                    
                    <div class="equipe-detalhe">
                        <span class="label"><i class="fa-solid fa-star"></i> Avaliação:</span>
                        <span class="value">${estrelasHtml} (${avaliacao.toFixed(1)})</span>
                    </div>
                    
                    ${profissional.experiencia ? `
                        <div class="equipe-detalhe">
                            <span class="label"><i class="fa-solid fa-calendar-alt"></i> Experiência:</span>
                            <span class="value">${profissional.experiencia} ${profissional.experiencia === 1 ? 'ano' : 'anos'}</span>
                        </div>
                    ` : ''}
                    
                    ${diasTrabalho.length > 0 ? `
                        <div class="equipe-detalhe">
                            <span class="label"><i class="fa-solid fa-calendar"></i> Dias:</span>
                            <span class="value">${diasFormatados}</span>
                        </div>
                    ` : ''}
                    
                    ${especialidadesArr.length > 0 ? `
                        <div class="membros-lista">
                            <h4><i class="fa-solid fa-tags"></i> Especialidades</h4>
                            <div class="membros-itens">
                                ${especialidadesArr.map(esp => `<span class="membro-tag"><i class="fa-solid fa-scissors"></i> ${escapeHtml(esp)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="equipe-actions">
                    <button class="btn-edit-equipe" data-id="${profissional.id}">
                        <i class="fa-regular fa-pen-to-square"></i> Editar
                    </button>
                    <button class="btn-delete-equipe" data-id="${profissional.id}" data-nome="${escapeHtml(profissional.nome).replace(/'/g, "\\'")}">
                        <i class="fa-regular fa-trash-can"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Adicionar event listeners diretamente (sem funções externas)
    document.querySelectorAll('.btn-edit-equipe').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const profissional = profissionais.find(p => p.id === id);
            if (profissional) {
                console.log("✏️ Editando profissional:", profissional.nome);
                abrirModalProfissional(profissional);
            }
        });
    });
    
    document.querySelectorAll('.btn-delete-equipe').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const nome = btn.getAttribute('data-nome');
            console.log("🗑️ Excluindo profissional:", nome);
            abrirModalExcluir(id, nome);
        });
    });
}

function atualizarEstatisticas() {
    const total = profissionais.length;
    const totalProfissionaisEl = document.getElementById('totalProfissionais');
    if (totalProfissionaisEl) totalProfissionaisEl.innerText = total;
    
    let somaAvaliacoes = 0;
    profissionais.forEach(p => {
        somaAvaliacoes += (p.avaliacao || 5);
    });
    const media = profissionais.length > 0 ? (somaAvaliacoes / profissionais.length).toFixed(1) : 0;
    const mediaAvaliacaoEl = document.getElementById('mediaAvaliacao');
    if (mediaAvaliacaoEl) mediaAvaliacaoEl.innerText = media;
    
    const especialidadesSet = new Set();
    profissionais.forEach(p => {
        if (p.especialidades) {
            p.especialidades.split(',').forEach(esp => {
                especialidadesSet.add(esp.trim().toLowerCase());
            });
        }
    });
    const totalEspecialidadesEl = document.getElementById('totalEspecialidades');
    if (totalEspecialidadesEl) totalEspecialidadesEl.innerText = especialidadesSet.size;
    
    let maisExperiente = null;
    let maiorExperiencia = 0;
    profissionais.forEach(p => {
        const exp = p.experiencia || 0;
        if (exp > maiorExperiencia) {
            maiorExperiencia = exp;
            maisExperiente = p;
        }
    });
    const nomeExperiente = maisExperiente ? (maisExperiente.nome.length > 25 ? maisExperiente.nome.substring(0, 22) + '...' : maisExperiente.nome) : '-';
    const tempoMedioEl = document.getElementById('tempoMedio');
    if (tempoMedioEl) {
        tempoMedioEl.innerHTML = nomeExperiente + (maiorExperiencia > 0 ? `<small style="display:block; font-size:0.6rem;">${maiorExperiencia} anos</small>` : '');
    }
}

// ==================== CRUD ====================

async function salvarProfissional(dados) {
    try {
        await carregarConfiguracoesLimites();
        
        if (!dados.id) {
            const limiteInfo = verificarLimiteProfissionais();
            if (!limiteInfo.podeCadastrar) {
                window.mostrarModalLimite();
                return;
            }
        }
        
        const profissionalData = {
            nome: dados.nome,
            cargo: dados.cargo,
            descricao: dados.descricao || '',
            especialidades: dados.especialidades || '',
            avaliacao: dados.avaliacao || 5,
            experiencia: dados.experiencia || null,
            diasTrabalho: dados.diasTrabalho || [],
            atualizadoEm: Timestamp.now()
        };
        
        if (imagemAtual) {
            profissionalData.foto = imagemAtual;
        }
        
        if (dados.id) {
            const docRef = doc(db, "profissionais", dados.id);
            await updateDoc(docRef, profissionalData);
            mostrarToast("Profissional atualizado com sucesso!");
        } else {
            profissionalData.createdAt = Timestamp.now();
            await addDoc(collection(db, "profissionais"), profissionalData);
            mostrarToast("Profissional criado com sucesso!");
        }
        fecharModalProfissional();
        
        await carregarConfiguracoesLimites();
        atualizarBotaoNovoProfissional();
        atualizarCardInfoLimite();
        atualizarModalLimite();
        
    } catch (error) {
        console.error("Erro ao salvar profissional:", error);
        mostrarToast("Erro ao salvar profissional: " + error.message, "erro");
    }
}

async function deletarProfissional(id) {
    try {
        await deleteDoc(doc(db, "profissionais", id));
        mostrarToast("Profissional excluído com sucesso!");
        fecharModalExcluir();
        
        await carregarConfiguracoesLimites();
        atualizarBotaoNovoProfissional();
        atualizarCardInfoLimite();
        atualizarModalLimite();
        
    } catch (error) {
        console.error("Erro ao excluir profissional:", error);
        mostrarToast("Erro ao excluir profissional.", "erro");
    }
}

// ==================== MODAIS ====================

function abrirModalProfissional(profissional = null) {
    if (!profissional) {
        const limiteInfo = verificarLimiteProfissionais();
        if (!limiteInfo.podeCadastrar) {
            window.mostrarModalLimite();
            return;
        }
    }
    
    resetarPreviewImagem();
    
    if (profissional) {
        modalTitle.innerHTML = '<i class="fa-regular fa-pen-to-square"></i> Editar Profissional';
        profissionalId.value = profissional.id;
        document.getElementById('profissionalNome').value = profissional.nome || '';
        document.getElementById('profissionalCargo').value = profissional.cargo || '';
        document.getElementById('profissionalDescricao').value = profissional.descricao || '';
        document.getElementById('profissionalEspecialidades').value = profissional.especialidades || '';
        document.getElementById('profissionalAvaliacao').value = profissional.avaliacao ?? 5;
        document.getElementById('profissionalExperiencia').value = profissional.experiencia || '';
        
        if (profissional.foto) {
            atualizarPreviewImagem(profissional.foto);
        }
        
        const diasTrabalho = profissional.diasTrabalho || [];
        document.querySelectorAll('.dia-trabalho').forEach(cb => {
            cb.checked = diasTrabalho.includes(cb.value);
        });
    } else {
        modalTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Profissional';
        profissionalId.value = '';
        formProfissional.reset();
        document.getElementById('profissionalAvaliacao').value = '5.0';
        document.querySelectorAll('.dia-trabalho').forEach(cb => cb.checked = false);
    }
    
    modalProfissional.classList.add('active');
}

function fecharModalProfissional() {
    modalProfissional.classList.remove('active');
    resetarPreviewImagem();
}

function abrirModalExcluir(id, nome) {
    profissionalParaExcluir = id;
    const excluirNome = document.getElementById('excluirNome');
    if (excluirNome) excluirNome.textContent = nome;
    modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    modalExcluir.classList.remove('active');
    profissionalParaExcluir = null;
}

function limparFiltros() {
    if (searchInput) searchInput.value = '';
    renderizarProfissionais();
}

// ==================== EVENT LISTENERS ====================

// Formulário
if (formProfissional) {
    formProfissional.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('profissionalNome').value.trim();
        const cargo = document.getElementById('profissionalCargo').value.trim();
        
        if (!nome) {
            mostrarToast("Informe o nome do profissional.", "erro");
            return;
        }
        
        if (!cargo) {
            mostrarToast("Informe a profissão/cargo do profissional.", "erro");
            return;
        }
        
        const diasTrabalho = [];
        document.querySelectorAll('.dia-trabalho:checked').forEach(cb => {
            diasTrabalho.push(cb.value);
        });
        
        salvarProfissional({
            id: profissionalId.value,
            nome: nome,
            cargo: cargo,
            descricao: document.getElementById('profissionalDescricao').value,
            especialidades: document.getElementById('profissionalEspecialidades').value,
            avaliacao: parseFloat(document.getElementById('profissionalAvaliacao').value),
            experiencia: parseInt(document.getElementById('profissionalExperiencia').value) || null,
            diasTrabalho: diasTrabalho
        });
    });
}

// Botão Novo Profissional
if (btnNovoProfissional) {
    const novoBtn = btnNovoProfissional.cloneNode(true);
    btnNovoProfissional.parentNode.replaceChild(novoBtn, btnNovoProfissional);
    
    novoBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("🔘 Botão Novo Profissional clicado");
        await carregarConfiguracoesLimites();
        abrirModalProfissional();
    });
}

// Botão Confirmar Excluir
if (btnConfirmarExcluir) {
    btnConfirmarExcluir.addEventListener('click', () => {
        if (profissionalParaExcluir) deletarProfissional(profissionalParaExcluir);
    });
}

// Botão Limpar Filtros
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener('click', limparFiltros);
}

// Input de busca
if (searchInput) {
    searchInput.addEventListener('input', () => renderizarProfissionais());
}

// Upload de imagem
if (fotoInput) {
    fotoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const isImage = file.type.startsWith('image/') || 
                       file.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);
        
        if (!isImage) {
            mostrarToast('Arquivo não é uma imagem válida', 'erro');
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            mostrarToast('Imagem muito grande (máximo 2MB)', 'erro');
            return;
        }
        
        try {
            const base64 = await redimensionarImagem(file, 200, 200, 0.8);
            atualizarPreviewImagem(base64);
            mostrarToast('Foto carregada com sucesso!', 'sucesso');
        } catch (error) {
            console.error('Erro ao processar imagem:', error);
            mostrarToast('Erro ao processar imagem', 'erro');
        }
    });
}

// Botão remover foto
if (btnRemoverFoto) {
    btnRemoverFoto.addEventListener('click', removerImagem);
}

// Fechar modais
document.querySelectorAll('.modal-close, .modal-close-excluir, .btn-cancel, .btn-cancel-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalProfissional();
        fecharModalExcluir();
    });
});

// Fechar modal de limite
document.querySelectorAll('.modal-close-limite, .btn-cancel-limite').forEach(btn => {
    if (btn) {
        btn.addEventListener('click', window.fecharModalLimite);
    }
});

// Fechar modais ao clicar fora
window.addEventListener('click', (e) => {
    if (e.target === modalProfissional) fecharModalProfissional();
    if (e.target === modalExcluir) fecharModalExcluir();
    if (e.target === modalLimiteProfissionais) window.fecharModalLimite();
});

// ==================== INICIALIZAÇÃO ====================

async function inicializar() {
    console.log("🔄 [EQUIPES] Inicializando sistema...");
    await carregarConfiguracoesLimites();
    iniciarListenerConfiguracoes();
    carregarDados();
}

inicializar();

// Autenticação
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}

// Expor funções globalmente
window.recarregarLimite = carregarConfiguracoesLimites;
window.fecharModalLimiteProfissionais = window.fecharModalLimite;
window.mostrarModalLimite = window.mostrarModalLimite;

console.log("equipes.js carregado com sucesso!");