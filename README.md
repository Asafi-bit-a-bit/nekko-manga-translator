# Nekko Manga Translator

Локальный инструмент, который помогает переводить мангу: загружаете страницы, находите текстовые области, получаете распознанный текст, редактируете и экспортируете.

## Как работает
1. Загружаете страницы.
2. Детектор находит пузыри/области текста (RT-DETR).
3. Можно подправить области перед распознаванием.
4. OCR: manga-ocr (японский) или PaddleOCR-VL-For-Manga (много языков).
5. Текст редактируется и экспортируется для перевода.

## Модели
- comic-text-and-bubble-detector — детектор пузырей/текста (RT-DETR).
- manga-ocr через comic-translate — OCR для японского.
- PaddleOCR-VL-For-Manga — OCR для разных языков (на macOS не работает).

## Предупреждение
- Проект сырой и написан начинающим программистом.
- Интерфейс и API могут меняться.
- Не все зависимости будут поддерживаться дальше.
- PaddleOCR-VL-For-Manga не работает на продуктах apple — используйте manga-ocr.

## Установка
Установите Python 3.10.6.

# Windows
Запустите `webui.bat` из папки проекта.

# Linux/macOS
Запустите в терминале в папке проекта  
```bash
./webui.sh
```

Скрипт сам установит Git, Git LFS и Node.js при необходимости, скачает модели, запустит серверы и откроет браузер.
Если страница не открылась, перейдите на `http://localhost:5173`.

Примечания:
- Не запускайте `webui.bat` от имени администратора.
- На первом запуске возможен запрос прав администратора для установки Git/Node.
- В России для скачивания МОЖЕТ понадобиться VPN (но рекомендуется избегать его применение)

## Кредиты
- ogkalu — comic-text-and-bubble-detector: https://huggingface.co/ogkalu/comic-text-and-bubble-detector
- jzhang533 — PaddleOCR-VL-For-Manga: https://huggingface.co/jzhang533/PaddleOCR-VL-For-Manga
- ogkalu2 — comic-translate (manga-ocr): https://github.com/ogkalu2/comic-translate