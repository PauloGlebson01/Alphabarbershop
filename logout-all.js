// logout-all.js - Para deslogar completamente todos os usuários
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const auth = getAuth(app);

async function logoutCompleto() {
    try {
        await signOut(auth);
        // Limpar todos os storages
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Erro no logout:", error);
    }
}

// Executar se a página for carregada com parâmetro de logout total
if (window.location.search.includes('logout=all')) {
    logoutCompleto();
}

// Função para logout apenas do admin (mantém barbeiros)
async function logoutAdmin() {
    try {
        // Verificar se tem barbeiros logados
        const hasBarbeiro = sessionStorage.getItem('barbeiroLogado') === 'true';
        
        if (!hasBarbeiro) {
            await signOut(auth);
        }
        
        sessionStorage.removeItem('adminAuthTime');
        sessionStorage.removeItem('userType');
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Erro no logout admin:", error);
    }
}

// Exportar funções para uso
export { logoutCompleto, logoutAdmin };