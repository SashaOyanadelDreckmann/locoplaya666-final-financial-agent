export type QuestionnaireChatTheme = 'chat-1' | 'chat-2' | 'chat-3';
export type QuestionnaireResponseMode = 'open_text' | 'choices';

export function hasActiveQuestionnaireBlock(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index] as {
      type?: string;
      questionnaire?: { questions?: unknown[] };
    };
    if (block?.type !== 'questionnaire') continue;
    if (Array.isArray(block.questionnaire?.questions) && block.questionnaire.questions.length > 0) {
      return true;
    }
  }

  return false;
}

export function extractQuestionnaireClosingChoices(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index] as {
      type?: string;
      questionnaire?: {
        questions?: Array<{
          choices?: string[];
          response_mode?: QuestionnaireResponseMode;
        }>;
      };
    };

    if (block?.type !== 'questionnaire') continue;
    const closingQuestion = block.questionnaire?.questions?.at(-1);
    if (!closingQuestion) continue;
    if (closingQuestion.response_mode === 'open_text') return [];
    return Array.isArray(closingQuestion.choices)
      ? closingQuestion.choices.map((choice) => String(choice ?? '').trim()).filter(Boolean).slice(0, 4)
      : [];
  }

  return [];
}

export function resolveQuestionnaireResponseMode(
  question: string,
  choices: string[],
  chatTheme?: QuestionnaireChatTheme | null,
  responseMode?: QuestionnaireResponseMode | null,
): 'open-text' | 'choices' {
  void question;
  if (chatTheme === 'chat-3') return 'open-text';
  if (responseMode === 'open_text') return 'open-text';
  if (responseMode === 'choices' && choices.length > 0) return 'choices';
  if (!choices.length) return 'open-text';
  return 'choices';
}
