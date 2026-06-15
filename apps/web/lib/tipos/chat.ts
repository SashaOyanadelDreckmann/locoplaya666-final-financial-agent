export type AgentBlock =
  | {
      type: 'document';
      title?: string;
      sections?: Array<{
        heading: string;
        content: string;
      }>;
    }
  | {
      type: 'chart';
      chart: {
        kind: 'line' | 'bar' | 'area';
        title: string;
        subtitle?: string;
        xKey: string;
        yKey: string;
        data: Array<Record<string, number | string>>;
        format?: 'currency' | 'percentage' | 'number';
        currency?: string;
      };
    }
  | {
      type: 'tx_chart';
      tx_chart:
        | {
            variant: 'cumulative_cashflow';
            title?: string;
            subtitle?: string;
            currency?: string;
            series: import('@financial-agent/shared').TransactionCashflowSeries;
          }
        | {
            variant: 'flow_bar';
            title?: string;
            subtitle?: string;
            currency?: string;
            inflowLabel?: string;
            data: import('@financial-agent/shared').TransactionFlowBarPoint[];
          }
        | {
            variant: 'category_bar';
            title?: string;
            subtitle?: string;
            currency?: string;
            data: import('@financial-agent/shared').TransactionCategoryBarPoint[];
          };
    }
  | {
      type: 'table';
      table: {
        title: string;
        headers: string[];
        rows: string[][];
        note?: string;
      };
    }
  | {
      type: 'questionnaire';
      questionnaire: {
        id: string;
        title?: string;
        submit_label?: string;
        questions: Array<{
          id: string;
          question: string;
          choices: string[];
          allow_free_text?: boolean;
          free_text_placeholder?: string;
          required?: boolean;
        }>;
      };
    }
  | {
      type: 'executive_intro';
      intro: {
        version: 2;
        uiVersion?: number;
        firstName: string;
        headline: string;
        wittyHook?: string;
        personalRead: string;
        signals: string[];
        sections: {
          marco: { title: string; body: string };
          fintech: { title: string; body: string; benefit: string };
          metodo: Array<{ step: number; label: string; detail: string }>;
          resultado: { title: string; body: string };
        };
        closingQuestion: string;
      };
    };

export type UIEvent =
  | {
      type: 'TOAST';
      payload: {
        kind?: 'info' | 'success' | 'warn' | 'error';
        message: string;
      };
    }
  | {
      type: 'FOCUS_ARTIFACT';
      payload: { artifactId: string };
    }
  | {
      type: 'OPEN_ARTIFACT';
      payload: { artifactId: string };
    }
  | {
      type: 'SAVE_ARTIFACT';
      payload: {
        artifactId: string;
        location?: 'simulaciones' | 'planes' | 'reportes';
      };
    }
  | {
      type: 'ANIMATE_TRANSFER';
      payload: {
        from: 'chat';
        to: 'panel';
        artifactId: string;
      };
    };
