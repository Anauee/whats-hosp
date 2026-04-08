const Summarizer = require('./summarizer');

let messageBuffer = [];

class WhatsAppBot {
  constructor(sock, config) {
    this.sock = sock;
    this.config = config;
    this.summarizer = new Summarizer(sock, config);
    
    // Dynamic config
    this.groupName = config.groupName;
    this.yourNumber = config.phoneNumber;
    
    this.groupJid = null;
    this.listenersActive = false;
    this.onSummaryGenerated = null;
  }

  updateConfig(newConfig) {
    console.log(`\n🔄 Reiniciando bot com novas configurações. Novo grupo: ${newConfig.groupName}`);
    this.config = newConfig;
    this.groupName = newConfig.groupName;
    this.yourNumber = newConfig.phoneNumber;
    this.summarizer = new Summarizer(this.sock, newConfig); // update summarizer configs
    this.groupJid = null;
    messageBuffer = []; // limpa o buffer ao trocar de grupo
    this.findGroup();   // refaz a busca
  }

  async start() {
    if (!this.groupName) {
      console.log('⚠️ Nome do grupo não configurado. Indo para estado ocioso.');
    } else {
      await this.findGroup();
    }

    if (!this.listenersActive) {
      this.listenersActive = true;
      
      // Captura mensagens
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!this.groupJid) return; // Se não tem grupo alvo, ignora
        
        for (const msg of messages) {
          if (!msg.message) continue;

          const remoteJid = msg.key.remoteJid;
          if (remoteJid && remoteJid === this.groupJid) {
            const sender = msg.key.participant || remoteJid;
            const senderPhone = sender.includes('@') ? sender.split('@')[0] : sender;
            const body = this.getMessageBody(msg);

            // Log discreto ou omitir para não sujar o painel (opcional)
            // console.log(`📨 [${this.groupName}] ${senderPhone}: ${body ? body.substring(0,40) : '[Mídia]'}`);

            messageBuffer.push({
              sender: senderPhone,
              body: body || `[${msg.type || 'mídia'}]`,
              timestamp: msg.messageTimestamp,
              type: body ? 'text' : 'media',
            });
          }
        }
      });
      
      console.log('🔗 Modo de escuta inteligente do bot de mensagens está ativo!');
    }
  }

  async findGroup() {
    if (!this.groupName) return;

    try {
      console.log(`\n🔍 Buscando grupo "${this.groupName}"...`);
      const groups = await this.sock.groupFetchAllParticipating();
      const groupList = Object.values(groups);

      const found = groupList.find(g => g.subject.trim() === this.groupName.trim());
      if (!found) {
        console.error(`❌ Grupo "${this.groupName}" não encontrado! Nomes disponíveis:`);
        groupList.forEach(g => console.log(`  - "${g.subject}"`));
        return;
      }

      this.groupJid = found.id;
      console.log(`✅ Grupo alvo ativado: "${found.subject}" (${found.id})`);
    } catch (err) {
      console.error('❌ Erro ao buscar grupos:', err.message);
    }
  }

  getMessageBody(msg) {
    const content = msg.message;
    if (content.extendedTextMessage) return content.extendedTextMessage.text || '';
    if (content.conversation) return content.conversation;
    if (content.imageMessage) return content.imageMessage.caption || '';
    if (content.videoMessage) return content.videoMessage.caption || '';
    if (content.documentMessage) return content.documentMessage.caption || '';
    if (content.stickerMessage) return '[Sticker]';
    if (content.audioMessage) return '[Áudio]';
    return null;
  }

  async sendSummary(period) {
    if (!this.yourNumber) {
      console.log('❌ Número de telefone de destino não configurado! Atualize no Painel Web.');
      return;
    }

    const yourJid = `${this.yourNumber}@s.whatsapp.net`;

    if (!this.groupJid) {
      console.log('⏳ Grupo ainda não identificado ou configurado.');
      await this.sock.sendMessage(yourJid, { text: `⏳ *Aviso do Bot:* O grupo alvo (${this.groupName || 'Não configurado'}) ainda não foi localizado ou ativado. Mande uma mensagem lá para ativá-lo.` });
      return;
    }

    let msgsToProcess = messageBuffer;
    if (period === 'last100') {
      msgsToProcess = messageBuffer.slice(-100);
    }

    if (msgsToProcess.length === 0) {
      console.log('📭 Nenhuma mensagem acumulada. Nada a resumir.');
      await this.sock.sendMessage(yourJid, { text: '📭 *Zero mensagens:* Nenhuma mensagem nova do grupo foi capturada recentemente pelo bot. Nada a resumir por enquanto!' });
      return;
    }

    console.log(`\n📝 Gerando resumo (${period}) de ${msgsToProcess.length} mensagens...`);

    try {
      const summary = await this.summarizer.summarize(msgsToProcess);

      let periodLabel = 'Últimas Mensagens';
      if (period === 'almoço') periodLabel = 'Manhã (até 13h)';
      if (period === 'noite') periodLabel = 'Tarde/Noite (até 20h)';
      if (period === 'last100') periodLabel = 'Últimas 100 Mensagens';

      const formattedSummary = `📋 *Resumo do Grupo* — ${periodLabel}\n━━━━━━━━━━━━━━━━━━\n\n${summary}\n\n━━━━━━━━━━━━━━━━━━\n🤖 _Resumo gerado automaticamente_`;

      const yourJid = `${this.yourNumber}@s.whatsapp.net`;
      await this.sock.sendMessage(yourJid, { text: formattedSummary });
      console.log('✅ Resumo enviado via WhatsApp!');

      if (this.onSummaryGenerated) {
        this.onSummaryGenerated(formattedSummary, periodLabel);
      }

      // Limpa as mensagens após enviar se for resumo cronológico padrão
      if (period === 'almoço' || period === 'noite') {
        messageBuffer = []; // Limpa tudo
      } else if (period === 'last100') {
        // Remove as 100 mensagens que acabamos de mandar e mantém o resto caso chame de novo
        messageBuffer = messageBuffer.slice(0, -100);
      }
    } catch (error) {
      console.error('❌ Erro ao processar resumo via IA:', error.message);
    }
  }
}

module.exports = { WhatsAppBot };
