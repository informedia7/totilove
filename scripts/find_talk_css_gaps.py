import re
from pathlib import Path

def collect_classes_from_css(css_text: str) -> set[str]:
    classes = set(re.findall(r"\.([A-Za-z0-9_-]+)", css_text))
    skip_prefixes = ("hover", "active", "focus", "before", "after", "dark-mode", "light-mode")
    return {cls for cls in classes if not cls.startswith(skip_prefixes)}

def collect_classes_from_html(html_text: str) -> set[str]:
    classes = set()
    skip = {"active"}
    for match in re.findall(r'class="([^"]+)"', html_text):
        for cls in match.split():
            cls_name = cls.strip()
            if cls_name and cls_name not in skip:
                classes.add(cls_name)
    return classes

def main():
    css_path = Path(r"c:/Totilove_split01-Copy/app/assets/css/new/05-pages/_talk-responsive.css")
    html_path = Path(r"c:/Totilove_split01-Copy/app/pages/talk.html")
    css_classes = collect_classes_from_css(css_path.read_text(encoding="utf-8"))
    html_classes = collect_classes_from_html(html_path.read_text(encoding="utf-8"))
    missing = sorted(c for c in html_classes if c and c not in css_classes)
    print(f"Missing {len(missing)} classes from CSS:")
    for cls in missing:
        print(cls)

if __name__ == "__main__":
    main()
