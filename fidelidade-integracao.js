// fidelidade-integracao.js - Integração do programa de fidelidade
import { db, Timestamp } from "./firebase-config.js";
import { doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Configuração padrão
const CONFIG_PADRAO = {
    pontosPorRealServico: 1,
    pontosPorRealProduto: 0.5,
    pontosAniversario: 100,
    pontosIndicacao: 50,
    pontosAvaliacao: 20,
    niveis: {
        bronze: 0,
        prata: 500,
        ouro: 1500,
        diamante: 5000
    }
};

// Buscar configurações
async function getConfigFidelidade() {
    try {
        const configDoc = await getDoc(doc(db, "configuracoes", "fidelidade"));
        if (configDoc.exists()) {
            return { ...CONFIG_PADRAO, ...configDoc.data() };
        }
        return CONFIG_PADRAO;
    } catch (error) {
        console.error("Erro ao buscar configurações:", error);
        return CONFIG_PADRAO;
    }
}

// Adicionar pontos por compra
export async function adicionarPontosCompra(clienteId, clienteNome, valorTotal, tipo = "servico") {
    try {
        const config = await getConfigFidelidade();
        
        let pontos = 0;
        if (tipo === "servico") {
            pontos = Math.floor(valorTotal * config.pontosPorRealServico);
        } else {
            pontos = Math.floor(valorTotal * config.pontosPorRealProduto);
        }
        
        if (pontos === 0) return { sucesso: false, pontos: 0 };
        
        // Buscar cliente no programa
        const fidelidadeQuery = query(collection(db, "clientes_fidelidade"), where("clienteId", "==", clienteId));
        const fidelidadeSnap = await getDocs(fidelidadeQuery);
        
        let pontosAtuais = 0;
        let pontosGanhos = 0;
        
        if (!fidelidadeSnap.empty) {
            const fidelidadeDoc = fidelidadeSnap.docs[0];
            pontosAtuais = fidelidadeDoc.data().pontos || 0;
            pontosGanhos = fidelidadeDoc.data().pontosGanhos || 0;
            
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
        
        // Registrar histórico
        await addDoc(collection(db, "historico_pontos"), {
            clienteId: clienteId,
            clienteNome: clienteNome,
            quantidade: pontos,
            motivo: `Compra finalizada - ${tipo === "servico" ? "Serviço" : "Produto"} no valor de R$ ${valorTotal.toFixed(2)}`,
            data: Timestamp.now()
        });
        
        console.log(`✅ ${pontos} pontos adicionados para ${clienteNome}`);
        return { sucesso: true, pontos: pontos, total: pontosAtuais + pontos };
        
    } catch (error) {
        console.error("Erro ao adicionar pontos:", error);
        return { sucesso: false, pontos: 0, erro: error.message };
    }
}

// Adicionar pontos por indicação
export async function adicionarPontosIndicacao(clienteId, clienteNome, indicadoNome) {
    try {
        const config = await getConfigFidelidade();
        const pontos = config.pontosIndicacao || 50;
        
        const fidelidadeQuery = query(collection(db, "clientes_fidelidade"), where("clienteId", "==", clienteId));
        const fidelidadeSnap = await getDocs(fidelidadeQuery);
        
        if (!fidelidadeSnap.empty) {
            const fidelidadeDoc = fidelidadeSnap.docs[0];
            const pontosAtuais = fidelidadeDoc.data().pontos || 0;
            const pontosGanhos = fidelidadeDoc.data().pontosGanhos || 0;
            
            await updateDoc(doc(db, "clientes_fidelidade", fidelidadeDoc.id), {
                pontos: pontosAtuais + pontos,
                pontosGanhos: pontosGanhos + pontos,
                updatedAt: Timestamp.now()
            });
            
            await addDoc(collection(db, "historico_pontos"), {
                clienteId: clienteId,
                clienteNome: clienteNome,
                quantidade: pontos,
                motivo: `Indicação de cliente: ${indicadoNome}`,
                data: Timestamp.now()
            });
        }
        
        return { sucesso: true, pontos: pontos };
        
    } catch (error) {
        console.error("Erro ao adicionar pontos por indicação:", error);
        return { sucesso: false, pontos: 0 };
    }
}

// Adicionar pontos por aniversário
export async function adicionarPontosAniversario(clienteId, clienteNome) {
    try {
        const config = await getConfigFidelidade();
        const pontos = config.pontosAniversario || 100;
        
        // Verificar se já recebeu pontos este ano
        const historicoQuery = query(
            collection(db, "historico_pontos"),
            where("clienteId", "==", clienteId),
            where("motivo", "==", "Aniversário")
        );
        const historicoSnap = await getDocs(historicoQuery);
        
        const anoAtual = new Date().getFullYear();
        const jaRecebeu = historicoSnap.docs.some(doc => {
            const data = doc.data().data?.toDate();
            return data && data.getFullYear() === anoAtual;
        });
        
        if (jaRecebeu) {
            console.log(`Cliente ${clienteNome} já recebeu pontos de aniversário este ano`);
            return { sucesso: false, pontos: 0, motivo: "Já recebeu este ano" };
        }
        
        const fidelidadeQuery = query(collection(db, "clientes_fidelidade"), where("clienteId", "==", clienteId));
        const fidelidadeSnap = await getDocs(fidelidadeQuery);
        
        if (!fidelidadeSnap.empty) {
            const fidelidadeDoc = fidelidadeSnap.docs[0];
            const pontosAtuais = fidelidadeDoc.data().pontos || 0;
            const pontosGanhos = fidelidadeDoc.data().pontosGanhos || 0;
            
            await updateDoc(doc(db, "clientes_fidelidade", fidelidadeDoc.id), {
                pontos: pontosAtuais + pontos,
                pontosGanhos: pontosGanhos + pontos,
                updatedAt: Timestamp.now()
            });
            
            await addDoc(collection(db, "historico_pontos"), {
                clienteId: clienteId,
                clienteNome: clienteNome,
                quantidade: pontos,
                motivo: "Aniversário",
                observacao: "Pontos de aniversário",
                data: Timestamp.now()
            });
        }
        
        return { sucesso: true, pontos: pontos };
        
    } catch (error) {
        console.error("Erro ao adicionar pontos de aniversário:", error);
        return { sucesso: false, pontos: 0 };
    }
}

// Verificar saldo de pontos
export async function verificarSaldoPontos(clienteId) {
    try {
        const fidelidadeQuery = query(collection(db, "clientes_fidelidade"), where("clienteId", "==", clienteId));
        const fidelidadeSnap = await getDocs(fidelidadeQuery);
        
        if (!fidelidadeSnap.empty) {
            const data = fidelidadeSnap.docs[0].data();
            return {
                sucesso: true,
                pontos: data.pontos || 0,
                pontosGanhos: data.pontosGanhos || 0,
                totalResgatados: data.totalResgatados || 0
            };
        }
        
        return { sucesso: true, pontos: 0, pontosGanhos: 0, totalResgatados: 0 };
        
    } catch (error) {
        console.error("Erro ao verificar saldo:", error);
        return { sucesso: false, pontos: 0 };
    }
}