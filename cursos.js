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

let cursos = [];
let profissionais = [];
let matriculas = [];
let unsubscribeCursos = null;

// Elementos DOM
const cursosGrid = document.getElementById('cursosGrid');
const searchInput = document.getElementById('searchCurso');
const filterTipo = document.getElementById('filterTipo');
const filterCategoria = document.getElementById('filterCategoria');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const btnNovoCurso = document.getElementById('btnNovoCurso');
const modalCurso = document.getElementById('modalCurso');
const modalDetalhes = document.getElementById('modalDetalhesCurso');
const modalMatricular = document.getElementById('modalMatricular');
const modalExcluir = document.getElementById('modalExcluirCurso');
const formCurso = document.getElementById('formCurso');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');

let cursoParaExcluir = null;
let cursoSelecionado = null;

function mostrarToast(mensagem, tipo = 'sucesso') {
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

async function carregarDados() {
    try {
        console.log("🔄 Carregando dados dos cursos...");
        
        // Carregar profissionais para matrículas
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionais = [];
        profissionaisSnap.forEach(doc => {
            profissionais.push({ id: doc.id, ...doc.data() });
        });
        
        // Carregar matrículas
        const matriculasSnap = await getDocs(collection(db, "matriculas"));
        matriculas = [];
        matriculasSnap.forEach(doc => {
            matriculas.push({ id: doc.id, ...doc.data() });
        });
        
        // Carregar cursos
        carregarCursos();
        
        // Popular select de alunos
        popularSelectAlunos();
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados", "erro");
    }
}

function popularSelectAlunos() {
    const selectAluno = document.getElementById('matriculaAluno');
    if (selectAluno) {
        selectAluno.innerHTML = '<option value="">Selecione um profissional</option>';
        profissionais.forEach(prof => {
            selectAluno.innerHTML += `<option value="${prof.id}">${escapeHtml(prof.nome)}</option>`;
        });
    }
}

function carregarCursos() {
    const q = query(collection(db, "cursos"), orderBy("createdAt", "desc"));
    
    unsubscribeCursos = onSnapshot(q, (snapshot) => {
        cursos = [];
        snapshot.forEach(doc => {
            cursos.push({ id: doc.id, ...doc.data() });
        });
        renderizarCursos();
        atualizarEstatisticas();
    }, (error) => {
        console.error("Erro ao carregar cursos:", error);
        if (cursosGrid) {
            cursosGrid.innerHTML = `
                <div class="empty-cursos">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <p>Erro ao carregar cursos: ${error.message}</p>
                </div>
            `;
        }
    });
}

function renderizarCursos() {
    if (!cursosGrid) return;
    
    let filtered = [...cursos];
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const tipo = filterTipo?.value;
    const categoria = filterCategoria?.value;
    
    if (searchTerm) {
        filtered = filtered.filter(c => 
            c.titulo?.toLowerCase().includes(searchTerm) ||
            c.descricao?.toLowerCase().includes(searchTerm) ||
            c.instrutor?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (tipo) {
        filtered = filtered.filter(c => c.tipo === tipo);
    }
    
    if (categoria) {
        filtered = filtered.filter(c => c.categoria === categoria);
    }
    
    if (filtered.length === 0) {
        cursosGrid.innerHTML = `
            <div class="empty-cursos">
                <i class="fa-solid fa-graduation-cap"></i>
                <p>Nenhum curso encontrado</p>
                <button class="btn-primary" id="emptyBtnNovoCurso">
                    <i class="fa-solid fa-plus"></i> Criar Primeiro Curso
                </button>
            </div>
        `;
        const emptyBtn = document.getElementById('emptyBtnNovoCurso');
        if (emptyBtn) emptyBtn.addEventListener('click', () => abrirModalCurso());
        return;
    }
    
    cursosGrid.innerHTML = filtered.map(curso => {
        const tipoIcon = curso.tipo === 'video' ? '🎬' : (curso.tipo === 'ebook' ? '📚' : '🎓');
        const tipoClass = curso.tipo === 'video' ? 'video' : (curso.tipo === 'ebook' ? 'ebook' : 'curso');
        const precoGratuito = !curso.preco || curso.preco === 0;
        const imagemUrl = curso.urlImagem || './assets/curso-placeholder.jpg';
        const totalMatriculas = matriculas.filter(m => m.cursoId === curso.id).length;
        
        return `
            <div class="curso-card" data-id="${curso.id}">
                <div class="curso-imagem">
                    <img src="${imagemUrl}" alt="${escapeHtml(curso.titulo)}" onerror="this.src='./assets/curso-placeholder.jpg'">
                    <span class="curso-tipo-badge ${tipoClass}">${tipoIcon} ${curso.tipo === 'video' ? 'Vídeo' : (curso.tipo === 'ebook' ? 'E-book' : 'Curso')}</span>
                    ${curso.duracao ? `<span class="curso-duracao-badge"><i class="fa-regular fa-clock"></i> ${formatarDuracao(curso.duracao)}</span>` : ''}
                </div>
                <div class="curso-info">
                    <h3>${escapeHtml(curso.titulo)}</h3>
                    <span class="curso-categoria">${getCategoriaIcon(curso.categoria)} ${getCategoriaNome(curso.categoria)}</span>
                    <p class="curso-descricao">${escapeHtml(curso.descricao?.substring(0, 100))}${curso.descricao?.length > 100 ? '...' : ''}</p>
                    <div class="curso-meta">
                        <span><i class="fa-solid fa-user-md"></i> ${escapeHtml(curso.instrutor || 'Alpha BarberShop')}</span>
                        <span><i class="fa-solid fa-users"></i> ${totalMatriculas} alunos</span>
                    </div>
                    <div class="curso-preco ${precoGratuito ? 'gratuito' : ''}">
                        ${precoGratuito ? '🎓 Gratuito' : formatarMoeda(curso.preco)}
                    </div>
                    <div class="curso-actions">
                        <button class="btn-ver-curso" data-id="${curso.id}">
                            <i class="fa-solid fa-eye"></i> Ver Detalhes
                        </button>
                        <button class="btn-matricular-curso" data-id="${curso.id}" data-titulo="${escapeHtml(curso.titulo)}">
                            <i class="fa-solid fa-user-plus"></i> Matricular
                        </button>
                        <button class="btn-edit-curso" data-id="${curso.id}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn-delete-curso" data-id="${curso.id}" data-titulo="${escapeHtml(curso.titulo)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Event listeners dos botões
    document.querySelectorAll('.btn-ver-curso').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const curso = cursos.find(c => c.id === id);
            if (curso) abrirModalDetalhes(curso);
        });
    });
    
    document.querySelectorAll('.btn-matricular-curso').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const titulo = btn.getAttribute('data-titulo');
            cursoSelecionado = { id, titulo };
            abrirModalMatricular();
        });
    });
    
    document.querySelectorAll('.btn-edit-curso').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const curso = cursos.find(c => c.id === id);
            if (curso) abrirModalCurso(curso);
        });
    });
    
    document.querySelectorAll('.btn-delete-curso').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const titulo = btn.getAttribute('data-titulo');
            abrirModalExcluir(id, titulo);
        });
    });
}

function getCategoriaIcon(categoria) {
    const icons = {
        'corte': '✂️',
        'barba': '🪒',
        'coloracao': '🎨',
        'gestao': '📊',
        'atendimento': '💬'
    };
    return icons[categoria] || '🎓';
}

function getCategoriaNome(categoria) {
    const nomes = {
        'corte': 'Corte',
        'barba': 'Barba',
        'coloracao': 'Coloração',
        'gestao': 'Gestão',
        'atendimento': 'Atendimento'
    };
    return nomes[categoria] || 'Geral';
}

function atualizarEstatisticas() {
    const totalCursos = cursos.length;
    const totalVideos = cursos.filter(c => c.tipo === 'video').length;
    const totalEbooks = cursos.filter(c => c.tipo === 'ebook').length;
    const totalAlunos = new Set(matriculas.map(m => m.alunoId)).size;
    
    document.getElementById('totalCursos').textContent = totalCursos;
    document.getElementById('totalVideos').textContent = totalVideos;
    document.getElementById('totalEbooks').textContent = totalEbooks;
    document.getElementById('totalAlunos').textContent = totalAlunos;
}

async function salvarCurso(dados) {
    try {
        const cursoData = {
            titulo: dados.titulo,
            tipo: dados.tipo,
            categoria: dados.categoria,
            descricao: dados.descricao || '',
            urlVideo: dados.urlVideo || null,
            urlEbook: dados.urlEbook || null,
            urlImagem: dados.urlImagem || null,
            duracao: Number(dados.duracao) || null,
            nivel: dados.nivel,
            instrutor: dados.instrutor || null,
            preco: dados.preco ? Number(dados.preco) : null,
            updatedAt: Timestamp.now()
        };
        
        if (dados.id) {
            await updateDoc(doc(db, "cursos", dados.id), cursoData);
            mostrarToast("Curso atualizado com sucesso!");
        } else {
            cursoData.createdAt = Timestamp.now();
            await addDoc(collection(db, "cursos"), cursoData);
            mostrarToast("Curso criado com sucesso!");
        }
        
        fecharModalCurso();
        
    } catch (error) {
        console.error("Erro ao salvar curso:", error);
        mostrarToast("Erro ao salvar curso.", "erro");
    }
}

async function deletarCurso(id) {
    try {
        await deleteDoc(doc(db, "cursos", id));
        mostrarToast("Curso excluído com sucesso!");
        fecharModalExcluir();
    } catch (error) {
        console.error("Erro ao excluir curso:", error);
        mostrarToast("Erro ao excluir curso.", "erro");
    }
}

async function matricularAluno(cursoId, alunoId, dataInicio, observacoes) {
    try {
        // Verificar se já está matriculado
        const matriculaExistente = matriculas.find(m => m.cursoId === cursoId && m.alunoId === alunoId);
        if (matriculaExistente) {
            mostrarToast("Aluno já está matriculado neste curso!", "erro");
            return false;
        }
        
        await addDoc(collection(db, "matriculas"), {
            cursoId: cursoId,
            alunoId: alunoId,
            dataInicio: dataInicio ? Timestamp.fromDate(new Date(dataInicio)) : Timestamp.now(),
            observacoes: observacoes || '',
            status: 'ativo',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        
        mostrarToast("Aluno matriculado com sucesso!");
        return true;
        
    } catch (error) {
        console.error("Erro ao matricular aluno:", error);
        mostrarToast("Erro ao matricular aluno.", "erro");
        return false;
    }
}

function abrirModalCurso(curso = null) {
    const title = document.getElementById('modalCursoTitle');
    const cursoId = document.getElementById('cursoId');
    const cursoTitulo = document.getElementById('cursoTitulo');
    const cursoTipo = document.getElementById('cursoTipo');
    const cursoCategoria = document.getElementById('cursoCategoria');
    const cursoDescricao = document.getElementById('cursoDescricao');
    const cursoUrlVideo = document.getElementById('cursoUrlVideo');
    const cursoUrlEbook = document.getElementById('cursoUrlEbook');
    const cursoUrlImagem = document.getElementById('cursoUrlImagem');
    const cursoDuracao = document.getElementById('cursoDuracao');
    const cursoNivel = document.getElementById('cursoNivel');
    const cursoInstrutor = document.getElementById('cursoInstrutor');
    const cursoPreco = document.getElementById('cursoPreco');
    
    if (curso) {
        title.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Curso';
        cursoId.value = curso.id;
        cursoTitulo.value = curso.titulo || '';
        cursoTipo.value = curso.tipo || 'curso';
        cursoCategoria.value = curso.categoria || 'corte';
        cursoDescricao.value = curso.descricao || '';
        cursoUrlVideo.value = curso.urlVideo || '';
        cursoUrlEbook.value = curso.urlEbook || '';
        cursoUrlImagem.value = curso.urlImagem || '';
        cursoDuracao.value = curso.duracao || '';
        cursoNivel.value = curso.nivel || 'iniciante';
        cursoInstrutor.value = curso.instrutor || '';
        cursoPreco.value = curso.preco || '';
    } else {
        title.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Curso';
        cursoId.value = '';
        formCurso.reset();
        cursoTipo.value = 'curso';
        cursoCategoria.value = 'corte';
        cursoNivel.value = 'iniciante';
    }
    
    modalCurso.classList.add('active');
}

function fecharModalCurso() {
    modalCurso.classList.remove('active');
}

function abrirModalDetalhes(curso) {
    const tituloEl = document.getElementById('detalhesCursoTitulo');
    const body = document.getElementById('detalhesCursoBody');
    const btnAssistir = document.getElementById('btnAssistirCurso');
    const btnDownload = document.getElementById('btnDownloadEbook');
    
    const tipoIcon = curso.tipo === 'video' ? '🎬' : (curso.tipo === 'ebook' ? '📚' : '🎓');
    const precoGratuito = !curso.preco || curso.preco === 0;
    const imagemUrl = curso.urlImagem || './assets/curso-placeholder.jpg';
    const totalMatriculas = matriculas.filter(m => m.cursoId === curso.id).length;
    
    tituloEl.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(curso.titulo)}`;
    
    body.innerHTML = `
        <div class="detalhes-curso-header">
            <div class="detalhes-imagem">
                <img src="${imagemUrl}" alt="${escapeHtml(curso.titulo)}" onerror="this.src='./assets/curso-placeholder.jpg'">
            </div>
            <div class="detalhes-info">
                <h3>${escapeHtml(curso.titulo)}</h3>
                <div class="detalhes-meta">
                    <span><i class="fa-solid fa-tag"></i> ${tipoIcon} ${curso.tipo === 'video' ? 'Vídeo Aula' : (curso.tipo === 'ebook' ? 'E-book' : 'Curso')}</span>
                    <span><i class="fa-solid fa-layer-group"></i> ${getCategoriaIcon(curso.categoria)} ${getCategoriaNome(curso.categoria)}</span>
                    ${curso.duracao ? `<span><i class="fa-regular fa-clock"></i> ${formatarDuracao(curso.duracao)}</span>` : ''}
                    <span><i class="fa-solid fa-chart-line"></i> ${curso.nivel === 'iniciante' ? '🌱 Iniciante' : (curso.nivel === 'intermediario' ? '📈 Intermediário' : '🚀 Avançado')}</span>
                    <span><i class="fa-solid fa-users"></i> ${totalMatriculas} alunos matriculados</span>
                </div>
                <div class="detalhes-preco ${precoGratuito ? 'gratuito' : ''}">
                    ${precoGratuito ? '🎓 Gratuito' : formatarMoeda(curso.preco)}
                </div>
                ${curso.instrutor ? `<div class="detalhes-meta" style="margin-top: 8px;"><span><i class="fa-solid fa-user-md"></i> Instrutor: ${escapeHtml(curso.instrutor)}</span></div>` : ''}
            </div>
        </div>
        <div class="detalhes-descricao">
            <h4>📝 Sobre o curso</h4>
            <p>${escapeHtml(curso.descricao || 'Sem descrição disponível.')}</p>
        </div>
        ${(curso.urlVideo || curso.urlEbook) ? `
            <div class="detalhes-conteudo">
                <h4><i class="fa-solid fa-play-circle"></i> Conteúdo do Curso</h4>
                ${curso.urlVideo ? `
                    <div style="margin-bottom: 16px;">
                        <iframe src="${getEmbedUrl(curso.urlVideo)}" frameborder="0" allowfullscreen></iframe>
                    </div>
                ` : ''}
                ${curso.urlEbook ? `
                    <div>
                        <a href="${curso.urlEbook}" target="_blank" class="ebook-link">
                            <i class="fa-solid fa-file-pdf"></i> Baixar Material do Curso
                        </a>
                    </div>
                ` : ''}
            </div>
        ` : ''}
    `;
    
    // Configurar botões
    btnAssistir.style.display = curso.urlVideo ? 'flex' : 'none';
    btnDownload.style.display = curso.urlEbook ? 'flex' : 'none';
    
    if (curso.urlVideo) {
        const newBtnAssistir = btnAssistir.cloneNode(true);
        btnAssistir.parentNode.replaceChild(newBtnAssistir, btnAssistir);
        newBtnAssistir.addEventListener('click', () => {
            window.open(curso.urlVideo, '_blank');
        });
    }
    
    if (curso.urlEbook) {
        const newBtnDownload = btnDownload.cloneNode(true);
        btnDownload.parentNode.replaceChild(newBtnDownload, btnDownload);
        newBtnDownload.addEventListener('click', () => {
            window.open(curso.urlEbook, '_blank');
        });
    }
    
    modalDetalhes.classList.add('active');
}

function getEmbedUrl(url) {
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

function fecharModalDetalhes() {
    modalDetalhes.classList.remove('active');
}

function abrirModalMatricular() {
    if (!cursoSelecionado) return;
    document.getElementById('matriculaCursoId').value = cursoSelecionado.id;
    document.getElementById('matriculaDataInicio').value = new Date().toISOString().split('T')[0];
    document.getElementById('matriculaObservacoes').value = '';
    modalMatricular.classList.add('active');
}

function fecharModalMatricular() {
    modalMatricular.classList.remove('active');
    cursoSelecionado = null;
}

function abrirModalExcluir(id, titulo) {
    cursoParaExcluir = id;
    document.getElementById('excluirCursoNome').textContent = titulo;
    modalExcluir.classList.add('active');
}

function fecharModalExcluir() {
    modalExcluir.classList.remove('active');
    cursoParaExcluir = null;
}

function limparFiltros() {
    if (searchInput) searchInput.value = '';
    if (filterTipo) filterTipo.value = '';
    if (filterCategoria) filterCategoria.value = '';
    renderizarCursos();
}

// Event Listeners
if (formCurso) {
    formCurso.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const titulo = document.getElementById('cursoTitulo').value.trim();
        if (!titulo) {
            mostrarToast("Informe o título do curso.", "erro");
            return;
        }
        
        salvarCurso({
            id: document.getElementById('cursoId').value,
            titulo: titulo,
            tipo: document.getElementById('cursoTipo').value,
            categoria: document.getElementById('cursoCategoria').value,
            descricao: document.getElementById('cursoDescricao').value,
            urlVideo: document.getElementById('cursoUrlVideo').value,
            urlEbook: document.getElementById('cursoUrlEbook').value,
            urlImagem: document.getElementById('cursoUrlImagem').value,
            duracao: document.getElementById('cursoDuracao').value,
            nivel: document.getElementById('cursoNivel').value,
            instrutor: document.getElementById('cursoInstrutor').value,
            preco: document.getElementById('cursoPreco').value
        });
    });
}

if (btnNovoCurso) btnNovoCurso.addEventListener('click', () => abrirModalCurso());

document.getElementById('btnConfirmarMatricula')?.addEventListener('click', async () => {
    const cursoId = document.getElementById('matriculaCursoId').value;
    const alunoId = document.getElementById('matriculaAluno').value;
    const dataInicio = document.getElementById('matriculaDataInicio').value;
    const observacoes = document.getElementById('matriculaObservacoes').value;
    
    if (!alunoId) {
        mostrarToast("Selecione um aluno.", "erro");
        return;
    }
    
    await matricularAluno(cursoId, alunoId, dataInicio, observacoes);
    fecharModalMatricular();
    setTimeout(() => carregarCursos(), 500);
});

if (btnLimparFiltros) btnLimparFiltros.addEventListener('click', limparFiltros);
if (searchInput) searchInput.addEventListener('input', renderizarCursos);
if (filterTipo) filterTipo.addEventListener('change', renderizarCursos);
if (filterCategoria) filterCategoria.addEventListener('change', renderizarCursos);

document.getElementById('confirmarExcluirCurso')?.addEventListener('click', () => {
    if (cursoParaExcluir) deletarCurso(cursoParaExcluir);
});

// Fechar modais
document.querySelectorAll('.modal-close-curso, .btn-cancel-curso').forEach(btn => {
    btn.addEventListener('click', fecharModalCurso);
});

document.querySelectorAll('.modal-close-detalhes, .btn-cancel-detalhes').forEach(btn => {
    btn.addEventListener('click', fecharModalDetalhes);
});

document.querySelectorAll('.modal-close-matricular, .btn-cancel-matricular').forEach(btn => {
    btn.addEventListener('click', fecharModalMatricular);
});

document.querySelectorAll('.modal-close-excluir-curso, .btn-cancel-excluir-curso').forEach(btn => {
    btn.addEventListener('click', fecharModalExcluir);
});

window.addEventListener('click', (e) => {
    if (e.target === modalCurso) fecharModalCurso();
    if (e.target === modalDetalhes) fecharModalDetalhes();
    if (e.target === modalMatricular) fecharModalMatricular();
    if (e.target === modalExcluir) fecharModalExcluir();
});

// Atualizar campos baseado no tipo de curso
const cursoTipoSelect = document.getElementById('cursoTipo');
const urlVideoGroup = document.getElementById('urlVideoGroup') || createFieldGroup();
const urlEbookGroup = document.getElementById('urlEbookGroup') || createFieldGroup();

if (cursoTipoSelect) {
    cursoTipoSelect.addEventListener('change', () => {
        const tipo = cursoTipoSelect.value;
        if (urlVideoGroup) urlVideoGroup.style.display = tipo === 'video' ? 'block' : 'none';
        if (urlEbookGroup) urlEbookGroup.style.display = tipo === 'ebook' ? 'block' : 'none';
    });
}

function createFieldGroup() {
    return { style: { display: 'block' } };
}

// Inicialização
carregarDados();

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