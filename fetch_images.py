"""Download the food photos into web/img as small JPGs, so the site is fast and works offline."""
import io, json, pathlib, urllib.request
from PIL import Image

root = pathlib.Path(__file__).parent
txt = (root / "web" / "data" / "restaurant.js").read_text(encoding="utf-8-sig")
data = json.loads(txt.split("=", 1)[1].strip().rstrip(";"))
urls = [data["restaurant"]["media"]["hero"]] + [d["img"] for d in data["dishes"] if d.get("img")]
out = root / "web" / "img"
out.mkdir(exist_ok=True)
for u in urls:
    f = out / (u.split("/")[-1].rsplit(".", 1)[0] + ".jpg")
    if f.exists() and f.stat().st_size > 1000:
        continue
    try:
        raw = urllib.request.urlopen(u, timeout=60).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((2200, 2200) if im.width > im.height else (1100, 1100), Image.LANCZOS)
        im.save(f, "JPEG", quality=80, optimize=True, progressive=True)
        print("saved", f.name)
    except Exception as e:
        print("skip", f.name, e)
for old in out.glob("*.png"):
    try:
        old.unlink()
    except OSError:
        pass
print("images ready:", len(list(out.glob("*.jpg"))))
