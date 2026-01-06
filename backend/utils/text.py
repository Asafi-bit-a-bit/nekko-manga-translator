"""
Text processing utilities for OCR and translation.
"""
import re
import unicodedata
from typing import Optional


def is_punctuation_only(text: str) -> bool:
    """
    Check if text contains only punctuation marks (Unicode punctuation category).
    
    Args:
        text: Input text to check
        
    Returns:
        True if text contains only punctuation, False otherwise
    """
    if not text or not text.strip():
        return False
    
    # Remove whitespace for checking
    text_no_ws = text.replace(' ', '').replace('\n', '').replace('\t', '')
    if not text_no_ws:
        return False
    
    # Check if all characters are punctuation
    for char in text_no_ws:
        if unicodedata.category(char)[0] != 'P':  # 'P' is the category for punctuation
            return False
    
    return True


def normalize_punctuation(text: str) -> str:
    """
    Normalize punctuation marks in text.
    
    Rules:
    - Multiple dots: "..", ". . .", ". ..", "…" → "..."
    - Question + exclamation: " ?  !", "?!?", "!?" → "?!"
    - Remove extra spaces around punctuation: " ? " → "?"
    - Normalize quotes: " " → " " or « » (depending on context)
    - Normalize dashes: "-" → "—" (where appropriate)
    
    Args:
        text: Input text to normalize
        
    Returns:
        Normalized text
    """
    if not text:
        return text
    
    # Normalize ellipsis: various forms to "..."
    # Match: .., . . ., . .., …, etc.
    text = re.sub(r'\.{2,}', '...', text)  # Multiple dots
    text = re.sub(r'\.\s*\.\s*\.', '...', text)  # Dots with spaces
    text = re.sub(r'…', '...', text)  # Unicode ellipsis
    
    # Normalize question + exclamation: " ?  !", "?!?", "!?" → "?!"
    text = re.sub(r'\s*\?\s*!\s*', '?!', text)
    text = re.sub(r'\s*!\s*\?\s*', '?!', text)
    text = re.sub(r'\?{2,}!*', '?!', text)  # Multiple ? followed by !
    text = re.sub(r'!{2,}\?*', '?!', text)  # Multiple ! followed by ?
    
    # Remove extra spaces around punctuation marks
    # Match: " ? ", " ! ", " . ", etc.
    text = re.sub(r'\s+([?!.,:;])', r'\1', text)  # Space before punctuation
    text = re.sub(r'([?!.,:;])\s+', r'\1', text)  # Space after punctuation
    
    # Normalize quotes (keep as-is for now, can be enhanced based on language)
    # " " → " " (straight quotes to curly quotes if needed)
    # This can be language-specific, so leaving for now
    
    # Normalize dashes: single dash to em dash in certain contexts
    # Only replace if surrounded by spaces or at start/end
    text = re.sub(r'\s-\s', ' — ', text)  # Space-dash-space → em dash
    text = re.sub(r'^-\s', '— ', text)  # Start with dash
    text = re.sub(r'\s-$', ' —', text)  # End with dash
    
    return text.strip()


def should_translate(text: str) -> bool:
    """
    Check if text should be sent for translation.
    
    Text should NOT be translated if:
    - It's empty or only whitespace
    - It contains only punctuation marks
    
    Args:
        text: Input text to check
        
    Returns:
        True if text should be translated, False otherwise
    """
    if not text or not text.strip():
        return False
    
    if is_punctuation_only(text):
        return False
    
    return True

