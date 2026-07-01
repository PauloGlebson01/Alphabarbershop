import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, collection, getDocs, query, orderBy, addDoc, updateDoc, doc, 
    getDoc, where, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

let servicosCache = [];
let produtosCache = [];
let profissionaisCache = [];
let pacotesCache = [];
let cursosCache = [];
let autenticado = false;

// ==================== SISTEMA DE CARRINHO ====================
let carrinho = [];

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarDuracao(minutos) {
    if (!minutos) return '-';
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (horas > 0) {
        return `${horas}h ${mins > 0 ? mins + 'min' : ''}`;
    }
    return `${minutos} min`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCategoriaIcon(categoria) {
    const icons = {
        'Corte': '✂️',
        'Barba': '🪒',
        'Combos': '💈',
        'Sobrancelha': '✏️',
        'Coloração': '🎨',
        'Pomadas': '💈',
        'Óleos': '🧴',
        'Shampoos': '🧴',
        'Acessórios': '🪒',
        'Kits': '🎁'
    };
    return icons[categoria] || '✂️';
}

function getCategoriaNomeCurso(categoria) {
    const nomes = {
        'corte': 'Corte',
        'barba': 'Barba',
        'coloracao': 'Coloração',
        'gestao': 'Gestão',
        'atendimento': 'Atendimento'
    };
    return nomes[categoria] || categoria || 'Geral';
}

function getNivelNome(nivel) {
    const nomes = {
        'iniciante': '🌱 Iniciante',
        'intermediario': '📈 Intermediário',
        'avancado': '🚀 Avançado'
    };
    return nomes[nivel] || nivel || 'Geral';
}

function getEmbedUrlCurso(url) {
    if (!url) return null;
    // YouTube
    if (url.includes('youtube.com/watch?v=')) {
        const videoId = url.split('v=')[1].split('&')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    // YouTube Shorts
    if (url.includes('youtube.com/shorts/')) {
        const videoId = url.split('/shorts/')[1].split('?')[0];
        return `https://www.youtube.com/embed/${videoId}`;
    }
    // Vimeo
    if (url.includes('vimeo.com/')) {
        const videoId = url.split('vimeo.com/')[1].split('?')[0];
        return `https://player.vimeo.com/video/${videoId}`;
    }
    return url;
}

function mostrarToast(mensagem, tipo = 'success') {
    const toast = document.getElementById('carrinhoToast');
    const msgElement = document.getElementById('carrinhoToastMsg');
    const iconElement = document.getElementById('carrinhoToastIcon');
    
    if (toast && msgElement) {
        msgElement.textContent = mensagem;
        
        if (tipo === 'success') {
            toast.style.background = 'linear-gradient(135deg, #f97316, #ea580c)';
            if (iconElement) iconElement.className = 'fa-solid fa-circle-check';
        } else if (tipo === 'error') {
            toast.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            if (iconElement) iconElement.className = 'fa-solid fa-circle-exclamation';
        } else {
            toast.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
            if (iconElement) iconElement.className = 'fa-solid fa-circle-info';
        }
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

function salvarCarrinho() {
    localStorage.setItem('carrinhoProdutos', JSON.stringify(carrinho));
}

function carregarCarrinhoSalvo() {
    const saved = localStorage.getItem('carrinhoProdutos');
    if (saved) {
        try {
            carrinho = JSON.parse(saved);
            atualizarBadgeCarrinho();
        } catch (e) {
            console.error('Erro ao carregar carrinho:', e);
        }
    }
}

function atualizarBadgeCarrinho() {
    const badge = document.getElementById('carrinhoBadge');
    const totalItens = carrinho.reduce((sum, item) => sum + item.quantidade, 0);
    
    if (badge) {
        if (totalItens > 0) {
            badge.textContent = totalItens;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function adicionarAoCarrinho(produto) {
    const itemExistente = carrinho.find(item => item.id === produto.id);
    
    if (itemExistente) {
        itemExistente.quantidade++;
    } else {
        carrinho.push({
            id: produto.id,
            nome: produto.nome,
            preco: produto.preco || 0,
            categoria: produto.categoria || 'Produto',
            quantidade: 1
        });
    }
    
    mostrarToast(`${produto.nome} adicionado ao carrinho!`, 'success');
    atualizarBadgeCarrinho();
    salvarCarrinho();
}

function removerDoCarrinho(index) {
    const item = carrinho[index];
    if (item) {
        carrinho.splice(index, 1);
        mostrarToast(`${item.nome} removido do carrinho`, 'info');
        atualizarBadgeCarrinho();
        salvarCarrinho();
        renderizarCarrinho();
    }
}

function incrementarQuantidade(index) {
    if (carrinho[index]) {
        carrinho[index].quantidade++;
        atualizarBadgeCarrinho();
        salvarCarrinho();
        renderizarCarrinho();
    }
}

function decrementarQuantidade(index) {
    if (carrinho[index]) {
        if (carrinho[index].quantidade > 1) {
            carrinho[index].quantidade--;
            atualizarBadgeCarrinho();
            salvarCarrinho();
            renderizarCarrinho();
        } else {
            removerDoCarrinho(index);
        }
    }
}

function limparCarrinho() {
    if (carrinho.length > 0) {
        carrinho = [];
        atualizarBadgeCarrinho();
        salvarCarrinho();
        renderizarCarrinho();
        mostrarToast('Carrinho esvaziado', 'info');
    }
}

function calcularTotalCarrinho() {
    return carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
}

function renderizarCarrinho() {
    const container = document.getElementById('carrinhoItens');
    const subtotalElement = document.getElementById('carrinhoSubtotal');
    const totalElement = document.getElementById('carrinhoTotal');
    const btnFinalizar = document.getElementById('btnFinalizarCompra');
    const emptyMessage = document.getElementById('carrinhoEmptyMessage');
    
    if (!container) return;
    
    if (carrinho.length === 0) {
        if (emptyMessage) emptyMessage.style.display = 'block';
        container.innerHTML = '';
        if (subtotalElement) subtotalElement.textContent = formatarMoeda(0);
        if (totalElement) totalElement.textContent = formatarMoeda(0);
        if (btnFinalizar) btnFinalizar.disabled = true;
        return;
    }
    
    if (emptyMessage) emptyMessage.style.display = 'none';
    if (btnFinalizar) btnFinalizar.disabled = false;
    
    let subtotal = 0;
    let html = '';
    
    carrinho.forEach((item, index) => {
        const itemTotal = item.preco * item.quantidade;
        subtotal += itemTotal;
        
        html += `
            <div class="carrinho-item">
                <div class="carrinho-item-info">
                    <div class="carrinho-item-icon">
                        <i class="fa-solid fa-box"></i>
                    </div>
                    <div class="carrinho-item-detalhes">
                        <h4>${escapeHtml(item.nome)}</h4>
                        <span class="carrinho-item-categoria">${escapeHtml(item.categoria)}</span>
                        <div class="carrinho-item-preco">${formatarMoeda(item.preco)}</div>
                    </div>
                </div>
                <div class="carrinho-item-actions">
                    <div class="carrinho-quantidade">
                        <button class="carrinho-qtd-btn" onclick="decrementarQuantidade(${index})">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                        <span class="carrinho-qtd-valor">${item.quantidade}</span>
                        <button class="carrinho-qtd-btn" onclick="incrementarQuantidade(${index})">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div class="carrinho-item-total">${formatarMoeda(itemTotal)}</div>
                    <button class="carrinho-remove-btn" onclick="removerDoCarrinho(${index})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    if (subtotalElement) subtotalElement.textContent = formatarMoeda(subtotal);
    if (totalElement) totalElement.textContent = formatarMoeda(subtotal);
}

// ==================== FUNÇÕES PARA CRIAR COMANDA ====================
async function criarComandaDoCliente(dadosCliente, produtosComprados) {
    try {
        console.log("🚀 Criando comanda para cliente:", dadosCliente.nome);
        
        let clienteId = null;
        const clientesQuery = query(collection(db, "clientes"), where("nome", "==", dadosCliente.nome));
        const clientesSnap = await getDocs(clientesQuery);
        
        if (!clientesSnap.empty) {
            clienteId = clientesSnap.docs[0].id;
            console.log("✅ Cliente encontrado:", clienteId);
        } else {
            const novoCliente = {
                nome: dadosCliente.nome,
                telefone: dadosCliente.telefone,
                email: dadosCliente.email || '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };
            const clienteRef = await addDoc(collection(db, "clientes"), novoCliente);
            clienteId = clienteRef.id;
            console.log("✅ Cliente criado:", clienteId);
        }
        
        const produtosComanda = produtosComprados.map(p => ({
            produtoId: p.id,
            nome: p.nome,
            preco: p.preco,
            quantidade: p.quantidade
        }));
        
        const total = produtosComprados.reduce((sum, p) => sum + (p.preco * p.quantidade), 0);
        const contador = Date.now();
        
        const comandaData = {
            clienteId: clienteId,
            clienteNome: dadosCliente.nome,
            barbeiroId: null,
            barbeiroNome: "Venda Direta",
            servicos: [],
            produtos: produtosComanda,
            subtotal: total,
            total: total,
            status: "aberta",
            observacoes: `Compra de produtos pelo cliente. Telefone: ${dadosCliente.telefone}${dadosCliente.email ? ` | Email: ${dadosCliente.email}` : ''}${dadosCliente.observacao ? ` | Obs: ${dadosCliente.observacao}` : ''}`,
            formaPagamento: "pendente",
            numeroComanda: contador,
            dataCriacao: Timestamp.now(),
            updatedAt: Timestamp.now(),
            origem: "compra_produto"
        };
        
        const comandaRef = await addDoc(collection(db, "comandas"), comandaData);
        console.log("✅ COMANDA CRIADA! ID:", comandaRef.id);
        
        return comandaRef.id;
        
    } catch (error) {
        console.error("❌ Erro ao criar comanda:", error);
        return null;
    }
}

async function enviarConfirmacaoCompraWhatsApp(nome, telefone, itens, comandaId) {
    const numeroLimpo = telefone.replace(/\D/g, "");
    if (numeroLimpo.length < 10) return;
    
    let num = numeroLimpo;
    if (num.length === 10) {
        num = num.substring(0, 2) + '9' + num.substring(2);
    }
    if (!num.startsWith('55')) {
        num = '55' + num;
    }
    
    let listaProdutos = '';
    let total = 0;
    itens.forEach((item, i) => {
        const subtotal = item.preco * item.quantidade;
        total += subtotal;
        listaProdutos += `${i + 1}. ${item.nome} - ${item.quantidade}x ${formatarMoeda(item.preco)} = ${formatarMoeda(subtotal)}\n`;
    });
    
    const mensagem = `Olá ${nome}! ✂️💈

*PEDIDO RECEBIDO COM SUCESSO!*

📋 *SEUS PRODUTOS:*
${listaProdutos}

💵 *TOTAL:* ${formatarMoeda(total)}

🎫 *Nº DA COMANDA:* #${comandaId.slice(-6).toUpperCase()}

📝 *PRÓXIMOS PASSOS:*
✅ Seu pedido foi registrado em nossa comanda
📞 Em breve entraremos em contato para confirmar disponibilidade
💰 O pagamento será realizado no momento da retirada

📍 *Retirada:* Alpha BarberShop
Av. Presidente Epitácio Pessoa, 5102
João Pessoa - PB

✂️ *Alpha BarberShop* ✂️
Mais que corte. Ritual do Reflexo! 💈

_Esta é uma mensagem automática._`;

    const url = `https://wa.me/${num}?text=${encodeURIComponent(mensagem)}`;
    
    setTimeout(() => {
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
    }, 500);
}

// ==================== MODAL DE DADOS DO COMPRADOR ====================
function abrirModalDadosComprador() {
    let modal = document.getElementById('modalDadosComprador');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalDadosComprador';
        modal.className = 'servicos-modal';
        modal.innerHTML = `
            <div class="servicos-modal-content" style="max-width: 450px;">
                <div class="servicos-modal-header">
                    <h2><i class="fa-solid fa-user"></i> Identifique-se</h2>
                    <button class="servicos-modal-close modal-dados-close">&times;</button>
                </div>
                <div class="servicos-modal-body">
                    <form id="formDadosComprador">
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #94a3b8;"><i class="fa-solid fa-user"></i> Nome Completo *</label>
                            <input type="text" id="compradorNome" required placeholder="Ex: João Silva" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff; transition: all 0.2s;">
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #94a3b8;"><i class="fa-brands fa-whatsapp"></i> WhatsApp *</label>
                            <input type="tel" id="compradorTelefone" required placeholder="(83) 99999-9999" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff; transition: all 0.2s;">
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #94a3b8;"><i class="fa-solid fa-envelope"></i> E-mail</label>
                            <input type="email" id="compradorEmail" placeholder="seu@email.com" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff; transition: all 0.2s;">
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label style="display: block; margin-bottom: 6px; color: #94a3b8;"><i class="fa-solid fa-note-sticky"></i> Observação (opcional)</label>
                            <textarea id="compradorObs" rows="2" placeholder="Alguma informação adicional?" style="width: 100%; padding: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff; resize: vertical; font-family: inherit;"></textarea>
                        </div>
                        <div class="form-actions" style="display: flex; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <button type="button" class="btn-cancel-dados" style="flex: 1; padding: 12px; background: #334155; border: none; border-radius: 12px; color: #fff; cursor: pointer; font-weight: 500;">Cancelar</button>
                            <button type="submit" class="btn-primary" style="flex: 2; padding: 12px; background: linear-gradient(135deg, #f97316, #ea580c); border: none; border-radius: 12px; color: white; cursor: pointer; font-weight: 600;">
                                <i class="fa-solid fa-check-circle"></i> Confirmar Compra
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        const closeBtn = modal.querySelector('.modal-dados-close');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.remove('active');
                document.body.style.overflow = '';
                const form = document.getElementById('formDadosComprador');
                if (form) form.reset();
            };
        }
        
        const cancelBtn = modal.querySelector('.btn-cancel-dados');
        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                modal.classList.remove('active');
                document.body.style.overflow = '';
                const form = document.getElementById('formDadosComprador');
                if (form) form.reset();
            };
        }
        
        const form = document.getElementById('formDadosComprador');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                await processarCompraComDados();
            };
        }
        
        const telefoneInput = document.getElementById('compradorTelefone');
        if (telefoneInput && !telefoneInput.hasAttribute('data-mask-configured')) {
            telefoneInput.setAttribute('data-mask-configured', 'true');
            telefoneInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, "");
                if (v.length > 11) v = v.slice(0, 11);
                if (v.length >= 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
                if (v.length >= 8) v = v.replace(/(\(\d{2}\) \d{5})(\d)/, "$1-$2");
                e.target.value = v.slice(0, 16);
            });
        }
    }, 50);
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            const form = document.getElementById('formDadosComprador');
            if (form) form.reset();
        }
    };
    
    const escHandler = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            const form = document.getElementById('formDadosComprador');
            if (form) form.reset();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.removeEventListener('keydown', escHandler);
    document.addEventListener('keydown', escHandler);
}

function fecharModalDadosComprador() {
    const modal = document.getElementById('modalDadosComprador');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        const form = document.getElementById('formDadosComprador');
        if (form) form.reset();
    }
}

async function processarCompraComDados() {
    const nome = document.getElementById('compradorNome')?.value.trim();
    const telefone = document.getElementById('compradorTelefone')?.value.trim();
    const email = document.getElementById('compradorEmail')?.value.trim();
    const observacao = document.getElementById('compradorObs')?.value.trim();
    
    if (!nome) {
        mostrarToast('Por favor, informe seu nome', 'error');
        return;
    }
    
    if (!telefone) {
        mostrarToast('Por favor, informe seu WhatsApp', 'error');
        return;
    }
    
    let telefoneLimpo = telefone.replace(/\D/g, '');
    if (telefoneLimpo.length < 10) {
        mostrarToast('Informe um número de WhatsApp válido', 'error');
        return;
    }
    
    const submitBtn = document.querySelector('#formDadosComprador button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
    }
    
    try {
        const produtosParaComanda = carrinho.map(item => ({
            id: item.id,
            nome: item.nome,
            preco: item.preco,
            quantidade: item.quantidade
        }));
        
        const comandaId = await criarComandaDoCliente(
            { nome, telefone, email, observacao },
            produtosParaComanda
        );
        
        if (comandaId) {
            mostrarToast('✅ Compra registrada! Comanda criada com sucesso.', 'success');
            await enviarConfirmacaoCompraWhatsApp(nome, telefone, carrinho, comandaId);
            limparCarrinho();
            fecharModalDadosComprador();
            fecharModalCarrinho();
            fecharModalProdutos();
            
            setTimeout(() => {
                alert('✅ Compra realizada com sucesso!\n\nSua comanda foi registrada.\nEm breve entraremos em contato para finalizar o pedido.');
            }, 500);
        } else {
            mostrarToast('Erro ao registrar compra. Tente novamente.', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao processar compra:', error);
        mostrarToast('Erro ao processar compra. Tente novamente.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Confirmar Compra';
        }
    }
}

// ==================== FUNÇÕES DO CARRINHO ====================
function abrirModalCarrinho() {
    const modal = document.getElementById('modalCarrinho');
    if (modal) {
        renderizarCarrinho();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function fecharModalCarrinho() {
    const modal = document.getElementById('modalCarrinho');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function finalizarCompra() {
    if (carrinho.length === 0) {
        mostrarToast('Seu carrinho está vazio!', 'error');
        return;
    }
    abrirModalDadosComprador();
}

function adicionarBotaoCarrinho() {
    if (document.getElementById('floatingCartBtn')) return;
    
    const btnCarrinho = document.createElement('button');
    btnCarrinho.id = 'floatingCartBtn';
    btnCarrinho.className = 'floating-cart-btn';
    btnCarrinho.innerHTML = `
        <i class="fa-solid fa-cart-shopping"></i>
        <span id="carrinhoBadge" class="cart-badge" style="display: none;">0</span>
    `;
    btnCarrinho.onclick = abrirModalCarrinho;
    document.body.appendChild(btnCarrinho);
}

// Expor funções globalmente
window.adicionarAoCarrinho = adicionarAoCarrinho;
window.removerDoCarrinho = removerDoCarrinho;
window.incrementarQuantidade = incrementarQuantidade;
window.decrementarQuantidade = decrementarQuantidade;
window.limparCarrinho = limparCarrinho;
window.finalizarCompra = finalizarCompra;
window.abrirModalCarrinho = abrirModalCarrinho;
window.fecharModalCarrinho = fecharModalCarrinho;

// ==================== FUNÇÕES DE CARROSSEL ====================
let imagensAtuais = [];
let indiceAtual = 0;

function abrirCarrossel(imagens, titulo) {
    if (!imagens || imagens.length === 0) return;
    
    imagensAtuais = imagens;
    indiceAtual = 0;
    
    const modal = document.getElementById('modalCarrosselImagens');
    const tituloElement = document.getElementById('carrosselTitulo');
    const slidesContainer = document.getElementById('carrosselSlides');
    const indicatorsContainer = document.getElementById('carrosselIndicators');
    const counterElement = document.getElementById('carrosselCounter');
    
    if (tituloElement) {
        tituloElement.innerHTML = `<i class="fa-solid fa-images"></i> ${escapeHtml(titulo)}`;
    }
    
    if (slidesContainer) {
        slidesContainer.innerHTML = imagens.map((img, index) => `
            <div class="carrossel-slide" data-index="${index}">
                <img src="${img}" alt="Imagem ${index + 1}" onclick="abrirFullscreen(${index})">
            </div>
        `).join('');
    }
    
    if (indicatorsContainer) {
        indicatorsContainer.innerHTML = imagens.map((_, index) => `
            <div class="carrossel-indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></div>
        `).join('');
        
        document.querySelectorAll('.carrossel-indicator').forEach(ind => {
            ind.addEventListener('click', () => {
                const index = parseInt(ind.getAttribute('data-index'));
                irParaSlide(index);
            });
        });
    }
    
    if (counterElement) {
        counterElement.textContent = `Imagem 1 de ${imagens.length}`;
    }
    
    atualizarCarrossel();
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
}

function atualizarCarrossel() {
    const slidesContainer = document.getElementById('carrosselSlides');
    const indicators = document.querySelectorAll('.carrossel-indicator');
    const counterElement = document.getElementById('carrosselCounter');
    const total = imagensAtuais.length;
    
    if (slidesContainer) {
        const deslocamento = -(indiceAtual * 100);
        slidesContainer.style.transform = `translateX(${deslocamento}%)`;
    }
    
    indicators.forEach((ind, i) => {
        if (i === indiceAtual) {
            ind.classList.add('active');
        } else {
            ind.classList.remove('active');
        }
    });
    
    if (counterElement) {
        counterElement.textContent = `Imagem ${indiceAtual + 1} de ${total}`;
    }
}

function irParaSlide(index) {
    if (index >= 0 && index < imagensAtuais.length) {
        indiceAtual = index;
        atualizarCarrossel();
    }
}

function proximoSlide() {
    if (indiceAtual < imagensAtuais.length - 1) {
        indiceAtual++;
        atualizarCarrossel();
    } else {
        indiceAtual = 0;
        atualizarCarrossel();
    }
}

function slideAnterior() {
    if (indiceAtual > 0) {
        indiceAtual--;
        atualizarCarrossel();
    } else {
        indiceAtual = imagensAtuais.length - 1;
        atualizarCarrossel();
    }
}

function fecharCarrossel() {
    const modal = document.getElementById('modalCarrosselImagens');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
    }
}

function abrirFullscreen(index) {
    if (!imagensAtuais || imagensAtuais.length === 0) return;
    
    indiceAtual = index;
    const modal = document.getElementById('modalFullscreen');
    const fullscreenImage = document.getElementById('fullscreenImage');
    const counterElement = document.getElementById('fullscreenCounter');
    
    if (fullscreenImage) {
        fullscreenImage.src = imagensAtuais[indiceAtual];
    }
    
    if (counterElement) {
        counterElement.textContent = `Imagem ${indiceAtual + 1} de ${imagensAtuais.length}`;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharFullscreen() {
    const modal = document.getElementById('modalFullscreen');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function proximoFullscreen() {
    if (indiceAtual < imagensAtuais.length - 1) {
        indiceAtual++;
        const fullscreenImage = document.getElementById('fullscreenImage');
        const counterElement = document.getElementById('fullscreenCounter');
        
        if (fullscreenImage) {
            fullscreenImage.src = imagensAtuais[indiceAtual];
        }
        
        if (counterElement) {
            counterElement.textContent = `Imagem ${indiceAtual + 1} de ${imagensAtuais.length}`;
        }
    }
}

function anteriorFullscreen() {
    if (indiceAtual > 0) {
        indiceAtual--;
        const fullscreenImage = document.getElementById('fullscreenImage');
        const counterElement = document.getElementById('fullscreenCounter');
        
        if (fullscreenImage) {
            fullscreenImage.src = imagensAtuais[indiceAtual];
        }
        
        if (counterElement) {
            counterElement.textContent = `Imagem ${indiceAtual + 1} de ${imagensAtuais.length}`;
        }
    }
}

window.abrirCarrossel = abrirCarrossel;
window.fecharCarrossel = fecharCarrossel;
window.proximoSlide = proximoSlide;
window.slideAnterior = slideAnterior;
window.abrirFullscreen = abrirFullscreen;
window.fecharFullscreen = fecharFullscreen;
window.proximoFullscreen = proximoFullscreen;
window.anteriorFullscreen = anteriorFullscreen;

// ==================== SERVIÇOS ====================
function abrirModalServicos() {
    const modal = document.getElementById('servicosModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        carregarServicos();
    }
}

function fecharModalServicos() {
    const modal = document.getElementById('servicosModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModalDetalheServico(servico) {
    const modal = document.getElementById('servicoDetalheModal');
    if (!modal) return;
    
    document.getElementById('detalheServicoNome').textContent = servico.nombre || servico.nome || 'Serviço';
    document.getElementById('detalheServicoDuracao').textContent = formatarDuracao(servico.duracao);
    document.getElementById('detalheServicoCategoria').textContent = servico.categoria || 'Geral';
    document.getElementById('detalheServicoPreco').textContent = formatarMoeda(servico.preco || 0);
    document.getElementById('detalheServicoDescricao').textContent = servico.descricao || 'Sem descrição disponível.';
    
    const btnAgendar = document.getElementById('btnAgendarDetalhe');
    if (btnAgendar) {
        btnAgendar.href = `agendamento.html?servico=${encodeURIComponent(servico.nombre || servico.nome)}&servicoPreco=${servico.preco}&servicoDuracao=${servico.duracao}&servicoId=${servico.id}`;
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalheServico() {
    const modal = document.getElementById('servicoDetalheModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function carregarServicos() {
    const servicosLista = document.getElementById('servicosLista');
    if (!servicosLista) return;
    
    servicosLista.innerHTML = `<div class="loading-servicos"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando serviços...</p></div>`;
    
    try {
        const q = query(collection(db, "servicos"), orderBy("nome", "asc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            servicosLista.innerHTML = `<div class="empty-servicos"><i class="fa-solid fa-cut"></i><p>Nenhum serviço cadastrado ainda.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novos serviços disponíveis!</p></div>`;
            return;
        }
        
        servicosCache = [];
        let servicosHTML = '';
        
        querySnapshot.forEach(doc => {
            const servico = doc.data();
            servico.id = doc.id;
            servicosCache.push(servico);
            
            const categoriaIcon = getCategoriaIcon(servico.categoria);
            
            servicosHTML += `
                <div class="servico-card" data-index="${servicosCache.length - 1}" data-tipo="servico">
                    <div class="servico-card-icon"><i class="fa-solid fa-cut"></i></div>
                    <div class="servico-card-info">
                        <h3>${escapeHtml(servico.nombre || servico.nome || 'Sem nome')}</h3>
                        <div class="servico-card-meta">
                            <span class="servico-card-categoria">${categoriaIcon} ${escapeHtml(servico.categoria || 'Geral')}</span>
                            <span class="servico-card-duracao"><i class="fa-regular fa-clock"></i> ${formatarDuracao(servico.duracao)}</span>
                        </div>
                        <div class="servico-card-preco">${formatarMoeda(servico.preco || 0)}</div>
                        ${servico.descricao ? `<p class="servico-card-descricao">${escapeHtml(servico.descricao.substring(0, 80))}${servico.descricao.length > 80 ? '...' : ''}</p>` : ''}
                    </div>
                    <div class="servico-card-action"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `;
        });
        
        servicosLista.innerHTML = servicosHTML;
        
        document.querySelectorAll('.servico-card[data-tipo="servico"]').forEach(card => {
            card.addEventListener('click', (e) => {
                const index = card.getAttribute('data-index');
                if (index !== null && servicosCache[index]) {
                    abrirModalDetalheServico(servicosCache[index]);
                }
            });
        });
        
    } catch (error) {
        console.error("Erro ao carregar serviços:", error);
        servicosLista.innerHTML = `<div class="empty-servicos"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar serviços: ${error.message}</p><button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #f97316; border: none; border-radius: 8px; color: white; cursor: pointer;"><i class="fa-solid fa-rotate"></i> Tentar novamente</button></div>`;
    }
}

// ==================== PRODUTOS ====================
function abrirModalProdutos() {
    const modal = document.getElementById('produtosModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        carregarProdutos();
    }
}

function fecharModalProdutos() {
    const modal = document.getElementById('produtosModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModalDetalheProduto(produto) {
    const modal = document.getElementById('produtoDetalheModal');
    if (!modal) return;
    
    document.getElementById('detalheProdutoNome').textContent = produto.nome || 'Produto';
    document.getElementById('detalheProdutoCategoria').textContent = produto.categoria || 'Geral';
    document.getElementById('detalheProdutoPreco').textContent = formatarMoeda(produto.preco || 0);
    
    const fornecedor = produto.marca || produto.fornecedor || 'Alpha BarberShop';
    document.getElementById('detalheProdutoFornecedor').textContent = fornecedor;
    
    document.getElementById('detalheProdutoDescricao').textContent = produto.descricao || 'Produto recomendado para potencializar seus resultados.';
    
    const imagemContainer = document.getElementById('detalheProdutoImagem');
    if (imagemContainer) {
        if (produto.imagem && produto.imagem.trim() !== '') {
            imagemContainer.innerHTML = `<img src="${produto.imagem}" alt="${escapeHtml(produto.nome)}" onerror="this.style.display='none'">`;
            imagemContainer.style.display = 'block';
        } else {
            imagemContainer.style.display = 'none';
            imagemContainer.innerHTML = '';
        }
    }
    
    const btnComprar = document.getElementById('btnComprarProduto');
    if (btnComprar) {
        const newBtn = btnComprar.cloneNode(true);
        btnComprar.parentNode.replaceChild(newBtn, btnComprar);
        
        newBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            adicionarAoCarrinho(produto);
            fecharModalDetalheProduto();
        };
        newBtn.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Adicionar ao Carrinho';
        newBtn.href = 'javascript:void(0)';
        newBtn.removeAttribute('target');
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalheProduto() {
    const modal = document.getElementById('produtoDetalheModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function carregarProdutos() {
    const produtosLista = document.getElementById('produtosLista');
    if (!produtosLista) return;
    
    produtosLista.innerHTML = `<div class="loading-produtos"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando produtos...</p></div>`;
    
    try {
        const q = query(collection(db, "produtos"), orderBy("nome", "asc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            produtosLista.innerHTML = `<div class="empty-produtos"><i class="fa-solid fa-box"></i><p>Nenhum produto cadastrado ainda.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novos produtos disponíveis!</p></div>`;
            return;
        }
        
        produtosCache = [];
        let produtosHTML = '';
        
        querySnapshot.forEach(doc => {
            const produto = doc.data();
            produto.id = doc.id;
            produtosCache.push(produto);
            
            const categoriaIcon = getCategoriaIcon(produto.categoria);
            
            produtosHTML += `
                <div class="produto-card" data-index="${produtosCache.length - 1}" data-tipo="produto">
                    <div class="produto-card-icon"><i class="fa-solid fa-box"></i></div>
                    <div class="produto-card-info">
                        <h3>${escapeHtml(produto.nome || 'Sem nome')}</h3>
                        <div class="produto-card-meta"><span class="produto-card-categoria">${categoriaIcon} ${escapeHtml(produto.categoria || 'Geral')}</span></div>
                        <div class="produto-card-preco">${formatarMoeda(produto.preco || 0)}</div>
                        ${produto.descricao ? `<p class="produto-card-descricao">${escapeHtml(produto.descricao.substring(0, 80))}${produto.descricao.length > 80 ? '...' : ''}</p>` : ''}
                        <div class="produto-card-actions">
                            <button class="btn-ver-detalhe" data-id="${produto.id}"><i class="fa-regular fa-eye"></i> Detalhes</button>
                            <button class="btn-comprar-card" data-id="${produto.id}"><i class="fa-solid fa-cart-plus"></i> Comprar</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        produtosLista.innerHTML = produtosHTML;
        
        document.querySelectorAll('.btn-ver-detalhe').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const produto = produtosCache.find(p => p.id === id);
                if (produto) abrirModalDetalheProduto(produto);
            });
        });
        
        document.querySelectorAll('.btn-comprar-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const produto = produtosCache.find(p => p.id === id);
                if (produto) adicionarAoCarrinho(produto);
            });
        });
        
    } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        produtosLista.innerHTML = `<div class="empty-produtos"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar produtos: ${error.message}</p><button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #f97316; border: none; border-radius: 8px; color: white; cursor: pointer;"><i class="fa-solid fa-rotate"></i> Tentar novamente</button></div>`;
    }
}

// ==================== PROFISSIONAIS ====================
function abrirModalProfissionais() {
    const modal = document.getElementById('profissionaisModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        carregarProfissionais();
    }
}

function fecharModalProfissionais() {
    const modal = document.getElementById('profissionaisModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModalDetalheProfissional(profissional) {
    const modal = document.getElementById('profissionalDetalheModal');
    if (!modal) return;
    
    document.getElementById('detalheProfissionalNome').textContent = profissional.nome || 'Profissional';
    document.getElementById('detalheProfissionalEspecialidade').textContent = profissional.especialidade || 'Geral';
    document.getElementById('detalheProfissionalExperiencia').textContent = profissional.experiencia || 'Não informada';
    document.getElementById('detalheProfissionalDescricao').textContent = profissional.descricao || 'Profissional qualificado pronto para te atender.';
    
    const fotoElement = document.getElementById('detalheProfissionalFoto');
    if (profissional.foto) {
        fotoElement.src = profissional.foto;
        fotoElement.style.display = 'block';
    } else {
        fotoElement.style.display = 'none';
    }
    
    const btnAgendar = document.getElementById('btnAgendarProfissional');
    if (btnAgendar) {
        const newBtn = btnAgendar.cloneNode(true);
        btnAgendar.parentNode.replaceChild(newBtn, btnAgendar);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = `agendamento.html?profissionalId=${profissional.id}&profissionalNome=${encodeURIComponent(profissional.nome)}`;
            window.location.href = url;
        });
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalheProfissional() {
    const modal = document.getElementById('profissionalDetalheModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function carregarProfissionais() {
    const profissionaisLista = document.getElementById('profissionaisLista');
    if (!profissionaisLista) return;
    
    profissionaisLista.innerHTML = `<div class="loading-profissionais"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando profissionais...</p></div>`;
    
    try {
        const q = query(collection(db, "profissionais"), orderBy("nome", "asc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            profissionaisLista.innerHTML = `<div class="empty-profissionais"><i class="fa-solid fa-users"></i><p>Nenhum profissional cadastrado ainda.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novos profissionais disponíveis!</p></div>`;
            return;
        }
        
        profissionaisCache = [];
        let profissionaisHTML = '';
        
        querySnapshot.forEach(doc => {
            const profissional = doc.data();
            profissional.id = doc.id;
            profissionaisCache.push(profissional);
            
            const fotoUrl = profissional.foto || '';
            
            profissionaisHTML += `
                <div class="profissional-card" data-index="${profissionaisCache.length - 1}">
                    <div class="profissional-card-avatar">
                        ${fotoUrl ? 
                            `<img src="${fotoUrl}" alt="${escapeHtml(profissional.nome)}" class="profissional-avatar-img">` : 
                            `<div class="profissional-avatar-placeholder"><i class="fa-solid fa-user-md"></i></div>`
                        }
                    </div>
                    <div class="profissional-card-info">
                        <h3>${escapeHtml(profissional.nome || 'Profissional')}</h3>
                        <div class="profissional-card-especialidade">
                            <i class="fa-solid fa-briefcase"></i> ${escapeHtml(profissional.especialidade || 'Profissional')}
                        </div>
                        ${profissional.descricao ? `<p class="profissional-card-descricao">${escapeHtml(profissional.descricao.substring(0, 70))}${profissional.descricao.length > 70 ? '...' : ''}</p>` : ''}
                        <div class="profissional-card-actions">
                            <button class="btn-agendar-profissional" data-id="${profissional.id}" data-nome="${escapeHtml(profissional.nome)}">
                                <i class="fa-solid fa-calendar-check"></i> Agendar
                            </button>
                        </div>
                    </div>
                    <div class="profissional-card-action"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `;
        });
        
        profissionaisLista.innerHTML = profissionaisHTML;
        
        document.querySelectorAll('.profissional-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-agendar-profissional')) return;
                
                const index = card.getAttribute('data-index');
                if (index !== null && profissionaisCache[index]) {
                    abrirModalDetalheProfissional(profissionaisCache[index]);
                }
            });
        });
        
        document.querySelectorAll('.btn-agendar-profissional').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const nome = btn.getAttribute('data-nome');
                const url = `agendamento.html?profissionalId=${id}&profissionalNome=${encodeURIComponent(nome)}`;
                window.location.href = url;
            });
        });
        
    } catch (error) {
        console.error("Erro ao carregar profissionais:", error);
        profissionaisLista.innerHTML = `<div class="empty-profissionais"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar profissionais: ${error.message}</p><button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #f97316; border: none; border-radius: 8px; color: white; cursor: pointer;"><i class="fa-solid fa-rotate"></i> Tentar novamente</button></div>`;
    }
}

// ==================== PACOTES ====================
function abrirModalPacotes() {
    const modal = document.getElementById('pacotesModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        carregarPacotes();
    }
}

function fecharModalPacotes() {
    const modal = document.getElementById('pacotesModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModalDetalhePacote(pacote) {
    const modal = document.getElementById('pacoteDetalheModal');
    if (!modal) return;
    
    document.getElementById('detalhePacoteNome').textContent = pacote.nome;
    document.getElementById('detalhePacoteStatus').innerHTML = pacote.status === 'ativo' 
        ? '<span style="color: #10b981;">✓ Ativo</span>' 
        : '<span style="color: #ef4444;">✗ Inativo</span>';
    
    const servicosNomes = pacote.servicos?.map(s => s.nome).join(', ') || 'Nenhum serviço';
    document.getElementById('detalhePacoteServicos').textContent = servicosNomes;
    document.getElementById('detalhePacotePrecoOriginal').textContent = formatarMoeda(pacote.precoOriginal || pacote.preco);
    document.getElementById('detalhePacotePreco').textContent = formatarMoeda(pacote.preco);
    
    const descontoRow = document.getElementById('detalhePacoteDescontoRow');
    const descontoSpan = document.getElementById('detalhePacoteDesconto');
    if (pacote.desconto && pacote.desconto > 0) {
        if (descontoRow) descontoRow.style.display = 'flex';
        if (descontoSpan) descontoSpan.textContent = `${pacote.desconto.toFixed(1)}% OFF`;
    } else {
        if (descontoRow) descontoRow.style.display = 'none';
    }
    
    document.getElementById('detalhePacoteDescricao').textContent = pacote.descricao || 'Pacote exclusivo com serviços selecionados.';
    
    const imagemElement = document.getElementById('detalhePacoteImagem');
    const imagemUrl = pacote.imagemBase64 || pacote.imagem || './assets/barber-perfil.jfif';
    imagemElement.src = imagemUrl;
    imagemElement.onerror = () => { imagemElement.src = './assets/barber-perfil.jfif'; };
    
    const btnComprar = document.getElementById('btnComprarPacote');
    if (btnComprar) {
        const newBtn = btnComprar.cloneNode(true);
        btnComprar.parentNode.replaceChild(newBtn, btnComprar);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (pacote.status === 'inativo') {
                alert('Este pacote está inativo no momento!');
                return;
            }
            const url = `agendamento.html?pacoteId=${pacote.id}&pacoteNome=${encodeURIComponent(pacote.nome)}&precoTotal=${pacote.preco}&servicos=${encodeURIComponent(JSON.stringify(pacote.servicos || []))}`;
            window.location.href = url;
        });
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalhePacote() {
    const modal = document.getElementById('pacoteDetalheModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function carregarPacotes() {
    const pacotesLista = document.getElementById('pacotesLista');
    if (!pacotesLista) return;
    
    pacotesLista.innerHTML = `<div class="loading-pacotes"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando pacotes...</p></div>`;
    
    try {
        const q = query(collection(db, "pacotes"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            pacotesLista.innerHTML = `<div class="empty-pacotes"><i class="fa-solid fa-gift"></i><p>Nenhum pacote disponível no momento.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novas ofertas!</p></div>`;
            return;
        }
        
        const pacotesAtivos = [];
        querySnapshot.forEach(doc => {
            const pacote = doc.data();
            if (pacote.status === 'ativo') {
                pacote.id = doc.id;
                pacotesAtivos.push(pacote);
            }
        });
        
        pacotesAtivos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        
        if (pacotesAtivos.length === 0) {
            pacotesLista.innerHTML = `<div class="empty-pacotes"><i class="fa-solid fa-gift"></i><p>Nenhum pacote ativo disponível no momento.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novas ofertas!</p></div>`;
            return;
        }
        
        pacotesCache = pacotesAtivos;
        let pacotesHTML = '';
        
        pacotesAtivos.forEach((pacote, idx) => {
            const imagemUrl = pacote.imagemBase64 || pacote.imagem || './assets/barber-perfil.jfif';
            const servicosCount = pacote.servicos?.length || 0;
            const temDesconto = pacote.desconto && pacote.desconto > 0;
            
            pacotesHTML += `
                <div class="pacote-card" data-index="${idx}">
                    <img src="${imagemUrl}" class="pacote-card-imagem" alt="${pacote.nome}" onerror="this.src='./assets/barber-perfil.jfif'">
                    <div class="pacote-card-info">
                        <h3>${escapeHtml(pacote.nome)}</h3>
                        <div class="pacote-card-servicos">
                            <i class="fa-solid fa-scissors"></i> ${servicosCount} serviço(s) incluso(s)
                        </div>
                        <div class="pacote-card-precos">
                            ${temDesconto ? `<span class="preco-original-card">${formatarMoeda(pacote.precoOriginal)}</span>` : ''}
                            <span class="preco-promocional-card">${formatarMoeda(pacote.preco)}</span>
                            ${temDesconto ? `<span class="desconto-badge-card">-${pacote.desconto.toFixed(1)}%</span>` : ''}
                        </div>
                    </div>
                    <div class="pacote-card-action"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `;
        });
        
        pacotesLista.innerHTML = pacotesHTML;
        
        document.querySelectorAll('.pacote-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const index = card.getAttribute('data-index');
                if (index !== null && pacotesCache[index]) {
                    abrirModalDetalhePacote(pacotesCache[index]);
                }
            });
        });
        
    } catch (error) {
        console.error("Erro ao carregar pacotes:", error);
        pacotesLista.innerHTML = `<div class="empty-pacotes"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar pacotes: ${error.message}</p><button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #f97316; border: none; border-radius: 8px; color: white; cursor: pointer;"><i class="fa-solid fa-rotate"></i> Tentar novamente</button></div>`;
    }
}

// ==================== CURSOS ====================
function abrirModalCursos() {
    const modal = document.getElementById('cursosModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        carregarCursos();
    }
}

function fecharModalCursos() {
    const modal = document.getElementById('cursosModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function abrirModalDetalheCurso(curso) {
    const modal = document.getElementById('cursoDetalheModal');
    if (!modal) return;
    
    const precoGratuito = !curso.preco || curso.preco === 0;
    const tipoIcon = curso.tipo === 'video' ? '🎬' : (curso.tipo === 'ebook' ? '📚' : '🎓');
    const tipoNome = curso.tipo === 'video' ? 'Vídeo Aula' : (curso.tipo === 'ebook' ? 'E-book' : 'Curso');
    const embedUrl = curso.urlVideo ? getEmbedUrlCurso(curso.urlVideo) : null;
    
    document.getElementById('detalheCursoTitulo').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(curso.titulo)}`;
    
    const conteudo = document.getElementById('detalheCursoConteudo');
    if (conteudo) {
        conteudo.innerHTML = `
            <div class="curso-detalhe-header">
                <div class="curso-detalhe-icon">
                    <i class="fa-solid ${curso.tipo === 'video' ? 'fa-video' : (curso.tipo === 'ebook' ? 'fa-book' : 'fa-graduation-cap')}"></i>
                </div>
                <div class="curso-detalhe-info">
                    <h3>${escapeHtml(curso.titulo)}</h3>
                    <div class="curso-detalhe-meta">
                        <span class="meta-tipo">${tipoIcon} ${tipoNome}</span>
                        ${curso.categoria ? `<span class="meta-categoria">📂 ${getCategoriaNomeCurso(curso.categoria)}</span>` : ''}
                        ${curso.nivel ? `<span class="meta-nivel">📊 ${getNivelNome(curso.nivel)}</span>` : ''}
                        ${curso.duracao ? `<span class="meta-duracao">⏱️ ${formatarDuracao(curso.duracao)}</span>` : ''}
                    </div>
                    <div class="curso-detalhe-preco ${precoGratuito ? 'gratuito' : ''}">
                        ${precoGratuito ? '🎓 Gratuito' : formatarMoeda(curso.preco)}
                    </div>
                    ${curso.instrutor ? `<div class="curso-detalhe-instrutor"><i class="fa-solid fa-user-md"></i> Instrutor: ${escapeHtml(curso.instrutor)}</div>` : ''}
                </div>
            </div>
            <div class="curso-detalhe-descricao">
                <h4>📝 Sobre</h4>
                <p>${escapeHtml(curso.descricao || 'Sem descrição disponível.')}</p>
            </div>
            ${embedUrl ? `
                <div class="curso-detalhe-video">
                    <iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe>
                </div>
            ` : ''}
        `;
    }
    
    const btnAcessar = document.getElementById('btnAcessarCurso');
    if (btnAcessar) {
        const newBtn = btnAcessar.cloneNode(true);
        btnAcessar.parentNode.replaceChild(newBtn, btnAcessar);
        
        let linkDestino = null;
        if (curso.urlVideo) {
            linkDestino = curso.urlVideo;
            newBtn.innerHTML = '<i class="fa-solid fa-play"></i> Assistir Agora';
        } else if (curso.urlEbook) {
            linkDestino = curso.urlEbook;
            newBtn.innerHTML = '<i class="fa-solid fa-download"></i> Baixar Material';
        } else {
            newBtn.style.display = 'none';
        }
        
        if (linkDestino) {
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.open(linkDestino, '_blank');
            });
            newBtn.style.display = 'flex';
        }
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function fecharModalDetalheCurso() {
    const modal = document.getElementById('cursoDetalheModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function carregarCursos() {
    const cursosLista = document.getElementById('cursosLista');
    if (!cursosLista) return;
    
    cursosLista.innerHTML = `<div class="loading-cursos"><i class="fa-solid fa-spinner fa-spin"></i><p>Carregando cursos...</p></div>`;
    
    try {
        const cursosRef = collection(db, "cursos");
        const querySnapshot = await getDocs(cursosRef);
        
        if (querySnapshot.empty) {
            cursosLista.innerHTML = `<div class="empty-cursos"><i class="fa-solid fa-graduation-cap"></i><p>Nenhum curso disponível no momento.</p><p style="font-size: 0.9rem; margin-top: 8px;">Em breve novos cursos e treinamentos!</p></div>`;
            return;
        }
        
        cursosCache = [];
        let cursosHTML = '';
        
        querySnapshot.forEach(doc => {
            const curso = doc.data();
            curso.id = doc.id;
            cursosCache.push(curso);
        });
        
        cursosCache.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || ''));
        
        cursosCache.forEach((curso, idx) => {
            const tipoIcon = curso.tipo === 'video' ? '🎬' : (curso.tipo === 'ebook' ? '📚' : '🎓');
            const tipoNome = curso.tipo === 'video' ? 'Vídeo' : (curso.tipo === 'ebook' ? 'E-book' : 'Curso');
            const precoGratuito = !curso.preco || curso.preco === 0;
            
            cursosHTML += `
                <div class="curso-card-index" data-id="${curso.id}" data-index="${idx}">
                    <div class="curso-card-icon">
                        <i class="fa-solid ${curso.tipo === 'video' ? 'fa-video' : (curso.tipo === 'ebook' ? 'fa-book' : 'fa-graduation-cap')}"></i>
                    </div>
                    <div class="curso-card-info">
                        <h3>${escapeHtml(curso.titulo)}</h3>
                        <div class="curso-card-meta">
                            <span class="curso-card-tipo">${tipoIcon} ${tipoNome}</span>
                            ${curso.categoria ? `<span class="curso-card-categoria">📂 ${getCategoriaNomeCurso(curso.categoria)}</span>` : ''}
                            ${curso.nivel ? `<span class="curso-card-nivel">📊 ${getNivelNome(curso.nivel)}</span>` : ''}
                        </div>
                        ${curso.descricao ? `<p class="curso-card-descricao">${escapeHtml(curso.descricao.substring(0, 100))}${curso.descricao.length > 100 ? '...' : ''}</p>` : ''}
                        <div class="curso-card-preco ${precoGratuito ? 'gratuito' : ''}">
                            ${precoGratuito ? '🎓 Gratuito' : formatarMoeda(curso.preco)}
                        </div>
                    </div>
                    <div class="curso-card-action"><i class="fa-solid fa-chevron-right"></i></div>
                </div>
            `;
        });
        
        cursosLista.innerHTML = cursosHTML;
        
        document.querySelectorAll('.curso-card-index').forEach(card => {
            const id = card.getAttribute('data-id');
            card.addEventListener('click', () => {
                const curso = cursosCache.find(c => c.id === id);
                if (curso) abrirModalDetalheCurso(curso);
            });
        });
        
    } catch (error) {
        console.error("Erro ao carregar cursos:", error);
        cursosLista.innerHTML = `<div class="empty-cursos"><i class="fa-solid fa-circle-exclamation"></i><p>Erro ao carregar cursos: ${error.message}</p><button onclick="location.reload()" style="margin-top: 15px; padding: 8px 16px; background: #8b5cf6; border: none; border-radius: 8px; color: white; cursor: pointer;"><i class="fa-solid fa-rotate"></i> Tentar novamente</button></div>`;
    }
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener("DOMContentLoaded", function () {
    const themeToggle = document.getElementById("themeToggle");
    const shareBtn = document.getElementById("shareBtn");
    const shareModal = document.getElementById("shareModal");
    const closeShare = document.getElementById("closeShare");
    const copyLinkBtn = document.getElementById("copyLinkBtn");
    const shareLinkBtn = document.getElementById("shareLinkBtn");
    const servicosBtn = document.getElementById("servicosBtn");
    const produtosBtn = document.getElementById("produtosBtn");
    const profissionaisBtn = document.getElementById("profissionaisBtn");
    const pacotesBtn = document.getElementById("pacotesBtn");
    const cursosBtn = document.getElementById("cursosBtn");
    
    const carrosselPrev = document.getElementById('carrosselPrev');
    const carrosselNext = document.getElementById('carrosselNext');
    const fecharCarrosselBtn = document.getElementById('fecharCarrossel');
    const modalCarrosselClose = document.querySelector('.modal-carrossel-close');
    
    const fullscreenPrev = document.getElementById('fullscreenPrev');
    const fullscreenNext = document.getElementById('fullscreenNext');
    const fullscreenClose = document.getElementById('fullscreenClose');
    
    const modalCloseServicos = document.querySelector(".servicos-modal-close");
    const detalheCloseServicos = document.querySelector(".servico-detalhe-close");
    const modalCloseProdutos = document.querySelector(".produtos-modal-close");
    const detalheCloseProdutos = document.querySelector(".produto-detalhe-close");
    const modalCloseProfissionais = document.querySelector(".profissionais-modal-close");
    const detalheCloseProfissionais = document.querySelector(".profissional-detalhe-close");
    const modalClosePacotes = document.querySelector(".pacotes-modal-close");
    const detalheClosePacotes = document.querySelector(".pacote-detalhe-close");
    const modalCloseCursos = document.querySelector(".cursos-modal-close");
    const detalheCloseCursos = document.querySelector(".curso-detalhe-close");

    const currentUrl = window.location.href;

    // Autenticação
    signInAnonymously(auth).then(() => {
        autenticado = true;
    }).catch((error) => {
        console.error("Erro na autenticação:", error);
        autenticado = false;
    });

    onAuthStateChanged(auth, (user) => {
        autenticado = !!user;
    });

    // Inicializar carrinho
    adicionarBotaoCarrinho();
    carregarCarrinhoSalvo();

    // Eventos do carrossel
    if (carrosselPrev) carrosselPrev.addEventListener('click', slideAnterior);
    if (carrosselNext) carrosselNext.addEventListener('click', proximoSlide);
    if (fecharCarrosselBtn) fecharCarrosselBtn.addEventListener('click', fecharCarrossel);
    if (modalCarrosselClose) modalCarrosselClose.addEventListener('click', fecharCarrossel);
    
    if (fullscreenPrev) fullscreenPrev.addEventListener('click', anteriorFullscreen);
    if (fullscreenNext) fullscreenNext.addEventListener('click', proximoFullscreen);
    if (fullscreenClose) fullscreenClose.addEventListener('click', fecharFullscreen);
    
    document.addEventListener('keydown', (e) => {
        const carrosselActive = document.getElementById('modalCarrosselImagens')?.classList.contains('active');
        const fullscreenActive = document.getElementById('modalFullscreen')?.classList.contains('active');
        
        if (carrosselActive) {
            if (e.key === 'ArrowLeft') slideAnterior();
            else if (e.key === 'ArrowRight') proximoSlide();
            else if (e.key === 'Escape') fecharCarrossel();
        }
        
        if (fullscreenActive) {
            if (e.key === 'ArrowLeft') anteriorFullscreen();
            else if (e.key === 'ArrowRight') proximoFullscreen();
            else if (e.key === 'Escape') fecharFullscreen();
        }
    });

    // Botões principais
    if (servicosBtn) servicosBtn.addEventListener("click", (e) => { e.preventDefault(); abrirModalServicos(); });
    if (produtosBtn) produtosBtn.addEventListener("click", (e) => { e.preventDefault(); abrirModalProdutos(); });
    if (profissionaisBtn) profissionaisBtn.addEventListener("click", (e) => { e.preventDefault(); abrirModalProfissionais(); });
    if (pacotesBtn) pacotesBtn.addEventListener("click", (e) => { e.preventDefault(); abrirModalPacotes(); });
    if (cursosBtn) cursosBtn.addEventListener("click", (e) => { e.preventDefault(); abrirModalCursos(); });

    // Fechar modais
    if (modalCloseServicos) modalCloseServicos.addEventListener("click", fecharModalServicos);
    if (detalheCloseServicos) detalheCloseServicos.addEventListener("click", fecharModalDetalheServico);
    if (modalCloseProdutos) modalCloseProdutos.addEventListener("click", fecharModalProdutos);
    if (detalheCloseProdutos) detalheCloseProdutos.addEventListener("click", fecharModalDetalheProduto);
    if (modalCloseProfissionais) modalCloseProfissionais.addEventListener("click", fecharModalProfissionais);
    if (detalheCloseProfissionais) detalheCloseProfissionais.addEventListener("click", fecharModalDetalheProfissional);
    if (modalClosePacotes) modalClosePacotes.addEventListener("click", fecharModalPacotes);
    if (detalheClosePacotes) detalheClosePacotes.addEventListener("click", fecharModalDetalhePacote);
    if (modalCloseCursos) modalCloseCursos.addEventListener("click", fecharModalCursos);
    if (detalheCloseCursos) detalheCloseCursos.addEventListener("click", fecharModalDetalheCurso);

    window.addEventListener("click", (e) => {
        if (e.target === document.getElementById("servicosModal")) fecharModalServicos();
        if (e.target === document.getElementById("servicoDetalheModal")) fecharModalDetalheServico();
        if (e.target === document.getElementById("produtosModal")) fecharModalProdutos();
        if (e.target === document.getElementById("produtoDetalheModal")) fecharModalDetalheProduto();
        if (e.target === document.getElementById("profissionaisModal")) fecharModalProfissionais();
        if (e.target === document.getElementById("profissionalDetalheModal")) fecharModalDetalheProfissional();
        if (e.target === document.getElementById("pacotesModal")) fecharModalPacotes();
        if (e.target === document.getElementById("pacoteDetalheModal")) fecharModalDetalhePacote();
        if (e.target === document.getElementById("cursosModal")) fecharModalCursos();
        if (e.target === document.getElementById("cursoDetalheModal")) fecharModalDetalheCurso();
        if (e.target === document.getElementById("modalCarrosselImagens")) fecharCarrossel();
        if (e.target === document.getElementById("modalFullscreen")) fecharFullscreen();
        if (e.target === document.getElementById("modalCarrinho")) fecharModalCarrinho();
        if (e.target === document.getElementById("modalDadosComprador")) fecharModalDadosComprador();
    });

    // Tema
    let savedTheme = localStorage.getItem("theme") || "dark";
    document.body.classList.add(savedTheme);
    function updateThemeIcon() { if (themeToggle) themeToggle.textContent = document.body.classList.contains("dark") ? "🌙" : "☀️"; }
    updateThemeIcon();
    
    if (themeToggle) {
        themeToggle.addEventListener("click", () => {
            if (document.body.classList.contains("dark")) {
                document.body.classList.replace("dark", "light");
                localStorage.setItem("theme", "light");
            } else {
                document.body.classList.replace("light", "dark");
                localStorage.setItem("theme", "dark");
            }
            updateThemeIcon();
        });
    }

    // Compartilhar
    if (shareBtn && shareModal && closeShare) {
        shareBtn.addEventListener("click", () => { shareModal.style.display = "flex"; generateQRCode(); });
        closeShare.addEventListener("click", () => { shareModal.style.display = "none"; });
        window.addEventListener("click", (e) => { if (e.target === shareModal) shareModal.style.display = "none"; });
    }

    function generateQRCode() {
        const qrContainer = document.getElementById("qrcode");
        if (!qrContainer) return;
        qrContainer.innerHTML = "";
        try {
            new QRCode(qrContainer, {
                text: "https://alphabarbershop.vercel.app",
                width: 256,
                height: 256,
                colorDark: "#2199EF",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (e) { console.error("Erro ao gerar QR Code:", e); }
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(currentUrl);
                copyLinkBtn.textContent = "✅ Link copiado!";
                setTimeout(() => { copyLinkBtn.textContent = "📋 Copiar link"; }, 2000);
            } catch { alert("Erro ao copiar link"); }
        });
    }

    if (shareLinkBtn) {
        shareLinkBtn.addEventListener("click", async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: "Alpha BarberShop",
                        text: "Confira meu cartão digital! ✂️💈",
                        url: currentUrl
                    });
                } catch (err) {}
            } else {
                alert("Seu navegador não suporta compartilhamento direto.");
            }
        });
    }
});