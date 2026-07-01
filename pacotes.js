// pacotes.js - Versão com suporte a múltiplas quantidades do mesmo serviço
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc,
    doc, 
    getDocs, 
    onSnapshot,
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

let pacotes = [];
let servicos = [];
let pacoteParaExcluir = null;
let imagemUploadFile = null;
let servicosSelecionadosTemp = new Map();

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function mostrarToast(mensagem, tipo = 'sucesso') {
    let toast = document.getElementById('toastPacote');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastPacote';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.innerHTML = `<i class="fa-solid ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i><span>${mensagem}</span>`;
    toast.style.background = tipo === 'sucesso' ? 'linear-gradient(135deg, #2199EF, #1a7fcc)' : 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function converterImagemParaBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getCorPorNome(nome) {
    const cores = ['#2199EF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    let hash = 0;
    for (let i = 0; i < nome.length; i++) {
        hash = ((hash << 5) - hash) + nome.charCodeAt(i);
        hash |= 0;
    }
    return cores[Math.abs(hash) % cores.length];
}

async function carregarServicos() {
    try {
        const servicosRef = collection(db, "servicos");
        const snapshot = await getDocs(servicosRef);
        servicos = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            servicos.push({ id: doc.id, nome: data.nome || 'Serviço sem nome', preco: data.preco || 0 });
        });
        console.log("📦 Serviços carregados:", servicos.length);
        return servicos;
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        return [];
    }
}

function carregarPacotes() {
    const pacotesRef = collection(db, "pacotes");
    onSnapshot(pacotesRef, (snapshot) => {
        pacotes = [];
        snapshot.forEach(doc => { pacotes.push({ id: doc.id, ...doc.data() }); });
        renderizarPacotes();
        atualizarEstatisticas();
    }, (error) => console.error("Erro ao carregar pacotes:", error));
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderizarPacotes() {
    const filtroStatus = document.getElementById('filtroStatus')?.value || 'todos';
    const busca = document.getElementById('buscaPacote')?.value.toLowerCase() || '';
    
    let pacotesFiltrados = pacotes.filter(pacote => {
        if (filtroStatus !== 'todos' && pacote.status !== filtroStatus) return false;
        if (busca && !pacote.nome.toLowerCase().includes(busca)) return false;
        return true;
    });
    
    const grid = document.getElementById('pacotesGrid');
    if (!grid) return;
    
    if (pacotesFiltrados.length === 0) {
        grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-box-open"></i><p>Nenhum pacote encontrado</p><p style="font-size: 0.8rem; margin-top: 8px;">Clique em "Novo Pacote" para começar</p></div>';
        return;
    }
    
    grid.innerHTML = pacotesFiltrados.map(pacote => {
        const corIcone = getCorPorNome(pacote.nome);
        const temImagem = pacote.imagemBase64 || (pacote.imagem && pacote.imagem !== './assets/barber-perfil.jfif');
        
        let servicosHtml = '';
        if (pacote.servicos && pacote.servicos.length > 0) {
            servicosHtml = pacote.servicos.map(s => {
                const nomeServico = s.nome || (s.servico && s.servico.nome) || 'Serviço';
                const quantidade = s.quantidade || 1;
                return `<span class="servico-tag">${quantidade}x ${escapeHtml(nomeServico)}</span>`;
            }).join('');
        }
        
        return `
        <div class="pacote-card ${pacote.status === 'inativo' ? 'inativo' : ''}">
            <div class="pacote-status ${pacote.status === 'ativo' ? 'status-ativo' : 'status-inativo'}">
                ${pacote.status === 'ativo' ? '✓ Ativo' : '✗ Inativo'}
            </div>
            <div class="pacote-imagem-container">
                ${temImagem ? 
                    `<img src="${pacote.imagemBase64 || pacote.imagem}" class="pacote-imagem" alt="${escapeHtml(pacote.nome)}" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'pacote-imagem-placeholder\\' style=\\'background: linear-gradient(135deg, ${corIcone}, ${corIcone}88);\\'><i class=\\'fa-solid fa-gift\\' style=\\'font-size: 2.5rem; color: white;\\'></i></div>'">` : 
                    `<div class="pacote-imagem-placeholder" style="background: linear-gradient(135deg, ${corIcone}, ${corIcone}88);">
                        <i class="fa-solid fa-gift" style="font-size: 2.5rem; color: white;"></i>
                    </div>`
                }
            </div>
            <div class="pacote-info">
                <h3 class="pacote-nome">${escapeHtml(pacote.nome)}</h3>
                <p class="pacote-descricao">${escapeHtml(pacote.descricao || 'Sem descrição')}</p>
                <div class="servicos-inclusos">
                    <h4><i class="fa-solid fa-scissors"></i> Serviços Inclusos</h4>
                    <div class="servicos-lista">
                        ${servicosHtml || 'Nenhum serviço'}
                    </div>
                </div>
                <div class="pacote-precos">
                    <div>
                        <span class="preco-original">De: ${formatarMoeda(pacote.precoOriginal)}</span>
                        <div class="preco-promocional">Por: ${formatarMoeda(pacote.preco)}</div>
                    </div>
                    ${pacote.desconto ? `<span class="desconto-badge">-${pacote.desconto}% OFF</span>` : ''}
                </div>
                <div class="pacote-acoes">
                    <button class="btn-vender-pacote" data-pacote-id="${pacote.id}"><i class="fa-solid fa-cart-shopping"></i> Vender</button>
                    <button class="btn-editar-pacote" data-pacote-id="${pacote.id}"><i class="fa-solid fa-pen"></i> Editar</button>
                    <button class="btn-excluir-pacote" data-pacote-id="${pacote.id}" data-pacote-nome="${escapeHtml(pacote.nome).replace(/'/g, "\\'")}"><i class="fa-solid fa-trash"></i> Excluir</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    document.querySelectorAll('.btn-vender-pacote').forEach(btn => {
        btn.removeEventListener('click', venderPacoteHandler);
        btn.addEventListener('click', venderPacoteHandler);
    });
    document.querySelectorAll('.btn-editar-pacote').forEach(btn => {
        btn.removeEventListener('click', editarPacoteHandler);
        btn.addEventListener('click', editarPacoteHandler);
    });
    document.querySelectorAll('.btn-excluir-pacote').forEach(btn => {
        btn.removeEventListener('click', excluirPacoteHandler);
        btn.addEventListener('click', excluirPacoteHandler);
    });
}

function venderPacoteHandler(e) { venderPacote(e.currentTarget.getAttribute('data-pacote-id')); }
function editarPacoteHandler(e) { editarPacote(e.currentTarget.getAttribute('data-pacote-id')); }
function excluirPacoteHandler(e) { 
    const btn = e.currentTarget;
    excluirPacote(btn.getAttribute('data-pacote-id'), btn.getAttribute('data-pacote-nome'));
}

async function venderPacote(pacoteId) {
    const pacote = pacotes.find(p => p.id === pacoteId);
    if (!pacote) {
        mostrarToast('❌ Pacote não encontrado!', 'erro');
        return;
    }
    
    if (!pacote.servicos || pacote.servicos.length === 0) {
        mostrarToast('⚠️ Este pacote não possui serviços. Edite e adicione serviços.', 'erro');
        return;
    }
    
    const servicosNomes = pacote.servicos.map(s => `${s.quantidade || 1}x ${s.nome || s.servico?.nome}`);
    const servicosParam = encodeURIComponent(servicosNomes.join(','));
    const url = `agendamento.html?pacote=${encodeURIComponent(pacote.nome)}&servicos=${servicosParam}&precoTotal=${pacote.preco}&pacoteId=${pacote.id}`;
    
    window.location.href = url;
}

async function editarPacote(pacoteId) {
    const pacote = pacotes.find(p => p.id === pacoteId);
    if (!pacote) return;
    
    await carregarServicos();
    
    document.getElementById('pacoteId').value = pacote.id;
    document.getElementById('pacoteNome').value = pacote.nome;
    document.getElementById('pacoteDescricao').value = pacote.descricao || '';
    document.getElementById('pacotePreco').value = pacote.preco;
    document.getElementById('pacoteValidade').value = pacote.validade || 30;
    document.getElementById('pacoteStatus').value = pacote.status;
    document.getElementById('pacoteDesconto').value = pacote.desconto || '0';
    imagemUploadFile = null;
    
    servicosSelecionadosTemp.clear();
    if (pacote.servicos) {
        pacote.servicos.forEach(servico => {
            servicosSelecionadosTemp.set(servico.servicoId || servico.id, {
                quantidade: servico.quantidade || 1,
                servico: servico
            });
        });
    }
    
    preencherListaServicosComQuantidade();
    
    document.getElementById('modalTitle').textContent = 'Editar Pacote';
    document.getElementById('modalPacote').style.display = 'flex';
}

function excluirPacote(id, nome) {
    pacoteParaExcluir = id;
    document.getElementById('excluirPacoteNome').textContent = nome;
    document.getElementById('modalExcluirPacote').style.display = 'flex';
}

function fecharModalExcluirPacote() {
    document.getElementById('modalExcluirPacote').style.display = 'none';
    pacoteParaExcluir = null;
}

async function deletarPacote(id) {
    if (!id) return;
    try {
        await deleteDoc(doc(db, "pacotes", id));
        mostrarToast("✅ Pacote excluído com sucesso!");
        fecharModalExcluirPacote();
    } catch (error) {
        mostrarToast("❌ Erro ao excluir pacote: " + error.message, "erro");
    }
}

function preencherListaServicosComQuantidade() {
    const servicosLista = document.getElementById('servicosLista');
    if (!servicosLista) return;
    
    servicosLista.innerHTML = '';
    
    if (!servicos || servicos.length === 0) {
        servicosLista.innerHTML = `
            <div class="empty-servicos-msg">
                <i class="fa-solid fa-cut"></i>
                <p>Nenhum serviço cadastrado</p>
                <p style="font-size: 0.7rem; margin-top: 8px;">Cadastre serviços primeiro em "Serviços"</p>
            </div>`;
        return;
    }
    
    const header = document.createElement('div');
    header.className = 'servicos-table-header';
    header.innerHTML = `
        <span><i class="fa-regular fa-square-check"></i></span>
        <span>Serviço</span>
        <span>Valor Unit.</span>
        <span>Quantidade</span>
        <span>Subtotal</span>
    `;
    servicosLista.appendChild(header);
    
    servicos.forEach(servico => {
        const selecionado = servicosSelecionadosTemp.get(servico.id);
        const quantidade = selecionado ? selecionado.quantidade : 0;
        const subtotal = servico.preco * quantidade;
        
        const row = document.createElement('div');
        row.className = 'servico-table-row';
        row.setAttribute('data-servico-id', servico.id);
        row.innerHTML = `
            <input type="checkbox" class="servico-checkbox" value="${servico.id}" data-preco="${servico.preco}" data-nome="${escapeHtml(servico.nome)}" ${quantidade > 0 ? 'checked' : ''}>
            <div class="servico-info">
                <div class="servico-nome">${escapeHtml(servico.nome)}</div>
                <div class="servico-preco-unitario"><span class="servico-preco-label">por serviço</span></div>
            </div>
            <div class="servico-valor-unitario">${formatarMoeda(servico.preco)}</div>
            <div class="servico-quantidade-control">
                <button type="button" class="btn-quantidade" data-servico-id="${servico.id}" data-op="minus" ${quantidade === 0 ? 'disabled' : ''}>−</button>
                <span class="quantidade-valor" data-servico-id="${servico.id}">${quantidade}</span>
                <button type="button" class="btn-quantidade" data-servico-id="${servico.id}" data-op="plus">+</button>
            </div>
            <div class="servico-subtotal" data-servico-id="${servico.id}">${formatarMoeda(subtotal)}</div>
        `;
        servicosLista.appendChild(row);
    });
    
    const footer = document.createElement('div');
    footer.className = 'servicos-table-footer';
    footer.id = 'servicosTableFooter';
    servicosLista.appendChild(footer);
    
    document.querySelectorAll('.btn-quantidade').forEach(btn => {
        btn.removeEventListener('click', handleQuantidadeClick);
        btn.addEventListener('click', handleQuantidadeClick);
    });
    
    document.querySelectorAll('.servico-checkbox').forEach(checkbox => {
        checkbox.removeEventListener('change', handleCheckboxChange);
        checkbox.addEventListener('change', handleCheckboxChange);
    });
    
    atualizarTotais();
}

function handleQuantidadeClick(e) {
    e.preventDefault();
    const servicoId = e.currentTarget.getAttribute('data-servico-id');
    const operacao = e.currentTarget.getAttribute('data-op');
    const checkbox = document.querySelector(`.servico-checkbox[value="${servicoId}"]`);
    
    let selecionado = servicosSelecionadosTemp.get(servicoId);
    let novaQuantidade = selecionado ? selecionado.quantidade : 0;
    
    if (operacao === 'plus') {
        novaQuantidade++;
        if (!selecionado) {
            servicosSelecionadosTemp.set(servicoId, { quantidade: 1, servico: null });
        } else {
            selecionado.quantidade = novaQuantidade;
        }
        if (checkbox && !checkbox.checked) checkbox.checked = true;
    } else if (operacao === 'minus' && novaQuantidade > 0) {
        novaQuantidade--;
        if (novaQuantidade === 0) {
            servicosSelecionadosTemp.delete(servicoId);
            if (checkbox) checkbox.checked = false;
        } else if (selecionado) {
            selecionado.quantidade = novaQuantidade;
        }
    }
    
    const quantidadeSpan = document.querySelector(`.quantidade-valor[data-servico-id="${servicoId}"]`);
    if (quantidadeSpan) quantidadeSpan.textContent = novaQuantidade;
    
    const btnMinus = document.querySelector(`.btn-quantidade[data-servico-id="${servicoId}"][data-op="minus"]`);
    if (btnMinus) btnMinus.disabled = novaQuantidade === 0;
    
    const servico = servicos.find(s => s.id === servicoId);
    const subtotal = servico ? servico.preco * novaQuantidade : 0;
    
    const subtotalSpan = document.querySelector(`.servico-subtotal[data-servico-id="${servicoId}"]`);
    if (subtotalSpan) subtotalSpan.textContent = formatarMoeda(subtotal);
    
    atualizarTotais();
}

function handleCheckboxChange(e) {
    const servicoId = e.currentTarget.value;
    const isChecked = e.currentTarget.checked;
    const servico = servicos.find(s => s.id === servicoId);
    
    if (isChecked) {
        if (!servicosSelecionadosTemp.has(servicoId)) {
            servicosSelecionadosTemp.set(servicoId, { quantidade: 1, servico: servico });
        }
        const quantidadeSpan = document.querySelector(`.quantidade-valor[data-servico-id="${servicoId}"]`);
        if (quantidadeSpan && quantidadeSpan.textContent === '0') {
            quantidadeSpan.textContent = '1';
        }
        const btnMinus = document.querySelector(`.btn-quantidade[data-servico-id="${servicoId}"][data-op="minus"]`);
        if (btnMinus) btnMinus.disabled = false;
    } else {
        servicosSelecionadosTemp.delete(servicoId);
        const quantidadeSpan = document.querySelector(`.quantidade-valor[data-servico-id="${servicoId}"]`);
        if (quantidadeSpan) quantidadeSpan.textContent = '0';
        const btnMinus = document.querySelector(`.btn-quantidade[data-servico-id="${servicoId}"][data-op="minus"]`);
        if (btnMinus) btnMinus.disabled = true;
    }
    
    const subtotal = servico ? servico.preco * (servicosSelecionadosTemp.get(servicoId)?.quantidade || 0) : 0;
    const subtotalSpan = document.querySelector(`.servico-subtotal[data-servico-id="${servicoId}"]`);
    if (subtotalSpan) subtotalSpan.textContent = formatarMoeda(subtotal);
    
    atualizarTotais();
}

function calcularPrecoOriginalTotal() {
    let total = 0;
    for (const [servicoId, data] of servicosSelecionadosTemp) {
        const servico = servicos.find(s => s.id === servicoId);
        if (servico) {
            total += servico.preco * data.quantidade;
        }
    }
    return total;
}

function atualizarTotais() {
    const totalOriginal = calcularPrecoOriginalTotal();
    const precoPacoteInput = document.getElementById('pacotePreco');
    const descontoInput = document.getElementById('pacoteDesconto');
    
    let precoAtual = parseFloat(precoPacoteInput?.value);
    if (isNaN(precoAtual)) precoAtual = totalOriginal;
    
    let descontoPercentual = 0;
    if (totalOriginal > 0 && precoAtual < totalOriginal) {
        descontoPercentual = ((totalOriginal - precoAtual) / totalOriginal * 100);
        if (descontoInput) descontoInput.value = descontoPercentual.toFixed(1);
    } else if (precoAtual >= totalOriginal) {
        if (descontoInput) descontoInput.value = '0';
    }
    
    const economia = totalOriginal - precoAtual;
    
    const footer = document.getElementById('servicosTableFooter');
    if (footer) {
        footer.innerHTML = `
            <div class="total-info">
                <div class="total-item">
                    <span class="label">📦 Valor total original:</span>
                    <span class="total-original">${formatarMoeda(totalOriginal)}</span>
                </div>
                ${economia > 0 ? `
                <div class="total-item">
                    <span class="label">🏷️ Desconto:</span>
                    <span class="total-desconto">${descontoPercentual.toFixed(1)}% (Economize ${formatarMoeda(economia)})</span>
                </div>
                ` : ''}
                <div class="total-item">
                    <span class="label">💎 Preço do pacote:</span>
                    <span class="total-pacote">${formatarMoeda(precoAtual)}</span>
                </div>
            </div>
        `;
    }
}

function aplicarDescontoPercentual() {
    const totalOriginal = calcularPrecoOriginalTotal();
    const desconto = parseFloat(document.getElementById('pacoteDesconto')?.value) || 0;
    const precoInput = document.getElementById('pacotePreco');
    
    if (totalOriginal > 0 && desconto > 0) {
        const novoPreco = totalOriginal * (1 - desconto / 100);
        if (precoInput) precoInput.value = novoPreco.toFixed(2);
    } else if (desconto === 0 && totalOriginal > 0) {
        if (precoInput) precoInput.value = totalOriginal.toFixed(2);
    }
    
    atualizarTotais();
}

function handlePrecoManualChange() {
    const totalOriginal = calcularPrecoOriginalTotal();
    const precoInput = document.getElementById('pacotePreco');
    const precoAtual = parseFloat(precoInput?.value);
    
    if (!isNaN(precoAtual) && totalOriginal > 0 && precoAtual > totalOriginal) {
        precoInput.value = totalOriginal.toFixed(2);
    }
    
    atualizarTotais();
}

// Event Listeners
document.getElementById('btnNovoPacote')?.addEventListener('click', async () => {
    document.getElementById('pacoteId').value = '';
    document.getElementById('pacoteNome').value = '';
    document.getElementById('pacoteDescricao').value = '';
    document.getElementById('pacotePreco').value = '';
    document.getElementById('pacoteValidade').value = '30';
    document.getElementById('pacoteStatus').value = 'ativo';
    document.getElementById('pacoteDesconto').value = '0';
    document.getElementById('pacoteImagem').value = '';
    imagemUploadFile = null;
    servicosSelecionadosTemp.clear();
    
    await carregarServicos();
    preencherListaServicosComQuantidade();
    
    document.getElementById('modalTitle').textContent = 'Criar Novo Pacote';
    document.getElementById('modalPacote').style.display = 'flex';
});

document.getElementById('pacotePreco')?.addEventListener('input', handlePrecoManualChange);
document.getElementById('pacoteDesconto')?.addEventListener('input', aplicarDescontoPercentual);
document.getElementById('pacoteImagem')?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        imagemUploadFile = e.target.files[0];
        mostrarToast('Imagem selecionada: ' + imagemUploadFile.name, 'sucesso');
    }
});

document.getElementById('formPacote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const servicosParaSalvar = [];
    for (const [servicoId, data] of servicosSelecionadosTemp) {
        const servico = servicos.find(s => s.id === servicoId);
        if (servico && data.quantidade > 0) {
            servicosParaSalvar.push({
                id: servicoId,
                servicoId: servicoId,
                nome: servico.nome,
                quantidade: data.quantidade,
                precoUnitario: servico.preco,
                subtotal: servico.preco * data.quantidade
            });
        }
    }
    
    if (servicosParaSalvar.length === 0) {
        mostrarToast('⚠️ Selecione pelo menos um serviço!', 'erro');
        return;
    }
    
    const precoOriginal = calcularPrecoOriginalTotal();
    const precoPacote = parseFloat(document.getElementById('pacotePreco').value);
    
    if (isNaN(precoPacote) || precoPacote <= 0) {
        mostrarToast('⚠️ Informe um preço válido para o pacote!', 'erro');
        return;
    }
    
    if (precoPacote > precoOriginal) {
        mostrarToast('⚠️ O preço do pacote não pode ser maior que a soma dos serviços!', 'erro');
        return;
    }
    
    let imagemBase64 = null;
    if (imagemUploadFile) {
        try {
            imagemBase64 = await converterImagemParaBase64(imagemUploadFile);
        } catch (error) {
            console.error("Erro ao converter imagem:", error);
        }
    }
    
    const pacoteData = {
        nome: document.getElementById('pacoteNome').value,
        descricao: document.getElementById('pacoteDescricao').value,
        servicos: servicosParaSalvar,
        precoOriginal: precoOriginal,
        preco: precoPacote,
        desconto: parseFloat(document.getElementById('pacoteDesconto').value) || 0,
        validade: parseInt(document.getElementById('pacoteValidade').value),
        status: document.getElementById('pacoteStatus').value,
        updatedAt: Timestamp.now(),
        vendas: 0
    };
    
    if (imagemBase64) pacoteData.imagemBase64 = imagemBase64;
    
    const pacoteId = document.getElementById('pacoteId').value;
    
    try {
        if (pacoteId) {
            await updateDoc(doc(db, "pacotes", pacoteId), pacoteData);
            mostrarToast('✅ Pacote atualizado com sucesso!');
        } else {
            pacoteData.createdAt = Timestamp.now();
            await addDoc(collection(db, "pacotes"), pacoteData);
            mostrarToast('✅ Pacote criado com sucesso!');
        }
        fecharModais();
        document.getElementById('formPacote').reset();
        imagemUploadFile = null;
        servicosSelecionadosTemp.clear();
    } catch (error) {
        mostrarToast('❌ Erro ao salvar pacote: ' + error.message, 'erro');
    }
});

function fecharModais() {
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
}

document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', fecharModais));
document.getElementById('btnCancelar')?.addEventListener('click', fecharModais);
document.getElementById('btnConfirmarExcluirPacote')?.addEventListener('click', () => { if (pacoteParaExcluir) deletarPacote(pacoteParaExcluir); });
document.getElementById('btnCancelarExcluir')?.addEventListener('click', fecharModalExcluirPacote);
document.querySelector('#modalExcluirPacote .modal-close-excluir')?.addEventListener('click', fecharModalExcluirPacote);

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});

document.getElementById('filtroStatus')?.addEventListener('change', renderizarPacotes);
document.getElementById('buscaPacote')?.addEventListener('input', renderizarPacotes);
document.getElementById('btnLimparFiltros')?.addEventListener('click', () => {
    if (document.getElementById('buscaPacote')) document.getElementById('buscaPacote').value = '';
    if (document.getElementById('filtroStatus')) document.getElementById('filtroStatus').value = 'todos';
    renderizarPacotes();
});

function atualizarEstatisticas() {
    document.getElementById('totalPacotes').textContent = pacotes.length;
    document.getElementById('pacotesAtivos').textContent = pacotes.filter(p => p.status === 'ativo').length;
    document.getElementById('pacotesVendidos').textContent = pacotes.reduce((sum, p) => sum + (p.vendas || 0), 0);
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ Usuário autenticado:", user.email);
        carregarPacotes();
    } else {
        window.location.href = 'login.html';
    }
});

document.getElementById('logout')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
});

console.log("🚀 Sistema de Pacotes carregado! (Versão com quantidades)");