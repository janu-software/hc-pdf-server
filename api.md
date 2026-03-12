# API manuál

Base URL je standardně `https://pdf.cloud.good-agency.cz`.

Pokud je nastavené `HCPDF_BEARER_AUTH_SECRET_KEY`, všechny endpointy vyžadují hlavičku:

```http
Authorization: Bearer <token>
```

## Přehled endpointů

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/hc` | Healthcheck |
| `GET` | `/` | Vygeneruje PDF z URL |
| `POST` | `/` | Vygeneruje PDF z HTML |
| `GET` | `/pdf_options` | Vrátí dostupné PDF presety |
| `GET` | `/screenshot` | Vygeneruje PNG screenshot z URL |
| `POST` | `/screenshot` | Vygeneruje PNG screenshot z HTML |

## 1. `GET /hc`

Jednoduchý healthcheck endpoint.

### Odpověď

- `200 OK`
- tělo: `ok`
- hlavička: `X-Version: <verze aplikace>`

### Příklad

```bash
curl https://pdf.cloud.good-agency.cz/hc
```

## 2. `GET /`

Vygeneruje PDF z cílové URL.

### Query parametry

| Parametr | Typ | Povinný | Popis |
| --- | --- | --- | --- |
| `url` | `string` | ano | URL stránky, která se má vyrenderovat do PDF |
| `pdf_option` | `string` | ne | Název PDF presetu; pokud chybí, použije se výchozí preset |
| `wait_for_ready` | `string` | ne | Pokud je poslaný, server čeká na selektor `html[data-pdf-ready="true"]` |

### Chování

- Pokud request obsahuje hlavičku `Cookie`, server ji přepošle do cílové stránky.
- Render čeká na `networkidle0`.
- Při `wait_for_ready` je navíc timeout 30 sekund na objevení `html[data-pdf-ready="true"]`.

### Úspěšná odpověď

- `200 OK`
- `Content-Type: application/pdf`

### Chybové odpovědi

- `400 Bad Request` když chybí `url`
- `500 Internal Server Error` při chybě renderu nebo načtení stránky

### Příklad

```bash
curl "https://pdf.cloud.good-agency.cz/?url=https://example.com" -o output.pdf
```

S presetem:

```bash
curl "https://pdf.cloud.good-agency.cz/?url=https://example.com&pdf_option=A4" -o output.pdf
```

S čekáním na připravenost stránky:

```bash
curl "https://pdf.cloud.good-agency.cz/?url=https://example.com/invoice&wait_for_ready=1" -o output.pdf
```

## 3. `POST /`

Vygeneruje PDF přímo z poslaného HTML.

### Body parametry

| Parametr | Typ | Povinný | Popis |
| --- | --- | --- | --- |
| `html` | `string` | ano | HTML dokument k vyrenderování |
| `pdf_option` | `string` | ne | Název PDF presetu |
| `wait_for_ready` | `boolean \| string` | ne | Pokud je poslaný, server po načtení HTML čeká na ready selector |
| `ready_selector` | `string` | ne | CSS selector, na který má server čekat; výchozí je `html[data-pdf-ready="true"]` |
| `base_url` | `string` | ne | Base URL použitá pro relativní `src` a `href` v HTML |

Server má registrovaný `@fastify/formbody`, takže funguje `application/x-www-form-urlencoded`. Fastify zároveň umí i JSON body.

### Chování

- HTML se načte přes `page.setContent(..., { waitUntil: 'domcontentloaded' })`.
- Server potom čeká na dokončení obrázků a fontů v dokumentu.
- Pokud je vyplněné `wait_for_ready`, server navíc čeká na selector z `ready_selector`.
- Proxy nastavená pro Chromium se použije i pro assety načítané z HTML, například obrázky, CSS, fonty nebo iframe.
- Pokud `base_url` chybí, relativní cesty v HTML se nemusí vyhodnotit správně.

### Úspěšná odpověď

- `200 OK`
- `Content-Type: application/pdf`

### Chybové odpovědi

- `400 Bad Request` když chybí body
- `400 Bad Request` když je `html` prázdné
- `500 Internal Server Error` při chybě renderu

### Příklad JSON

```bash
curl https://pdf.cloud.good-agency.cz/ \
  -H 'Content-Type: application/json' \
  -d '{"html":"<html><body><h1>Test</h1></body></html>","pdf_option":"A4"}' \
  -o output.pdf
```

### Příklad JSON s ready selectorem a base URL

```bash
curl https://pdf.cloud.good-agency.cz/ \
  -H 'Content-Type: application/json' \
  -d '{"html":"<html data-pdf-ready=\"true\"><body><img src=\"/logo.png\"><h1>Test</h1></body></html>","pdf_option":"A4","wait_for_ready":true,"ready_selector":"html[data-pdf-ready=\"true\"]","base_url":"https://app.example.com"}' \
  -o output.pdf
```

### Příklad form body

```bash
curl https://pdf.cloud.good-agency.cz/ \
  --data-urlencode 'html=<html><body><h1>Test</h1></body></html>' \
  --data-urlencode 'pdf_option=A4' \
  -o output.pdf
```

## 4. `GET /pdf_options`

Vrátí mapu dostupných PDF presetů.

### Úspěšná odpověď

- `200 OK`
- `Content-Type: application/json; charset=utf-8`

### Výchozí presety

- `DEFAULT`
- `A4`
- `A3`
- `A4L`
- `A3L`
- `A4Full`
- `A4LandscapeFull`

### Příklad

```bash
curl https://pdf.cloud.good-agency.cz/pdf_options
```

## 5. `GET /screenshot`

Vygeneruje PNG screenshot z URL.

### Query parametry

| Parametr | Typ | Povinný | Popis |
| --- | --- | --- | --- |
| `url` | `string` | ano | Cílová URL |
| `w` | `string` | ne | Šířka viewportu/clipu v px |
| `h` | `string` | ne | Výška viewportu/clipu v px |

### Chování

- Pokud jsou poslané `w` i `h`, server nastaví viewport a vrátí oříznutý screenshot dané velikosti.
- Pokud `w` a `h` chybí, vrací full-page screenshot.
- Po načtení stránky se server pokusí automaticky potvrdit běžné cookie lišty s německými texty typu `Akzeptieren`, `Alle akzeptieren`, `OK`.

### Úspěšná odpověď

- `200 OK`
- `Content-Type: image/png`

### Chybové odpovědi

- `400 Bad Request` když chybí `url`
- `500 Internal Server Error` při chybě renderu

### Příklad

```bash
curl "https://pdf.cloud.good-agency.cz/screenshot?url=https://example.com" -o screenshot.png
```

S pevnou velikostí:

```bash
curl "https://pdf.cloud.good-agency.cz/screenshot?url=https://example.com&w=1440&h=900" -o screenshot.png
```

## 6. `POST /screenshot`

Vygeneruje PNG screenshot z poslaného HTML.

### Body parametry

| Parametr | Typ | Povinný | Popis |
| --- | --- | --- | --- |
| `html` | `string` | ano | HTML dokument |
| `w` | `string` | ne | Šířka viewportu/clipu v px |
| `h` | `string` | ne | Výška viewportu/clipu v px |

### Chování

- Pokud jsou `w` a `h` vyplněné, screenshot je oříznutý na zadané rozměry.
- Jinak se vrací full-page screenshot.

### Úspěšná odpověď

- `200 OK`
- `Content-Type: image/png`

### Chybové odpovědi

- `400 Bad Request` když chybí body
- `400 Bad Request` když je `html` prázdné
- `500 Internal Server Error` při chybě renderu

### Příklad

```bash
curl https://pdf.cloud.good-agency.cz/screenshot \
  -H 'Content-Type: application/json' \
  -d '{"html":"<html><body><h1>Hello</h1></body></html>","w":"1280","h":"720"}' \
  -o screenshot.png
```

## Poznámky k presetům PDF

Endpointy `GET /` a `POST /` používají interní preset loader.

- Pokud `pdf_option` neexistuje, server spadne zpět na výchozí PDF options.
- Výchozí preset je řízený proměnnou `HCPDF_DEFAULT_PRESET_PDF_OPTIONS_NAME`.
- Cesta k souboru presetů je řízená proměnnou `HCPDF_PRESET_PDF_OPTIONS_FILE_PATH`.

## Typické response hlavičky pro binární výstup

PDF i screenshot endpointy vracejí navíc:

- `Content-Length`
- `Cache-Control: no-cache, no-store, must-revalidate`
- `Pragma: no-cache`
- `Expires: 0`
