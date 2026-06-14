"""Benchmark the fine-tuned Qwen3.6-35B-A3B LoRA on the held-out test.jsonl.
Code-exact-match against gold (same format+find task the live pipeline uses).
Run in forge-opt-venv on squaredcube1, cwd ~/hx-finetune."""
import json, re, time, torch
from unsloth import FastLanguageModel

model, tok = FastLanguageModel.from_pretrained(
    "hx-coder-lora", max_seq_length=2048, load_in_4bit=True, dtype=None,
)
FastLanguageModel.for_inference(model)

# Qwen3.6 loads a multimodal PROCESSOR; the text tokenizer is at .tokenizer.
TOK = getattr(tok, "tokenizer", tok)

rows = [json.loads(l) for l in open("test.jsonl", encoding="utf-8")]

def gen(msgs):
    text = TOK.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False)
    enc = TOK(text, return_tensors="pt")
    ids = enc.input_ids.to("cuda")
    with torch.no_grad():
        out = model.generate(
            input_ids=ids, attention_mask=enc.attention_mask.to("cuda"),
            max_new_tokens=96, do_sample=False,
            temperature=None, top_p=None, top_k=None, pad_token_id=TOK.eos_token_id,
        )
    return TOK.decode(out[0][ids.shape[1]:], skip_special_tokens=True)

code_ok = tot = 0
t0 = time.time()
for r in rows:
    gold = json.loads(r["messages"][2]["content"])
    raw = gen(r["messages"][:2])
    try:
        m = re.search(r"\{.*\}", raw, re.S)
        pred = json.loads(m.group(0)) if m else {}
    except Exception:
        pred = {}
    tot += 1
    if (pred.get("code") or "").strip() == (gold.get("code") or "").strip():
        code_ok += 1
    if tot % 50 == 0:
        print(f"  {tot}/{len(rows)} running acc={code_ok/tot:.1%}", flush=True)

dt = time.time() - t0
out = {"model": "finetune-qwen3.6-35b-a3b-lora", "n": tot,
       "code_exact_match": round(code_ok / tot, 4), "code_ok": code_ok,
       "seconds": round(dt, 1), "per_item_s": round(dt / tot, 2)}
print("RESULT " + json.dumps(out), flush=True)
json.dump(out, open("bench_finetune.json", "w"))
