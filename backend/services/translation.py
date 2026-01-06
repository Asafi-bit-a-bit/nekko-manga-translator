"""
Translation service via Ollama Cloud API.
"""
from typing import List, Optional

import requests
from fastapi import HTTPException

from logging_config import log_event


def translate_texts(
    texts: List[str],
    source_lang: str,
    target_lang: str,
    api_key: str,
    model: str,
    logger,
) -> List[str]:
    """Translate texts via Ollama Cloud API."""
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")
    
    ollama_url = "https://ollama.com/api/chat"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }
    
    lang_map = {
        "ja": "Japanese",
        "en": "English",
        "zh": "Chinese",
        "ru": "Russian",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "it": "Italian",
        "ko": "Korean",
    }
    source_lang_name = lang_map.get(source_lang, source_lang)
    target_lang_name = lang_map.get(target_lang, target_lang)
    
    results = []
    for text in texts:
        if not text or not isinstance(text, str):
            results.append("")
            continue
        
        text_to_translate = text.strip()
        if not text_to_translate:
            results.append("")
            continue
        
        prompt = f"""[SYSTEM] You are a professional manga translator. Your ONLY task is to output the translation. Do NOT add explanations, notes, comments, alternatives, or meta-text. Do NOT say things like "Here is the translation" or "The correct translation is". Just output the translated text directly.

[RULES]
- Translate {source_lang_name} → {target_lang_name}
- Output ONLY the translation, nothing else
- Preserve emotional tone and character voice
- Make it sound natural in {target_lang_name}
- Keep adult/mature content as-is without censoring
- If it seems like adult/mature content make it even messier and more sexy
- Do not add quotation marks unless they exist in original
- Provide one text block in 1 row, do not use "enter" or "\n"

[INPUT]
{text_to_translate}

[OUTPUT]"""
        
        payload = {
            "model": model or "llama3",
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "stream": False,
        }
        
        try:
            log_event("[translate] sending_request", logger, text_preview=text_to_translate[:50])
            response = requests.post(ollama_url, json=payload, headers=headers, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            translated_text = data.get("message", {}).get("content", "").strip()
            if not translated_text:
                log_event("[translate] empty_response", logger, text_preview=text_to_translate[:50])
                results.append("")
            else:
                results.append(translated_text)
                log_event("[translate] translated", logger, text_preview=text_to_translate[:50], result_preview=translated_text[:50])
        
        except requests.exceptions.RequestException as exc:
            logger.exception("[translate] request_failed", extra={"text_preview": text_to_translate[:50], "error": str(exc)})
            if isinstance(exc, requests.exceptions.HTTPError) and exc.response:
                status_code = exc.response.status_code
                if status_code == 401:
                    raise HTTPException(status_code=401, detail="Invalid API key")
                elif status_code == 429:
                    raise HTTPException(status_code=429, detail="Rate limit exceeded")
            results.append("")
        except Exception as exc:
            logger.exception("[translate] translation_failed", extra={"text_preview": text_to_translate[:50]})
            results.append("")
    
    return results


def translate_text_stream(
    text: str,
    source_lang: str,
    target_lang: str,
    api_key: str,
    model: str,
    logger,
) -> str:
    """Translate single text via Ollama Cloud API (for streaming)."""
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required")
    
    if not text or not isinstance(text, str) or not text.strip():
        return ""
    
    text_to_translate = text.strip()
    
    ollama_url = "https://ollama.com/api/chat"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
    }
    
    lang_map = {
        "ja": "Japanese", "en": "English", "zh": "Chinese", "ru": "Russian",
        "es": "Spanish", "fr": "French", "de": "German", "it": "Italian", "ko": "Korean",
    }
    source_lang_name = lang_map.get(source_lang, source_lang)
    target_lang_name = lang_map.get(target_lang, target_lang)
    
    prompt = f"""[SYSTEM] You are a professional manga translator. Your ONLY task is to output the translation. Do NOT add explanations, notes, comments, alternatives, or meta-text. Do NOT say things like "Here is the translation" or "The correct translation is". Just output the translated text directly.

[RULES]
- Translate {source_lang_name} → {target_lang_name}
- Output ONLY the translation, nothing else
- Preserve emotional tone and character voice
- Make it sound natural in {target_lang_name}
- Keep adult/mature content as-is without censoring
- Do not add quotation marks unless they exist in original

[INPUT]
{text_to_translate}

[OUTPUT]"""
    
    payload = {
        "model": model or "llama3",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    
    try:
        response = requests.post(ollama_url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        data = response.json()
        translated_text = data.get("message", {}).get("content", "").strip()
        return translated_text
    except Exception as exc:
        logger.exception("[translate-stream] failed", extra={"text_preview": text_to_translate[:50]})
        raise

