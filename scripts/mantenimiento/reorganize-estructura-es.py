#!/usr/bin/env python3
"""Reorganiza carpetas del repo con nombres en español y actualiza imports."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# (origen relativo a ROOT, destino relativo a ROOT)
MOVES: list[tuple[str, str]] = [
    # --- scripts ---
    ('scripts/deploy-api.sh', 'scripts/despliegue/deploy-api.sh'),
    ('scripts/deploy-web.sh', 'scripts/despliegue/deploy-web.sh'),
    ('scripts/lib', 'scripts/despliegue/lib'),
    ('scripts/prod-smoke.mjs', 'scripts/qa/prod-smoke.mjs'),
    ('scripts/prod-budget-e2e.ts', 'scripts/qa/prod-budget-e2e.ts'),
    ('scripts/prune-dead-modal-css.py', 'scripts/mantenimiento/prune-dead-modal-css.py'),
    ('scripts/sync-latest.sh', 'scripts/mantenimiento/sync-latest.sh'),
    ('apps/web/scripts/smoke-transactions-modal.mjs', 'apps/web/scripts/qa/smoke-transactions-modal.mjs'),
    # --- components ---
    ('apps/web/components/home', 'apps/web/components/inicio'),
    ('apps/web/components/agent', 'apps/web/components/agente'),
    ('apps/web/components/conversation', 'apps/web/components/conversacion'),
    ('apps/web/components/diagnosis', 'apps/web/components/diagnostico'),
    ('apps/web/components/brand', 'apps/web/components/marca'),
    ('apps/web/components/ViewportModeSync.tsx', 'apps/web/components/layout/ViewportModeSync.tsx'),
    ('apps/web/components/BrowserChromeVignetteSync.tsx', 'apps/web/components/layout/BrowserChromeVignetteSync.tsx'),
    ('apps/web/components/MobileInputViewportSync.tsx', 'apps/web/components/layout/MobileInputViewportSync.tsx'),
    ('apps/web/components/ServiceWorkerReset.tsx', 'apps/web/components/layout/ServiceWorkerReset.tsx'),
    ('apps/web/components/RouteShellClassSync.tsx', 'apps/web/components/layout/RouteShellClassSync.tsx'),
    ('apps/web/components/AnimatedPanelCard.tsx', 'apps/web/components/layout/AnimatedPanelCard.tsx'),
    ('apps/web/components/ProfileCard.tsx', 'apps/web/components/layout/ProfileCard.tsx'),
    # --- lib ---
    ('apps/web/lib/types', 'apps/web/lib/tipos'),
    ('apps/web/lib/agent', 'apps/web/lib/agente/nucleo'),
    ('apps/web/lib/agent.ts', 'apps/web/lib/agente/agent.ts'),
    ('apps/web/lib/agent.stream.ts', 'apps/web/lib/agente/agent.stream.ts'),
    ('apps/web/lib/agent.response.types.ts', 'apps/web/lib/agente/agent.response.types.ts'),
    ('apps/web/lib/api.ts', 'apps/web/lib/api/cliente.ts'),
    ('apps/web/lib/apiBase.ts', 'apps/web/lib/api/base.ts'),
    ('apps/web/lib/apiEnvelope.ts', 'apps/web/lib/api/envelope.ts'),
    ('apps/web/lib/admin.ts', 'apps/web/lib/api/admin.ts'),
    ('apps/web/lib/analytics.ts', 'apps/web/lib/api/analytics.ts'),
    ('apps/web/lib/sessionAccess.ts', 'apps/web/lib/sesion/sessionAccess.ts'),
    ('apps/web/lib/serverAuth.ts', 'apps/web/lib/sesion/serverAuth.ts'),
    ('apps/web/lib/session.ts', 'apps/web/lib/sesion/session.ts'),
    ('apps/web/lib/auth-redirect.ts', 'apps/web/lib/sesion/auth-redirect.ts'),
    ('apps/web/lib/csrf.ts', 'apps/web/lib/sesion/csrf.ts'),
    ('apps/web/lib/interviewVoiceState.ts', 'apps/web/lib/sesion/interviewVoiceState.ts'),
    ('apps/web/lib/intake.ts', 'apps/web/lib/sesion/intake.ts'),
    ('apps/web/lib/transactions-flow.helpers.ts', 'apps/web/lib/transacciones/flujo.helpers.ts'),
    ('apps/web/lib/transactions-authorization.helpers.ts', 'apps/web/lib/transacciones/autorizacion.helpers.ts'),
    ('apps/web/lib/transactions-chat.helpers.ts', 'apps/web/lib/transacciones/chat.helpers.ts'),
    ('apps/web/lib/transactions-chat.request.ts', 'apps/web/lib/transacciones/chat.request.ts'),
    ('apps/web/lib/transactions-evidence.helpers.ts', 'apps/web/lib/transacciones/evidencia.helpers.ts'),
    ('apps/web/lib/transactions-parse-progress.helpers.ts', 'apps/web/lib/transacciones/progreso-parse.helpers.ts'),
    ('apps/web/lib/transactions-summary.helpers.ts', 'apps/web/lib/transacciones/resumen.helpers.ts'),
    ('apps/web/lib/transactions-upload-state.helpers.ts', 'apps/web/lib/transacciones/estado-upload.helpers.ts'),
    ('apps/web/lib/budget-rows.helpers.ts', 'apps/web/lib/presupuesto/filas.helpers.ts'),
    ('apps/web/lib/diagnosis-session.ts', 'apps/web/lib/diagnostico/sesion.ts'),
    ('apps/web/lib/diagnosis.i18n.ts', 'apps/web/lib/diagnostico/i18n.ts'),
    ('apps/web/lib/diagnosticText.ts', 'apps/web/lib/diagnostico/texto.ts'),
    ('apps/web/lib/viewport-mode.ts', 'apps/web/lib/interfaz/viewport-mode.ts'),
    ('apps/web/lib/visual-mode.ts', 'apps/web/lib/interfaz/visual-mode.ts'),
    ('apps/web/lib/visual-palette-shuffle.ts', 'apps/web/lib/interfaz/visual-palette-shuffle.ts'),
    ('apps/web/lib/mobile-viewport-sync.ts', 'apps/web/lib/interfaz/mobile-viewport-sync.ts'),
    ('apps/web/lib/route-shell-classes.ts', 'apps/web/lib/interfaz/route-shell-classes.ts'),
    ('apps/web/lib/home-scroll-context.tsx', 'apps/web/lib/interfaz/home-scroll-context.tsx'),
    ('apps/web/lib/utils.ts', 'apps/web/lib/compartido/utils.ts'),
    ('apps/web/lib/validation.ts', 'apps/web/lib/compartido/validation.ts'),
    ('apps/web/lib/markdown.ts', 'apps/web/lib/compartido/markdown.ts'),
    ('apps/web/lib/form-errors.ts', 'apps/web/lib/compartido/form-errors.ts'),
    ('apps/web/lib/userError.ts', 'apps/web/lib/compartido/userError.ts'),
    ('apps/web/lib/rateLimit.ts', 'apps/web/lib/compartido/rateLimit.ts'),
    ('apps/web/lib/secureStorage.ts', 'apps/web/lib/compartido/secureStorage.ts'),
    ('apps/web/lib/artifacts.ts', 'apps/web/lib/compartido/artifacts.ts'),
    ('apps/web/lib/runtimePublicConfig.ts', 'apps/web/lib/compartido/runtimePublicConfig.ts'),
    ('apps/web/lib/serverEnv.ts', 'apps/web/lib/compartido/serverEnv.ts'),
    ('apps/web/lib/evidence-fidelity.helpers.ts', 'apps/web/lib/compartido/evidence-fidelity.helpers.ts'),
    ('apps/web/lib/evidence-format.helpers.ts', 'apps/web/lib/compartido/evidence-format.helpers.ts'),
    ('apps/web/lib/fincoin-gate.ts', 'apps/web/lib/compartido/fincoin-gate.ts'),
    ('apps/web/lib/panel-state.helpers.ts', 'apps/web/lib/compartido/panel-state.helpers.ts'),
    ('apps/web/lib/products-context.helpers.ts', 'apps/web/lib/compartido/products-context.helpers.ts'),
    ('apps/web/lib/product-normalization.helpers.ts', 'apps/web/lib/compartido/product-normalization.helpers.ts'),
    ('apps/web/lib/financialCatalog.ts', 'apps/web/lib/compartido/financialCatalog.ts'),
    ('apps/web/lib/bubble-pdf-storage.ts', 'apps/web/lib/compartido/bubble-pdf-storage.ts'),
    ('apps/web/lib/bubble-pdf-browser.ts', 'apps/web/lib/compartido/bubble-pdf-browser.ts'),
    # --- agent: transacciones ---
    ('apps/web/app/agent/transactions', 'apps/web/app/agent/modales/transacciones'),
    # --- agent: modales ---
    ('apps/web/app/agent/modals.tsx', 'apps/web/app/agent/modales/index.ts'),
    ('apps/web/app/agent/AgentModalCloseButton.tsx', 'apps/web/app/agent/modales/comunes/AgentModalCloseButton.tsx'),
    ('apps/web/app/agent/BudgetCloseConfirmDialog.tsx', 'apps/web/app/agent/modales/comunes/BudgetCloseConfirmDialog.tsx'),
    ('apps/web/app/agent/BudgetModal.tsx', 'apps/web/app/agent/modales/presupuesto/BudgetModal.tsx'),
    ('apps/web/app/agent/BudgetPendingConfirmBanner.tsx', 'apps/web/app/agent/modales/presupuesto/BudgetPendingConfirmBanner.tsx'),
    ('apps/web/app/agent/budget-modal.chat-api.ts', 'apps/web/app/agent/modales/presupuesto/budget-modal.chat-api.ts'),
    ('apps/web/app/agent/budget-modal.helpers.ts', 'apps/web/app/agent/modales/presupuesto/budget-modal.helpers.ts'),
    ('apps/web/app/agent/budget-modal.mobile-table-snap.ts', 'apps/web/app/agent/modales/presupuesto/budget-modal.mobile-table-snap.ts'),
    ('apps/web/app/agent/budget-modal.shared.ts', 'apps/web/app/agent/modales/presupuesto/budget-modal.shared.ts'),
    ('apps/web/app/agent/budget-modal.snapshot.ts', 'apps/web/app/agent/modales/presupuesto/budget-modal.snapshot.ts'),
    ('apps/web/app/agent/use-budget-modal-layout.ts', 'apps/web/app/agent/modales/presupuesto/use-budget-modal-layout.ts'),
    ('apps/web/app/agent/use-budget-close-confirm.ts', 'apps/web/app/agent/modales/presupuesto/use-budget-close-confirm.ts'),
    ('apps/web/app/agent/InterviewModal.tsx', 'apps/web/app/agent/modales/entrevista/InterviewModal.tsx'),
    ('apps/web/app/agent/InterviewDiagnosisPanel.tsx', 'apps/web/app/agent/modales/entrevista/InterviewDiagnosisPanel.tsx'),
    ('apps/web/app/agent/interview-modal.components.tsx', 'apps/web/app/agent/modales/entrevista/interview-modal.components.tsx'),
    ('apps/web/app/agent/interview-modal.context.ts', 'apps/web/app/agent/modales/entrevista/interview-modal.context.ts'),
    ('apps/web/app/agent/interview-modal.helpers.ts', 'apps/web/app/agent/modales/entrevista/interview-modal.helpers.ts'),
    ('apps/web/app/agent/interview-modal.hydration.ts', 'apps/web/app/agent/modales/entrevista/interview-modal.hydration.ts'),
    ('apps/web/app/agent/interview-modal.voice-session.ts', 'apps/web/app/agent/modales/entrevista/interview-modal.voice-session.ts'),
    ('apps/web/app/agent/interview-modal.voice-summary.ts', 'apps/web/app/agent/modales/entrevista/interview-modal.voice-summary.ts'),
    ('apps/web/app/agent/useInterviewModalA11y.ts', 'apps/web/app/agent/modales/entrevista/useInterviewModalA11y.ts'),
    ('apps/web/app/agent/useInterviewModalBootstrap.ts', 'apps/web/app/agent/modales/entrevista/useInterviewModalBootstrap.ts'),
    ('apps/web/app/agent/useInterviewVoiceRuntime.ts', 'apps/web/app/agent/modales/entrevista/useInterviewVoiceRuntime.ts'),
    ('apps/web/app/agent/AccountModal.tsx', 'apps/web/app/agent/modales/cuenta/AccountModal.tsx'),
    ('apps/web/app/agent/QuestionnaireModal.tsx', 'apps/web/app/agent/modales/cuestionario/QuestionnaireModal.tsx'),
    ('apps/web/app/agent/FincoinUsageModal.tsx', 'apps/web/app/agent/modales/fincoins/FincoinUsageModal.tsx'),
    ('apps/web/app/agent/use-fincoin-usage.ts', 'apps/web/app/agent/modales/fincoins/use-fincoin-usage.ts'),
    ('apps/web/app/agent/use-fincoin-spend-gate.ts', 'apps/web/app/agent/modales/fincoins/use-fincoin-spend-gate.ts'),
    ('apps/web/app/agent/SocialConsciousnessModal.tsx', 'apps/web/app/agent/modales/conciencia-social/SocialConsciousnessModal.tsx'),
    # --- agent: paneles ---
    ('apps/web/app/agent/panel-cards.tsx', 'apps/web/app/agent/paneles/panel-cards.tsx'),
    ('apps/web/app/agent/side-panels.tsx', 'apps/web/app/agent/paneles/side-panels.tsx'),
    ('apps/web/app/agent/PanelCardsIntroSequence.tsx', 'apps/web/app/agent/paneles/PanelCardsIntroSequence.tsx'),
    ('apps/web/app/agent/PanelIntroGridSlot.tsx', 'apps/web/app/agent/paneles/PanelIntroGridSlot.tsx'),
    ('apps/web/app/agent/PanelIntroLayoutGroup.tsx', 'apps/web/app/agent/paneles/PanelIntroLayoutGroup.tsx'),
    ('apps/web/app/agent/mobile-panel-compact-carousel.tsx', 'apps/web/app/agent/paneles/mobile-panel-compact-carousel.tsx'),
    ('apps/web/app/agent/panel-callout-banner.tsx', 'apps/web/app/agent/paneles/panel-callout-banner.tsx'),
    ('apps/web/app/agent/panel-cards-intro.copy.ts', 'apps/web/app/agent/paneles/panel-cards-intro.copy.ts'),
    ('apps/web/app/agent/panel-cards-intro.mobile-dock.ts', 'apps/web/app/agent/paneles/panel-cards-intro.mobile-dock.ts'),
    ('apps/web/app/agent/panel-cards-intro.present.tsx', 'apps/web/app/agent/paneles/panel-cards-intro.present.tsx'),
    ('apps/web/app/agent/panel-intro.prefs.ts', 'apps/web/app/agent/paneles/panel-intro.prefs.ts'),
    ('apps/web/app/agent/panel-intro.types.ts', 'apps/web/app/agent/paneles/panel-intro.types.ts'),
    # --- agent: chat ---
    ('apps/web/app/agent/chat-header.tsx', 'apps/web/app/agent/chat/chat-header.tsx'),
    ('apps/web/app/agent/chat-thread-view.tsx', 'apps/web/app/agent/chat/chat-thread-view.tsx'),
    ('apps/web/app/agent/message-renderer.tsx', 'apps/web/app/agent/chat/message-renderer.tsx'),
    ('apps/web/app/agent/user-upload-bubble.tsx', 'apps/web/app/agent/chat/user-upload-bubble.tsx'),
    ('apps/web/app/agent/bubble-chat.snapshot.ts', 'apps/web/app/agent/chat/bubble-chat.snapshot.ts'),
    ('apps/web/app/agent/chat-upload.helpers.ts', 'apps/web/app/agent/chat/chat-upload.helpers.ts'),
    # --- agent: arranque / flujo / utilidades ---
    ('apps/web/app/agent/AgentBootSequence.tsx', 'apps/web/app/agent/arranque/AgentBootSequence.tsx'),
    ('apps/web/app/agent/agent-boot-sequence.helpers.ts', 'apps/web/app/agent/arranque/agent-boot-sequence.helpers.ts'),
    ('apps/web/app/agent/OnboardingFlowCta.tsx', 'apps/web/app/agent/flujo/OnboardingFlowCta.tsx'),
    ('apps/web/app/agent/onboarding-flow.helpers.ts', 'apps/web/app/agent/flujo/onboarding-flow.helpers.ts'),
    ('apps/web/app/agent/welcome-intro.shared.ts', 'apps/web/app/agent/flujo/welcome-intro.shared.ts'),
    ('apps/web/app/agent/welcome-intake-scramble.helpers.ts', 'apps/web/app/agent/flujo/welcome-intake-scramble.helpers.ts'),
    ('apps/web/app/agent/interview-gate.helpers.ts', 'apps/web/app/agent/flujo/interview-gate.helpers.ts'),
    ('apps/web/app/agent/page.utils.ts', 'apps/web/app/agent/utilidades/page.utils.ts'),
    ('apps/web/app/agent/panel-state.service.ts', 'apps/web/app/agent/utilidades/panel-state.service.ts'),
    ('apps/web/app/agent/agent-page.constants.ts', 'apps/web/app/agent/utilidades/agent-page.constants.ts'),
    ('apps/web/app/agent/agent-hero-highlight.helpers.ts', 'apps/web/app/agent/utilidades/agent-hero-highlight.helpers.ts'),
    # --- API backend ---
    ('apps/api/src/orchestrator', 'apps/api/src/orquestador'),
    ('apps/api/src/persistence', 'apps/api/src/persistencia'),
]

# Reemplazos en contenido (orden: más largo primero)
REPLACEMENTS: list[tuple[str, str]] = [
    # scripts package.json
    ('bash scripts/deploy-api.sh', 'bash scripts/despliegue/deploy-api.sh'),
    ('bash scripts/deploy-web.sh', 'bash scripts/despliegue/deploy-web.sh'),
    ('node scripts/prod-smoke.mjs', 'node scripts/qa/prod-smoke.mjs'),
    ('tsx scripts/prod-budget-e2e.ts', 'tsx scripts/qa/prod-budget-e2e.ts'),
    ('bash scripts/sync-latest.sh', 'bash scripts/mantenimiento/sync-latest.sh'),
    ('apps/web/scripts/smoke-transactions-modal.mjs', 'apps/web/scripts/qa/smoke-transactions-modal.mjs'),
    ('scripts/lib/http-health.sh', 'scripts/despliegue/lib/http-health.sh'),
    ('ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"', 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"'),
    ('source "$ROOT_DIR/scripts/lib/http-health.sh"', 'source "$ROOT_DIR/scripts/despliegue/lib/http-health.sh"'),
    # components
    ('@/components/conversation/', '@/components/conversacion/'),
    ('@/components/diagnosis/', '@/components/diagnostico/'),
    ('@/components/home/', '@/components/inicio/'),
    ('@/components/agent/', '@/components/agente/'),
    ('@/components/brand/', '@/components/marca/'),
    ('../../components/home/', '../../components/inicio/'),
    ('../../components/agent/', '../../components/agente/'),
    ('../components/home/', '../components/inicio/'),
    ('../components/agent/', '../components/agente/'),
    ("@/components/ViewportModeSync", "@/components/layout/ViewportModeSync"),
    ("@/components/BrowserChromeVignetteSync", "@/components/layout/BrowserChromeVignetteSync"),
    ("@/components/MobileInputViewportSync", "@/components/layout/MobileInputViewportSync"),
    ("@/components/ServiceWorkerReset", "@/components/layout/ServiceWorkerReset"),
    ("@/components/RouteShellClassSync", "@/components/layout/RouteShellClassSync"),
    ("@/components/AnimatedPanelCard", "@/components/layout/AnimatedPanelCard"),
    ("@/components/ProfileCard", "@/components/layout/ProfileCard"),
    # lib paths
    ('@/lib/agent/applyCoreAgentResponse', '@/lib/agente/nucleo/applyCoreAgentResponse'),
    ('@/lib/agent/buildCoreAgentContext', '@/lib/agente/nucleo/buildCoreAgentContext'),
    ('@/lib/agent/buildCoreAgentRequest', '@/lib/agente/nucleo/buildCoreAgentRequest'),
    ('@/lib/agent/stream-session', '@/lib/agente/nucleo/stream-session'),
    ('@/lib/agent.response.types', '@/lib/agente/agent.response.types'),
    ('@/lib/agent.stream', '@/lib/agente/agent.stream'),
    ("from '@/lib/agent'", "from '@/lib/agente/agent'"),
    ('@/lib/types/', '@/lib/tipos/'),
    ('@/lib/transactions-upload-state.helpers', '@/lib/transacciones/estado-upload.helpers'),
    ('@/lib/transactions-summary.helpers', '@/lib/transacciones/resumen.helpers'),
    ('@/lib/transactions-parse-progress.helpers', '@/lib/transacciones/progreso-parse.helpers'),
    ('@/lib/transactions-evidence.helpers', '@/lib/transacciones/evidencia.helpers'),
    ('@/lib/transactions-chat.request', '@/lib/transacciones/chat.request'),
    ('@/lib/transactions-chat.helpers', '@/lib/transacciones/chat.helpers'),
    ('@/lib/transactions-authorization.helpers', '@/lib/transacciones/autorizacion.helpers'),
    ('@/lib/transactions-flow.helpers', '@/lib/transacciones/flujo.helpers'),
    ('@/lib/interviewVoiceState', '@/lib/sesion/interviewVoiceState'),
    ('@/lib/auth-redirect', '@/lib/sesion/auth-redirect'),
    ('@/lib/sessionAccess', '@/lib/sesion/sessionAccess'),
    ('@/lib/serverAuth', '@/lib/sesion/serverAuth'),
    ('@/lib/runtimePublicConfig', '@/lib/compartido/runtimePublicConfig'),
    ('@/lib/product-normalization.helpers', '@/lib/compartido/product-normalization.helpers'),
    ('@/lib/products-context.helpers', '@/lib/compartido/products-context.helpers'),
    ('@/lib/panel-state.helpers', '@/lib/compartido/panel-state.helpers'),
    ('@/lib/evidence-format.helpers', '@/lib/compartido/evidence-format.helpers'),
    ('@/lib/evidence-fidelity.helpers', '@/lib/compartido/evidence-fidelity.helpers'),
    ('@/lib/diagnosis-session', '@/lib/diagnostico/sesion'),
    ('@/lib/diagnosis.i18n', '@/lib/diagnostico/i18n'),
    ('@/lib/budget-rows.helpers', '@/lib/presupuesto/filas.helpers'),
    ('@/lib/mobile-viewport-sync', '@/lib/interfaz/mobile-viewport-sync'),
    ('@/lib/route-shell-classes', '@/lib/interfaz/route-shell-classes'),
    ('@/lib/visual-palette-shuffle', '@/lib/interfaz/visual-palette-shuffle'),
    ('@/lib/home-scroll-context', '@/lib/interfaz/home-scroll-context'),
    ('@/lib/visual-mode', '@/lib/interfaz/visual-mode'),
    ('@/lib/viewport-mode', '@/lib/interfaz/viewport-mode'),
    ('@/lib/secureStorage', '@/lib/compartido/secureStorage'),
    ('@/lib/userError', '@/lib/compartido/userError'),
    ('@/lib/form-errors', '@/lib/compartido/form-errors'),
    ('@/lib/apiEnvelope', '@/lib/api/envelope'),
    ('@/lib/apiBase', '@/lib/api/base'),
    ('@/lib/fincoin-gate', '@/lib/compartido/fincoin-gate'),
    ('@/lib/intake', '@/lib/sesion/intake'),
    ('@/lib/session', '@/lib/sesion/session'),
    ('@/lib/csrf', '@/lib/sesion/csrf'),
    ('@/lib/analytics', '@/lib/api/analytics'),
    ('@/lib/admin', '@/lib/api/admin'),
    ("from '@/lib/api'", "from '@/lib/api/cliente'"),
    # agent paths in imports
    ("from './modals'", "from './modales'"),
    ("from './modals'", "from './modales/index'"),
    ("from './transactions/", "from './modales/transacciones/"),
    ("from '../transactions/", "from '../modales/transacciones/"),
    ("from '../../transactions/", "from '../../modales/transacciones/"),
    ("from './onboarding-flow.helpers'", "from './flujo/onboarding-flow.helpers'"),
    ("from './interview-gate.helpers'", "from './flujo/interview-gate.helpers'"),
    ("from './agent-page.constants'", "from './utilidades/agent-page.constants'"),
    ("from './page.utils'", "from './utilidades/page.utils'"),
    ("from './welcome-intro.shared'", "from './flujo/welcome-intro.shared'"),
    ("from './AgentBootSequence'", "from './arranque/AgentBootSequence'"),
    ("from './PanelCardsIntroSequence'", "from './paneles/PanelCardsIntroSequence'"),
    ("from './PanelIntroGridSlot'", "from './paneles/PanelIntroGridSlot'"),
    ("from './PanelIntroLayoutGroup'", "from './paneles/PanelIntroLayoutGroup'"),
    ("from './agent-boot-sequence.helpers'", "from './arranque/agent-boot-sequence.helpers'"),
    ("from './panel-intro.prefs'", "from './paneles/panel-intro.prefs'"),
    ("from './modals'", "from './modales/index'"),
    ("from './AccountModal'", "from './modales/cuenta/AccountModal'"),
    ("from './BudgetModal'", "from './modales/presupuesto/BudgetModal'"),
    ("from './QuestionnaireModal'", "from './modales/cuestionario/QuestionnaireModal'"),
    ("from './InterviewModal'", "from './modales/entrevista/InterviewModal'"),
    ("from './FincoinUsageModal'", "from './modales/fincoins/FincoinUsageModal'"),
    ("from './SocialConsciousnessModal'", "from './modales/conciencia-social/SocialConsciousnessModal'"),
    ("from './use-fincoin-usage'", "from './modales/fincoins/use-fincoin-usage'"),
    ("from './use-fincoin-spend-gate'", "from './modales/fincoins/use-fincoin-spend-gate'"),
    ("from './side-panels'", "from './paneles/side-panels'"),
    ("from './panel-callout-banner'", "from './paneles/panel-callout-banner'"),
    ("from './mobile-panel-compact-carousel'", "from './paneles/mobile-panel-compact-carousel'"),
    ("from './chat-thread-view'", "from './chat/chat-thread-view'"),
    ("from './chat-header'", "from './chat/chat-header'"),
    ("from './panel-cards'", "from './paneles/panel-cards'"),
    ("from './chat-upload.helpers'", "from './chat/chat-upload.helpers'"),
    ("from './page.flow'", "from './page.flow'"),  # stays
    ("from './BudgetModal'", "from './presupuesto/BudgetModal'"),
    ("from './AgentModalCloseButton'", "from './comunes/AgentModalCloseButton'"),
    ("from '../AgentModalCloseButton'", "from '../comunes/AgentModalCloseButton'"),
    ("from '../agent-page.constants'", "from '../../utilidades/agent-page.constants'"),
    ("from './budget-modal.", "from './budget-modal."),
    ("@/app/agent/panel-cards-intro.present", "@/app/agent/paneles/panel-cards-intro.present"),
    # guard test paths
    ("'app', 'agent', 'BudgetModal.tsx'", "'app', 'agent', 'modales', 'presupuesto', 'BudgetModal.tsx'"),
    ("'app', 'agent', 'use-budget-modal-layout.ts'", "'app', 'agent', 'modales', 'presupuesto', 'use-budget-modal-layout.ts'"),
    ("'app', 'agent', 'budget-modal.helpers.ts'", "'app', 'agent', 'modales', 'presupuesto', 'budget-modal.helpers.ts'"),
    ("'app', 'agent', 'modals.tsx'", "'app', 'agent', 'modales', 'index.ts'"),
    ("'app', 'agent', 'budget-modal.chat-api.ts'", "'app', 'agent', 'modales', 'presupuesto', 'budget-modal.chat-api.ts'"),
    ("'app', 'agent', 'panel-cards.tsx'", "'app', 'agent', 'paneles', 'panel-cards.tsx'"),
    ("'app', 'agent', 'budget-modal.snapshot.ts'", "'app', 'agent', 'modales', 'presupuesto', 'budget-modal.snapshot.ts'"),
    ("'app', 'agent', 'chat-thread-view.tsx'", "'app', 'agent', 'chat', 'chat-thread-view.tsx'"),
    ("'app', 'agent', 'bubble-chat.snapshot.ts'", "'app', 'agent', 'chat', 'bubble-chat.snapshot.ts'"),
    ("'app', 'agent', 'InterviewModal.tsx'", "'app', 'agent', 'modales', 'entrevista', 'InterviewModal.tsx'"),
    ("'app', 'agent', 'useInterviewModalA11y.ts'", "'app', 'agent', 'modales', 'entrevista', 'useInterviewModalA11y.ts'"),
    ("'app', 'agent', 'useInterviewVoiceRuntime.ts'", "'app', 'agent', 'modales', 'entrevista', 'useInterviewVoiceRuntime.ts'"),
    ("'app', 'agent', 'interview-modal.context.ts'", "'app', 'agent', 'modales', 'entrevista', 'interview-modal.context.ts'"),
    ("'app', 'agent', 'interview-modal.helpers.ts'", "'app', 'agent', 'modales', 'entrevista', 'interview-modal.helpers.ts'"),
    ("'app', 'agent', 'InterviewDiagnosisPanel.tsx'", "'app', 'agent', 'modales', 'entrevista', 'InterviewDiagnosisPanel.tsx'"),
    ("'app', 'agent', 'interview-modal.components.tsx'", "'app', 'agent', 'modales', 'entrevista', 'interview-modal.components.tsx'"),
    ("'app', 'agent', 'useInterviewModalBootstrap.ts'", "'app', 'agent', 'modales', 'entrevista', 'useInterviewModalBootstrap.ts'"),
    ("'app', 'agent', 'interview-modal.voice-session.ts'", "'app', 'agent', 'modales', 'entrevista', 'interview-modal.voice-session.ts'"),
    # API
    ('../orchestrator/', '../orquestador/'),
    ('../../orchestrator/', '../../orquestador/'),
    ('../persistence/', '../persistencia/'),
    ('../../persistence/', '../../persistencia/'),
    ('from "../orchestrator', 'from "../orquestador'),
    ('from "../../orchestrator', 'from "../../orquestador'),
    ('from "../persistence', 'from "../persistencia'),
    ('from "../../persistence', 'from "../../persistencia'),
    ("from '@/lib/agent/", "from '@/lib/agente/nucleo/"),
    ("from '../lib/agent/", "from '../lib/agente/nucleo/"),
    ("from '../../lib/agent/", "from '../../lib/agente/nucleo/"),
    ("from '../apiBase'", "from '../api/base'"),
    ("from '../apiEnvelope'", "from '../api/envelope'"),
    ("from './apiBase'", "from './api/base'"),
    ("from './apiEnvelope'", "from './api/envelope'"),
    ("from '../apiBase'", "from '../api/base'"),
    ("from '../sessionAccess'", "from '../sesion/sessionAccess'"),
    ("from '../runtimePublicConfig'", "from '../compartido/runtimePublicConfig'"),
    ("from '../interviewVoiceState'", "from '../sesion/interviewVoiceState'"),
    ("from '../transactions-flow.helpers'", "from '../transacciones/flujo.helpers'"),
    ("from '../buildCoreAgentRequest'", "from '../agente/nucleo/buildCoreAgentRequest'"),
    ("from '../applyCoreAgentResponse'", "from '../agente/nucleo/applyCoreAgentResponse'"),
    ("from '../agent.response.types'", "from '../agente/agent.response.types'"),
    ("from '../panel-state.helpers'", "from '../compartido/panel-state.helpers'"),
    ("from '../products-context.helpers'", "from '../compartido/products-context.helpers'"),
    ("from '../budget-rows.helpers'", "from '../presupuesto/filas.helpers'"),
    ("from '../diagnosis-session'", "from '../diagnostico/sesion'"),
    ("from '../mobile-viewport-sync'", "from '../interfaz/mobile-viewport-sync'"),
    ("from '../visual-mode'", "from '../interfaz/visual-mode'"),
    ("from '../route-shell-classes'", "from '../interfaz/route-shell-classes'"),
    ("from '../fincoin-gate'", "from '../compartido/fincoin-gate'"),
    ("from '../evidence-fidelity.helpers'", "from '../compartido/evidence-fidelity.helpers'"),
    ("from '../evidence-format.helpers'", "from '../compartido/evidence-format.helpers'"),
    ("from '../transactions-evidence.helpers'", "from '../transacciones/evidencia.helpers'"),
    ("from '../transactions-upload-state.helpers'", "from '../transacciones/estado-upload.helpers'"),
    ("from '../transactions-summary.helpers'", "from '../transacciones/resumen.helpers'"),
    ("from '../transactions-parse-progress.helpers'", "from '../transacciones/progreso-parse.helpers'"),
    ("from '../transactions-chat.helpers'", "from '../transacciones/chat.helpers'"),
    ("from '../transactions-authorization.helpers'", "from '../transacciones/autorizacion.helpers'"),
    ("from '../product-normalization.helpers'", "from '../compartido/product-normalization.helpers'"),
    ("from '../viewport-mode'", "from '../interfaz/viewport-mode'"),
    ("from '../agent/stream-session'", "from '../agente/nucleo/stream-session'"),
    ("export { TransactionsModal } from './transactions'", "export { TransactionsModal } from './transacciones'"),
    ("export { BudgetModal } from './BudgetModal'", "export { BudgetModal } from './presupuesto/BudgetModal'"),
    ("export { QuestionnaireModal } from './QuestionnaireModal'", "export { QuestionnaireModal } from './cuestionario/QuestionnaireModal'"),
    ("export { AccountModal } from './AccountModal'", "export { AccountModal } from './cuenta/AccountModal'"),
    ("jest.mock('@/components/agent/ModalNumbersCanvas'", "jest.mock('@/components/agente/ModalNumbersCanvas'"),
    ("from '@/components/agent/ModalNumbersCanvas'", "from '@/components/agente/ModalNumbersCanvas'"),
    ("from '@/app/agent/panel-cards-intro.mobile-dock'", "from '@/app/agent/paneles/panel-cards-intro.mobile-dock'"),
    ("from '../panel-cards-intro.present'", "from '../paneles/panel-cards-intro.present'"),
    ("from '../panel-cards-intro.mobile-dock'", "from '../paneles/panel-cards-intro.mobile-dock'"),
    ("from '../../components/AnimatedPanelCard'", "from '../../components/layout/AnimatedPanelCard'"),
    ("from '../../components/ProfileCard'", "from '../../components/layout/ProfileCard'"),
    ("from '../transactions/TransactionsModal'", "from '../modales/transacciones/TransactionsModal'"),
    ("from './transactions/TransactionsModal'", "from './modales/transacciones/TransactionsModal'"),
    ("from '../transactions/types'", "from '../modales/transacciones/types'"),
    ("from '../transactions/constants'", "from '../modales/transacciones/constants'"),
    ("from '../transactions/state.helpers'", "from '../modales/transacciones/state.helpers'"),
    ("from '../transactions/tx-assistant.helpers'", "from '../modales/transacciones/tx-assistant.helpers'"),
    ("from '../transactions/taxonomy'", "from '../modales/transacciones/taxonomy'"),
    ("from '../transactions/align-product-dashboard'", "from '../modales/transacciones/align-product-dashboard'"),
    ("from './transactions/types'", "from './modales/transacciones/types'"),
    ("from './transactions/state.helpers'", "from './modales/transacciones/state.helpers'"),
    ("from './transactions/constants'", "from './modales/transacciones/constants'"),
    ("from './transactions/taxonomy'", "from './modales/transacciones/taxonomy'"),
    ("from './transactions/align-product-dashboard'", "from './modales/transacciones/align-product-dashboard'"),
    ("from './transactions/tx-assistant.helpers'", "from './modales/transacciones/tx-assistant.helpers'"),
    ("from '../BudgetCloseConfirmDialog'", "from '../comunes/BudgetCloseConfirmDialog'"),
    ("from '../BudgetPendingConfirmBanner'", "from '../presupuesto/BudgetPendingConfirmBanner'"),
    ("from '../use-budget-modal-layout'", "from '../presupuesto/use-budget-modal-layout'"),
    ("from '../use-budget-close-confirm'", "from '../presupuesto/use-budget-close-confirm'"),
    ("from '../use-fincoin-usage'", "from '../fincoins/use-fincoin-usage'"),
    ("from '../InterviewDiagnosisPanel'", "from '../entrevista/InterviewDiagnosisPanel'"),
    ("from '../panel-state.service'", "from '../utilidades/panel-state.service'"),
    ("from '../OnboardingFlowCta'", "from '../flujo/OnboardingFlowCta'"),
    ("from '../message-renderer'", "from '../chat/message-renderer'"),
    ("from '../user-upload-bubble'", "from '../chat/user-upload-bubble'"),
    ("from '../agent-hero-highlight.helpers'", "from '../utilidades/agent-hero-highlight.helpers'"),
    ("from '../welcome-intake-scramble.helpers'", "from '../flujo/welcome-intake-scramble.helpers'"),
    ("from '../panel-cards-intro.copy'", "from '../paneles/panel-cards-intro.copy'"),
    ("from '@/lib/compartido/utils'", "from '@/lib/compartido/utils'"),
    ("from '@/lib/compartido/markdown'", "from '@/lib/compartido/markdown'"),
    ("from '@/lib/compartido/validation'", "from '@/lib/compartido/validation'"),
    ("from '@/lib/diagnostico/texto'", "from '@/lib/diagnostico/texto'"),
    ("from '@/lib/compartido/financialCatalog'", "from '@/lib/compartido/financialCatalog'"),
    ("from '@/lib/compartido/bubble-pdf-storage'", "from '@/lib/compartido/bubble-pdf-storage'"),
    ("from '@/lib/compartido/bubble-pdf-browser'", "from '@/lib/compartido/bubble-pdf-browser'"),
    ("from '@/lib/compartido/serverEnv'", "from '@/lib/compartido/serverEnv'"),
    ("from '@/lib/compartido/rateLimit'", "from '@/lib/compartido/rateLimit'"),
    ("from '@/lib/compartido/artifacts'", "from '@/lib/compartido/artifacts'"),
    ('"scripts/deploy-api.sh"', '"scripts/despliegue/deploy-api.sh"'),
    ('"scripts/deploy-web.sh"', '"scripts/despliegue/deploy-web.sh"'),
    ('"scripts/lib/**"', '"scripts/despliegue/lib/**"'),
    ('"scripts/prod-smoke.mjs"', '"scripts/qa/prod-smoke.mjs"'),
    ('bash scripts/deploy-api.sh', 'bash scripts/despliegue/deploy-api.sh'),
    ('bash scripts/deploy-web.sh', 'bash scripts/despliegue/deploy-web.sh'),
    ('node scripts/prod-smoke.mjs', 'node scripts/qa/prod-smoke.mjs'),
    # shellcheck source=scripts/lib/http-health.sh
    ('# shellcheck source=scripts/lib/http-health.sh', '# shellcheck source=scripts/despliegue/lib/http-health.sh'),
]

TEXT_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.sh', '.yml', '.yaml'}


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def git_mv(src: Path, dst: Path) -> None:
    if not src.exists():
        print(f'skip missing: {src.relative_to(ROOT)}')
        return
    ensure_parent(dst)
    if dst.exists():
        print(f'skip exists: {dst.relative_to(ROOT)}')
        return
    subprocess.run(['git', 'mv', str(src), str(dst)], cwd=ROOT, check=True)
    print(f'mv {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}')


def apply_replacements(content: str) -> str:
    for old, new in REPLACEMENTS:
        content = content.replace(old, new)
    return content


def patch_internal_relative_imports(content: str, file_path: Path) -> str:
    """Ajusta imports relativos dentro de modales/transacciones tras el move."""
    rel = file_path.relative_to(ROOT)
    if 'app/agent/modales/transacciones' in str(rel):
        content = content.replace("from '../AgentModalCloseButton'", "from '../comunes/AgentModalCloseButton'")
        content = content.replace("from '../agent-page.constants'", "from '../../utilidades/agent-page.constants'")
        content = content.replace("from '../BudgetCloseConfirmDialog'", "from '../comunes/BudgetCloseConfirmDialog'")
    if 'app/agent/modales/presupuesto' in str(rel):
        content = content.replace("from './BudgetCloseConfirmDialog'", "from '../comunes/BudgetCloseConfirmDialog'")
        content = content.replace("from './AgentModalCloseButton'", "from '../comunes/AgentModalCloseButton'")
        content = content.replace("from '../agent-page.constants'", "from '../../utilidades/agent-page.constants'")
        content = content.replace("from '../hooks/", "from '../../hooks/")
    if 'app/agent/modales/entrevista' in str(rel):
        content = content.replace("from './AgentModalCloseButton'", "from '../comunes/AgentModalCloseButton'")
        content = content.replace("from '../flujo/", "from '../../flujo/")
        content = content.replace("from '../utilidades/", "from '../../utilidades/")
    if 'app/agent/modales/index.ts' in str(rel):
        content = content.replace("from './transactions'", "from './transacciones'")
        content = content.replace("from './BudgetModal'", "from './presupuesto/BudgetModal'")
        content = content.replace("from './QuestionnaireModal'", "from './cuestionario/QuestionnaireModal'")
        content = content.replace("from './AccountModal'", "from './cuenta/AccountModal'")
    if 'app/agent/paneles' in str(rel):
        content = content.replace("from '../../components/", "from '../../../components/")
        content = content.replace("from '@/app/agent/panel-cards-intro.present'", "@/app/agent/paneles/panel-cards-intro.present")
        content = content.replace("from './panel-cards-intro.present'", "from './panel-cards-intro.present'")
        content = content.replace("from '../panel-cards-intro.present'", "from './panel-cards-intro.present'")
    if 'app/agent/modales/index.ts' in str(rel):
        pass
    return content


def rewrite_files() -> None:
    for path in ROOT.rglob('*'):
        if not path.is_file():
            continue
        if any(part in {'node_modules', '.next', '.git', 'coverage'} for part in path.parts):
            continue
        if path.suffix not in TEXT_EXTENSIONS and path.name not in {'package.json', 'railway.api.toml', 'railway.web.toml'}:
            continue
        original = path.read_text(encoding='utf-8')
        updated = apply_replacements(original)
        updated = patch_internal_relative_imports(updated, path)
        if updated != original:
            path.write_text(updated, encoding='utf-8')


def main() -> None:
    ordered = sorted(MOVES, key=lambda pair: (-len(pair[0]), pair[0]))

    for src_rel, dst_rel in ordered:
        git_mv(ROOT / src_rel, ROOT / dst_rel)

    rewrite_files()
    print('done')


if __name__ == '__main__':
    main()
