/**
 * MCP Bootstrap
 * ──────────────────────────────────────────────
 * Registra TODAS las tools reales del sistema.
 * Este archivo es la ÚNICA puerta de entrada a MCP.
 *
 * Regla de oro:
 * - Si el planner puede invocar una tool → DEBE estar registrada aquí.
 */

import { registerTool, isBootstrapped, markBootstrapped } from './tools/registry';

/* ────────────────────────────── */
/* WEB / SCRAPING                 */
/* ────────────────────────────── */
import { webExtractTool } from './tools/web/webExtract.tool';
import { webSearchTool } from './tools/web/webSearch.tool';
import { scrapeDoTool } from './tools/scrape/scrapeDo.tool';
import { chileRegulatoryLookupTool } from './tools/regulatory/chileRegulatoryLookup.tool';

/* ────────────────────────────── */
/* TIME                           */
/* ────────────────────────────── */
import { todayTool } from './tools/time/today.tool';

/* ────────────────────────────── */
/* MARKET — Chile                 */
/* ────────────────────────────── */
import { dollarCLTool } from './tools/market/dollarCL.tool';
import { ufCLTool } from './tools/market/ufCL.tool';
import { utmCLTool } from './tools/market/utmCL.tool';
import { tpmCLTool } from './tools/market/tpmCL.tool';

/* ────────────────────────────── */
/* CORE / MATH                    */
/* ────────────────────────────── */
import { calculatorTool } from './tools/calc/calculator.tool';
import { formatLatexTool } from './tools/latex/formatLatex.tool';

/* ────────────────────────────── */
/* SIMULATIONS — Básica           */
/* ────────────────────────────── */
import { simulatorTool } from './tools/simulate/simulator.tool';

/* ────────────────────────────── */
/* SIMULATIONS — Pro (SIMPRO)     */
/* ────────────────────────────── */
import { monteCarloTool } from './tools/simpro/montecarlo.tool';
import { portfolioProjectionTool } from './tools/simpro/portfolioProjection.tool';
import { scenarioProjectionTool } from './tools/simpro/scenarioProjection.tool';
import { riskDrawdownTool } from './tools/simpro/riskDrawdown.tool';
import { generateSimulationPdfTool } from './tools/pdf/generateSimulationPdf.tool';
import { generateNarrativePdfTool } from './tools/pdf/generateNarrativePdf.tool';

/* ────────────────────────────── */
/* FINANCE — Herramientas de alto valor  */
/* ────────────────────────────── */
import { debtAnalyzerTool }   from './tools/finance/debtAnalyzer.tool';
import { apvOptimizerTool }   from './tools/finance/apvOptimizer.tool';
import { budgetAnalyzerTool } from './tools/finance/budgetAnalyzer.tool';
import { goalPlannerTool }    from './tools/finance/goalPlanner.tool';

/* ────────────────────────────── */
/* RAG                            */
/* ────────────────────────────── */
import { ragLookupTool } from './tools/rag/ragLookup.tool';

/* ────────────────────────────── */
/* Bootstrap                      */
/* ────────────────────────────── */
export function bootstrapMCP() {
  if (isBootstrapped()) return;

  /* WEB */
  registerTool(webSearchTool);
  registerTool(webExtractTool);
  registerTool(scrapeDoTool);
  registerTool(chileRegulatoryLookupTool);

  /* TIME */
  registerTool(todayTool);

  /* MARKET (Chile) */
  registerTool(dollarCLTool);
  registerTool(ufCLTool);
  registerTool(utmCLTool);
  registerTool(tpmCLTool);

  /* CORE */
  registerTool(calculatorTool);
  registerTool(formatLatexTool);

  /* SIMULATIONS */
  registerTool(simulatorTool);
  

  /* SIMULATIONS — PRO */
  registerTool(monteCarloTool);
  registerTool(portfolioProjectionTool);
  registerTool(scenarioProjectionTool);
  registerTool(riskDrawdownTool);
  registerTool(generateSimulationPdfTool);
  registerTool(generateNarrativePdfTool);

  /* FINANCE — Alto valor */
  registerTool(debtAnalyzerTool);
  registerTool(apvOptimizerTool);
  registerTool(budgetAnalyzerTool);
  registerTool(goalPlannerTool);

  /* RAG */
  registerTool(ragLookupTool);

  markBootstrapped();
}
