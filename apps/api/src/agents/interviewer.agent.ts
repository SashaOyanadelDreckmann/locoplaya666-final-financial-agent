import {
  InterviewBlockId,
  INTERVIEW_CONTRACT,
} from '../orchestrator/interview.flow';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { complete } from '../services/llm.service';
import {
  buildInterviewContextDigest,
  buildInterviewStrategicBrief,
} from './interview-strategy';

import { User } from '../schemas/user.schema';

type NextQuestionInput = {
  blockId: InterviewBlockId;
  intake: IntakeQuestionnaire;
  answersInCurrentBlock: string[];
  user: User;
};

export class InterviewerAgent {
  /**
   * Devuelve la siguiente pregunta o null si corresponde cerrar el bloque
   */
  public async generateNextQuestion(
    input: NextQuestionInput
  ): Promise<string | null> {
    const { blockId, intake, answersInCurrentBlock, user } = input;

    const block = INTERVIEW_CONTRACT[blockId];
    if (!block) return null;

    const name = user.name;
    const contextDigest = buildInterviewContextDigest(intake);
    const strategicBrief = buildInterviewStrategicBrief({
      blockId,
      intake,
      answersInCurrentBlock,
    });

    /**
     * ✅ ÚNICA CONDICIÓN DE SALUDO
     * Solo en warmup + primera pregunta
     */
    const isWarmupGreeting =
      blockId === 'warmup' && answersInCurrentBlock.length === 0;

    if (
      answersInCurrentBlock.length >= 1 &&
      answersInCurrentBlock.join(' ').length > 200
    ) {
      return null;
    }
    /**
     * 🔒 Regla dura de cierre por cantidad
     */
    const MAX_QUESTIONS_PER_BLOCK = 2;
    if (answersInCurrentBlock.length >= MAX_QUESTIONS_PER_BLOCK) {
      return null;
    }

    /**
     * 🧹 Defensa contra respuestas triviales
     */
    const normalizedAnswers = answersInCurrentBlock
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);

    if (
      normalizedAnswers.length > 0 &&
      normalizedAnswers.every(
        (a) => a === 'no' || a === 'nada' || a === 'ninguno'
      )
    ) {
      return null;
    }


    /**
     * ─────────────────────────────────────────────
     * PROMPT A: WARMUP (SALUDO + ACTIVACIÓN)
     * ─────────────────────────────────────────────
     */
    const warmupPrompt = `
Eres un entrevistador financiero senior, premium y muy observador.

Tu tarea es:
1. Abrir con una sola línea breve, elegante y relajada para ${name}.
2. Conectar con una observación útil tomada del intake, productos o presupuesto.
3. Cerrar con una sola pregunta tipo "¿sabías...?" que active la conversación sin abrir demasiados temas.

📋 CONTEXTO DEL USUARIO
${JSON.stringify(strategicBrief.userSnapshot, null, 2)}

📊 CONTEXTO PRODUCTOS/PRESUPUESTO
${JSON.stringify(contextDigest, null, 2)}

🎯 SEÑALES PRIORITARIAS
${JSON.stringify(strategicBrief.prioritySignals, null, 2)}

────────────────────────
REGLAS ESTRICTAS:
- Máximo 28 palabras.
- Debe sonar senior, claro y humano.
- No expliques la metodología.
- No hagas más de una pregunta.
- No uses tono infantil ni motivacional.
- Usa una observación concreta, no genérica.
`.trim();

    /**
     * ─────────────────────────────────────────────
     * PROMPT B: ENTREVISTA NORMAL (SIN SALUDO)
     * ─────────────────────────────────────────────
     */
    const questionPrompt = `
Eres un entrevistador financiero senior de altísimo nivel, humano, perceptivo y quirúrgico.

No saludas.
No te presentas.
No usas el nombre del usuario.
No haces introducciones.

Tu tarea es formular UNA sola pregunta muy valiosa para este bloque.

────────────────────────
🧩 BLOQUE
ID: ${blockId}
Objetivo: ${block.objective}

🔍 SEÑALES A EXPLORAR
${block.signals.map((s) => `- ${s}`).join('\n')}

📋 CONTEXTO (INTAKE)
${JSON.stringify(strategicBrief.userSnapshot, null, 2)}

📊 CONTEXTO DE PRODUCTOS Y PRESUPUESTO
${JSON.stringify(contextDigest, null, 2)}

🧠 BRIEF ESTRATÉGICO
${JSON.stringify(strategicBrief, null, 2)}

🗣 RESPUESTAS PREVIAS:
${
  answersInCurrentBlock.length === 0
    ? '(sin respuestas aún)'
    : answersInCurrentBlock.map((a, i) => `${i + 1}. ${a}`).join('\n')
}

────────────────────────
REGLAS:

1. Haz UNA sola pregunta.
2. NO saludes.
3. NO uses el nombre del usuario.
4. NO hagas cumplidos ni datos curiosos.
5. Si la respuesta previa fue corta o poco clara:
   - dilo con respeto
   - explica brevemente por qué necesitas más contexto
   - cambia completamente el enfoque.
6. Prioriza preguntas que crucen intake con presupuesto, productos, deuda, liquidez o hábitos reales.
7. Las preguntas deben ser MUY distintas entre sí
   (conductual, narrativa, práctica, tensión, trade-off, consistencia).
8. Debe sonar como entrevista ejecutiva, no como formulario.
9. No recomiendes acciones.
10. No expliques tu proceso.
11. Usa el brief estratégico para entrar por la tensión más valiosa, no por la más obvia.
12. Si ya es suficiente, responde EXACTAMENTE: CLOSE
`.trim();

    const prompt = isWarmupGreeting ? warmupPrompt : questionPrompt;

    const out = await complete(prompt, {
      systemPrompt:
        'Eres un entrevistador financiero senior, elegante, incisivo y muy observador.',
      temperature: 0.55,
      model: process.env.OPENAI_MODEL_INTERVIEW_WRITER ?? 'gpt-5-mini',
      maxCompletionTokens: 180,
    });

    const cleaned = (out ?? '').trim();
    if (!cleaned) return null;
    if (cleaned.toUpperCase() === 'CLOSE') return null;

    return cleaned;
  }

  /**
   * Resume el bloque una vez cerrado
   */
  public async summarizeBlock(
    blockId: InterviewBlockId,
    answers: string[],
    user: User
  ): Promise<string> {
    const block = INTERVIEW_CONTRACT[blockId];
    if (!block) return '';

    const name = user.name;

    const prompt = `
Estás cerrando un bloque de una entrevista financiera personal.

Persona: ${name}
Bloque: ${blockId}
Objetivo del bloque:
${block.objective}

Respuestas clave:
${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

────────────────────────
Resume en 2–3 frases MUY cortas, hablándole directamente a ${name}.

Reglas estrictas:
- NO digas “el usuario”.
- NO seas técnico.
- NO recomiendes acciones.
- NO diagnostiques.
- Lenguaje cercano y simple.
- Máx. 40 palabras en total.
- Comienza con una de estas opciones:
  “Ya mira ${name},”
  “Okey ${name},”
  “Súper ${name},”
- Solo refleja comprensión general, nada más.
`.trim();

return complete(prompt, {
  systemPrompt:
    'Eres un entrevistador financiero empático que habla poco y claro.',
  temperature: 0.4,
  model: process.env.OPENAI_MODEL_INTERVIEW_SUMMARIZER ?? 'gpt-5-mini',
  maxCompletionTokens: 120,
});

  }
}
