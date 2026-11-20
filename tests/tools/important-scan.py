# List every !important declaration in css/*.css with its selector, at-rule chain and property, plus the byte span of "!important".
import re, json, glob, sys
root = sys.argv[1]
out = []
for f in sorted(glob.glob(root + "/css/*.css")):
    src = open(f).read()
    # blank out comments, keep positions
    s = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), src, flags=re.S)
    stack = []  # list of preludes
    i = 0; start = 0; n = len(s); depth_paren = 0
    buf_start = 0
    while i < n:
        c = s[i]
        if c == '"' or c == "'":
            j = s.index(c, i + 1); i = j + 1; continue
        if c == '(':
            depth_paren += 1
        elif c == ')':
            depth_paren -= 1
        elif depth_paren == 0 and c == '{':
            prelude = s[buf_start:i].strip()
            stack.append(prelude); buf_start = i + 1
        elif depth_paren == 0 and c == '}' or (depth_paren == 0 and c == ';'):
            decl = s[buf_start:i]
            if stack and not stack[-1].startswith("@") and "!important" in decl:
                sel = stack[-1]; chain = [p for p in stack[:-1]]
                in_kf = any(p.startswith("@keyframes") for p in chain)
                m = re.match(r"\s*([-\w]+)\s*:", decl)
                pos = buf_start + decl.index("!important")
                out.append({"file": f.split("/")[-1], "sel": sel, "chain": chain, "prop": m.group(1) if m else None,
                            "pos": pos, "kf": in_kf, "line": src.count("\n", 0, pos) + 1})
            if c == '}':
                if stack: stack.pop()
            buf_start = i + 1
        i += 1
json.dump(out, open(sys.argv[2] if len(sys.argv) > 2 else "decls.json", "w"), indent=0)
print(len(out), sum(1 for d in out if d["kf"]))
