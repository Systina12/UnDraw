"""Plot the fourteen Naiwa expressions and regenerate their README section."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

K13 = ("0.0769231", "0.153846", "0.230769", "0.307692", "0.384615", "0.461538", "0.538462", "0.615385", "0.692308", "0.769231", "0.846154", "0.923077")
K9 = ("0.111111", "0.222222", "0.333333", "0.444444", "0.555556", "0.666667", "0.777778", "0.888889")

@dataclass(frozen=True)
class Hinge:
    base: str
    slope: str
    coeff: tuple[str, ...]
    knots: tuple[str, ...] = K13

    def evaluate(self, t: np.ndarray) -> np.ndarray:
        result = float(self.base) + float(self.slope) * t
        for knot, coefficient in zip(self.knots, self.coeff, strict=True):
            result = result + float(coefficient) * np.abs(t - float(knot))
        return result

@dataclass(frozen=True)
class Polynomial:
    base: str
    center: str
    scale: str
    amplitude: str
    coeff: tuple[str, str, str, str]

    def evaluate(self, x: np.ndarray) -> np.ndarray:
        u = (x - float(self.center)) / float(self.scale)
        a, b, c, d = map(float, self.coeff)
        return float(self.base) + (a + (b + (c + d * u) * u) * u) * float(self.amplitude) * u

# Strings preserve exactly the numeric precision supplied with the expressions.
STROKES: list[tuple[Hinge, Hinge] | Polynomial] = [
    (
        Hinge("53.9359", "-99.2364", ("111.529", "306.817", "117.354", "0.867373", "25.9058", "-47.6153", "-6.12977", "-95.0591", "-78.8826", "91.362", "104.243", "36.7385")),
        Hinge("1380.97", "-536.103", ("-125.962", "-163.637", "126.599", "62.7068", "23.1575", "-103.784", "-68.2104", "-28.833", "-31.7102", "23.4519", "121.678", "98.7917")),
    ),
    Polynomial("1324.55", "316", "48", "30.5333", ("-1.3956", "1.39205", "0.321735", "-0.761374")),
    (
        Hinge("311.998", "-79.0489", ("47.6194", "-38.6335", "141.772", "-305.566", "39.5773", "58.4719", "-8.18482", "212.161", "130.889", "-151.675", "-79.1789", "-37.317")),
        Hinge("1648.62", "-13.6269", ("27.9794", "-11.5636", "-48.5726", "-198.031", "-106.709", "-6.33606", "-74.4178", "185.891", "39.3598", "-233.176", "-42.7723", "20.9109")),
    ),
    (
        Hinge("279.593", "-30.4415", ("10.4945", "-4.34977", "12.2719", "15.7576", "-7.02429", "22.3249", "-16.545", "-5.91554", "20.6892", "-12.7972", "-5.22066", "1.47688")),
        Hinge("1575.12", "-81.238", ("11.0662", "-20.7498", "-4.40576", "7.52514", "-7.17383", "6.10107", "-3.93133", "-1.40954"), K9),
    ),
    Polynomial("1611.74", "390.667", "88", "14.4667", ("0.521522", "-1.65774", "0.382199", "0.163053")),
    (
        Hinge("364.856", "-10.4403", ("10.2648", "12.4628", "11.6923", "34.7978", "11.9154", "-38.6258", "-185.959", "0.0360499", "22.1295", "20.7512", "8.65569", "10.4455")),
        Hinge("1594.78", "14.0296", ("-25.1712", "-9.61936", "-38.5272", "-56.0657", "47.7402", "-42.5689", "-10.9014", "-19.0415"), K9),
    ),
    (
        Hinge("843.362", "-375.336", ("-22.7404", "2.57224", "-37.3245", "17.4825", "367.306", "-276.033", "-148.383", "37.5475", "70.567", "31.9064", "-6.86857", "-118.746")),
        Hinge("1367.52", "225.446", ("-22.637", "2.20682", "-35.9662", "35.9487", "97.4056", "-103.685", "-41.4854", "-2.28306", "147.326", "-25.367", "1.32453", "-171.011")),
    ),
    (
        Hinge("724.784", "-493.509", ("77.3888", "5.76376", "94.0956", "251.054", "-16.6003", "95.3715", "-29.6313", "-125.497", "-19.0234", "-43.26", "-275.879", "-15.6878")),
        Hinge("1359.18", "89.8115", ("84.1538", "18.6533", "60.289", "-59.9609", "-20.7951", "-25.6173", "-143.185", "-126.893", "-62.5591", "-16.6457", "155.236", "175.477")),
    ),
    (
        Hinge("369.584", "116.535", ("4.95868", "-96.1895", "-65.8355", "19.3675", "14.6868", "0.923033", "32.2216", "138.023"), K9),
        Hinge("1425.51", "-39.8367", ("113.233", "139.403", "-53.5986", "-49.6338", "-45.9302", "-26.5289", "11.3202", "-14.8609", "-5.51966", "-6.68398", "-30.9166", "161.374")),
    ),
    (
        Hinge("401.652", "513.261", ("-74.5951", "127.315", "30.8381", "-25.7385", "-28.6006", "-90.3324", "-129.35", "-109.483", "-38.9354", "-55.5589", "102.372", "244.477")),
        Hinge("1588.5", "-158.932", ("-220.429", "152.459", "17.2127", "-54.6492", "-41.7267", "-21.5387", "-177.51", "-53.1188", "30.8688", "1.42679", "34.3697", "112.069")),
    ),
    Polynomial("1441.31", "677.333", "28", "15.2314", ("1.14606", "-0.251613", "-0.0509976", "0.291583")),
    (
        Hinge("902.106", "151.726", ("-38.7868", "-12.5459", "-3.19835", "-6.15551", "-29.4328", "-22.215", "-38.8924", "-45.718", "-30.8108", "-0.680062", "79.9211", "-6.27536")),
        Hinge("1189.03", "-484.285", ("37.9523", "-12.285", "-20.1871", "-48.5797", "-8.23727", "-10.9082", "-13.2368", "14.1293", "14.0498", "-0.0635502", "-33.0115", "2.57306")),
    ),
    (
        Hinge("462.37", "66.3094", ("61.0559", "-30.4957", "-37.0335", "-53.7258", "-7.00161", "-13.959", "-6.27327", "16.7247", "108.822", "16.3511", "0.0018964", "-13.1794")),
        Hinge("1421.01", "60.5068", ("-65.9323", "-7.14652", "-26.3451", "26.6996", "7.26969", "12.0795", "4.3956", "31.6545", "9.88336", "-25.6533", "3.52174", "0.705846")),
    ),
    Polynomial("1505.32", "449.333", "40", "14.4804", ("1.2974", "-0.537147", "-0.284273", "0.326374")),
]

def plot() -> None:
    plt.rcParams.update({"svg.fonttype": "none", "path.simplify": True, "font.size": 10})
    fig, ax = plt.subplots(figsize=(9, 10.5), dpi=150)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#f8fafc")
    for stroke in STROKES:
        if isinstance(stroke, Polynomial):
            c, s = float(stroke.center), float(stroke.scale)
            x = np.linspace(c - s, c + s, 160)
            y = stroke.evaluate(x)
        else:
            xf, yf = stroke
            t = np.array(sorted({0.0, 1.0, *(float(v) for v in xf.knots), *(float(v) for v in yf.knots)}))
            x, y = xf.evaluate(t), yf.evaluate(t)
        ax.plot(x, y, color="#195892", linewidth=2.35, solid_capstyle="round", solid_joinstyle="round")
    ax.set_xlim(0, 1010)
    ax.set_ylim(600, 1710)
    ax.set_aspect("equal", adjustable="box")
    ax.grid(color="#e6edf4", linewidth=0.7)
    ax.set_axisbelow(True)
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    fig.tight_layout()
    dest = Path(__file__).resolve().parent / "images" / "naiwa-equations.svg"
    fig.savefig(dest, format="svg", metadata={"Date": None})
    plt.close(fig)
    print(f"Wrote {dest}")

def signed(number: str, factor: str) -> str:
    sign = "-" if number.startswith("-") else "+"
    return f"{sign} {number.removeprefix('-')}\\cdot {factor}"

def hinge_latex(name: str, f: Hinge) -> str:
    terms = [signed(value, rf"\left|t-{knot}\right|") for knot, value in zip(f.knots, f.coeff, strict=True)]
    terms.append(signed(f.slope, "t"))
    rows = [rf"{name}(t)&= {f.base} " + " ".join(terms[:3])]
    for i in range(3, len(terms), 3):
        rows.append(r"&\quad " + " ".join(terms[i:i + 3]))
    return (r" \\" + "\n").join(rows)

def polynomial_latex(index: int, f: Polynomial) -> str:
    a, b, c, d = f.coeff
    u = rf"\frac{{-{f.center} + x}}{{{f.scale}}}"
    return (rf"y_{{{index}}}&={f.base} + "
            rf"\left({a} + \left({b} + \left({c} + {d}\cdot {u}\right)"
            rf"\cdot {u}\right)\cdot {u}\right)"
            rf"\cdot {f.amplitude}\cdot {u}")

def readme_section() -> str:
    sections = []
    for i, stroke in enumerate(STROKES, 1):
        if isinstance(stroke, Polynomial):
            formula = polynomial_latex(i, stroke)
            domain = f"x \\in [{float(stroke.center)-float(stroke.scale):g}, {float(stroke.center)+float(stroke.scale):g}]"
            sections.append(f"**第 {i} 段**（$\\displaystyle {domain}$）\n\n$$\n\\begin{{aligned}}\n{formula}\n\\end{{aligned}}\n$$")
        else:
            formula = hinge_latex("x", stroke[0]) + " \\\\\n" + hinge_latex("y", stroke[1])
            sections.append(f"**第 {i} 段**（$0 \\le t \\le 1$）\n\n$$\n\\begin{{aligned}}\n{formula}\n\\end{{aligned}}\n$$")
    return (
        "## 奶蛙表达式\n\n"
        "下面的图由 Python 按这 14 段表达式绘制。参数式取 $t \\in [0,1]$；"
        "四段 $y(x)$ 按原始归一化区间 $(x-x_c)/x_s \\in [-1,1]$ 绘制。\n\n"
        "![Python 绘制的奶蛙表达式](docs/images/naiwa-equations.svg)\n\n"
        "重绘：安装 `numpy` 和 `matplotlib` 后运行 `python docs/plot_naiwa.py`。\n\n"
        "<details>\n<summary>展开 14 段表达式</summary>\n\n"
        + "\n\n".join(sections)
        + "\n\n</details>\n\n"
    )

def update_readmes() -> None:
    root = Path(__file__).resolve().parents[1]
    chinese = root / "README.md"
    text = chinese.read_text(encoding="utf-8")
    marker = "## 奶蛙表达式\n"
    if marker in text:
        text = text[:text.index(marker)] + text[text.index("## 怎么玩\n", text.index(marker)):]
    anchor = "手绘输入 · 图片描边 · 拟合曲线\n\n"
    if text.count(anchor) != 1:
        raise ValueError("Chinese demo anchor missing or duplicated")
    chinese.write_text(text.replace(anchor, anchor + readme_section()), encoding="utf-8")

    english = root / "README.en.md"
    text = english.read_text(encoding="utf-8")
    marker = "## Naiwa equations\n"
    if marker in text:
        text = text[:text.index(marker)] + text[text.index("## How to use\n", text.index(marker)):]
    anchor = "Hand-drawn input · image tracing · fitted curves\n\n"
    if text.count(anchor) != 1:
        raise ValueError("English demo anchor missing or duplicated")
    section = ("## Naiwa equations\n\n"
               "Fourteen fitted strokes, plotted from the supplied coefficients with Python. "
               "See the [Chinese README](README.md#奶蛙表达式) for all equations.\n\n"
               "![Naiwa equations plotted with Python](docs/images/naiwa-equations.svg)\n\n"
               "To redraw, install `numpy` and `matplotlib`, then run `python docs/plot_naiwa.py`.\n\n")
    english.write_text(text.replace(anchor, anchor + section), encoding="utf-8")

if __name__ == "__main__":
    plot()
    update_readmes()
