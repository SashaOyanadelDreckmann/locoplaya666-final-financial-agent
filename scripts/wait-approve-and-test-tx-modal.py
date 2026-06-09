#!/usr/bin/env python3
"""Poll until account approved, then run TX modal production E2E."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import http.cookiejar

API = "https://locoplaya666-final-financial-agent-production.up.railway.app"
ASSETS = "/Users/locoplaya666/.cursor/projects/Users-locoplaya666-final-financial-agent/assets"
STATE_PATH = os.environ.get("SIM_STATE_PATH", "/tmp/sim_valentina-morales-1781008149_state.json")
POLL_SECONDS = 30
MAX_POLLS = 40

IMAGES = [
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


def load_state() -> dict:
    with open(STATE_PATH, encoding="utf-8") as handle:
        return json.load(handle)


class Client:
    def __init__(self) -> None:
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.csrf = ""

    def request(self, method: str, path: str, data: dict | None = None, timeout: int = 900) -> dict:
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
                parsed = {"raw": payload}
            parsed["_http_status"] = err.code
            return parsed

    def login(self, email: str, password: str) -> dict:
        return self.request("POST", "/auth/login", {"email": email, "password": password})

    def hydrate_csrf(self) -> None:
        session = self.request("GET", "/api/session")
        self.csrf = str(session.get("data", {}).get("csrfToken", "") or "")
        if not self.csrf:
            for cookie in self.cj:
                if cookie.name == "csrf-token":
                    self.csrf = cookie.value


def wait_for_approval(email: str, password: str) -> bool:
    client = Client()
    for attempt in range(1, MAX_POLLS + 1):
        result = client.login(email, password)
        status = result.get("_http_status")
        if result.get("ok"):
            print(f"[{attempt}] approved login ok")
            return True
        if status == 403:
            print(f"[{attempt}] pending approval...")
        else:
            print(f"[{attempt}] login unexpected: {result}")
        time.sleep(POLL_SECONDS)
    return False


def encode_images(names: list[str]) -> list[dict]:
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


def run_e2e(email: str, password: str) -> dict:
    client = Client()
    login = client.login(email, password)
    if not login.get("ok"):
        return {"ok": False, "step": "login", "detail": login}
    client.hydrate_csrf()

    product_id = "prod-bch-tc-modal-test"
    panel_state = {
        "bankSimulation": {
            "products": [
                {
                    "id": product_id,
                    "label": "Banco de Chile · Tarjeta de Crédito",
                    "bank": "Banco de Chile",
                    "productType": "credit_card",
                    "simulationAccepted": True,
                    "connected": True,
                    "randomMode": False,
                    "uploadedFiles": [],
                    "parsedDocuments": [],
                    "assistant": {"uploadFormat": "photos", "messages": []},
                }
            ],
            "activeProductId": product_id,
            "connected": True,
            "randomMode": False,
        },
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    save = client.request("POST", "/api/panel-state", {"panelState": panel_state})
    if not save.get("ok"):
        return {"ok": False, "step": "panel-state", "detail": save}

    parse = client.request(
        "POST",
        "/api/documents/parse",
        {
            "files": encode_images(IMAGES),
            "institutionHint": "Banco de Chile",
            "productTypeHint": "credit_card",
            "evidenceSourceHint": "photos",
            "fastParse": True,
        },
    )
    if parse.get("_http_status") or not parse.get("ok", True):
        return {"ok": False, "step": "parse", "detail": parse}

    analysis = parse.get("data", {}).get("transactionAnalysis", {})
    movements = analysis.get("movements", []) or []
    profile = analysis.get("product_profile", {}) or {}
    fidelity = profile.get("evidence_fidelity")

    chat = client.request(
        "POST",
        "/api/transactions-chat",
        {
            "question": "¿Cuánto gasté en PedidosYa y en comida?",
            "dashboard": {
                "summary": profile.get("executive_summary"),
                "evidenceFidelity": fidelity or "indicative",
                "movements": movements[:40],
                "keyMetrics": profile.get("key_metrics"),
            },
            "parsedDocuments": parse.get("data", {}).get("documents", [])[:5],
            "messages": [],
        },
        timeout=120,
    )

    answer = str(chat.get("assistant_text") or chat.get("data", {}).get("assistant_text") or "")
    concepts = []
    text_blob = " ".join((m.get("description") or "") for m in movements).lower()
    for token in ["copec", "pedidosya", "monto cancelado", "traspaso", "cursor"]:
        if token in text_blob:
            concepts.append(token)

    report = {
        "ok": len(movements) >= 5 and len(answer) >= 30,
        "movements": len(movements),
        "fidelity": fidelity,
        "concepts": concepts,
        "chat_chars": len(answer),
        "chat_preview": answer[:220],
        "sample_movements": movements[:5],
    }
    out = f"/tmp/tx_modal_e2e_{int(time.time())}.json"
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"report_saved={out}")
    return report


def main() -> int:
    state = load_state()
    email = state["email"]
    password = state["password"]
    print(f"waiting_approval email={email}")
    if not wait_for_approval(email, password):
        print("timeout waiting approval")
        return 1
    report = run_e2e(email, password)
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
