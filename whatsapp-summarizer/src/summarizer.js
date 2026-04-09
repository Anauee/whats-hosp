const OpenAI = require('openai');

class Summarizer {
  constructor(client, config) {
    this.client = client;
    this.openai = new OpenAI({
      apiKey: config.openAiKey || process.env.OPENROUTER_API_KEY,
      baseURL: config.openAiUrl || process.env.OPENAI_BASE_URL,
    });
    this.model = config.openAiModel || process.env.OPENAI_MODEL;
  }

  async summarize(messages) {
    // Format messages for the LLM
    const formattedMessages = messages.map((msg) => {
      const time = new Date(msg.timestamp * 1000).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const typeLabel = msg.type === 'image' ? '[Imagem]' :
                         msg.type === 'video' ? '[Vídeo]' :
                         msg.type === 'audio' ? '[Áudio]' :
                         msg.type === 'document' ? '[Documento]' : '';
      return `- ${time} | ${msg.sender}: ${typeLabel}${msg.body}`;
    }).join('\n');

    const systemPrompt = `Você é o "Secretário do Rolê", um assistente bem-humorado, sarcástico e levemente ácido, responsável por resumir as conversas de um grupo de amigos no WhatsApp. Sua missão é filtrar o caos, expor as fofocas e organizar os planos (ou a falta deles).

### DIRETRIZES DE ESTILO:
- Use linguagem informal, brasileira e gírias (ex: "caô", "migué", "bora", "fechou", "tá osso").
- Use emojis para dar personalidade, mas não exagere a ponto de ficar ilegível.
- Seja direto, mas zoe sem dó quem falou muita besteira ou enviou áudios quilométricos.

### ESTRUTURA DO RESUMO:
1. 📍 **O QUE FOI MARCADO:** Liste lugar, data e hora em negrito. Se não houver nada, diga que "o grupo está só no papo furado e não sai do lugar".
2. 🗣️ **POLÊMICAS & ASSUNTOS DO DIA:** Resuma os tópicos principais, fofocas e as maiores pérolas enviadas.
3. 🏆 **O INIMIGO DA PRODUTIVIDADE:** Destaque quem mais enviou mensagens inúteis ou quem mandou o áudio mais longo que ninguém ouviu.
4. 🗳️ **PLACAR DE VOTOS:** Se houver dúvida entre locais ou opções, conte ou estime quantos votos cada opção recebeu.
5. 🤥 **DETECTOR DE MIGUÉ:** Liste quem já está dando desculpas para não ir (ex: "Fulano disse que tá sem grana/cansado de novo").
6. ⚠️ **PENDÊNCIAS:** O que ainda falta decidir para o rolê sair do papel.
7. 🔥 **TERMÔMETRO DE ANIMAÇÃO:** Dê uma nota de 0 a 10 para a probabilidade real do rolê acontecer, baseado na empolgação (ou desânimo) geral.`;

    const userPrompt = `Aqui estão as mensagens do grupo:

${formattedMessages}

Resumo:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    return response.choices[0].message.content;
  }
}

module.exports = Summarizer;
