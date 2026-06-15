# claude-fable-5-prompt

A reference collection of the **Claude Fable 5 system prompt**, plus cleaned-up, generalized versions you can drop into any LLM-powered product or workflow.

## 📦 What's Inside

| File | Description |
| --- | --- |
| [`PROMPT_fable5.md`](PROMPT_fable5.md) | The **original** Claude Fable 5 system prompt, kept intact for reference. |
| [`PROMPT.md`](PROMPT.md) | A **generalized, vendor-neutral** rewrite (English) — adapted for use with any assistant or model. |
| [`PROMPT.zh.md`](PROMPT.zh.md) | The same generalized prompt, **translated into Chinese (简体中文)**. |

The original prompt is product-specific to Claude/Anthropic. The two generalized versions strip out the brand- and platform-specific details so you can reuse the underlying behavior, safety, and formatting guidance in your own chatbot or agent.

## 🚀 How to Use These Prompts

You can integrate this prompt library directly into your own workflow:

1. Pick the version that fits your use case — the original for study, or one of the generalized prompts (`PROMPT.md` / `PROMPT.zh.md`) as a starting template.
2. Use it as the **system prompt** for your assistant, or merge the relevant sections (refusal handling, output formatting, tone) into an existing prompt.
3. Tailor the product-information and policy sections to match your own platform.

Want to push these prompts further? Our detailed guide breaks down how to pair them with **Advanced Task Agents** to unlock maximum performance on complex, multi-step work — read it here: [Getting the most out of the Claude Fable 5 prompt](https://www.moely.ai/resources/claude-fable-5-prompt).

## 📄 License

Provided for research and reference. The original Fable 5 prompt is the property of Anthropic; the generalized adaptations are offered as-is for your own projects.
