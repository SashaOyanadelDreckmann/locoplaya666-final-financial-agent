type BlockContextInput = {
  blockId: string;
  objective: string;
  signals: string[];
  intake: any;
  answers: string[];
};

export function buildBlockContext({
  blockId,
  objective,
  signals,
  intake,
  answers,
}: BlockContextInput) {
  return `
🧩 BLOQUE
ID: ${blockId}
Objetivo: ${objective}

🔍 SEÑALES A EXPLORAR
${signals.map((s) => `- ${s}`).join('\n')}

📋 CONTEXTO (INTAKE)
${JSON.stringify(intake, null, 2)}

🗣 RESPUESTAS PREVIAS:
${
  answers.length === 0
    ? '(sin respuestas aún)'
    : answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
}

────────────────────────
REGLAS:
1. Haz UNA sola pregunta.
2. NO saludes.
3. NO uses el nombre del usuario.
4. NO hagas cumplidos ni datos curiosos.
5. Si la respuesta previa fue corta o poco clara:
   - dilo con respeto
`.trim();
}
