import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    onSnapshot
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

// Estado global
let movimentacoes = [];
let clientes = [];
let profissionais = [];
let servicos = [];
let produtos = [];
let pacotes = [];
let caixaAtual = null;
let unsubscribeMovimentacoes = null;

// Estado do desconto
let descontoAplicado = { valor: 0, tipo: 'percentual', valorCalculado: 0 };
let subtotalAtual = 0;

// Elementos DOM
const movimentacoesBody = document.getElementById('movimentacoesBody');
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const filterTipo = document.getElementById('filterTipo');
const filterCategoria = document.getElementById('filterCategoria');
const btnFiltrar = document.getElementById('btnFiltrar');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnAbrirCaixa = document.getElementById('btnAbrirCaixa');
const btnFecharCaixa = document.getElementById('btnFecharCaixa');
const btnRealizarAtendimento = document.getElementById('btnRealizarAtendimento');
const btnNovaMovimentacao = document.getElementById('btnNovaMovimentacao');
const modalMovimentacao = document.getElementById('modalMovimentacao');
const modalAtendimentoCaixa = document.getElementById('modalAtendimentoCaixa');
const modalDetalhes = document.getElementById('modalDetalhesMovimentacao');
const modalExcluir = document.getElementById('modalExcluirMovimentacao');
const formMovimentacao = document.getElementById('formMovimentacao');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let movimentacaoParaExcluir = null;
let filtrosAtivos = { dataInicio: null, dataFim: null, tipo: null, categoria: null };

function mostrarToast(mensagem, tipo = 'sucesso') {
    if (!toast || !toastMsg) {
        console.log("Toast:", mensagem);
        alert(mensagem);
        return;
    }
    toastMsg.textContent = mensagem;
    toast.style.background = tipo === 'sucesso'
        ? 'linear-gradient(135deg, #2199EF, #1a7fcc)'
        : 'linear-gradient(135deg, #ef4444, #dc2626)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(data) {
    if (!data) return '-';
    if (data.toDate) data = data.toDate();
    if (data.seconds) data = new Date(data.seconds * 1000);
    if (typeof data === 'string') data = new Date(data);
    if (isNaN(data.getTime())) return data;
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function carregarDados() {
    try {
        console.log("🔄 Carregando dados do caixa...");
        
        const [clientesSnap, profissionaisSnap, servicosSnap, produtosSnap, pacotesSnap] = await Promise.all([
            getDocs(collection(db, "clientes")),
            getDocs(collection(db, "profissionais")),
            getDocs(collection(db, "servicos")),
            getDocs(collection(db, "produtos")),
            getDocs(query(collection(db, "pacotes"), where("status", "==", "ativo")))
        ]);
        
        clientes = clientesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        profissionais = profissionaisSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        servicos = servicosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        produtos = produtosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        pacotes = pacotesSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                nome: data.nome,
                preco: data.preco,
                precoOriginal: data.precoOriginal,
                desconto: data.desconto,
                servicos: data.servicos || [],
                descricao: data.descricao || '',
                status: data.status
            };
        });
        
        console.log(`✅ Clientes: ${clientes.length}, Profissionais: ${profissionais.length}, Serviços: ${servicos.length}, Produtos: ${produtos.length}, Pacotes: ${pacotes.length}`);
        
        await carregarStatusCaixa();
        popularSelects();
        carregarMovimentacoes();
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados", "erro");
        if (movimentacoesBody) {
            movimentacoesBody.innerHTML = '<tr><td colspan="9" class="loading-movimentacoes">Erro ao conectar com o banco de dados. Verifique sua conexão.</td></tr>';
        }
    }
}

async function carregarStatusCaixa() {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const caixaQuery = query(
            collection(db, "caixa"),
            where("data", "==", hoje),
            where("status", "==", "aberto")
        );
        const caixaSnap = await getDocs(caixaQuery);
        
        if (!caixaSnap.empty) {
            caixaAtual = { id: caixaSnap.docs[0].id, ...caixaSnap.docs[0].data() };
            const statusCaixaEl = document.getElementById('statusCaixa');
            if (statusCaixaEl) {
                statusCaixaEl.textContent = 'Aberto';
                statusCaixaEl.style.color = '#10b981';
            }
            const caixaAbertoPor = document.getElementById('caixaAbertoPor');
            if (caixaAbertoPor) {
                caixaAbertoPor.innerHTML = `<i class="fa-solid fa-user"></i> Aberto por: ${escapeHtml(caixaAtual.abertoPor || 'Administrador')}`;
            }
            const caixaAbertoEm = document.getElementById('caixaAbertoEm');
            if (caixaAbertoEm) {
                caixaAbertoEm.innerHTML = `<i class="fa-solid fa-clock"></i> Desde: ${formatarData(caixaAtual.dataAbertura)}`;
            }
            if (btnAbrirCaixa) btnAbrirCaixa.style.display = 'none';
            if (btnFecharCaixa) btnFecharCaixa.style.display = 'flex';
            if (btnNovaMovimentacao) btnNovaMovimentacao.disabled = false;
            if (btnRealizarAtendimento) btnRealizarAtendimento.disabled = false;
        } else {
            caixaAtual = null;
            const statusCaixaEl = document.getElementById('statusCaixa');
            if (statusCaixaEl) {
                statusCaixaEl.textContent = 'Fechado';
                statusCaixaEl.style.color = '#ef4444';
            }
            const caixaAbertoPor = document.getElementById('caixaAbertoPor');
            if (caixaAbertoPor) caixaAbertoPor.innerHTML = '';
            const caixaAbertoEm = document.getElementById('caixaAbertoEm');
            if (caixaAbertoEm) caixaAbertoEm.innerHTML = '';
            if (btnAbrirCaixa) btnAbrirCaixa.style.display = 'flex';
            if (btnFecharCaixa) btnFecharCaixa.style.display = 'none';
            if (btnNovaMovimentacao) btnNovaMovimentacao.disabled = true;
            if (btnRealizarAtendimento) btnRealizarAtendimento.disabled = true;
        }
    } catch (error) {
        console.error("Erro ao carregar status do caixa:", error);
    }
}

function popularSelects() {
    const clienteSelect = document.getElementById('movCliente');
    const clienteAtendimentoSelect = document.getElementById('atendimentoCliente');
    const profissionalSelect = document.getElementById('atendimentoProfissional');
    
    if (clienteSelect) {
        clienteSelect.innerHTML = '<option value="">Selecione um cliente</option>';
        clientes.forEach(c => {
            clienteSelect.innerHTML += `<option value="${c.id}">${escapeHtml(c.nome)}</option>`;
        });
    }
    
    if (clienteAtendimentoSelect) {
        clienteAtendimentoSelect.innerHTML = '<option value="">Selecione um cliente</option>';
        clientes.forEach(c => {
            clienteAtendimentoSelect.innerHTML += `<option value="${c.id}">${escapeHtml(c.nome)}</option>`;
        });
    }
    
    if (profissionalSelect) {
        profissionalSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
        profissionais.forEach(p => {
            profissionalSelect.innerHTML += `<option value="${p.id}">${escapeHtml(p.nome)}</option>`;
        });
    }
    
    carregarSelectsServicosProdutos();
    atualizarSelectsPacotes();
}

function carregarSelectsServicosProdutos() {
    document.querySelectorAll('.servico-select').forEach(select => {
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione um serviço</option>';
        servicos.forEach(servico => {
            select.innerHTML += `<option value="${servico.id}" data-preco="${servico.preco}" data-nome="${escapeHtml(servico.nome)}">${escapeHtml(servico.nome)} - ${formatarMoeda(servico.preco)}</option>`;
        });
        if (valorAtual) select.value = valorAtual;
    });
    
    document.querySelectorAll('.produto-select').forEach(select => {
        const valorAtual = select.value;
        select.innerHTML = '<option value="">Selecione um produto</option>';
        produtos.forEach(produto => {
            select.innerHTML += `<option value="${produto.id}" data-preco="${produto.preco}" data-nome="${escapeHtml(produto.nome)}">${escapeHtml(produto.nome)} - ${formatarMoeda(produto.preco)}</option>`;
        });
        if (valorAtual) select.value = valorAtual;
    });
}

function atualizarSelectsPacotes() {
    console.log("🔄 Atualizando selects de pacotes...", pacotes.length);
    
    document.querySelectorAll('.pacote-select').forEach(select => {
        const valorAtual = select.value;
        select.innerHTML = '<option value="">📦 Selecione um pacote</option>';
        
        if (pacotes.length === 0) {
            select.innerHTML += '<option value="" disabled>⚠️ Nenhum pacote ativo disponível</option>';
        } else {
            pacotes.forEach(pacote => {
                const descontoString = pacote.desconto > 0 ? ` (${pacote.desconto}% OFF)` : '';
                const precoFormatado = formatarMoeda(pacote.preco);
                const precoOriginalFormatado = formatarMoeda(pacote.precoOriginal);
                const economia = pacote.desconto > 0 ? ` - De ${precoOriginalFormatado} por` : '';
                
                const option = document.createElement('option');
                option.value = pacote.id;
                option.textContent = `${pacote.nome}${economia} ${precoFormatado}${descontoString}`;
                option.setAttribute('data-preco', pacote.preco);
                option.setAttribute('data-preco-original', pacote.precoOriginal);
                option.setAttribute('data-desconto', pacote.desconto);
                option.setAttribute('data-nome', pacote.nome);
                option.setAttribute('data-servicos', JSON.stringify(pacote.servicos));
                
                select.appendChild(option);
            });
        }
        
        if (valorAtual && pacotes.find(p => p.id === valorAtual)) {
            select.value = valorAtual;
            const changeEvent = new Event('change', { bubbles: true });
            select.dispatchEvent(changeEvent);
        }
    });
}

function carregarMovimentacoes() {
    console.log("🔄 Carregando movimentações...");
    
    try {
        const q = query(collection(db, "movimentacoes_caixa"), orderBy("createdAt", "desc"));
        
        if (unsubscribeMovimentacoes) {
            unsubscribeMovimentacoes();
        }
        
        unsubscribeMovimentacoes = onSnapshot(q, (snapshot) => {
            movimentacoes = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                movimentacoes.push({ 
                    id: doc.id, 
                    ...data,
                    dataFormatada: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                });
            });
            console.log(`✅ ${movimentacoes.length} movimentações carregadas`);
            
            // ✅ CORREÇÃO: Aplicar filtro padrão para mostrar apenas o dia atual
            aplicarFiltrosPadrao();
            atualizarEstatisticas();
        }, (error) => {
            console.error("Erro no listener de movimentações:", error);
            if (movimentacoesBody) {
                movimentacoesBody.innerHTML = `<tr><td colspan="9" class="loading-movimentacoes">Erro ao carregar movimentações: ${error.message}</td></tr>`;
            }
            const totalRegistros = document.getElementById('totalRegistros');
            if (totalRegistros) totalRegistros.textContent = '0 registros';
        });
    } catch (error) {
        console.error("Erro ao configurar listener:", error);
        if (movimentacoesBody) {
            movimentacoesBody.innerHTML = `<tr><td colspan="9" class="loading-movimentacoes">Erro ao configurar conexão com o banco de dados.</td></tr>`;
        }
    }
}

// ✅ NOVA FUNÇÃO: Aplicar filtro padrão (apenas o dia atual)
function aplicarFiltrosPadrao() {
    const hoje = new Date().toISOString().split('T')[0];
    
    // Se não houver filtros ativos, mostrar apenas o dia atual
    if (!filtrosAtivos.dataInicio && !filtrosAtivos.dataFim) {
        // Definir data de início e fim como o dia atual
        filtrosAtivos.dataInicio = hoje;
        filtrosAtivos.dataFim = hoje;
        
        // Atualizar os campos de data no UI
        if (dataInicio) dataInicio.value = hoje;
        if (dataFim) dataFim.value = hoje;
    }
    
    aplicarFiltros();
}

function aplicarFiltros() {
    let filtered = [...movimentacoes];
    
    if (filtrosAtivos.dataInicio) {
        filtered = filtered.filter(m => m.dataFormatada >= filtrosAtivos.dataInicio);
    }
    if (filtrosAtivos.dataFim) {
        filtered = filtered.filter(m => m.dataFormatada <= filtrosAtivos.dataFim);
    }
    if (filtrosAtivos.tipo) {
        filtered = filtered.filter(m => m.tipo === filtrosAtivos.tipo);
    }
    if (filtrosAtivos.categoria) {
        filtered = filtered.filter(m => m.categoria === filtrosAtivos.categoria);
    }
    
    renderizarMovimentacoes(filtered);
    const totalRegistros = document.getElementById('totalRegistros');
    if (totalRegistros) totalRegistros.textContent = `${filtered.length} registros`;
}

function renderizarMovimentacoes(movimentacoesList) {
    if (!movimentacoesBody) return;
    
    if (movimentacoesList.length === 0) {
        movimentacoesBody.innerHTML = '<tr><td colspan="9" class="loading-movimentacoes">Nenhuma movimentação encontrada para o período selecionado</td></tr>';
        return;
    }
    
    movimentacoesBody.innerHTML = movimentacoesList.map(mov => {
        const cliente = clientes.find(c => c.id === mov.clienteId);
        const tipoClass = mov.tipo === 'entrada' ? 'entrada' : 'saida';
        const valorClass = mov.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida';
        const tipoIcon = mov.tipo === 'entrada' ? '💰' : '💸';
        
        const formaPagamentoNome = {
            'dinheiro': '💵 Dinheiro',
            'pix': '📱 Pix',
            'cartao_credito': '💳 Cartão Crédito',
            'cartao_debito': '💳 Cartão Débito',
            'transferencia': '🏦 Transferência'
        }[mov.formaPagamento] || '-';
        
        const parcelasInfo = mov.parcelas && mov.parcelas > 1 ? ` (${mov.parcelas}x)` : '';
        const descontoString = mov.desconto && mov.desconto.valor > 0 ? ` (Desc: ${mov.desconto.tipo === 'percentual' ? mov.desconto.valor + '%' : formatarMoeda(mov.desconto.valor)})` : '';
        
        return `
            <tr>
                <td>${formatarData(mov.createdAt)}</td>
                <td><span class="tipo-badge ${tipoClass}">${tipoIcon} ${mov.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                <td>${mov.categoria || '-'}</td>
                <td>${escapeHtml(mov.descricao || '-')}${descontoString}</td>
                <td>${cliente ? escapeHtml(cliente.nome) : '-'}</td>
                <td>${formaPagamentoNome}${parcelasInfo}</td>
                <td class="${valorClass}">${mov.tipo === 'entrada' ? '+' : '-'} ${formatarMoeda(mov.valor)}</td>
                <td><span class="status-badge" style="background: rgba(16,185,129,0.15); color:#10b981;">Concluído</span></td>
                <td class="mov-actions">
                    <button class="btn-view-mov" data-id="${mov.id}" title="Visualizar"><i class="fa-regular fa-eye"></i></button>
                    <button class="btn-edit-mov" data-id="${mov.id}" title="Editar"><i class="fa-regular fa-pen-to-square"></i></button>
                    <button class="btn-delete-mov" data-id="${mov.id}" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    }).join('');
    
    document.querySelectorAll('.btn-view-mov').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const mov = movimentacoes.find(m => m.id === id);
            if (mov) abrirModalDetalhes(mov);
        });
    });
    
    document.querySelectorAll('.btn-edit-mov').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const mov = movimentacoes.find(m => m.id === id);
            if (mov) abrirModalMovimentacao(mov);
        });
    });
    
    document.querySelectorAll('.btn-delete-mov').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const mov = movimentacoes.find(m => m.id === id);
            if (mov) abrirModalExcluir(mov);
        });
    });
}

function atualizarEstatisticas() {
    const hoje = new Date().toISOString().split('T')[0];
    const movimentacoesHoje = movimentacoes.filter(m => m.dataFormatada === hoje);
    
    const totalEntradas = movimentacoesHoje.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.valor, 0);
    const totalSaidas = movimentacoesHoje.filter(m => m.tipo === 'saida').reduce((sum, m) => sum + m.valor, 0);
    const saldoAtual = totalEntradas - totalSaidas;
    
    const saldoAtualEl = document.getElementById('saldoAtual');
    const totalEntradasEl = document.getElementById('totalEntradas');
    const totalSaidasEl = document.getElementById('totalSaidas');
    const totalMovimentacoesEl = document.getElementById('totalMovimentacoes');
    
    if (saldoAtualEl) saldoAtualEl.textContent = formatarMoeda(saldoAtual);
    if (totalEntradasEl) totalEntradasEl.textContent = formatarMoeda(totalEntradas);
    if (totalSaidasEl) totalSaidasEl.textContent = formatarMoeda(totalSaidas);
    if (totalMovimentacoesEl) totalMovimentacoesEl.textContent = movimentacoesHoje.length;
}

async function abrirCaixa() {
    console.log("🔓 Abrindo caixa...");
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        const caixaExistente = await getDocs(query(
            collection(db, "caixa"),
            where("data", "==", hoje),
            where("status", "==", "aberto")
        ));
        
        if (!caixaExistente.empty) {
            mostrarToast("Já existe um caixa aberto para hoje!", "erro");
            await carregarStatusCaixa();
            return;
        }
        
        const user = auth.currentUser;
        await addDoc(collection(db, "caixa"), {
            data: hoje,
            status: "aberto",
            saldoInicial: 0,
            abertoPor: user?.email || "Administrador",
            dataAbertura: Timestamp.now(),
            createdAt: Timestamp.now()
        });
        
        mostrarToast("Caixa aberto com sucesso!");
        await carregarStatusCaixa();
        
    } catch (error) {
        console.error("Erro ao abrir caixa:", error);
        mostrarToast("Erro ao abrir caixa: " + error.message, "erro");
    }
}

async function fecharCaixa() {
    console.log("🔒 Fechando caixa...");
    if (!caixaAtual) {
        mostrarToast("Nenhum caixa aberto para fechar", "erro");
        return;
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    const movimentacoesHoje = movimentacoes.filter(m => m.dataFormatada === hoje);
    const totalEntradas = movimentacoesHoje.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.valor, 0);
    const totalSaidas = movimentacoesHoje.filter(m => m.tipo === 'saida').reduce((sum, m) => sum + m.valor, 0);
    const saldoFinal = totalEntradas - totalSaidas;
    
    const confirmar = confirm(`Fechar caixa?\n\n📊 Resumo do dia:\n💰 Entradas: ${formatarMoeda(totalEntradas)}\n💸 Saídas: ${formatarMoeda(totalSaidas)}\n💵 Saldo Final: ${formatarMoeda(saldoFinal)}`);
    
    if (!confirmar) return;
    
    try {
        const user = auth.currentUser;
        await updateDoc(doc(db, "caixa", caixaAtual.id), {
            status: "fechado",
            saldoFinal: saldoFinal,
            totalEntradas: totalEntradas,
            totalSaidas: totalSaidas,
            dataFechamento: Timestamp.now(),
            fechadoPor: user?.email || "Administrador"
        });
        
        mostrarToast("Caixa fechado com sucesso!");
        await carregarStatusCaixa();
        
    } catch (error) {
        console.error("Erro ao fechar caixa:", error);
        mostrarToast("Erro ao fechar caixa: " + error.message, "erro");
    }
}

async function salvarMovimentacao(dados) {
    try {
        const movData = {
            tipo: dados.tipo,
            categoria: dados.categoria,
            valor: Number(dados.valor),
            descricao: dados.descricao || '',
            formaPagamento: dados.formaPagamento || null,
            parcelas: dados.parcelas || 1,
            clienteId: dados.clienteId || null,
            comprovante: dados.comprovante || '',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        console.log("💾 Salvando movimentação:", movData);
        
        if (dados.id) {
            await updateDoc(doc(db, "movimentacoes_caixa", dados.id), movData);
            mostrarToast("Movimentação atualizada com sucesso!");
        } else {
            await addDoc(collection(db, "movimentacoes_caixa"), movData);
            mostrarToast("Movimentação registrada com sucesso!");
        }
        
        fecharModalMovimentacao();
        
    } catch (error) {
        console.error("Erro ao salvar movimentação:", error);
        mostrarToast("Erro ao salvar movimentação: " + error.message, "erro");
    }
}

async function deletarMovimentacao(id) {
    try {
        await deleteDoc(doc(db, "movimentacoes_caixa", id));
        mostrarToast("Movimentação excluída com sucesso!");
        fecharModalExcluir();
    } catch (error) {
        console.error("Erro ao excluir movimentação:", error);
        mostrarToast("Erro ao excluir movimentação", "erro");
    }
}

function abrirModalMovimentacao(mov = null) {
    console.log("📝 Abrindo modal movimentação...");
    const title = document.getElementById('modalMovimentacaoTitle');
    const movId = document.getElementById('movimentacaoId');
    const movTipo = document.getElementById('movTipo');
    const movCategoria = document.getElementById('movCategoria');
    const movValor = document.getElementById('movValor');
    const movDescricao = document.getElementById('movDescricao');
    const movFormaPagamento = document.getElementById('movFormaPagamento');
    const movCliente = document.getElementById('movCliente');
    const movComprovante = document.getElementById('movComprovante');
    const parcelasGroup = document.getElementById('movParcelasGroup');
    const movParcelas = document.getElementById('movParcelas');
    
    if (mov) {
        title.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Movimentação';
        movId.value = mov.id;
        movTipo.value = mov.tipo || '';
        movCategoria.value = mov.categoria || '';
        movValor.value = mov.valor || '';
        movDescricao.value = mov.descricao || '';
        movFormaPagamento.value = mov.formaPagamento || '';
        movCliente.value = mov.clienteId || '';
        movComprovante.value = mov.comprovante || '';
        if (movParcelas) movParcelas.value = mov.parcelas || 1;
        if (parcelasGroup) parcelasGroup.style.display = mov.formaPagamento === 'cartao_credito' ? 'block' : 'none';
    } else {
        title.innerHTML = '<i class="fa-solid fa-plus"></i> Nova Movimentação';
        movId.value = '';
        if (document.getElementById('formMovimentacao')) document.getElementById('formMovimentacao').reset();
        movTipo.value = '';
        movCategoria.value = '';
        movValor.value = '';
        movDescricao.value = '';
        movFormaPagamento.value = '';
        movCliente.value = '';
        movComprovante.value = '';
        if (movParcelas) movParcelas.value = '1';
        if (parcelasGroup) parcelasGroup.style.display = 'none';
    }
    
    if (modalMovimentacao) modalMovimentacao.classList.add('active');
}

function fecharModalMovimentacao() {
    if (modalMovimentacao) modalMovimentacao.classList.remove('active');
}

// ==================== FUNÇÕES DE DESCONTO ====================

function toggleDescontoForm() {
    const descontoForm = document.getElementById('descontoForm');
    const descontoIcon = document.getElementById('descontoIcon');
    
    if (descontoAplicado.valor > 0) {
        return;
    }
    
    if (descontoForm && descontoForm.style.display === 'none') {
        descontoForm.style.display = 'block';
        if (descontoIcon) descontoIcon.classList.add('rotated');
    } else if (descontoForm) {
        descontoForm.style.display = 'none';
        if (descontoIcon) descontoIcon.classList.remove('rotated');
    }
}

function aplicarDesconto() {
    const descontoTipo = document.getElementById('descontoTipo').value;
    const descontoValor = parseFloat(document.getElementById('descontoValor').value);
    
    if (isNaN(descontoValor) || descontoValor <= 0) {
        mostrarToast("Informe um valor de desconto válido", "erro");
        return;
    }
    
    const subtotal = subtotalAtual;
    let valorDesconto = 0;
    let totalFinal = subtotal;
    
    if (descontoTipo === 'percentual') {
        if (descontoValor > 100) {
            mostrarToast("Percentual de desconto não pode ultrapassar 100%", "erro");
            return;
        }
        valorDesconto = (subtotal * descontoValor) / 100;
        totalFinal = subtotal - valorDesconto;
    } else {
        if (descontoValor > subtotal) {
            mostrarToast("Valor do desconto não pode ser maior que o subtotal", "erro");
            return;
        }
        valorDesconto = descontoValor;
        totalFinal = subtotal - valorDesconto;
    }
    
    descontoAplicado = { valor: descontoValor, tipo: descontoTipo, valorCalculado: valorDesconto };
    
    const descontoForm = document.getElementById('descontoForm');
    const descontoInfo = document.getElementById('descontoInfo');
    const descontoIcon = document.getElementById('descontoIcon');
    const descontoTexto = document.getElementById('descontoTexto');
    const btnRemoverDesconto = document.getElementById('btnRemoverDesconto');
    const btnAplicarDesconto = document.getElementById('btnAplicarDesconto');
    
    if (descontoForm) descontoForm.style.display = 'none';
    if (descontoInfo) descontoInfo.style.display = 'flex';
    if (descontoIcon) descontoIcon.classList.remove('rotated');
    
    const textoDesconto = descontoTipo === 'percentual' 
        ? `${descontoValor}% de desconto (-${formatarMoeda(valorDesconto)})`
        : `Desconto de ${formatarMoeda(descontoValor)} (-${formatarMoeda(valorDesconto)})`;
    if (descontoTexto) descontoTexto.textContent = textoDesconto;
    
    if (btnRemoverDesconto) btnRemoverDesconto.style.display = 'inline-flex';
    if (btnAplicarDesconto) btnAplicarDesconto.style.display = 'none';
    
    const totalEl = document.getElementById('atendimentoTotal');
    if (totalEl) totalEl.textContent = formatarMoeda(totalFinal);
    
    const descontoValorInput = document.getElementById('descontoValor');
    if (descontoValorInput) descontoValorInput.value = '';
    
    mostrarToast(`Desconto aplicado! Total: ${formatarMoeda(totalFinal)}`, "success");
}

function removerDesconto() {
    descontoAplicado = { valor: 0, tipo: 'percentual', valorCalculado: 0 };
    
    const descontoInfo = document.getElementById('descontoInfo');
    const descontoForm = document.getElementById('descontoForm');
    const btnRemoverDesconto = document.getElementById('btnRemoverDesconto');
    const btnAplicarDesconto = document.getElementById('btnAplicarDesconto');
    const descontoIcon = document.getElementById('descontoIcon');
    
    if (descontoInfo) descontoInfo.style.display = 'none';
    if (descontoForm) descontoForm.style.display = 'none';
    if (btnRemoverDesconto) btnRemoverDesconto.style.display = 'none';
    if (btnAplicarDesconto) btnAplicarDesconto.style.display = 'inline-flex';
    if (descontoIcon) descontoIcon.classList.remove('rotated');
    
    calcularTotalAtendimento();
    
    mostrarToast("Desconto removido!", "info");
}

// ==================== FUNÇÕES DE ITENS (SERVIÇOS, PRODUTOS, PACOTES) ====================

function adicionarItemVazio(container, tipo) {
    if (!container) return;
    
    const isServico = tipo === 'servico';
    const novoItem = document.createElement('div');
    novoItem.className = `item-atendimento ${isServico ? 'servico-item' : 'produto-item'}`;
    novoItem.innerHTML = `
        <div class="item-row">
            <div class="item-select">
                <select class="${isServico ? 'servico-select' : 'produto-select'}">
                    <option value="">Selecione um ${isServico ? 'serviço' : 'produto'}</option>
                </select>
            </div>
            <div class="item-quantidade">
                <input type="number" class="quantidade-input" placeholder="Qtd" value="1" min="1">
            </div>
            <div class="item-preco">
                <input type="number" class="preco-input" placeholder="Preço" step="0.01">
            </div>
            <div class="item-total">
                <span class="item-total-valor">R$ 0,00</span>
            </div>
            <div class="item-acoes">
                <button type="button" class="btn-remove-item">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    
    const select = novoItem.querySelector('select');
    if (isServico) {
        servicos.forEach(servico => {
            const option = document.createElement('option');
            option.value = servico.id;
            option.textContent = `${servico.nome} - ${formatarMoeda(servico.preco)}`;
            option.setAttribute('data-preco', servico.preco);
            option.setAttribute('data-nome', servico.nome);
            select.appendChild(option);
        });
    } else {
        produtos.forEach(produto => {
            const option = document.createElement('option');
            option.value = produto.id;
            option.textContent = `${produto.nome} - ${formatarMoeda(produto.preco)}`;
            option.setAttribute('data-preco', produto.preco);
            option.setAttribute('data-nome', produto.nome);
            select.appendChild(option);
        });
    }
    
    configurarEventosItem(novoItem);
    container.appendChild(novoItem);
}

function configurarEventosItem(item) {
    const select = item.querySelector('select');
    const quantidadeInput = item.querySelector('.quantidade-input');
    const precoInput = item.querySelector('.preco-input');
    const btnRemover = item.querySelector('.btn-remove-item');
    const totalSpan = item.querySelector('.item-total-valor');
    
    const atualizarTotal = () => {
        const quantidade = parseFloat(quantidadeInput?.value) || 1;
        const preco = parseFloat(precoInput?.value) || 0;
        const total = quantidade * preco;
        if (totalSpan) totalSpan.textContent = formatarMoeda(total);
        calcularTotalAtendimento();
    };
    
    if (select) {
        select.addEventListener('change', () => {
            const option = select.options[select.selectedIndex];
            const preco = option?.getAttribute('data-preco') || 0;
            if (precoInput) precoInput.value = preco;
            atualizarTotal();
        });
    }
    
    if (quantidadeInput) quantidadeInput.addEventListener('input', atualizarTotal);
    if (precoInput) precoInput.addEventListener('input', atualizarTotal);
    
    if (btnRemover) {
        btnRemover.addEventListener('click', () => {
            item.remove();
            calcularTotalAtendimento();
            const container = item.parentElement;
            const tipo = item.classList.contains('servico-item') ? 'servico' : 'produto';
            if (container && container.children.length === 0) {
                adicionarItemVazio(container, tipo);
            }
        });
        btnRemover.style.display = 'flex';
    }
}

function adicionarItemPacoteVazio(container) {
    if (!container) return;
    
    const emptyMessage = container.querySelector('.empty-pacotes-message');
    if (emptyMessage) emptyMessage.remove();
    
    const novoItem = document.createElement('div');
    novoItem.className = 'item-atendimento pacote-item';
    novoItem.setAttribute('data-pacote-item', 'true');
    novoItem.innerHTML = `
        <div class="item-row">
            <div class="item-select" style="flex: 3;">
                <select class="pacote-select" style="width: 100%;">
                    <option value="">📦 Selecione um pacote</option>
                </select>
            </div>
            <div class="item-quantidade">
                <input type="number" class="quantidade-input" placeholder="Qtd" value="1" min="1" style="width: 70px;">
            </div>
            <div class="item-preco">
                <input type="number" class="preco-input" placeholder="Preço" step="0.01" readonly style="width: 100px;">
            </div>
            <div class="item-total">
                <span class="item-total-valor">R$ 0,00</span>
            </div>
            <div class="item-acoes">
                <button type="button" class="btn-remove-item" title="Remover pacote">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="pacote-info-adicional"></div>
    `;
    
    const select = novoItem.querySelector('.pacote-select');
    if (select) {
        pacotes.forEach(pacote => {
            const descontoString = pacote.desconto > 0 ? ` (${pacote.desconto}% OFF)` : '';
            const precoFormatado = formatarMoeda(pacote.preco);
            const precoOriginalFormatado = formatarMoeda(pacote.precoOriginal);
            const economia = pacote.desconto > 0 ? ` - De ${precoOriginalFormatado} por` : '';
            
            const option = document.createElement('option');
            option.value = pacote.id;
            option.textContent = `${pacote.nome}${economia} ${precoFormatado}${descontoString}`;
            option.setAttribute('data-preco', pacote.preco);
            option.setAttribute('data-preco-original', pacote.precoOriginal);
            option.setAttribute('data-desconto', pacote.desconto);
            option.setAttribute('data-nome', pacote.nome);
            option.setAttribute('data-servicos', JSON.stringify(pacote.servicos));
            
            select.appendChild(option);
        });
    }
    
    configurarEventosItemPacote(novoItem);
    container.appendChild(novoItem);
}

function configurarEventosItemPacote(item) {
    const select = item.querySelector('.pacote-select');
    const quantidadeInput = item.querySelector('.quantidade-input');
    const precoInput = item.querySelector('.preco-input');
    const btnRemover = item.querySelector('.btn-remove-item');
    const totalSpan = item.querySelector('.item-total-valor');
    const infoAdicional = item.querySelector('.pacote-info-adicional');
    
    const atualizarTotal = () => {
        const quantidade = parseFloat(quantidadeInput?.value) || 1;
        const preco = parseFloat(precoInput?.value) || 0;
        const total = quantidade * preco;
        if (totalSpan) totalSpan.textContent = formatarMoeda(total);
        calcularTotalAtendimento();
    };
    
    if (select) {
        select.addEventListener('change', () => {
            const selectedOption = select.options[select.selectedIndex];
            if (selectedOption && selectedOption.value) {
                const preco = parseFloat(selectedOption.getAttribute('data-preco') || 0);
                const precoOriginal = parseFloat(selectedOption.getAttribute('data-preco-original') || 0);
                const desconto = parseFloat(selectedOption.getAttribute('data-desconto') || 0);
                const nomePacote = selectedOption.getAttribute('data-nome') || '';
                const servicosJson = selectedOption.getAttribute('data-servicos') || '[]';
                
                let servicosLista = [];
                try {
                    servicosLista = JSON.parse(servicosJson);
                } catch(e) { 
                    console.error("Erro ao parsear serviços:", e);
                }
                
                if (precoInput) precoInput.value = preco;
                
                if (infoAdicional) {
                    if (servicosLista.length > 0) {
                        const servicosNomes = servicosLista.map(s => s.nome || s).join(', ');
                        const economia = precoOriginal - preco;
                        
                        infoAdicional.innerHTML = `
                            <span><i class="fa-solid fa-scissors"></i> ${servicosLista.length} serviço(s): ${servicosNomes}</span>
                            ${economia > 0 ? `<span><i class="fa-solid fa-tag"></i> Economia: ${formatarMoeda(economia)} (${desconto}% OFF)</span>` : ''}
                            <span><i class="fa-solid fa-calculator"></i> Valor unitário: ${formatarMoeda(preco)}</span>
                        `;
                    } else {
                        infoAdicional.innerHTML = `
                            <span><i class="fa-solid fa-gift"></i> ${nomePacote}</span>
                            <span><i class="fa-solid fa-calculator"></i> Valor: ${formatarMoeda(preco)}</span>
                        `;
                    }
                }
                
                atualizarTotal();
            } else {
                if (precoInput) precoInput.value = '';
                if (infoAdicional) infoAdicional.innerHTML = '';
                atualizarTotal();
            }
        });
    }
    
    if (quantidadeInput) {
        quantidadeInput.addEventListener('input', atualizarTotal);
    }
    
    if (precoInput) {
        precoInput.addEventListener('input', atualizarTotal);
    }
    
    if (btnRemover) {
        btnRemover.addEventListener('click', () => {
            item.remove();
            calcularTotalAtendimento();
            const container = item.parentElement;
            if (container && container.children.length === 0) {
                container.innerHTML = `
                    <div class="empty-pacotes-message">
                        <i class="fa-solid fa-gift"></i>
                        <span>Nenhum pacote adicionado</span>
                        <small>Clique em "Adicionar Pacote" para começar</small>
                    </div>
                `;
            }
        });
        btnRemover.style.display = 'flex';
    }
    
    if (select && select.value) {
        const changeEvent = new Event('change', { bubbles: true });
        select.dispatchEvent(changeEvent);
    }
}

function adicionarServicoAtendimento() {
    console.log("➕ Adicionando serviço...");
    const container = document.getElementById('servicosAtendimentoContainer');
    if (container) adicionarItemVazio(container, 'servico');
}

function adicionarProdutoAtendimento() {
    console.log("➕ Adicionando produto...");
    const container = document.getElementById('produtosAtendimentoContainer');
    if (container) adicionarItemVazio(container, 'produto');
}

function adicionarPacoteAtendimento() {
    console.log("➕ Adicionando pacote...");
    const container = document.getElementById('pacotesAtendimentoContainer');
    if (!container) return;
    
    const emptyMessage = container.querySelector('.empty-pacotes-message');
    if (emptyMessage) emptyMessage.remove();
    
    adicionarItemPacoteVazio(container);
}

// ==================== CÁLCULO DE TOTAIS E FINALIZAR ATENDIMENTO ====================

function calcularTotalAtendimento() {
    let total = 0;
    
    document.querySelectorAll('#servicosAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            total += quantidade * preco;
        }
    });
    
    document.querySelectorAll('#produtosAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            total += quantidade * preco;
        }
    });
    
    document.querySelectorAll('#pacotesAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            total += quantidade * preco;
        }
    });
    
    subtotalAtual = total;
    
    let totalFinal = total;
    if (descontoAplicado.valor > 0) {
        if (descontoAplicado.tipo === 'percentual') {
            const valorDesconto = (total * descontoAplicado.valor) / 100;
            totalFinal = total - valorDesconto;
            descontoAplicado.valorCalculado = valorDesconto;
        } else {
            totalFinal = Math.max(0, total - descontoAplicado.valor);
            descontoAplicado.valorCalculado = Math.min(descontoAplicado.valor, total);
        }
        
        const descontoTexto = document.getElementById('descontoTexto');
        if (descontoTexto) {
            const texto = descontoAplicado.tipo === 'percentual' 
                ? `${descontoAplicado.valor}% de desconto (-${formatarMoeda(descontoAplicado.valorCalculado)})`
                : `Desconto de ${formatarMoeda(descontoAplicado.valor)} (-${formatarMoeda(descontoAplicado.valorCalculado)})`;
            descontoTexto.textContent = texto;
        }
    }
    
    const subtotalEl = document.getElementById('atendimentoSubtotal');
    const totalEl = document.getElementById('atendimentoTotal');
    if (subtotalEl) subtotalEl.textContent = formatarMoeda(total);
    if (totalEl) totalEl.textContent = formatarMoeda(totalFinal);
    
    return { subtotal: total, total: totalFinal, desconto: descontoAplicado };
}

function resetarFormularioAtendimento() {
    const clienteSelect = document.getElementById('atendimentoCliente');
    const profissionalSelect = document.getElementById('atendimentoProfissional');
    const pagamentoSelect = document.getElementById('atendimentoPagamento');
    const observacoesTextarea = document.getElementById('atendimentoObservacoes');
    
    if (clienteSelect) clienteSelect.value = '';
    if (profissionalSelect) profissionalSelect.value = '';
    if (pagamentoSelect) pagamentoSelect.value = 'dinheiro';
    if (observacoesTextarea) observacoesTextarea.value = '';
    
    const parcelasGroup = document.getElementById('atendimentoParcelasGroup');
    if (parcelasGroup) parcelasGroup.style.display = 'none';
    
    descontoAplicado = { valor: 0, tipo: 'percentual', valorCalculado: 0 };
    const descontoInfo = document.getElementById('descontoInfo');
    const descontoForm = document.getElementById('descontoForm');
    const btnRemoverDesconto = document.getElementById('btnRemoverDesconto');
    const btnAplicarDesconto = document.getElementById('btnAplicarDesconto');
    const descontoIcon = document.getElementById('descontoIcon');
    
    if (descontoInfo) descontoInfo.style.display = 'none';
    if (descontoForm) descontoForm.style.display = 'none';
    if (btnRemoverDesconto) btnRemoverDesconto.style.display = 'none';
    if (btnAplicarDesconto) btnAplicarDesconto.style.display = 'inline-flex';
    if (descontoIcon) descontoIcon.classList.remove('rotated');
    
    const servicosContainer = document.getElementById('servicosAtendimentoContainer');
    if (servicosContainer) {
        servicosContainer.innerHTML = '';
        adicionarItemVazio(servicosContainer, 'servico');
    }
    
    const produtosContainer = document.getElementById('produtosAtendimentoContainer');
    if (produtosContainer) {
        produtosContainer.innerHTML = '';
        adicionarItemVazio(produtosContainer, 'produto');
    }
    
    const pacotesContainer = document.getElementById('pacotesAtendimentoContainer');
    if (pacotesContainer) {
        pacotesContainer.innerHTML = `
            <div class="empty-pacotes-message">
                <i class="fa-solid fa-gift"></i>
                <span>Nenhum pacote adicionado</span>
                <small>Clique em "Adicionar Pacote" para começar</small>
            </div>
        `;
    }
    
    calcularTotalAtendimento();
}

async function recarregarPacotes() {
    try {
        const pacotesSnap = await getDocs(query(collection(db, "pacotes"), where("status", "==", "ativo")));
        pacotes = [];
        pacotesSnap.forEach(doc => {
            const data = doc.data();
            pacotes.push({
                id: doc.id,
                nome: data.nome,
                preco: data.preco,
                precoOriginal: data.precoOriginal,
                desconto: data.desconto,
                servicos: data.servicos || [],
                descricao: data.descricao || '',
                status: data.status
            });
        });
        console.log(`📦 ${pacotes.length} pacotes ativos carregados`);
        atualizarSelectsPacotes();
        return pacotes;
    } catch (error) {
        console.error("Erro ao recarregar pacotes:", error);
        return [];
    }
}

async function abrirModalAtendimento() {
    console.log("✂️ Abrindo modal de atendimento...");
    await recarregarPacotes();
    resetarFormularioAtendimento();
    limparInfoComanda();
    if (modalAtendimentoCaixa) modalAtendimentoCaixa.classList.add('active');
}

function fecharModalAtendimento() {
    if (modalAtendimentoCaixa) modalAtendimentoCaixa.classList.remove('active');
}

// ==================== FUNÇÃO AUXILIAR PARA PONTOS DE FIDELIDADE ====================

async function adicionarPontosFidelidadeCliente(clienteId, clienteNome, valorTotal, tipo = "servico") {
    try {
        if (!clienteId) return false;
        
        const configDoc = await getDoc(doc(db, "configuracoes", "fidelidade"));
        let config = { pontosPorRealServico: 1, pontosPorRealProduto: 0.5 };
        if (configDoc.exists()) {
            config = configDoc.data();
        }
        
        let pontos = 0;
        if (tipo === "servico") {
            pontos = Math.floor(valorTotal * (config.pontosPorRealServico || 1));
        } else {
            pontos = Math.floor(valorTotal * (config.pontosPorRealProduto || 0.5));
        }
        
        if (pontos === 0) return false;
        
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
        }
        
        await addDoc(collection(db, "historico_pontos"), {
            clienteId: clienteId,
            clienteNome: clienteNome,
            quantidade: pontos,
            motivo: `Atendimento finalizado no caixa - ${formatarMoeda(valorTotal)}`,
            data: Timestamp.now()
        });
        
        console.log(`🎉 +${pontos} pontos de fidelidade adicionados para ${clienteNome}`);
        return true;
        
    } catch (error) {
        console.error("Erro ao adicionar pontos de fidelidade:", error);
        return false;
    }
}

// ==================== FUNÇÃO PRINCIPAL: FINALIZAR ATENDIMENTO (CORRIGIDA COM SINCRONIZAÇÃO) ====================

async function finalizarAtendimento() {
    console.log("💾 Finalizando atendimento...");
    
    const clienteId = document.getElementById('atendimentoCliente')?.value;
    const profissionalId = document.getElementById('atendimentoProfissional')?.value;
    const formaPagamento = document.getElementById('atendimentoPagamento')?.value;
    const parcelas = parseInt(document.getElementById('atendimentoParcelas')?.value) || 1;
    const observacoes = document.getElementById('atendimentoObservacoes')?.value || '';
    
    if (!clienteId) {
        mostrarToast("Selecione um cliente", "erro");
        return;
    }
    
    if (!caixaAtual) {
        mostrarToast("Caixa está fechado. Abra o caixa primeiro!", "erro");
        return;
    }
    
    let subtotal = 0;
    let servicosLista = [];
    let produtosLista = [];
    let pacotesLista = [];
    let descricaoItens = [];
    
    document.querySelectorAll('#servicosAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            const option = select.options[select.selectedIndex];
            const nome = option?.getAttribute('data-nome') || '';
            const itemTotal = preco * quantidade;
            subtotal += itemTotal;
            servicosLista.push({ id: select.value, nome, preco, quantidade, total: itemTotal });
            descricaoItens.push(`${nome} (${quantidade}x)`);
        }
    });
    
    document.querySelectorAll('#produtosAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            const option = select.options[select.selectedIndex];
            const nome = option?.getAttribute('data-nome') || '';
            const itemTotal = preco * quantidade;
            subtotal += itemTotal;
            produtosLista.push({ id: select.value, nome, preco, quantidade, total: itemTotal });
            descricaoItens.push(`${nome} (${quantidade}x)`);
        }
    });
    
    document.querySelectorAll('#pacotesAtendimentoContainer .item-atendimento').forEach(item => {
        const select = item.querySelector('select');
        const quantidade = parseFloat(item.querySelector('.quantidade-input')?.value) || 1;
        const preco = parseFloat(item.querySelector('.preco-input')?.value) || 0;
        if (select && select.value) {
            const option = select.options[select.selectedIndex];
            const nome = option?.getAttribute('data-nome') || '';
            const servicosJson = option?.getAttribute('data-servicos') || '[]';
            let servicosPacote = [];
            try {
                servicosPacote = JSON.parse(servicosJson);
            } catch(e) { console.error(e); }
            const itemTotal = preco * quantidade;
            subtotal += itemTotal;
            pacotesLista.push({ 
                id: select.value, 
                nome, 
                preco, 
                quantidade, 
                total: itemTotal,
                servicos: servicosPacote
            });
            descricaoItens.push(`Pacote: ${nome} (${quantidade}x)`);
        }
    });
    
    if (subtotal <= 0) {
        mostrarToast("Adicione pelo menos um serviço, produto ou pacote", "erro");
        return;
    }
    
    let total = subtotal;
    let descontoAplicadoInfo = null;
    
    if (descontoAplicado.valor > 0) {
        if (descontoAplicado.tipo === 'percentual') {
            const valorDesconto = (subtotal * descontoAplicado.valor) / 100;
            total = subtotal - valorDesconto;
            descontoAplicadoInfo = {
                tipo: descontoAplicado.tipo,
                valor: descontoAplicado.valor,
                valorCalculado: valorDesconto
            };
        } else {
            const valorDesconto = Math.min(descontoAplicado.valor, subtotal);
            total = subtotal - valorDesconto;
            descontoAplicadoInfo = {
                tipo: descontoAplicado.tipo,
                valor: descontoAplicado.valor,
                valorCalculado: valorDesconto
            };
        }
    }
    
    const cliente = clientes.find(c => c.id === clienteId);
    
    // ========== VERIFICAR SE EXISTE UMA COMANDA ABERTA PARA ESTE CLIENTE ==========
    let comandaExistente = null;
    let agendamentoId = null;
    
    try {
        console.log("🔍 Verificando se existe comanda aberta para o cliente...");
        
        const comandasQuery = query(
            collection(db, "comandas"),
            where("clienteId", "==", clienteId),
            where("status", "in", ["aberta", "em_andamento"])
        );
        const comandasSnapshot = await getDocs(comandasQuery);
        
        if (!comandasSnapshot.empty) {
            comandaExistente = { id: comandasSnapshot.docs[0].id, ...comandasSnapshot.docs[0].data() };
            agendamentoId = comandaExistente.agendamentoId;
            console.log(`✅ Comanda encontrada: ${comandaExistente.id}, Agendamento ID: ${agendamentoId}`);
        } else {
            console.log("ℹ️ Nenhuma comanda aberta encontrada para este cliente");
        }
    } catch (error) {
        console.error("Erro ao buscar comanda existente:", error);
    }
    
    try {
        // ========== SALVAR MOVIMENTAÇÃO NO CAIXA ==========
        const movData = {
            tipo: 'entrada',
            categoria: 'atendimento',
            valor: total,
            subtotal: subtotal,
            desconto: descontoAplicadoInfo,
            descricao: descricaoItens.join(', ') || `Atendimento - ${cliente?.nome}`,
            formaPagamento: formaPagamento,
            parcelas: formaPagamento === 'cartao_credito' ? parcelas : 1,
            clienteId: clienteId,
            profissionalId: profissionalId || null,
            servicos: servicosLista,
            produtos: produtosLista,
            pacotes: pacotesLista,
            observacoes: observacoes,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        
        console.log("💾 Salvando movimentação:", movData);
        await addDoc(collection(db, "movimentacoes_caixa"), movData);
        
        // ========== ATUALIZAR COMANDA EXISTENTE (SE HOUVER) ==========
        if (comandaExistente) {
            console.log(`📝 Atualizando comanda existente: ${comandaExistente.id}`);
            
            const comandaUpdateData = {
                servicos: servicosLista.map(s => ({
                    servicoId: s.id,
                    nome: s.nome,
                    preco: s.preco,
                    quantidade: s.quantidade,
                    tipo: "servico"
                })),
                produtos: produtosLista.map(p => ({
                    produtoId: p.id,
                    nome: p.nome,
                    preco: p.preco,
                    quantidade: p.quantidade,
                    isPreLancamento: false
                })),
                pacotes: pacotesLista.map(p => ({
                    pacoteId: p.id,
                    nome: p.nome,
                    preco: p.preco,
                    quantidade: p.quantidade,
                    servicos: p.servicos
                })),
                subtotal: subtotal,
                total: total,
                desconto: descontoAplicadoInfo,
                formaPagamento: formaPagamento,
                parcelas: formaPagamento === 'cartao_credito' ? parcelas : 1,
                observacoes: observacoes,
                status: "finalizada",
                dataFinalizacao: Timestamp.now(),
                updatedAt: Timestamp.now()
            };
            
            await updateDoc(doc(db, "comandas", comandaExistente.id), comandaUpdateData);
            console.log(`✅ Comanda ${comandaExistente.id} atualizada para status "finalizada"`);
            
            // ========== SINCRONIZAR COM AGENDAMENTO ==========
            if (agendamentoId) {
                console.log(`🔄 Sincronizando com agendamento: ${agendamentoId}`);
                
                try {
                    const agendamentoRef = doc(db, "agendamentos", agendamentoId);
                    const agendamentoDoc = await getDoc(agendamentoRef);
                    
                    if (agendamentoDoc.exists()) {
                        const agendamentoAtual = agendamentoDoc.data();
                        
                        if (agendamentoAtual.status === "confirmado" || agendamentoAtual.status === "aguardando_pagamento") {
                            await updateDoc(agendamentoRef, {
                                status: "concluido",
                                dataConclusao: Timestamp.now(),
                                atualizadoEm: Timestamp.now(),
                                valorPago: total,
                                formaPagamento: formaPagamento,
                                parcelas: formaPagamento === 'cartao_credito' ? parcelas : 1
                            });
                            console.log(`✅ Agendamento ${agendamentoId} atualizado para status "concluido"`);
                            
                            // Disparar evento para atualizar a agenda
                            const event = new CustomEvent('agendaAtualizada', { 
                                detail: { 
                                    timestamp: Date.now(), 
                                    source: 'caixa.js',
                                    action: 'finalizar_atendimento',
                                    agendamentoId: agendamentoId
                                } 
                            });
                            window.dispatchEvent(event);
                            
                            try {
                                localStorage.setItem('agendaAtualizada', JSON.stringify({ 
                                    timestamp: Date.now(), 
                                    source: 'caixa.js',
                                    agendamentoId: agendamentoId,
                                    acao: 'finalizar'
                                }));
                                setTimeout(() => localStorage.removeItem('agendaAtualizada'), 500);
                            } catch(e) {}
                        } else {
                            console.log(`⚠️ Agendamento ${agendamentoId} está com status "${agendamentoAtual.status}", não pode ser concluído`);
                        }
                    } else {
                        console.log(`⚠️ Agendamento ${agendamentoId} não encontrado`);
                    }
                } catch (syncError) {
                    console.error("❌ Erro ao sincronizar com agenda:", syncError);
                }
            } else {
                console.log("ℹ️ Comanda não possui agendamento vinculado");
            }
            
        } else {
            console.log("ℹ️ Nenhuma comanda para atualizar, apenas movimentação de caixa salva");
        }
        
        // ========== ADICIONAR PONTOS DE FIDELIDADE ==========
        if (clienteId && total > 0) {
            await adicionarPontosFidelidadeCliente(clienteId, cliente?.nome, total, "servico");
        }
        
        // ========== ATUALIZAR ESTOQUE ==========
        for (const produto of produtosLista) {
            try {
                const produtoRef = doc(db, "produtos", produto.id);
                const produtoDoc = await getDoc(produtoRef);
                if (produtoDoc.exists()) {
                    const produtoData = produtoDoc.data();
                    const novaQuantidade = Math.max(0, (produtoData.quantidade || 0) - (produto.quantidade || 1));
                    await updateDoc(produtoRef, { quantidade: novaQuantidade, updatedAt: Timestamp.now() });
                    console.log(`📦 Estoque atualizado: ${produto.nome} → ${novaQuantidade}`);
                }
            } catch (err) {
                console.error(`Erro ao atualizar estoque para ${produto.nome}:`, err);
            }
        }
        
        mostrarToast(`✅ Atendimento finalizado! Subtotal: ${formatarMoeda(subtotal)} | Total pago: ${formatarMoeda(total)}`, "success");
        
        if (comandaExistente && agendamentoId) {
            mostrarToast(`🎉 Comanda finalizada e agendamento movido para REALIZADOS!`, "success");
        } else if (comandaExistente) {
            mostrarToast(`🎉 Comanda finalizada com sucesso!`, "success");
        }
        
        resetarFormularioAtendimento();
        fecharModalAtendimento();
        
    } catch (error) {
        console.error("Erro ao finalizar atendimento:", error);
        mostrarToast("Erro ao finalizar atendimento: " + error.message, "erro");
    }
}

// ==================== FUNÇÕES PARA BUSCAR COMANDA ====================

let comandaCarregada = null;

async function buscarComandaPorNumero(numero) {
    if (!numero || numero <= 0) {
        mostrarToast("Digite um número de comanda válido", "erro");
        return null;
    }
    
    try {
        console.log(`🔍 Buscando comanda #${numero}...`);
        
        const comandasQuery = query(
            collection(db, "comandas"),
            where("numeroComanda", "==", Number(numero))
        );
        const comandasSnapshot = await getDocs(comandasQuery);
        
        if (comandasSnapshot.empty) {
            console.log(`❌ Comanda #${numero} não encontrada`);
            return null;
        }
        
        const comandaDoc = comandasSnapshot.docs[0];
        const comanda = { id: comandaDoc.id, ...comandaDoc.data() };
        
        if (comanda.status !== "aberta") {
            mostrarToast(`Comanda #${numero} está ${comanda.status === "finalizada" ? "finalizada" : (comanda.status === "ausente" ? "ausente" : "cancelada")}. Não é possível carregá-la.`, "erro");
            return null;
        }
        
        console.log(`✅ Comanda #${numero} encontrada:`, comanda);
        return comanda;
        
    } catch (error) {
        console.error("Erro ao buscar comanda:", error);
        mostrarToast("Erro ao buscar comanda: " + error.message, "erro");
        return null;
    }
}

function exibirInfoComanda(comanda) {
    const container = document.getElementById("comandaInfoContainer");
    if (!container) return;
    
    const clienteNome = comanda.clienteNome || (clientes.find(c => c.id === comanda.clienteId)?.nome) || "Cliente não informado";
    const barbeiroNome = comanda.barbeiroNome || (profissionais.find(p => p.id === comanda.barbeiroId)?.nome) || "Não informado";
    
    let total = 0;
    (comanda.servicos || []).forEach(s => total += (s.preco || 0) * (s.quantidade || 1));
    (comanda.pacotes || []).forEach(p => total += (p.preco || 0));
    (comanda.produtos || []).forEach(p => {
        if (!p.isPreLancamento) total += (p.preco || 0) * (p.quantidade || 1);
    });
    
    if (comanda.desconto?.valor > 0) {
        if (comanda.desconto.tipo === "percentual") {
            total = total - (total * comanda.desconto.valor / 100);
        } else {
            total = Math.max(0, total - comanda.desconto.valor);
        }
    }
    
    container.innerHTML = `
        <div class="comanda-info-card">
            <div class="comanda-numero">
                <i class="fa-solid fa-hashtag"></i> COMANDA #${comanda.numeroComanda}
            </div>
            <div class="comanda-cliente">
                <i class="fa-solid fa-user"></i> ${escapeHtml(clienteNome)}
            </div>
            <div class="comanda-barbeiro">
                <i class="fa-solid fa-user-md"></i> ${escapeHtml(barbeiroNome)}
            </div>
            <div class="comanda-total">
                <strong>Total: ${formatarMoeda(total)}</strong>
            </div>
            <button type="button" class="btn-carregar-comanda" id="btnConfirmarCarregarComanda">
                <i class="fa-solid fa-download"></i> Carregar Itens
            </button>
        </div>
    `;
    
    const btnCarregar = document.getElementById("btnConfirmarCarregarComanda");
    if (btnCarregar) {
        btnCarregar.addEventListener("click", () => carregarItensDaComanda(comanda));
    }
}

function exibirErroBuscarComanda(mensagem) {
    const container = document.getElementById("comandaInfoContainer");
    if (!container) return;
    
    container.innerHTML = `
        <div class="comanda-nao-encontrada">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${escapeHtml(mensagem)}</span>
        </div>
    `;
}

function limparInfoComanda() {
    const container = document.getElementById("comandaInfoContainer");
    if (container) container.innerHTML = "";
    comandaCarregada = null;
}

async function carregarItensDaComanda(comanda) {
    console.log("🔄 Carregando itens da comanda para o atendimento...");
    console.log("📦 Dados completos da comanda:", comanda);
    
    if (!comanda || comanda.status !== "aberta") {
        mostrarToast("Comanda inválida ou já finalizada", "erro");
        return;
    }
    
    if (!caixaAtual) {
        mostrarToast("Caixa está fechado. Abra o caixa primeiro!", "erro");
        return;
    }
    
    resetarFormularioAtendimento();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const clienteSelect = document.getElementById("atendimentoCliente");
    if (clienteSelect && comanda.clienteId) {
        clienteSelect.value = comanda.clienteId;
        console.log("✅ Cliente preenchido:", comanda.clienteId);
    } else if (clienteSelect && comanda.clienteNome) {
        const clienteEncontrado = clientes.find(c => c.nome === comanda.clienteNome);
        if (clienteEncontrado) {
            clienteSelect.value = clienteEncontrado.id;
            console.log("✅ Cliente encontrado pelo nome:", comanda.clienteNome);
        }
    }
    
    const profissionalSelect = document.getElementById("atendimentoProfissional");
    if (profissionalSelect) {
        let barbeiroEncontrado = false;
        
        if (comanda.barbeiroId) {
            profissionalSelect.value = comanda.barbeiroId;
            if (profissionalSelect.value === comanda.barbeiroId) {
                barbeiroEncontrado = true;
                console.log("✅ Barbeiro preenchido pelo ID:", comanda.barbeiroId);
            }
        }
        
        if (!barbeiroEncontrado && comanda.barbeiroNome) {
            const barbeiro = profissionais.find(p => 
                p.nome && p.nome.toLowerCase() === comanda.barbeiroNome.toLowerCase()
            );
            if (barbeiro) {
                profissionalSelect.value = barbeiro.id;
                console.log("✅ Barbeiro encontrado pelo nome exato:", barbeiro.nome);
                barbeiroEncontrado = true;
            }
        }
        
        if (!barbeiroEncontrado && comanda.barbeiroNome) {
            const barbeiro = profissionais.find(p => 
                p.nome && p.nome.toLowerCase().includes(comanda.barbeiroNome.toLowerCase())
            );
            if (barbeiro) {
                profissionalSelect.value = barbeiro.id;
                console.log("✅ Barbeiro encontrado pelo nome parcial:", barbeiro.nome);
                barbeiroEncontrado = true;
            }
        }
        
        if (!barbeiroEncontrado) {
            console.log("⚠️ Nenhum barbeiro encontrado para preencher automaticamente");
        }
    }
    
    const pagamentoSelect = document.getElementById("atendimentoPagamento");
    if (pagamentoSelect && comanda.formaPagamento) {
        pagamentoSelect.value = comanda.formaPagamento;
        console.log("✅ Forma de pagamento preenchida:", comanda.formaPagamento);
        
        const parcelasGroup = document.getElementById("atendimentoParcelasGroup");
        if (parcelasGroup) {
            parcelasGroup.style.display = comanda.formaPagamento === 'cartao_credito' ? 'block' : 'none';
        }
        
        if (comanda.parcelas && comanda.parcelas > 1) {
            const parcelasSelect = document.getElementById("atendimentoParcelas");
            if (parcelasSelect) {
                parcelasSelect.value = comanda.parcelas;
                console.log("✅ Parcelas preenchidas:", comanda.parcelas);
            }
        }
    }
    
    const servicosContainer = document.getElementById("servicosAtendimentoContainer");
    if (servicosContainer && comanda.servicos && comanda.servicos.length > 0) {
        console.log(`📋 Carregando ${comanda.servicos.length} serviço(s)...`);
        servicosContainer.innerHTML = "";
        
        for (let i = 0; i < comanda.servicos.length; i++) {
            const servico = comanda.servicos[i];
            const servicoId = servico.servicoId || servico.id;
            const servicoPreco = servico.preco || 0;
            const quantidade = servico.quantidade || 1;
            
            adicionarItemVazio(servicosContainer, "servico");
            const ultimoItem = servicosContainer.lastElementChild;
            
            if (ultimoItem) {
                const select = ultimoItem.querySelector("select");
                const quantidadeInput = ultimoItem.querySelector(".quantidade-input");
                const precoInput = ultimoItem.querySelector(".preco-input");
                
                if (select && servicoId) {
                    select.value = servicoId;
                    const changeEvent = new Event("change", { bubbles: true });
                    select.dispatchEvent(changeEvent);
                }
                
                if (quantidadeInput) quantidadeInput.value = quantidade;
                if (precoInput) precoInput.value = servicoPreco;
                
                const totalSpan = ultimoItem.querySelector(".item-total-valor");
                if (totalSpan) {
                    totalSpan.textContent = formatarMoeda(quantidade * servicoPreco);
                }
            }
        }
    }
    
    const produtosContainer = document.getElementById("produtosAtendimentoContainer");
    if (produtosContainer && comanda.produtos && comanda.produtos.length > 0) {
        const produtosNormais = comanda.produtos.filter(p => !p.isPreLancamento);
        if (produtosNormais.length > 0) {
            produtosContainer.innerHTML = "";
            
            for (let i = 0; i < produtosNormais.length; i++) {
                const produto = produtosNormais[i];
                const produtoId = produto.produtoId || produto.id;
                const produtoPreco = produto.preco || 0;
                const quantidade = produto.quantidade || 1;
                
                adicionarItemVazio(produtosContainer, "produto");
                const ultimoItem = produtosContainer.lastElementChild;
                
                if (ultimoItem) {
                    const select = ultimoItem.querySelector("select");
                    const quantidadeInput = ultimoItem.querySelector(".quantidade-input");
                    const precoInput = ultimoItem.querySelector(".preco-input");
                    
                    if (select && produtoId) {
                        select.value = produtoId;
                        const changeEvent = new Event("change", { bubbles: true });
                        select.dispatchEvent(changeEvent);
                    }
                    
                    if (quantidadeInput) quantidadeInput.value = quantidade;
                    if (precoInput) precoInput.value = produtoPreco;
                    
                    const totalSpan = ultimoItem.querySelector(".item-total-valor");
                    if (totalSpan) {
                        totalSpan.textContent = formatarMoeda(quantidade * produtoPreco);
                    }
                }
            }
        }
    }
    
    const pacotesContainer = document.getElementById("pacotesAtendimentoContainer");
    if (pacotesContainer && comanda.pacotes && comanda.pacotes.length > 0) {
        const emptyMessage = pacotesContainer.querySelector('.empty-pacotes-message');
        if (emptyMessage) emptyMessage.remove();
        
        pacotesContainer.innerHTML = "";
        
        for (let i = 0; i < comanda.pacotes.length; i++) {
            const pacote = comanda.pacotes[i];
            const pacoteId = pacote.pacoteId || pacote.id;
            const pacotePreco = pacote.preco || 0;
            const quantidade = pacote.quantidade || 1;
            
            adicionarItemPacoteVazio(pacotesContainer);
            const ultimoItem = pacotesContainer.lastElementChild;
            
            if (ultimoItem) {
                const select = ultimoItem.querySelector("select");
                const quantidadeInput = ultimoItem.querySelector(".quantidade-input");
                const precoInput = ultimoItem.querySelector(".preco-input");
                
                if (select && pacoteId) {
                    select.value = pacoteId;
                    const changeEvent = new Event("change", { bubbles: true });
                    select.dispatchEvent(changeEvent);
                }
                
                if (quantidadeInput) quantidadeInput.value = quantidade;
                if (precoInput) precoInput.value = pacotePreco;
                
                const totalSpan = ultimoItem.querySelector(".item-total-valor");
                if (totalSpan) {
                    totalSpan.textContent = formatarMoeda(quantidade * pacotePreco);
                }
            }
        }
    }
    
    if (comanda.desconto && comanda.desconto.valor > 0) {
        descontoAplicado = {
            valor: comanda.desconto.valor,
            tipo: comanda.desconto.tipo || "percentual",
            valorCalculado: comanda.desconto.valorCalculado || 0
        };
        
        const descontoInfo = document.getElementById("descontoInfo");
        const descontoForm = document.getElementById("descontoForm");
        const descontoTexto = document.getElementById("descontoTexto");
        const btnRemoverDesconto = document.getElementById("btnRemoverDesconto");
        const btnAplicarDesconto = document.getElementById("btnAplicarDesconto");
        
        if (descontoInfo && descontoForm) {
            descontoInfo.style.display = "flex";
            descontoForm.style.display = "none";
            
            if (descontoTexto) {
                const texto = descontoAplicado.tipo === "percentual" 
                    ? `${descontoAplicado.valor}% de desconto`
                    : `Desconto de ${formatarMoeda(descontoAplicado.valor)}`;
                descontoTexto.textContent = texto;
            }
        }
        if (btnRemoverDesconto) btnRemoverDesconto.style.display = "inline-flex";
        if (btnAplicarDesconto) btnAplicarDesconto.style.display = "none";
    }
    
    const observacoesTextarea = document.getElementById("atendimentoObservacoes");
    if (observacoesTextarea && comanda.observacoes) {
        observacoesTextarea.value = comanda.observacoes;
    }
    
    setTimeout(() => {
        calcularTotalAtendimento();
        
        const servicosCount = document.querySelectorAll('#servicosAtendimentoContainer .item-atendimento').length;
        const produtosCount = document.querySelectorAll('#produtosAtendimentoContainer .item-atendimento').length;
        const pacotesCount = document.querySelectorAll('#pacotesAtendimentoContainer .item-atendimento').length;
        
        if (servicosCount === 0 && produtosCount === 0 && pacotesCount === 0) {
            mostrarToast("⚠️ Nenhum item foi carregado. Verifique se a comanda possui serviços, produtos ou pacotes.", "erro");
        } else {
            const barbeiroNome = profissionais.find(p => p.id === profissionalSelect?.value)?.nome || 'não selecionado';
            mostrarToast(`✅ Comanda #${comanda.numeroComanda} carregada! Barbeiro: ${barbeiroNome}`, "sucesso");
        }
    }, 300);
    
    limparInfoComanda();
    
    const inputNumero = document.getElementById("buscarComandaNumero");
    if (inputNumero) inputNumero.value = "";
}

function configurarBuscarComanda() {
    const btnBuscar = document.getElementById("btnBuscarComanda");
    const inputNumero = document.getElementById("buscarComandaNumero");
    
    if (btnBuscar) {
        const novoBtn = btnBuscar.cloneNode(true);
        btnBuscar.parentNode.replaceChild(novoBtn, btnBuscar);
        novoBtn.addEventListener("click", async () => {
            const numero = parseInt(inputNumero?.value);
            if (!numero || numero <= 0) {
                exibirErroBuscarComanda("Digite um número de comanda válido");
                return;
            }
            
            const comanda = await buscarComandaPorNumero(numero);
            if (comanda) {
                exibirInfoComanda(comanda);
            } else {
                exibirErroBuscarComanda(`Comanda #${numero} não encontrada ou já está finalizada/cancelada`);
            }
        });
    }
    
    if (inputNumero) {
        inputNumero.addEventListener("keypress", async (e) => {
            if (e.key === "Enter") {
                const numero = parseInt(inputNumero.value);
                if (numero && numero > 0) {
                    const comanda = await buscarComandaPorNumero(numero);
                    if (comanda) {
                        exibirInfoComanda(comanda);
                    } else {
                        exibirErroBuscarComanda(`Comanda #${numero} não encontrada ou já está finalizada/cancelada`);
                    }
                }
            }
        });
    }
}

// ==================== MODAIS E EVENT LISTENERS ====================

function abrirModalDetalhes(mov) {
    const body = document.getElementById('detalhesMovimentacaoBody');
    if (!body) return;
    
    const cliente = clientes.find(c => c.id === mov.clienteId);
    
    const formaPagamentoNome = {
        'dinheiro': '💵 Dinheiro',
        'pix': '📱 Pix',
        'cartao_credito': '💳 Cartão Crédito',
        'cartao_debito': '💳 Cartão Débito',
        'transferencia': '🏦 Transferência'
    }[mov.formaPagamento] || '-';
    
    const parcelasInfo = mov.parcelas && mov.parcelas > 1 ? ` (${mov.parcelas}x)` : '';
    const descontoString = mov.desconto && mov.desconto.valor > 0 ? `<div class="detalhe-item"><span class="label"><i class="fa-solid fa-tag"></i> Desconto:</span><span class="value" style="color: #10b981;">-${formatarMoeda(mov.desconto.valorCalculado)} (${mov.desconto.tipo === 'percentual' ? mov.desconto.valor + '%' : formatarMoeda(mov.desconto.valor)})</span></div>` : '';
    
    let servicosHtml = '';
    if (mov.servicos && mov.servicos.length > 0) {
        servicosHtml = `
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-cut"></i> Serviços:</span>
                <span class="value">${mov.servicos.map(s => `${s.nome} (${s.quantidade}x)`).join(', ')}</span>
            </div>
        `;
    }
    
    let produtosHtml = '';
    if (mov.produtos && mov.produtos.length > 0) {
        produtosHtml = `
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-box"></i> Produtos:</span>
                <span class="value">${mov.produtos.map(p => `${p.nome} (${p.quantidade}x)`).join(', ')}</span>
            </div>
        `;
    }
    
    let pacotesHtml = '';
    if (mov.pacotes && mov.pacotes.length > 0) {
        pacotesHtml = `
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-gift"></i> Pacotes:</span>
                <span class="value">${mov.pacotes.map(p => `${p.nome} (${p.quantidade}x)`).join(', ')}</span>
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="detalhes-movimentacao">
            <div class="detalhe-item">
                <span class="label"><i class="fa-regular fa-calendar"></i> Data/Hora:</span>
                <span class="value">${formatarData(mov.createdAt)}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-tag"></i> Tipo:</span>
                <span class="value">${mov.tipo === 'entrada' ? '💰 Entrada' : '💸 Saída'}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-layer-group"></i> Categoria:</span>
                <span class="value">${mov.categoria || '-'}</span>
            </div>
            ${servicosHtml}
            ${produtosHtml}
            ${pacotesHtml}
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-dollar-sign"></i> Subtotal:</span>
                <span class="value">${formatarMoeda(mov.subtotal || mov.valor)}</span>
            </div>
            ${descontoString}
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-dollar-sign"></i> Valor Final:</span>
                <span class="value ${mov.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida'}">${formatarMoeda(mov.valor)}</span>
            </div>
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-credit-card"></i> Forma Pagamento:</span>
                <span class="value">${formaPagamentoNome}${parcelasInfo}</span>
            </div>
            ${mov.clienteId ? `
                <div class="detalhe-item">
                    <span class="label"><i class="fa-solid fa-user"></i> Cliente:</span>
                    <span class="value">${escapeHtml(cliente?.nome || '-')}</span>
                </div>
            ` : ''}
            ${mov.comprovante ? `
                <div class="detalhe-item">
                    <span class="label"><i class="fa-solid fa-receipt"></i> Comprovante:</span>
                    <span class="value">${escapeHtml(mov.comprovante)}</span>
                </div>
            ` : ''}
            <div class="detalhe-item">
                <span class="label"><i class="fa-solid fa-align-left"></i> Descrição:</span>
                <span class="value">${escapeHtml(mov.descricao || '-')}</span>
            </div>
        </div>
    `;
    
    if (modalDetalhes) modalDetalhes.classList.add('active');
}

function fecharModalDetalhes() {
    if (modalDetalhes) modalDetalhes.classList.remove('active');
}

function abrirModalExcluir(mov) {
    movimentacaoParaExcluir = mov.id;
    const descricao = document.getElementById('excluirDescricaoMov');
    if (descricao) {
        descricao.textContent = `${mov.descricao || mov.categoria} - ${formatarMoeda(mov.valor)}`;
    }
    if (modalExcluir) modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    if (modalExcluir) modalExcluir.classList.remove('active');
    movimentacaoParaExcluir = null;
}

function aplicarFiltrosHandler() {
    filtrosAtivos.dataInicio = dataInicio?.value || null;
    filtrosAtivos.dataFim = dataFim?.value || null;
    filtrosAtivos.tipo = filterTipo?.value || null;
    filtrosAtivos.categoria = filterCategoria?.value || null;
    aplicarFiltros();
}

function limparFiltros() {
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    if (filterTipo) filterTipo.value = '';
    if (filterCategoria) filterCategoria.value = '';
    filtrosAtivos = { dataInicio: null, dataFim: null, tipo: null, categoria: null };
    
    // ✅ CORREÇÃO: Ao limpar os filtros, voltar a mostrar apenas o dia atual
    const hoje = new Date().toISOString().split('T')[0];
    filtrosAtivos.dataInicio = hoje;
    filtrosAtivos.dataFim = hoje;
    if (dataInicio) dataInicio.value = hoje;
    if (dataFim) dataFim.value = hoje;
    
    aplicarFiltros();
}

// ==================== CONFIGURAR EVENT LISTENERS ====================

function configurarEventListeners() {
    console.log("🔧 Configurando event listeners...");
    
    if (formMovimentacao) {
        formMovimentacao.addEventListener('submit', (e) => {
            e.preventDefault();
            const dados = {
                id: document.getElementById('movimentacaoId')?.value,
                tipo: document.getElementById('movTipo')?.value,
                categoria: document.getElementById('movCategoria')?.value,
                valor: document.getElementById('movValor')?.value,
                descricao: document.getElementById('movDescricao')?.value,
                formaPagamento: document.getElementById('movFormaPagamento')?.value,
                parcelas: document.getElementById('movParcelas')?.value || 1,
                clienteId: document.getElementById('movCliente')?.value,
                comprovante: document.getElementById('movComprovante')?.value
            };
            salvarMovimentacao(dados);
        });
    }
    
    if (btnAbrirCaixa) {
        btnAbrirCaixa.addEventListener('click', (e) => {
            e.preventDefault();
            abrirCaixa();
        });
    }
    
    if (btnFecharCaixa) {
        btnFecharCaixa.addEventListener('click', (e) => {
            e.preventDefault();
            fecharCaixa();
        });
    }
    
    if (btnNovaMovimentacao) {
        btnNovaMovimentacao.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalMovimentacao();
        });
    }
    
    if (btnRealizarAtendimento) {
        btnRealizarAtendimento.addEventListener('click', (e) => {
            e.preventDefault();
            abrirModalAtendimento();
        });
    }
    
    const btnAddServico = document.getElementById('btnAdicionarServicoAtendimento');
    const btnAddProduto = document.getElementById('btnAdicionarProdutoAtendimento');
    const btnAddPacote = document.getElementById('btnAdicionarPacoteAtendimento');
    const btnFinalizar = document.getElementById('btnFinalizarAtendimento');
    
    if (btnAddServico) btnAddServico.addEventListener('click', adicionarServicoAtendimento);
    if (btnAddProduto) btnAddProduto.addEventListener('click', adicionarProdutoAtendimento);
    if (btnAddPacote) btnAddPacote.addEventListener('click', adicionarPacoteAtendimento);
    if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarAtendimento);
    
    if (btnFiltrar) btnFiltrar.addEventListener('click', aplicarFiltrosHandler);
    if (btnLimparFiltros) btnLimparFiltros.addEventListener('click', limparFiltros);
    
    const descontoHeader = document.getElementById('descontoHeader');
    const btnAplicarDesconto = document.getElementById('btnAplicarDesconto');
    const btnRemoverDesconto = document.getElementById('btnRemoverDesconto');
    const btnCancelarDesconto = document.getElementById('btnCancelarDesconto');
    
    if (descontoHeader) descontoHeader.addEventListener('click', toggleDescontoForm);
    if (btnAplicarDesconto) btnAplicarDesconto.addEventListener('click', aplicarDesconto);
    if (btnRemoverDesconto) btnRemoverDesconto.addEventListener('click', removerDesconto);
    if (btnCancelarDesconto) btnCancelarDesconto.addEventListener('click', removerDesconto);
    
    const movFormaPagamento = document.getElementById('movFormaPagamento');
    const movParcelasGroup = document.getElementById('movParcelasGroup');
    if (movFormaPagamento && movParcelasGroup) {
        movFormaPagamento.addEventListener('change', () => {
            movParcelasGroup.style.display = movFormaPagamento.value === 'cartao_credito' ? 'block' : 'none';
        });
    }
    
    const atendimentoPagamento = document.getElementById('atendimentoPagamento');
    const atendimentoParcelasGroup = document.getElementById('atendimentoParcelasGroup');
    if (atendimentoPagamento && atendimentoParcelasGroup) {
        atendimentoPagamento.addEventListener('change', () => {
            atendimentoParcelasGroup.style.display = atendimentoPagamento.value === 'cartao_credito' ? 'block' : 'none';
        });
    }
    
    document.querySelectorAll('.modal-close-movimentacao, .btn-cancel-movimentacao').forEach(btn => {
        btn.addEventListener('click', fecharModalMovimentacao);
    });
    
    document.querySelectorAll('.modal-close-atendimento, .btn-cancel-atendimento').forEach(btn => {
        btn.addEventListener('click', fecharModalAtendimento);
    });
    
    document.querySelectorAll('.modal-close-detalhes, .btn-cancel-detalhes').forEach(btn => {
        btn.addEventListener('click', fecharModalDetalhes);
    });
    
    document.querySelectorAll('.modal-close-excluir, .btn-cancel-excluir-mov').forEach(btn => {
        btn.addEventListener('click', fecharModalExcluir);
    });
    
    const confirmarExcluir = document.getElementById('confirmarExcluirMov');
    if (confirmarExcluir) {
        confirmarExcluir.addEventListener('click', () => {
            if (movimentacaoParaExcluir) deletarMovimentacao(movimentacaoParaExcluir);
        });
    }
    
    configurarBuscarComanda();
    
    window.addEventListener('click', (e) => {
        if (e.target === modalMovimentacao) fecharModalMovimentacao();
        if (e.target === modalAtendimentoCaixa) fecharModalAtendimento();
        if (e.target === modalDetalhes) fecharModalDetalhes();
        if (e.target === modalExcluir) fecharModalExcluir();
    });
    
    console.log("✅ Event listeners configurados!");
}

// ==================== INICIALIZAÇÃO ====================

async function inicializar() {
    console.log("🚀 Inicializando sistema de caixa...");
    await carregarDados();
    configurarEventListeners();
    console.log("✅ Sistema de caixa inicializado!");
}

inicializar();

onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.log("❌ Usuário não autenticado, redirecionando para login...");
        window.location.href = 'login.html';
    } else {
        console.log("✅ Usuário autenticado:", user.email);
    }
});

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}