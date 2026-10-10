---
url: https://huggingface.co/ibm-granite/granite-4.0-1b
retrieved: 2026-10-05
command: firecrawl scrape https://huggingface.co/ibm-granite/granite-4.0-1b --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: ibm-granite/granite-4.0-1b · Hugging Face
---
# Granite-4.0-1B

**Model Summary:**
Granite-4.0-1B is a lightweight instruct model finetuned from _Granite-4.0-1B-Base_ using a combination of open source instruction datasets with permissive license and internally collected synthetic datasets. This model is developed using a diverse set of techniques including supervised finetuning, reinforcement learning, and model merging.

- **Developers:** Granite Team, IBM
- **HF Collection:** [Granite 4.0 Nano Language Models HF Collection](https://huggingface.co/collections/ibm-granite/granite-40-nano-language-models-68e5775c80b60e43b72cfa16)
- **GitHub Repository:** [ibm-granite/granite-4.0-nano-language-models](https://github.com/ibm-granite/granite-4.0-nano-language-models)
- **Website**: [Granite Docs](https://www.ibm.com/granite/docs/)
- **Release Date**: October 28, 2025
- **License:** [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)

**Supported Languages:**
English, German, Spanish, French, Japanese, Portuguese, Arabic, Czech, Italian, Korean, Dutch, and Chinese. Users may fine-tune Granite 4.0 Nano models to support languages beyond those included in this list.

**Intended use:**
Granite 4.0 Nano instruct models feature strong instruction following capabilities bringing advanced AI capabilities within reach for on-device deployments and research use cases. Additionally, their compact size makes them well-suited for fine-tuning on specialized domains without requiring massive compute resources.

_Capabilities_

- Summarization
- Text classification
- Text extraction
- Question-answering
- Retrieval Augmented Generation (RAG)
- Code related tasks
- Function-calling tasks
- Multilingual dialog use cases
- Fill-In-the-Middle (FIM) code completions

**Generation:**
This is a simple example of how to use Granite-4.0-1B model.

Install the following libraries:

```shell
pip install torch torchvision torchaudio
pip install accelerate
pip install transformers
```

Then, copy the snippet from the section that is relevant for your use case.

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

device = "cuda"
model_path = "ibm-granite/granite-4.0-1b"
tokenizer = AutoTokenizer.from_pretrained(model_path)
# drop device_map if running on CPU
model = AutoModelForCausalLM.from_pretrained(model_path, device_map=device)
model.eval()
# change input text as desired
chat = [\
    { "role": "user", "content": "Please list one IBM Research laboratory located in the United States. You should only output its name and location." },\
]
chat = tokenizer.apply_chat_template(chat, tokenize=False, add_generation_prompt=True)
# tokenize the text
input_tokens = tokenizer(chat, return_tensors="pt").to(device)
# generate output tokens
output = model.generate(**input_tokens,
                        max_new_tokens=100)
# decode output tokens into text
output = tokenizer.batch_decode(output)
# print output
print(output[0])
```

Expected output:

```shell
<|start_of_role|>user<|end_of_role|>Please list one IBM Research laboratory located in the United States. You should only output its name and location.<|end_of_text|>
<|start_of_role|>assistant<|end_of_role|>Almaden Research Center, San Jose, California<|end_of_text|>
```

**Tool-calling:**
Granite-4.0-1B comes with enhanced tool calling capabilities, enabling seamless integration with external functions and APIs. To define a list of tools please follow OpenAI's function [definition schema](https://platform.openai.com/docs/guides/function-calling?api-mode=responses#defining-functions).

This is an example of how to use Granite-4.0-1B model tool-calling ability:

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

device = "cuda"
model_path = "ibm-granite/granite-4.0-1b"
tokenizer = AutoTokenizer.from_pretrained(model_path)
# drop device_map if running on CPU
model = AutoModelForCausalLM.from_pretrained(model_path, device_map=device)
model.eval()

tools = [\
    {\
        "type": "function",\
        "function": {\
            "name": "get_current_weather",\
            "description": "Get the current weather for a specified city.",\
            "parameters": {\
                "type": "object",\
                "properties": {\
                    "city": {\
                        "type": "string",\
                        "description": "Name of the city"\
                    }\
                },\
                "required": ["city"]\
            }\
        }\
    }\
]

# change input text as desired
chat = [\
    { "role": "user", "content": "What's the weather like in Boston right now?" },\
]
chat = tokenizer.apply_chat_template(chat, \
                                     tokenize=False, \
                                     tools=tools, \
                                     add_generation_prompt=True)
# tokenize the text
input_tokens = tokenizer(chat, return_tensors="pt").to(device)
# generate output tokens
output = model.generate(**input_tokens,
                        max_new_tokens=100)
# decode output tokens into text
output = tokenizer.batch_decode(output)
# print output
print(output[0])
```

Expected output:

```shell
<|start_of_role|>system<|end_of_role|>You are a helpful assistant with access to the following tools. You may call one or more tools to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_current_weather", "description": "Get the current weather for a specified city.", "parameters": {"type": "object", "properties": {"city": {"type": "string", "description": "Name of the city"}}, "required": ["city"]}}}
</tools>

For each tool call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call>. If a tool does not exist in the provided list of tools, notify the user that you do not have the ability to fulfill the request.<|end_of_text|>
<|start_of_role|>user<|end_of_role|>What's the weather like in Boston right now?<|end_of_text|>
<|start_of_role|>assistant<|end_of_role|><tool_call>
{"name": "get_current_weather", "arguments": {"city": "Boston"}}
</tool_call><|end_of_text|>
```

**Evaluation Results:**

| Benchmarks | Metric | 350M Dense | H 350M Dense | 1B Dense | H 1B Dense |
| --- | --- | --- | --- | --- | --- |
| General Tasks |
| MMLU | 5-shot | 35.01 | 36.21 | 59.39 | 59.74 |
| MMLU-Pro | 5-shot, CoT | 12.13 | 14.38 | 34.02 | 32.86 |
| BBH | 3-shot, CoT | 33.07 | 33.28 | 60.37 | 59.68 |
| AGI EVAL | 0-shot, CoT | 26.22 | 29.61 | 49.22 | 52.44 |
| GPQA | 0-shot, CoT | 24.11 | 26.12 | 29.91 | 29.69 |
| Alignment Tasks |
| IFEval | Instruct, Strict | 61.63 | 67.63 | 80.82 | 82.37 |
| IFEval | Prompt, Strict | 49.17 | 55.64 | 73.94 | 74.68 |
| IFEval | Average | 55.4 | 61.63 | 77.38 | 78.53 |
| Math Tasks |
| GSM8K | 8-shot | 30.71 | 39.27 | 76.35 | 69.83 |
| GSM Symbolic | 8-shot | 26.76 | 33.7 | 72.3 | 65.72 |
| Minerva Math | 0-shot, CoT | 13.04 | 5.76 | 45.28 | 49.4 |
| DeepMind Math | 0-shot, CoT | 8.45 | 6.2 | 34 | 34.98 |
| Code Tasks |
| HumanEval | pass@1 | 39 | 38 | 74 | 73 |
| HumanEval+ | pass@1 | 37 | 35 | 69 | 68 |
| MBPP | pass@1 | 48 | 49 | 65 | 69 |
| MBPP+ | pass@1 | 38 | 44 | 57 | 60 |
| CRUXEval-O | pass@1 | 23.75 | 25.5 | 33.13 | 36 |
| BigCodeBench | pass@1 | 11.14 | 11.23 | 30.18 | 29.12 |
| Tool Calling Tasks |
| BFCL v3 |  | 39.32 | 43.32 | 54.82 | 50.21 |
| Multilingual Tasks |
| MULTIPLE | pass@1 | 15.99 | 14.31 | 32.24 | 36.11 |
| MMMLU | 5-shot | 28.23 | 27.95 | 45 | 49.43 |
| INCLUDE | 5-shot | 27.74 | 27.09 | 42.12 | 43.35 |
| MGSM | 8-shot | 14.72 | 16.16 | 37.84 | 27.52 |
| Safety |
| SALAD-Bench |  | 97.12 | 96.55 | 93.44 | 96.4 |
| AttaQ |  | 82.53 | 81.76 | 85.26 | 82.85 |

| Benchmarks | \# Langs | Languages |
| --- | --- | --- |
| MMMLU | 11 | ar, de, en, es, fr, ja, ko, pt, zh, bn, hi |
| INCLUDE | 14 | hi, bn, ta, te, ar, de, es, fr, it, ja, ko, nl, pt, zh |
| MGSM | 5 | en, es, fr, ja, zh |

**Multilingual Benchmarks and thr included languages:**

**Model Architecture:**

Granite-4.0-1B baseline is based on a decoder-only dense transformer architecture. Core components of this architecture are: GQA, MLP with SwiGLU, RMSNorm, and shared input/output embeddings.

| Model | 350M Dense | H 350M Dense | 1B Dense | H 1B Dense |
| --- | --- | --- | --- | --- |
| Embedding size | 1024 | 768 | 2048 | 1536 |
| Number of layers | 28 attention | 4 attention / 28 Mamba2 | 40 attention | 4 attention / 36 Mamba2 |
| Attention head size | 64 | 64 | 128 | 128 |
| Number of attention heads | 16 | 12 | 16 | 12 |
| Number of KV heads | 4 | 4 | 4 | 4 |
| Mamba2 state size | - | 128 | - | 128 |
| Number of Mamba2 heads | - | 48 | - | 48 |
| MLP / Shared expert hidden size | 2048 | 2048 | 4096 | 4096 |
| Num. Experts | - | - | - | - |
| Num. active Experts | - | - | - | - |
| Expert hidden size | - | - | - | - |
| MLP activation | SwiGLU | SwiGLU | SwiGLU | SwiGLU |
| Sequence length | 32K | 32K | 128K | 128K |
| Position embedding | RoPE | NoPE | RoPE | NoPE |
| \# Parameters | 350M | 340M | 1.6B | 1.5B |
| \# Active parameters | 350M | 340M | 1.6B | 1.5B |

**Training Data:**
Overall, our SFT data is largely comprised of three key sources: (1) publicly available datasets with permissive license, (2) internal synthetic data targeting specific capabilities, and (3) a select set of human-curated data.

**Infrastructure:**
We trained the Granite 4.0 Nano Language Models utilizing an NVIDIA GB200 NVL72 cluster hosted in CoreWeave. Intra-rack communication occurs via the 72-GPU NVLink domain, and a non-blocking, full Fat-Tree NDR 400 Gb/s InfiniBand network provides inter-rack communication. This cluster provides a scalable and efficient infrastructure for training our models over thousands of GPUs.

**Ethical Considerations and Limitations:**
Granite 4.0 Nano Instruct Models are primarily finetuned using instruction-response pairs mostly in English, but also multilingual data covering multiple languages. Although this model can handle multilingual dialog use cases, its performance might not be similar to English tasks. In such case, introducing a small number of examples (few-shot) can help the model in generating more accurate outputs. While this model has been aligned by keeping safety in consideration, the model may in some cases produce inaccurate, biased, or unsafe responses to user prompts. So we urge the community to use this model with proper safety testing and tuning tailored for their specific tasks.

**Resources**

- ⭐️ Learn about the latest updates with Granite: [https://www.ibm.com/granite](https://www.ibm.com/granite)
- 📄 Get started with tutorials, best practices, and prompt engineering advice: [https://www.ibm.com/granite/docs/](https://www.ibm.com/granite/docs/)
- 💡 Learn about the latest Granite learning resources: [https://ibm.biz/granite-learning-resources](https://ibm.biz/granite-learning-resources)

Downloads last month12,074

Safetensors

Model size

2B params

Tensor type

BF16

·

Chat template

Files info

Inference Providers [NEW](https://huggingface.co/docs/inference-providers)

[Text Generation](https://huggingface.co/tasks/text-generation "Learn more about text-generation")

This model isn't deployed by any Inference Provider. [🙋Ask for provider support](https://huggingface.co/spaces/huggingface/InferenceSupport/discussions/new?title=ibm-granite/granite-4.0-1b&description=React%20to%20this%20comment%20with%20an%20emoji%20to%20vote%20for%20%5Bibm-granite%2Fgranite-4.0-1b%5D(%2Fibm-granite%2Fgranite-4.0-1b)%20to%20be%20supported%20by%20Inference%20Providers.%0A%0A(optional)%20Which%20providers%20are%20you%20interested%20in%3F%20(Novita%2C%20Hyperbolic%2C%20Together%E2%80%A6)%0A)

## Model tree for ibm-granite/granite-4.0-1b

Base model

[ibm-granite/granite-4.0-1b-base](https://huggingface.co/ibm-granite/granite-4.0-1b-base)

Finetuned

( [14](https://huggingface.co/models?other=base_model:finetune:ibm-granite/granite-4.0-1b-base))

this model

Adapters

[1 model](https://huggingface.co/models?other=base_model:adapter:ibm-granite/granite-4.0-1b)

Finetunes

[13 models](https://huggingface.co/models?other=base_model:finetune:ibm-granite/granite-4.0-1b)

Quantizations

[40 models](https://huggingface.co/models?other=base_model:quantized:ibm-granite/granite-4.0-1b)

## Spaces using ibm-granite/granite-4.0-1b5

## Collection including ibm-granite/granite-4.0-1b

[Ultra-compact language models designed for the edge and on-device deployment. •17 items•Updated 21 days ago• 103](https://huggingface.co/collections/ibm-granite/granite-40-nano-language-models)

## Article mentioning ibm-granite/granite-4.0-1b

[**Granite 4.0 Nano: Just how small can you go?**\\
\\
- ![](https://cdn-avatars.huggingface.co/v1/production/uploads/639bcaa2445b133a4e942436/CEW-OjXkRkDNmTxSu8Egh.png)\\
\\
ibm-granite\\
\\
•\\
\\
Oct 28, 2025\\
\\
• 128](https://huggingface.co/blog/ibm-granite/granite-4-nano)

Inference providers allow you to run inference using different serverless providers.
