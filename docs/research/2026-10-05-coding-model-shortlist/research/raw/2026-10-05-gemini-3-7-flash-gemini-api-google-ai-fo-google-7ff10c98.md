---
url: https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash
retrieved: 2026-10-05
command: firecrawl scrape https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash --only-main-content --max-age 0 --format markdown,rawHtml --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Gemini 3.7 Flash  |  Gemini API  |  Google AI for Developers
---
[Skip to main content](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash#main-content)

[![Gemini API](https://ai.google.dev/_static/googledevai/images/gemini-api-logo.svg)](https://ai.google.dev/)

`/`

Language

- [English](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash)
- [Deutsch](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=de)
- [Español – América Latina](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=es-419)
- [Français](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=fr)
- [Indonesia](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=id)
- [Italiano](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=it)
- [Polski](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=pl)
- [Português – Brasil](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=pt-br)
- [Shqip](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=sq)
- [Tiếng Việt](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=vi)
- [Türkçe](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=tr)
- [Русский](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=ru)
- [עברית](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=he)
- [العربيّة](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=ar)
- [فارسی](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=fa)
- [हिंदी](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=hi)
- [বাংলা](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=bn)
- [ภาษาไทย](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=th)
- [中文 – 简体](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=zh-cn)
- [中文 – 繁體](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=zh-tw)
- [日本語](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=ja)
- [한국어](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash?hl=ko)

[Get API key](https://aistudio.google.com/apikey) [Cookbook](https://github.com/google-gemini/cookbook) [Community](https://discuss.ai.google.dev/c/gemini-api/)Sign in

- On this page
- [Documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash#documentation)
- [gemini-3.7-flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash#gemini-37-flash)

Gemini 3.8 Flash is now available. [Try it out](https://aistudio.google.com/prompts/new_chat?model=gemini-3.8-flash).


- [Home](https://ai.google.dev/)
- [Gemini API](https://ai.google.dev/gemini-api)
- [Docs](https://ai.google.dev/gemini-api/docs)



 Send feedback



# Gemini 3.7 Flash

- On this page
- [Documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash#documentation)
- [gemini-3.7-flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash#gemini-37-flash)

Gemini 3.7 Flash is the next iteration in the Gemini 3 series of highly-capable,
natively multimodal, reasoning models.

[Try in Google AI Studio](https://aistudio.google.com/prompts/new_chat?model=gemini-3.7-flash)

## Documentation

Visit the
[Latest model](https://ai.google.dev/gemini-api/docs/latest-model)
page for full coverage of features and capabilities.

## gemini-3.7-flash

| Property | Description |
| --- | --- |
| id\_cardModel code | `gemini-3.7-flash` |
| saveSupported data types | **Inputs**<br>Text, Image, Video, Audio, and PDF<br>**Output**<br>Text |
| token\_autoToken limits[\[\*\]](https://ai.google.dev/gemini-api/docs/tokens) | **Input token limit**<br>1,048,576<br>**Output token limit**<br>65,536 |
| handymanCapabilities | **[Audio generation](https://ai.google.dev/gemini-api/docs/speech-generation)**<br>Not supported<br>**[Caching](https://ai.google.dev/gemini-api/docs/caching)**<br>Supported<br>**[Code execution](https://ai.google.dev/gemini-api/docs/code-execution)**<br>Supported<br>**[Computer use](https://ai.google.dev/gemini-api/docs/computer-use)**<br>Supported (Preview)<br>**[File search](https://ai.google.dev/gemini-api/docs/file-search)**<br>Supported<br>**[Function calling](https://ai.google.dev/gemini-api/docs/function-calling)**<br>Supported<br>**[Grounding with Google Maps](https://ai.google.dev/gemini-api/docs/maps-grounding)**<br>Supported<br>**[Image generation](https://ai.google.dev/gemini-api/docs/image-generation)**<br>Not supported<br>**[Live API](https://ai.google.dev/gemini-api/docs/live-api)**<br>Not supported<br>**[Search grounding](https://ai.google.dev/gemini-api/docs/google-search)**<br>Supported<br>**[Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)**<br>Supported<br>**[Thinking](https://ai.google.dev/gemini-api/docs/thinking)**<br>Supported (low, medium, high)<br>Note: `minimal` is not supported and returns an error.<br>**[URL context](https://ai.google.dev/gemini-api/docs/url-context)**<br>Supported |
| speedConsumption options | **[Batch API](https://ai.google.dev/gemini-api/docs/batch-api)**<br>Supported<br>**[Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)**<br>Supported<br>**[Priority inference](https://ai.google.dev/gemini-api/docs/priority-inference)**<br>Supported |
| 123Versions | Read the [model version patterns](https://ai.google.dev/gemini-api/docs/models/gemini#model-versions) for more details.<br>- Stable: `gemini-3.7-flash` |
| calendar\_monthLatest update | August 2026 |
| id\_cardModel card | [Model card](https://deepmind.google/models/model-cards/gemini-3-7-flash/) |



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2026-08-13 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2026-08-13 UTC."\],\[\],\[\]\]
