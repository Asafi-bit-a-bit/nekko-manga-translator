#!/usr/bin/env python3
"""
Launch configurator for webui (no external deps).
- Manages WEBUI_AUTO_MODE (auto_fix | verify_first) and WEBUI_SHOW_PROGRESS (0|1) in webui.bat/.sh.
- Stores language choice in .launch_config.json (en/ru/zh).
- Marker of first run: backend/.venv/.first_fix_done.
"""

from __future__ import annotations
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Dict, Tuple

ROOT = Path(__file__).resolve().parent
BAT_PATH = ROOT / "webui.bat"
SH_PATH = ROOT / "webui.sh"
MARKER = ROOT / "backend" / ".venv" / ".first_fix_done"
CONFIG_PATH = ROOT / ".launch_config.json"

ANSI_RED = "\033[31m"
ANSI_RESET = "\033[0m"

LANGS: Dict[str, Dict[str, str]] = {
    "en": {
        "title": "=== WebUI Launch Configurator ===",
        "mode_label": "Launch mode",
        "mode_verify": "verify first",
        "mode_fix": "auto-fix on launch",
        "progress": "Progress bar",
        "progress_on": "on",
        "progress_off": "off",
        "marker": "First-run marker",
        "marker_yes": "present",
        "marker_no": "absent",
        "opt_mode": "Toggle launch mode",
        "opt_progress": "Toggle progress",
        "opt_reset": "Remove first-run marker",
        "opt_lang": "Change language / Изменить язык / 更改语言",
        "opt_exit": "Exit",
        "press_q": "Press q (or Esc) to exit",
        "choose_lang": "Choose language",
        "langs": {"en": "English", "ru": "Русский", "zh": "中文"},
    },
    "ru": {
        "title": "=== Конфигуратор запуска webui ===",
        "mode_label": "Режим запуска",
        "mode_verify": "проверка",
        "mode_fix": "авто-фикс",
        "progress": "Прогресс-бар",
        "progress_on": "включен",
        "progress_off": "выключен",
        "marker": "Отметка первого запуска",
        "marker_yes": "есть",
        "marker_no": "нет",
        "opt_mode": "Режим запуска",
        "opt_progress": "Показ прогресс-баров",
        "opt_reset": "Удалить отметку о первом запуске",
        "opt_lang": "Change language / Изменить язык / 更改语言",
        "opt_exit": "Выход",
        "press_q": "Нажмите q (или Esc) для выхода",
        "choose_lang": "Выберите язык",
        "langs": {"en": "English", "ru": "Русский", "zh": "中文"},
    },
    "zh": {
        "title": "=== WebUI 启动配置 ===",
        "mode_label": "启动模式",
        "mode_verify": "先检查，失败时自动修复",
        "mode_fix": "启动时自动修复",
        "progress": "进度条",
        "progress_on": "开启",
        "progress_off": "关闭",
        "marker": "首次运行标记",
        "marker_yes": "有",
        "marker_no": "无",
        "opt_mode": "切换启动模式",
        "opt_progress": "切换进度条",
        "opt_reset": "删除首次运行标记",
        "opt_lang": "Change language / Изменить язык / 更改语言",
        "opt_exit": "退出",
        "press_q": "按 q（或 Esc）退出",
        "choose_lang": "选择语言",
        "langs": {"en": "English", "ru": "Русский", "zh": "中文"},
    },
}

EXIT_KEYS = {"q", "\x1b"}  # q or Esc


def load_settings() -> Tuple[str, str]:
    auto_mode = "verify_first"
    show_progress = "1"
    if BAT_PATH.exists():
        text = BAT_PATH.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r'set\s+"WEBUI_AUTO_MODE=([^"]+)"', text, re.IGNORECASE)
        if m:
            auto_mode = m.group(1).strip()
        m = re.search(r'set\s+"WEBUI_SHOW_PROGRESS=([^"]+)"', text, re.IGNORECASE)
        if m:
            show_progress = m.group(1).strip()
    elif SH_PATH.exists():
        text = SH_PATH.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r'WEBUI_AUTO_MODE=.*?-?([A-Za-z_]+)"?\}?', text)
        if m:
            auto_mode = m.group(1).strip()
        m = re.search(r'WEBUI_SHOW_PROGRESS=.*?([01])', text)
        if m:
            show_progress = m.group(1).strip()
    if auto_mode not in {"auto_fix", "verify_first"}:
        auto_mode = "verify_first"
    if show_progress not in {"0", "1"}:
        show_progress = "1"
    return auto_mode, show_progress


def replace_or_prepend(content: str, key: str, value: str, is_bat: bool) -> str:
    if is_bat:
        pattern = re.compile(rf'^set\s+"{key}=.*"$', re.IGNORECASE | re.MULTILINE)
        line = f'set "{key}={value}"'
        newline = "\r\n"
    else:
        pattern = re.compile(rf'^{key}=.*$', re.MULTILINE)
        line = f'{key}="${{{key}:-{value}}}"'
        newline = "\n"
    if pattern.search(content):
        return pattern.sub(line, content, count=1)
    return line + newline + content


def write_settings(auto_mode: str, show_progress: str) -> None:
    if BAT_PATH.exists():
        content = BAT_PATH.read_text(encoding="utf-8", errors="ignore")
        content = replace_or_prepend(content, "WEBUI_AUTO_MODE", auto_mode, True)
        content = replace_or_prepend(content, "WEBUI_SHOW_PROGRESS", show_progress, True)
        BAT_PATH.write_text(content, encoding="utf-8")
    if SH_PATH.exists():
        content = SH_PATH.read_text(encoding="utf-8", errors="ignore")
        content = replace_or_prepend(content, "WEBUI_AUTO_MODE", auto_mode, False)
        content = replace_or_prepend(content, "WEBUI_SHOW_PROGRESS", show_progress, False)
        SH_PATH.write_text(content, encoding="utf-8")


def delete_marker() -> None:
    try:
        MARKER.unlink()
    except FileNotFoundError:
        pass
    except Exception:
        pass


def load_lang() -> str:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("lang") in LANGS:
                return data["lang"]
        except Exception:
            pass
    return "en"


def save_lang(lang: str) -> None:
    try:
        CONFIG_PATH.write_text(json.dumps({"lang": lang}), encoding="utf-8")
    except Exception:
        pass


def choose_language(current: str) -> str:
    clear_screen()
    render_logo()
    print("=== Language / Язык / 语言 ===")
    for idx, code in enumerate(LANGS.keys(), start=1):
        print(f"{idx}. {LANGS[code]['langs'].get(code, code)} ({code})")
    choice = input(f"[{current}] > ").strip()
    if choice.isdigit():
        idx = int(choice) - 1
        codes = list(LANGS.keys())
        if 0 <= idx < len(codes):
            return codes[idx]
    if choice in LANGS:
        return choice
    return current


def get_key() -> str:
    if os.name == "nt":
        import msvcrt
        while True:
            ch = msvcrt.getch()
            if ch in (b"\x00", b"\xe0"):
                ch = msvcrt.getch()
                return {b"H": "UP", b"P": "DOWN"}.get(ch, "")
            if ch in (b"\r", b"\n"):
                return "ENTER"
            try:
                dec = ch.decode()
            except Exception:
                continue
            if dec.lower() in EXIT_KEYS:
                return "EXIT"
            if dec.isdigit():
                return dec
    else:
        import termios, tty, select
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            while True:
                r, _, _ = select.select([fd], [], [], 0.1)
                if fd not in r:
                    continue
                ch = sys.stdin.read(1)
                if ch == "\x1b":
                    seq = sys.stdin.read(2)
                    if seq == "[A":
                        return "UP"
                    if seq == "[B":
                        return "DOWN"
                    return "EXIT"
                if ch in ("\r", "\n"):
                    return "ENTER"
                if ch.lower() in EXIT_KEYS:
                    return "EXIT"
                if ch.isdigit():
                    return ch
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
    return ""


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def exit_message(lang: str) -> None:
    script_name = "webui.bat" if os.name == "nt" else "./webui.sh"
    msg = LANGS[lang]["press_q"] if lang in LANGS else LANGS["en"]["press_q"]
    for i in range(5, 0, -1):
        clear_screen()
        print(f"{ANSI_RED}{msg}: {script_name} (closing in {i}s){ANSI_RESET}")
        time.sleep(1)


def render_logo():
    print("""
ooooo      ooo           oooo        oooo                       ooo        ooooo ooooooooooooo 
`888b.     `8'           `888        `888                       `88.       .888' 8'   888   `8 
 8 `88b.    8   .ooooo.   888  oooo   888  oooo   .ooooo.        888b     d'888       888      
 8   `88b.  8  d88' `88b  888 .8P'    888 .8P'   d88' `88b       8 Y88. .P  888       888      
 8     `88b.8  888ooo888  888888.     888888.    888   888       8  `888'   888       888      
 8       `888  888    .o  888 `88b.   888 `88b.  888   888       8    Y     888       888      
o8o        `8  `Y8bod8P' o888o o888o o888o o888o `Y8bod8P'      o8o        o888o     o888o     
          """)


def main() -> int:
    lang = load_lang()
    if not CONFIG_PATH.exists():
        lang = choose_language(lang)
        save_lang(lang)
    idx = 0
    while True:
        strings: Dict[str, str] = LANGS.get(lang, LANGS["en"])
        auto_mode, show_progress = load_settings()
        marker_exists = MARKER.exists()
        mode_label = strings["mode_verify"] if auto_mode == "verify_first" else strings["mode_fix"]
        progress_label = strings["progress_on"] if show_progress == "1" else strings["progress_off"]

        clear_screen()
        render_logo()
        print(strings["title"])
        print(f"{strings['mode_label']}: {mode_label}")
        print(f"{strings['progress']}: {progress_label}")
        print(f"{strings['marker']}: {strings['marker_yes'] if marker_exists else strings['marker_no']}")
        print()

        opts_display = [
            f"{strings['opt_mode']}: {mode_label}",
            f"{strings['opt_progress']}: {progress_label}",
            strings["opt_reset"],
            strings["opt_lang"],
            f"{strings['opt_exit']} (q)",
        ]
        for i, opt in enumerate(opts_display, start=1):
            pointer = ">" if (i - 1) == idx else " "
            print(f" {pointer} {i}. {opt}")
        print()
        print(strings["press_q"])

        key = get_key()
        if key == "UP":
            idx = (idx - 1) % len(opts_display)
            continue
        if key == "DOWN":
            idx = (idx + 1) % len(opts_display)
            continue
        if key and key.isdigit():
            num = int(key)
            if 1 <= num <= len(opts_display):
                idx = num - 1
                key = "ENTER"
        if key == "EXIT":
            break
        if key != "ENTER":
            continue

        if idx == 0:
            new_mode = "auto_fix" if auto_mode == "verify_first" else "verify_first"
            write_settings(new_mode, show_progress)
            if new_mode == "auto_fix":
                delete_marker()
            continue
        if idx == 1:
            new_val = "0" if show_progress == "1" else "1"
            write_settings(auto_mode, new_val)
            continue
        if idx == 2:
            delete_marker()
            continue
        if idx == 3:
            lang = choose_language(lang)
            save_lang(lang)
            continue
        if idx == 4:
            break

    exit_message(lang)
    return 0


if __name__ == "__main__":
    sys.exit(main())
