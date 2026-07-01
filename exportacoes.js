import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query, 
    getDocs, 
    where, 
    orderBy, 
    addDoc,
    onSnapshot,
    deleteDoc,
    doc,
    getDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

console.log("Firebase carregado e módulo ativo!");

signInAnonymously(auth).catch(console.error);

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Autenticado com sucesso!");
        monitorarHistorico();
    }
});

// ==================== FUNÇÕES AUXILIARES ====================
function calcularMargem(preco, custo) {
    if (!preco || preco <= 0) return 0;
    return ((preco - custo) / preco) * 100;
}

function calcularComissao(valor, percentual) {
    if (!valor || valor <= 0) return 0;
    return (valor * percentual) / 100;
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
    return data.toLocaleDateString('pt-BR');
}

// ==================== FUNÇÕES AUXILIARES PARA BUSCA ====================
async function buscarCliente(clienteId) {
    if (!clienteId) return null;
    try {
        const clienteDoc = await getDoc(doc(db, "clientes", clienteId));
        if (clienteDoc.exists()) return clienteDoc.data();
        return null;
    } catch (e) {
        console.error("Erro ao buscar cliente:", e);
        return null;
    }
}

async function buscarBarbeiro(barbeiroId) {
    if (!barbeiroId) return null;
    try {
        const barbeiroDoc = await getDoc(doc(db, "profissionais", barbeiroId));
        if (barbeiroDoc.exists()) return barbeiroDoc.data();
        return null;
    } catch (e) {
        console.error("Erro ao buscar barbeiro:", e);
        return null;
    }
}

async function buscarServico(servicoId) {
    if (!servicoId) return null;
    try {
        const servicoDoc = await getDoc(doc(db, "servicos", servicoId));
        if (servicoDoc.exists()) return servicoDoc.data();
        return null;
    } catch (e) {
        console.error("Erro ao buscar serviço:", e);
        return null;
    }
}

// ==================== EXCEL - AGENDAMENTOS ====================
window.exportarExcelAgendamentos = async () => {
    const inicio = document.getElementById('excelAgendamentoDataInicio').value;
    const fim = document.getElementById('excelAgendamentoDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snap = await getDocs(q);
        const dados = [];
        snap.forEach(doc => {
            const data = doc.data();
            dados.push({
                'Data': data.data || '',
                'Cliente': data.cliente || data.nome || '',
                'Telefone': data.telefone || data.whatsapp || '',
                'Serviço': data.servicoNome || data.servico || '',
                'Horário': data.horario || '',
                'Valor': `R$ ${(data.valor || 0).toFixed(2)}`,
                'Status': data.status || ''
            });
        });
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhum agendamento encontrado no período.", "erro");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");
        const nomeArquivo = `Agendamentos_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        await registrarExportacao("Agendamentos", "Excel", dados, nomeArquivo);
        mostrarNotificacao(`Agendamentos exportados com sucesso!`, "sucesso");
    } catch (e) { 
        console.error("Erro no Firebase:", e); 
        mostrarNotificacao("Erro ao acessar o banco de dados.", "erro"); 
    }
};

// ==================== EXCEL - CLIENTES ====================
window.exportarExcelClientes = async () => {
    const inicio = document.getElementById('excelClienteDataInicio').value;
    const fim = document.getElementById('excelClienteDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const snap = await getDocs(collection(db, "clientes"));
        const dados = [];
        
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            
            let dataCadastro = null;
            if (data.createdAt) {
                if (data.createdAt.toDate) {
                    dataCadastro = data.createdAt.toDate();
                } else if (data.createdAt.seconds) {
                    dataCadastro = new Date(data.createdAt.seconds * 1000);
                } else if (typeof data.createdAt === 'string') {
                    dataCadastro = new Date(data.createdAt);
                }
            } else if (data.dataCadastro) {
                dataCadastro = new Date(data.dataCadastro);
            }
            
            if (dataCadastro) {
                if (dataCadastro < dataInicio || dataCadastro > dataFim) {
                    continue;
                }
            }
            
            const dataCadastroFormatada = dataCadastro ? 
                `${dataCadastro.getDate().toString().padStart(2, '0')}/${(dataCadastro.getMonth() + 1).toString().padStart(2, '0')}/${dataCadastro.getFullYear()}` : '-';
            
            dados.push({
                'Nome do Cliente': data.nome || data.cliente || '',
                'Contato': data.telefone || data.whatsapp || '',
                'E-mail': data.email || '',
                'Data de Cadastro': dataCadastroFormatada
            });
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhum cliente encontrado no período.", "erro");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Clientes");
        const nomeArquivo = `Clientes_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        await registrarExportacao("Clientes", "Excel", dados, nomeArquivo);
        mostrarNotificacao("Clientes exportados com sucesso!", "sucesso");
    } catch (e) { 
        console.error(e);
        mostrarNotificacao("Erro ao exportar clientes.", "erro"); 
    }
};

// ==================== EXCEL - COMANDAS ====================
window.exportarExcelComandas = async () => {
    const inicio = document.getElementById('excelComandaDataInicio')?.value;
    const fim = document.getElementById('excelComandaDataFim')?.value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando relatório de comandas...", "sucesso");
        
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const q = query(
            collection(db, "comandas"), 
            where("dataCriacao", ">=", Timestamp.fromDate(dataInicio)), 
            where("dataCriacao", "<=", Timestamp.fromDate(dataFim))
        );
        
        const snap = await getDocs(q);
        const dados = [];
        let totalFaturamento = 0;
        let totalComandas = 0;
        let totalFinalizadas = 0;
        
        for (const docSnap of snap.docs) {
            const comanda = docSnap.data();
            const cliente = await buscarCliente(comanda.clienteId);
            const barbeiro = await buscarBarbeiro(comanda.barbeiroId);
            
            const valor = comanda.total || 0;
            totalFaturamento += valor;
            totalComandas++;
            if (comanda.status === 'finalizada') totalFinalizadas++;
            
            let servicosTexto = '';
            if (comanda.servicos && comanda.servicos.length > 0) {
                const servicosNomes = [];
                for (const s of comanda.servicos) {
                    const servico = await buscarServico(s.servicoId);
                    if (servico) servicosNomes.push(servico.nome);
                }
                servicosTexto = servicosNomes.join(', ');
            }
            
            const dataCriacao = comanda.dataCriacao?.toDate ? comanda.dataCriacao.toDate() : new Date();
            
            dados.push({
                'Data Criação': dataCriacao.toLocaleDateString('pt-BR'),
                'Cliente': cliente?.nome || comanda.clienteId || '-',
                'Barbeiro': barbeiro?.nome || comanda.barbeiroId || '-',
                'Serviços': servicosTexto,
                'Valor Total': `R$ ${valor.toFixed(2)}`,
                'Status': comanda.status === 'aberta' ? 'Em andamento' : 'Finalizada',
                'Forma Pagamento': comanda.formaPagamento || '-',
                'Observações': comanda.observacoes || '-'
            });
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhuma comanda encontrada no período.", "erro");
            return;
        }
        
        dados.push({
            'Data Criação': 'RESUMO',
            'Cliente': `Total Comandas: ${totalComandas}`,
            'Barbeiro': `Finalizadas: ${totalFinalizadas}`,
            'Serviços': `Em andamento: ${totalComandas - totalFinalizadas}`,
            'Valor Total': `R$ ${totalFaturamento.toFixed(2)}`,
            'Status': '',
            'Forma Pagamento': '',
            'Observações': ''
        });
        
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Comandas");
        const nomeArquivo = `Comandas_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        await registrarExportacao("Comandas", "Excel", dados, nomeArquivo);
        mostrarNotificacao(`Comandas exportadas com sucesso!`, "sucesso");
    } catch (e) { 
        console.error("Erro ao exportar comandas:", e); 
        mostrarNotificacao("Erro ao acessar o banco de dados.", "erro"); 
    }
};

// ==================== EXCEL - FINANCEIRO ====================
window.exportarExcelFinanceiro = async () => {
    const inicio = document.getElementById('excelFinanceiroDataInicio').value;
    const fim = document.getElementById('excelFinanceiroDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snap = await getDocs(q);
        const dados = [];
        let totalFaturamento = 0;
        let totalAgendamentos = 0;
        let totalConcluidos = 0;
        let totalCancelados = 0;
        let totalPendentes = 0;
        
        snap.forEach(doc => {
            const data = doc.data();
            const valor = data.valor || 0;
            
            if (data.status === 'concluido') {
                totalFaturamento += valor;
                totalConcluidos++;
            } else if (data.status === 'cancelado') {
                totalCancelados++;
            } else if (data.status === 'confirmado') {
                totalPendentes++;
            }
            totalAgendamentos++;
            
            dados.push({
                'Data': data.data || '',
                'Cliente': data.cliente || data.nome || '',
                'Serviço': data.servicoNome || data.servico || '',
                'Valor': `R$ ${valor.toFixed(2)}`,
                'Status': data.status || ''
            });
        });
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhum agendamento encontrado no período.", "erro");
            return;
        }
        
        dados.push({
            'Data': 'TOTAL',
            'Cliente': '',
            'Serviço': '',
            'Valor': `R$ ${totalFaturamento.toFixed(2)}`,
            'Status': ''
        });
        
        dados.push({
            'Data': 'RESUMO',
            'Cliente': 'Total de Agendamentos',
            'Serviço': `${totalAgendamentos}`,
            'Valor': '',
            'Status': ''
        });
        dados.push({
            'Data': 'RESUMO',
            'Cliente': 'Concluídos',
            'Serviço': `${totalConcluidos}`,
            'Valor': `R$ ${totalFaturamento.toFixed(2)}`,
            'Status': ''
        });
        dados.push({
            'Data': 'RESUMO',
            'Cliente': 'Cancelados',
            'Serviço': `${totalCancelados}`,
            'Valor': '',
            'Status': ''
        });
        dados.push({
            'Data': 'RESUMO',
            'Cliente': 'Pendentes',
            'Serviço': `${totalPendentes}`,
            'Valor': '',
            'Status': ''
        });

        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        const nomeArquivo = `Relatorio_Financeiro_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);

        await registrarExportacao("Financeiro", "Excel", dados, nomeArquivo);
        mostrarNotificacao("Relatório financeiro exportado!", "sucesso");
    } catch (e) { 
        console.error(e);
        mostrarNotificacao("Erro ao gerar financeiro.", "erro"); 
    }
};

// ==================== EXCEL - MARGENS ====================
window.exportarExcelMargens = async () => {
    const inicio = document.getElementById('excelMargemDataInicio').value;
    const fim = document.getElementById('excelMargemDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando relatório de margens...", "sucesso");
        
        const servicosSnap = await getDocs(collection(db, "servicos"));
        const produtosSnap = await getDocs(collection(db, "produtos"));
        
        const dadosServicos = [];
        const dadosProdutos = [];
        const dadosResumo = [];
        
        let totalMargemServicos = 0;
        let countServicos = 0;
        let totalMargemProdutos = 0;
        let countProdutos = 0;
        
        servicosSnap.forEach(doc => {
            const servico = doc.data();
            const preco = servico.preco || 0;
            const custo = servico.custo || 0;
            const lucro = preco - custo;
            const margem = calcularMargem(preco, custo);
            
            if (preco > 0) {
                totalMargemServicos += margem;
                countServicos++;
            }
            
            dadosServicos.push({
                'Serviço': servico.nome || 'Sem nome',
                'Preço (R$)': preco.toFixed(2),
                'Custo (R$)': custo.toFixed(2),
                'Lucro (R$)': lucro.toFixed(2),
                'Margem (%)': margem.toFixed(1) + '%',
                'Status': margem >= 50 ? 'Excelente' : margem >= 30 ? 'OK' : 'Atenção'
            });
        });
        
        produtosSnap.forEach(doc => {
            const produto = doc.data();
            const preco = produto.preco || 0;
            const custo = produto.custo || 0;
            const lucro = preco - custo;
            const margem = calcularMargem(preco, custo);
            
            if (preco > 0) {
                totalMargemProdutos += margem;
                countProdutos++;
            }
            
            dadosProdutos.push({
                'Produto': produto.nome || 'Sem nome',
                'Preço (R$)': preco.toFixed(2),
                'Custo (R$)': custo.toFixed(2),
                'Lucro (R$)': lucro.toFixed(2),
                'Margem (%)': margem.toFixed(1) + '%',
                'Status': margem >= 50 ? 'Excelente' : margem >= 30 ? 'OK' : 'Atenção'
            });
        });
        
        const margemMediaServicos = countServicos > 0 ? (totalMargemServicos / countServicos).toFixed(1) : 0;
        const margemMediaProdutos = countProdutos > 0 ? (totalMargemProdutos / countProdutos).toFixed(1) : 0;
        const margemMediaGeral = (countServicos + countProdutos) > 0 ? 
            ((totalMargemServicos + totalMargemProdutos) / (countServicos + countProdutos)).toFixed(1) : 0;
        
        dadosResumo.push(
            { 'Indicador': 'Período', 'Valor': `${inicio} a ${fim}` },
            { 'Indicador': 'Margem Média Geral', 'Valor': `${margemMediaGeral}%` },
            { 'Indicador': 'Margem Média Serviços', 'Valor': `${margemMediaServicos}%` },
            { 'Indicador': 'Margem Média Produtos', 'Valor': `${margemMediaProdutos}%` },
            { 'Indicador': 'Total de Serviços', 'Valor': servicosSnap.size },
            { 'Indicador': 'Total de Produtos', 'Valor': produtosSnap.size },
            { 'Indicador': 'Data da Exportação', 'Valor': new Date().toLocaleString() }
        );
        
        const wb = XLSX.utils.book_new();
        const wsServicos = XLSX.utils.json_to_sheet(dadosServicos);
        const wsProdutos = XLSX.utils.json_to_sheet(dadosProdutos);
        const wsResumo = XLSX.utils.json_to_sheet(dadosResumo);
        
        XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
        XLSX.utils.book_append_sheet(wb, wsServicos, "Margens_Servicos");
        XLSX.utils.book_append_sheet(wb, wsProdutos, "Margens_Produtos");
        
        const nomeArquivo = `Relatorio_Margens_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        const dadosParaSalvar = {
            servicos: dadosServicos,
            produtos: dadosProdutos,
            resumo: dadosResumo,
            margemMediaGeral: margemMediaGeral,
            margemMediaServicos: margemMediaServicos,
            margemMediaProdutos: margemMediaProdutos
        };
        
        await registrarExportacao("Margens de Lucro", "Excel", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("Relatório de margens exportado com sucesso!", "sucesso");
        
    } catch (e) {
        console.error("Erro ao exportar margens:", e);
        mostrarNotificacao("Erro ao exportar margens.", "erro");
    }
};

// ==================== EXCEL - COMISSÕES ====================
window.exportarExcelComissoes = async () => {
    try {
        const inicio = document.getElementById('excelComissaoDataInicio')?.value;
        const fim = document.getElementById('excelComissaoDataFim')?.value;
        
        if (!inicio || !fim) {
            mostrarNotificacao("Selecione o período!", "erro");
            return;
        }
        
        mostrarNotificacao("Gerando relatório de comissões...", "sucesso");
        
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(
            agendamentosRef, 
            where("status", "==", "concluido"),
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snapshot = await getDocs(q);
        
        const profissionaisMap = new Map();
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionaisSnap.forEach(doc => {
            profissionaisMap.set(doc.id, doc.data());
        });
        
        const dados = [];
        let totalComissoes = 0;
        let totalAtendimentos = 0;
        const comissoesPorBarbeiro = {};
        
        for (const docSnap of snapshot.docs) {
            const atendimento = docSnap.data();
            const profissional = profissionaisMap.get(atendimento.profissionalId) || 
                                profissionaisMap.get(atendimento.profissional);
            const profissionalNome = profissional?.nome || atendimento.profissional || '-';
            const valor = atendimento.valor || 0;
            const percentual = atendimento.comissaoPercentual || 30;
            const comissao = calcularComissao(valor, percentual);
            
            totalComissoes += comissao;
            totalAtendimentos++;
            
            if (!comissoesPorBarbeiro[profissionalNome]) {
                comissoesPorBarbeiro[profissionalNome] = { comissao: 0, atendimentos: 0 };
            }
            comissoesPorBarbeiro[profissionalNome].comissao += comissao;
            comissoesPorBarbeiro[profissionalNome].atendimentos++;
            
            dados.push({
                'Data': formatarData(atendimento.data),
                'Cliente': atendimento.cliente || atendimento.nome || '-',
                'Serviço': atendimento.servicoNome || atendimento.servico || '-',
                'Barbeiro': profissionalNome,
                'Valor do Serviço': formatarMoeda(valor),
                'Comissão (%)': `${percentual}%`,
                'Valor da Comissão': formatarMoeda(comissao)
            });
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhum atendimento concluído no período.", "erro");
            return;
        }
        
        const resumo = [];
        resumo.push({ 'Indicador': 'Período Início', 'Valor': inicio });
        resumo.push({ 'Indicador': 'Período Fim', 'Valor': fim });
        resumo.push({ 'Indicador': 'Data da Exportação', 'Valor': new Date().toLocaleString() });
        resumo.push({ 'Indicador': 'Total de Atendimentos', 'Valor': totalAtendimentos });
        resumo.push({ 'Indicador': 'Total de Comissões', 'Valor': formatarMoeda(totalComissoes) });
        resumo.push({ 'Indicador': 'Média por Atendimento', 'Valor': formatarMoeda(totalAtendimentos > 0 ? totalComissoes / totalAtendimentos : 0) });
        
        const ranking = Object.entries(comissoesPorBarbeiro)
            .map(([nome, dados]) => ({ nome, ...dados }))
            .sort((a, b) => b.comissao - a.comissao);
        
        const dadosRanking = ranking.map((item, index) => ({
            'Posição': index + 1,
            'Barbeiro': item.nome,
            'Atendimentos': item.atendimentos,
            'Total Comissão': formatarMoeda(item.comissao),
            'Média por Atendimento': formatarMoeda(item.comissao / item.atendimentos)
        }));
        
        const wb = XLSX.utils.book_new();
        const wsResumo = XLSX.utils.json_to_sheet(resumo);
        const wsRanking = XLSX.utils.json_to_sheet(dadosRanking);
        const wsDetalhes = XLSX.utils.json_to_sheet(dados);
        
        XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
        XLSX.utils.book_append_sheet(wb, wsRanking, "Ranking_Barbeiros");
        XLSX.utils.book_append_sheet(wb, wsDetalhes, "Comissoes_Detalhadas");
        
        const nomeArquivo = `Relatorio_Comissoes_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        const dadosParaSalvar = { resumo: resumo, ranking: dadosRanking, detalhes: dados };
        await registrarExportacao("Comissões", "Excel", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("Relatório de comissões exportado com sucesso!", "sucesso");
        
    } catch (e) {
        console.error("Erro ao exportar comissões:", e);
        mostrarNotificacao("Erro ao exportar comissões.", "erro");
    }
};

// ==================== PDF - AGENDAMENTOS ====================
window.exportarPDFAgendamentos = async () => {
    const inicio = document.getElementById('pdfAgendamentoDataInicio').value;
    const fim = document.getElementById('pdfAgendamentoDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        const q = query(
            collection(db, "agendamentos"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snap = await getDocs(q);
        const dados = [];
        let totalValor = 0;
        
        snap.forEach(doc => {
            const data = doc.data();
            const valor = data.valor || 0;
            totalValor += valor;
            dados.push([
                data.data || '',
                data.cliente || data.nome || '',
                data.servicoNome || data.servico || '',
                data.horario || '',
                `R$ ${valor.toFixed(2)}`,
                data.status || ''
            ]);
        });

        if (dados.length === 0) {
            mostrarNotificacao("Nenhum agendamento encontrado no período.", "erro");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório de Agendamentos - Alpha BarberShop", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        
        doc.autoTable({ 
            head: [['Data', 'Cliente', 'Serviço', 'Horário', 'Valor', 'Status']], 
            body: dados,
            startY: 40,
            headStyles: { fillColor: [33, 153, 239] },
            alternateRowStyles: { fillColor: [30, 41, 59] },
            styles: { textColor: [255, 255, 255], fontSize: 8 },
            margin: { left: 10, right: 10 }
        });
        
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setTextColor(33, 153, 239);
        doc.text(`Total do período: R$ ${totalValor.toFixed(2)}`, 14, finalY);
        
        const nomeArquivo = `Relatorio_Agendamentos_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);

        const dadosParaSalvar = {
            dados: dados,
            totalValor: totalValor,
            inicio: inicio,
            fim: fim
        };

        await registrarExportacao("Agendamentos", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF gerado com sucesso!", "sucesso");
    } catch (e) { 
        console.error(e);
        mostrarNotificacao("Erro ao gerar PDF.", "erro"); 
    }
};

// ==================== PDF - CLIENTES ====================
window.exportarPDFClientes = async () => {
    const inicio = document.getElementById('pdfClienteDataInicio').value;
    const fim = document.getElementById('pdfClienteDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const snap = await getDocs(collection(db, "clientes"));
        const dados = [];
        
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            
            let dataCadastro = null;
            if (data.createdAt) {
                if (data.createdAt.toDate) {
                    dataCadastro = data.createdAt.toDate();
                } else if (data.createdAt.seconds) {
                    dataCadastro = new Date(data.createdAt.seconds * 1000);
                } else if (typeof data.createdAt === 'string') {
                    dataCadastro = new Date(data.createdAt);
                }
            } else if (data.dataCadastro) {
                dataCadastro = new Date(data.dataCadastro);
            }
            
            if (dataCadastro) {
                if (dataCadastro < dataInicio || dataCadastro > dataFim) {
                    continue;
                }
            }
            
            const dataCadastroFormatada = dataCadastro ? 
                `${dataCadastro.getDate().toString().padStart(2, '0')}/${(dataCadastro.getMonth() + 1).toString().padStart(2, '0')}/${dataCadastro.getFullYear()}` : '-';
            
            dados.push([
                data.nome || data.cliente || '',
                data.telefone || data.whatsapp || '',
                data.email || '',
                dataCadastroFormatada
            ]);
        }

        if (dados.length === 0) {
            mostrarNotificacao("Nenhum cliente encontrado no período.", "erro");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.setTextColor(33, 153, 239);
        doc.text("Lista de Clientes - Alpha BarberShop", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        doc.text(`Total de clientes: ${dados.length}`, 14, 40);

        doc.autoTable({ 
            head: [['Nome do Cliente', 'Contato', 'E-mail', 'Data de Cadastro']], 
            body: dados,
            startY: 48,
            headStyles: { fillColor: [33, 153, 239] },
            alternateRowStyles: { fillColor: [30, 41, 59] },
            styles: { textColor: [255, 255, 255], fontSize: 9 }
        });
        
        const nomeArquivo = `Clientes_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);

        const dadosParaSalvar = {
            dados: dados,
            totalClientes: dados.length,
            inicio: inicio,
            fim: fim
        };

        await registrarExportacao("Clientes", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF de clientes gerado!", "sucesso");
    } catch (e) { 
        console.error(e);
        mostrarNotificacao("Erro ao gerar PDF.", "erro"); 
    }
};

// ==================== PDF - COMANDAS ====================
window.exportarPDFComandas = async () => {
    const inicio = document.getElementById('pdfComandaDataInicio')?.value;
    const fim = document.getElementById('pdfComandaDataFim')?.value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando PDF de comandas...", "sucesso");
        
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const q = query(
            collection(db, "comandas"), 
            where("dataCriacao", ">=", Timestamp.fromDate(dataInicio)), 
            where("dataCriacao", "<=", Timestamp.fromDate(dataFim))
        );
        
        const snap = await getDocs(q);
        const dados = [];
        let totalFaturamento = 0;
        let totalComandas = 0;
        let totalFinalizadas = 0;
        
        for (const docSnap of snap.docs) {
            const comanda = docSnap.data();
            const cliente = await buscarCliente(comanda.clienteId);
            const barbeiro = await buscarBarbeiro(comanda.barbeiroId);
            
            const valor = comanda.total || 0;
            totalFaturamento += valor;
            totalComandas++;
            if (comanda.status === 'finalizada') totalFinalizadas++;
            
            let servicosTexto = '';
            if (comanda.servicos && comanda.servicos.length > 0) {
                const servicosNomes = [];
                for (const s of comanda.servicos) {
                    const servico = await buscarServico(s.servicoId);
                    if (servico) servicosNomes.push(servico.nome);
                }
                servicosTexto = servicosNomes.join(', ');
            }
            
            const dataCriacao = comanda.dataCriacao?.toDate ? comanda.dataCriacao.toDate() : new Date();
            
            dados.push([
                dataCriacao.toLocaleDateString('pt-BR'),
                cliente?.nome || comanda.clienteId || '-',
                barbeiro?.nome || comanda.barbeiroId || '-',
                servicosTexto.length > 40 ? servicosTexto.substring(0, 40) + '...' : servicosTexto,
                `R$ ${valor.toFixed(2)}`,
                comanda.status === 'aberta' ? 'Em andamento' : 'Finalizada'
            ]);
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhuma comanda encontrada no período.", "erro");
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório de Comandas - Alpha BarberShop", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        
        doc.setFontSize(12);
        doc.setTextColor(33, 153, 239);
        doc.text("📊 RESUMO GERAL", 14, 45);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Total de Comandas: ${totalComandas}`, 14, 53);
        doc.text(`Finalizadas: ${totalFinalizadas}`, 14, 60);
        doc.text(`Em andamento: ${totalComandas - totalFinalizadas}`, 14, 67);
        doc.text(`💰 Faturamento Total: R$ ${totalFaturamento.toFixed(2)}`, 14, 74);
        doc.text(`🎫 Ticket Médio: R$ ${totalComandas > 0 ? (totalFaturamento / totalComandas).toFixed(2) : '0'}`, 14, 81);
        
        doc.autoTable({ 
            head: [['Data', 'Cliente', 'Barbeiro', 'Serviços', 'Valor', 'Status']], 
            body: dados,
            startY: 90,
            headStyles: { fillColor: [33, 153, 239] },
            alternateRowStyles: { fillColor: [30, 41, 59] },
            styles: { textColor: [255, 255, 255], fontSize: 8 },
            margin: { left: 10, right: 10 }
        });
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Alpha BarberShop - Relatório de Comandas - Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }
        
        const nomeArquivo = `Comandas_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);
        
        const dadosParaSalvar = {
            dados: dados,
            totalFaturamento: totalFaturamento,
            totalComandas: totalComandas,
            totalFinalizadas: totalFinalizadas,
            inicio: inicio,
            fim: fim
        };
        
        await registrarExportacao("Comandas", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF de comandas gerado com sucesso!", "sucesso");
        
    } catch (e) { 
        console.error("Erro ao gerar PDF de comandas:", e); 
        mostrarNotificacao("Erro ao gerar PDF.", "erro"); 
    }
};

// ==================== PDF - FINANCEIRO ====================
window.exportarPDFFinanceiro = async () => {
    const inicio = document.getElementById('pdfFinanceiroDataInicio').value;
    const fim = document.getElementById('pdfFinanceiroDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando relatório financeiro...", "sucesso");
        
        const q = query(
            collection(db, "agendamentos"), 
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snap = await getDocs(q);
        
        let totalFaturamento = 0;
        let totalAgendamentos = 0;
        let totalConcluidos = 0;
        let totalCancelados = 0;
        let totalPendentes = 0;
        
        const faturamentoPorMes = {};
        const servicosPorNome = {};
        
        const dadosDetalhados = [];
        
        snap.forEach(doc => {
            const data = doc.data();
            const valor = data.valor || 0;
            const status = data.status || '';
            const dataAgendamento = data.data;
            const servicoNome = data.servicoNome || data.servico || 'Outros';
            
            totalAgendamentos++;
            
            if (status === 'concluido') {
                totalFaturamento += valor;
                totalConcluidos++;
                
                if (dataAgendamento) {
                    const mes = dataAgendamento.substring(0, 7);
                    faturamentoPorMes[mes] = (faturamentoPorMes[mes] || 0) + valor;
                }
            } else if (status === 'cancelado') {
                totalCancelados++;
            } else if (status === 'confirmado') {
                totalPendentes++;
            }
            
            servicosPorNome[servicoNome] = (servicosPorNome[servicoNome] || 0) + 1;
            
            dadosDetalhados.push([
                data.data || '',
                data.cliente || data.nome || '',
                servicoNome,
                `R$ ${valor.toFixed(2)}`,
                status === 'concluido' ? '✓ Concluído' : status === 'cancelado' ? '✗ Cancelado' : '⏳ Pendente'
            ]);
        });
        
        if (dadosDetalhados.length === 0) {
            mostrarNotificacao("Nenhum agendamento encontrado no período.", "erro");
            return;
        }
        
        const ticketMedio = totalConcluidos > 0 ? totalFaturamento / totalConcluidos : 0;
        const mesesOrdenados = Object.keys(faturamentoPorMes).sort();
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório Financeiro - Alpha BarberShop", 14, 20);
        doc.setTextColor(255, 255, 255);
        
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text("📊 RESUMO GERAL", 14, 45);
        
        doc.setFontSize(10);
        doc.text(`Total de Agendamentos: ${totalAgendamentos}`, 14, 53);
        doc.text(`✓ Concluídos: ${totalConcluidos}`, 14, 60);
        doc.text(`⏳ Pendentes: ${totalPendentes}`, 14, 67);
        doc.text(`✗ Cancelados: ${totalCancelados}`, 14, 74);
        doc.text(`💰 Faturamento Total: R$ ${totalFaturamento.toFixed(2)}`, 14, 81);
        doc.text(`🎫 Ticket Médio: R$ ${ticketMedio.toFixed(2)}`, 14, 88);
        
        let currentY = 98;
        
        if (mesesOrdenados.length > 0) {
            doc.setFontSize(11);
            doc.setTextColor(33, 153, 239);
            doc.text("📈 FATURAMENTO POR MÊS", 14, currentY);
            currentY += 8;
            
            const dadosMensais = mesesOrdenados.map(mes => {
                const [ano, mesNum] = mes.split('-');
                const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                const mesNome = `${mesesNomes[parseInt(mesNum) - 1]}/${ano}`;
                return [mesNome, `R$ ${faturamentoPorMes[mes].toFixed(2)}`];
            });
            
            doc.autoTable({
                head: [['Mês', 'Faturamento']],
                body: dadosMensais,
                startY: currentY,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 9 }
            });
            
            currentY = doc.lastAutoTable.finalY + 10;
        }
        
        const servicosOrdenados = Object.entries(servicosPorNome)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (servicosOrdenados.length > 0) {
            doc.setFontSize(11);
            doc.setTextColor(33, 153, 239);
            doc.text("🏆 SERVIÇOS MAIS REALIZADOS", 14, currentY);
            currentY += 8;
            
            const dadosServicos = servicosOrdenados.map(([nome, qtd]) => [nome, qtd]);
            
            doc.autoTable({
                head: [['Serviço', 'Quantidade']],
                body: dadosServicos,
                startY: currentY,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 9 }
            });
            
            currentY = doc.lastAutoTable.finalY + 10;
        }
        
        if (dadosDetalhados.length > 0 && currentY + 50 < doc.internal.pageSize.height) {
            doc.setFontSize(11);
            doc.setTextColor(33, 153, 239);
            doc.text("📋 DETALHAMENTO DOS AGENDAMENTOS", 14, currentY);
            currentY += 8;
            
            doc.autoTable({
                head: [['Data', 'Cliente', 'Serviço', 'Valor', 'Status']],
                body: dadosDetalhados.slice(0, 30),
                startY: currentY,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 8 },
                margin: { left: 10, right: 10 }
            });
        }
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Alpha BarberShop - Relatório Financeiro - Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }
        
        const nomeArquivo = `Relatorio_Financeiro_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);
        
        const dadosParaSalvar = {
            totalFaturamento: totalFaturamento,
            totalAgendamentos: totalAgendamentos,
            totalConcluidos: totalConcluidos,
            totalCancelados: totalCancelados,
            totalPendentes: totalPendentes,
            ticketMedio: ticketMedio,
            faturamentoPorMes: faturamentoPorMes,
            servicosPorNome: servicosPorNome
        };
        
        await registrarExportacao("Financeiro", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("Relatório financeiro PDF gerado com sucesso!", "sucesso");
        
    } catch (e) {
        console.error("Erro ao gerar PDF financeiro:", e);
        mostrarNotificacao("Erro ao gerar relatório financeiro.", "erro");
    }
};

// ==================== PDF - MARGENS ====================
window.exportarPDFMargens = async () => {
    const inicio = document.getElementById('pdfMargemDataInicio').value;
    const fim = document.getElementById('pdfMargemDataFim').value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando PDF de margens...", "sucesso");
        
        const servicosSnap = await getDocs(collection(db, "servicos"));
        const produtosSnap = await getDocs(collection(db, "produtos"));
        
        const servicosComMargem = [];
        const produtosComMargem = [];
        
        let totalMargemServicos = 0;
        let countServicos = 0;
        let totalMargemProdutos = 0;
        let countProdutos = 0;
        
        servicosSnap.forEach(doc => {
            const servico = doc.data();
            const preco = servico.preco || 0;
            const custo = servico.custo || 0;
            const lucro = preco - custo;
            const margem = calcularMargem(preco, custo);
            
            if (preco > 0) {
                totalMargemServicos += margem;
                countServicos++;
            }
            
            servicosComMargem.push([
                servico.nome || 'Sem nome',
                formatarMoeda(preco),
                formatarMoeda(custo),
                formatarMoeda(lucro),
                `${margem.toFixed(1)}%`,
                margem >= 50 ? 'Excelente' : margem >= 30 ? 'OK' : 'Atenção'
            ]);
        });
        
        produtosSnap.forEach(doc => {
            const produto = doc.data();
            const preco = produto.preco || 0;
            const custo = produto.custo || 0;
            const lucro = preco - custo;
            const margem = calcularMargem(preco, custo);
            
            if (preco > 0) {
                totalMargemProdutos += margem;
                countProdutos++;
            }
            
            produtosComMargem.push([
                produto.nome || 'Sem nome',
                formatarMoeda(preco),
                formatarMoeda(custo),
                formatarMoeda(lucro),
                `${margem.toFixed(1)}%`,
                margem >= 50 ? 'Excelente' : margem >= 30 ? 'OK' : 'Atenção'
            ]);
        });
        
        const margemMediaServicos = countServicos > 0 ? (totalMargemServicos / countServicos).toFixed(1) : 0;
        const margemMediaProdutos = countProdutos > 0 ? (totalMargemProdutos / countProdutos).toFixed(1) : 0;
        const margemMediaGeral = (countServicos + countProdutos) > 0 ? 
            ((totalMargemServicos + totalMargemProdutos) / (countServicos + countProdutos)).toFixed(1) : 0;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório de Margens de Lucro", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        
        doc.setFontSize(12);
        doc.setTextColor(33, 153, 239);
        doc.text("📊 RESUMO GERAL", 14, 45);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Margem Média Geral: ${margemMediaGeral}%`, 14, 55);
        doc.text(`Margem Média Serviços: ${margemMediaServicos}%`, 14, 63);
        doc.text(`Margem Média Produtos: ${margemMediaProdutos}%`, 14, 71);
        doc.text(`Total de Serviços: ${servicosSnap.size}`, 14, 79);
        doc.text(`Total de Produtos: ${produtosSnap.size}`, 14, 87);
        
        let currentY = 100;
        
        if (servicosComMargem.length > 0) {
            doc.addPage();
            doc.setFontSize(14);
            doc.setTextColor(33, 153, 239);
            doc.text("✂️ MARGENS DOS SERVIÇOS", 14, 20);
            
            doc.autoTable({
                head: [['Serviço', 'Preço', 'Custo', 'Lucro', 'Margem', 'Status']],
                body: servicosComMargem,
                startY: 30,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 8 },
                margin: { left: 10, right: 10 }
            });
        }
        
        if (produtosComMargem.length > 0) {
            doc.addPage();
            doc.setFontSize(14);
            doc.setTextColor(33, 153, 239);
            doc.text("📦 MARGENS DOS PRODUTOS", 14, 20);
            
            doc.autoTable({
                head: [['Produto', 'Preço', 'Custo', 'Lucro', 'Margem', 'Status']],
                body: produtosComMargem,
                startY: 30,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 8 },
                margin: { left: 10, right: 10 }
            });
        }
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Alpha BarberShop - Relatório de Margens - Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }
        
        const nomeArquivo = `Relatorio_Margens_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);
        
        const dadosParaSalvar = {
            servicos: servicosComMargem,
            produtos: produtosComMargem,
            margemMediaGeral: margemMediaGeral,
            margemMediaServicos: margemMediaServicos,
            margemMediaProdutos: margemMediaProdutos
        };
        
        await registrarExportacao("Margens de Lucro", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF de margens gerado com sucesso!", "sucesso");
        
    } catch (e) {
        console.error("Erro ao gerar PDF de margens:", e);
        mostrarNotificacao("Erro ao gerar PDF de margens.", "erro");
    }
};

// ==================== PDF - COMISSÕES ====================
window.exportarPDFComissoes = async () => {
    try {
        const inicio = document.getElementById('pdfComissaoDataInicio')?.value;
        const fim = document.getElementById('pdfComissaoDataFim')?.value;
        
        if (!inicio || !fim) {
            mostrarNotificacao("Selecione o período!", "erro");
            return;
        }
        
        mostrarNotificacao("Gerando PDF de comissões...", "sucesso");
        
        const agendamentosRef = collection(db, "agendamentos");
        const q = query(
            agendamentosRef, 
            where("status", "==", "concluido"),
            where("data", ">=", inicio), 
            where("data", "<=", fim)
        );
        const snapshot = await getDocs(q);
        
        const profissionaisMap = new Map();
        const profissionaisSnap = await getDocs(collection(db, "profissionais"));
        profissionaisSnap.forEach(doc => {
            profissionaisMap.set(doc.id, doc.data());
        });
        
        const comissoesDetalhadas = [];
        const comissoesPorBarbeiro = {};
        let totalComissoes = 0;
        let totalAtendimentos = 0;
        
        for (const docSnap of snapshot.docs) {
            const atendimento = docSnap.data();
            const profissional = profissionaisMap.get(atendimento.profissionalId) || 
                                profissionaisMap.get(atendimento.profissional);
            const profissionalNome = profissional?.nome || atendimento.profissional || '-';
            const valor = atendimento.valor || 0;
            const percentual = atendimento.comissaoPercentual || 30;
            const comissao = calcularComissao(valor, percentual);
            
            totalComissoes += comissao;
            totalAtendimentos++;
            
            if (!comissoesPorBarbeiro[profissionalNome]) {
                comissoesPorBarbeiro[profissionalNome] = { comissao: 0, atendimentos: 0 };
            }
            comissoesPorBarbeiro[profissionalNome].comissao += comissao;
            comissoesPorBarbeiro[profissionalNome].atendimentos++;
            
            comissoesDetalhadas.push([
                formatarData(atendimento.data),
                atendimento.cliente || atendimento.nome || '-',
                atendimento.servicoNome || atendimento.servico || '-',
                profissionalNome,
                formatarMoeda(valor),
                `${percentual}%`,
                formatarMoeda(comissao)
            ]);
        }
        
        if (comissoesDetalhadas.length === 0) {
            mostrarNotificacao("Nenhum atendimento concluído no período.", "erro");
            return;
        }
        
        const ranking = Object.entries(comissoesPorBarbeiro)
            .map(([nome, dados]) => ({ nome, ...dados }))
            .sort((a, b) => b.comissao - a.comissao);
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório de Comissões", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 30);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 38);
        
        doc.setFontSize(12);
        doc.setTextColor(33, 153, 239);
        doc.text("📊 RESUMO GERAL", 14, 52);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Total de Atendimentos: ${totalAtendimentos}`, 14, 62);
        doc.text(`Total de Comissões: ${formatarMoeda(totalComissoes)}`, 14, 70);
        doc.text(`Média por Atendimento: ${formatarMoeda(totalAtendimentos > 0 ? totalComissoes / totalAtendimentos : 0)}`, 14, 78);
        
        if (ranking.length > 0) {
            doc.addPage();
            doc.setFontSize(14);
            doc.setTextColor(33, 153, 239);
            doc.text("🏆 RANKING DE BARBEIROS", 14, 20);
            
            const rankingData = ranking.map((item, index) => [
                index + 1,
                item.nome,
                item.atendimentos,
                formatarMoeda(item.comissao),
                formatarMoeda(item.comissao / item.atendimentos)
            ]);
            
            doc.autoTable({
                head: [['Posição', 'Barbeiro', 'Atendimentos', 'Total Comissão', 'Média']],
                body: rankingData,
                startY: 30,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 9 },
                margin: { left: 10, right: 10 }
            });
        }
        
        if (comissoesDetalhadas.length > 0) {
            doc.addPage();
            doc.setFontSize(14);
            doc.setTextColor(33, 153, 239);
            doc.text("📋 COMISSÕES POR ATENDIMENTO", 14, 20);
            
            doc.autoTable({
                head: [['Data', 'Cliente', 'Serviço', 'Barbeiro', 'Valor', 'Comissão %', 'Comissão R$']],
                body: comissoesDetalhadas.slice(0, 25),
                startY: 30,
                headStyles: { fillColor: [33, 153, 239] },
                alternateRowStyles: { fillColor: [30, 41, 59] },
                styles: { textColor: [255, 255, 255], fontSize: 8 },
                margin: { left: 8, right: 8, top: 5 }
            });
            
            if (comissoesDetalhadas.length > 25) {
                const finalY = doc.lastAutoTable.finalY + 5;
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`* Exibindo os 25 primeiros registros de um total de ${comissoesDetalhadas.length}`, 14, finalY);
            }
        }
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Alpha BarberShop - Relatório de Comissões - Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }
        
        const nomeArquivo = `Relatorio_Comissoes_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);
        
        const dadosParaSalvar = { ranking: ranking, detalhes: comissoesDetalhadas, totalComissoes: totalComissoes, totalAtendimentos: totalAtendimentos };
        await registrarExportacao("Comissões", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF de comissões gerado com sucesso!", "sucesso");
        
    } catch (e) {
        console.error("Erro ao gerar PDF de comissões:", e);
        mostrarNotificacao("Erro ao gerar PDF de comissões.", "erro");
    }
};

// ==================== HISTÓRICO E UTILITÁRIOS ====================
window.baixarNovamente = async (exportacaoId) => {
    try {
        const exportacaoDoc = await getDoc(doc(db, "historico_exportacoes", exportacaoId));
        
        if (!exportacaoDoc.exists()) {
            mostrarNotificacao("Exportação não encontrada.", "erro");
            return;
        }
        
        const exportacao = exportacaoDoc.data();
        
        if (!exportacao.dadosExportados) {
            mostrarNotificacao("Esta exportação foi gerada antes da funcionalidade de re-download. Gere uma nova exportação.", "erro");
            return;
        }
        
        if (exportacao.formato === "Excel") {
            let dadosParaExportar = exportacao.dadosExportados;
            
            if (exportacao.tipo === "Comissões") {
                const wb = XLSX.utils.book_new();
                const wsResumo = XLSX.utils.json_to_sheet(dadosParaExportar.resumo || []);
                const wsRanking = XLSX.utils.json_to_sheet(dadosParaExportar.ranking || []);
                const wsDetalhes = XLSX.utils.json_to_sheet(dadosParaExportar.detalhes || []);
                XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
                XLSX.utils.book_append_sheet(wb, wsRanking, "Ranking_Barbeiros");
                XLSX.utils.book_append_sheet(wb, wsDetalhes, "Comissoes_Detalhadas");
                XLSX.writeFile(wb, exportacao.nomeArquivo || `Comissoes_${Date.now()}.xlsx`);
            } else if (exportacao.tipo === "Margens de Lucro") {
                const wb = XLSX.utils.book_new();
                const wsResumo = XLSX.utils.json_to_sheet(dadosParaExportar.resumo || []);
                const wsServicos = XLSX.utils.json_to_sheet(dadosParaExportar.servicos || []);
                const wsProdutos = XLSX.utils.json_to_sheet(dadosParaExportar.produtos || []);
                XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");
                XLSX.utils.book_append_sheet(wb, wsServicos, "Margens_Servicos");
                XLSX.utils.book_append_sheet(wb, wsProdutos, "Margens_Produtos");
                XLSX.writeFile(wb, exportacao.nomeArquivo || `Margens_${Date.now()}.xlsx`);
            } else {
                const ws = XLSX.utils.json_to_sheet(dadosParaExportar);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, exportacao.tipo);
                XLSX.writeFile(wb, exportacao.nomeArquivo || `${exportacao.tipo}_${Date.now()}.xlsx`);
            }
            mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
        } else if (exportacao.formato === "PDF") {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const dadosExportados = exportacao.dadosExportados;
            
            if (exportacao.tipo === "Clientes") {
                const dados = dadosExportados.dados || dadosExportados;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Lista de Clientes - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.text(`Total de clientes: ${dados.length}`, 14, 40);
                doc.autoTable({ 
                    head: [['Nome do Cliente', 'Contato', 'E-mail', 'Data de Cadastro']], 
                    body: dados,
                    startY: 48,
                    headStyles: { fillColor: [33, 153, 239] },
                    alternateRowStyles: { fillColor: [30, 41, 59] },
                    styles: { textColor: [255, 255, 255], fontSize: 9 }
                });
                doc.save(exportacao.nomeArquivo || `Clientes_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            } else if (exportacao.tipo === "Agendamentos") {
                const dados = dadosExportados.dados || dadosExportados;
                const totalValor = dadosExportados.totalValor || 0;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Relatório de Agendamentos - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.autoTable({ 
                    head: [['Data', 'Cliente', 'Serviço', 'Horário', 'Valor', 'Status']], 
                    body: dados,
                    startY: 40,
                    headStyles: { fillColor: [33, 153, 239] },
                    alternateRowStyles: { fillColor: [30, 41, 59] },
                    styles: { textColor: [255, 255, 255], fontSize: 8 }
                });
                const finalY = doc.lastAutoTable.finalY + 10;
                doc.setFontSize(12);
                doc.setTextColor(33, 153, 239);
                doc.text(`Total do período: R$ ${totalValor.toFixed(2)}`, 14, finalY);
                doc.save(exportacao.nomeArquivo || `Agendamentos_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            } else if (exportacao.tipo === "Financeiro") {
                const dados = dadosExportados;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Relatório Financeiro - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.text(`Faturamento Total: R$ ${(dados.totalFaturamento || 0).toFixed(2)}`, 14, 42);
                doc.text(`Ticket Médio: R$ ${(dados.ticketMedio || 0).toFixed(2)}`, 14, 49);
                doc.text(`Total de Agendamentos: ${dados.totalAgendamentos || 0}`, 14, 56);
                doc.text(`Concluídos: ${dados.totalConcluidos || 0}`, 14, 63);
                doc.text(`Cancelados: ${dados.totalCancelados || 0}`, 14, 70);
                doc.text(`Pendentes: ${dados.totalPendentes || 0}`, 14, 77);
                doc.save(exportacao.nomeArquivo || `Financeiro_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            } else if (exportacao.tipo === "Margens de Lucro") {
                const dados = dadosExportados;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Relatório de Margens - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.text(`Margem Média Serviços: ${dados.margemMediaServicos || 0}%`, 14, 42);
                doc.text(`Margem Média Produtos: ${dados.margemMediaProdutos || 0}%`, 14, 49);
                doc.text(`Margem Média Geral: ${dados.margemMediaGeral || 0}%`, 14, 56);
                doc.save(exportacao.nomeArquivo || `Margens_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            } else if (exportacao.tipo === "Comissões") {
                const dados = dadosExportados;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Relatório de Comissões - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.text(`Total de Comissões: ${dados.totalComissoes || 'R$ 0'}`, 14, 42);
                doc.text(`Total de Atendimentos: ${dados.totalAtendimentos || 0}`, 14, 49);
                if (dados.ranking && dados.ranking.length > 0) {
                    const melhores = dados.ranking.slice(0, 3);
                    melhores.forEach((item, i) => {
                        doc.text(`${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${item.nome}: ${item.totalComissao}`, 14, 57 + (i * 7));
                    });
                }
                doc.save(exportacao.nomeArquivo || `Comissoes_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            } else if (exportacao.tipo === "Comandas") {
                const dados = dadosExportados;
                const inicio = dadosExportados.inicio || '-';
                const fim = dadosExportados.fim || '-';
                doc.setFontSize(16);
                doc.setTextColor(33, 153, 239);
                doc.text("Relatório de Comandas - Alpha BarberShop", 14, 20);
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
                doc.text(`Data de re-emissão: ${new Date().toLocaleString()}`, 14, 34);
                doc.text(`Total de Comandas: ${dados.totalComandas || 0}`, 14, 42);
                doc.text(`Finalizadas: ${dados.totalFinalizadas || 0}`, 14, 49);
                doc.text(`Em andamento: ${(dados.totalComandas || 0) - (dados.totalFinalizadas || 0)}`, 14, 56);
                doc.text(`Faturamento Total: R$ ${(dados.totalFaturamento || 0).toFixed(2)}`, 14, 63);
                if (dados.dados && dados.dados.length > 0) {
                    doc.addPage();
                    doc.setFontSize(14);
                    doc.setTextColor(33, 153, 239);
                    doc.text("📋 DETALHAMENTO DAS COMANDAS", 14, 20);
                    doc.autoTable({
                        head: [['Data', 'Cliente', 'Barbeiro', 'Serviços', 'Valor', 'Status']],
                        body: dados.dados.slice(0, 25),
                        startY: 30,
                        headStyles: { fillColor: [33, 153, 239] },
                        alternateRowStyles: { fillColor: [30, 41, 59] },
                        styles: { textColor: [255, 255, 255], fontSize: 8 }
                    });
                }
                doc.save(exportacao.nomeArquivo || `Comandas_${Date.now()}.pdf`);
                mostrarNotificacao(`Arquivo baixado novamente!`, "sucesso");
            }
        }
    } catch (e) {
        console.error("Erro ao baixar novamente:", e);
        mostrarNotificacao("Erro ao baixar o arquivo.", "erro");
    }
};

window.excluirExportacao = async (exportacaoId) => {
    if (confirm("Tem certeza que deseja excluir este registro do histórico?")) {
        try {
            await deleteDoc(doc(db, "historico_exportacoes", exportacaoId));
            mostrarNotificacao("Exportação excluída do histórico!", "sucesso");
        } catch (e) {
            console.error("Erro ao excluir:", e);
            mostrarNotificacao("Erro ao excluir o registro.", "erro");
        }
    }
};

async function registrarExportacao(tipo, formato, dadosExportados, nomeArquivo) {
    try {
        await addDoc(collection(db, "historico_exportacoes"), {
            data: new Date().toISOString(),
            tipo: tipo,
            formato: formato,
            status: "Sucesso",
            usuario: "admin",
            nomeArquivo: nomeArquivo,
            dadosExportados: dadosExportados
        });
    } catch (e) { 
        console.error("Erro ao registrar exportação:", e); 
    }
}

function monitorarHistorico() {
    const q = query(collection(db, "historico_exportacoes"), orderBy("data", "desc"));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('historyList');
        if (!list) return;
        list.innerHTML = "";
        if (snapshot.empty) {
            list.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma exportação realizada</td>';
            return;
        }
        snapshot.forEach(doc => {
            const item = doc.data();
            list.innerHTML += `
                <tr>
                    <td>${new Date(item.data).toLocaleString()}',
                    <td>${item.tipo || '-'}',
                    <td><strong>${item.formato || '-'}</strong>',
                    <td><span class="status-badge status-success">Concluído</span>',
                    <td class="action-buttons">
                        <button class="action-btn" onclick="baixarNovamente('${doc.id}')" title="Baixar novamente">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="action-btn" onclick="excluirExportacao('${doc.id}')" title="Excluir" style="color: #ef4444;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                     '
                </table>
            `;
        });
    });
}

function mostrarNotificacao(msg, tipo = "sucesso") {
    const toast = document.getElementById('notificacao');
    const msgEl = document.getElementById('notificacaoMsg');
    
    if (toast && msgEl) {
        if (tipo === "sucesso") {
            toast.style.background = "linear-gradient(135deg, #2199EF, #1a7fcc)";
        } else {
            toast.style.background = "linear-gradient(135deg, #ef4444, #dc2626)";
        }
        
        msgEl.innerText = msg;
        toast.style.display = 'flex';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

// Logout
const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = 'login.html';
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const painel = document.getElementById('painel');
    if (painel) painel.style.display = 'flex';
});

// ==================== EXCEL - AVALIAÇÕES ====================
window.exportarExcelAvaliacoes = async () => {
    const inicio = document.getElementById('excelAvaliacaoDataInicio')?.value;
    const fim = document.getElementById('excelAvaliacaoDataFim')?.value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando relatório de avaliações...", "sucesso");
        
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const q = query(
            collection(db, "avaliacoes"),
            where("dataAvaliacao", ">=", Timestamp.fromDate(dataInicio)),
            where("dataAvaliacao", "<=", Timestamp.fromDate(dataFim))
        );
        
        const snap = await getDocs(q);
        const dados = [];
        let totalAvaliacoes = 0;
        let somaNotas = 0;
        let respondidas = 0;
        let positivas = 0;
        
        for (const docSnap of snap.docs) {
            const avaliacao = docSnap.data();
            totalAvaliacoes++;
            somaNotas += avaliacao.nota || 0;
            if (avaliacao.resposta && avaliacao.resposta.trim() !== '') respondidas++;
            if ((avaliacao.nota || 0) >= 4) positivas++;
            
            const dataAvaliacao = avaliacao.dataAvaliacao?.toDate ? avaliacao.dataAvaliacao.toDate() : new Date();
            
            dados.push({
                'Data': dataAvaliacao.toLocaleDateString('pt-BR'),
                'Cliente': avaliacao.clienteNome || '-',
                'Serviço': avaliacao.servicoNome || '-',
                'Barbeiro': avaliacao.profissionalNome || '-',
                'Nota': `${avaliacao.nota}/5`,
                'Comentário': avaliacao.comentario || '-',
                'Resposta': avaliacao.resposta || '-',
                'Data Resposta': avaliacao.dataResposta?.toDate ? avaliacao.dataResposta.toDate().toLocaleDateString('pt-BR') : '-'
            });
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhuma avaliação encontrada no período.", "erro");
            return;
        }
        
        const notaMedia = totalAvaliacoes > 0 ? (somaNotas / totalAvaliacoes).toFixed(1) : 0;
        const taxaResposta = totalAvaliacoes > 0 ? ((respondidas / totalAvaliacoes) * 100).toFixed(1) : 0;
        const percentualPositivas = totalAvaliacoes > 0 ? ((positivas / totalAvaliacoes) * 100).toFixed(1) : 0;
        
        // Adicionar linha de resumo
        dados.unshift({
            'Data': 'RESUMO',
            'Cliente': `Total: ${totalAvaliacoes}`,
            'Serviço': `Nota Média: ${notaMedia}`,
            'Barbeiro': `Taxa Resposta: ${taxaResposta}%`,
            'Nota': `Positivas: ${percentualPositivas}%`,
            'Comentário': '',
            'Resposta': '',
            'Data Resposta': ''
        });
        
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Avaliações");
        const nomeArquivo = `Avaliacoes_${inicio}_a_${fim}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        await registrarExportacao("Avaliações", "Excel", dados, nomeArquivo);
        mostrarNotificacao(`Avaliações exportadas com sucesso!`, "sucesso");
    } catch (e) { 
        console.error("Erro ao exportar avaliações:", e); 
        mostrarNotificacao("Erro ao acessar o banco de dados.", "erro"); 
    }
};

// ==================== PDF - AVALIAÇÕES ====================
window.exportarPDFAvaliacoes = async () => {
    const inicio = document.getElementById('pdfAvaliacaoDataInicio')?.value;
    const fim = document.getElementById('pdfAvaliacaoDataFim')?.value;
    
    if (!inicio || !fim) {
        mostrarNotificacao("Selecione o período!", "erro");
        return;
    }

    try {
        mostrarNotificacao("Gerando PDF de avaliações...", "sucesso");
        
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);
        const dataFim = new Date(fim);
        dataFim.setHours(23, 59, 59, 999);
        
        const q = query(
            collection(db, "avaliacoes"),
            where("dataAvaliacao", ">=", Timestamp.fromDate(dataInicio)),
            where("dataAvaliacao", "<=", Timestamp.fromDate(dataFim))
        );
        
        const snap = await getDocs(q);
        const dados = [];
        let totalAvaliacoes = 0;
        let somaNotas = 0;
        let respondidas = 0;
        let positivas = 0;
        const notasDistribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        for (const docSnap of snap.docs) {
            const avaliacao = docSnap.data();
            totalAvaliacoes++;
            const nota = avaliacao.nota || 0;
            somaNotas += nota;
            notasDistribuicao[nota] = (notasDistribuicao[nota] || 0) + 1;
            if (avaliacao.resposta && avaliacao.resposta.trim() !== '') respondidas++;
            if (nota >= 4) positivas++;
            
            const dataAvaliacao = avaliacao.dataAvaliacao?.toDate ? avaliacao.dataAvaliacao.toDate() : new Date();
            const estrelas = '⭐'.repeat(nota) + '☆'.repeat(5 - nota);
            
            dados.push([
                dataAvaliacao.toLocaleDateString('pt-BR'),
                avaliacao.clienteNome || '-',
                avaliacao.servicoNome || '-',
                avaliacao.profissionalNome || '-',
                `${estrelas} (${nota}/5)`,
                (avaliacao.comentario || '-').substring(0, 100),
                avaliacao.resposta ? 'Sim' : 'Não'
            ]);
        }
        
        if (dados.length === 0) {
            mostrarNotificacao("Nenhuma avaliação encontrada no período.", "erro");
            return;
        }
        
        const notaMedia = totalAvaliacoes > 0 ? (somaNotas / totalAvaliacoes).toFixed(1) : 0;
        const taxaResposta = totalAvaliacoes > 0 ? ((respondidas / totalAvaliacoes) * 100).toFixed(1) : 0;
        const percentualPositivas = totalAvaliacoes > 0 ? ((positivas / totalAvaliacoes) * 100).toFixed(1) : 0;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.setTextColor(33, 153, 239);
        doc.text("Relatório de Avaliações - Alpha BarberShop", 14, 20);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Período: ${inicio} a ${fim}`, 14, 28);
        doc.text(`Data de emissão: ${new Date().toLocaleString()}`, 14, 34);
        
        doc.setFontSize(12);
        doc.setTextColor(33, 153, 239);
        doc.text("📊 RESUMO GERAL", 14, 45);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(`Total de Avaliações: ${totalAvaliacoes}`, 14, 53);
        doc.text(`Nota Média: ${notaMedia} / 5`, 14, 60);
        doc.text(`Taxa de Resposta: ${taxaResposta}%`, 14, 67);
        doc.text(`Avaliações Positivas (4+): ${percentualPositivas}%`, 14, 74);
        
        // Distribuição de notas
        doc.setFontSize(11);
        doc.setTextColor(33, 153, 239);
        doc.text("📈 DISTRIBUIÇÃO DE NOTAS", 14, 85);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        
        let yPos = 95;
        for (let i = 5; i >= 1; i--) {
            const qtd = notasDistribuicao[i] || 0;
            const percentual = totalAvaliacoes > 0 ? ((qtd / totalAvaliacoes) * 100).toFixed(1) : 0;
            doc.text(`${'⭐'.repeat(i)} ${i} estrelas: ${qtd} avaliações (${percentual}%)`, 14, yPos);
            yPos += 7;
        }
        
        yPos += 5;
        
        doc.autoTable({ 
            head: [['Data', 'Cliente', 'Serviço', 'Barbeiro', 'Nota', 'Comentário', 'Respondido']], 
            body: dados.slice(0, 25),
            startY: yPos,
            headStyles: { fillColor: [33, 153, 239] },
            alternateRowStyles: { fillColor: [30, 41, 59] },
            styles: { textColor: [255, 255, 255], fontSize: 7 },
            margin: { left: 10, right: 10 }
        });
        
        if (dados.length > 25) {
            const finalY = doc.lastAutoTable.finalY + 5;
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`* Exibindo os 25 primeiros registros de um total de ${dados.length}`, 14, finalY);
        }
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(`Alpha BarberShop - Relatório de Avaliações - Página ${i} de ${pageCount}`, 14, doc.internal.pageSize.height - 10);
        }
        
        const nomeArquivo = `Avaliacoes_${inicio}_a_${fim}.pdf`;
        doc.save(nomeArquivo);
        
        const dadosParaSalvar = {
            dados: dados,
            totalAvaliacoes: totalAvaliacoes,
            notaMedia: notaMedia,
            taxaResposta: taxaResposta,
            percentualPositivas: percentualPositivas,
            notasDistribuicao: notasDistribuicao,
            inicio: inicio,
            fim: fim
        };
        
        await registrarExportacao("Avaliações", "PDF", dadosParaSalvar, nomeArquivo);
        mostrarNotificacao("PDF de avaliações gerado com sucesso!", "sucesso");
        
    } catch (e) { 
        console.error("Erro ao gerar PDF de avaliações:", e); 
        mostrarNotificacao("Erro ao gerar PDF.", "erro"); 
    }
};