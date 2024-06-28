import { ChatGPTAPI } from 'chatgpt';
export class Chat {
  private chatAPI: ChatGPTAPI;

  constructor(apikey: string) {
    this.chatAPI = new ChatGPTAPI({
      apiKey: apikey,
      apiBaseUrl:
        process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      completionParams: {
        model: process.env.MODEL || 'gpt-4o',
        temperature: +(process.env.temperature || 0) || 0,
        top_p: +(process.env.top_p || 0) || 1,
        max_tokens: process.env.max_tokens
          ? +process.env.max_tokens
          : undefined,
      },
    });
  };

  private addNumbersOfString(input: string, filename: string): string {
    const lines = input.split("\n");
    let result = "";

    let currentNumber = parseInt(lines[0].split(" ")[1].split(",")[0].slice(1), 10);
    if (currentNumber !== 0) {
      currentNumber -= 1;
    }

    let minusNumber = 0;

    let commentSyntax = "//";
    if (filename.endsWith(".py") || filename.endsWith("Dockerfile")) {
      commentSyntax = "#";
    }

    lines.forEach((line, idx) => {
      if (idx === 0) {
        result += line.split(" @@ ")[0] + " @@\n";
        return;
      }

      if (line.startsWith("-")) {
        minusNumber += 1;
        currentNumber += 1;
        result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})\n`;
      } else {
        if (line.startsWith("@")) {
          currentNumber = parseInt(line.split(" ")[1].split(",")[0].slice(1), 10) - 1;
          result += "...\n\n\n...\n";
          result += line.split(" @@ ")[0] + " @@\n";
          return;
        }
        currentNumber -= minusNumber;
        currentNumber += 1;
        minusNumber = 0;

        if (idx !== lines.length - 1) {
          result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})\n`;
        } else {
          result += `${line} ${commentSyntax} (Номер строки: ${currentNumber})`;
        }
      }
    });

    return result;
  }

  private splitPatchIntoChunks(patch: string, maxLength: number): string[] {
    const lines = patch.split('\n');
    let currentChunk = '';
    const chunks: string[] = [];

    for (const line of lines) {
      if (currentChunk.length + line.length > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = '...\n';
      }

      currentChunk += line + '\n';
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private generatePrompt = (filename: string, patch: string) => {
    patch = this.addNumbersOfString(patch, filename)
    // console.log('PATCH AFTER:-----------------------------------------------------------')
    // console.log(patch)

    return this.splitPatchIntoChunks(patch, 3000).map((chunk) => {
      const commentSyntax = filename.endsWith('.py') || filename.endsWith('Dockerfile') ? '#' : '//';
      const continuationWarning = chunk.startsWith('...') ? `
Note: This patch is a continuation of a previous chunk. \
There might be cases where functions or variables are used here but defined in the previous chunk. \
Please take this into account and avoid commenting on undefined variables or functions that might be defined in previous chunks.
` : '';

      if (filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.py')) {
        return `\
Review the provided code changes in the file "${filename}". \
Evaluate only the specified aspects.

Aspects:
- Errors and bugs in the code.
- Checking the correspondence of function and variable names to their content. Indicate if the names do not reflect the content.
- Analysis of function decomposition in complex algorithms. Ensure that each function is easily describable and does not contain code repetitions.
- Identification of methods that should be private but are not marked as such.
- Checking for type annotations in public methods. Suggest types if they are missing.
- Checking for documentation in important public methods. Suggest writing documentation if it is missing.
- Avoiding excessive decomposition. Ensure that there are no overly short and simple functions that are used only once.

Each line of the provided patch includes the line number at the end in the format "${commentSyntax} (Номер строки: N)". \
Please carefully track the line number when writing your comments to ensure accuracy. \
Each comment should reference the specific line number it is addressing.

The response should be a valid JSON object in plain text without any additional formatting like code blocks or backticks. \
The keys in the JSON should correspond to the line numbers, and the values should be the review comments with suggestions for corrections. \
If there are no issues, return an empty JSON object.
Provide your response in Russian.
${continuationWarning}
In each comment, you must include a suggestion on how to fix the issue. \
For example, if you mention that a function lacks documentation, write the documentation yourself and suggest it. \
The same applies to all other aspects.

Example response:
{
"3": "Переменная name не отражает содержимое функции.",
"7": "Отсутствует типизация аргументов функции.",
"12": "Функция слишком длинная, рекомендуется разбить её на несколько меньших."
}

Here are the code changes for analysis:
${chunk}

Your review:
`;
      }
      else {
        return `\
I will provide you with the filename and the code diff from a GitHub pull request. \
Your task is to analyze these changes and provide a brief review.

Filename: ${filename}

Response rules:
1. Only discuss obvious bugs and errors. Avoid speculative comments and hypotheses.
2. The response should be a valid JSON object in plain text without any additional formatting like code blocks or backticks.
3. If there are no issues, return an empty JSON object.
4. Respond in Russian.

Each line of the provided patch includes the line number at the end in the format "${commentSyntax} (Номер строки: N)". \
Please carefully track the line number when writing your comments to ensure accuracy. \
Each comment should reference the specific line number it is addressing.
The keys in the JSON should correspond to the line numbers, and the values should be the review comments with suggestions for corrections.
${continuationWarning}
In each comment, you must include a suggestion on how to fix the issue.

Example response:
{
"3": "Описание ошибки или проблемы.",
"7": "Описание другой ошибки или проблемы.",
"12": "Описание ещё одной ошибки или проблемы."
}

Here is the diff for analysis:
${chunk}
`;
      }
    });
  };

  public codeReview = async (filename: string, patch: string) => {
    if (!patch) {
      return '';
    }
    // console.log('PATCH BEFORE:-----------------------------------------------------------')
    // console.log(patch)

    console.time('code-review cost');
    const prompts = this.generatePrompt(filename, patch);
    console.log('PROMPTS:-----------------------------------------------------------')
    console.log(prompts)

    const responses = await Promise.all(prompts.map(prompt => this.chatAPI.sendMessage(prompt)));

    console.timeEnd('code-review cost');

    const combinedResponse: Record<string, string> = {};
    for (const response of responses) {
      try {
        const cleanedResponse = response.text.replace(/```json|```/g, '').trim();
        const jsonResponse = JSON.parse(cleanedResponse);
        Object.assign(combinedResponse, jsonResponse);
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
      }
    }

    console.log('RES ANSWER:------------------------------------------------------')
    console.log(JSON.stringify(combinedResponse, null, 2));

    return combinedResponse;
  };
}
