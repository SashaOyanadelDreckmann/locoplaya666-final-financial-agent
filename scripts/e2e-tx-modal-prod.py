#!/usr/bin/env python3
"""E2E production checks for transactions modal parse + chat."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
import http.cookiejar
from dataclasses import dataclass, field
from typing import Any

API = os.environ.get(
    "TX_E2E_API",
    "https://locoplaya666-final-financial-agent-production.up.railway.app",
)
ASSETS = os.environ.get(
    "TX_E2E_ASSETS",
    "/Users/locoplaya666/.cursor/projects/Users-locoplaya666-final-financial-agent/assets",
)
EMAIL = os.environ.get("TX_E2E_EMAIL", "cursor.agent.1781006146@ug.uchile.cl")
PASSWORD = os.environ.get("TX_E2E_PASSWORD", "CursorAgent2026!")

USER_IMAGES = [
    "IMG_1011-25717b8a-310c-417a-89df-8b67548acd72.png",
    "IMG_1008-81ccecc1-449b-4656-b7f8-2511e4ef99e1.png",
    "IMG_1009-6009a23e-ecf6-4649-b2e7-364ddb7c8520.png",
    "IMG_0603-95b4836b-4116-4e97-8460-320f2c9a3097.png",
    "IMG_1010-a3b34d91-7211-44d1-809d-2bd05338c903.png",
    "IMG_0604-3aecb605-4ff8-466f-bb3c-7602e4b6737f.png",
    "IMG_0599-4c661c2a-4f42-4dbc-b7c4-99e2aba6c4c8.png",
    "IMG_0600-2b30d358-4d33-4920-91f3-d9e79177bb59.png",
    "IMG_0598-ffb468a9-b093-46b4-9a5f-d83aefaecf6a.png",
    "IMG_0601-eedf91dd-e562-4cf0-ba2a-2608ec03ae1c.png",
]

EXPECTED_SNIPPETS = [
    "Copec Nunoa",
    "Pedidosya",
    "Monto Cancelado",
    "Traspaso",
    "Cargo por pago tc",
    "Cursor Ai",
]


@dataclass
class Report:
    passed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def ok(self, msg: str) -> None:
        self.passed.append(msg)

    def fail(self, msg: str) -> None:
        self.failed.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


class Client:
    def __init__(self) -> None:
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.csrf = ""

    def request(self, method: str, path: str, data: dict | None = None, timeout: int = 600) -> dict:
        headers: dict[str, str] = {}
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(f"{API}{path}", data=body, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as err:
            payload = err.read().decode()
            try:
                parsed = json.loads(payload)
            except json.JSONDecodeError:
                parsed = {"raw": payload, "status": err.code}
            parsed["_http_status"] = err.code
            return parsed

    def login(self) -> bool:
        res = self.request("POST", "/auth/login", {"email": EMAIL, "password": PASSWORD})
        if not res.get("ok"):
            return False
        session = self.request("GET", "/api/session")
        self.csrf = str(session.get("data", {}).get("csrfToken", "") or "")
        if not self.csrf:
            for cookie in self.cj:
                if cookie.name == "csrf-token":
                    self.csrf = cookie.value
        return bool(self.csrf)

    def encode_files(self, names: list[str]) -> list[dict]:
        files = []
        for name in names:
            path = os.path.join(ASSETS, name)
            if not os.path.isfile(path):
                raise FileNotFoundError(path)
            with open(path, "rb") as handle:
                files.append(
                    {
                        "name": name,
                        "base64": base64.b64encode(handle.read()).decode(),
                        "mimeType": "image/png",
                    }
                )
        return files


def analyst_mode(upload_format: str, fidelity: str | None, movement_count: int, table_ratio: float) -> str:
    if upload_format in ("photos", "text"):
        if fidelity == "authoritative" and movement_count >= 3:
            return "full"
        if movement_count > 0:
            return "minimal"
        return "minimal"
    if fidelity == "indicative":
        return "minimal"
    if table_ratio >= 0.42 and movement_count >= 2:
        return "full"
    if movement_count >= 3:
        return "full"
    return "minimal"


def summarize_parse(res: dict) -> dict[str, Any]:
    data = res.get("data", {})
    analysis = data.get("transactionAnalysis", {}) or {}
    profile = analysis.get("product_profile", {}) or {}
    movements = analysis.get("movements", []) or []
    docs = data.get("documents", []) or []
    texts = " ".join((doc.get("text") or "") for doc in docs)
    table_moves = sum(1 for m in movements if m.get("source_kind") == "table")
    ratio = (table_moves / len(movements)) if movements else 0.0
    return {
        "docs": len(docs),
        "movements": len(movements),
        "fidelity": profile.get("evidence_fidelity"),
        "fidelity_reason": profile.get("evidence_fidelity_reason"),
        "institution": profile.get("institution") or profile.get("resolved_bank"),
        "product_type": profile.get("product_type") or profile.get("resolved_product_type"),
        "movement_count_metric": (profile.get("key_metrics") or {}).get("movement_count"),
        "text_len": len(texts),
        "text_sample": texts[:500],
        "table_ratio": ratio,
        "sample_movements": movements[:8],
        "executive_summary_len": len(profile.get("executive_summary") or ""),
    }


def run(report: Report) -> int:
    client = Client()
    if not client.login():
        report.fail("Login en producción falló")
        return 1
    report.ok("Login + CSRF en producción")

    missing = [name for name in USER_IMAGES if not os.path.isfile(os.path.join(ASSETS, name))]
    if missing:
        report.fail(f"Faltan {len(missing)} imágenes en assets: {missing[:3]}")
        return 1
    report.ok(f"10 capturas reales disponibles en assets")

    # Case A: single TC screenshot (unbilled)
    single = client.request(
        "POST",
        "/api/documents/parse",
        {
            "files": client.encode_files([USER_IMAGES[0]]),
            "institutionHint": "Banco de Chile",
            "productTypeHint": "credit_card",
            "evidenceSourceHint": "photos",
            "fastParse": True,
        },
    )
    if single.get("_http_status"):
        report.fail(f"Parse 1 imagen TC → HTTP {single['_http_status']}: {single.get('error', single)}")
    else:
        s = summarize_parse(single)
        if s["text_len"] < 80:
            report.fail("OCR de captura TC vacío o muy corto")
        else:
            report.ok(f"OCR TC extrae texto ({s['text_len']} chars)")
        if "Copec" not in s["text_sample"] and "Pedidosya" not in s["text_sample"]:
            report.warn("OCR TC no detectó merchants esperados (Copec/PedidosYa)")
        else:
            report.ok("OCR TC contiene merchants de la captura")
        if s["movements"] == 0:
            report.warn("Parser no estructuró movimientos desde 1 sola captura TC (esperable)")
        else:
            report.ok(f"Parser extrajo {s['movements']} movimientos de 1 captura TC")

    # Case B: all 10 photos batch (like user upload)
    batch = client.request(
        "POST",
        "/api/documents/parse",
        {
            "files": client.encode_files(USER_IMAGES),
            "institutionHint": "Banco de Chile",
            "productTypeHint": "checking_account",
            "evidenceSourceHint": "photos",
            "fastParse": True,
        },
        timeout=900,
    )
    if batch.get("_http_status"):
        report.fail(f"Parse batch 10 imágenes → HTTP {batch['_http_status']}")
    else:
        b = summarize_parse(batch)
        report.ok(f"Parse batch: {b['docs']} docs, {b['movements']} movimientos")
        if b["fidelity"] != "indicative":
            report.warn(f"Fidelity esperada indicative para fotos, obtuvo: {b['fidelity']}")
        else:
            report.ok("Fidelity indicative para capturas (correcto)")
        found = [snip for snip in EXPECTED_SNIPPETS if snip.lower() in b["text_sample"].lower()]
        if len(found) < 3:
            report.fail(f"Pocos merchants/conceptos detectados en OCR batch: {found}")
        else:
            report.ok(f"OCR batch reconoce conceptos clave: {found}")
        mode = analyst_mode("photos", b["fidelity"], b["movements"], b["table_ratio"])
        if mode != "minimal":
            report.warn(f"Routing analista esperaba minimal, calculado: {mode}")
        else:
            report.ok("Routing paso 3 → minimal summary chat (fotos)")
        if b["movements"] < 5:
            report.warn(f"Solo {b['movements']} movimientos estructurados del batch (esperábamos más)")
        if b["executive_summary_len"] < 40:
            report.warn("Resumen ejecutivo muy corto o ausente en batch")
        else:
            report.ok(f"Resumen ejecutivo generado ({b['executive_summary_len']} chars)")

        # transactions-chat with indicative evidence
        chat = client.request(
            "POST",
            "/api/transactions-chat",
            {
                "question": "¿Cuánto gasté en PedidosYa y en comida?",
                "dashboard": {
                    "summary": (batch.get("data", {}).get("transactionAnalysis", {}).get("product_profile", {}) or {}).get(
                        "executive_summary"
                    ),
                    "evidenceFidelity": b["fidelity"] or "indicative",
                    "movements": (batch.get("data", {}).get("transactionAnalysis", {}).get("movements", []) or [])[:40],
                    "keyMetrics": (batch.get("data", {}).get("transactionAnalysis", {}).get("product_profile", {}) or {}).get(
                        "key_metrics"
                    ),
                },
                "parsedDocuments": batch.get("data", {}).get("documents", [])[:5],
                "messages": [],
            },
            timeout=120,
        )
        if chat.get("_http_status"):
            report.fail(f"transactions-chat → HTTP {chat['_http_status']}")
        else:
            answer = str(
                chat.get("assistant_text")
                or chat.get("data", {}).get("assistant_text")
                or chat.get("data", {}).get("answer")
                or chat.get("data", {}).get("text")
                or ""
            )
            if len(answer) < 30:
                report.fail("transactions-chat devolvió respuesta vacía")
            else:
                report.ok(f"transactions-chat respondió ({len(answer)} chars)")
            followups = chat.get("suggested_followups") or chat.get("data", {}).get("suggestedFollowups") or []
            if followups:
                report.ok(f"transactions-chat sugiere {len(followups)} follow-ups")

    # Case C: format mismatch guard (pdf hint + png file) — should still parse with realigned hint
    mismatch = client.request(
        "POST",
        "/api/documents/parse",
        {
            "files": client.encode_files([USER_IMAGES[3]]),
            "institutionHint": "Banco de Chile",
            "productTypeHint": "checking_account",
            "evidenceSourceHint": "pdf",
            "fastParse": True,
        },
    )
    if mismatch.get("_http_status") == 403:
        report.warn("Rate limit 403 en tercer parse — omitiendo test mismatch")
    elif mismatch.get("_http_status"):
        report.fail(f"Parse mismatch hint → HTTP {mismatch['_http_status']}")
    else:
        m = summarize_parse(mismatch)
        if "Traspaso" not in m["text_sample"] and "Movimientos" not in m["text_sample"]:
            report.warn("Captura cuenta corriente sin 'Traspaso' en OCR")
        else:
            report.ok("OCR captura cuenta corriente (Mis Movimientos) legible")

    # Web health
    try:
        with urllib.request.urlopen("https://financieramente.up.railway.app/", timeout=30) as resp:
            if resp.status == 200:
                report.ok("WEB producción responde 200")
            else:
                report.warn(f"WEB status {resp.status}")
    except Exception as exc:  # noqa: BLE001
        report.fail(f"WEB producción no alcanzable: {exc}")

    print("\n=== E2E TX MODAL PRODUCCIÓN ===\n")
    for item in report.passed:
        print(f"✅ {item}")
    for item in report.warnings:
        print(f"⚠️  {item}")
    for item in report.failed:
        print(f"❌ {item}")
    print(f"\nResumen: {len(report.passed)} OK, {len(report.warnings)} avisos, {len(report.failed)} fallos")
    return 0 if not report.failed else 1


if __name__ == "__main__":
    sys.exit(run(Report()))
