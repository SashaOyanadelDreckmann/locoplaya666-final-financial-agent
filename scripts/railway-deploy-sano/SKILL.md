# railway-deploy-sano

Deploy seguro a Railway con sincronización previa, espera de estado terminal y healthcheck.

## Flujo obligatorio

1. Detectar rama actual (`git branch --show-current`)
2. `git fetch --all --prune`
3. `git pull --rebase --autostash origin <rama-actual>`
4. Si hay conflictos: detener y reportar archivos en conflicto (NO continuar)
5. `git push origin <rama-actual>`
6. `railway up --service <SERVICE_ID> --detach`
7. Esperar estado terminal del deployment: SUCCESS / FAILED / CRASHED / REMOVED
8. Si falla: mostrar causa raíz con `railway logs --build <deployment-id>`
9. Si SUCCESS: ejecutar healthcheck a `<HEALTH_URL>`; solo "sano" si responde 2xx

## Uso del script

```bash
~/.codex/skills/railway-deploy-sano/scripts/deploy_railway_safe.sh \
  --service <RAILWAY_SERVICE_ID> \
  --health-url <HEALTH_URL> \
  [--remote origin] \
  [--timeout-sec 900]
```

## Parámetros

| Parámetro       | Requerido | Default | Descripción                         |
|-----------------|-----------|---------|-------------------------------------|
| `--service`     | Sí        | —       | Railway service ID                  |
| `--health-url`  | Sí        | —       | URL para healthcheck (espera 2xx)   |
| `--remote`      | No        | origin  | Remote git a usar                   |
| `--timeout-sec` | No        | 900     | Segundos máx esperando deployment   |

## Respuesta siempre incluye

- Estado final del deployment (SUCCESS/FAILED/CRASHED/REMOVED/TIMEOUT)
- Deployment ID
- HTTP status code del healthcheck
- Veredicto: SANO / NO SANO

## Reglas

- NUNCA usar `git reset --hard`
- NUNCA continuar si hay conflictos de rebase
- El healthcheck solo pasa con código 2xx (200-299)
- Timeout por defecto: 15 minutos

## Variables de proyecto (locoplaya666-final-financial-agent)

```
RAILWAY_SERVICE_ID=203d29a0-15ce-4cad-8014-2ea06d3008ed
HEALTH_URL=https://locoplaya666-final-financial-agent-production.up.railway.app/health
```
