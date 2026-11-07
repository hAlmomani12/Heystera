"""Download the food photos into web/img so the site works offline (e.g. at a client meeting)."""
import json, pathlib, urllib.request
root = pathlib.Path(__file__).parent
txt = (root / "web" / "data" / "restaurant.js").read_text(encoding="utf-8-sig")
data = json.loads(txt.split("=", 1)[1].strip().rstrip(";"))
urls = [data["restaurant"]["media"]["hero"]] + [d["img"] for d in data["dishes"] if d.get("img")]
out = root / "web" / "img"; out.mkdir(exist_ok=True)
for u in urls:
    f = out / u.split("/")[-1]
    if f.exists() and f.stat().st_size > 1000:
        continue
    try:
        urllib.request.urlretrieve(u, f); print("saved", f.name)
    except Exception as e:
        print("skip", f.name, e)
print("images ready:", len(list(out.glob("*.png"))))
