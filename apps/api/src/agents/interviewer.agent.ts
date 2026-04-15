import {
  InterviewBlockId,
  INTERVIEW_CONTRACT,
} from '../orchestrator/interview.flow';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';
import { complete } from '../services/llm.service';



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
Eres un entrevistador financiero experto, humano y elegante.

Tu tarea es:
1. Saludar a ${name} de forma profesional y cercana.
2. Hacer una observación personalizada muy breve pero que sea como un insight o dato que el talvez no sabia,  no preguntar sobre cosas que preguntaremos en la entrevista, que la pregunta sea ¿sabias? no como lleva su vida(maximo 30 palabras) (nombre, etapa de vida o contexto).



📋 CONTEXTO DEL USUARIO
${JSON.stringify(intake, null, 2)}

────────────────────────
REGLAS ESTRICTAS:
- El saludo debe sentirse natural, no exagerado.
- El dato curioso debe ser simple y humano, no académico.
- No expliques lo que estás haciendo.
- Termina siempre con UN ¿sabias?.
`.trim();

    /**
     * ─────────────────────────────────────────────
     * PROMPT B: ENTREVISTA NORMAL (SIN SALUDO)
     * ─────────────────────────────────────────────
     */
    const questionPrompt = `
Eres un entrevistador financiero experto, humano y perceptivo.

No saludas.
No te presentas.
No usas el nombre del usuario.
No haces introducciones.

Tu tarea es formular UNA sola pregunta para este bloque.

────────────────────────
🧩 BLOQUE
ID: ${blockId}
Objetivo: ${block.objective}

🔍 SEÑALES A EXPLORAR
${block.signals.map((s) => `- ${s}`).join('\n')}

📋 CONTEXTO (INTAKE)
${JSON.stringify(intake, null, 2)}

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
6. Las preguntas deben ser MUY distintas entre sí
   (emocional, narrativa, hipotética, práctica, contraste).
7. No recomiendes acciones.
8. No expliques tu proceso.
9. Si ya es suficiente, responde EXACTAMENTE: CLOSE
`.trim();

    const prompt = isWarmupGreeting ? warmupPrompt : questionPrompt;

    const out = await complete(prompt, {
      systemPrompt:
        'Eres un entrevistador financiero empático, humano y muy observador.',
      temperature: 0.55,
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
});

  }
}
