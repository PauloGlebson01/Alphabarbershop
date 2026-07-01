import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    signOut
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

const form = document.getElementById('formLoginBarbeiro');
const emailInput = document.getElementById('email');
const senhaInput = document.getElementById('senha');
const mensagemDiv = document.getElementById('mensagem');
const toggleSenhaBtn = document.getElementById('toggleSenha');

function mostrarMensagem(texto, tipo = 'erro') {
    mensagemDiv.textContent = texto;
    mensagemDiv.className = `mensagem ${tipo}`;
    mensagemDiv.style.display = 'block';
    setTimeout(() => {
        mensagemDiv.style.display = 'none';
    }, 5000);
}

async function verificarSeEhBarbeiro(email) {
    try {
        console.log("Verificando se é barbeiro:", email);
        
        const profissionaisRef = collection(db, "profissionais");
        const q = query(profissionaisRef, where("email", "==", email));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const barbeiroDoc = snapshot.docs[0];
            const barbeiro = barbeiroDoc.data();
            console.log("✅ Barbeiro encontrado:", barbeiro.nome);
            return { 
                isBarbeiro: true, 
                barbeiroData: barbeiro, 
                barbeiroId: barbeiroDoc.id 
            };
        }
        
        console.log("❌ Email não encontrado na coleção profissionais");
        return { isBarbeiro: false };
        
    } catch (error) {
        console.error("Erro ao verificar barbeiro:", error);
        return { isBarbeiro: false, error: error.message };
    }
}

// Função para fazer logout sem afetar outras abas
function fazerLogoutIsolado() {
    sessionStorage.clear();
    mostrarMensagem("Logout realizado!", "sucesso");
    setTimeout(() => {
        window.location.href = 'login-barbeiro.html';
    }, 1000);
}

// Verificar se já está logado via token
function verificarSessaoExistente() {
    const sessaoStr = sessionStorage.getItem('barbeiro_sessao');
    if (sessaoStr) {
        try {
            const sessao = JSON.parse(sessaoStr);
            if (sessao.expiraEm > Date.now()) {
                console.log("✅ Sessão existente encontrada");
                window.location.href = 'painel-barbeiro.html';
                return true;
            }
        } catch(e) {}
    }
    return false;
}

// Verificar sessão ao carregar
if (!verificarSessaoExistente()) {
    console.log("Nenhuma sessão ativa, aguardando login");
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const senha = senhaInput.value;
    
    if (!email || !senha) {
        mostrarMensagem("Preencha todos os campos", "erro");
        return;
    }
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
    
    try {
        // 1. Verificar se o email é de um barbeiro
        const verificacao = await verificarSeEhBarbeiro(email);
        
        if (!verificacao.isBarbeiro) {
            mostrarMensagem("❌ Acesso negado. Este e-mail não pertence a um barbeiro cadastrado.", "erro");
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            return;
        }
        
        // 2. Tentar fazer login no Firebase Auth
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...';
        
        let userCredential;
        try {
            userCredential = await signInWithEmailAndPassword(auth, email, senha);
            console.log("✅ Firebase Auth: login realizado com sucesso");
        } catch (authError) {
            console.error("Erro no Firebase Auth:", authError.code);
            
            // Verificar se é erro de credencial
            if (authError.code === 'auth/invalid-credential' || 
                authError.code === 'auth/wrong-password' ||
                authError.code === 'auth/user-not-found') {
                
                mostrarMensagem("❌ E-mail ou senha incorretos. Verifique suas credenciais.", "erro");
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                return;
            }
            throw authError;
        }
        
        // 3. Login bem sucedido - criar sessão isolada
        const token = btoa(`${verificacao.barbeiroId}:${Date.now()}:${Math.random()}`);
        const sessao = {
            barbeiroId: verificacao.barbeiroId,
            barbeiroData: verificacao.barbeiroData,
            token: token,
            sessaoId: Math.random().toString(36).substring(2, 15),
            timestamp: Date.now(),
            expiraEm: Date.now() + (24 * 60 * 60 * 1000) // 24 horas
        };
        
        sessionStorage.setItem('barbeiro_sessao', JSON.stringify(sessao));
        sessionStorage.setItem('barbeiroLogado', 'true');
        sessionStorage.setItem('barbeiroId', verificacao.barbeiroId);
        sessionStorage.setItem('barbeiroNome', verificacao.barbeiroData.nome);
        sessionStorage.setItem('barbeiroEmail', email);
        
        mostrarMensagem("✅ Login realizado com sucesso! Redirecionando...", "sucesso");
        
        setTimeout(() => {
            window.location.href = 'painel-barbeiro.html';
        }, 1500);
        
    } catch (error) {
        console.error("Erro no login:", error);
        mostrarMensagem("Erro ao fazer login. Tente novamente.", "erro");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

if (toggleSenhaBtn) {
    toggleSenhaBtn.addEventListener('click', () => {
        const type = senhaInput.getAttribute('type') === 'password' ? 'text' : 'password';
        senhaInput.setAttribute('type', type);
        toggleSenhaBtn.innerHTML = type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });
}

// Exportar função de logout
window.fazerLogoutIsolado = fazerLogoutIsolado;

console.log("✅ login-barbeiro.js carregado");