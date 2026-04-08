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

    const prompt = `Você é um assistente que resume conversas de grupo do WhatsApp de forma clara e objetiva.

Regras:
1. Identifique os PRINCIPAIS ASSUNTOS discutidos
2. Destaque pontos importantes, decisões ou kombinações
3. Mencione links, arquivos ou informações relevantes compartilhados
4. Seja conciso mas completo — use bullet points
5. Se houver humor/zingueiras relevantes, mencione brevemente
6. Se houver conflitos ou debates, resume os lados
7. Escreva SEMPRE em português brasileiro

Aqui estão as mensagens do grupo:

${formattedMessages}

Resumo:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente que resume conversas de WhatsApp de forma clara e útil.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    return response.choices[0].message.content;
  }
}

module.exports = Summarizer;
