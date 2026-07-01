import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    Timestamp
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

// ==================== FUNÇÕES AUXILIARES ====================
function formatarTelefone(valor) {
    let v = valor.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length >= 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length >= 8) v = v.replace(/(\(\d{2}\) \d{5})(\d)/, "$1-$2");
    return v.slice(0, 16);
}

function verificarForcaSenha(senha) {
    if (!senha) return { forca: 0, texto: '', classe: '' };

    let forca = 0;
    if (senha.length >= 6) forca++;
    if (senha.length >= 10) forca++;
    if (/[A-Z]/.test(senha)) forca++;
    if (/[0-9]/.test(senha)) forca++;
    if (/[^A-Za-z0-9]/.test(senha)) forca++;

    let texto = '';
    let classe = '';

    if (forca <= 2) {
        texto = '🔴 Senha fraca';
        classe = 'strength-weak';
    } else if (forca <= 4) {
        texto = '🟡 Senha média';
        classe = 'strength-medium';
    } else {
        texto = '🟢 Senha forte';
        classe = 'strength-strong';
    }

    return { forca, texto, classe };
}

// ==================== SALVAR TODAS AS CONFIGURAÇÕES INICIAIS ====================
async function salvarConfiguracoesIniciais(dados) {
    try {
        console.log("💾 Salvando configurações iniciais...");

        // 1. Salvar configuração do sistema
        await setDoc(doc(db, "configuracoes", "sistema"), {
            configurado: true,
            nomeBarbearia: dados.nomeBarbearia,
            telefoneBarbearia: dados.telefoneBarbearia || '',
            emailAdmin: dados.email,
            dataConfiguracao: Timestamp.now(),
            versao: "1.0.0",
            horariosPadrao: {
                semana: "09:00 - 19:00",
                sabado: "09:00 - 16:00",
                domingo: "Fechado"
            },
            notificacoes: {
                som: true,
                email: false,
                whatsappLembretes: true
            }
        });

        // 2. Salvar dados da barbearia (configuracoes/studio)
        await setDoc(doc(db, "configuracoes", "studio"), {
            nome: dados.nomeBarbearia,
            telefone: dados.telefoneBarbearia || '',
            email: dados.email,
            endereco: dados.endereco || '',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        // 3. Salvar informações do administrador
        await setDoc(doc(db, "configuracoes", "admin"), {
            email: dados.email,
            nomeBarbearia: dados.nomeBarbearia,
            criadoEm: Timestamp.now(),
            ultimoAcesso: Timestamp.now()
        });

        // 4. Salvar horários padrão
        await setDoc(doc(db, "configuracoes", "horarios"), {
            semana: "09:00 - 19:00",
            sabado: "09:00 - 16:00",
            domingo: "Fechado",
            updatedAt: Timestamp.now()
        });

        // 5. Salvar configurações de preços especiais
        await setDoc(doc(db, "configuracoes", "precos_especiais"), {
            descontoPadrao: 15,
            habilitado: true,
            permitirRevenda: true,
            limiteProdutos: 10,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        // 6. Salvar aparência
        await setDoc(doc(db, "configuracoes", "aparencia"), {
            corPrimaria: "#2199EF",
            modoEscuro: true,
            updatedAt: Timestamp.now()
        });

        // 7. Salvar dados de exemplo (opcional)
        await setDoc(doc(db, "configuracoes", "exemplo"), {
            dadosCarregados: true,
            dataExemplo: Timestamp.now()
        });

        console.log("✅ Todas as configurações iniciais salvas com sucesso!");
        return true;

    } catch (error) {
        console.error("❌ Erro ao salvar configurações:", error);
        return false;
    }
}

// ==================== VERIFICAR SE JÁ EXISTE CONFIGURAÇÃO ====================
async function verificarConfiguracaoExistente() {
    try {
        const configRef = doc(db, "configuracoes", "sistema");
        const configDoc = await getDoc(configRef);

        if (configDoc.exists() && configDoc.data().configurado === true) {
            console.log("✅ Sistema já configurado. Redirecionando para login...");
            window.location.href = 'login.html';
            return true;
        }
        return false;
    } catch (error) {
        console.error("Erro ao verificar configuração:", error);
        return false;
    }
}

// ==================== INICIALIZAR PÁGINA ====================
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar se já existe configuração
    const jaConfigurado = await verificarConfiguracaoExistente();
    if (jaConfigurado) return;

    const setupForm = document.getElementById('setupForm');
    const emailInput = document.getElementById('adminEmail');
    const barbeariaNomeInput = document.getElementById('barbeariaNome');
    const barbeariaTelefoneInput = document.getElementById('barbeariaTelefone');
    const barbeariaEnderecoInput = document.getElementById('barbeariaEndereco');
    const senhaInput = document.getElementById('adminSenha');
    const confirmarSenhaInput = document.getElementById('confirmarSenha');
    const btnSetup = document.getElementById('btnSetup');
    const setupErro = document.getElementById('setupErro');
    const senhaStrength = document.getElementById('senhaStrength');

    // Criar campo de endereço se não existir no HTML
    if (barbeariaEnderecoInput === null) {
        const enderecoGroup = document.createElement('div');
        enderecoGroup.className = 'input-group';
        enderecoGroup.innerHTML = `
            <label><i class="fa-solid fa-location-dot"></i> Endereço da Barbearia</label>
            <div class="input-wrapper">
                <i class="fa-solid fa-location-dot"></i>
                <input type="text" id="barbeariaEndereco" placeholder="Rua, número, bairro, cidade">
            </div>
        `;
        const telefoneGroup = document.querySelector('#barbeariaTelefone')?.closest('.input-group');
        if (telefoneGroup && telefoneGroup.parentNode) {
            telefoneGroup.parentNode.insertBefore(enderecoGroup, telefoneGroup.nextSibling);
        }
    }

    // Máscara de telefone
    if (barbeariaTelefoneInput) {
        barbeariaTelefoneInput.addEventListener('input', (e) => {
            e.target.value = formatarTelefone(e.target.value);
        });
    }

    // Verificar força da senha
    if (senhaInput) {
        senhaInput.addEventListener('input', () => {
            const forca = verificarForcaSenha(senhaInput.value);
            if (senhaStrength) {
                senhaStrength.innerHTML = `<span class="${forca.classe}">${forca.texto}</span>`;
            }
        });
    }

    function mostrarErro(mensagem) {
        if (setupErro) {
            setupErro.textContent = mensagem;
            setupErro.style.display = 'block';
            setTimeout(() => {
                if (setupErro) setupErro.style.display = 'none';
            }, 5000);
        }
    }

    function limparErro() {
        if (setupErro) setupErro.style.display = 'none';
    }

    function setLoading(loading) {
        if (btnSetup) {
            if (loading) {
                btnSetup.disabled = true;
                btnSetup.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando conta...';
            } else {
                btnSetup.disabled = false;
                btnSetup.innerHTML = '<i class="fa-solid fa-user-plus"></i> Criar Conta Administrativa';
            }
        }
    }

    if (setupForm) {
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            limparErro();

            const email = emailInput ? emailInput.value.trim() : '';
            const barbeariaNome = barbeariaNomeInput ? barbeariaNomeInput.value.trim() : '';
            const barbeariaTelefone = barbeariaTelefoneInput ? barbeariaTelefoneInput.value.trim() : '';
            const barbeariaEndereco = document.getElementById('barbeariaEndereco')?.value.trim() || '';
            const senha = senhaInput ? senhaInput.value : '';
            const confirmarSenha = confirmarSenhaInput ? confirmarSenhaInput.value : '';

            // Validações
            if (!email) {
                mostrarErro("❌ Informe o e-mail do administrador.");
                return;
            }

            if (!barbeariaNome) {
                mostrarErro("❌ Informe o nome da barbearia.");
                return;
            }

            if (!senha) {
                mostrarErro("❌ Informe uma senha.");
                return;
            }

            if (senha.length < 6) {
                mostrarErro("❌ A senha deve ter no mínimo 6 caracteres.");
                return;
            }

            if (senha !== confirmarSenha) {
                mostrarErro("❌ As senhas não coincidem.");
                return;
            }

            setLoading(true);

            try {
                // Verificar novamente se já foi configurado
                const jaConfigurado = await verificarConfiguracaoExistente();
                if (jaConfigurado) return;

                console.log("📝 Criando usuário no Firebase Auth...");

                // Criar usuário no Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
                console.log("✅ Usuário criado:", userCredential.user.email);

                // Salvar todas as configurações iniciais
                const configuracaoSalva = await salvarConfiguracoesIniciais({
                    email: email,
                    nomeBarbearia: barbeariaNome,
                    telefoneBarbearia: barbeariaTelefone,
                    endereco: barbeariaEndereco
                });

                if (!configuracaoSalva) {
                    throw new Error("Erro ao salvar configurações");
                }

                // Gerar sessão do admin
                const sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString();
                sessionStorage.setItem('admin_active', 'true');
                sessionStorage.setItem('admin_session_id', sessionId);
                sessionStorage.setItem('admin_email', email);
                sessionStorage.setItem('admin_login_time', Date.now().toString());
                sessionStorage.setItem('barbearia_nome', barbeariaNome);

                // Exibir mensagem de sucesso com os dados salvos
                const container = document.querySelector('.login-container');
                if (container) {
                    container.innerHTML = `
                        <div class="logo-area">
                            <img src="./assets/barber-perfil.png" alt="Logo">
                            <h1>🎉 Conta Criada!</h1>
                        </div>
                        <div class="success-box">
                            <i class="fa-solid fa-circle-check"></i>
                            <p><strong>Conta administrativa criada com sucesso!</strong></p>
                            <div style="text-align: left; margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 12px;">
                                <p><i class="fa-solid fa-envelope"></i> <strong>E-mail:</strong> ${email}</p>
                                <p><i class="fa-solid fa-store"></i> <strong>Barbearia:</strong> ${barbeariaNome}</p>
                                ${barbeariaTelefone ? `<p><i class="fa-solid fa-phone"></i> <strong>Telefone:</strong> ${barbeariaTelefone}</p>` : ''}
                                ${barbeariaEndereco ? `<p><i class="fa-solid fa-location-dot"></i> <strong>Endereço:</strong> ${barbeariaEndereco}</p>` : ''}
                            </div>
                            <p style="font-size: 0.8rem; margin-top: 15px;">✅ Você será redirecionado para o painel administrativo.</p>
                            <p style="font-size: 0.7rem; color: #94a3b8; margin-top: 10px;">⚙️ As configurações da sua barbearia foram salvas automaticamente!</p>
                        </div>
                        <div class="login-footer">
                            <p>© 2026 Alpha BarberShop | SOFTCLICK by SoftPower</p>
                        </div>
                    `;

                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 4000);
                }

            } catch (error) {
                console.error("Erro ao criar conta:", error.code, error.message);

                let mensagemErro = "";

                switch (error.code) {
                    case 'auth/email-already-in-use':
                        mensagemErro = "❌ Este e-mail já está em uso. Tente outro ou faça login.";
                        break;
                    case 'auth/invalid-email':
                        mensagemErro = "❌ E-mail inválido.";
                        break;
                    case 'auth/weak-password':
                        mensagemErro = "❌ Senha muito fraca. Use pelo menos 6 caracteres.";
                        break;
                    case 'auth/network-request-failed':
                        mensagemErro = "❌ Erro de conexão. Verifique sua internet.";
                        break;
                    default:
                        mensagemErro = `❌ Erro ao criar conta: ${error.message}`;
                }

                mostrarErro(mensagemErro);
                setLoading(false);
            }
        });
    }
});