# MCP (Model Context + Tools)

This folder contains:
- knowledge/contracts/guides/examples: stable context sources for RAG + citations
- tools/: executable tools callable by the Core Agent via a strict contract

Design goals:
- Deterministic tool contracts
- Auditable tool calls (inputs, outputs, latency, errors)
- No auto-execution of external "actions" beyond safe reads/scrapes/simulations
