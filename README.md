# Financial Intelligence for Chile

> Thesis project — BSc Industrial Engineering & MSc Data Science, University of Chile.

An applied research prototype for personal-finance assistance in Chile. It combines conversational AI, financial data analysis and regulatory traceability to explore principles introduced by the **Fintech Law** and the **Open Finance System (SFA)**.

## Focus

- Conversational assistance for personal-finance decisions
- LLM and retrieval-augmented generation (RAG) workflows
- Financial data analysis and transparent system design
- Regulatory context: CMF, Fintech Law and Open Finance in Chile

## Architecture

The monorepo separates the web experience and API, alongside shared packages, regulatory knowledge resources and deployment/quality-assurance scripts.

```text
apps/       web and API applications
packages/   shared domain and platform code
rag_data/   curated knowledge resources
docs/       technical and research documentation
scripts/    deployment and QA utilities
```

## Local development

```bash
pnpm install
pnpm dev
```

Run the project checks with `pnpm verify`.

## Scope

This repository is an academic prototype. It does not provide regulated financial advice or execute financial transactions.
