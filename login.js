import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    collection,
    query,
    where,
    getDocs,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const db = getFirestore(app);

let isAdminLogout = false;

// CONFIGURAÇÃO DO FORMSUBMIT - URL FIXA
const FORM_SUBMIT_URL = 'https://formsubmit.co/ajax/softpowersolucoesdigitais@gmail.com';

// DADOS PADRÃO (fallback)
const ADMIN_PADRAO = {
    email: "softpowersolucoesdigitais@gmail.com",
    senha: "admin123"
};

// Função para normalizar e-mail
function normalizarEmail(email) {
    if (!email) return '';
    let normalized = email.toLowerCase().trim();
    const [localPart, domain] = normalized.split('@');
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        normalized = localPart.replace(/\./g, '') + '@' + domain;
    }
    return normalized;
}

// FUNÇÃO PARA SALVAR SENHA USANDO SESSIONSTORAGE (FALLBACK)
function salvarSenhaLocal(email, senha) {
    try {
        const senhasSalvas = JSON.parse(sessionStorage.getItem('admin_senhas') || '{}');
        const emailKey = normalizarEmail(email);
        senhasSalvas[emailKey] = senha;
        sessionStorage.setItem('admin_senhas', JSON.stringify(senhasSalvas));
        localStorage.setItem(`admin_senha_${emailKey}`, senha);
        console.log("✅ Senha salva no armazenamento local!");
        return true;
    } catch (error) {
        console.error("Erro ao salvar local:", error);
        return false;
    }
}

// FUNÇÃO PARA BUSCAR SENHA LOCALMENTE
function buscarSenhaLocal(email) {
    try {
        const emailKey = normalizarEmail(email);
        const senhasSalvas = JSON.parse(sessionStorage.getItem('admin_senhas') || '{}');
        
        if (senhasSalvas[emailKey]) {
            return senhasSalvas[emailKey];
        }
        
        const localStorageSenha = localStorage.getItem(`admin_senha_${emailKey}`);
        if (localStorageSenha) {
            return localStorageSenha;
        }
        
        return null;
    } catch (error) {
        console.error("Erro ao buscar local:", error);
        return null;
    }
}

// FUNÇÃO PARA SALVAR A SENHA (TENTA FIREBASE, FALHA USA LOCAL)
async function salvarSenhaAdmin(email, senha) {
    console.log("💾 Salvando senha para:", email);
    
    // Sempre salvar localmente primeiro
    salvarSenhaLocal(email, senha);
    
    // Tentar salvar no Firebase (pode falhar por CORS/permissão)
    try {
        const emailNormalizado = email.toLowerCase().trim();
        
        const configRef = doc(db, "configuracoes", "sistema");
        await setDoc(configRef, {
            emailAdmin: emailNormalizado,
            senhaAdmin: senha,
            ultimaAtualizacao: new Date().toISOString(),
            configurado: true
        }, { merge: true });
        
        console.log("✅ Senha salva no Firebase!");
        return true;
        
    } catch (error) {
        console.warn("⚠️ Não foi possível salvar no Firebase (permissão), mas salvou localmente:", error.message);
        return true;
    }
}

// FUNÇÃO PARA BUSCAR A SENHA (PRIMEIRO LOCAL, DEPOIS FIREBASE)
async function buscarSenhaRealAdmin(email) {
    try {
        console.log("🔍 Buscando senha para o e-mail:", email);
        
        const emailNormalizado = normalizarEmail(email);
        const emailPadraoNormalizado = normalizarEmail(ADMIN_PADRAO.email);
        
        // 1. Buscar localmente primeiro
        const senhaLocal = buscarSenhaLocal(email);
        if (senhaLocal) {
            console.log("✅ Senha encontrada LOCALMENTE!");
            return {
                encontrado: true,
                email: email,
                senha: senhaLocal,
                nomeBarbearia: "Alpha BarberShop"
            };
        }
        
        // 2. Verificar se é o admin padrão
        if (emailNormalizado === emailPadraoNormalizado || email.includes("softpower")) {
            console.log("✅ Usando credenciais padrão do admin");
            return {
                encontrado: true,
                email: ADMIN_PADRAO.email,
                senha: ADMIN_PADRAO.senha,
                nomeBarbearia: "Alpha BarberShop"
            };
        }
        
        // 3. Tentar buscar no Firebase
        try {
            const configRef = doc(db, "configuracoes", "sistema");
            const configDoc = await getDoc(configRef);
            
            if (configDoc.exists()) {
                const configData = configDoc.data();
                if (configData.senhaAdmin) {
                    console.log("✅ Senha encontrada no Firebase!");
                    salvarSenhaLocal(email, configData.senhaAdmin);
                    return {
                        encontrado: true,
                        email: configData.emailAdmin || email,
                        senha: configData.senhaAdmin,
                        nomeBarbearia: configData.nomeBarbearia || "Alpha BarberShop"
                    };
                }
            }
        } catch (firebaseError) {
            console.warn("⚠️ Erro ao buscar no Firebase:", firebaseError.message);
        }
        
        console.log("❌ Nenhuma senha encontrada");
        return { encontrado: false };
        
    } catch (error) {
        console.error("Erro ao buscar senha:", error);
        return { encontrado: false, erro: error.message };
    }
}

// FUNÇÃO PARA ENVIAR E-MAIL SIMPLES (APENAS TEXTO)
async function enviarSenhaPorEmail(emailDestino, dadosAdmin) {
    const formData = new FormData();
    
    console.log("📧 Enviando e-mail simples para:", emailDestino);
    console.log("🔑 Senha enviada:", dadosAdmin.senha);
    
    // Configuração do FormSubmit
    formData.append('_subject', `🔐 Sua senha - Alpha BarberShop`);
    formData.append('_captcha', 'false');
    formData.append('_replyto', emailDestino);
    
    // E-MAIL SIMPLES E CURTO (apenas texto)
    const mensagemSimples = `
🔐 RECUPERAÇÃO DE SENHA - ALPHA BARBERSHOP

Olá Administrador,

Sua senha de acesso ao sistema é:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 SENHA: ${dadosAdmin.senha}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📧 E-mail de acesso: ${emailDestino}

💡 Dica: Recomendamos alterar sua senha após o login.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Acesse o sistema: ${window.location.origin}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este e-mail foi enviado automaticamente.
Se você não solicitou a recuperação, ignore esta mensagem.

© Alpha BarberShop - SOFTCLICK by SoftPower
    `;
    
    formData.append('message', mensagemSimples);
    
    try {
        const response = await fetch(FORM_SUBMIT_URL, {
            method: 'POST',
            body: formData
        });
        
        console.log("📬 Resposta do servidor:", response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log("✅ E-mail enviado com sucesso!");
            return { sucesso: true };
        } else {
            const erro = await response.text();
            console.error("❌ Erro no FormSubmit:", erro);
            return { sucesso: false, erro: `HTTP ${response.status}` };
        }
    } catch (error) {
        console.error("❌ Erro ao enviar e-mail:", error);
        return { sucesso: false, erro: error.message };
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Elementos do DOM
    const loginPanel = document.getElementById('loginPanel');
    const resetPanel = document.getElementById('resetPanel');
    const loginForm = document.getElementById('loginForm');
    const resetForm = document.getElementById('resetForm');
    const emailInput = document.getElementById('email');
    const senhaInput = document.getElementById('senha');
    const btnLogin = document.getElementById('btnLogin');
    const btnReset = document.getElementById('btnReset');
    const resetEmail = document.getElementById('resetEmail');
    const loginErro = document.getElementById('loginErro');
    const resetMensagem = document.getElementById('resetMensagem');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');

    function mostrarErro(mensagem) {
        if (loginErro) {
            loginErro.textContent = mensagem;
            loginErro.style.display = 'block';
            loginErro.classList.remove('sucesso');
            setTimeout(() => {
                if (loginErro) loginErro.style.display = 'none';
            }, 5000);
        }
    }

    function limparErro() {
        if (loginErro) {
            loginErro.style.display = 'none';
            loginErro.textContent = '';
        }
    }

    function mostrarMensagemReset(mensagem, isSucesso = false) {
        if (resetMensagem) {
            resetMensagem.textContent = mensagem;
            resetMensagem.style.display = 'block';
            if (isSucesso) {
                resetMensagem.classList.add('sucesso');
            } else {
                resetMensagem.classList.remove('sucesso');
            }
            setTimeout(() => {
                if (resetMensagem) resetMensagem.style.display = 'none';
            }, 8000);
        }
    }

    function setLoading(loading) {
        if (btnLogin) {
            if (loading) {
                btnLogin.disabled = true;
                btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
            } else {
                btnLogin.disabled = false;
                btnLogin.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Entrar';
            }
        }
    }

    function setResetLoading(loading) {
        if (btnReset) {
            if (loading) {
                btnReset.disabled = true;
                btnReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
            } else {
                btnReset.disabled = false;
                btnReset.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar senha por e-mail';
            }
        }
    }

    // Alternar telas
    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginPanel) loginPanel.style.display = 'none';
            if (resetPanel) resetPanel.style.display = 'block';
            if (resetEmail) {
                resetEmail.value = '';
                resetEmail.focus();
            }
        });
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (resetPanel) resetPanel.style.display = 'none';
            if (loginPanel) loginPanel.style.display = 'block';
            if (resetMensagem) resetMensagem.style.display = 'none';
            if (loginErro) loginErro.style.display = 'none';
        });
    }

    // FUNÇÃO DE RECUPERAÇÃO DE SENHA
    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            let email = resetEmail ? resetEmail.value.trim() : '';
            
            if (!email) {
                mostrarMensagemReset("❌ Digite seu e-mail para recuperar a senha.", false);
                return;
            }
            
            setResetLoading(true);
            mostrarMensagemReset("🔍 Buscando sua senha...", false);
            
            try {
                const resultado = await buscarSenhaRealAdmin(email);
                
                if (!resultado.encontrado) {
                    mostrarMensagemReset(
                        "❌ Senha não encontrada.\n\n" +
                        "Faça login primeiro para salvar sua senha no sistema.\n\n" +
                        "📧 E-mail padrão: softpowersolucoesdigitais@gmail.com\n" +
                        "🔑 Senha padrão: admin123",
                        false
                    );
                    setResetLoading(false);
                    return;
                }
                
                mostrarMensagemReset("📧 Enviando sua senha por e-mail...", false);
                
                const envio = await enviarSenhaPorEmail(resultado.email, {
                    senha: resultado.senha,
                    nomeBarbearia: resultado.nomeBarbearia
                });
                
                if (envio.sucesso) {
                    mostrarMensagemReset(
                        "✅ SENHA ENVIADA!\n\n" +
                        "Verifique seu e-mail.\n\n" +
                        `📧 Enviamos para: ${resultado.email}`,
                        true
                    );
                    
                    resetEmail.value = '';
                    
                    setTimeout(() => {
                        if (resetPanel) resetPanel.style.display = 'none';
                        if (loginPanel) loginPanel.style.display = 'block';
                        if (resetMensagem) resetMensagem.style.display = 'none';
                        if (emailInput) emailInput.value = resultado.email;
                        if (senhaInput) senhaInput.value = resultado.senha;
                    }, 3000);
                } else {
                    mostrarMensagemReset(
                        "❌ Erro ao enviar e-mail.\n\nTente novamente.",
                        false
                    );
                }
                
            } catch (error) {
                console.error("Erro:", error);
                mostrarMensagemReset("❌ Erro ao processar solicitação.", false);
            } finally {
                setResetLoading(false);
            }
        });
    }

    // FUNÇÃO DE LOGIN
    onAuthStateChanged(auth, (user) => {
        if (isAdminLogout) return;
        
        const isAdminSession = sessionStorage.getItem('admin_active') === 'true';
        const adminId = sessionStorage.getItem('admin_session_id');
        
        if (user && isAdminSession && adminId) {
            window.location.href = 'dashboard.html';
        } else if (!user && isAdminSession) {
            sessionStorage.clear();
            window.location.reload();
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            limparErro();
            
            const email = emailInput ? emailInput.value.trim() : '';
            const senha = senhaInput ? senhaInput.value : '';
            
            if (!email || !senha) {
                mostrarErro("Preencha todos os campos!");
                return;
            }
            
            setLoading(true);
            
            try {
                isAdminLogout = false;
                sessionStorage.clear();
                
                const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString();
                
                if (auth.currentUser) {
                    await signOut(auth);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                const userCredential = await signInWithEmailAndPassword(auth, email, senha);
                
                // SALVAR SENHA LOCALMENTE
                await salvarSenhaAdmin(email, senha);
                
                sessionStorage.setItem('admin_active', 'true');
                sessionStorage.setItem('admin_session_id', sessionId);
                sessionStorage.setItem('admin_email', userCredential.user.email);
                sessionStorage.setItem('admin_login_time', Date.now().toString());
                
                console.log("✅ Login realizado com sucesso!");
                window.location.href = 'dashboard.html';
                
            } catch (error) {
                console.error("Erro:", error.code);
                sessionStorage.clear();
                
                let mensagemErro = "";
                switch (error.code) {
                    case 'auth/invalid-email':
                        mensagemErro = "❌ E-mail inválido.";
                        break;
                    case 'auth/user-not-found':
                        mensagemErro = "❌ Usuário não encontrado.";
                        break;
                    case 'auth/wrong-password':
                        mensagemErro = "❌ Senha incorreta.";
                        break;
                    default:
                        mensagemErro = `❌ Erro: ${error.message}`;
                }
                mostrarErro(mensagemErro);
                setLoading(false);
            }
        });
    }

    // Enter para enviar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (loginPanel && loginPanel.style.display !== 'none' && loginForm) {
                e.preventDefault();
                loginForm.dispatchEvent(new Event('submit'));
            } else if (resetPanel && resetPanel.style.display !== 'none' && resetForm) {
                e.preventDefault();
                resetForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    if (emailInput) emailInput.addEventListener('input', limparErro);
    if (senhaInput) senhaInput.addEventListener('input', limparErro);
    if (resetEmail) resetEmail.addEventListener('input', () => {
        if (resetMensagem) resetMensagem.style.display = 'none';
    });
});